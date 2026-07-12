import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}
