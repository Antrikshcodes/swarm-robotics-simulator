/**
 * 3D Simulation Studio performance harness.
 *
 *   npm run build && npm run perf:3d            # starts `next start` itself
 *   PERF_BASE_URL=http://127.0.0.1:3200 npm run perf:3d
 *   PERF_LABEL=before PERF_OUT=perf-before.json npm run perf:3d
 *
 * Drives the production build in Chrome (local Google Chrome if present,
 * otherwise Playwright's Chromium) and measures, per case:
 *   - frame cadence while the simulation runs (requestAnimationFrame
 *     intervals: mean FPS, mean / p95 / max frame time)
 *   - renderer counters from the 3D view's stats readout (draw calls,
 *     triangles, live geometries / textures, shader programs)
 *   - JS heap after a forced GC (Chrome's --expose-gc)
 *   - time to first 3D frame, selection response time, and resource growth
 *     across repeated 2D/3D switches and scenario loads.
 *
 * Numbers depend on the machine, GPU, browser and headless mode; the
 * harness prints the environment with the results. It never edits data.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright";

const PORT = Number(process.env.PERF_PORT || 3471);
const BASE_URL = process.env.PERF_BASE_URL || `http://127.0.0.1:${PORT}`;
const CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS || 5000);
const WARMUP_MS = 1500;
const HEADED = process.env.PERF_HEADED === "1";

const CASES = [
  { key: "small", label: "Small · Standard warehouse (5 robots)", option: /^Standard warehouse/ },
  { key: "medium", label: "Medium · Stress test 32×21 (15 robots)", option: /Stress test · 15 robots/ },
  { key: "large", label: "Large · Stress test 40×27 (32 robots)", option: /Stress test · 32 robots/ },
  { key: "dense", label: "High density · narrow aisles, heavy feed (8 robots)", option: /^High-density warehouse/ },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error(`Server not reachable at ${url}`);
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function frameStats(intervals) {
  // Drop the first interval (sampling start alignment).
  const t = intervals.slice(1).sort((a, b) => a - b);
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  return { frames: t.length, fps: round(1000 / mean), meanMs: round(mean, 2), p95Ms: round(quantile(t, 0.95), 2), maxMs: round(t[t.length - 1], 1) };
}

async function sampleFrames(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const end = last + duration;
        const tick = (now) => {
          out.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** Per-second main-thread frame cost readings from the stats readout, averaged over the window. */
async function sampleCpu(page, ms) {
  const means = [];
  const p95s = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await freshRenderer(page);
    if (r?.cpuMeanMs != null) means.push(r.cpuMeanMs);
    if (r?.cpuP95Ms != null) p95s.push(r.cpuP95Ms);
  }
  return {
    frameCpuMeanMs: means.length ? round(means.reduce((a, b) => a + b, 0) / means.length, 2) : null,
    frameCpuP95Ms: p95s.length ? round(Math.max(...p95s), 2) : null,
  };
}

async function renderer(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-perf="3d-stats"]');
    if (!el) return null;
    const n = (k) => (el.dataset[k] === undefined ? null : Number(el.dataset[k]));
    return { quality: el.dataset.quality, cpuMeanMs: n("cpuMean"), cpuP95Ms: n("cpuP95"), calls: n("calls"), triangles: n("triangles"), geometries: n("geometries"), textures: n("textures"), programs: n("programs"), readout: el.textContent };
  });
}

async function heapMB(page) {
  return page.evaluate(async () => {
    if (typeof window.gc === "function") {
      window.gc();
      await new Promise((r) => setTimeout(r, 50));
      window.gc();
    }
    const m = performance.memory;
    return m ? Math.round((m.usedJSHeapSize / 1048576) * 10) / 10 : null;
  });
}

async function chooseScenario(page, option) {
  await page.getByLabel("Scenario").first().click();
  await page.getByRole("option", { name: option }).click();
  await page.getByRole("listbox").waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector('[data-perf="3d-labels"]')?.children.length > 0, null, { polling: "raf", timeout: 15_000 });
}

async function setRunning(page, running) {
  const button = page.getByRole("button", { name: running ? /^Play$/ : /^Pause$/ });
  if (await button.count()) await button.first().click();
  await page.getByRole("button", { name: running ? /^Pause$/ : /^Play$/ }).first().waitFor();
}

/** Wait until the stats readout has refreshed (it updates once per second of rendered frames). */
async function freshRenderer(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-perf="3d-stats"]');
    if (el) delete el.dataset.calls;
  });
  await page.waitForFunction(() => document.querySelector('[data-perf="3d-stats"]')?.dataset.calls !== undefined, null, { timeout: 10_000 });
  return renderer(page);
}

