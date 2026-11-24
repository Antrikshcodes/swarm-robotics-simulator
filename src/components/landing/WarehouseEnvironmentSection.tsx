"use client";

import { motion } from "framer-motion";
import { Layers, Activity, GitFork, ShieldCheck } from "lucide-react";

const WAREHOUSE_METRICS = [
  {
    label: "SPACETIME HORIZON",
    value: "48 TICKS",
    desc: "Windowed cooperative 4D search over shared cell-time reservation space.",
    icon: Layers,
    color: "#40C8E8",
  },
  {
    label: "DECISION LATENCY",
    value: "< 2.5ms",
    desc: "Exact distance map heuristic with incremental replanning upon blockage.",
    icon: Activity,
    color: "#B7F34A",
  },
  {
    label: "TOPOLOGICAL CLOSURES",
    value: "DYNAMIC",
    desc: "Instant localized route invalidation without resetting warehouse simulation.",
    icon: GitFork,
    color: "#40C8E8",
  },
  {
    label: "SAFETY INVARIANTS",
    value: "100% PROVEN",
    desc: "Zero cell overlaps, zero head-on swaps across 5,000+ deterministic ticks.",
    icon: ShieldCheck,
    color: "#B7F34A",
  },
];

export function WarehouseEnvironmentSection() {
  return (
    <section
      id="warehouse-scale"
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-white/[0.08] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-2 mb-3"
            >
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#89969C] uppercase">
                SCENE 03 {"//"} THE WAREHOUSE SCALE
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="font-display text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#F2F4F3] leading-[0.96] mb-4"
            >
              ONE ARENA. <br />
              THOUSANDS OF MOVES.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-base sm:text-lg text-[#89969C] leading-relaxed"
            >
              When independent autonomous robots share high-density corridors, uncoordinated
              navigation creates cascading gridlocks. SWARM organizes every move through synchronized space-time reservations.
            </motion.p>
          </div>

          {/* Demonstration Scale Pill */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="self-start lg:self-auto p-4 rounded-xl border border-white/10 bg-[#121A1E]/80 backdrop-blur-md flex items-center gap-4"
          >
            <div className="size-3 rounded-full bg-[#40C8E8] shadow-[0_0_10px_#40C8E8] animate-ping" />
            <div className="font-mono text-xs text-[#89969C]">
              <div className="text-[#F2F4F3] font-bold">COOPERATIVE ARENA ACTIVE</div>
              <div>SPACE-TIME RESERVATION GRID V2.4</div>
            </div>
          </motion.div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {WAREHOUSE_METRICS.map((metric, idx) => {
            const Icon = metric.icon;

            return (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                className="group relative rounded-2xl border border-white/10 bg-[#121A1E]/70 p-6 backdrop-blur-md shadow-xl transition-all duration-300 hover:border-[#40C8E8]/40 hover:bg-[#121A1E]"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] tracking-wider text-[#89969C]">
                    {metric.label}
                  </span>
                  <Icon className="size-4 text-[#89969C] group-hover:text-[#F2F4F3] transition-colors" />
                </div>

                <div
                  className="font-display text-2xl sm:text-3xl font-black mb-2 tracking-tight"
                  style={{ color: metric.color }}
                >
                  {metric.value}
                </div>

                <p className="text-xs text-[#89969C] leading-relaxed">
                  {metric.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
