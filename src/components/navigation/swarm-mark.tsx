import { cn } from "@/lib/utils";

/**
 * SWARM mark: a 3×3 fleet grid where one unit is active and a route
 * connects two others — the product in one glyph.
 */
export function SwarmMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="5" className="fill-[#0d1418] stroke-line-strong" />
      {[5, 10.5, 16].flatMap((y) =>
        [5, 10.5, 16].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.8" className="fill-text-dim" />
        )),
      )}
      <path d="M6.5 6.5 H12 V17.5 H17.5" fill="none" className="stroke-cyan" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <rect x="15.5" y="15.5" width="4" height="4" rx="1" className="fill-lime" />
    </svg>
  );
}
