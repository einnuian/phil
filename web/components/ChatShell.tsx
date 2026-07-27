"use client";

import { useCallback, useEffect, useState } from "react";
import Chat from "@/components/Chat";
import Sidebar from "@/components/Sidebar";
import SidebarRail from "@/components/SidebarRail";
import {
  deleteConversation,
  listConversations,
  renameConversation,
  type ConversationSummary,
} from "@/lib/conversations";

const SIDEBAR_KEY = "phil:sidebar";

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

/**
 * Owns the conversation list and which one is selected, so the sidebar can
 * drive what the chat shows. `Chat` is controlled from here.
 */
export default function ChatShell() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // One flag for both breakpoints: an inline column on md+, an overlay drawer
  // below it. Starts closed so the drawer can't flash over the chat on a phone
  // before the effect below decides.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listConversations();
        if (cancelled) return;
        setConversations(list);
        setSelectedId(list[0]?.id ?? null);
      } catch {
        // An unreadable list shouldn't block starting a new conversation.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Re-query after a save. This is what surfaces a brand-new thread with its
   * generated title, and re-sorts an existing one once the `updated_at`
   * trigger has fired.
   */
  const refresh = useCallback(async (id: string) => {
    setSelectedId(id);
    try {
      setConversations(await listConversations());
    } catch {
      // The messages are already on screen; a stale list can wait.
    }
  }, []);

  // Desktop remembers your choice; mobile always starts closed, since a drawer
  // covering the chat on load is never what you want.
  useEffect(() => {
    if (!isDesktop()) return;
    setSidebarOpen(window.localStorage.getItem(SIDEBAR_KEY) !== "closed");
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open;
      if (isDesktop()) {
        try {
          window.localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed");
        } catch {
          // Private mode / storage disabled — the toggle still works this session.
        }
      }
      return next;
    });
  }

  // Picking a conversation should dismiss the drawer, but not collapse a
  // sidebar the user deliberately left open on desktop.
  function closeIfDrawer() {
    if (!isDesktop()) setSidebarOpen(false);
  }

  function select(id: string) {
    setSelectedId(id);
    closeIfDrawer();
  }

  function startNew() {
    // No row yet — Chat creates one lazily on the first question, so an
    // abandoned "new conversation" never leaves an empty row behind.
    setSelectedId(null);
    closeIfDrawer();
  }

  async function remove(id: string) {
    const target = conversations.find((c) => c.id === id);
    const label = target?.title ?? "this conversation";
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;

    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);

    try {
      await deleteConversation(id);
    } catch {
      // Put it back rather than showing a thread that still exists as gone.
      try {
        setConversations(await listConversations());
      } catch {
        /* leave the optimistic list in place */
      }
    }
  }

  async function rename(id: string, title: string) {
    const previous = conversations;
    setConversations((list) =>
      list.map((c) => (c.id === id ? { ...c, title } : c)),
    );
    try {
      await renameConversation(id, title);
    } catch {
      setConversations(previous); // Don't show a name the database rejected.
    }
  }

  const selectedTitle =
    conversations.find((c) => c.id === selectedId)?.title ?? null;

  const sidebar = (
    <Sidebar
      conversations={conversations}
      selectedId={selectedId}
      loading={loading}
      onSelect={select}
      onNew={startNew}
      onDelete={remove}
      onClose={() => setSidebarOpen(false)}
    />
  );

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <>
          {/* Backdrop is drawer-only; on md+ the sidebar is part of the layout. */}
          <div
            className="fixed inset-0 z-20 bg-slate-900/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-30 md:static md:z-auto">
            {sidebar}
          </div>
        </>
      )}

      {/* Collapsed: a rail keeps the toggle and the avatar reachable. */}
      {!sidebarOpen && <SidebarRail onOpen={toggleSidebar} />}

      <div className="min-w-0 flex-1">
        <Chat
          conversationId={selectedId}
          conversationTitle={selectedTitle}
          onRename={rename}
          onConversationSaved={refresh}
        />
      </div>
    </div>
  );
}
