"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { SimEvent } from "@/types/simulation";
import { formatTick } from "@/lib/format";
import { SEVERITY, TONE_DOT } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Vertical event log, newest first. */
export function EventFeed({
  events,
  limit = 12,
  className,
  emptyText = "No events yet. Start playback to generate events.",
}: {
  events: readonly SimEvent[];
  limit?: number;
  className?: string;
  emptyText?: string;
}) {
  const items = events.slice(-limit).reverse();
  if (items.length === 0) {
    return <p className={cn("px-4 py-8 text-center text-xs text-text-secondary", className)}>{emptyText}</p>;
  }
  return (
    <ol className={cn("flex flex-col", className)}>
      <AnimatePresence initial={false}>
        {items.map((event) => (
          <motion.li
            key={event.seq}
            layout="position"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-[64px_8px_1fr] items-baseline gap-x-2.5 border-b border-line/60 px-4 py-2 last:border-b-0"
          >
            <span className="tabular font-mono text-[11px] text-text-dim">{formatTick(event.tick)}</span>
            <span className={cn("size-1.5 translate-y-[-1px] rounded-full", TONE_DOT[SEVERITY[event.severity].tone])} />
            <span className="text-xs leading-snug text-foreground/90">{event.message}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
