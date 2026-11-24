"use client";

import { create } from "zustand";
import type { EntitySelection } from "@/types/simulation";
import { selectionKey } from "@/lib/inspection";

/**
 * What the pointer is over in the 3D view. Written by the pick handlers,
 * read imperatively by the hover highlight, cursor and readout — so moving
 * the pointer never re-renders React components.
 */
interface Hover3DState {
  target: EntitySelection | null;
  key: string;
  setTarget: (target: EntitySelection | null) => void;
}

export const useHover3D = create<Hover3DState>()((set, get) => ({
  target: null,
  key: "none",
  setTarget: (target) => {
    const key = selectionKey(target);
    if (key !== get().key) set({ target, key });
  },
}));