/** Screen point just below a robot's floating label (the label sits above the robot). */
async function robotPoint(page, id, dy) {
  return page.evaluate(
    ({ id, dy }) => {
      const layer = document.querySelector('[data-perf="3d-labels"]');
      const el = [...(layer?.children ?? [])].find((c) => c.textContent?.startsWith(id) && c.style.display !== "none");
      if (!el || !layer) return null;
      const r = el.getBoundingClientRect();
      const box = layer.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.bottom + dy;
      // Only robots well inside the 3D view (never click page chrome around it).
      if (x < box.left + 20 || x > box.right - 20 || y < box.top + 20 || y > box.bottom - 20) return null;
      return { x, y };
    },
    { id, dy },
  );
}

/** Click a robot in the 3D view; returns ms from pointerdown to the inspector showing it, or null. */
async function clickRobot(page, id) {
  for (const dy of [22, 32, 44, 14, 58]) {
    const p = await robotPoint(page, id, dy);
    if (!p) return null;
    const timing = page.evaluate(
      (id) =>
        new Promise((resolve) => {
          const aside = document.querySelector('aside[aria-label="Inspector"]');
          let t0 = 0;
          const done = (v) => {
            observer.disconnect();
            window.removeEventListener("pointerdown", down, true);
            resolve(v);
          };
          const down = () => (t0 = performance.now());
          window.addEventListener("pointerdown", down, true);
          const check = () => {
            const text = aside?.textContent ?? "";
            if (t0 && text.includes(id) && /autonomous mobile robot/.test(text)) done(performance.now() - t0);
          };
          const observer = new MutationObserver(check);
          if (aside) observer.observe(aside, { subtree: true, childList: true, characterData: true });
          setTimeout(() => done(null), 1500);
        }),
      id,
    );
    await sleep(30);
    await page.mouse.click(p.x, p.y);
    const ms = await timing;
    if (ms !== null) return ms;
  }
  return null;
}

