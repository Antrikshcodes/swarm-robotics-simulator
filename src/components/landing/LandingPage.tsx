"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { LandingNavigation } from "./LandingNavigation";
import { SectionIndicator } from "./SectionIndicator";
import { HeroSection } from "./HeroSection";
import { PlatformSection } from "./PlatformSection";
import { FleetSection } from "./FleetSection";
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

      // Section calculation based on scroll offset
      const sections = ["hero", "platform", "fleet", "technology", "final"];
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
    <div className="relative min-h-screen w-full bg-[#EFECE6] text-[#141414] overflow-x-hidden">
      {/* 1. Subtle Editorial Vertical Grid Lines (17%, 50%, 83%) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 flex justify-between px-0"
      >
        <div className="absolute top-0 bottom-0 left-[17%] w-px bg-[#141414]/[0.05]" />
        <div className="absolute top-0 bottom-0 left-[50%] w-px bg-[#141414]/[0.05]" />
        <div className="absolute top-0 bottom-0 left-[83%] w-px bg-[#141414]/[0.05]" />
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

      {/* 4. Desktop Right-Side Section Rail Indicator */}
      <SectionIndicator
        activeSection={activeSection}
        onSectionClick={scrollToSection}
      />

      {/* 5. Editorial Content Sections */}
      <main className="relative z-10 w-full flex flex-col">
        {/* Section 1: Hero */}
        <HeroSection
          onEnterWarehouse={handleEnterWarehouse}
          onExplore={() => scrollToSection("platform")}
          isWebGLSupported={isWebGLSupported}
        />

        {/* Section 2: Platform */}
        <PlatformSection />

        {/* Section 3: Fleet */}
        <FleetSection />

        {/* Section 4: Technology */}
        <TechnologySection />

        {/* Section 5: Final CTA */}
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
