"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Motion-based building blocks for the landing page. They replace the
 * frosted "glass" cards with typography, thin dividers and data strips.
 * All animations are transform/opacity only and run once when in view.
 */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Masked line-by-line reveal: each line slides up from behind its own clip.
 * The in-view trigger sits on the (unclipped) heading itself — a line that
 * starts translated outside its mask never intersects, so it can't trigger.
 */
export function RevealLines({
  lines,
  as = "h2",
  className,
  lineClassName,
  delay = 0,
  stagger = 0.09,
  inView = true,
}: {
  lines: readonly ReactNode[];
  as?: "h1" | "h2" | "h3";
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
  /** Reveal when scrolled into view (sections) or immediately on mount (hero). */
  inView?: boolean;
}) {
  const Tag = as === "h1" ? motion.h1 : as === "h3" ? motion.h3 : motion.h2;
  const trigger = inView
    ? { initial: "hidden", whileInView: "shown", viewport: { once: true, margin: "-10% 0px" } }
    : { initial: "hidden", animate: "shown" };
  return (
    <Tag className={className} {...trigger} variants={{ hidden: {}, shown: { transition: { delayChildren: delay, staggerChildren: stagger } } }}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.06em]">
          <motion.span
            className={cn("block will-change-transform", lineClassName)}
            variants={{
              hidden: { y: "108%", opacity: 0 },
              shown: { y: "0%", opacity: 1, transition: { duration: 0.9, ease: EASE_OUT } },
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Subtle fade-up for body copy. */
export function FadeUp({ children, delay = 0, className, inView = true }: { children: ReactNode; delay?: number; className?: string; inView?: boolean }) {
  const trigger = inView ? { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-10% 0px" } } : { animate: { opacity: 1, y: 0 } };
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} transition={{ duration: 0.8, delay, ease: EASE_OUT }} className={className} {...trigger}>
      {children}
    </motion.div>
  );
}

/** Scene eyebrow: index, a drawn rule and a label. */
export function Eyebrow({ index, label, className }: { index: string; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 font-mono text-[10.5px] tracking-[0.22em] text-[#8FA0A8] uppercase", className)}>
      <span className="text-[#40C8E8]">{index}</span>
      <motion.span
        aria-hidden
        className="h-px w-10 origin-left bg-[#40C8E8]/60"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      />
      <span>{label}</span>
    </div>
  );
}

/** Standard section header: eyebrow, masked headline, supporting paragraph. */
export function SectionHeader({ index, label, title, children }: { index: string; label: string; title: readonly ReactNode[]; children?: ReactNode }) {
  return (
    <header className="mb-12 max-w-xl">
      <Eyebrow index={index} label={label} className="mb-5" />
      <RevealLines
        lines={title}
        className="font-display text-[clamp(2.25rem,4.4vw,4rem)] leading-[0.95] font-bold tracking-[-0.04em] text-[#F2F4F3] uppercase"
      />
      {children ? (
        <FadeUp delay={0.25} className="mt-5 text-base leading-[1.65] text-[#A9B5BB] sm:text-[17px]">
          {children}
        </FadeUp>
      ) : null}
    </header>
  );
}

export interface SpecItem {
  readonly index: string;
  readonly title: string;
  readonly body: string;
  /** Optional emphasised value (e.g. a metric). */
  readonly value?: string;
  readonly accent?: string;
  readonly tag?: string;
}

/**
 * Numbered specification list: open columns separated by thin rules that
 * draw in on reveal. No boxes, no blur.
 */
export function SpecList({ items, columns = 2, className }: { items: readonly SpecItem[]; columns?: 1 | 2 | 4; className?: string }) {
  return (
    <ol
      className={cn(
        "grid gap-x-10 gap-y-8",
        columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item, i) => (
        <motion.li
          key={item.index}
          className="group relative pt-4"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-8% 0px" }}
          transition={{ duration: 0.7, delay: i * 0.07, ease: EASE_OUT }}
        >
          <motion.span
            aria-hidden
            className="absolute top-0 left-0 h-px w-full origin-left bg-white/[0.14]"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: EASE_OUT }}
          />
          <span
            aria-hidden
            className="absolute top-0 left-0 h-px w-8 bg-current transition-[width] duration-500 ease-out group-hover:w-full"
            style={{ color: item.accent ?? "#40C8E8" }}
          />
          <div className="mb-2 flex items-baseline justify-between gap-3 font-mono text-[10.5px] tracking-[0.16em] text-[#8FA0A8] uppercase">
            <span>{item.index}</span>
            {item.tag ? <span style={{ color: item.accent ?? "#40C8E8" }}>{item.tag}</span> : null}
          </div>
          {item.value ? (
            <div className="font-display mb-1 text-2xl font-bold tracking-[-0.02em]" style={{ color: item.accent ?? "#F2F4F3" }}>
              {item.value}
            </div>
          ) : null}
          <h3 className="font-mono text-[12.5px] font-semibold tracking-[0.06em] text-[#F2F4F3] uppercase">{item.title}</h3>
          <p className="mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-[#9AA7AD]">{item.body}</p>
        </motion.li>
      ))}
    </ol>
  );
}

