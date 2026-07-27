"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginForm({
  initialError,
  initialNotice,
}: {
  initialError?: string;
  initialNotice?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
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
  function goHome() {
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
