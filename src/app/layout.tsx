import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MC Bot Manager",
  description:
    "Spin up Minecraft bots, watch them join servers, and control their consoles.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#070b14] text-slate-100 antialiased">
        <div className="app-bg" aria-hidden />
        {children}
      </body>
    </html>
  );
}
