import { test, expect } from "@playwright/test";
async function saved(page) {
  return page.evaluate(async () => {
    const name = `little-worlds-visit-${sessionStorage.getItem("little-worlds-visit")}`;
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction("worlds").objectStore("worlds").getAll();
        request.onsuccess = () => {
          resolve(request.result);
          db.close();
        };
        request.onerror = () => reject(request.error);
      };
    });
  });
}
test.describe.serial("desktop portfolio visit", () => {
  let page, before;
  const requests = [],
    errors = [];
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      baseURL: "http://127.0.0.1:4200",
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: process.env.CI ? 0.5 : 1,
    });
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(error.message));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });
  test("visitor plays, changes weather and pauses without server calls", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const intro = page.getByRole("dialog", {
      name: "Fullstack Brandon",
      exact: true,
    });
    await expect(intro).toContainText("Rules guide the next move.");
    await intro
      .getByRole("button", { name: "Start the simulation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause simulation", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await saved(page))[0]?.state.tick, { timeout: 30000 })
      .toBeGreaterThan(8);
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    const controls = page.getByRole("dialog", {
      name: "Controls",
      exact: true,
    });
    await controls
      .getByRole("button", { name: "Clear weather", exact: true })
      .click();
    await expect
      .poll(
        async () => (await saved(page))[0]?.state.environment.weatherOverride,
      )
      .toBe("clear");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Pause simulation", exact: true })
      .click();
    await expect
      .poll(async () => (await saved(page))[0]?.state.status)
      .toBe("paused");
    before = (await saved(page))[0];
    expect(requests.filter((url) => /\/api\/|typesafe/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });
  test("refresh keeps the paused visit and allows replay and export", async () => {
    const intro = page.getByRole("dialog", {
      name: "Fullstack Brandon",
      exact: true,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(intro).toBeVisible();
    await expect
      .poll(async () => (await saved(page))[0]?.state.status)
      .toBe("paused");
    const after = (await saved(page))[0];
    expect(after.id).toBe(before.id);
    expect(after.state.tick).toBe(before.state.tick);
    await intro
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rewind & replay", exact: true })
      .click();
    await expect(page.getByLabel("Replay timeline")).toBeVisible();
    await page.getByLabel("Replay timeline").fill("0");
    await expect(page.getByLabel("Replay timeline")).toHaveValue("0");
    await page
      .getByRole("button", { name: "Exit replay", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Under the hood", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download this run", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("little-worlds-run.json");
    expect(requests.filter((url) => /\/api\/|typesafe/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });
});
test("phone sized first visit needs no account and has independent saved state", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start the simulation", exact: true })
    .click();
  const play = page.locator(".mobile-play .primary-button");
  await expect(play).toHaveText("Pause simulation");
  await expect(page.locator(".island-canvas canvas")).toBeVisible();
  for (const width of [390, 462]) {
    await page.setViewportSize({ width, height: 844 });
    for (const control of [
      play,
      page.locator(".world-bottom .brandon-card"),
      page.locator(".world-bottom .business-launch"),
    ]) {
      expect(
        await control.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          );
        }),
      ).toBe(true);
    }
  }
  await play.click();
  await expect(play).toHaveText("Resume simulation");
  await play.click();
  await expect(play).toHaveText("Pause simulation");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(async () => (await saved(page))[0]?.state.tick, { timeout: 30000 })
    .toBeGreaterThan(2);
  const first = (await saved(page))[0];
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto("http://127.0.0.1:4200/");
  await expect(
    second.getByRole("button", { name: "Start the simulation", exact: true }),
  ).toBeEnabled();
  const isolated = (await saved(second))[0];
  expect(isolated.id).not.toBe(first.id);
  expect(isolated.state.tick).toBe(0);
  await other.close();
  await page.screenshot({ path: "evidence/portfolio-browser-mobile.png" });
});
