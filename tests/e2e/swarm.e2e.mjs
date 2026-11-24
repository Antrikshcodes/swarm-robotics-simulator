import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.E2E_PORT || 3467);
const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;
const CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ROUTES = [
  "/",
  "/overview",
  "/simulation",
  "/demo",
  "/fleet",
  "/missions",
  "/incidents",
  "/analytics",
  "/settings",
];

async function waitForServer(url, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Next.js server at ${url}`);
}

function launchOptions() {
  const opts = {
    headless: true,
    args: ["--no-sandbox", "--disable-gpu-sandbox"],
  };
  if (fs.existsSync(CHROME_MAC)) {
    opts.executablePath = CHROME_MAC;
  }
  return opts;
}

async function runSuite() {
  let serverProc = null;
  if (!process.env.E2E_BASE_URL) {
    serverProc = spawn("npx", ["next", "start", "-p", String(PORT)], {
      stdio: "ignore",
      env: { ...process.env, PORT: String(PORT) },
    });
    await waitForServer(`${BASE_URL}/overview`);
  }

  const browser = await chromium.launch(launchOptions());
  const errors = [];

  try {
    // ------------------------------------------------------------------ 1. Route & Responsive Smoke
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await desktopCtx.newPage();
    dPage.on("pageerror", (e) => errors.push(`desktop pageerror: ${e.message}`));
    dPage.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`desktop console.error: ${msg.text()}`);
    });

    for (const route of ROUTES) {
      const res = await dPage.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      assert.equal(res?.status(), 200, `Expected 200 on ${route}`);
      const overflow = await dPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      assert.equal(overflow, false, `Unexpected horizontal overflow on desktop ${route}`);
    }
    console.log(`✓ Desktop routes (${ROUTES.length}/${ROUTES.length}) verified`);

    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mPage = await mobileCtx.newPage();
    mPage.on("pageerror", (e) => errors.push(`mobile pageerror: ${e.message}`));
    mPage.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`mobile console.error: ${msg.text()}`);
    });

    for (const route of ROUTES) {
      const res = await mPage.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      assert.equal(res?.status(), 200, `Expected 200 on mobile ${route}`);
      const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      assert.equal(overflow, false, `Unexpected horizontal overflow on mobile ${route}`);
    }
    await mobileCtx.close();
    console.log(`✓ Mobile routes (${ROUTES.length}/${ROUTES.length}) verified`);

    // ------------------------------------------------------------------ 2. Simulation Studio Playback, Scenarios & Inspector
    await dPage.goto(`${BASE_URL}/simulation`, { waitUntil: "networkidle" });
    await dPage.getByRole("button", { name: /Step one tick/i }).click();
    await dPage.getByRole("button", { name: /Step one tick/i }).click();
    await dPage.getByText("T+0002").first().waitFor();

    // Switch to Deadlock Lab B and advance past confirmTicks (4 ticks)
    await dPage.getByLabel("Scenario").click();
    await dPage.getByRole("option", { name: /Lab B/i }).click();
    for (let i = 0; i < 7; i += 1) {
      await dPage.getByRole("button", { name: /Step one tick/i }).click();
    }
    await dPage.getByText(/DL-0001/i).first().waitFor();
    console.log("✓ Simulation Studio step, scenario switch & deadlock detection verified");

    // ------------------------------------------------------------------ 3. Robot Fault Injection, Restore & Incidents
    await dPage.locator('nav a[href="/fleet"]').click();
    await dPage.getByRole("button", { name: /inspect/i }).first().click();
    await dPage.getByRole("button", { name: /Fail robot/i }).click();
    await dPage.getByRole("menuitem", { name: /Motor failure/i }).click();
    await dPage.getByRole("button", { name: /^Restore$/i }).waitFor();
    await dPage.getByRole("button", { name: /^Restore$/i }).click();
    await dPage.getByRole("button", { name: "Restoring…", exact: true }).waitFor();
    console.log("✓ Robot fault injection and restore workflow verified");

    // ------------------------------------------------------------------ 3b. Incidents & Settings
    await dPage.locator('nav a[href="/incidents"]').click();
    await dPage.getByText("Incident queue").waitFor();
    await dPage.locator('nav a[href="/settings"]').click();
    await dPage.getByRole("button", { name: /Restore defaults/i }).waitFor();
    console.log("✓ Incidents console and Settings panel verified");

    // ------------------------------------------------------------------ 4. Mission Creation & Cancellation (Standard scenario)
    await dPage.locator('nav a[href="/simulation"]').click();
    await dPage.getByLabel("Scenario").click();
    await dPage.getByRole("option", { name: /Standard warehouse/i }).click();
    for (let i = 0; i < 6; i += 1) {
      await dPage.getByRole("button", { name: /Step one tick/i }).click();
    }
    await dPage.locator('nav a[href="/missions"]').click();
    await dPage.getByRole("button", { name: /Queue mission/i }).click();
    await dPage.getByText(/M-\d+/).first().waitFor();
    console.log("✓ Mission board queue verified");

    // ------------------------------------------------------------------ 5. Analytics: Explainable Robot Timeline + Cross-Scenario Run Archive
    await dPage.locator('nav a[href="/analytics"]').click();
    await dPage.getByText("Explainable robot timeline").waitFor();
    await dPage.getByText("Cross-scenario run comparison").waitFor();
    await dPage.getByLabel("Inspect robot timeline").selectOption("R-01");
    await dPage.getByRole("button", { name: /Save snapshot/i }).click();
    await dPage.getByText(/RUN-\d+/).first().waitFor();
    console.log("✓ Analytics robot timeline & cross-scenario run archive verified");

    // ------------------------------------------------------------------ 6. Judge Demo Mode
    await dPage.locator('nav a[href="/demo"]').click();
    await dPage.getByRole("button", { name: /^Run$/i }).first().click();
    await dPage.waitForTimeout(800);
    await dPage.getByRole("button", { name: /Pause demo/i }).click();
    console.log("✓ Judge Demo Mode launch & pause verified");

    assert.equal(errors.length, 0, `Browser errors detected:\n${errors.join("\n")}`);
    console.log("✓ Zero console/page errors across entire E2E suite");
    await desktopCtx.close();
  } finally {
    await browser.close();
    if (serverProc) {
      serverProc.kill("SIGTERM");
    }
  }
}

runSuite().catch((err) => {
  console.error("E2E suite failed:", err);
  process.exit(1);
});
