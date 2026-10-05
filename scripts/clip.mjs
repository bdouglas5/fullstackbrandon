// Motion clip at a game camera: node scripts/clip.mjs <out.webm> <fixture> <cam> <hour> <weather> [seconds]
import { chromium } from "@playwright/test";
import { careerSnapshots } from "../tests/fixtures/career.js";
import { mkdirSync, renameSync } from "node:fs";
const [,, out, fixture = "foot", cam = "default", hour = "12", weather = "", seconds = "8"] = process.argv;
const state = structuredClone(careerSnapshots()[fixture]);
state.status = "paused";
const h = +hour;
state.world = { ...state.world, hour: h, phase: h >= 7 && h < 18 ? "day" : h >= 18 && h < 20 ? "dusk" : "night", light: h >= 7 && h < 18 ? 1 : 0.13 };
if (weather) { state.world.weather = weather; state.storm = weather === "storm"; }
const run = { id: "clip", state };
mkdirSync("evidence/dbg/vid", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1, recordVideo: { dir: "evidence/dbg/vid", size: { width: 1100, height: 760 } } });
await context.addInitScript(() => localStorage.setItem("little-worlds:intro:v1", "seen"));
await context.route("**/api/session", (r) => r.fulfill({ json: { run } }));
await context.route("**/src/Island.jsx*", async (route) => {
  const res = await route.fetch(); const src = await res.text();
  await route.fulfill({ response: res, body: src.replace("scene.add(w.world);", "scene.add(w.world); window.__lw = { camera, controls, w, scene, controller, renderer };") });
});
await context.addInitScript(({ frame }) => { window.EventSource = class { constructor() { this.t = setInterval(() => this.onmessage?.({ data: JSON.stringify(frame) }), 350); } close() { clearInterval(this.t); } }; }, { frame: run });
const page = await context.newPage();
await page.goto(process.env.GAME_URL || "http://127.0.0.1:3600", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20, null, { timeout: 90000 });
await page.addStyleTag({ content: `.map-labels{display:none!important} .follow-button,.workplace-toggle,.world-top,.world-badges,.world-live-summary,.scene-tools,.world-bottom,.scene-card,.world-live{visibility:hidden!important}` });
if (cam !== "default") {
  const [px, py, pz, tx, ty, tz] = cam.split(",").map(Number);
  await page.evaluate(([px, py, pz, tx, ty, tz]) => { const { camera, controls } = window.__lw; controls.target.set(tx, ty, tz); camera.position.set(px, py, pz); controls.update(); }, [px, py, pz, tx, ty, tz]);
}
await page.waitForTimeout(+seconds * 1000);
const video = page.video();
await context.close();
renameSync(await video.path(), out);
await browser.close();
console.log("saved", out);
