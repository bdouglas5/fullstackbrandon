// Quick sandbox screenshot at a game camera with a chosen fixture and hour.
import { chromium } from "@playwright/test";
import { careerSnapshots } from "../tests/fixtures/career.js";
const [,, out, fixture = "foot", cam = "default", hour = "", weather = "", w = "1440", h = "1000", wait = "1800"] = process.argv;
const state = structuredClone(careerSnapshots()[fixture]);
state.status = "paused";
if (hour) { state.world = { ...state.world, hour: +hour, phase: +hour >= 7 && +hour < 18 ? "day" : +hour >= 18 && +hour < 20 ? "dusk" : +hour >= 5 && +hour < 7 ? "dawn" : "night", light: +hour >= 7 && +hour < 18 ? 1 : +hour >= 5 && +hour < 7 ? 0.13 + ((+hour - 5) / 2) * 0.87 : +hour >= 18 && +hour < 20 ? 1 - ((+hour - 18) / 2) * 0.87 : 0.13 }; }
if (weather) { state.world.weather = weather; state.storm = weather === "storm"; }
const run = { id: "sandbox-shot", state };
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem("little-worlds:intro:v1", "seen"));
await context.route("**/api/session", (route) => route.fulfill({ json: { run } }));
await context.route("**/src/Island.jsx*", async (route) => {
  const response = await route.fetch();
  const source = await response.text();
  await route.fulfill({ response, body: source.replace("scene.add(w.world);", "scene.add(w.world); window.__lw = { camera, controls, w, scene, controller, renderer };") });
});
await context.addInitScript(({ frame }) => {
  window.EventSource = class { constructor() { this.t = setInterval(() => this.onmessage?.({ data: JSON.stringify(frame) }), 350); } close() { clearInterval(this.t); } };
}, { frame: run });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !/403|Forbidden|favicon/.test(m.text()) && errors.push(m.text().slice(0, 1500)));
await page.goto(process.env.GAME_URL || "http://127.0.0.1:3600", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20, null, { timeout: 90000 });
await page.addStyleTag({ content: `.map-labels{display:none!important} .follow-button,.workplace-toggle,.world-top,.world-badges,.world-live-summary,.scene-tools,.world-bottom{visibility:hidden!important}` });
if (cam !== "default") {
  const [px, py, pz, tx, ty, tz] = cam.split(",").map(Number);
  const follow = cam.split(",").length === 3;
  await page.evaluate(([px, py, pz, tx, ty, tz, follow]) => {
    const { camera, controls, controller } = window.__lw;
    if (follow) { const s = controller.current.subject; controls.target.copy(s); camera.position.copy(s).add({ x: px, y: py, z: pz }); }
    else { controls.target.set(tx, ty, tz); camera.position.set(px, py, pz); }
    controls.update();
  }, [px, py, pz, tx || 0, ty || 0, tz || 0, follow]);
}
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
await page.waitForTimeout(+wait);
await page.locator("canvas").first().screenshot({ path: out });
const d = await page.evaluate(() => ({ ...document.querySelector("canvas").dataset }));
console.log(JSON.stringify({ drawCalls: d.drawCalls, triangles: d.triangles, frameInterval: d.frameInterval, sun: d.sunElevation, wet: d.wetness, detailed: d.detailedFigurines }));
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 6).join("\n---\n"));
await browser.close();
