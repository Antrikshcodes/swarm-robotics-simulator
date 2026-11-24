"use client";

import { motion } from "framer-motion";

export interface SectionIndicatorProps {
  activeSection: string;
  onSectionClick: (id: string) => void;
}

const SECTIONS = [
  { id: "hero", label: "INTRO", number: "01" },
  { id: "robot-reveal", label: "ROBOT", number: "02" },
  { id: "warehouse-scale", label: "WAREHOUSE", number: "03" },
  { id: "coordination-conflict", label: "CONFLICT", number: "04" },
  { id: "swarm-solution", label: "SOLUTION", number: "05" },
  { id: "technology", label: "TECH", number: "06" },
  { id: "final", label: "FINAL", number: "07" },
];

export function SectionIndicator({ activeSection, onSectionClick }: SectionIndicatorProps) {
  return (
    <aside
      aria-label="Section navigation"
      className="fixed right-8 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-end gap-4 select-none"
    >
      {SECTIONS.map((section) => {
        const isActive = activeSection === section.id;

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionClick(section.id)}
            className="group flex items-center gap-3 text-right outline-none cursor-pointer"
          >
            {/* Label */}
            <span
              className={`font-mono text-[10px] tracking-[0.2em] transition-all duration-200 ${
                isActive
                  ? "text-[#F2F4F3] font-bold translate-x-0 opacity-100"
                  : "text-[#89969C]/40 translate-x-1 opacity-0 group-hover:opacity-80 group-hover:translate-x-0"
              }`}
            >
              {section.number} {"//"} {section.label}
            </span>

            {/* Dot Indicator */}
            <div className="relative flex items-center justify-center size-3">
              {isActive && (
                <motion.div
                  layoutId="activeSectionDotDark"
                  className="absolute inset-0 rounded-full border border-[#40C8E8]/60 bg-transparent"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              <div
                className={`size-1.5 rounded-full transition-colors duration-200 ${
                  isActive ? "bg-[#40C8E8] shadow-[0_0_8px_#40C8E8]" : "bg-white/20 group-hover:bg-white/60"
                }`}
              />
            </div>
          </button>
        );
      })}
    </aside>
  );
}
