import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Thin table primitives with the SWARM data-dense styling. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className={cn("w-full text-left text-xs", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("label-caps h-9 px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("h-11 px-3 whitespace-nowrap first:pl-4 last:pr-4", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line/50 last:border-b-0", className)} {...props} />;
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-line bg-white/[0.015]", className)} {...props} />;
}
