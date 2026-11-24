import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_DOT, TONE_SOFT, type Tone } from "@/lib/status";

export function StatusDot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-1.5 shrink-0", className)} aria-hidden>
      {pulse ? (
        <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", TONE_DOT[tone])} />
      ) : null}
      <span className={cn("relative inline-flex size-1.5 rounded-full", TONE_DOT[tone])} />
    </span>
  );
}

export function StatusBadge({
  tone,
  children,
  pulse,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_SOFT[tone],
        className,
      )}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}
