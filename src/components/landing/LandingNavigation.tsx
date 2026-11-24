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
          ? "bg-[#080B0D]/92 border-b border-white/[0.08] py-3.5"
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
          <div className="relative size-8 flex items-center justify-center rounded-lg bg-[#121A1E] border border-white/10 text-[#F2F4F3] shadow-inner transition-transform group-hover:scale-105">
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
            <span className="font-display font-bold tracking-[0.2em] text-sm text-[#F2F4F3] leading-none">
              SWARM
            </span>
            <span className="font-mono text-[9px] tracking-widest text-[#89969C] leading-tight mt-0.5">
              ROBOTICS ARENA
            </span>
          </div>
        </Link>

        {/* Center Editorial Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: "ROBOT", target: "robot-reveal" },
            { label: "WAREHOUSE", target: "warehouse-scale" },
            { label: "CONFLICT", target: "coordination-conflict" },
            { label: "SOLUTION", target: "swarm-solution" },
            { label: "TECHNOLOGY", target: "technology" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => scrollToSection(item.target)}
              className="group relative font-mono text-xs tracking-[0.16em] uppercase text-[#89969C] hover:text-[#F2F4F3] transition-colors py-1 cursor-pointer"
            >
              <span>{item.label}</span>
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#40C8E8] transition-all duration-200 group-hover:w-full" />
            </button>
          ))}
        </nav>

        {/* Right Action Area */}
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-[#121A1E] font-mono text-[10.5px] tracking-wider text-[#89969C]">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B7F34A] opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-[#B7F34A]" />
            </span>
            <span className="text-[#F2F4F3]">SYSTEM: ONLINE</span>
          </div>

          {/* Primary ENTER WAREHOUSE Button */}
          <button
            type="button"
            disabled={isTransitioning}
            onClick={onEnterWarehouse}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-md border border-[#40C8E8]/45 bg-[#40C8E8]/[0.06] px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.14em] text-[#F2F4F3] uppercase transition-[border-color,background-color] duration-300 outline-none hover:border-[#40C8E8] hover:bg-[#40C8E8]/[0.12] focus-visible:ring-2 focus-visible:ring-[#40C8E8] disabled:opacity-50"
          >
            <span>ENTER WAREHOUSE</span>
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 text-[#40C8E8]" />
          </button>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="md:hidden p-2 text-[#F2F4F3] hover:bg-white/5 rounded-lg border border-white/10"
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
            className="md:hidden border-b border-white/10 bg-[#080B0D] px-6 py-6"
          >
            <div className="flex flex-col gap-4 font-mono text-xs tracking-wider">
              <button
                type="button"
                onClick={() => scrollToSection("robot-reveal")}
                className="text-left text-[#89969C] hover:text-[#F2F4F3] py-1.5"
              >
                01 {"//"} THE ROBOT REVEAL
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("warehouse-scale")}
                className="text-left text-[#89969C] hover:text-[#F2F4F3] py-1.5"
              >
                02 {"//"} WAREHOUSE SCALE
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("coordination-conflict")}
                className="text-left text-[#89969C] hover:text-[#F2F4F3] py-1.5"
              >
                03 {"//"} CONFLICT RESOLUTION
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("swarm-solution")}
                className="text-left text-[#89969C] hover:text-[#F2F4F3] py-1.5"
              >
                04 {"//"} SWARM SOLUTION
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("technology")}
                className="text-left text-[#89969C] hover:text-[#F2F4F3] py-1.5"
              >
                05 {"//"} ARCHITECTURE & TECH
              </button>
              <div className="pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={onEnterWarehouse}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#192329] border border-[#40C8E8]/40 text-[#F2F4F3] font-mono text-xs font-semibold tracking-wider"
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
