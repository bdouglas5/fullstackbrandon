import { test, expect } from "@playwright/test";
import { careerSnapshots, installSnapshot } from "./fixtures/career.js";

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function rendered(page) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect(canvas).toHaveAttribute("data-animation-style", "expressive");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frames")))
    .toBeGreaterThan(2);
  return canvas;
}

async function diagnostics(canvas) {
  return canvas.evaluate((element) => {
    const d = element.dataset;
    return {
      frames: Number(d.renderFrames),
      fixtures: Number(d.lightSources),
      localLights: Number(d.localLights),
      night: Number(d.nightStrength),
      glowPoints: Number(d.glowPoints),
      bloom: Number(d.bloomStrength),
      secondaryMotion: Number(d.secondaryMotionCount),
      distance: Number(d.cameraDistance),
      position: JSON.parse(d.position),
      drawCalls: Number(d.drawCalls),
      triangles: Number(d.triangles),
    };
  });
}

function expectHealthyScene(value) {
  for (const field of [
    "frames",
    "fixtures",
    "localLights",
    "night",
    "glowPoints",
    "bloom",
    "secondaryMotion",
    "distance",
    "drawCalls",
    "triangles",
  ])
    expect(Number.isFinite(value[field]), `${field} must be finite`).toBe(true);
  expect(value.position).toHaveLength(3);
  expect(value.position.every(Number.isFinite)).toBe(true);
  expect(value.fixtures).toBeGreaterThan(20);
  expect(value.localLights).toBe(6);
  expect(value.glowPoints).toBeGreaterThan(20);
  expect(value.secondaryMotion).toBeGreaterThan(0);
  expect(value.distance).toBeGreaterThanOrEqual(6);
  expect(value.drawCalls).toBeGreaterThan(0);
  expect(value.triangles).toBeGreaterThan(0);
}

async function expectVisibleScene(canvas) {
  // A shader can produce NaNs that bloom spreads across the entire frame while
  // render counters and WebGL error logs remain healthy. Inspect real pixels.
  const screenshot = await canvas.screenshot();
  const visibleFraction = await canvas.evaluate(async (_, png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const scratch = document.createElement("canvas");
    scratch.width = 120;
    scratch.height = 100;
    const context = scratch.getContext("2d");
    context.drawImage(image, 0, 0, scratch.width, scratch.height);
    const pixels = context.getImageData(
      0,
      0,
      scratch.width,
      scratch.height,
    ).data;
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4)
      if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 32)
        visible++;
    return visible / (pixels.length / 4);
  }, screenshot.toString("base64"));
  expect(
    visibleFraction,
    "scene must contain more than floating UI over black",
  ).toBeGreaterThan(0.25);
}

test("daytime keeps the miniature crisp while its decorative lighting stays subtle", async ({
  page,
  context,
}) => {
  const errors = watchErrors(page);
  await installSnapshot(context, "foot");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = await rendered(page);
  await expect(canvas).toHaveAttribute("data-world-phase", "day");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-night-strength")))
    .toBeLessThan(0.1);
  const day = await diagnostics(canvas);
  expectHealthyScene(day);
  await expectVisibleScene(canvas);
  await page.screenshot({ path: "evidence/polish-day-overview.png" });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frames")))
    .toBeGreaterThan(day.frames + 2);
  expect(errors).toEqual([]);
});

test("night fixtures illuminate the town with bloom at overview and close zoom", async ({
  page,
  context,
}) => {
  const errors = watchErrors(page);
  await installSnapshot(context, "night");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = await rendered(page);
  await expect(canvas).toHaveAttribute("data-world-phase", "night");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-night-strength")))
    .toBeGreaterThan(0.8);
  const night = await diagnostics(canvas);
  expectHealthyScene(night);
  await expectVisibleScene(canvas);
  expect(night.bloom).toBeGreaterThan(0);
  await page.screenshot({ path: "evidence/polish-night-overview.png" });
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-distance")))
    .toBeLessThan(20);
  await page.screenshot({ path: "evidence/polish-night-close.png" });
  await expect(canvas).toHaveAttribute("data-tilt-shift", "always-on");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frames")))
    .toBeGreaterThan(night.frames + 2);
  expect(errors).toEqual([]);
});

test("reduced motion preserves night lighting and a stable paused actor", async ({
  page,
  context,
}) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await installSnapshot(context, "night");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = await rendered(page);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-night-strength")))
    .toBeGreaterThan(0.8);
  const first = await diagnostics(canvas);
  expectHealthyScene(first);
  await expect(canvas).toHaveAttribute("data-reduced-motion", "true");
  await expect(canvas).toHaveAttribute("data-secondary-motion-phase", "0");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frames")))
    .toBeGreaterThan(first.frames + 5);
  const later = await diagnostics(canvas);
  expect(later.position).toEqual(first.position);
  expect(later.distance).toBe(first.distance);
  await expect(canvas).toHaveAttribute("data-secondary-motion-phase", "0");
  expect(later.bloom).toBeGreaterThan(0);
  await expectVisibleScene(canvas);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "evidence/polish-night-reduced-motion-mobile.png",
  });
  expect(errors).toEqual([]);
});

test("storm at night retains legible lights and a healthy render loop", async ({
  page,
  context,
}) => {
  const errors = watchErrors(page);
  const source = careerSnapshots().night;
  const original = { storm: source.storm, weather: source.world.weather };
  try {
    // Only the isolated browser-test fixture changes; the user's saved world
    // and the simulation's natural day/night clock are never touched.
    source.storm = true;
    source.world.weather = "storm";
    await installSnapshot(context, "night");
  } finally {
    source.storm = original.storm;
    source.world.weather = original.weather;
  }
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = await rendered(page);
  await expect(canvas).toHaveAttribute("data-weather", "storm");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-rain-intensity")))
    .toBeGreaterThan(0.6);
  const storm = await diagnostics(canvas);
  expectHealthyScene(storm);
  expect(storm.night).toBeGreaterThan(0.8);
  expect(storm.bloom).toBeGreaterThan(0);
  await expectVisibleScene(canvas);
  await page.screenshot({ path: "evidence/polish-night-storm.png" });
  expect(errors).toEqual([]);
});
