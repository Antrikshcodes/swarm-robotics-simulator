import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Scrollable page body used by every route except the full-bleed studio. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className={cn("mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 py-5 lg:px-6", className)}>
        {children}
      </div>
    </div>
  );
}

/** Compact page intro: context line + data-source + actions. Not a hero. */
export function PageIntro({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        {children}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
