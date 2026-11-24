"use client";

import { DataStrip, Eyebrow, FadeUp, PrimaryButton, RevealLines } from "./motion-primitives";

export interface FinalCTAProps {
  onEnterWarehouse: () => void;
  isTransitioning?: boolean;
}

export function FinalCTA({ onEnterWarehouse, isTransitioning }: FinalCTAProps) {
  return (
    <section id="final" className="relative flex min-h-dvh w-full flex-col justify-between border-t border-white/[0.06] px-6 pt-28 pb-10 md:px-12 lg:px-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#080B0D]/80 lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-[#080B0D]/92 via-[#080B0D]/60 to-transparent lg:block" />

      <div className="relative z-10 my-auto w-full max-w-2xl lg:w-[46%] lg:max-w-none">
        <Eyebrow index="07" label="Simulation ready" className="mb-6" />
        <RevealLines
          lines={["Ready to enter", <span key="w" className="bg-gradient-to-r from-[#40C8E8] to-[#B7F34A] bg-clip-text text-transparent">the warehouse?</span>]}
          className="font-display text-[clamp(2.75rem,5.4vw,5.75rem)] leading-[0.92] font-bold tracking-[-0.05em] text-[#F2F4F3] uppercase"
        />
        <FadeUp delay={0.3}>
          <p className="mt-6 max-w-[32rem] text-[17px] leading-[1.6] text-[#B4BFC4] sm:text-lg">
            See autonomous coordination in action: deterministic pathfinding, live collision avoidance and automated failure
            recovery.
          </p>
        </FadeUp>
        <FadeUp delay={0.45} className="mt-10">
          <PrimaryButton onClick={onEnterWarehouse} disabled={isTransitioning} className="h-14 px-8 text-[13px]">
            Enter warehouse
          </PrimaryButton>
        </FadeUp>
        <DataStrip
          className="mt-12"
          cells={[
            { value: "Simulation online", dot: "#B7F34A" },
            { label: "Engine", value: "Deterministic" },
            { label: "Invariants", value: "Checked every tick", tone: "#40C8E8" },
          ]}
        />
      </div>

      <footer className="relative z-10 flex flex-col items-start justify-between gap-3 border-t border-white/[0.08] pt-6 font-mono text-[10.5px] tracking-[0.14em] text-[#7E8C93] uppercase sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#F2F4F3]">SWARM</span>
          <span>{"//"} Warehouse robot coordination arena</span>
        </div>
        <div className="flex items-center gap-6">
          <span>NexHack 2.0</span>
          <span className="text-[#B7F34A]">Zero collisions</span>
        </div>
      </footer>
    </section>
  );
}
