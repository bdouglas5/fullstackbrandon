import { test, expect } from "@playwright/test";
const sessionState = (page) =>
  page.evaluate(
    async () => (await (await fetch("/api/session")).json()).run.state,
  );

test("sidebar reputation and orders, weather toggles, and engineering overview work together", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Close introduction" }).click();
  const summary = page.getByRole("region", { name: "Business performance" });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Reputation");
  await expect(summary).toContainText("Open orders");
  await expect(summary).toContainText("Delivered");
  const initial = await sessionState(page);
  await expect(summary.locator(".snapshot-counts b").first()).toHaveText(
    String(initial.customerQueue.length),
  );
  expect(
    await summary.evaluate((el) =>
      el.previousElementSibling.classList.contains("mission-card"),
    ),
  ).toBe(true);
  await page.screenshot({ path: "evidence/sidebar-controls/main.png" });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  const controls = page.getByRole("dialog", { name: "Controls", exact: true });
  await expect(controls.getByRole("combobox")).toHaveCount(0);
  await expect(
    controls.getByRole("button", { name: /Cut the stock supply/ }),
  ).toHaveCount(0);
  const weather = controls.getByRole("button", {
    name: "Automatic weather",
    exact: true,
  });
  await expect(weather).toHaveAttribute("aria-pressed", "true");
  await weather.click();
  await expect
    .poll(async () => (await sessionState(page)).environment.weatherEnabled)
    .toBe(false);
  await weather.click();
  await expect
    .poll(async () => (await sessionState(page)).environment.weatherEnabled)
    .toBe(true);
  await page.screenshot({ path: "evidence/sidebar-controls/weather.png" });
  await controls
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Under the hood", exact: true })
    .click();
  const engineering = page.getByRole("dialog", { name: "Engineering details" });
  await expect(
    engineering.getByRole("heading", {
      name: "An entire world, engineered to work.",
    }),
  ).toBeVisible();
  await expect(engineering).toContainText("private island");
  await expect(engineering).toContainText("SQLite persistence");
  await engineering
    .locator("summary")
    .filter({ hasText: "How AI becomes action" })
    .click();
  await expect(engineering).toContainText("not model retraining");
  await engineering
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await expect(
    page
      .locator(".mission-panel")
      .getByRole("button", { name: "Achievements", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Upgrades", exact: true }).click();
  const upgrades = page.getByRole("dialog", { name: "Upgrades", exact: true });
  await expect(upgrades.locator(".console-tabs button")).toHaveText([
    "Defense",
    "Crew",
    "Gadget workshop",
    "Fleet",
  ]);
  for (const [name, selector] of [
    ["Defense", ".defense-weapons"],
    ["Crew", ".crew-grid"],
    ["Gadget workshop", ".tool-grid"],
    ["Fleet", ".fleet-grid"],
  ]) {
    await upgrades.getByRole("button", { name, exact: true }).click();
    await expect(upgrades.locator(selector)).toBeVisible();
    await expect(upgrades.locator("details")).toHaveCount(0);
  }
  await page.screenshot({ path: "evidence/sidebar-controls/upgrades.png" });
  await upgrades
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 667 });
  await expect(summary).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "evidence/sidebar-controls/mobile.png" });
  expect(errors).toEqual([]);
});
