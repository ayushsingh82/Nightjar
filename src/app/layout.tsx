import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/midnight";
import { BRAND } from "@/lib/brand";

// One webfont, and it is a monospace. Labels, hashes, amounts, column heads and
// every piece of UI chrome are set in it; running prose and display headings
// fall back to the system grotesque, which is the right face for printed matter
// and costs nothing to load.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.summary,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
