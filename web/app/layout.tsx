import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  description: "Phil is here to help with your CISV questions, whether you're planning a camp, recruiting staff, or in need of activity ideas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body className="h-full bg-cream text-slate-900 antialiased">
        {/* The only text a crawler can rely on finding. `WakeGate` replaces the
            entire UI with a loading card until the backend answers, and the chat
            itself is client-rendered — so without this there is nothing on `/`
            describing what the site is, which is how `/login` came to be the
            indexed page. It sits outside `WakeGate` deliberately: anything
            inside is unmounted the moment the app comes online, so a crawler
            that executes JS would watch it disappear.

            Visually hidden rather than displayed because the interface conveys
            all of this in its own way. The wording describes what the page
            genuinely is — keep it that way if you edit it. */}
        <div className="sr-only">
          <h1>Phil - CISV Advisor</h1>
          <p>
            Phil is here to help with your CISV questions, 
            whether you're planning a camp, recruiting staff, 
            or in need of activity ideas.
          </p>
        </div>

        {/* Health-checks the backend on every app load; holds the UI until it answers. */}
        <WakeGate>{children}</WakeGate>
        {/* Visitor counts, including signed-out users*/}
        <Analytics />
      </body>
    </html>
  );
}
