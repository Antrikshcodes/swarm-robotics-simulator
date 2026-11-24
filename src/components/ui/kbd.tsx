import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-current/20 px-1 font-mono text-[10px] leading-none opacity-80",
        className,
      )}
      {...props}
    />
  );
}
