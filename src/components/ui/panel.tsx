import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bordered operational surface. The basic building block for every page. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-surface/60 shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset]", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-h-11 items-center gap-3 border-b border-line px-4 py-2.5", className)}>
      {icon ? <span className="text-text-secondary [&_svg]:size-4">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[13px] font-medium text-foreground">{title}</h2>
        {description ? <p className="truncate text-xs text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}
