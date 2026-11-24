"use client";

import { motion } from "framer-motion";
import { DataStrip, EASE_OUT, SceneSection, SectionHeader, SpecList, type SpecItem } from "./motion-primitives";

const FLEET_STATUS = [
  { id: "SW-01", status: "Navigating", task: "M-104 · Dock 02 → Rack C4", battery: 98, color: "#40C8E8" },
  { id: "SW-02", status: "Picking up", task: "M-105 · Staging A → Buffer", battery: 89, color: "#B7F34A" },
  { id: "SW-03", status: "Yielding", task: "Holding cell · clearing SW-01", battery: 94, color: "#F5B942" },
  { id: "SW-04", status: "Delivering", task: "M-107 · Buffer → Bay 05", battery: 76, color: "#40C8E8" },
] as const;

const CAPABILITIES: readonly SpecItem[] = [
  { index: "01", title: "Cooperative space-time A*", body: "Plans reserve (x, y, t) cells across a 48-tick window.", accent: "#40C8E8" },
  { index: "02", title: "Atomic custody", body: "One owner per package — never duplicated, never lost, even through failures.", accent: "#B7F34A" },
  { index: "03", title: "Deadlock recovery", body: "Wait-for cycles confirmed over 4 ticks trigger a deterministic, safe yield.", accent: "#40C8E8" },
  { index: "04", title: "Dynamic replanning", body: "Aisle closures invalidate affected routes instantly, without a reset.", accent: "#B7F34A" },
];

export function SwarmSolutionSection() {
  return (
    <SceneSection id="swarm-solution">
      <SectionHeader index="05" label="The SWARM solution" title={["One fleet.", "One intelligence."]} />

      {/* Fleet roster as a plain technical table: rows and rules, no cards. */}
      <table className="mb-4 w-full border-collapse font-mono text-[11px] tracking-[0.08em] uppercase">
        <caption className="sr-only">Fleet status</caption>
        <thead>
          <tr className="text-left text-[10px] tracking-[0.18em] text-[#6F7C83]">
            <th className="pb-2 font-normal">Unit</th>
            <th className="pb-2 font-normal">State</th>
            <th className="hidden pb-2 font-normal sm:table-cell">Task</th>
            <th className="pb-2 text-right font-normal">Batt</th>
          </tr>
        </thead>
        <tbody>
          {FLEET_STATUS.map((bot, i) => (
            <motion.tr
              key={bot.id}
              className="border-t border-white/[0.08]"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: EASE_OUT }}
            >
              <td className="py-2.5 font-semibold text-[#F2F4F3]">
                <span className="mr-2 inline-block size-1.5 rounded-full align-middle" style={{ backgroundColor: bot.color }} />
                {bot.id}
              </td>
              <td className="py-2.5" style={{ color: bot.color }}>
                {bot.status}
              </td>
              <td className="hidden py-2.5 text-[#9AA7AD] normal-case sm:table-cell">{bot.task}</td>
              <td className="py-2.5 text-right text-[#C9D2D6] tabular-nums">{bot.battery}%</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      <DataStrip
        className="mb-10"
        cells={[
          { label: "Commit resolver", value: "Zero conflicts", dot: "#B7F34A" },
          { label: "Fleet", value: "4 units online" },
        ]}
      />

      <SpecList items={CAPABILITIES} />
    </SceneSection>
  );
}
