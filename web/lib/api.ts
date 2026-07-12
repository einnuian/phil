export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[] }
  | { type: "done" }
  | { type: "error"; message: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * POST a question to the backend and yield Server-Sent Events as they arrive.
 * The backend streams `data: {json}\n\n` frames; we buffer the response body and
 * parse one frame at a time so tokens surface live.
 */
export async function* streamChat(
  sessionId: string,
  question: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, question }),
    signal,
  });

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
