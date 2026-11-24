"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";

const CONFLICT_STEPS = [
  {
    step: "01",
    phase: "CONVERGING TRAJECTORIES",
    detail: "SW-02 and SW-03 plan routes that overlap in a single-lane aisle at tick t=14.",
    tag: "CONFLICT DETECTED",
    tagColor: "#F5B942",
  },
  {
    step: "02",
    phase: "SPACETIME EVALUATION",
    detail: "Coordinator calculates mission urgency, cargo status, and distance to nearest holding position.",
    tag: "WAIT-FOR GRAPH ANALYSIS",
    tagColor: "#40C8E8",
  },
  {
    step: "03",
    phase: "DETERMINISTIC YIELD",
    detail: "SW-03 steps into safe holding cell off the route corridor, holding reservations until SW-02 clears.",
    tag: "RIGHT-OF-WAY ASSIGNED",
    tagColor: "#B7F34A",
  },
  {
    step: "04",
    phase: "SAFE TRAVERSAL",
    detail: "Both robots continue to destination without cell collisions, head-on deadlocks, or manual intervention.",
    tag: "ZERO INCIDENTS",
    tagColor: "#40C8E8",
  },
];

export function CoordinationProblemSection() {
  return (
    <section
      id="coordination-conflict"
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-white/[0.08] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-2 mb-3"
            >
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#89969C] uppercase">
                SCENE 04 {"//"} THE COORDINATION PROBLEM
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="font-display text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#F2F4F3] leading-[0.96]"
            >
              NARROW-AISLE <br />
              CONFLICT RESOLUTION.
            </motion.h2>
          </div>

          {/* Incident Severity Status */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#F5B942]/30 bg-[#121A1E] backdrop-blur-md self-start md:self-auto"
          >
            <AlertTriangle className="size-4 text-[#F5B942] animate-pulse" />
            <div className="font-mono text-xs text-[#89969C]">
              <span className="text-[#F2F4F3] font-bold">CONFLICT SCENARIO:</span> ONE-CELL PASSAGE
            </div>
          </motion.div>
        </div>

        {/* 4-Step Narrative Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {CONFLICT_STEPS.map((step, idx) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="relative rounded-2xl border border-white/10 bg-[#121A1E]/70 p-5 backdrop-blur-md shadow-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#89969C]">
                    PHASE {step.step}
                  </span>
                  <span
                    className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 font-semibold"
                    style={{ color: step.tagColor }}
                  >
                    {step.tag}
                  </span>
                </div>

                <h3 className="font-mono text-sm font-bold text-[#F2F4F3] mb-2">
                  {step.phase}
                </h3>

                <p className="text-xs text-[#89969C] leading-relaxed">
                  {step.detail}
                </p>
              </div>

              {idx < 3 && (
                <div className="hidden lg:flex items-center gap-1 text-[10px] font-mono text-[#89969C] pt-3 mt-3 border-t border-white/5">
                  <span>TRANSITION</span>
                  <ArrowRight className="size-3 text-[#40C8E8]" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Live Narrow-Aisle Conflict Telemetry Strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="rounded-2xl border border-white/10 bg-[#0D1215]/80 p-5 md:p-6 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-6"
        >
          {/* Robot A Telemetry */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="size-10 rounded-xl bg-[#40C8E8]/10 border border-[#40C8E8]/40 flex items-center justify-center font-mono font-bold text-[#40C8E8] text-xs">
              SW-02
            </div>
            <div className="font-mono text-xs">
              <div className="text-[#F2F4F3] font-bold">PRIORITY: HIGH (CARGO LOADED)</div>
              <div className="text-[#89969C]">HOLDING RIGHT-OF-WAY · AISLE PASSAGE COMMITTED</div>
            </div>
          </div>

          {/* Central Conflict Mediator */}
          <div className="hidden lg:flex items-center gap-3 font-mono text-xs text-[#89969C] px-4 py-2 rounded-xl bg-[#121A1E] border border-white/10">
            <ShieldAlert className="size-4 text-[#F5B942]" />
            <span>ARBITRATION: YIELD DETOUR APPLIED (SAFETY MARGIN: 1 CELL)</span>
          </div>

          {/* Robot B Telemetry */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="size-10 rounded-xl bg-[#F5B942]/10 border border-[#F5B942]/40 flex items-center justify-center font-mono font-bold text-[#F5B942] text-xs">
              SW-03
            </div>
            <div className="font-mono text-xs">
              <div className="text-[#F2F4F3] font-bold">STATE: YIELDING IN HOLDING CELL</div>
              <div className="text-[#89969C]">RESUMING PASSAGE IN +2 TICKS</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
