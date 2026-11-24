"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="label-caps">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-xs">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-foreground",
          mono && "tabular font-mono text-[11.5px]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function Dash() {
  return <span className="text-text-dim">—</span>;
}
