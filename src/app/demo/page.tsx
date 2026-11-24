import type { Metadata } from "next";
import { DemoMode } from "@/components/demo/demo-mode";

export const metadata: Metadata = { title: "Demo Mode" };

export default function DemoPage() {
  return <DemoMode />;
}
