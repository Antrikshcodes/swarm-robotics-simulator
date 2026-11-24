import type { Metadata } from "next";
import { SimulationStudio } from "@/components/simulation/simulation-studio";

export const metadata: Metadata = { title: "Simulation Studio" };

export default function SimulationPage() {
  return <SimulationStudio />;
}
