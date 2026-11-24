"use client";

import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
}

/** Single-select segmented filter. Real filtering only — never decorative. */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-8 items-center gap-0.5 rounded-md border border-line bg-surface-sunken/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-[4px] px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value ? "bg-white/[0.08] text-foreground" : "text-text-secondary hover:text-foreground",
          )}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className="tabular font-mono text-[10.5px] text-text-dim">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
