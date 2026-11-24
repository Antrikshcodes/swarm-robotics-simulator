"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/** Framer Motion honours the OS reduced-motion setting everywhere. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
