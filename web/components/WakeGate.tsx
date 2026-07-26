"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, checkHealth } from "@/lib/api";

type Status = "checking" | "waking" | "online";

// Retry backoff: 1s, 2s, 4s, 8s, then every 10s. A cold backend (e.g. a free-tier
// host that sleeps) can take the better part of a minute to answer, so we keep
// probing indefinitely rather than giving up.
function backoffMs(attempt: number) {
  return Math.min(1000 * 2 ** (attempt - 1), 10000);
}

/**
 * Blocks the app until the backend answers `/api/health`. The repeated probes
 * double as the wake-up call for a sleeping server.
 */
export default function WakeGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [attempts, setAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function probe(attempt: number) {
      const ok = await checkHealth();
      if (cancelled) return;

      if (ok) {
        setStatus("online");
        return;
      }

      setStatus("waking");
      setAttempts(attempt);
      timer = setTimeout(() => probe(attempt + 1), backoffMs(attempt));
    }

    probe(1);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nonce]);

  // Elapsed-time counter, running only while we're still waiting.
  useEffect(() => {
    if (status === "online") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const retryNow = useCallback(() => {
    setStatus("checking");
    setAttempts(0);
    setElapsed(0);
    setNonce((n) => n + 1);
  }, []);

  if (status === "online") return <>{children}</>;

  const slow = elapsed >= 10;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <Spinner />

        <h1 className="mt-5 text-lg font-semibold">
          {status === "checking" ? "Connecting…" : "Waking the server"}
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          {status === "checking"
            ? "Checking that the backend is reachable."
            : slow
              ? "The server is asleep and starting up. This can take up to a minute — it'll load automatically."
              : "No answer yet. Retrying…"}
        </p>

        {status === "waking" && (
          <p className="mt-4 text-xs text-slate-400">
            Attempt {attempts} · {elapsed}s elapsed
          </p>
        )}

        <button
          type="button"
          onClick={retryNow}
          disabled={status === "checking"}
          className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Retry now
        </button>

        <p className="mt-4 break-all text-xs text-slate-400">{API_URL}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="mx-auto h-8 w-8 animate-spin text-blue-600"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
