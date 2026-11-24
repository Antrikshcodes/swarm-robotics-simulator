"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/** Icon-only button that always carries an accessible label and tooltip. */
export function IconButton({
  label,
  shortcut,
  active,
  children,
  className,
  side = "bottom",
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  label: string;
  shortcut?: string;
  active?: boolean;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          data-active={active ? "" : undefined}
          className={cn(
            "text-text-secondary hover:text-foreground data-[active]:bg-lime/10 data-[active]:text-lime",
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}
