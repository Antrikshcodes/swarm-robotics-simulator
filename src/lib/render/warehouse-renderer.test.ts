import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import { hitTest, screenToCell, type RenderView } from "./warehouse-renderer";

describe("render/warehouse-renderer", () => {
  const view: RenderView = {
    cell: 32,
    offsetX: 100,
    offsetY: 50,
    width: 1200,
    height: 800,
  };

  it("converts screen coordinates into grid cell coordinates", () => {
    expect(screenToCell(view, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(screenToCell(view, 131, 81)).toEqual({ x: 0, y: 0 });
    expect(screenToCell(view, 132, 82)).toEqual({ x: 1, y: 1 });
    expect(screenToCell(view, 60, 20)).toEqual({ x: -2, y: -1 });
  });

  it("prioritizes robots over stations/cells during hitTest and handles out-of-bounds", () => {
    const engine = createSimulationSource("standard");
    const snap = engine.getSnapshot();
    const r1 = snap.robots[0];
    const rScreenX = view.offsetX + (r1.position.x + 0.5) * view.cell;
    const rScreenY = view.offsetY + (r1.position.y + 0.5) * view.cell;

    expect(hitTest(snap, view, rScreenX, rScreenY, 1)).toEqual({ kind: "robot", id: r1.id });

    const st = snap.layout.stations[0];
    const stX = view.offsetX + (st.position.x + 0.5) * view.cell;
    const stY = view.offsetY + (st.position.y + 0.5) * view.cell;
    expect(hitTest(snap, view, stX, stY, 1)).toEqual({ kind: "station", id: st.id });

    expect(hitTest(snap, view, 10, 10, 1)).toBeNull();
    expect(hitTest(snap, view, view.offsetX + 5 * view.cell + 10, view.offsetY + 0 * view.cell + 10, 1)).toEqual({
      kind: "cell",
      x: 5,
      y: 0,
    });
  });
});
