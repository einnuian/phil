import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import WakeGate from "@/components/WakeGate";
import "./globals.css";

// Wordmark only — exposed as a CSS variable so Tailwind's `font-display`
// picks it up. The interface stays on the default sans for readability.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Phil - CISV Advisor",
  description: "Ask questions answered from CISV reference documents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body className="h-full bg-cream text-slate-900 antialiased">
        {/* Health-checks the backend on every app load; holds the UI until it answers. */}
        <WakeGate>{children}</WakeGate>
      </body>
    </html>
  );
}
