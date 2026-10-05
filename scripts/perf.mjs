// A/B frame-rate probe: uncapped rAF, counts rendered frames for N seconds.
import { chromium } from "@playwright/test";
import { careerSnapshots } from "../tests/fixtures/career.js";
const [,, port, weather = "clear", cam = "default", seconds = "6"] = process.argv;
const state = structuredClone(careerSnapshots().foot);
state.status = "paused";
state.world = { ...state.world, hour: 12, phase: "day", light: 1, weather };
state.storm = weather === "storm";
const run = { id: "perf", state };
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem("little-worlds:intro:v1", "seen"));
await context.route("**/api/session", (r) => r.fulfill({ json: { run } }));
await context.route("**/src/Island.jsx*", async (route) => {
  const res = await route.fetch(); const src = await res.text();
  await route.fulfill({ response: res, body: src.replace("scene.add(w.world);", "scene.add(w.world); window.__lw = { camera, controls, w, scene, controller, renderer };") });
});
await context.addInitScript(({ frame }) => { window.EventSource = class { constructor() { this.t = setInterval(() => this.onmessage?.({ data: JSON.stringify(frame) }), 350); } close() { clearInterval(this.t); } }; }, { frame: run });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20, null, { timeout: 90000 });
if (cam !== "default") {
  const [px, py, pz, tx, ty, tz] = cam.split(",").map(Number);
  await page.evaluate(([px, py, pz, tx, ty, tz]) => { const { camera, controls } = window.__lw; controls.target.set(tx, ty, tz); camera.position.set(px, py, pz); controls.update(); }, [px, py, pz, tx, ty, tz]);
}
await page.waitForTimeout(4000); // let weather settle
const f0 = await page.evaluate(() => Number(document.querySelector("canvas").dataset.renderFrames));
const t0 = Date.now();
await page.waitForTimeout(+seconds * 1000);
const f1 = await page.evaluate(() => Number(document.querySelector("canvas").dataset.renderFrames));
const dt = (Date.now() - t0) / 1000;
console.log(JSON.stringify({ port, weather, cam, fps: +((f1 - f0) / dt).toFixed(1) }));
await browser.close();
