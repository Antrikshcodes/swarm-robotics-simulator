import { cn } from "@/lib/utils";

/** Robot identity: palette swatch + mono ID. Colour matches the canvas marker. */
export function RobotChip({ id, colorIndex, className }: { id: string; colorIndex: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs font-medium text-foreground", className)}>
      <span
        aria-hidden
        className="size-2.5 rounded-[3px] ring-1 ring-black/40 ring-inset"
        style={{ backgroundColor: `var(--robot-${colorIndex})` }}
      />
      {id}
    </span>
  );
}
