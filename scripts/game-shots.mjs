// Real-game-camera frames for every vehicle fixture, one browser, one label.
//   GAME_URL=http://127.0.0.1:3300 node scripts/game-shots.mjs <label> [name,name]
// Writes shots/<label>/<name>.png. Cameras: follow (6,6,8 from the subject),
// close (3.1,3.1,4.1) and the opening overview. Observation only.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { careerSnapshots } from "../tests/fixtures/career.js";

const url = process.env.GAME_URL || "http://127.0.0.1:3300";
const label = process.argv[2] || "after";
const only = process.argv[3]?.split(",");
const out = `shots/${label}`;
mkdirSync(out, { recursive: true });

const MODES = [
  "bike",
  "van",
  "rocket_skates",
  "sailboat",
  "helicopter",
  "jetpack",
  "teleporter",
];
const extra = (process.env.CAMS || "")
  .split(";")
  .filter(Boolean)
  .map((c) => {
    const [name, fixture, ...v] = c
      .split(":")
      .flatMap((x, i) => (i < 2 ? [x] : x.split(",")));
    return { name, fixture, cam: v.map(Number) };
  });
const shots = [
  ...extra,
  { name: "foot-overview", fixture: "foot", cam: "default" },
  { name: "foot-follow", fixture: "foot", cam: [6, 6, 8] },
  ...MODES.flatMap((m) => [
    { name: `${m}-follow`, fixture: m, cam: [6, 6, 8] },
    { name: `${m}-close`, fixture: m, cam: [3.1, 3.1, 4.1] },
  ]),
  { name: "crew", fixture: "crew", cam: [6, 6, 8] },
  {
    name: "workshop",
    fixture: "foot",
    cam: { position: [8.6, 5.2, 2.2], target: [3.9, 0.8, 5] },
  },
];

const snapshots = careerSnapshots();
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = [];
try {
  for (const shot of shots.filter((s) => !only || only.includes(s.name))) {
    const state = structuredClone(snapshots[shot.fixture] || snapshots.foot);
    if (!snapshots[shot.fixture]) {
      console.log("no fixture", shot.fixture);
      continue;
    }
    state.status = "paused";
    if (shot.name === "workshop")
      state.tools = Object.fromEntries(
        [
          "repair_kit",
          "cargo_rack",
          "cooler",
          "rain_gear",
          "solar_panel",
          "cargo_dolly",
          "navigation",
          "scanner",
          "generator",
          "winch",
        ].map((id) => [id, true]),
      );
    const run = { id: "game-shots", state };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() =>
      localStorage.setItem("little-worlds:intro:v1", "seen"),
    );
    await context.route("**/api/session", (route) =>
      route.fulfill({ json: { run } }),
    );
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
            this.t = setInterval(
              () => this.onmessage?.({ data: JSON.stringify(frame) }),
              350,
            );
          }
          close() {
            clearInterval(this.t);
          }
        };
      },
      { frame: run },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on(
      "console",
      (m) =>
        m.type() === "error" &&
        !/403|404|Forbidden|favicon/.test(m.text()) &&
        errors.push(m.text().slice(0, 600)),
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20,
      null,
      { timeout: 120000 },
    );
    await page.addStyleTag({
      content: `.map-labels{display:none!important}
        .follow-button,.workplace-toggle,.world-top,.world-badges,.world-live-summary,.scene-tools,.world-bottom{visibility:hidden!important}`,
    });
    if (shot.cam !== "default")
      await page.evaluate((cam) => {
        const { camera, controls, controller } = window.__lw;
        if (Array.isArray(cam)) {
          const s = controller.current.subject;
          controls.target.copy(s);
          camera.position.copy(s).add({ x: cam[0], y: cam[1], z: cam[2] });
        } else {
          controls.target.set(...cam.target);
          camera.position.set(...cam.position);
        }
        controls.update();
      }, shot.cam);
    await page.waitForTimeout(1800);
    await page
      .locator("canvas")
      .first()
      .screenshot({ path: `${out}/${shot.name}.png` });
    const d = await page.evaluate(() => ({
      ...document.querySelector("canvas").dataset,
    }));
    report.push({
      shot: shot.name,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      errors: errors.slice(0, 3),
    });
    console.log(JSON.stringify(report.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
}
