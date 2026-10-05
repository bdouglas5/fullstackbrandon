import { test, expect } from "@playwright/test";
import {
  ACHIEVEMENTS,
  BRANCHES,
  updateAchievements,
} from "../shared/achievements.js";
import { fresh, begin, baseline, step, command } from "../shared/engine.js";
import { installState, installSnapshot } from "./fixtures/career.js";

test("icon tree pans by mouse and keyboard, reveals hover details, and fits mobile", async ({
  page,
  context,
}) => {
  await installState(context, fresh());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Achievements", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Achievements",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", { name: /Achievements/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Up next", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Full tree", exact: true }),
  ).toHaveCount(0);
  expect(await dialog.locator(".achievement-node").count()).toBeLessThan(80);
  await expect(
    dialog.locator(".achievement-node.is-hidden").first(),
  ).toContainText("???");
  await expect(dialog).not.toContainText("Delivery legend");
  const viewport = dialog.locator(".achievement-viewport"),
    world = dialog.locator(".achievement-world");
  const initial = await world.getAttribute("data-camera");
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 130, box.y + box.height - 140, {
    steps: 8,
  });
  await expect(viewport).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(world).not.toHaveAttribute("data-camera", initial);
  expect(
    await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop]),
  ).toEqual([0, 0]);
  await expect(dialog.getByRole("tooltip")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Center achievement tree" }).click();
  const first = dialog.locator('[data-achievement="orders-1"]');
  await first.hover();
  await expect(dialog.getByRole("tooltip")).toContainText("1 order delivered");
  await expect(first.locator("svg")).toHaveCount(1);
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(dialog.getByRole("tooltip")).toContainText("First handoff");
  const nodeBox = await first.boundingBox();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2 - 65, nodeBox.y + 65, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(0, 0);
  await expect(dialog.getByRole("tooltip")).toHaveCount(0);
  await viewport.focus();
  const beforeKey = await world.getAttribute("data-camera");
  await page.keyboard.press("ArrowDown");
  await expect(world).not.toHaveAttribute("data-camera", beforeKey);
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(world).toHaveAttribute("data-camera", /1.15$/);
  const mouseX = Math.round(box.x + box.width * 0.65);
  const mouseY = Math.round(box.y + box.height * 0.45);
  const anchorX = mouseX - box.x,
    anchorY = mouseY - box.y;
  const readCamera = async () =>
    (await world.getAttribute("data-camera")).split(",").map(Number);
  const beforeWheel = await readCamera();
  await page.mouse.move(mouseX, mouseY);
  await page.mouse.wheel(0, -160);
  await expect
    .poll(async () => (await readCamera())[2])
    .toBeGreaterThan(beforeWheel[2]);
  const afterWheel = await readCamera();
  expect(
    Math.abs(
      (anchorX - beforeWheel[0]) / beforeWheel[2] -
        (anchorX - afterWheel[0]) / afterWheel[2],
    ),
  ).toBeLessThan(0.01);
  expect(
    Math.abs(
      (anchorY - beforeWheel[1]) / beforeWheel[2] -
        (anchorY - afterWheel[1]) / afterWheel[2],
    ),
  ).toBeLessThan(0.01);
  await page.mouse.wheel(0, 10000);
  await expect.poll(async () => (await readCamera())[2]).toBeLessThan(0.5);
  const fitted = await readCamera();
  const bounds = await world.evaluate((el) => ({
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height),
  }));
  expect(fitted[0]).toBeGreaterThanOrEqual(0);
  expect(fitted[1]).toBeGreaterThanOrEqual(0);
  expect(fitted[0] + bounds.width * fitted[2]).toBeLessThanOrEqual(
    box.width + 0.01,
  );
  expect(fitted[1] + bounds.height * fitted[2]).toBeLessThanOrEqual(
    box.height + 0.01,
  );
  await expect(dialog.locator(".achievement-node")).toHaveCount(88);
  await dialog.getByRole("button", { name: "Center achievement tree" }).click();
  const panelBox = await dialog.boundingBox();
  expect(box.height / panelBox.height).toBeGreaterThan(0.6);

  for (const [, title] of BRANCHES) {
    await dialog
      .locator(".achievement-map-shortcuts")
      .getByRole("button", { name: title, exact: true })
      .click();
    await expect(
      dialog.locator(".achievement-node.is-hub").filter({ hasText: title }),
    ).toBeVisible();
  }
  await dialog.getByRole("button", { name: "Center achievement tree" }).click();
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(viewport).toBeVisible();
  await dialog.getByRole("button", { name: "Center achievement tree" }).click();
  await expect(first).toBeInViewport();
  const mobileBox = await viewport.boundingBox();
  const centered = await first.boundingBox();
  expect(
    Math.abs(
      centered.x + centered.width / 2 - mobileBox.x - mobileBox.width / 2,
    ),
  ).toBeLessThan(2);
  const beforeTouch = await world.getAttribute("data-camera");
  const touch = await context.newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: mobileBox.x + 30, y: mobileBox.y + mobileBox.height - 30 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: mobileBox.x + 85, y: mobileBox.y + mobileBox.height - 100 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(world).not.toHaveAttribute("data-camera", beforeTouch);
  await touch.detach();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Achievements", exact: true }),
  ).toBeFocused();
});
test("real progress shows a banner, opens the tree and does not replay on reload", async ({
  page,
  context,
}) => {
  const s = fresh(42, "rules");
  command(s, "start");
  while (s.served < 9 && s.tick < 10000) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  expect(s.served).toBe(9);
  await installState(context, s);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume simulation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".achievement-banner")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Resume simulation", exact: true })
    .click();
  await expect(page.locator(".achievement-banner")).toBeVisible({
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.screenshot({ path: "evidence/achievement-banner.png" });
  await page.locator(".achievement-banner-content").click();
  await expect(
    page.getByRole("dialog", { name: "Achievements", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Achievements", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".achievement-banner")).toHaveCount(0);
});
test("completed autonomous career earns retirement and all live conditions", async ({
  page,
  context,
}) => {
  await installSnapshot(context, "retired");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Achievements", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Achievements",
    exact: true,
  });
  await dialog.locator(".achievement-earned-list summary").click();
  await dialog
    .locator(".achievement-earned-list")
    .getByRole("button", { name: /Home, at last/ })
    .click();
  await expect(dialog.getByRole("tooltip")).toContainText("Home, at last");
  await page.screenshot({ path: "evidence/achievements-retired.png" });
});

test("batched unlocks queue, dismiss once, and stay silent during replay", async ({
  page,
}) => {
  const initial = fresh();
  initial.status = "paused";
  initial.tick = 20;
  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {
        window.achievementTestStream = this;
      }
      close() {}
    };
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: { run: { id: "achievement-test", state: initial } },
    }),
  );
  await page.route("**/api/runs/achievement-test/history", (route) =>
    route.fulfill({ json: [{ tick: 20, state: initial }] }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume simulation", exact: true }),
  ).toBeVisible();
  const advanced = structuredClone(initial);
  advanced.tick = 21;
  advanced.achievements.unlocked = {
    "orders-1": { tick: 21 },
    "tool-repair_kit": { tick: 21 },
  };
  const emit = (state) =>
    page.evaluate(
      (s) =>
        window.achievementTestStream.onmessage({
          data: JSON.stringify({ id: "achievement-test", state: s }),
        }),
      state,
    );
  await emit(advanced);
  await expect(page.locator(".achievement-banner")).toContainText(
    "First handoff",
  );
  await expect(page.locator(".achievement-banner")).toContainText("+1 queued");
  await page
    .getByRole("button", { name: "Dismiss achievement", exact: true })
    .click();
  await expect(page.locator(".achievement-banner")).toContainText(
    "Jar-crate repair kit",
  );
  await emit(advanced);
  await page.locator(".achievement-banner-content").click();
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await expect(page.locator(".achievement-banner")).toHaveCount(0, {
    timeout: 10000,
  });
  await emit(advanced);
  await expect(page.locator(".achievement-banner")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rewind & replay", exact: true })
    .click();
  advanced.achievements.unlocked["orders-10"] = { tick: 22 };
  await emit(advanced);
  await expect(page.locator(".achievement-banner")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Achievements", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Achievements", exact: true }),
  ).toContainText("Replay moment");
});

test("collection carries through a new seed and reload while this run starts empty", async ({
  page,
  context,
}) => {
  const s = fresh(42);
  s.served = 50;
  updateAchievements(s);
  await installState(context, s);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Achievements", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Achievements",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", { name: /Achievements/ }),
  ).toContainText("4 / 80");
  await dialog.getByRole("button", { name: "New business ↗" }).click();
  await expect(dialog.locator(".achievement-footer")).toContainText("Seed 43");
  await expect(
    dialog.getByRole("heading", { name: /Achievements/ }),
  ).toContainText("4 / 80");
  await dialog.locator('[data-achievement="orders-1"]').hover();
  await expect(dialog.getByRole("tooltip")).toContainText(
    "Collected in an earlier run",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Achievements", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: /Achievements/ }),
  ).toContainText("4 / 80");
  await expect(dialog.locator(".achievement-footer")).toContainText("Seed 43");
});
