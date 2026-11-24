/**
 * Rendering quality tiers for the landing-page 3D scene.
 *
 * Chosen once on mount from coarse device signals; the scene never changes
 * tier while running (that would mean rebuilding render targets mid-scroll).
 */
export type SceneQuality = "high" | "standard" | "low";

export interface QualitySettings {
  readonly tier: SceneQuality;
  /** Upper bound for renderer pixel ratio. */
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  /** Shadow map size, or 0 for no shadows. */
  readonly shadowMapSize: number;
  /** Frame budget: 1 = every display frame, 2 = every other frame. */
  readonly frameSkip: number;
  /** Animate the secondary fleet robots. */
  readonly fleet: boolean;
}

const SETTINGS: Record<SceneQuality, QualitySettings> = {
  high: { tier: "high", maxPixelRatio: 1.75, antialias: true, shadowMapSize: 1024, frameSkip: 1, fleet: true },
  standard: { tier: "standard", maxPixelRatio: 1.25, antialias: true, shadowMapSize: 512, frameSkip: 1, fleet: true },
  low: { tier: "low", maxPixelRatio: 1, antialias: false, shadowMapSize: 0, frameSkip: 2, fleet: false },
};

export function detectSceneQuality(): QualitySettings {
  if (typeof window === "undefined") return SETTINGS.standard;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse || narrow || cores <= 4 || memory <= 4) return SETTINGS.low;
  if (cores >= 8 && memory >= 8) return SETTINGS.high;
  return SETTINGS.standard;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Where the robot sits on screen, as a fraction of the viewport the camera
 * projection is shifted by (setViewOffset). Desktop: robot centred near 70 %
 * of the width, clear of the left text column. Mobile: centred horizontally
 * and pushed down below the stacked text.
 */
export function framingFor(width: number, height: number): { shiftX: number; shiftY: number; distanceScale: number } {
  const aspect = width / height;
  // Desktop / wide laptop: text left, robot right.
  if (width >= 1024 && aspect >= 1.15) return { shiftX: 0.2, shiftY: 0.03, distanceScale: 1.32 };
  // Landscape tablet / small laptop: same composition, robot a little smaller.
  if (width >= 768 && aspect >= 1) return { shiftX: 0.16, shiftY: 0.06, distanceScale: 1.5 };
  // Portrait tablet: robot centred below the stacked text and CTAs.
  if (width >= 600) return { shiftX: 0, shiftY: 0.27, distanceScale: 1.75 };
  // Phone: smaller robot near the bottom; text above it sits on a scrim.
  return { shiftX: 0, shiftY: 0.35, distanceScale: 2.4 };
}
