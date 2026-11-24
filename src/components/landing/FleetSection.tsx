"use client";

import { motion } from "framer-motion";
import { Battery, Cpu } from "lucide-react";

const FLEET_ROBOTS = [
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
    status: "COORDINATING",
    task: "Mission M-106 (Yielding for SW-01)",
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

export function FleetSection() {
  return (
    <section
      id="fleet"
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-[#141414]/9 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto w-full">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-2 mb-3"
            >
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#141414]/60 uppercase">
                SECTION 03 // FLEET COHESION
              </span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#141414] leading-[0.98]"
            >
              ONE FLEET. <br />
              ONE INTELLIGENCE.
            </motion.h2>
          </div>

          {/* Demonstration Notice */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-3 px-4 py-2 rounded-xl border border-[#141414]/10 bg-[#E5E1D7]/60 backdrop-blur-sm self-start md:self-auto"
          >
            <span className="size-2 rounded-full bg-[#40C8E8] animate-ping" />
            <div className="font-mono text-xs text-[#141414]/80">
              <span className="font-bold">STATUS:</span> DEMONSTRATION DATA
            </div>
          </motion.div>
        </div>

        {/* Fleet Roster Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FLEET_ROBOTS.map((bot, index) => (
            <motion.div
              key={bot.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative rounded-2xl border border-[#141414]/10 bg-[#EEECE7]/70 p-6 backdrop-blur-md shadow-xs transition-all duration-300 hover:border-[#141414]/25 hover:shadow-md hover:-translate-y-1"
            >
              {/* Top Row: ID & Battery */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: bot.color }}
                  />
                  <span className="font-mono text-base font-bold text-[#141414]">
                    {bot.id}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs text-[#141414]/70">
                  <Battery className="size-3.5 text-[#141414]/60" />
                  <span>{bot.battery}%</span>
                </div>
              </div>

              {/* Model & Role */}
              <div className="text-xs font-mono text-[#141414]/60 mb-4">
                <span>{bot.model}</span> {"//"} <span>{bot.role}</span>
              </div>

              {/* Status Pill */}
              <div className="mb-4 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#141414]/5 font-mono text-[10px] font-semibold tracking-wider text-[#141414]/90">
                <span
                  className="size-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: bot.color }}
                />
                <span>{bot.status}</span>
              </div>

              {/* Active Mission Task */}
              <div className="text-xs text-[#141414]/80 font-mono mb-4 line-clamp-2">
                {bot.task}
              </div>

              {/* Coordinates Footer */}
              <div className="pt-3 border-t border-[#141414]/10 flex items-center justify-between text-[11px] font-mono text-[#141414]/50">
                <span>LOC:</span>
                <span className="font-semibold text-[#141414]/80">{bot.coords}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Abstract Multi-Agent Coordination Map Graphic */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-8 rounded-2xl border border-[#141414]/10 bg-[#E8E4DC]/60 p-6 md:p-8 backdrop-blur-sm"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Cpu className="size-5 text-[#40C8E8]" />
              <div className="font-mono text-xs font-bold tracking-wider text-[#141414]">
                COOPERATIVE SPACE-TIME RESERVATION MATRIX
              </div>
            </div>
            <div className="font-mono text-[11px] text-[#141414]/60">
              SAFETY INVARIANT: 0 CELL OVERLAPS · 0 EDGE CONFLICTS
            </div>
          </div>

          {/* Minimalist warehouse route corridor schematic */}
          <div className="relative h-28 w-full rounded-xl bg-[#14191C] overflow-hidden p-4 flex items-center justify-between">
            {/* Grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#243038_1px,transparent_1px),linear-gradient(to_bottom,#243038_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-40" />

            {/* Simulated route lines */}
            <div className="relative z-10 w-full flex items-center justify-around">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#40C8E8] shadow-[0_0_8px_#40C8E8]" />
                <span className="font-mono text-[11px] text-[#EFECE6] font-semibold">SW-01 [RESERVED T:12-18]</span>
              </div>

              {/* Conflict Prevention Arrow */}
              <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-[#B7F34A]">
                <span>──────→</span>
                <span className="px-2 py-0.5 rounded bg-[#B7F34A]/10 border border-[#B7F34A]/30">RIGHT OF WAY ASSIGNED</span>
                <span>──────→</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[#EFECE6] font-semibold">SW-03 [HOLDING YIELD]</span>
                <span className="size-3 rounded-full bg-[#F5B942] shadow-[0_0_8px_#F5B942]" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
