"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Compass, Network, GitMerge, RefreshCw, ChevronRight } from "lucide-react";

const CAPABILITIES = [
  {
    number: "01",
    title: "INTELLIGENT PATHFINDING",
    description:
      "Robots calculate optimal, energy-efficient trajectories through complex warehouse geometries using cooperative space-time search.",
    icon: Compass,
    accent: "#40C8E8",
  },
  {
    number: "02",
    title: "MULTI-ROBOT COORDINATION",
    description:
      "A centralized reservation table manages 4D spacetime reservations, preventing cell collisions and opposing edge traversals before movement.",
    icon: Network,
    accent: "#B7F34A",
  },
  {
    number: "03",
    title: "DEADLOCK DETECTION & RECOVERY",
    description:
      "Wait-for graph analysis detects circular dependencies in narrow passages, executing deterministic yield-to-holding maneuvers.",
    icon: GitMerge,
    accent: "#F5B942",
  },
  {
    number: "04",
    title: "AUTONOMOUS FAILURE RECOVERY",
    description:
      "Seamless failure mitigation: failed machines hold custody until nearest active units perform atomic package handovers without lost work.",
    icon: RefreshCw,
    accent: "#40C8E8",
  },
];

export function PlatformSection() {
  const [activeItem, setActiveItem] = useState(0);

  return (
    <section
      id="platform"
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-[#141414]/9 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Editorial Header */}
        <div className="lg:col-span-5 flex flex-col">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-2 mb-4"
          >
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#141414]/60 uppercase">
              SECTION 02 // ARCHITECTURE
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#141414] leading-[0.98] mb-6"
          >
            INTELLIGENCE <br />
            IN EVERY <br />
            MOVE.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-base sm:text-lg text-[#141414]/70 leading-relaxed max-w-md mb-8"
          >
            Multiple autonomous robots. One coordinated warehouse.
            Engineered from mathematical first principles for complete collision-free determinism.
          </motion.p>

          {/* Active capability detail callout */}
          <motion.div
            key={activeItem}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="hidden lg:block p-5 rounded-2xl border border-[#141414]/10 bg-[#E5E1D7]/50 backdrop-blur-sm"
          >
            <div className="font-mono text-xs font-bold text-[#141414] mb-1">
              SYSTEM CAPABILITY {CAPABILITIES[activeItem].number}
            </div>
            <p className="text-sm text-[#141414]/75">
              {CAPABILITIES[activeItem].description}
            </p>
          </motion.div>
        </div>

        {/* Right Feature List */}
        <div className="lg:col-span-7 flex flex-col divide-y divide-[#141414]/10">
          {CAPABILITIES.map((cap, idx) => {
            const Icon = cap.icon;
            const isSelected = activeItem === idx;

            return (
              <motion.div
                key={cap.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                onMouseEnter={() => setActiveItem(idx)}
                onClick={() => setActiveItem(idx)}
                className={`group py-7 cursor-pointer transition-all duration-300 ${
                  isSelected ? "bg-[#141414]/3 px-4 rounded-xl" : "hover:bg-[#141414]/2 px-2"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-5">
                    {/* Number & Icon */}
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm tracking-wider font-semibold text-[#141414]/40 group-hover:text-[#141414]">
                        {cap.number}
                      </span>
                      <div
                        className="size-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{
                          backgroundColor: isSelected ? cap.accent : "rgba(20, 20, 20, 0.06)",
                          color: isSelected ? "#090D10" : "#141414",
                        }}
                      >
                        <Icon className="size-4" />
                      </div>
                    </div>

                    {/* Title & Desc */}
                    <div>
                      <h3 className="font-mono text-base sm:text-lg font-bold tracking-tight text-[#141414] group-hover:text-[#40C8E8] transition-colors">
                        {cap.title}
                      </h3>
                      <p className="mt-1 text-sm text-[#141414]/65 max-w-xl leading-relaxed">
                        {cap.description}
                      </p>
                    </div>
                  </div>

                  <ChevronRight
                    className={`size-5 text-[#141414]/30 transition-transform duration-200 ${
                      isSelected ? "translate-x-1 text-[#141414]" : "group-hover:translate-x-0.5"
                    }`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
