"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
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

export function LandingPage() {
  const router = useRouter();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("hero");
  const [isEnteringWarehouse, setIsEnteringWarehouse] = useState(false);
  const [isWebGLSupported, setIsWebGLSupported] = useState(true);

  // Measure scroll progress relative to page height
  useEffect(() => {
    const scrollContainer = document.getElementById("landing-scroll-root");

    const handleScroll = () => {
      const scrollY = scrollContainer
        ? scrollContainer.scrollTop
        : window.scrollY || document.documentElement.scrollTop;
      const totalHeight = scrollContainer
        ? scrollContainer.scrollHeight - scrollContainer.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? Math.min(Math.max(scrollY / totalHeight, 0), 1) : 0;
      setScrollProgress(progress);

      // Section calculation based on scroll offset across all 7 scenes
      const sections = [
        "hero",
        "robot-reveal",
        "warehouse-scale",
        "coordination-conflict",
        "swarm-solution",
        "technology",
        "final",
      ];
      const sectionElements = sections.map((id) => document.getElementById(id));
      const currentScroll = scrollY + window.innerHeight * 0.35;

      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const el = sectionElements[i];
        if (el && el.offsetTop <= currentScroll) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleEnterWarehouse = useCallback(() => {
    if (isEnteringWarehouse) return;
    setIsEnteringWarehouse(true);
  }, [isEnteringWarehouse]);

  const handleTransitionComplete = useCallback(() => {
    router.push("/overview");
  }, [router]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-[#080B0D] text-[#F2F4F3] overflow-x-hidden">
      {/* 1. Subtle Editorial Vertical Grid Lines (17%, 50%, 83%) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 flex justify-between px-0"
      >
        <div className="absolute top-0 bottom-0 left-[17%] w-px bg-white/[0.04]" />
        <div className="absolute top-0 bottom-0 left-[50%] w-px bg-white/[0.04]" />
        <div className="absolute top-0 bottom-0 left-[83%] w-px bg-white/[0.04]" />
      </div>

      {/* 2. Persistent Fullscreen 3D Scene */}
      <WarehouseScene
        scrollProgress={scrollProgress}
        isEnteringWarehouse={isEnteringWarehouse}
        onWebGLUnavailable={() => setIsWebGLSupported(false)}
      />

      {/* 3. Fixed Navigation Bar */}
      <LandingNavigation
        onEnterWarehouse={handleEnterWarehouse}
        isTransitioning={isEnteringWarehouse}
        isScrolled={scrollProgress > 0.02}
      />

      {/* 4. Desktop Right-Side 7-Scene Rail Indicator */}
      <SectionIndicator
        activeSection={activeSection}
        onSectionClick={scrollToSection}
      />

      {/* 5. Editorial Content: The 7 Continuous Scenes */}
      <main className="relative z-10 w-full flex flex-col">
        {/* Scene 01: The Introduction */}
        <HeroSection
          onEnterWarehouse={handleEnterWarehouse}
          onExplore={() => scrollToSection("robot-reveal")}
          isWebGLSupported={isWebGLSupported}
        />

        {/* Scene 02: The Robot Reveal */}
        <RobotRevealSection />

        {/* Scene 03: The Warehouse Scale */}
        <WarehouseEnvironmentSection />

        {/* Scene 04: The Coordination Problem (Narrow Aisle) */}
        <CoordinationProblemSection />

        {/* Scene 05: The SWARM Solution */}
        <SwarmSolutionSection />

        {/* Scene 06: Technology & Architecture */}
        <TechnologySection />

        {/* Scene 07: The Final CTA */}
        <FinalCTA
          onEnterWarehouse={handleEnterWarehouse}
          isTransitioning={isEnteringWarehouse}
        />
      </main>

      {/* 6. Cinematic Enter Warehouse Transition Overlay */}
      <AnimatePresence>
        {isEnteringWarehouse && (
          <EnterWarehouseTransition
            active={isEnteringWarehouse}
            onComplete={handleTransitionComplete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
