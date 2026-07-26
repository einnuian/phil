import { createClient } from "@/lib/supabase/client";

export type Role = "user" | "assistant";

export type StoredMessage = {
  id: string;
  role: Role;
  content: string;
  sources: string[];
};

/**
 * Conversation persistence. Every query runs as the signed-in user, so RLS
 * (see supabase/schema.sql) is what scopes rows — there is no user_id filter
 * to forget here.
 */

/** The user's most recent conversation, or null if they have none yet. */
export async function latestConversationId(): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
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

/** Name a conversation after its opening question, so a sidebar can list it. */
export async function setTitleFromFirstQuestion(
  conversationId: string,
  question: string,
): Promise<void> {
  const supabase = createClient();
  const title = question.length > 60 ? `${question.slice(0, 57)}…` : question;
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId)
    .is("title", null);
  if (error) throw error;
}
