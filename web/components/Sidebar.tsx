"use client";

import UserMenu from "@/components/UserMenu";
import type { ConversationSummary } from "@/lib/conversations";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

export default function Sidebar({
  user,
  conversations,
  selectedId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  user: User | null | undefined;
  conversations: ConversationSummary[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full w-64 flex-col border-r border-sand bg-cream">
      <div className="flex items-start justify-between px-4 pb-3 pt-5">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-slate-900">
            Phil
          </h1>
          <p className="mt-1.5 text-xs text-slate-500">Your dedicated CISV Advisor</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide conversations"
          className="-mr-1 rounded-lg p-1.5 text-slate-500 transition hover:bg-sand"
        >
          <CollapseIcon />
        </button>
      </div>
      
      {user ? (
        <>
          <div className="px-3 pb-3">
            <button
            type="button"
            onClick={onNew}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-cream transition hover:bg-slate-700"
            >
              + New conversation
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {loading && (
              <p className="px-2 py-3 text-xs text-slate-400">Loading…</p>
            )}

            {!loading && conversations.length === 0 && (
              <p className="px-2 py-3 text-xs text-slate-400">
                No conversations yet. Ask a question to start one.
              </p>
            )}

            {conversations.map((c) => {
              const selected = c.id === selectedId;
              // A thread whose first answer hasn't saved yet has no title.
              const label = c.title ?? "New conversation";
              return (
                <div
                  key={c.id}
                  className={
                    "group flex items-center gap-1 rounded-lg pr-1 " +
                    (selected ? "bg-sand" : "hover:bg-sand/60")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    title={label}
                    className={
                      "flex-1 truncate px-2 py-2 text-left text-sm " +
                      (selected ? "font-medium text-slate-900" : "text-slate-600")
                    }
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${label}`}
                    onClick={() => onDelete(c.id)}
                    className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-sand hover:text-slate-700 focus:opacity-100 group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </nav>
        </>
      ) : (
        <div className="flex-1"/>
      )}

      <div className="border-t border-sand p-3">
        {user === undefined ? null : user ? (
          <UserMenu />
        ) : (
          <Link
            href="/login"
            className="block w-full rounded-lg border border-sand px-3 py-2 text-center text-xs font-medium transition hover:bg-sand"
          >
            Log in to save your conversation
          </Link>
        )}
      </div>
    </div>
  );
}

function CollapseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}
