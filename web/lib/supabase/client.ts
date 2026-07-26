import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components. The session is persisted in
 * cookies so the server (route handlers, Server Components) can read it too.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see web/.env.local.example",
    );
  }

  return createBrowserClient(url, anonKey);
}
