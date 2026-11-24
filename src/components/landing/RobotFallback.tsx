"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Zap } from "lucide-react";

export function RobotFallback() {
  return (
    <div className="relative flex h-[480px] w-full max-w-lg items-center justify-center p-6">
      {/* Decorative dark background pedestal rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-64 w-64 rounded-full border border-white/5 bg-[#121A1E]/40" />
        <div className="absolute h-80 w-80 rounded-full border border-dashed border-[#40C8E8]/20 animate-[spin_30s_linear_infinite]" />
      </div>

      {/* Robot illustration card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center rounded-2xl border border-white/10 bg-[#121A1E]/80 p-8 shadow-2xl backdrop-blur-md"
      >
        {/* Robot Top LiDAR */}
        <div className="relative mb-2 flex flex-col items-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#40C8E8] bg-[#080B0D] shadow-[0_0_16px_rgba(64,200,232,0.6)]"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-[#40C8E8]" />
          </motion.div>
          <div className="h-2 w-3 bg-[#192329]" />
        </div>

        {/* Robot Main Body */}
        <div className="relative flex h-36 w-64 flex-col justify-between rounded-xl border border-white/10 bg-gradient-to-b from-[#192329] to-[#0D1215] p-4 shadow-inner">
          {/* Top telemetry strip */}
          <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-[#89969C]">
            <span className="flex items-center gap-1.5 font-bold text-[#F2F4F3]">
              <span className="size-1.5 rounded-full bg-[#B7F34A] animate-pulse" />
              SW-01
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[#40C8E8]">AMR CORE</span>
          </div>

          {/* Front Display Screen with Cyan LED Eyes */}
          <div className="relative flex h-16 w-full items-center justify-center rounded-lg border border-white/10 bg-[#050709] p-2 shadow-inner">
            <div className="flex items-center gap-8">
              {/* Left Eye */}
              <motion.div
                animate={{
                  scaleY: [1, 1, 0.1, 1, 1],
                  scaleX: [1, 1, 1.2, 1, 1],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  times: [0, 0.45, 0.5, 0.55, 1],
                }}
                className="h-8 w-5 rounded-full bg-[#40C8E8] shadow-[0_0_16px_#40C8E8]"
              />
              {/* Right Eye */}
              <motion.div
                animate={{
                  scaleY: [1, 1, 0.1, 1, 1],
                  scaleX: [1, 1, 1.2, 1, 1],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  times: [0, 0.45, 0.5, 0.55, 1],
                }}
                className="h-8 w-5 rounded-full bg-[#40C8E8] shadow-[0_0_16px_#40C8E8]"
              />
            </div>
          </div>

          {/* Bottom bumper sensor strip */}
          <div className="flex items-center justify-between px-1">
            <div className="flex gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-[#40C8E8]/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#B7F34A]" />
            </div>
            <span className="font-mono text-[9px] tracking-widest text-[#58666C]">AUTONOMOUS</span>
          </div>
        </div>

        {/* Wheels */}
        <div className="flex w-60 justify-between px-2 pt-1">
          <div className="h-4 w-10 rounded-b-md bg-[#0D1215] border-t border-white/5" />
          <div className="h-4 w-10 rounded-b-md bg-[#0D1215] border-t border-white/5" />
        </div>

        {/* Status Pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#192329]/70 px-3 py-1 text-xs font-mono text-[#F2F4F3]">
            <Zap className="size-3 text-[#B7F34A]" />
            <span>98% BATTERY</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#192329]/70 px-3 py-1 text-xs font-mono text-[#F2F4F3]">
            <ShieldCheck className="size-3 text-[#40C8E8]" />
            <span>ZERO COLLISIONS</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
