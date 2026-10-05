import { test, expect } from "@playwright/test";
import { installSnapshot } from "./fixtures/career.js";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error(`Browser runtime error: ${error.stack}`),
  );
});

async function rendered(page) {
  const canvas = page.locator(".island-canvas canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await canvas.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frames")), {
      timeout: 30000,
    })
    .toBeGreaterThan(2);
  return canvas;
}

async function operations(page) {
  await page.getByRole("button", { name: /Open the business · crew/ }).click();
  const tab = page.getByRole("button", { name: "Operations", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  return page.getByRole("dialog", { name: "Live business" });
}

test("operations explains finite supplies, the shift, protected breaks and the island negotiation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  const dialog = await operations(page);
  const schedule = dialog.getByRole("region", {
    name: "Work and rest schedule",
  });
  await expect(schedule).toContainText("10-hour workday");
  await expect(schedule).toContainText("30-minute lunch");
  await expect(schedule).toContainText("two 15-minute rest breaks");
  await expect(
    dialog.getByRole("region", { name: "Supply chain" }),
  ).toContainText("prepaid founder stock");
  await expect(
    dialog.getByRole("region", { name: "Private factory island" }),
  ).toContainText("negotiates a land agreement");
  await expect(
    dialog.getByRole("button", { name: "Visit and negotiate the island" }),
  ).toBeVisible();
  const session = await page.evaluate(() =>
    fetch("/api/session").then((response) => response.json()),
  );
  expect(session.run.state.money).toBe(0);
  expect(session.run.state.cafe).toBe(0);
  expect(session.run.state.harbor).toBe(6);
  await page.screenshot({ path: "evidence/realism-operations.png" });
  expect(errors).toEqual([]);
});

test("paid shipments, construction and fermentation render from autonomous saved careers", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const name of ["shipment", "construction", "factory"]) {
    const state = await installSnapshot(context, name);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    await rendered(page);
    const dialog = await operations(page);
    if (name === "shipment") {
      await expect(
        dialog.getByRole("list", { name: "Active shipments" }),
      ).toContainText(/At sea|Scheduled/);
      expect(state.operations.importsPaid).toBeGreaterThan(0);
    } else if (name === "construction") {
      await expect(dialog.locator("[aria-current=step]")).toHaveText(
        "Lay foundations",
      );
      expect(state.construction.paid).toBeGreaterThan(0);
    } else {
      await expect(
        dialog.getByRole("region", { name: "Supply chain" }),
      ).toContainText("Brandon’s Pickle Works");
      await expect(
        dialog.getByRole("region", { name: "Pickle production" }),
      ).toContainText("Fermenting");
      expect(state.production.fermenting.length).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `evidence/realism-${name}-operations.png` });
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `evidence/realism-${name}-world.png` });
  }
  expect(errors).toEqual([]);
});

test("rocket skates and an actual puncture repair render without runtime errors", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const name of ["rocket_skates", "repair"]) {
    const state = await installSnapshot(context, name);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    const canvas = await rendered(page);
    if (name === "rocket_skates") {
      expect(state.vehicles).toContain("rocket_skates");
      await expect(canvas).toHaveAttribute(
        "data-active-vehicle",
        "rocket_skates",
      );
    } else {
      expect(state.flatTire).toBe(true);
      expect(state.brandon.action).toBe("patch");
      await expect(canvas).toHaveAttribute("data-flat-tire-phase", /\S+/);
    }
    await page.getByRole("button", { name: /Follow Brandon/ }).click();
    await page.screenshot({ path: `evidence/realism-${name}.png` });
  }
  expect(errors).toEqual([]);
});

test("moving employees and Brandon keep separate rendered footprints", async ({
  page,
  context,
}) => {
  await installSnapshot(context, "crew");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = await rendered(page);
  await expect(canvas).toHaveAttribute("data-actor-footprints", /brandon/);
  await page.evaluate(async () => {
    const { run } = await fetch("/api/session").then((response) =>
      response.json(),
    );
    await fetch(`/api/runs/${run.id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Little-Worlds": "1" },
      body: JSON.stringify({ type: "start" }),
    });
  });
  const observed = await canvas.evaluate(async (element) => {
    let frames = 0,
      maxActors = 0;
    const overlaps = [];
    while (frames++ < 120) {
      await new Promise(requestAnimationFrame);
      const actors = JSON.parse(element.dataset.actorFootprints || "[]");
      maxActors = Math.max(maxActors, actors.length);
      for (let i = 0; i < actors.length; i++) {
        for (let j = i + 1; j < actors.length; j++) {
          const a = actors[i],
            b = actors[j];
          if (Math.abs(a.position[1] - b.position[1]) > 1.3) continue;
          const distance = Math.hypot(
            a.position[0] - b.position[0],
            a.position[2] - b.position[2],
          );
          if (distance + 0.025 < a.radius + b.radius)
            overlaps.push({
              ids: [a.id, b.id],
              distance,
              required: a.radius + b.radius,
            });
        }
      }
    }
    return { maxActors, overlaps };
  });
  expect(observed.maxActors).toBeGreaterThanOrEqual(2);
  expect(observed.overlaps).toEqual([]);
  await page.screenshot({ path: "evidence/realism-courier-spacing.png" });
});

test("operations remains usable on a small screen with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  const dialog = await operations(page);
  const action = dialog.getByRole("button", {
    name: "Visit and negotiate the island",
  });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "evidence/realism-mobile-operations.png" });
});

test("workplace statistics follow the garage, office and private factory and can be pinned", async ({
  page,
  context,
}) => {
  for (const [snapshot, origin, name] of [
    [null, "home", "Home garage"],
    ["office", "cafe", "Pickle office"],
    ["factory", "farm_shop", "Pickle island factory"],
  ]) {
    if (snapshot) await installSnapshot(context, snapshot);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    const canvas = await rendered(page);
    await expect(canvas).toHaveAttribute("data-workplace-origin", origin);
    const marker = page.locator(
      `.workplace-anchor[data-workplace="${origin}"] .workplace-marker`,
    );
    const panel = page.getByRole("region", { name: `${name} statistics` });
    await marker.hover();
    await expect(panel).toBeVisible();
    const toggle = page.getByRole("button", { name: /Workplace stats/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(1, 1);
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const box = await panel.boundingBox(),
          scene = await canvas.boundingBox();
        return (
          !!box &&
          !!scene &&
          box.x >= scene.x &&
          box.x + box.width <= scene.x + scene.width &&
          box.y >= scene.y
        );
      })
      .toBe(true);
    await expect(toggle).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.screenshot({ path: `evidence/realism-workplace-${origin}.png` });
    await toggle.click();
    await page.mouse.move(1, 1);
    await expect(panel).toBeHidden();
  }
});

test("learning panel exposes a real puncture lesson and its bounded operating memory", async ({
  page,
  context,
}) => {
  const state = await installSnapshot(context, "repair");
  expect(state.learning.lessons.puncture.occurrences).toBeGreaterThan(0);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  await page.getByRole("button", { name: /Open the business · crew/ }).click();
  await page.getByRole("button", { name: "Learning", exact: true }).click();
  const panel = page.getByRole("region", { name: "Learning from experience" });
  await expect(panel).toContainText("Prepare for recurring tire trouble");
  await expect(panel).toContainText(
    "Persistent decision memory, not model retraining",
  );
  await expect(panel).toContainText("Stock buffer");
  await page.screenshot({ path: "evidence/realism-learning.png" });
});
