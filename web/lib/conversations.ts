import { createClient } from "@/lib/supabase/client";

export type Role = "user" | "assistant";

export type StoredMessage = {
  id: string;
  role: Role;
  content: string;
  sources: string[];
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

/**
 * Conversation persistence. Every query runs as the signed-in user, so RLS
 * (see supabase/schema.sql) is what scopes rows — there is no user_id filter
 * to forget here.
 */

/** The user's conversations, newest first — matches the sidebar's index. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updated_at,
  }));
}

/** Delete a conversation. Its messages go with it via `on delete cascade`. */
export async function deleteConversation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function createConversation(title?: string): Promise<string> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: title ?? null })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function loadMessages(
  conversationId: string,
): Promise<StoredMessage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, sources")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as Role,
    content: m.content,
    sources: m.sources ?? [],
  }));
}

export async function saveMessage(
  conversationId: string,
  role: Role,
  content: string,
  sources: string[] = [],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content, sources });
  if (error) throw error;
}

/** Rename a conversation. Unlike the initial naming, this overwrites. */
export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId);
  if (error) throw error;
}

/**
 * Name a conversation, so the sidebar can list it. The `is("title", null)`
 * guard means the generated title never overwrites one the user chose.
 */
export async function setConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId)
    .is("title", null);
  if (error) throw error;
}
