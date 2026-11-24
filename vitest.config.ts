import { configDefaults, defineConfig } from "vitest/config";

// Performance benchmarks (*.perf.test.ts) only run via `npm run bench`.
const bench = process.env.SWARM_BENCH === "1";

export default defineConfig({
  test: {
    include: bench ? ["src/**/*.perf.test.ts"] : ["src/**/*.test.ts"],
    exclude: bench ? configDefaults.exclude : [...configDefaults.exclude, "src/**/*.perf.test.ts"],
  },
});
