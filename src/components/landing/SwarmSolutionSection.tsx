"use client";

import { motion } from "framer-motion";
import { Battery, Cpu, CheckCircle2, RefreshCw, GitMerge, ShieldCheck } from "lucide-react";

const FLEET_STATUS = [
  {
    id: "SW-01",
    model: "AMR-LEAD-X",
    role: "Aisle Transit",
    status: "NAVIGATING",
    task: "Mission M-104 (Dock 02 → Rack C4)",
    battery: 98,
    coords: "X: 24.2 / Y: 18.0",
    color: "#40C8E8",
  },
  {
    id: "SW-02",
    model: "AMR-CARRIER",
    role: "Heavy Payload",
    status: "PICKING UP",
    task: "Mission M-105 (Staging A → Buffer)",
    battery: 89,
    coords: "X: 12.5 / Y: 08.4",
    color: "#B7F34A",
  },
  {
    id: "SW-03",
    model: "AMR-RAPID",
    role: "Cross-Docking",
    status: "YIELDING",
    task: "Holding cell yield (clearing SW-01)",
    battery: 94,
    coords: "X: 19.0 / Y: 14.2",
    color: "#F5B942",
  },
  {
    id: "SW-04",
    model: "AMR-CARRIER",
    role: "Outbound Sort",
    status: "DELIVERING",
    task: "Mission M-107 (Buffer → Bay 05)",
    battery: 76,
    coords: "X: 31.8 / Y: 22.1",
    color: "#40C8E8",
  },
];

const CAPABILITIES = [
  {
    title: "COOPERATIVE 4D A*",
    desc: "Windowed space-time search reserving space-time coordinates (x, y, t) across 48 ticks.",
    icon: Cpu,
  },
  {
    title: "ATOMIC CUSTODY",
    desc: "Single-owner state machine; packages never duplicate or become unowned during failure.",
    icon: CheckCircle2,
  },
  {
    title: "DEADLOCK RECOVERY",
    desc: "Tarjan SCC cycle analysis confirms persistence for 4 ticks, triggering deterministic safe yield.",
    icon: GitMerge,
  },
  {
    title: "DYNAMIC REPLANNING",
    desc: "Real-time aisle closures trigger instantaneous route invalidation without world reset.",
    icon: RefreshCw,
  },
];

export function SwarmSolutionSection() {
  return (
    <section
      id="swarm-solution"
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
                SCENE 05 {"//"} THE SWARM SOLUTION
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="font-display text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#F2F4F3] leading-[0.96]"
            >
              ONE FLEET. <br />
              ONE INTELLIGENCE.
            </motion.h2>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-[#121A1E] backdrop-blur-md self-start md:self-auto"
          >
            <ShieldCheck className="size-4 text-[#B7F34A]" />
            <div className="font-mono text-xs text-[#89969C]">
              <span className="text-[#F2F4F3] font-bold">COMMIT RESOLVER:</span> ZERO CONFLICT COMMIT CHECK
            </div>
          </motion.div>
        </div>

        {/* Fleet Roster Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {FLEET_STATUS.map((bot, index) => (
            <motion.div
              key={bot.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative rounded-2xl border border-white/10 bg-[#121A1E]/70 p-6 backdrop-blur-md shadow-xl transition-all duration-300 hover:border-[#40C8E8]/40 hover:bg-[#121A1E] hover:-translate-y-1"
            >
              {/* ID & Battery */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2 rounded-full"
                    style={{ backgroundColor: bot.color }}
                  />
                  <span className="font-mono text-base font-bold text-[#F2F4F3]">
                    {bot.id}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs text-[#89969C]">
                  <Battery className="size-3.5" />
                  <span>{bot.battery}%</span>
                </div>
              </div>

              {/* Model & Role */}
              <div className="text-xs font-mono text-[#89969C] mb-4">
                <span>{bot.model}</span> {"//"} <span>{bot.role}</span>
              </div>

              {/* Status Pill */}
              <div className="mb-4 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/5 font-mono text-[10px] font-semibold tracking-wider text-[#F2F4F3]">
                <span
                  className="size-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: bot.color }}
                />
                <span>{bot.status}</span>
              </div>

              {/* Active Mission Task */}
              <div className="text-xs text-[#89969C] font-mono mb-4 line-clamp-2">
                {bot.task}
              </div>

              {/* Coordinates Footer */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[#89969C]">
                <span>COORDS:</span>
                <span className="font-semibold text-[#F2F4F3]">{bot.coords}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
                className="p-5 rounded-xl border border-white/10 bg-[#0D1215]/80 backdrop-blur-md"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className="size-4 text-[#40C8E8]" />
                  <div className="font-mono text-xs font-bold text-[#F2F4F3]">
                    {cap.title}
                  </div>
                </div>
                <p className="text-xs text-[#89969C] leading-relaxed">
                  {cap.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