async function main() {
  let server = null;
  if (!process.env.PERF_BASE_URL) {
    server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
    await waitForServer(`${BASE_URL}/overview`);
  }
  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: fs.existsSync(CHROME_MAC) ? CHROME_MAC : undefined,
    args: ["--js-flags=--expose-gc", "--enable-precise-memory-info", "--ignore-gpu-blocklist"],
  });
  const results = { label: process.env.PERF_LABEL || "run", date: new Date().toISOString(), env: {}, cases: {}, stress: {} };

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    // Reset persisted preferences to defaults (3D view, labels on, routes on).
    await context.addInitScript(() => {
      if (!sessionStorage.getItem("perf-init")) {
        localStorage.clear();
        sessionStorage.setItem("perf-init", "1");
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // ---------------------------------------------------------- initial 3D load
    await page.goto(`${BASE_URL}/simulation`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-perf="3d-labels"]')?.children.length > 0, null, { polling: "raf", timeout: 20_000 });
    const firstFrameMs = await page.evaluate(() => performance.now());
    results.stress.initialLoad = { firstFrameMs: Math.round(firstFrameMs), note: "navigation start → first rendered 3D frame (labels placed), cold page, production build" };

    results.env = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        userAgent: navigator.userAgent,
        gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown",
        cores: navigator.hardwareConcurrency,
        devicePixelRatio: window.devicePixelRatio,
        viewport: `${innerWidth}×${innerHeight}`,
      };
    });
    results.env.platform = `${os.platform()} ${os.release()} ${os.arch()}`;
    results.env.cpu = os.cpus()[0]?.model;
    results.env.headless = !HEADED;
    results.env.sampleMs = SAMPLE_MS;

    // ---------------------------------------------------------- fleet sizes
    for (const c of CASES) {
      await chooseScenario(page, c.option);
      await setRunning(page, true);
      await sleep(WARMUP_MS);
      const [intervals, cpu] = await Promise.all([sampleFrames(page, SAMPLE_MS), sampleCpu(page, SAMPLE_MS)]);
      const frames = { ...frameStats(intervals), ...cpu };
      const r = await freshRenderer(page);
      await setRunning(page, false);
      const heap = await heapMB(page);
      results.cases[c.key] = { label: c.label, ...frames, ...r, heapMB: heap };
      console.log(`${c.label}: ${frames.fps} FPS, frame CPU ${frames.frameCpuMeanMs} ms (p95 ${frames.frameCpuP95Ms}), interval p95 ${frames.p95Ms} ms, ${r?.calls} calls, ${r?.triangles} tris, heap ${heap} MB`);
    }

    // ---------------------------------------------------------- selection + follow (large fleet)
    await chooseScenario(page, CASES[2].option);
    await page.getByRole("button", { name: /Step one tick/i }).click();
    await sleep(400);
    const selectTimes = [];
    const visible = [];
    for (let i = 1; i <= 32 && visible.length < 5; i += 4) {
      const id = `R-${String(i).padStart(2, "0")}`;
      if (await robotPoint(page, id, 30)) visible.push(id);
    }
    results.stress.selectionTargets = visible;
    for (const id of [...visible, ...visible]) {
      const ms = await clickRobot(page, id);
      if (ms !== null) selectTimes.push(ms);
      await page.keyboard.press("Escape");
      await sleep(120);
    }
    const sortedSel = [...selectTimes].sort((a, b) => a - b);
    // Follow a robot while running.
    let followFrames = null;
    const p = visible.length ? await robotPoint(page, visible[0], 30) : null;
    if (p) {
      await page.mouse.dblclick(p.x, p.y);
      await setRunning(page, true);
      await sleep(WARMUP_MS);
      followFrames = frameStats(await sampleFrames(page, 3000));
      await setRunning(page, false);
    }
    results.stress.selection = {
      scenario: CASES[2].label,
      attempts: visible.length * 2,
      hits: selectTimes.length,
      meanMs: selectTimes.length ? round(selectTimes.reduce((a, b) => a + b, 0) / selectTimes.length) : null,
      p95Ms: selectTimes.length ? round(quantile(sortedSel, 0.95)) : null,
      maxMs: selectTimes.length ? round(sortedSel[sortedSel.length - 1]) : null,
      followWhileRunning: followFrames,
      note: "pointerdown on a robot in the 3D view → robot inspector rendered (MutationObserver)",
    };
    console.log(`Selection: ${selectTimes.length}/${visible.length * 2} hits, mean ${results.stress.selection.meanMs} ms; follow ${followFrames?.fps} FPS`);

    // ---------------------------------------------------------- 2D ⇄ 3D switching
    await chooseScenario(page, CASES[0].option);
    await setRunning(page, true);
    await sleep(1200);
    const before3d = { ...(await freshRenderer(page)), heapMB: await heapMB(page) };
    const switchTimes = [];
    for (let i = 0; i < 10; i += 1) {
      await page.getByRole("radio", { name: /2d view/i }).click();
      await page.getByRole("application", { name: /Warehouse canvas/i }).waitFor();
      const t0 = Date.now();
      await page.getByRole("radio", { name: /3d view/i }).click();
      await page.waitForFunction(() => document.querySelector('[data-perf="3d-labels"]')?.children.length > 0, null, { polling: "raf", timeout: 15_000 });
      switchTimes.push(Date.now() - t0);
    }
    await sleep(1200);
    const after3d = { ...(await freshRenderer(page)), heapMB: await heapMB(page) };
    await setRunning(page, false);
    results.stress.viewSwitching = {
      cycles: 10,
      to3dMeanMs: round(switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length),
      to3dMaxMs: Math.max(...switchTimes),
      before: before3d,
      after: after3d,
      note: "2D → 3D click until first 3D frame; resources read while running, before and after 10 cycles",
    };
    console.log(`2D/3D: to-3D mean ${results.stress.viewSwitching.to3dMeanMs} ms; geometries ${before3d.geometries}→${after3d.geometries}, textures ${before3d.textures}→${after3d.textures}, heap ${before3d.heapMB}→${after3d.heapMB} MB`);

    // ---------------------------------------------------------- repeated scenario loads
    await setRunning(page, true);
    await sleep(1200);
    const beforeLoads = { ...(await freshRenderer(page)), heapMB: await heapMB(page) };
    await setRunning(page, false);
    const cycle = [CASES[1], CASES[3], CASES[2], CASES[0]];
    for (let i = 0; i < 3; i += 1) for (const c of cycle) await chooseScenario(page, c.option);
    await setRunning(page, true);
    await sleep(1200);
    const afterLoads = { ...(await freshRenderer(page)), heapMB: await heapMB(page) };
    await setRunning(page, false);
    results.stress.scenarioLoads = { loads: 12, before: beforeLoads, after: afterLoads, note: "Standard scenario measured before and after 3 cycles of medium → dense → large → small" };
    console.log(`Scenario loads: geometries ${beforeLoads.geometries}→${afterLoads.geometries}, textures ${beforeLoads.textures}→${afterLoads.textures}, heap ${beforeLoads.heapMB}→${afterLoads.heapMB} MB`);

    results.pageErrors = errors;
    if (errors.length) console.log(`Page errors: ${errors.length}\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    server?.kill();
  }

  const out = process.env.PERF_OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ env: results.env }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
