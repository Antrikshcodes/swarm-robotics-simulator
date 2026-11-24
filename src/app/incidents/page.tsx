import type { Metadata } from "next";
import { IncidentConsole } from "@/components/incidents/incident-console";

export const metadata: Metadata = { title: "Incidents" };

export default function IncidentsPage() {
  return <IncidentConsole />;
}
