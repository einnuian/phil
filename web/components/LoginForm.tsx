"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginForm({
  initialError,
  initialNotice,
  initialMode = "signin",
  onClose,
}: {
  initialError?: string;
  initialNotice?: string;
  initialMode?: Mode;
  /**
   * Present when the form is shown in a modal rather than on /login. Dismissing
   * and succeeding both mean "close" there — the user is already where they
   * wanted to be, so navigating them home would be a step backwards.
   */
  onClose?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);

  // `busy` covers the Supabase call; `navigating` covers the client navigation that
  // follows it. router.push() returns before the destination has rendered, so without
  // this the button would drop back to "Sign in" while we're still on this page.
  const [navigating, startNavigation] = useTransition();
  const pending = busy || navigating;

  // Leaves for `/` and re-fetches the server components with the new auth cookie.
  // In the modal there's nowhere to go, so just close — `useSession` picks the
  // new session up on its own, and the refresh re-runs middleware with the cookie.
  function goHome() {
    if (onClose) {
      onClose();
      router.refresh();
      return;
    }
    startNavigation(() => {
      router.push("/");
      router.refresh();
    });
  }

  async function withSupabase(fn: (supabase: ReturnType<typeof createClient>) => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn(createClient());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Hands off to Google. This navigates the whole page away, so there's no
   * success path to handle here — the browser comes back to /auth/callback with
   * a code, which exchanges it for a session and redirects to `/`.
   *
   * Signing up and signing in are the same call: Google creates the account on
   * first use, which is why this sits outside the signin/signup toggle.
   */
  function onGoogle() {
    if (pending) return;

    withSupabase(async (supabase) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
    });
  }

  function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;

    withSupabase(async (supabase) => {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/confirm`,
            // Stored on the auth user as user_metadata; read back by UserMenu.
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;

        // With email confirmation on, Supabase returns a user but no session.
        if (data.session) {
          goHome();
        } else {
          setNotice(`Check ${email} for a confirmation link to finish signing up.`);
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      goHome();
    });
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-sand p-8 shadow-sm ring-1 ring-sand">

      <button
        onClick={() => goHome()}
        type="button"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
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
          {onClose ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <>
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </>
          )}
        </svg>
        Chat without signing in
      </button>

      <button
        type="button"
        onClick={onGoogle}
        disabled={pending}
        className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-cream px-4 py-2.5 text-sm font-medium text-slate-700 transition enabled:hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-300" />
        <span className="text-xs text-slate-500">or</span>
        <span className="h-px flex-1 bg-slate-300" />
      </div>

      <form onSubmit={onEmailSubmit} className="space-y-3">
        {mode === "signup" && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-cream px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="Your name"
            />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-cream px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-cream px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="At least 6 characters"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-cream transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg bg-cream px-3 py-2 text-sm text-slate-700">
          {notice}
        </p>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setName("");
            setError(null);
            setNotice(null);
          }}
          className="font-medium text-slate-900 underline hover:no-underline"
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

/** Google's mark, in its required four colours — not `currentColor`. */
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
