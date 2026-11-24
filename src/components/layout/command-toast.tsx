"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useSimulationStore, type CommandFeedback } from "@/store/simulation-store";
import { cn } from "@/lib/utils";

const VISIBLE_MS = 3500;

/** Shows the outcome of the latest engine command — success or the exact error. */
export function CommandToast() {
  const feedback = useSimulationStore((s) => s.feedback);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [expired, setExpired] = useState<number | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setExpired(feedback.seq), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const visible: CommandFeedback | null =
    feedback && feedback.seq !== dismissed && feedback.seq !== expired ? feedback : null;

  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed right-4 bottom-4 z-50 flex justify-end">
      <AnimatePresence>
        {visible ? (
          <motion.div
            key={visible.seq}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
            className={cn(
              "pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-md border bg-popover px-3 py-2.5 text-xs shadow-lg shadow-black/40",
              visible.ok ? "border-line-strong" : "border-danger/50",
            )}
          >
            {visible.ok ? (
              <CircleCheck className="mt-px size-4 shrink-0 text-lime" aria-hidden />
            ) : (
              <CircleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden />
            )}
            <span className="leading-snug text-foreground">
              {visible.ok ? null : <span className="mr-1 font-medium text-danger">Rejected:</span>}
              {visible.message}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed(visible.seq)}
              className="-mt-0.5 -mr-1 rounded p-0.5 text-text-dim outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
