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
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-white/[0.08] overflow-hidden"
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
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#89969C] uppercase">
              SCENE 06 {"//"} ENGINEERING SPECIFICATION
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#F2F4F3] leading-[0.96] mb-4"
          >
            ENGINEERED TO <br />
            MOVE TOGETHER.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-base sm:text-lg text-[#89969C] leading-relaxed"
          >
            Built upon verified deterministic algorithms and mathematical safety invariants.
            No heuristics that collapse under dense traffic. Complete predictability at scale.
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
                className="group relative rounded-2xl border border-white/10 bg-[#121A1E]/70 p-6 backdrop-blur-md transition-all duration-300 hover:border-[#40C8E8]/40 hover:bg-[#121A1E] hover:shadow-xl"
              >
                {/* Tech Code */}
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] tracking-wider text-[#89969C] font-semibold group-hover:text-[#40C8E8] transition-colors">
                    {item.code}
                  </span>
                  <Icon className="size-4 text-[#89969C] group-hover:text-[#F2F4F3] transition-colors" />
                </div>

                {/* Title */}
                <h3 className="font-mono text-sm font-bold tracking-tight text-[#F2F4F3] mb-2 leading-snug">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-xs text-[#89969C] leading-relaxed">
                  {item.description}
                </p>

                {/* Accent line on hover */}
                <div className="absolute bottom-0 left-6 right-6 h-[2px] bg-[#40C8E8] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
