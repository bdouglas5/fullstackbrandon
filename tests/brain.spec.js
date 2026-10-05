import { test, expect } from "@playwright/test";

// The full 3D world is visually checked in the live browser. These tests
// isolate decision UI and real server events from headless GPU performance.
test.beforeEach(async ({ page }) => {
  await page.route("**/assets/Island-*.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export default function Island() { return null; }",
    }),
  );
  await page.route("**/models/*.glb", (route) => route.abort());
});

test("live brain shows actual decisions, history, continuing world and keyboard close", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Brandon’s brain" }).click();
  const brain = page.getByRole("region", { name: "Brandon’s live brain" });
  await expect(brain).toBeVisible();
  await expect(
    brain.getByText("Ready to begin", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await expect(brain.locator(".brain-result h4")).not.toHaveText(
    "A world of possibilities",
  );
  await expect(brain.locator(".brain-option").first()).toBeVisible();
  const snapshot = await page.evaluate(() =>
    fetch("/api/session").then((r) => r.json()),
  );
  const decision = snapshot.run.state.decisions.at(-1);
  expect(decision.trace.options.length).toBeGreaterThan(0);
  await expect(brain.locator(".brain-result h4")).toHaveText(decision.label);
  await expect(brain.locator(".brain-result")).toContainText(decision.reason);
  await expect(brain).toContainText(
    decision.controller === "jev" ? "JEV CHOSE" : "RULES CONTROLLER CHOSE",
  );
  await page.getByRole("button", { name: "8×", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => fetch("/api/session").then((r) => r.json())))
          .run.state.decisions.length,
      { timeout: 30000 },
    )
    .toBeGreaterThan(1);
  await brain.locator(".brain-timeline button").last().click();
  await expect(brain).toContainText("Recorded decision");
  const tick = (
    await page.evaluate(() => fetch("/api/session").then((r) => r.json()))
  ).run.state.tick;
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => fetch("/api/session").then((r) => r.json())))
          .run.state.tick,
    )
    .toBeGreaterThan(tick);
  await brain.getByRole("button", { name: "Follow live" }).click();
  await expect(brain).toContainText("Acting on a decision");
  await page.screenshot({ path: "evidence/brain-ui-desktop.png" });
  await brain.getByRole("button", { name: "Close brain" }).focus();
  await page.keyboard.press("Escape");
  await expect(brain).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Brandon’s brain" }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test("mobile brain fits the world and respects reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Brandon’s brain" }).click();
  const brain = page.locator("#brandon-brain");
  await expect(brain).toBeVisible();
  const box = await brain.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(
    await page
      .locator(".brain-tree")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.screenshot({ path: "evidence/brain-ui-mobile.png" });
  await page.getByRole("button", { name: "Close brain" }).click();
  await expect(brain).not.toBeVisible();
});
