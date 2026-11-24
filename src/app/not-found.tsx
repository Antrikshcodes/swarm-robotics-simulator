import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border border-line-strong text-text-secondary">
        <Compass className="size-5" />
      </span>
      <div>
        <p className="font-mono text-xs tracking-widest text-text-dim">404 · NO ROUTE</p>
        <h2 className="mt-1 text-base font-semibold">This page is not on the warehouse map</h2>
        <p className="mt-1 text-sm text-text-secondary">Use the sidebar, or return to the overview.</p>
      </div>
      <Button asChild size="sm">
        <Link href="/">Back to Overview</Link>
      </Button>
    </div>
  );
}
