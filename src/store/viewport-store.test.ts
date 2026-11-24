import { beforeEach, describe, expect, it } from "vitest";
import { BASE_CELL_PX, useViewportStore } from "./viewport-store";

describe("useViewportStore", () => {
  beforeEach(() => {
    useViewportStore.setState({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      viewportWidth: 800,
      viewportHeight: 600,
      gridWidth: 28,
      gridHeight: 18,
      tool: "select",
      autoFit: true,
    });
  });

  it("fits grid to viewport and centres coordinates", () => {
    const store = useViewportStore.getState();
    store.fitToView();
    const after = useViewportStore.getState();
    expect(after.autoFit).toBe(true);
    expect(after.scale).toBeGreaterThan(0.25);
    expect(after.scale).toBeLessThanOrEqual(4);

    store.centerOn(5, 5);
    const centered = useViewportStore.getState();
    expect(centered.autoFit).toBe(false);
    const cell = BASE_CELL_PX * centered.scale;
    expect(centered.offsetX).toBe(Math.round(800 / 2 - 5.5 * cell));
    expect(centered.offsetY).toBe(Math.round(600 / 2 - 5.5 * cell));
  });

  it("clamps zoom scale between 0.25 and 4 and supports panning", () => {
    const store = useViewportStore.getState();
    store.zoomBy(100);
    expect(useViewportStore.getState().scale).toBe(4);
    store.zoomBy(0.001);
    expect(useViewportStore.getState().scale).toBe(0.25);

    const beforeX = useViewportStore.getState().offsetX;
    store.panBy(42, -18);
    expect(useViewportStore.getState().offsetX).toBe(beforeX + 42);
    expect(useViewportStore.getState().autoFit).toBe(false);

    store.resetZoom();
    expect(useViewportStore.getState().scale).toBe(1);
    store.setTool("pan");
    expect(useViewportStore.getState().tool).toBe("pan");
  });
});
