import LoginForm from "@/components/LoginForm";

export const metadata = {
  title: "Sign in — Phil",
  // A sign-in screen should never be the entry point from a search result —
  // which is exactly what happened while the middleware redirected every
  // signed-out request (Googlebot included) here. `follow` stays on so links
  // out of this page are still crawled.
  robots: { index: false, follow: true },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string; mode?: string };
}) {
  return (
    <main className="flex h-full flex-col items-center justify-center px-4 py-10">
      {/* Brand sits above the card, not inside it. */}
      <div className="mb-6 text-center">
        <h1 className="font-display text-[4rem] font-semibold leading-none tracking-tight text-slate-900">
          Phil
        </h1>
        <p className="mt-2 text-lg text-slate-600">Ready to spread the peace?</p>
      </div>

      <LoginForm
        initialError={searchParams.error}
        initialNotice={searchParams.notice}
        initialMode={searchParams.mode === "signup" ? "signup" : "signin"}
      />
    </main>
  );
}
