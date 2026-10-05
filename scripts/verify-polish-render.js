// Read-only visual QA: engine snapshots stay in browser memory. This script
// never sends a command to, or writes a fixture into, the user's saved world.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync, renameSync } from "node:fs";
import { careerSnapshots } from "../tests/fixtures/career.js";
import { baseline, begin, step } from "../shared/engine.js";

const url = process.env.GAME_URL || "http://127.0.0.1:3000";
const moving = process.argv.includes("--motion");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const reports = [];
const environment =
  "Local installed Chrome with hardware graphics when available. Engine-derived browser-only fixtures; user's saved world unchanged. Short samples are not sustained real-device performance guarantees.";

async function observePixels(canvas) {
  const png = await canvas.screenshot();
  return canvas.evaluate(async (_, data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const scratch = document.createElement("canvas");
    scratch.width = 120;
    scratch.height = 100;
    const context = scratch.getContext("2d");
    context.drawImage(image, 0, 0, 120, 100);
    const pixels = context.getImageData(0, 0, 120, 100).data;
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4)
      if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 32)
        visible++;
    return visible / (pixels.length / 4);
  }, png.toString("base64"));
}

const scenarios = moving
  ? [["night-bike-motion", "bike", false, true]]
  : [
      ["day", "foot", false, false],
      ["night", "night", false, false],
      ["mobile-night", "night", true, false],
      ...["bike", "van", "sailboat", "helicopter", "jetpack", "teleporter"].map(
        (mode) => [mode, mode, false, true],
      ),
    ];

try {
  mkdirSync("evidence/polish-videos", { recursive: true });
  for (const [name, fixture, reduced, close] of scenarios) {
    const state = structuredClone(careerSnapshots()[fixture]);
    state.status = moving ? "running" : "paused";
    const run = { id: "polish-render-only", state };
    const context = await browser.newContext({
      viewport: reduced
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      reducedMotion: reduced ? "reduce" : "no-preference",
      ...(moving
        ? {
            recordVideo: {
              dir: "evidence/polish-videos",
              size: { width: 1280, height: 900 },
            },
          }
        : {}),
    });
    await context.addInitScript(() =>
      localStorage.setItem("little-worlds:intro:v1", "seen"),
    );
    await context.route("**/api/session", (route) =>
      route.fulfill({ json: { run } }),
    );
    const sequence = [structuredClone(run)];
    if (moving) {
      const simulated = structuredClone(state);
      for (let tick = 0; tick < 70; tick++) {
        if (!simulated.brandon.action)
          begin(simulated, baseline(simulated), { controller: "rules" });
        step(simulated);
        sequence.push({ id: run.id, state: structuredClone(simulated) });
      }
      // Add observation only. The production animation functions are untouched.
      await context.route("**/src/Island.jsx*", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const marker =
          'renderer.domElement.dataset.animationStyle = "expressive";';
        if (!source.includes(marker))
          throw new Error("Animation audit marker changed");
        const body = source.replace(
          marker,
          `${marker}
          renderer.domElement.dataset.auditPose = JSON.stringify({
            riderLeft: w.rider.getObjectByName("left leg")?.rotation.x,
            riderRight: w.rider.getObjectByName("right leg")?.rotation.x,
            wheel: w.bikeWheels[0]?.rotation.x,
            roll: w.bike.rotation.z,
            moving: motion.moving,
            position: motion.position.toArray()
          });`,
        );
        await route.fulfill({ response, body });
      });
    }
    // A browser-only event source keeps the app connected to the supplied
    // fixture. Running snapshots are advanced by the real engine above.
    await context.addInitScript(
      ({ frames, interval }) => {
        window.EventSource = class {
          constructor() {
            let index = 0;
            this.timer = setInterval(() => {
              this.onmessage?.({
                data: JSON.stringify(
                  frames[Math.min(index, frames.length - 1)],
                ),
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
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Number(document.querySelector("canvas")?.dataset.renderFrames) > 25,
    );
    const canvas = page.locator("canvas").first();
    if (close) {
      await page.getByRole("button", { name: /Follow Brandon/ }).click();
      const bounds = await canvas.boundingBox();
      await page.mouse.move(
        bounds.x + bounds.width * 0.55,
        bounds.y + bounds.height * 0.5,
      );
      await page.mouse.wheel(0, moving ? -100 : -350);
    }
    const report = await page.evaluate(
      async (duration) => {
        const canvas = document.querySelector("canvas");
        const started = performance.now();
        const first = Number(canvas.dataset.renderFrames);
        const poses = [];
        do {
          if (canvas.dataset.auditPose)
            poses.push(JSON.parse(canvas.dataset.auditPose));
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (performance.now() - started < duration);
        const gl = canvas.getContext("webgl2");
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          renderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : "unknown",
          frames: Number(canvas.dataset.renderFrames) - first,
          durationMs: performance.now() - started,
          viewport: [innerWidth, innerHeight],
          overflow: document.documentElement.scrollWidth > innerWidth,
          diagnostics: { ...canvas.dataset },
          poses,
        };
      },
      moving ? 9500 : 2000,
    );
    const visibleFraction = await observePixels(canvas);
    await page.screenshot({ path: `evidence/polish-verified-${name}.png` });
    const video = page.video();
    await context.close();
    if (video)
      renameSync(await video.path(), `evidence/polish-videos/${name}.webm`);
    const result = { name, errors, visibleFraction, ...report };
    reports.push(result);
    console.log(
      JSON.stringify({
        name,
        errors,
        frames: report.frames,
        visibleFraction,
        drawCalls: report.diagnostics.drawCalls,
        poseSamples: report.poses.length,
      }),
    );
    if (errors.length || visibleFraction < 0.25 || report.overflow)
      process.exitCode = 1;
    if (moving) {
      const range = (key) =>
        Math.max(...report.poses.map((pose) => pose[key])) -
        Math.min(...report.poses.map((pose) => pose[key]));
      const displacement = report.poses.length
        ? Math.hypot(
            ...report.poses
              .at(-1)
              .position.map(
                (value, index) => value - report.poses[0].position[index],
              ),
          )
        : 0;
      result.motion = {
        leftLegRange: range("riderLeft"),
        rightLegRange: range("riderRight"),
        wheelRotation: range("wheel"),
        rollRange: range("roll"),
        displacement,
      };
      console.log(JSON.stringify(result.motion));
      if (
        !report.poses.some((pose) => pose.moving) ||
        result.motion.leftLegRange < 0.2 ||
        result.motion.wheelRotation < 1 ||
        displacement < 1
      )
        process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
  writeFileSync(
    moving
      ? "evidence/polish-verified-motion.json"
      : "evidence/polish-verified-hardware.json",
    JSON.stringify({ environment, reports }, null, 2),
  );
}
