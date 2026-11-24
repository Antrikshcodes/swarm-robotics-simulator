import type { Metadata } from "next";
import { FleetRoster } from "@/components/fleet/fleet-roster";

export const metadata: Metadata = { title: "Fleet" };

export default function FleetPage() {
  return <FleetRoster />;
}
