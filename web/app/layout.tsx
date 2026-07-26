import type { Metadata } from "next";
import WakeGate from "@/components/WakeGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "CISV Advisor",
  description: "Ask questions answered from CISV reference documents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-full bg-slate-100 text-slate-900 antialiased">
        {/* Health-checks the backend on every app load; holds the UI until it answers. */}
        <WakeGate>{children}</WakeGate>
      </body>
    </html>
  );
}
