"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/PasswordInput";
import { changePassword, deleteOwnAccount, verifyPassword } from "@/lib/account";

// `hasPassword` is false for accounts that only ever signed in through Google —
// there's no current password to verify, so the change-password item is hidden.
type Profile = { name: string; email: string; hasPassword: boolean };

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
  // Which second-step form is open, or null for the plain menu. One value for
  // both, so the two flows can't be on screen at once.
  const [mode, setMode] = useState<"password" | "delete" | null>(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Stands in for the password when there isn't one — see `deleteAccount`.
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        // The `email` identity is the one that carries a password; a Google-only
        // account has just the `google` identity.
        hasPassword: (user.identities ?? []).some((i) => i.provider === "email"),
      });
    });
  }, []);

  // Closing the menu abandons a half-finished deletion or password change.
  useEffect(() => {
    if (menuOpen) return;
    setMode(null);
    setPassword("");
    setNewPassword("");
    setConfirmEmail("");
    setError(null);
    setNotice(null);
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

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !profile) return;

    setBusy(true);
    setError(null);

    const failure = await changePassword(profile.email, password, newPassword);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }

    // Stay in the menu and say so — a form that just vanishes leaves you
    // wondering whether the change actually took.
    setMode(null);
    setPassword("");
    setNewPassword("");
    setNotice("Password updated.");
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !profile) return;

    setBusy(true);
    setError(null);

    if (profile.hasPassword) {
      // Re-authenticate first — an unlocked session shouldn't be enough to
      // destroy the account.
      const failure = await verifyPassword(profile.email, password);
      if (failure) {
        setError(failure);
        setBusy(false);
        return;
      }
    } else if (
      // A Google-only account has no password to check against, so the
      // confirmation is deliberate friction rather than authentication: type
      // the address back. Case and stray whitespace shouldn't fail an
      // otherwise correct answer.
      confirmEmail.trim().toLowerCase() !== profile.email.toLowerCase()
    ) {
      setError("That doesn't match your email address.");
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

        {mode === "password" ? (
          <form onSubmit={submitPassword} className="px-3 py-2">
            <p className="text-xs text-slate-600">
              Enter your current password, then the new one.
            </p>
            <PasswordInput
              autoFocus
              required
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="Current password"
              wrapperClassName="mt-2"
              className="w-full rounded-lg border border-slate-300 bg-cream px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <PasswordInput
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={(ev) => setNewPassword(ev.target.value)}
              placeholder="New password"
              wrapperClassName="mt-2"
              className="w-full rounded-lg border border-slate-300 bg-cream px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="flex-1 rounded-lg border border-sand px-3 py-1.5 text-xs font-medium transition hover:bg-sand"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !password || !newPassword}
                className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-cream transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          </form>
        ) : mode === "delete" ? (
          <form onSubmit={deleteAccount} className="px-3 py-2">
            <p className="text-xs text-slate-600">
              Every conversation and message will be permanently deleted.{" "}
              {profile.hasPassword
                ? "Enter your password to confirm."
                : `Type ${profile.email} to confirm.`}
            </p>
            {profile.hasPassword ? (
              <PasswordInput
                autoFocus
                required
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder="Password"
                wrapperClassName="mt-2"
                className="w-full rounded-lg border border-slate-300 bg-cream px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            ) : (
              <input
                type="email"
                autoFocus
                required
                // Autofilling the address would defeat the point of typing it.
                autoComplete="off"
                value={confirmEmail}
                onChange={(ev) => setConfirmEmail(ev.target.value)}
                placeholder="Your email address"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-cream px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="flex-1 rounded-lg border border-sand px-3 py-1.5 text-xs font-medium transition hover:bg-sand"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !(profile.hasPassword ? password : confirmEmail)}
                className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-cream transition enabled:hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          </form>
        ) : (
          <>
            {notice && (
              <p className="px-3 pt-2 text-xs text-slate-600">{notice}</p>
            )}
            {profile.hasPassword && (
              <button
                type="button"
                role="menuitem"
                onClick={() => setMode("password")}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-sand"
              >
                Change password
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => setMode("delete")}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50"
            >
              Delete account
            </button>
          </>
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
