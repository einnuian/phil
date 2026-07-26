import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-confirmation landing point. Supabase redirects here with a `code`,
 * which we exchange for a session cookie before sending the user on.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Supabase reports provider-side failures as ?error_description=…
  const description =
    searchParams.get("error_description") ?? "Sign-in was not completed.";
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(description)}`,
  );
}
