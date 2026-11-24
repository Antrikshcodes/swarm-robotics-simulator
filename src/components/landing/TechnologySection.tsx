"use client";

import { motion } from "framer-motion";
import {
  Binary,
  Layers,
  Network,
  GitBranch,
  RotateCcw,
  PackageCheck,
  Activity,
  LineChart,
} from "lucide-react";

const TECH_STACK = [
  {
    title: "A* PATHFINDING",
    code: "ALG // 01",
    description: "Exact spatial search with cached precomputed distance maps for optimal heuristics.",
    icon: Binary,
  },
  {
    title: "SPACE-TIME RESERVATIONS",
    code: "COORD // 02",
    description: "Time-indexed 4D reservation grid guaranteeing zero cell or directed edge overlaps.",
    icon: Layers,
  },
  {
    title: "MULTI-AGENT COORDINATION",
    code: "ORCH // 03",
    description: "Prioritized planning and preemption with right-of-way yields based on mission urgency.",
    icon: Network,
  },
  {
    title: "DEADLOCK RECOVERY",
    code: "RESOLV // 04",
    description: "Wait-for dependency graph with Tarjan SCC cycle detection and deterministic holding maneuvers.",
    icon: GitBranch,
  },
  {
    title: "DYNAMIC REPLANNING",
    code: "ADAPT // 05",
    description: "Runtime aisle closure detection with instant route invalidation and localized detour planning.",
    icon: RotateCcw,
  },
  {
    title: "PACKAGE CUSTODY MANAGEMENT",
    code: "CUSTODY // 06",
    description: "Strict single-owner state machine preventing duplicate or unowned cargo during failures.",
    icon: PackageCheck,
  },
  {
    title: "REAL-TIME SIMULATION",
    code: "CORE // 07",
    description: "Deterministic command-driven tick engine with replayable event streams and zero nondeterminism.",
    icon: Activity,
  },
  {
    title: "OPERATIONAL ANALYTICS",
    code: "METRICS // 08",
    description: "Real-time delivery throughput, movement density heatmaps, and fleet efficiency analytics.",
    icon: LineChart,
  },
];

export function TechnologySection() {
  return (
    <section
      id="technology"
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-[#141414]/9 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto w-full">
        {/* Section Heading */}
        <div className="mb-14 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-2 mb-3"
          >
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#141414]/60 uppercase">
              SECTION 04 // ENGINEERING SPECIFICATION
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#141414] leading-[0.98] mb-4"
          >
            ENGINEERED TO <br />
            MOVE TOGETHER.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-base sm:text-lg text-[#141414]/70 leading-relaxed"
          >
            Built upon verified deterministic algorithms and safety invariants.
            No heuristics that fail under stress. Complete predictability at scale.
          </motion.p>
        </div>

        {/* Technical Grid Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TECH_STACK.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.06 }}
                className="group relative rounded-xl border border-[#141414]/10 bg-[#EEECE7]/60 p-5 backdrop-blur-sm transition-all duration-300 hover:border-[#141414]/30 hover:bg-[#EEECE7] hover:shadow-sm"
              >
                {/* Tech Code */}
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] tracking-wider text-[#141414]/40 font-semibold group-hover:text-[#40C8E8] transition-colors">
                    {item.code}
                  </span>
                  <Icon className="size-4 text-[#141414]/50 group-hover:text-[#141414] transition-colors" />
                </div>

                {/* Title */}
                <h3 className="font-mono text-sm font-bold tracking-tight text-[#141414] mb-2 leading-snug">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-xs text-[#141414]/65 leading-relaxed">
                  {item.description}
                </p>

                {/* Accent line on hover */}
                <div className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#40C8E8] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
