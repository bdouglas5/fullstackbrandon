// Art-review captures from the real game cameras. Read-only: the page receives
// engine-derived fixtures held in browser memory; the saved world is untouched.
//
//   node scripts/capture-game-camera.js <label> [--motion] [--only=name,name]
//
// Writes evidence/toy-style/<label>/*.png plus a diagnostics JSON. Use the same
// label pairs (e.g. "before" / "pass-1") to compare iterations frame for frame.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { careerSnapshots } from "../tests/fixtures/career.js";
import { baseline, begin, step } from "../shared/engine.js";

const url = process.env.GAME_URL || "http://127.0.0.1:3000";
const label = process.argv[2] || "capture";
const motion = process.argv.includes("--motion");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const out = `evidence/toy-style/${label}`;
mkdirSync(out, { recursive: true });

// Cameras: "default" is the opening overview; "follow" matches the app's
// Follow framing (subject + 6,6,8); the rest are fixed review framings.
const shots = motion
  ? [{ name: "walk", fixture: "foot", camera: { follow: [4.2, 4.2, 5.6] } }]
  : [
      { name: "overview", fixture: "foot", camera: "default" },
      { name: "follow", fixture: "foot", camera: { follow: [6, 6, 8] } },
      { name: "follow-close", fixture: "foot", camera: { follow: [3.1, 3.1, 4.1] } },
      { name: "street-west", fixture: "foot", camera: { position: [-3, 7.2, 16], target: [-3, 0.4, 6] } },
      { name: "street-east", fixture: "foot", camera: { position: [15, 7.5, 9], target: [9, 0.4, 0] } },
      { name: "storefront", fixture: "foot", camera: { position: [8.6, 4.6, -3.2], target: [4, 1.1, -10] } },
      { name: "crew", fixture: "crew", camera: { follow: [6, 6, 8] } },
      { name: "night", fixture: "night", camera: "default" },
    ];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
try {
  for (const shot of shots.filter((s) => !only || only.includes(s.name))) {
    const state = structuredClone(careerSnapshots()[shot.fixture]);
    state.status = motion ? "running" : "paused";
    const run = { id: "game-camera-capture", state };
    const sequence = [structuredClone(run)];
    if (motion) {
      const simulated = structuredClone(state);
      for (let tick = 0; tick < 60; tick++) {
        if (!simulated.brandon.action)
          begin(simulated, baseline(simulated), { controller: "rules" });
        step(simulated);
        sequence.push({ id: run.id, state: structuredClone(simulated) });
      }
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      ...(motion
        ? { recordVideo: { dir: out, size: { width: 1440, height: 1000 } } }
        : {}),
    });
    await context.addInitScript(() =>
      localStorage.setItem("little-worlds:intro:v1", "seen"),
    );
    await context.route("**/api/session", (route) =>
      route.fulfill({ json: { run } }),
    );
    // Expose the live camera for exact, repeatable framing. Observation only.
    await context.route("**/src/Island.jsx*", async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const marker = "scene.add(w.world);";
      if (!source.includes(marker)) throw new Error("Capture marker changed");
      await route.fulfill({
        response,
        body: source.replace(
          marker,
          `${marker} window.__lw = { camera, controls, w, scene, controller };`,
        ),
      });
    });
    await context.addInitScript(
      ({ frames, interval }) => {
        window.EventSource = class {
          constructor() {
            let index = 0;
            this.timer = setInterval(() => {
              this.onmessage?.({
                data: JSON.stringify(frames[Math.min(index, frames.length - 1)]),
              });
              index++;
            }, interval);
          }
          close() {
            clearInterval(this.timer);
          }
        };
      },
      { frames: sequence, interval: 350 },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20,
      null,
      { timeout: 60000 },
    );
    if (motion) {
      await page.getByRole("button", { name: /Follow Brandon/ }).click();
      await page.waitForTimeout(400);
    }
    await page.addStyleTag({
      // Labels set inline visibility every frame, so remove them from layout.
      content: `.map-labels{display:none!important}
        .follow-button,.workplace-toggle,.world-top,.world-badges,
        .world-live-summary,.scene-tools,.world-bottom{visibility:hidden!important}`,
    });
    if (shot.camera !== "default")
      await page.evaluate((camera) => {
        const { camera: cam, controls, controller } = window.__lw;
        const subject = controller.current.subject;
        if (camera.follow) {
          if (!controller.current.following) {
            controls.target.copy(subject);
            cam.position.copy(subject).add({
              x: camera.follow[0],
              y: camera.follow[1],
              z: camera.follow[2],
            });
          } else {
            cam.position.copy(controls.target).add({
              x: camera.follow[0],
              y: camera.follow[1],
              z: camera.follow[2],
            });
          }
        } else {
          controls.target.set(...camera.target);
          cam.position.set(...camera.position);
        }
        controls.update();
      }, shot.camera);
    const canvas = page.locator("canvas").first();
    const frames = [];
    if (motion) {
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(260);
        const path = `${out}/${shot.name}-${String(i).padStart(2, "0")}.png`;
        await canvas.screenshot({ path });
        frames.push(path);
      }
    } else {
      await page.waitForTimeout(1600);
      await canvas.screenshot({ path: `${out}/${shot.name}.png` });
    }
    const diagnostics = await page.evaluate(() => {
      const d = document.querySelector("canvas").dataset;
      return {
        drawCalls: Number(d.drawCalls),
        triangles: Number(d.triangles),
        renderFrames: Number(d.renderFrames),
        cameraDistance: Number(d.cameraDistance),
      };
    });
    await context.close();
    report.push({ shot: shot.name, errors, frames, ...diagnostics });
    console.log(JSON.stringify(report.at(-1)));
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/diagnostics.json`, JSON.stringify(report, null, 2));
}
