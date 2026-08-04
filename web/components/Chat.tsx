"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { generateTitle, streamChat } from "@/lib/api";
import type { User } from "@supabase/supabase-js";
import { 
  createConversation,
  loadMessages,
  saveMessage,
  setConversationTitle,
} from "@/lib/conversations";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

// Replace with the real Google Form link. Opens in a new tab so an in-progress
// conversation isn't torn down by navigating away.
const FEEDBACK_URL = "https://forms.gle/oNg9WMjXxcaMKsFb8";

export default function Chat({
  user,
  conversationId,
  conversationTitle,
  onRename,
  onConversationSaved,
}: {
  user: User | null | undefined;
  conversationId: string | null;
  conversationTitle: string | null;
  onRename: (id: string, title: string) => void;
  onConversationSaved: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Null unless the title is being edited; holds the in-progress text.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  // Mirrors the prop so send() can fill it in when it lazily creates a row.
  const activeId = useRef<string | null>(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load whichever conversation the sidebar selected. The `cancelled` guard
  // means switching threads quickly can't let a slow load overwrite a newer one.
  useEffect(() => {
    let cancelled = false;
    activeId.current = conversationId;
    setDraftTitle(null);

    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const loaded = await loadMessages(conversationId);
        if (!cancelled) setMessages(loaded);
      } catch {
        // Unreadable history shouldn't block asking a new question.
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

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

    // The turns already on screen are the context the backend needs.
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setInput("");
    setBusy(true);
    // Covers sending via the Send button, which leaves focus on the button —
    // pressing Enter never moves focus out of the textarea in the first place.
    inputRef.current?.focus();
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    let answer = "";
    let sources: string[] = [];

    try {
      for await (const ev of streamChat(question, history)) {
        if (ev.type === "token") {
          answer += ev.text;
          updateLast((m) => ({ ...m, content: m.content + ev.text }));
        } else if (ev.type === "sources") {
          sources = ev.sources;
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

    // Persist only a real answer — a failed turn shouldn't poison the history
    // that every future question is conditioned on.
    if (!answer) return;
    try {
      // Only a brand-new thread needs naming, so the title call costs one
      // request per conversation rather than one per turn.
      const isNewConversation = !activeId.current;
      const id = activeId.current ?? (await createConversation());
      activeId.current = id;
      await saveMessage(id, "user", question);
      await saveMessage(id, "assistant", answer, sources);

      if (isNewConversation) {
        const title = await generateTitle(question, answer);
        // The backend already falls back to the trimmed question; this covers
        // the case where the request itself never got there.
        await setConversationTitle(id, title ?? question.slice(0, 60));
      }

      onConversationSaved(id);
    } catch {
      // The answer is already on screen; losing the write shouldn't interrupt.
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function commitTitle() {
    const next = draftTitle?.trim();
    setDraftTitle(null);
    if (!conversationId || !next || next === conversationTitle) return;
    onRename(conversationId, next);
  }

  // One definition, rendered in one of two places — centred on an empty thread,
  // pinned to the bottom edge once there's a transcript above it.
  const composer = (
    // The border and focus ring live on the wrapper now, so the textarea and the
    // button read as one control. `items-end` keeps the button pinned to the
    // bottom as the textarea grows.
    <div className="flex items-end gap-2 rounded-2xl border border-sand bg-sand p-2 transition focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400">
      <textarea
        ref={inputRef}
        className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-base placeholder:text-slate-500 focus:outline-none"
        placeholder="Ask a question…  (Enter to send, Shift+Enter for newline)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
      />
      <button
        onClick={send}
        disabled={busy || !input.trim()}
        // The icon carries no text, so the control needs a name of its own.
        aria-label="Send"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-cream transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "…" : <ArrowUpIcon />}
      </button>
    </div>
  );

  // `loading` is excluded deliberately: selecting an existing thread empties
  // `messages` while its history loads, and without this the composer would
  // jump to the middle and back for a frame.
  const isEmpty = !loading && messages.length === 0;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b-2 border-sand px-6 py-3">
        {/* min-w-0 lets the title truncate instead of pushing the button off the edge. */}
        <div className="min-w-0 flex-1">
          {draftTitle !== null ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === "Escape") {
                  setDraftTitle(null);
                }
              }}
              aria-label="Conversation name"
              className="w-full max-w-md rounded-lg border border-slate-300 bg-cream px-2 py-1 text-sm font-medium focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          ) : conversationId ? (
            <button
              type="button"
              onClick={() => setDraftTitle(conversationTitle ?? "")}
              title="Click to rename"
              className="max-w-full truncate rounded-lg px-2 py-1 text-sm font-medium text-slate-900 transition hover:bg-sand"
            >
              {conversationTitle ?? "Untitled conversation"}
            </button>
          ) : (
            // Nothing to rename until the first answer creates the row.
            <span className="px-2 py-1 text-sm font-medium text-slate-400">
              New conversation
            </span>
          )}
        </div>

        <a
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-cream transition hover:bg-slate-700"
        >
          Feedback
        </a>
      </header>

      {/* Doubles as the transcript and, when empty, as the top half of the
          centring — hence the bare `flex-1` in that case. */}
      <div
        className={
          isEmpty
            ? "flex-1"
            : // Roomier than a bubble list — without a card, spacing is what separates
              // turns. `pt-10` keeps the first message clear of the fade at the top edge.
              "no-scrollbar fade-top flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-10"
        }
      >
        {loading && (
          <p className="mt-10 text-center text-sm text-slate-400">
            Loading your conversation…
          </p>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const streaming = busy && i === messages.length - 1 && !isUser;
          return (
            // The user's turn sits in a tinted bubble; the answer is bare text
            // on the page, so nothing competes with it for attention.
            <div key={i} className={isUser ? "flex justify-end" : undefined}>
              {isUser ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-sand px-4 py-3 text-base leading-relaxed text-black">
                  {m.content}
                </div>
              ) : (
                <div className="text-black">
                  {/* The model answers in Markdown; prose styles the output. */}
                  <div
                    className={
                      "prose prose-base prose-black max-w-none prose-pre:bg-slate-800 " +
                      (streaming ? "blink-cursor" : "")
                    }
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>

                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-3 border-t border-sand pt-2">
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
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* This wrapper is the same element in both layouts, so React keeps the
          textarea's DOM node — and its focus — when the thread stops being empty. */}
      <div className={isEmpty ? "px-6" : "border-t-2 border-sand px-6 py-4"}>
        {isEmpty && (
          <p className="mb-6 text-center text-xl">
            Ask me anything about CISV!
          </p>
        )}
        {composer}
      </div>

      {/* Balances the transcript area's flex-1 so the composer lands mid-page.
          Weighted heavier so the block reads as centred rather than slightly low. */}
      {isEmpty && <div className="flex-[1.2]" />}
    </div>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
