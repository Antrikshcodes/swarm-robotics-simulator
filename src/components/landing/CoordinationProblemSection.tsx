"use client";

import { motion } from "framer-motion";
import { DataStrip, EASE_OUT, SceneSection, SectionHeader } from "./motion-primitives";

const CONFLICT_STEPS = [
  {
    step: "01",
    phase: "Converging trajectories",
    detail: "SW-02 and SW-03 plan routes that meet in a single-lane aisle.",
    tag: "Conflict detected",
    color: "#F5B942",
  },
  {
    step: "02",
    phase: "Space-time evaluation",
    detail: "The coordinator weighs mission urgency, cargo and the nearest holding cell.",
    tag: "Wait-for graph",
    color: "#40C8E8",
  },
  {
    step: "03",
    phase: "Deterministic yield",
    detail: "SW-03 steps into a holding cell off the corridor until SW-02 clears.",
    tag: "Right-of-way",
    color: "#B7F34A",
  },
  {
    step: "04",
    phase: "Safe traversal",
    detail: "Both robots reach their destinations — no collision, no swap, no operator.",
    tag: "Resolved",
    color: "#40C8E8",
  },
] as const;

export function CoordinationProblemSection() {
  return (
    <SceneSection id="coordination-conflict">
      <SectionHeader index="04" label="The coordination problem" title={["Narrow-aisle", "conflict resolution."]} />

      {/* Minimal timeline: a rail that draws down with each phase. */}
      <ol className="relative mb-10 ml-1.5 border-l border-white/[0.1]">
        <motion.span
          aria-hidden
          className="absolute -left-px top-0 h-full w-px origin-top bg-gradient-to-b from-[#F5B942] via-[#40C8E8] to-[#B7F34A]"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 1.6, ease: EASE_OUT }}
        />
        {CONFLICT_STEPS.map((s, i) => (
          <motion.li
            key={s.step}
            className="relative pb-6 pl-7 last:pb-0"
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, delay: 0.2 + i * 0.25, ease: EASE_OUT }}
          >
            <span aria-hidden className="absolute top-1.5 -left-[4.5px] size-2 rounded-full ring-4 ring-[#080B0D]" style={{ backgroundColor: s.color }} />
            <div className="flex flex-wrap items-baseline gap-x-3 font-mono text-[10.5px] tracking-[0.16em] uppercase">
              <span className="text-[#7E8C93]">Phase {s.step}</span>
              <span style={{ color: s.color }}>{s.tag}</span>
            </div>
            <h3 className="mt-1 font-mono text-[12.5px] font-semibold tracking-[0.06em] text-[#F2F4F3] uppercase">{s.phase}</h3>
            <p className="mt-1 max-w-[46ch] text-[13.5px] leading-relaxed text-[#9AA7AD]">{s.detail}</p>
          </motion.li>
        ))}
      </ol>

      <div className="space-y-2">
        <DataStrip
          cells={[
            { label: "SW-02", value: "Priority high · cargo", dot: "#40C8E8" },
            { value: "Right-of-way", tone: "#40C8E8" },
          ]}
        />
        <DataStrip
          cells={[
            { label: "SW-03", value: "Yielding · holding cell", dot: "#F5B942" },
            { value: "Resumes +2 ticks", tone: "#B7F34A" },
          ]}
        />
      </div>
    </SceneSection>
  );
}
