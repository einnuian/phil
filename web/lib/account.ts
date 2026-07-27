import { createClient } from "@/lib/supabase/client";

/**
 * Re-authenticate before a destructive action. Signing in again is the check —
 * it validates the password against the current session's account without
 * needing any extra endpoint.
 *
 * Returns null when the password is correct, or the failure message otherwise
 * (a wrong password and a rate-limited retry read differently, and the user
 * should see which one they hit).
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

/**
 * Permanently delete the signed-in user's account.
 *
 * Calls the `delete_own_account` function in supabase/schema.sql, which is
 * scoped to `auth.uid()` — there's no id parameter, so this can't be pointed at
 * anyone else. Conversations and messages go with it via `on delete cascade`.
 */
export async function deleteOwnAccount(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw error;
  // The session now refers to a user that no longer exists — drop it locally so
  // the app doesn't sit on a token it can't use.
  await supabase.auth.signOut();
}
