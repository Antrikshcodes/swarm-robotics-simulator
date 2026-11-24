import type { Metadata } from "next";
import { MissionBoard } from "@/components/missions/mission-board";

export const metadata: Metadata = { title: "Missions" };

export default function MissionsPage() {
  return <MissionBoard />;
}
