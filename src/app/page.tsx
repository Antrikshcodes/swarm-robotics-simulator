import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "SWARM — Warehouse Robot Coordination Arena",
  description:
    "One warehouse. Multiple robots. Zero collisions. Autonomous warehouse fleet coordination and simulation platform.",
};

export default function HomePage() {
  return <LandingPage />;
}
