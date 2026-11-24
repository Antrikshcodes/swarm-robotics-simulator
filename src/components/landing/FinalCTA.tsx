"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export interface FinalCTAProps {
  onEnterWarehouse: () => void;
  isTransitioning?: boolean;
}

export function FinalCTA({ onEnterWarehouse, isTransitioning }: FinalCTAProps) {
  return (
    <section
      id="final"
      className="relative min-h-screen w-full flex flex-col justify-between py-24 px-6 md:px-12 lg:px-20 border-t border-white/[0.08] overflow-hidden"
    >
      <div className="max-w-4xl mx-auto w-full my-auto text-center flex flex-col items-center z-10">
        {/* Section tag */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-[#121A1E] mb-6"
        >
          <span className="size-2 rounded-full bg-[#B7F34A] animate-ping" />
          <span className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-[#F2F4F3]">
            SIMULATION READY · ONLINE
          </span>
        </motion.div>

        {/* Big Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-5xl sm:text-7xl xl:text-8xl font-black tracking-[-0.04em] text-[#F2F4F3] leading-[0.92] mb-6"
        >
          READY TO ENTER <br />
          THE WAREHOUSE?
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg sm:text-2xl text-[#89969C] max-w-xl mx-auto mb-10 leading-relaxed font-normal"
        >
          See autonomous coordination in action.
          Experience deterministic pathfinding, live collision avoidance, and automated failure recovery.
        </motion.p>

        {/* Big Action Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative inline-block"
        >
          {/* Subtle outer glow ring */}
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#40C8E8] to-[#B7F34A] opacity-35 blur-xl transition duration-500 group-hover:opacity-80" />

          <button
            type="button"
            disabled={isTransitioning}
            onClick={onEnterWarehouse}
            className="group relative inline-flex items-center gap-4 px-10 py-5 rounded-2xl bg-[#192329] border border-[#40C8E8]/50 text-[#F2F4F3] font-mono text-sm sm:text-base font-bold tracking-wider uppercase transition-all duration-300 hover:bg-[#121A1E] hover:border-[#40C8E8] hover:shadow-2xl active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xl"
          >
            <span>ENTER WAREHOUSE</span>
            <div className="size-8 rounded-full bg-white/10 flex items-center justify-center transition-transform group-hover:translate-x-1 group-hover:bg-[#40C8E8]">
              <ArrowRight className="size-4 text-[#40C8E8] group-hover:text-[#080B0D] transition-colors" />
            </div>
          </button>
        </motion.div>

        {/* Secondary Technical Tag */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 font-mono text-xs tracking-[0.2em] text-[#89969C] uppercase"
        >
          SWARM ROBOTICS COORDINATION PLATFORM
        </motion.div>
      </div>

      {/* Footer Branding Bar */}
      <footer className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-[#89969C] z-10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#F2F4F3]">SWARM</span>
          <span>{"//"} WAREHOUSE ROBOT COORDINATION ARENA</span>
        </div>
        <div className="flex items-center gap-6">
          <span>NEXHACK 2.0</span>
          <span className="text-[#B7F34A]">ZERO COLLISIONS GUARANTEED</span>
        </div>
      </footer>
    </section>
  );
}
