import LoginForm from "@/components/LoginForm";

export const metadata = {
  title: "Sign in — Phil",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex h-full items-center justify-center px-4 py-10">
      <LoginForm initialError={searchParams.error} />
    </main>
  );
}
