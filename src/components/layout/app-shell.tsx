"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CommandToast } from "@/components/layout/command-toast";
import { MotionProvider } from "@/components/layout/motion-provider";
import { PlaybackDriver } from "@/components/layout/playback-driver";
import { TopBar } from "@/components/layout/top-bar";
import { Sidebar } from "@/components/navigation/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  if (isLanding) {
    return (
      <MotionProvider>
        <TooltipProvider>
          <div
            id="landing-scroll-root"
            className="h-dvh w-full overflow-y-auto overflow-x-hidden bg-[#EFECE6] text-[#141414] selection:bg-[#40C8E8]/30 scroll-smooth"
          >
            {children}
          </div>
          <CommandToast />
        </TooltipProvider>
      </MotionProvider>
    );
  }

  return (
    <MotionProvider>
      <TooltipProvider>
        <PlaybackDriver />
        <div className="flex h-dvh w-full overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main id="main" className="relative min-h-0 flex-1 overflow-hidden">
              {children}
            </main>
          </div>
        </div>
        <CommandToast />
      </TooltipProvider>
    </MotionProvider>
  );
}
