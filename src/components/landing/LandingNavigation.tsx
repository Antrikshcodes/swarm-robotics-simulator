"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";

export interface LandingNavigationProps {
  onEnterWarehouse: () => void;
  isTransitioning?: boolean;
  isScrolled?: boolean;
}

export function LandingNavigation({
  onEnterWarehouse,
  isTransitioning,
  isScrolled: externalIsScrolled,
}: LandingNavigationProps) {
  const [internalScrolled, setInternalScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (externalIsScrolled !== undefined) return;
    const handleScroll = () => {
      setInternalScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [externalIsScrolled]);

  const scrolled = externalIsScrolled !== undefined ? externalIsScrolled : internalScrolled;

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#EFECE6]/85 backdrop-blur-md border-b border-[#141414]/9 py-3 shadow-xs"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link
          href="/"
          className="group flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-[#40C8E8]"
        >
          {/* Custom geometric logo mark */}
          <div className="relative size-8 flex items-center justify-center rounded-lg bg-[#141414] text-[#EFECE6] shadow-sm transition-transform group-hover:scale-105">
            <svg
              viewBox="0 0 24 24"
              className="size-5 fill-none stroke-current stroke-[2.2]"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <circle cx="6.5" cy="6.5" r="1" className="fill-[#40C8E8] stroke-none" />
              <circle cx="17.5" cy="17.5" r="1" className="fill-[#B7F34A] stroke-none" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-sm font-bold tracking-[0.22em] text-[#141414] leading-none">
              SWARM
            </span>
            <span className="font-mono text-[9.5px] tracking-wider text-[#141414]/50 leading-tight mt-0.5">
              ROBOTICS ARENA
            </span>
          </div>
        </Link>

        {/* Center Editorial Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: "PLATFORM", target: "platform" },
            { label: "FLEET", target: "fleet" },
            { label: "TECHNOLOGY", target: "technology" },
            { label: "ABOUT", target: "about" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => scrollToSection(item.target)}
              className="group relative font-mono text-xs tracking-[0.16em] uppercase text-[#141414]/75 hover:text-[#141414] transition-colors py-1 cursor-pointer"
            >
              <span>{item.label}</span>
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#141414] transition-all duration-200 group-hover:w-full" />
            </button>
          ))}
        </nav>

        {/* Right Action Area */}
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#141414]/10 bg-[#141414]/5 font-mono text-[10.5px] tracking-wider text-[#141414]/80">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B7F34A] opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-[#B7F34A]" />
            </span>
            <span>SYSTEM: ONLINE</span>
          </div>

          {/* Primary ENTER WAREHOUSE Button */}
          <button
            type="button"
            disabled={isTransitioning}
            onClick={onEnterWarehouse}
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#141414] text-[#EFECE6] font-mono text-xs font-semibold tracking-wider uppercase transition-all duration-300 hover:bg-[#20272B] hover:shadow-lg hover:shadow-[#141414]/15 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span>ENTER WAREHOUSE</span>
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 text-[#40C8E8]" />
          </button>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="md:hidden p-2 text-[#141414] hover:bg-[#141414]/5 rounded-lg"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-b border-[#141414]/10 bg-[#EFECE6] px-6 py-6"
          >
            <div className="flex flex-col gap-4 font-mono text-sm tracking-wider">
              <button
                type="button"
                onClick={() => scrollToSection("platform")}
                className="text-left text-[#141414]/80 hover:text-[#141414] py-1"
              >
                01 // PLATFORM
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("fleet")}
                className="text-left text-[#141414]/80 hover:text-[#141414] py-1"
              >
                02 // FLEET
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("technology")}
                className="text-left text-[#141414]/80 hover:text-[#141414] py-1"
              >
                03 // TECHNOLOGY
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("about")}
                className="text-left text-[#141414]/80 hover:text-[#141414] py-1"
              >
                04 // ABOUT
              </button>
              <div className="pt-2 border-t border-[#141414]/10">
                <button
                  type="button"
                  onClick={onEnterWarehouse}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#141414] text-[#EFECE6] font-mono text-xs font-semibold tracking-wider"
                >
                  <span>ENTER WAREHOUSE</span>
                  <ArrowUpRight className="size-4 text-[#40C8E8]" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
