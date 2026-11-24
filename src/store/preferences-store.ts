"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type StudioView = "3d" | "2d";

export const TICK_DURATIONS = [250, 400, 600, 1000] as const;
export type TickDuration = (typeof TICK_DURATIONS)[number];

export interface Preferences {
  sidebarCollapsed: boolean;
  showGrid: boolean;
  showCoordinates: boolean;
  showRoutes: boolean;
  showLabels: boolean;
  showReservations: boolean;
  showWaitLinks: boolean;
  /** Animate robots between ticks. Always off when the OS asks for reduced motion. */
  interpolateMotion: boolean;
  /** Wall-clock duration of one tick at 1× speed. */
  tickMs: TickDuration;
  /** Simulation Studio view: the 3D warehouse (default) or the 2D diagnostic grid. */
  studioView: StudioView;
  /** 3D: cut racks down to their first level so robots in narrow aisles stay visible. */
  rackCutaway: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  sidebarCollapsed: false,
  showGrid: true,
  showCoordinates: true,
  showRoutes: true,
  showLabels: true,
  showReservations: true,
  showWaitLinks: true,
  interpolateMotion: true,
  tickMs: 400,
  studioView: "3d",
  rackCutaway: false,
};

interface PreferencesState extends Preferences {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  toggle: (key: BooleanPreference) => void;
  resetPreferences: () => void;
}

export type BooleanPreference = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      set: (key, value) => set({ [key]: value } as Pick<Preferences, typeof key>),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Pick<Preferences, typeof key>),
      resetPreferences: () => set({ ...DEFAULT_PREFERENCES }),
    }),
    {
      name: "swarm.preferences.v1",
      storage: createJSONStorage(() => localStorage),
      // Hydrate after mount (see PreferencesHydrator) so server and first
      // client render always agree.
      skipHydration: true,
      partialize: (s): Preferences => ({
        sidebarCollapsed: s.sidebarCollapsed,
        showGrid: s.showGrid,
        showCoordinates: s.showCoordinates,
        showRoutes: s.showRoutes,
        showLabels: s.showLabels,
        showReservations: s.showReservations,
        showWaitLinks: s.showWaitLinks,
        interpolateMotion: s.interpolateMotion,
        tickMs: s.tickMs,
        studioView: s.studioView,
        rackCutaway: s.rackCutaway,
      }),
    },
  ),
);
