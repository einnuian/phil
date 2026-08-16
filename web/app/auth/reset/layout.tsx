/**
 * Exists only to carry metadata. `page.tsx` here is a client component, and
 * Next won't read a `metadata` export from one — a colocated layout is the
 * supported way to attach it.
 */
export const metadata = {
  title: "Choose a new password — Phil",
  // Nothing here is useful from a search result, and the URL is only ever
  // reached through a one-time emailed link.
  robots: { index: false, follow: false },
};

export default function ResetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
