"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowDown, Radio } from "lucide-react";
import { RobotFallback } from "./RobotFallback";

export interface HeroSectionProps {
  onEnterWarehouse: () => void;
  onExplore: () => void;
  isWebGLSupported?: boolean;
}

export function HeroSection({ onEnterWarehouse, onExplore, isWebGLSupported = true }: HeroSectionProps) {
  return (
    <section
      id="hero"
      className="relative min-h-screen w-full flex flex-col justify-between pt-24 pb-12 px-6 md:px-12 lg:px-20 overflow-hidden"
    >
      {/* Top Main Hero Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center flex-1 my-auto">
        {/* Left Editorial Copy */}
        <div className="lg:col-span-7 flex flex-col items-start z-10 pointer-events-auto">
          {/* Small Technical Tag */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-white/10 bg-[#121A1E]/80 mb-6 backdrop-blur-sm"
          >
            <span className="size-1.5 rounded-full bg-[#40C8E8] shadow-[0_0_8px_#40C8E8] animate-pulse" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#89969C]">
              AUTONOMOUS WAREHOUSE INTELLIGENCE
            </span>
          </motion.div>

          {/* Main Large Headline with Space Grotesk */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl sm:text-7xl xl:text-8xl font-black tracking-[-0.04em] text-[#F2F4F3] leading-[0.92] mb-6"
          >
            THE FUTURE <br />
            MOVES <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#40C8E8] via-[#B7F34A] to-[#F2F4F3]">
              TOGETHER.
            </span>
          </motion.h1>

          {/* Supporting Statement */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="max-w-xl text-lg sm:text-xl text-[#89969C] font-normal leading-relaxed mb-10"
          >
            An intelligent coordination arena for autonomous warehouse fleets.
            One shared intelligence orchestrating multi-agent movements with zero collisions.
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="flex flex-wrap items-center gap-4"
          >
            <button
              type="button"
              onClick={onEnterWarehouse}
              className="group relative inline-flex items-center gap-3 px-7 py-3.5 rounded-xl bg-[#192329] border border-[#40C8E8]/40 text-[#F2F4F3] font-mono text-xs font-semibold tracking-wider uppercase transition-all duration-300 hover:bg-[#121A1E] hover:border-[#40C8E8] hover:shadow-xl hover:shadow-[#40C8E8]/15 active:scale-95 cursor-pointer shadow-lg"
            >
              <span>ENTER WAREHOUSE</span>
              <ArrowRight className="size-4 text-[#40C8E8] transition-transform group-hover:translate-x-1" />
            </button>

            <button
              type="button"
              onClick={onExplore}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/10 bg-[#121A1E]/50 backdrop-blur-sm text-[#F2F4F3] font-mono text-xs font-semibold tracking-wider uppercase transition-colors hover:bg-white/5 cursor-pointer"
            >
              <span>EXPLORE THE SYSTEM</span>
              <ArrowDown className="size-3.5 text-[#89969C]" />
            </button>
          </motion.div>
        </div>

        {/* Right Area: Telemetry Cards & Fallback (if WebGL unavailable) */}
        <div className="lg:col-span-5 relative flex flex-col items-end justify-center pointer-events-none">
          {!isWebGLSupported ? (
            <div className="pointer-events-auto">
              <RobotFallback />
            </div>
          ) : (
            /* Floating Technical Telemetry Badges */
            <div className="relative w-full h-[450px] flex flex-col justify-between py-6">
              {/* Telemetry Badge 1: Top Right */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="self-end pointer-events-auto rounded-xl border border-white/10 bg-[#121A1E]/80 p-3.5 shadow-xl backdrop-blur-md max-w-[210px]"
              >
                <div className="flex items-center justify-between text-[9px] font-mono tracking-wider text-[#89969C] mb-1.5">
                  <span>TELEMETRY {"//"} DEMO</span>
                  <Radio className="size-2.5 text-[#40C8E8] animate-pulse" />
                </div>
                <div className="font-mono text-xs font-bold text-[#F2F4F3]">
                  ROBOT ID: <span className="text-[#40C8E8]">SW-01</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-[#89969C]">
                  <span className="size-1.5 rounded-full bg-[#B7F34A] shadow-[0_0_6px_#B7F34A]" />
                  <span className="text-[#F2F4F3]">STATUS: READY</span>
                </div>
              </motion.div>

              {/* Telemetry Badge 2: Radar scan graphic */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.8 }}
                className="self-start hidden sm:flex items-center gap-3 pointer-events-auto rounded-xl border border-white/10 bg-[#121A1E]/80 p-3 shadow-xl backdrop-blur-md"
              >
                {/* Circular Radar Icon */}
                <div className="relative size-9 flex items-center justify-center rounded-full border border-[#40C8E8]/40 bg-[#40C8E8]/10">
                  <div className="absolute inset-1 rounded-full border border-dashed border-[#40C8E8]/60 animate-[spin_8s_linear_infinite]" />
                  <div className="size-1.5 rounded-full bg-[#40C8E8] shadow-[0_0_8px_#40C8E8]" />
                </div>
                <div className="font-mono text-[10px] leading-tight">
                  <div className="text-[#89969C]">LIDAR HORIZON</div>
                  <div className="font-bold text-[#F2F4F3]">360° ACTIVE</div>
                </div>
              </motion.div>

              {/* Telemetry Badge 3: Bottom Right */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.9 }}
                className="self-end pointer-events-auto rounded-xl border border-white/10 bg-[#121A1E]/80 p-3.5 shadow-xl backdrop-blur-md max-w-[210px] space-y-1.5 text-[11px] font-mono"
              >
                <div className="flex items-center justify-between text-[#89969C]">
                  <span>BATTERY:</span>
                  <span className="font-bold text-[#B7F34A]">98%</span>
                </div>
                <div className="flex items-center justify-between text-[#89969C]">
                  <span>POSITION:</span>
                  <span className="font-bold text-[#F2F4F3]">X-024 / Y-018</span>
                </div>
                <div className="flex items-center justify-between text-[#89969C] pt-1 border-t border-white/10">
                  <span>MODE:</span>
                  <span className="font-bold text-[#40C8E8]">AUTONOMOUS</span>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Editorial Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10.5px] tracking-[0.16em] text-[#89969C] uppercase z-10"
      >
        <div>INTELLIGENT COORDINATION FOR AUTONOMOUS WAREHOUSE FLEETS.</div>

        <button
          type="button"
          onClick={onExplore}
          className="flex items-center gap-2 hover:text-[#F2F4F3] transition-colors cursor-pointer"
        >
          <span>SCROLL TO EXPLORE</span>
          <ArrowDown className="size-3 animate-bounce text-[#40C8E8]" />
        </button>
      </motion.div>
    </section>
  );
}
