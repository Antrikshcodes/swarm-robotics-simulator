"use client";

import { SceneSection, SectionHeader, SpecList, type SpecItem } from "./motion-primitives";

const ROBOT_FEATURES: readonly SpecItem[] = [
  {
    index: "01",
    title: "360° LiDAR turret",
    body: "Continuous point-cloud awareness and obstacle classification in tight warehouse corridors.",
    accent: "#40C8E8",
    tag: "Sensing",
  },
  {
    index: "02",
    title: "Telemetry display",
    body: "The front display signals intent, battery health and priority to nearby operators and robots.",
    accent: "#B7F34A",
    tag: "Intent",
  },
  {
    index: "03",
    title: "Differential drive",
    body: "Encoder-controlled wheels for instant yield halts and zero-radius pivots.",
    accent: "#40C8E8",
    tag: "Motion",
  },
  {
    index: "04",
    title: "Secure cargo bed",
    body: "Single-owner package custody with an audit trail across every mission phase.",
    accent: "#B7F34A",
    tag: "Custody",
  },
];

export function RobotRevealSection() {
  return (
    <SceneSection id="robot-reveal">
      <SectionHeader index="02" label="The autonomous machine" title={["Hardware designed", "for autonomy."]}>
        A purpose-built autonomous mobile robot with redundant safety sensors, deterministic motor control and
        expressive visual communication.
      </SectionHeader>
      <SpecList items={ROBOT_FEATURES} />
    </SceneSection>
  );
}
