import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-link landing point (sign-up confirmation, password recovery).
 *
 * Uses `verifyOtp` with the token hash from the email rather than a PKCE code
 * exchange: email links are routinely opened in a different browser than the
 * one that started the flow, where no PKCE code verifier cookie exists.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabase = createClient();

  // Preferred path: the template links here with a token hash.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Default `{{ .ConfirmationURL }}` template: Supabase verified the email on
  // its own endpoint and bounced here with a code. Signing the user straight in
  // only works if this is the browser that signed up, so fall through quietly
  // when it isn't.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // No recognisable parameters. With the default template the email has already
  // been confirmed by the time we get here — and if it hasn't, the sign-in
  // attempt will say so. Never tell the user to sign up again: that sends them
  // to create a duplicate account for one that already exists.
  return NextResponse.redirect(
    `${origin}/login?notice=${encodeURIComponent("Your email is confirmed — sign in to continue.")}`,
  );
}
