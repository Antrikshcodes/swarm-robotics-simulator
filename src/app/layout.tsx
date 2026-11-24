import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

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
      className="dark h-full antialiased"
    >
      <body className="h-full overflow-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
