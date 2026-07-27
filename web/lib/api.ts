import { createClient } from "@/lib/supabase/client";

export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[] }
  | { type: "done" }
  | { type: "error"; message: string };

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Probe the backend's health endpoint. Returns false (never throws) on a
 * refused connection, a timeout, or a non-2xx reply, so callers can treat any
 * failure as "not reachable yet" and retry.
 */
export async function checkHealth(timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type HistoryTurn = { role: "user" | "assistant"; content: string };

/**
 * Headers for the endpoints that cost money. The backend verifies this token
 * with Supabase, so an unsigned or expired session can't spend the quota.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Ask the backend to name a conversation from its opening exchange. Passing
 * the answer matters: "how long is it?" is ambiguous alone, and the answer is
 * what identifies the subject.
 *
 * Returns null on any failure — the caller falls back to the question itself,
 * since a missing title is worse than an imperfect one.
 */
export async function generateTitle(
  question: string,
  answer: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/title`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ question, answer }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * POST a question to the backend and yield Server-Sent Events as they arrive.
 * The backend streams `data: {json}\n\n` frames; we buffer the response body and
 * parse one frame at a time so tokens surface live.
 *
 * The backend is stateless — prior turns travel with the question, so reloads
 * and backend restarts don't lose the thread.
 */
export async function* streamChat(
  question: string,
  history: HistoryTurn[],
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ question, history }),
    signal,
  });

  if (res.status === 401) {
    throw new Error("Your session has expired — sign in again.");
  }

  if (!res.ok || !res.body) {
    throw new Error(`Backend returned ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      const json = dataLine.slice(5).trim();
      if (json) yield JSON.parse(json) as ChatEvent;
    }
  }
}
