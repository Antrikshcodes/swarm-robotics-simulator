"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, useMotionValue, useMotionValueEvent } from "framer-motion";
import { LandingNavigation } from "./LandingNavigation";
import { SectionIndicator } from "./SectionIndicator";
import { HeroSection } from "./HeroSection";
import { RobotRevealSection } from "./RobotRevealSection";
import { WarehouseEnvironmentSection } from "./WarehouseEnvironmentSection";
import { CoordinationProblemSection } from "./CoordinationProblemSection";
import { SwarmSolutionSection } from "./SwarmSolutionSection";
import { TechnologySection } from "./TechnologySection";
import { FinalCTA } from "./FinalCTA";
import { WarehouseScene } from "./WarehouseScene";
import { EnterWarehouseTransition } from "./EnterWarehouseTransition";

const SECTION_IDS = ["hero", "robot-reveal", "warehouse-scale", "coordination-conflict", "swarm-solution", "technology", "final"] as const;

/**
 * Scroll architecture: scroll position lives in a MotionValue, never in React
 * state. The 3D scene reads it inside its own render loop, HUD and text
 * effects bind to it through useTransform, and React re-renders only when a
 * discrete value flips (nav background, active section).
 */
export function LandingPage() {
  const router = useRouter();
  const progress = useMotionValue(0);
  const hudRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("hero");
  const [isEnteringWarehouse, setIsEnteringWarehouse] = useState(false);
  const [isWebGLSupported, setIsWebGLSupported] = useState(true);

  // Scroll → MotionValue (no React render per scroll event).
  useEffect(() => {
    const root = document.getElementById("landing-scroll-root");
    const target: HTMLElement | Window = root ?? window;
    const read = () => {
      const top = root ? root.scrollTop : window.scrollY;
      const max = root ? root.scrollHeight - root.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      progress.set(max > 0 ? Math.min(1, Math.max(0, top / max)) : 0);
    };
    target.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    read();
    return () => {
      target.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [progress]);

  useMotionValueEvent(progress, "change", (p) => {
    const scrolled = p > 0.02;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  });

  // Active section via IntersectionObserver instead of offsetTop reads on every scroll.
  useEffect(() => {
    const root = document.getElementById("landing-scroll-root");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActiveSection(entry.target.id);
      },
      { root, rootMargin: "-35% 0px -60% 0px", threshold: 0 },
    );
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const handleEnterWarehouse = useCallback(() => {
    setIsEnteringWarehouse(true);
  }, []);

  const handleTransitionComplete = useCallback(() => {
    router.push("/overview");
  }, [router]);

  const handleWebGLUnavailable = useCallback(() => setIsWebGLSupported(false), []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const explore = useCallback(() => scrollToSection("robot-reveal"), [scrollToSection]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#080B0D] text-[#F2F4F3]">
      {/* Editorial vertical grid lines */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 bottom-0 left-[17%] w-px bg-white/[0.035]" />
        <div className="absolute top-0 bottom-0 left-[50%] w-px bg-white/[0.035]" />
        <div className="absolute top-0 bottom-0 left-[83%] w-px bg-white/[0.035]" />
      </div>

      {/* Persistent 3D scene, driven by the progress MotionValue */}
      <WarehouseScene progress={progress} isEnteringWarehouse={isEnteringWarehouse} onWebGLUnavailable={handleWebGLUnavailable} hudRef={hudRef} />

      <LandingNavigation onEnterWarehouse={handleEnterWarehouse} isTransitioning={isEnteringWarehouse} isScrolled={isScrolled} />

      <SectionIndicator activeSection={activeSection} onSectionClick={scrollToSection} />

      <main className="relative z-10 flex w-full flex-col">
        <HeroSection
          onEnterWarehouse={handleEnterWarehouse}
          onExplore={explore}
          isWebGLSupported={isWebGLSupported}
          progress={progress}
          hudRef={hudRef}
        />
        <RobotRevealSection />
        <WarehouseEnvironmentSection />
        <CoordinationProblemSection />
        <SwarmSolutionSection />
        <TechnologySection />
        <FinalCTA onEnterWarehouse={handleEnterWarehouse} isTransitioning={isEnteringWarehouse} />
      </main>

      <AnimatePresence>
        {isEnteringWarehouse && <EnterWarehouseTransition active={isEnteringWarehouse} onComplete={handleTransitionComplete} />}
      </AnimatePresence>
    </div>
  );
}
