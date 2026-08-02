"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnAccount, verifyPassword } from "@/lib/account";

type Profile = { name: string; email: string };

/**
 * Shows who's signed in — avatar, name, email — and offers a way out.
 * `compact` is the collapsed-rail form: avatar only.
 *
 * Clicking the avatar opens a menu with destructive account actions.
 */
export default function UserMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Second step of deletion: the password prompt.
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user?.email) return;
      // Accounts created before the name field exists have no full_name, so
      // fall back to the local part of the email rather than showing nothing.
      const stored = (user.user_metadata?.full_name as string | undefined)?.trim();
      setProfile({
        name: stored || user.email.split("@")[0],
        email: user.email,
      });
    });
  }, []);

  // Closing the menu abandons a half-finished deletion.
  useEffect(() => {
    if (menuOpen) return;
    setConfirming(false);
    setPassword("");
    setError(null);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    //router.push("/login");
    //router.refresh();
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !profile) return;

    setBusy(true);
    setError(null);

    // Re-authenticate first — an unlocked session shouldn't be enough to
    // destroy the account.
    const failure = await verifyPassword(profile.email, password);
    if (failure) {
      setError(failure);
      setBusy(false);
      return;
    }

    try {
      await deleteOwnAccount();
      router.push("/login");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!profile) return null;

  const initial = profile.name.charAt(0).toUpperCase();

  const avatar = (
    <button
      type="button"
      onClick={() => setMenuOpen((open) => !open)}
      aria-label="Account menu"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      title={profile.name}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-cream transition hover:bg-slate-700"
    >
      {initial}
    </button>
  );

  const menu = menuOpen && (
    <>
      {/* Catches the click that dismisses the menu, without a global listener. */}
      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
      <div
        role="menu"
        className="absolute bottom-full left-0 z-40 mb-2 w-56 rounded-xl border border-sand bg-cream p-1 shadow-lg"
      >
        <div className="border-b border-sand px-3 py-2">
          <p className="truncate text-sm font-medium text-slate-900">{profile.name}</p>
          <p className="truncate text-xs text-slate-500">{profile.email}</p>
        </div>

        {confirming ? (
          <form onSubmit={deleteAccount} className="px-3 py-2">
            <p className="text-xs text-slate-600">
              Every conversation and message will be permanently deleted. Enter
              your password to confirm.
            </p>
            <input
              type="password"
              autoFocus
              required
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="Password"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-cream px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-sand px-3 py-1.5 text-xs font-medium transition hover:bg-sand"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !password}
                className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-cream transition enabled:hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          </form>
        ) : (
          <button
            type="button"
            role="menuitem"
            onClick={() => setConfirming(true)}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Delete account
          </button>
        )}
      </div>
    </>
  );

  if (compact) {
    return (
      <div className="relative">
        <div className="flex justify-center">{avatar}</div>
        {menu}
        {/* An invisible copy of the Sign out button. It reserves the exact same
            height, so the avatar sits at an identical position whether the
            sidebar is expanded or collapsed — no jump when toggling. */}
        <div
          aria-hidden="true"
          className="invisible mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
        >
          Sign out
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {avatar}
        {/* min-w-0 lets the truncation actually apply inside the flex row. */}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" title={profile.name}>
            {profile.name}
          </p>
          <p className="truncate text-xs text-slate-500" title={profile.email}>
            {profile.email}
          </p>
        </div>
      </div>

      {menu}

      <button
        type="button"
        onClick={signOut}
        className="mt-2 w-full rounded-lg border border-sand px-3 py-1.5 text-xs font-medium transition hover:bg-sand"
      >
        Sign out
      </button>
    </div>
  );
}
