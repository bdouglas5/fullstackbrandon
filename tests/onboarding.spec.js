import { test, expect } from "@playwright/test";

test("first visit explains the simulation and starts the business", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const welcome = page.getByRole("dialog", { name: "Fullstack Brandon" });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("This is my portfolio in motion.");
  await expect(welcome).toContainText(
    "Customers, money, and reviews are simulated.",
  );
  await expect(
    welcome.getByRole("img", {
      name: "Brandon’s in-game 3D model beside a pickle",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    welcome.getByRole("button", { name: "Achievements", exact: true }),
  ).toBeVisible();
  await expect(
    welcome.getByRole("button", { name: "Look around first" }),
  ).toHaveCount(0);
  await expect(welcome).toContainText("Rules guide the next move.");
  await expect(welcome).toContainText("no live AI service is connected.");
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await welcome
    .getByRole("button", { name: "Start the simulation", exact: true })
    .click();
  await expect(welcome).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Pause simulation", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const session = await fetch("/api/session").then((response) =>
          response.json(),
        );
        return session.run.state.status;
      }),
    )
    .toBe("running");
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
});

test("introduction returns on reload and help can be reopened by keyboard", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const welcome = page.getByRole("dialog", { name: "Fullstack Brandon" });
  await expect(welcome).toBeVisible();
  await expect(
    welcome.getByRole("button", { name: "Close introduction" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    welcome.getByRole("button", { name: "Achievements", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    welcome.getByRole("button", { name: "Close introduction" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "How this works", exact: true }),
  ).toBeVisible();
  await expect(welcome).toBeVisible();
  await page.keyboard.press("Escape");
  const help = page.getByRole("button", {
    name: "How this works",
    exact: true,
  });
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(welcome).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
});

test("reset shows the introduction and starts the new simulation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const welcome = page.getByRole("dialog", {
    name: "Fullstack Brandon",
    exact: true,
  });
  await welcome
    .getByRole("button", { name: "Start the simulation", exact: true })
    .click();
  await expect(welcome).toBeHidden();
  const before = await page.evaluate(
    async () => (await (await fetch("/api/session")).json()).run.id,
  );
  await page
    .getByRole("button", { name: "Reset simulation", exact: true })
    .click();
  await expect(welcome).toBeVisible();
  await welcome
    .getByRole("button", { name: "Start the simulation", exact: true })
    .click();
  await expect(welcome).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Pause simulation", exact: true }),
  ).toBeVisible();
  const after = await page.evaluate(
    async () => (await (await fetch("/api/session")).json()).run,
  );
  expect(after.id).not.toBe(before);
  expect(after.state.status).toBe("running");
});

test("reload pauses the saved simulation until the introduction starts it", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const welcome = page.getByRole("dialog", {
    name: "Fullstack Brandon",
    exact: true,
  });
  await welcome
    .getByRole("button", { name: "Start the simulation", exact: true })
    .click();
  await expect(welcome).toBeHidden();
  await page.reload();
  await expect(welcome).toBeVisible();
  const start = welcome.getByRole("button", {
    name: "Start the simulation",
    exact: true,
  });
  await expect(start).toBeEnabled();
  const status = await page.evaluate(
    async () => (await (await fetch("/api/session")).json()).run.state.status,
  );
  expect(status).toBe("paused");
  await start.click();
  await expect(welcome).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Pause simulation", exact: true }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 667 },
]) {
  test(`introduction keeps its actions visible at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog", { name: "Fullstack Brandon" });
    await expect(welcome).toBeVisible();
    const start = welcome.getByRole("button", {
      name: "Start the simulation",
      exact: true,
    });
    await expect(start).toBeEnabled();
    const bounds = await start.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await welcome.getByRole("button", { name: "Close introduction" }).click();
    await expect(welcome).toBeHidden();
  });
}

test("mobile scene controls stay separate and clickable after closing the introduction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("dialog", { name: "Fullstack Brandon" })
    .getByRole("button", { name: "Close introduction" })
    .click();
  const play = page.locator(".mobile-play .primary-button");
  const business = page.locator(".world-bottom .business-launch");
  const brandon = page.locator(".world-bottom .brandon-card");
  await expect(play).toBeEnabled();
  await expect(page.locator(".island-placeholder")).toBeHidden();
  await expect(page.locator(".island-canvas canvas")).toBeVisible();
  for (const control of [play, business, brandon]) {
    await expect(control).toBeVisible();
    expect(
      await control.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        return element.contains(hit);
      }),
    ).toBe(true);
  }
  await play.click();
  await expect(play).toHaveText("Pause simulation");
  await business.click();
  await expect(
    page.getByRole("dialog", { name: "Live business" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await brandon.click();
  await expect(
    page.getByRole("dialog", { name: "Decision inspector" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await play.click();
  await expect(play).toHaveText("Resume simulation");
});

test("compact navigation keeps tools and tests in their consolidated sections", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Close introduction" }).click();
  await expect(
    page.locator(
      ".location-pill, .controller-pill, .welcome-note, .zombie-control",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Business \d+ pending orders/ }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Controls", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Automatic weather", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: /Business \d+ pending orders/ })
    .click();
  const business = page.getByRole("dialog", { name: "Live business" });
  await expect(business.locator(".console-tabs button")).toHaveText([
    "Operations & Dispatch",
    "Businesses & Islands",
    "Reviews",
    "Controls",
  ]);
  await expect(
    business.getByRole("region", { name: "Pending orders" }),
  ).toBeVisible();
  for (const section of ["Live dispatch", "Supply & production"]) {
    await business
      .locator("summary")
      .filter({ hasText: new RegExp(`^${section}$`) })
      .click();
  }
  await expect(
    business.getByRole("textbox", { name: "Message Brandon" }),
  ).toBeVisible();
  await business.getByRole("button", { name: "Controls", exact: true }).click();
  await expect(
    business.getByRole("button", { name: /Spawn Zombie/ }),
  ).toBeVisible();
  await business
    .getByRole("button", { name: "Businesses & Islands", exact: true })
    .click();
  await expect(business.locator("summary")).toHaveText([
    "Businesses",
    "Islands",
  ]);
  await page.keyboard.press("Escape");
  await page.locator(".brandon-card").click();
  await expect(
    page.getByRole("heading", { name: "Decisions", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Compare/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
