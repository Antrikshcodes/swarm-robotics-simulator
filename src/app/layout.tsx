import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

// Self-hosted at build time (no render-blocking request to Google at runtime).
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "SWARM — Warehouse Robot Coordination Arena",
    template: "%s · SWARM",
  },
  description:
    "One warehouse. Multiple robots. Zero collisions. Autonomous warehouse fleet coordination and simulation platform.",
};

export const viewport: Viewport = {
  themeColor: "#090d10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark h-full antialiased ${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="h-full overflow-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
