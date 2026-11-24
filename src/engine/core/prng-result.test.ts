import { describe, expect, it } from "vitest";
import { Prng } from "./prng";
import { err, InvariantViolation, ok } from "./result";

describe("engine/core primitives", () => {
  it("produces deterministic sequences from identical seeds", () => {
    const a = new Prng(1001);
    const b = new Prng(1001);
    const c = new Prng(2002);

    const seqA = Array.from({ length: 12 }, () => a.next());
    const seqB = Array.from({ length: 12 }, () => b.next());
    const seqC = Array.from({ length: 12 }, () => c.next());

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    for (let i = 0; i < 20; i += 1) {
      const n = a.int(7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it("constructs explicit ok/err results and InvariantViolation errors", () => {
    const good = ok({ count: 3 });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.count).toBe(3);

    const bad = err("no-path", "Route blocked");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("no-path");
      expect(bad.error.message).toBe("Route blocked");
    }

    const violation = new InvariantViolation(42, ["overlap at (1,2)", "swap"]);
    expect(violation).toBeInstanceOf(Error);
    expect(violation.name).toBe("InvariantViolation");
    expect(violation.tick).toBe(42);
    expect(violation.violations).toHaveLength(2);
    expect(violation.message).toContain("tick 42");
  });
});
