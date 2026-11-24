import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, TICK_DURATIONS, usePreferences } from "./preferences-store";

describe("usePreferences", () => {
  beforeEach(() => {
    usePreferences.getState().resetPreferences();
  });

  it("toggles boolean overlays and updates tick duration", () => {
    const store = usePreferences.getState();
    expect(store.showGrid).toBe(true);
    store.toggle("showGrid");
    expect(usePreferences.getState().showGrid).toBe(false);

    for (const d of TICK_DURATIONS) {
      store.set("tickMs", d);
      expect(usePreferences.getState().tickMs).toBe(d);
    }

    store.set("sidebarCollapsed", true);
    expect(usePreferences.getState().sidebarCollapsed).toBe(true);

    store.resetPreferences();
    const after = usePreferences.getState();
    expect(after.showGrid).toBe(DEFAULT_PREFERENCES.showGrid);
    expect(after.tickMs).toBe(DEFAULT_PREFERENCES.tickMs);
    expect(after.sidebarCollapsed).toBe(DEFAULT_PREFERENCES.sidebarCollapsed);
  });
});
