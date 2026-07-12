"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat } from "@/lib/api";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // A stable session id per browser tab keeps a single conversation on the backend.
  useEffect(() => {
    sessionId.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Replace the last (assistant) message via an updater — used for live streaming.
  function updateLast(fn: (m: Message) => Message) {
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    try {
      for await (const ev of streamChat(sessionId.current, question)) {
        if (ev.type === "token") {
          updateLast((m) => ({ ...m, content: m.content + ev.text }));
        } else if (ev.type === "sources") {
          updateLast((m) => ({ ...m, sources: ev.sources }));
        } else if (ev.type === "error") {
          updateLast((m) => ({ ...m, content: `${m.content}\n\n⚠️ ${ev.message}` }));
        }
      }
    } catch (e) {
      updateLast((m) => ({
        ...m,
        content: `${m.content}\n\n⚠️ ${(e as Error).message}`,
      }));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">Phil</h1>
        <p className="text-sm text-slate-500">
          Hi! I'm Phil, your dedicated CISV Program Planner. Ask me any questions about planning a camp.
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-400">
            Ask a question to get started.
          </p>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const streaming = busy && i === messages.length - 1 && !isUser;
          return (
            <div
              key={i}
              className={isUser ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed " +
                  (isUser
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200")
                }
              >
                {isUser ? (
                  // The user's own question is plain text — render it verbatim.
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  // The model answers in Markdown; render it (prose styles the output).
                  <div
                    className={
                      "prose prose-sm prose-slate max-w-none prose-pre:bg-slate-800 " +
                      (streaming ? "blink-cursor" : "")
                    }
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}

                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Sources
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {m.sources.map((s) => (
                        <li key={s} className="text-xs text-slate-500">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white px-6 py-4">
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Ask a question…  (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={busy}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
