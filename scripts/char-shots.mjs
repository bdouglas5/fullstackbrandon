// Character frames from the real game cameras (observation only).
//   GAME_URL=http://127.0.0.1:3500 node scripts/char-shots.mjs <label> [name,name]
// Writes shots/<label>/<name>.png.  Cameras match the game: follow = subject +
// (6,6,8) ~11.7u away, close = (3.1,3.1,4.1) ~5.9u (the zoom-in limit).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { careerSnapshots } from "../tests/fixtures/career.js";

const url = process.env.GAME_URL || "http://127.0.0.1:3500";
const label = process.argv[2] || "after";
const only = process.argv[3]?.split(",");
const out = `shots/${label}`;
mkdirSync(out, { recursive: true });

// `aim` picks what the camera follows; `cam` is the offset from it.
const shots = [
  { name: "brandon-follow", fixture: "foot", aim: "brandon", cam: [6, 6, 8] },
  { name: "brandon-close", fixture: "foot", aim: "brandon", cam: [3.1, 3.1, 4.1] },
  { name: "brandon-front", fixture: "foot", aim: "brandon", cam: [-2.2, 1.6, 4.4] },
  { name: "ped-close", fixture: "foot", aim: "ped:0", cam: [3.1, 3.1, 4.1] },
  { name: "ped-front", fixture: "foot", aim: "ped:3", cam: [-1.8, 1.3, 3.6] },
  { name: "customer-close", fixture: "foot", aim: "customer:0", cam: [3.1, 3.1, 4.1] },
  { name: "crew-close", fixture: "crew", aim: "crew:0", cam: [3.1, 3.1, 4.1] },
  { name: "crew-follow", fixture: "crew", aim: "crew:0", cam: [6, 6, 8] },
  { name: "builders", fixture: "construction", aim: "builder:0", cam: [3.4, 3.2, 4.3] },
  { name: "overview", fixture: "foot", aim: "default", cam: "default" },
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
    const state = structuredClone(snapshots[shot.fixture]);
    state.status = "paused";
    const run = { id: "char-shots", state };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
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
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on(
      "console",
      (m) => m.type() === "error" && !/403|404|Forbidden|favicon/.test(m.text()) && errors.push(m.text().slice(0, 600)),
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.renderFrames) > 20, null, {
      timeout: 120000,
    });
    await page.addStyleTag({
      content: `.map-labels{display:none!important}
        .follow-button,.workplace-toggle,.world-top,.world-badges,.world-live-summary,.scene-tools,.world-bottom{visibility:hidden!important}`,
    });
    if (shot.cam !== "default") {
      // Let idle/blend state settle, then aim at the chosen character.
      await page.waitForTimeout(800);
      const aimed = await page.evaluate(
        ({ aim, cam }) => {
          const { camera, controls, controller, w } = window.__lw;
          const [kind, index = "0"] = aim.split(":");
          let p;
          if (kind === "brandon") p = controller.current.subject.clone();
          else if (kind === "ped") p = w.pedestrians[Number(index)].position.clone();
          else if (kind === "customer") p = w.customers[Number(index)].getWorldPosition(controls.target.clone());
          else if (kind === "builder") p = w.realism.builders[Number(index)].getWorldPosition(controls.target.clone());
          else if (kind === "crew") {
            const rigs = [...w.crewActors.values()];
            p = rigs[Number(index)]?.group.getWorldPosition(controls.target.clone());
          }
          if (!p) return null;
          p.y += 0.45;
          controls.target.copy(p);
          camera.position.set(p.x + cam[0], p.y + cam[1], p.z + cam[2]);
          controls.update();
          return p.toArray();
        },
        shot,
      );
      if (!aimed) console.log("no target for", shot.name);
    }
    await page.waitForTimeout(1500);
    await page.locator("canvas").first().screenshot({ path: `${out}/${shot.name}.png` });
    const d = await page.evaluate(() => ({ ...document.querySelector("canvas").dataset }));
    report.push({ shot: shot.name, drawCalls: d.drawCalls, triangles: d.triangles, crew: d.crewTransports, errors: errors.slice(0, 3) });
    console.log(JSON.stringify(report.at(-1)));
    await context.close();
  }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