export interface StripCell {
  readonly label?: string;
  readonly value: string;
  /** Status dot colour. */
  readonly dot?: string;
  readonly tone?: string;
}

/** Horizontal industrial data strip: `ROBOT SW-01 | AUTONOMOUS | LIDAR ACTIVE`. */
export function DataStrip({ cells, className, inView = true }: { cells: readonly StripCell[]; className?: string; inView?: boolean }) {
  const trigger = inView ? { whileInView: { opacity: 1 }, viewport: { once: true } } : { animate: { opacity: 1 } };
  return (
    <motion.dl
      initial={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: EASE_OUT }}
      className={cn("relative flex flex-wrap items-center gap-y-2 border-y border-white/[0.09] py-3 font-mono text-[10.5px] tracking-[0.16em] uppercase", className)}
      {...trigger}
    >
      {cells.map((cell, i) => (
        <div key={i} className="flex items-center gap-2 pr-4 [&:not(:last-child)]:mr-4 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-white/[0.12]">
          {cell.dot ? (
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ backgroundColor: cell.dot }} />
              <span className="relative size-1.5 rounded-full" style={{ backgroundColor: cell.dot }} />
            </span>
          ) : null}
          {cell.label ? <dt className="text-[#7E8C93]">{cell.label}</dt> : null}
          <dd className="text-[#E3E8EA]" style={cell.tone ? { color: cell.tone } : undefined}>
            {cell.value}
          </dd>
        </div>
      ))}
    </motion.dl>
  );
}

/** Primary call to action: thin cyan frame, a sweep on hover, arrow nudge, clear focus ring. */
export function PrimaryButton({ children, onClick, disabled, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-md border border-[#40C8E8]/55 bg-[#40C8E8]/[0.08] px-6 font-mono text-[12px] font-semibold tracking-[0.14em] text-[#F2F4F3] uppercase transition-[border-color,background-color,color] duration-300 ease-out outline-none hover:border-[#40C8E8] hover:bg-[#40C8E8]/[0.14] focus-visible:ring-2 focus-visible:ring-[#40C8E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080B0D] disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {/* Border sweep */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-[#B7F34A] transition-transform duration-500 ease-out group-hover:scale-x-100" />
      <span className="relative">{children}</span>
      <ArrowRight className="relative size-4 text-[#40C8E8] transition-transform duration-300 ease-out group-hover:translate-x-1" />
    </button>
  );
}

/** Secondary call to action: text with a drawn underline and a downward arrow nudge. */
export function SecondaryButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative inline-flex h-12 items-center gap-2.5 rounded-md px-2 font-mono text-[12px] font-semibold tracking-[0.14em] text-[#C9D2D6] uppercase transition-colors duration-300 outline-none hover:text-[#F2F4F3] focus-visible:ring-2 focus-visible:ring-[#40C8E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080B0D]",
        className,
      )}
    >
      <span className="relative">
        {children}
        <span aria-hidden className="absolute -bottom-1 left-0 h-px w-full origin-right scale-x-0 bg-[#40C8E8] transition-transform duration-500 ease-out group-hover:origin-left group-hover:scale-x-100" />
      </span>
      <ArrowDown className="size-3.5 text-[#40C8E8] transition-transform duration-300 ease-out group-hover:translate-y-0.5" />
    </button>
  );
}

/**
 * A scroll scene: content in the left column (≈46 % on desktop) so it never
 * sits on top of the robot, with a contrast falloff behind it. On small
 * screens the content spans the width over a darker scrim.
 */
export function SceneSection({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("relative flex min-h-dvh w-full flex-col justify-center border-t border-white/[0.06] px-6 py-28 md:px-12 lg:px-20", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#080B0D]/80 lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-[#080B0D]/92 via-[#080B0D]/65 to-transparent lg:block" />
      <div className="relative z-10 w-full max-w-2xl lg:w-[46%] lg:max-w-none">{children}</div>
    </section>
  );
}
