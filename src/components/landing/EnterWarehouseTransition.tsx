"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export interface EnterWarehouseTransitionProps {
  active: boolean;
  onComplete: () => void;
}

export function EnterWarehouseTransition({ active, onComplete }: EnterWarehouseTransitionProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;

    // Sequence timing
    const t1 = setTimeout(() => setStep(1), 400);
    const t2 = setTimeout(() => setStep(2), 1000);
    const t3 = setTimeout(() => {
      onComplete();
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [active, onComplete]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090D10]/95 backdrop-blur-xl text-[#E3E9EC] select-none"
    >
      {/* Laser Scanning Grid Line */}
      <motion.div
        initial={{ top: "-10%" }}
        animate={{ top: "110%" }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#40C8E8] to-transparent shadow-[0_0_24px_#40C8E8]"
      />

      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(64,200,232,0.15),transparent_70%)]" />

      {/* Center HUD Scanning Reticle */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Outer Rotating HUD Rings */}
        <div className="relative size-36 sm:size-48 flex items-center justify-center mb-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border border-dashed border-[#40C8E8]/50"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
            className="absolute inset-3 rounded-full border border-[#B7F34A]/40"
          />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="size-16 rounded-full bg-[#40C8E8]/20 flex items-center justify-center border border-[#40C8E8]"
          >
            <div className="size-4 rounded-full bg-[#40C8E8] shadow-[0_0_16px_#40C8E8]" />
          </motion.div>
        </div>

        {/* Status Texts */}
        <div className="text-center font-mono space-y-2">
          <div className="text-xs tracking-[0.25em] text-[#40C8E8] uppercase font-bold animate-pulse">
            {step === 0 && "ACCESSING SWARM ARENA..."}
            {step === 1 && "CONNECTING DETERMINISTIC ENGINE..."}
            {step >= 2 && "INITIALIZING DASHBOARD & 3D TELEMETRY..."}
          </div>
          <div className="text-[11px] tracking-wider text-[#82919A]">
            LATENCY: 0.2ms · SAFETY INVARIANTS: VERIFIED · 0 CONFLICTS
          </div>
        </div>
      </div>
    </motion.div>
  );
}
