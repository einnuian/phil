"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { createClient } from "@/lib/supabase/client";

/**
 * Where a password-reset email lands, via /auth/callback which exchanges the
 * code for a session first. Arriving here means the recovery session already
 * exists — so there's no current password to ask for, just a new one to set.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  // undefined until we've looked; false means the link was already used or expired.
  const [valid, setValid] = useState<boolean | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setValid(Boolean(data.user)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // Already signed in on the recovery session, so there's nowhere to go but in.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex h-full flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="font-display text-[4rem] font-semibold leading-none tracking-tight text-slate-900">
          Phil
        </h1>
        <p className="mt-2 text-lg text-slate-600">Choose a new password</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-sand p-8 shadow-sm ring-1 ring-sand">
        {valid === undefined ? (
          <p className="text-sm text-slate-500">Checking your link…</p>
        ) : valid ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                New password
              </span>
              <PasswordInput
                autoFocus
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                wrapperClassName="mt-1"
                className="w-full rounded-xl border border-slate-300 bg-cream px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                placeholder="At least 6 characters"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !password}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-cream transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "…" : "Set password"}
            </button>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              This reset link has expired or has already been used.
            </p>
            <Link
              href="/login"
              className="block w-full rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-cream transition hover:bg-slate-700"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
