import LoginForm from "@/components/LoginForm";

export const metadata = {
  title: "Sign in — Phil",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
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
      />
    </main>
  );
}
