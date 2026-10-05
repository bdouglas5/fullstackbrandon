// A strip of real game-camera frames following one character over time.
//   GAME_URL=http://127.0.0.1:3500 node scripts/game-strip.mjs <label> <aim> [frames=10] [gapMs=240] [cam=3.1,3.1,4.1] [fixture=foot]
// aim: ped:3 | customer:2 | brandon | crew:0.  Writes shots/<label>/strip-<aim>-NN.png
// (the canvas centre stays on the subject), plus strip-<aim>.png as one sheet.
// Walkers and shopkeepers animate on the render clock, so a paused game shows
// them moving. Brandon is shown paused unless fixture runs him.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { careerSnapshots } from "../tests/fixtures/career.js";

const url = process.env.GAME_URL || "http://127.0.0.1:3500";
const [, , label = "strip", aim = "ped:0", framesArg = "10", gapArg = "240", camArg = "3.1,3.1,4.1", fixture = "foot"] = process.argv;
const frames = +framesArg,
  gap = +gapArg;
const cam = camArg.split(",").map(Number);
const out = `shots/${label}`;
mkdirSync(out, { recursive: true });
const state = structuredClone(careerSnapshots()[fixture]);
state.status = "paused";
const run = { id: "game-strip", state };
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem("little-worlds:intro:v1", "seen"));
await context.route("**/api/session", (route) => route.fulfill({ json: { run } }));
await context.route("**/src/Island.jsx*", async (route) => {
  const response = await route.fetch();
  const source = await response.text();
  await route.fulfill({
    response,
    body: source.replace(
      "scene.add(w.world);",
      "scene.add(w.world); window.__lw = { camera, controls, w, scene, controller, renderer };",
    ),
  });
});
await context.addInitScript(
  ({ frame }) => {
    window.EventSource = class {
      constructor() {
        this.t = setInterval(() => this.onmessage?.({ data: JSON.stringify(frame) }), 350);
      }
      close() {
        clearInterval(this.t);
      }
    };
  },
  { frame: run },
);
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20, null, { timeout: 120000 });
await page.addStyleTag({
  content: `.map-labels{display:none!important}.follow-button,.workplace-toggle,.world-top,.world-badges,.world-live-summary,.scene-tools,.world-bottom{visibility:hidden!important}`,
});
const files = [];
for (let i = 0; i < frames; i++) {
  await page.evaluate(
    ({ aim, cam }) => {
      const { camera, controls, controller, w } = window.__lw;
      const [kind, index = "0"] = aim.split(":");
      let p;
      if (kind === "brandon") p = controller.current.subject.clone();
      else if (kind === "ped") p = w.pedestrians[+index].position.clone();
      else if (kind === "customer") p = w.customers[+index].getWorldPosition(controls.target.clone());
      else if (kind === "builder") p = w.realism.builders[+index].getWorldPosition(controls.target.clone());
      else if (kind === "crew") p = [...w.crewActors.values()][+index].group.getWorldPosition(controls.target.clone());
      p.y += 0.4;
      controls.target.copy(p);
      camera.position.set(p.x + cam[0], p.y + cam[1], p.z + cam[2]);
      controls.update();
    },
    { aim, cam },
  );
  await page.waitForTimeout(gap);
  const file = `${out}/strip-${aim.replace(":", "")}-${String(i).padStart(2, "0")}.png`;
  await page.locator("canvas").first().screenshot({ path: file });
  files.push(file);
}
await browser.close();
execFileSync("node", ["scripts/sheet.mjs", `${out}/strip-${aim.replace(":", "")}.png`, String(Math.min(frames, 5)), "320", "300", ...files], { stdio: "inherit" });
console.log("wrote", `${out}/strip-${aim.replace(":", "")}.png`);
