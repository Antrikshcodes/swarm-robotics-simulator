import { describe, expect, it } from "vitest";
import { MinHeap } from "./min-heap";

describe("pathfinding/min-heap", () => {
  it("pops elements in ascending comparator order", () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeUndefined();

    const inputs = [42, 7, 19, 3, 19, 0, -5, 100, 12];
    for (const v of inputs) heap.push(v);
    expect(heap.size).toBe(inputs.length);

    const out: number[] = [];
    while (heap.size > 0) {
      out.push(heap.pop()!);
    }
    expect(out).toEqual([-5, 0, 3, 7, 12, 19, 19, 42, 100]);
  });

  it("maintains stability with composite tie-breaking", () => {
    interface Item {
      readonly f: number;
      readonly id: number;
    }
    const heap = new MinHeap<Item>((a, b) => a.f - b.f || a.id - b.id);
    heap.push({ f: 10, id: 3 });
    heap.push({ f: 5, id: 2 });
    heap.push({ f: 10, id: 1 });
    heap.push({ f: 5, id: 0 });

    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([
      { f: 5, id: 0 },
      { f: 5, id: 2 },
      { f: 10, id: 1 },
      { f: 10, id: 3 },
    ]);
  });
});
