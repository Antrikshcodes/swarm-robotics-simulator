"use client";

import { useEffect, type ReactNode, type RefObject } from "react";
import { animate, motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { RobotFallback } from "./RobotFallback";
import { DataStrip, EASE_OUT, FadeUp, PrimaryButton, RevealLines, SecondaryButton } from "./motion-primitives";

export interface HeroSectionProps {
  onEnterWarehouse: () => void;
  onExplore: () => void;
  isWebGLSupported?: boolean;
  /** Page scroll progress (0–1); fades the HUD out without re-rendering. */
  progress: MotionValue<number>;
  /** Receives the robot's projected screen position from the 3D scene (CSS vars). */
  hudRef: RefObject<HTMLDivElement | null>;
}

export function HeroSection({ onEnterWarehouse, onExplore, isWebGLSupported = true, progress, hudRef }: HeroSectionProps) {
  const hudOpacity = useTransform(progress, [0, 0.05], [1, 0]);

  return (
    <section id="hero" className="relative flex min-h-dvh w-full flex-col justify-between px-6 pt-28 pb-10 md:px-12 lg:px-20">
      {/* Mobile/tablet: keep the stacked text readable over the scene. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[80%] bg-gradient-to-b from-[#080B0D] via-[#080B0D]/85 to-transparent lg:hidden" />
      {/* Desktop: a soft left-side falloff guarantees headline contrast whatever the scene does. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[52%] bg-gradient-to-r from-[#080B0D]/90 via-[#080B0D]/55 to-transparent lg:block" />

      <div className="relative z-10 flex flex-1 items-center">
        {/* Layer 1 — content, confined to the left 44 % on desktop. */}
        <div className="w-full max-w-[38rem] lg:w-[44%] lg:max-w-none">
          <FadeUp inView={false} delay={0.05} className="mb-7">
            <div className="flex items-center gap-3 font-mono text-[10.5px] tracking-[0.24em] text-[#8FA0A8] uppercase">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#40C8E8] opacity-60 motion-reduce:hidden" />
                <span className="relative size-1.5 rounded-full bg-[#40C8E8]" />
              </span>
              Autonomous warehouse intelligence
            </div>
          </FadeUp>

          <RevealLines
            as="h1"
            inView={false}
            delay={0.15}
            stagger={0.1}
            className="font-display text-[clamp(3rem,6.1vw,6.75rem)] leading-[0.9] font-bold tracking-[-0.05em] text-[#F2F4F3] uppercase"
            lines={[
              "The future",
              "moves",
              <span key="t" className="bg-gradient-to-r from-[#40C8E8] to-[#B7F34A] bg-clip-text text-transparent">
                together.
              </span>,
            ]}
          />

          <FadeUp inView={false} delay={0.55}>
            <p className="mt-7 max-w-[32rem] text-[17px] leading-[1.6] text-[#B4BFC4] sm:text-lg">
              An intelligent coordination arena for autonomous warehouse fleets — one shared intelligence orchestrating every
              move, with zero collisions.
            </p>
          </FadeUp>

          <FadeUp inView={false} delay={0.7} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
            <PrimaryButton onClick={onEnterWarehouse}>Enter warehouse</PrimaryButton>
            <SecondaryButton onClick={onExplore}>Explore the system</SecondaryButton>
          </FadeUp>

          {!isWebGLSupported ? (
            <div className="mt-12 lg:hidden">
              <RobotFallback />
            </div>
          ) : null}
        </div>

        {!isWebGLSupported ? (
          <div className="hidden flex-1 justify-center lg:flex">
            <RobotFallback />
          </div>
        ) : null}
      </div>

      {/* Bottom technical strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.1 }}
        className="relative z-10 mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <DataStrip
          inView={false}
          className="hidden border-none py-0 text-[10px] sm:flex"
          cells={[
            { label: "Robot", value: "SW-01", dot: "#B7F34A" },
            { value: "Autonomous" },
            { label: "LiDAR", value: "Active", tone: "#40C8E8" },
            { label: "Battery", value: "98%", tone: "#B7F34A" },
          ]}
        />
        <button
          type="button"
          onClick={onExplore}
          className="group flex items-center gap-2 self-start rounded font-mono text-[10.5px] tracking-[0.2em] text-[#8FA0A8] uppercase transition-colors outline-none hover:text-[#F2F4F3] focus-visible:ring-2 focus-visible:ring-[#40C8E8] sm:self-auto"
        >
          Scroll to explore
          <ArrowDown className="size-3 text-[#40C8E8] transition-transform group-hover:translate-y-0.5 motion-safe:animate-bounce" />
        </button>
      </motion.div>

      {/* Layer 3 — technical HUD over the robot (desktop). Positions come from the 3D scene as CSS vars. */}
      {isWebGLSupported ? (
        <motion.div ref={hudRef} aria-hidden style={{ opacity: hudOpacity }} className="pointer-events-none fixed inset-0 z-[5] hidden lg:block">
          <HudLabel anchor="lidar" dx={120} dy={-70} delay={1.2} title="LiDAR" value="Active" tone="#40C8E8" pulse />
          {/* Below the pedestal, on open floor: never over the robot, never in the text column. */}
          <HudLabel anchor="robot" dx={-150} dy={150} delay={1.35} title="Robot ID" value="SW-01" sub="Status // Ready" tone="#F2F4F3" />
          <HudLabel anchor="base" dx={95} dy={150} delay={1.5} title="Battery" value="98%" tone="#B7F34A">
            <PositionReadout />
          </HudLabel>
        </motion.div>
      ) : null}
    </section>
  );
}

/**
 * A label connected to a point on the robot by a thin line that draws in.
 * The anchor point is (--{anchor}-x, --{anchor}-y), written by the scene.
 */
function HudLabel({
  anchor,
  dx,
  dy,
  delay,
  title,
  value,
  sub,
  tone,
  pulse,
  children,
}: {
  anchor: "robot" | "lidar" | "base";
  dx: number;
  dy: number;
  delay: number;
  title: string;
  value: string;
  sub?: string;
  tone: string;
  pulse?: boolean;
  children?: ReactNode;
}) {
  const elbow = dx * 0.35;
  return (
    <div className="absolute top-0 left-0" style={{ transform: `translate3d(var(--${anchor}-x, -999px), var(--${anchor}-y, -999px), 0)` }}>
      <span className="absolute -top-[3px] -left-[3px] size-1.5 rounded-full" style={{ backgroundColor: tone, boxShadow: `0 0 0 3px ${tone}22` }} />
      <svg className="absolute top-0 left-0 overflow-visible" width="1" height="1">
        <motion.path
          d={`M0 0 L${elbow} ${dy} L${dx - 6} ${dy}`}
          fill="none"
          stroke={tone}
          strokeOpacity={0.55}
          strokeWidth={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay, ease: EASE_OUT }}
        />
      </svg>
      <div className="absolute -translate-y-1/2" style={{ left: dx, top: dy }}>
      <motion.div
        className="font-mono text-[10.5px] leading-tight tracking-[0.16em] whitespace-nowrap uppercase"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: delay + 0.5, ease: EASE_OUT }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[#7E8C93]">{title}</span>
          <span className="text-[#5B676D]">{"//"}</span>
          <span className="flex items-center gap-1.5 font-semibold" style={{ color: tone }}>
            {pulse ? <span className="size-1.5 rounded-full motion-safe:animate-pulse" style={{ backgroundColor: tone }} /> : null}
            {value}
          </span>
        </div>
        {sub ? <div className="mt-1 text-[#8FA0A8]">{sub}</div> : null}
        {children}
      </motion.div>
      </div>
    </div>
  );
}

/** Coordinates that count up into place once, then hold. */
function PositionReadout() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xText = useTransform(x, (v) => `X-${String(Math.round(v)).padStart(3, "0")}`);
  const yText = useTransform(y, (v) => `Y-${String(Math.round(v)).padStart(3, "0")}`);
  useEffect(() => {
    const a = animate(x, 24, { duration: 1.4, delay: 2, ease: EASE_OUT });
    const b = animate(y, 18, { duration: 1.4, delay: 2.1, ease: EASE_OUT });
    return () => {
      a.stop();
      b.stop();
    };
  }, [x, y]);
  return (
    <div className="mt-1 flex items-center gap-2 text-[#8FA0A8]">
      <span>Position</span>
      <span className="text-[#5B676D]">{"//"}</span>
      <motion.span className="text-[#F2F4F3] tabular-nums">{xText}</motion.span>
      <span className="text-[#5B676D]">/</span>
      <motion.span className="text-[#F2F4F3] tabular-nums">{yText}</motion.span>
    </div>
  );
}
