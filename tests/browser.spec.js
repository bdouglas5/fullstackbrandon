import { test, expect } from "@playwright/test";
import { installState, installSnapshot } from "./fixtures/career.js";

async function session(page) {
  return page.evaluate(() => fetch("/api/session").then((r) => r.json()));
}
async function act(page, type, value) {
  return page.evaluate(
    async ({ type, value }) => {
      const { run } = await fetch("/api/session").then((r) => r.json());
      const response = await fetch(`/api/runs/${run.id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Little-Worlds": "1" },
        body: JSON.stringify({ type, value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result;
    },
    { type, value },
  );
}
async function rendered(page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30000 });
  await page.locator("canvas").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      Number(document.querySelector("canvas")?.dataset.renderFrames || 0) > 2,
  );
}

test("clear Play entry, autonomous first investment, intervention, persistence, and decision replay", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeEnabled();
  await rendered(page);
  const initial = await session(page);
  expect(initial.run.state.money).toBe(0);
  expect(initial.run.state.vehicles).toEqual([]);
  await page.screenshot({ path: "evidence/career-ready.png", fullPage: true });
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await page.getByRole("button", { name: "8×", exact: true }).click();
  await expect
    .poll(async () => (await session(page)).run.state.vehicles, {
      timeout: 30000,
      intervals: [1000],
    })
    .toContain("bike");
  await page.locator(".challenge-disclosure summary").click();
  await page.getByRole("button", { name: /Block market road/ }).click();
  await expect(
    page.getByRole("button", { name: /Clear the road/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Less waste", exact: true }).click();
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  const before = await session(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume simulation", exact: true }),
  ).toBeVisible();
  const after = await session(page);
  expect(after.run.id).toBe(before.run.id);
  expect(after.run.state.tick).toBe(before.run.state.tick);
  await page
    .getByRole("button", { name: "Inspect Brandon", exact: true })
    .click();
  await expect(page.getByLabel("DECISION HISTORY")).toBeVisible();
  await page.screenshot({ path: "evidence/career-inspector.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Rewind & replay", exact: true })
    .click();
  await page.getByLabel("Replay timeline").fill("0");
  await expect(page.getByText("REPLAY", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  expect(errors).toEqual([]);
});

test("mobile, reduced motion, keyboard help, illustrated workshop and queued guidance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "How this works", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Fullstack Brandon" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "How this works", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: /Open the business · crew/ }).click();
  await page
    .getByRole("button", { name: "Gadget workshop", exact: true })
    .click();
  await expect(page.locator(".tool-card")).toHaveCount(10);
  await expect(page.locator('.tool-card canvas[role="img"]')).toHaveCount(10);
  await page.locator(".tool-card").first().scrollIntoViewIfNeeded();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-rendering-paused",
    "false",
  );
  await page.screenshot({
    path: "evidence/career-mobile-workshop.png",
    fullPage: true,
  });
  await act(page, "prefer", "buy_jetpack");
  expect((await session(page)).run.state.request).toBe("buy_jetpack");
  expect((await session(page)).run.state.vehicles).toEqual([]);
  await page.getByRole("button", { name: "The fleet", exact: true }).click();
  await expect(page.locator(".fleet-card")).toHaveCount(7);
  await expect(page.locator('.fleet-card canvas[role="img"]')).toHaveCount(7);
  await expect(
    page.locator(".product-model[data-model-status=ready]"),
  ).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-rendering-paused",
    "false",
  );
});

test("real career retirement and customer reviews", async ({
  page,
  context,
}) => {
  const state = await installSnapshot(context, "retired");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  await expect(page.locator(".result-card")).toBeVisible();
  await expect(page.locator(".map-labels")).toBeHidden();
  const ownsHit = await page.locator(".result-card h2").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return !!document
      .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      ?.closest(".result-card");
  });
  expect(ownsHit).toBe(true);
  expect(state.retirement.ready).toBe(true);
  await page.screenshot({ path: "evidence/career-retired.png" });
  await page.getByRole("button", { name: /Open the business · crew/ }).click();
  await page.getByRole("button", { name: /^Reviews/ }).click();
  await expect(page.locator(".review-card").first()).toBeVisible();
  await page.screenshot({
    path: "evidence/career-reviews.png",
    fullPage: true,
  });
});

test("independent crew following and the archipelago", async ({
  page,
  context,
}) => {
  const crewSnapshot = await installSnapshot(context, "crew");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  await page.getByRole("button", { name: /Open the business · crew/ }).click();
  await page.getByRole("button", { name: "The crew", exact: true }).click();
  await page.getByRole("button", { name: /Follow Alex/ }).click();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-follow-target",
    crewSnapshot.crew[0].id,
  );
  await page.screenshot({ path: "evidence/career-crew.png" });
  await expect(
    page.getByRole("button", { name: /Explore the archipelago/ }),
  ).toHaveCount(0);
  await expect(page.locator(".island-destination")).toHaveCount(5);
  await page.screenshot({ path: "evidence/career-archipelago.png" });
});

test("natural night lighting and weather render", async ({ page, context }) => {
  await installSnapshot(context, "night");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await rendered(page);
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-world-phase",
    "night",
  );
  await page.screenshot({ path: "evidence/career-night.png" });
});

for (const mode of [
  "foot",
  "bike",
  "van",
  "sailboat",
  "helicopter",
  "jetpack",
  "teleporter",
]) {
  test(`autonomously reached ${mode} transport renders and resumes`, async ({
    page,
    context,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const state = await installSnapshot(context, mode);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    await rendered(page);
    await expect(page.locator("canvas").first()).toHaveAttribute(
      "data-active-vehicle",
      mode,
    );
    await page.getByRole("button", { name: /Follow Brandon/ }).click();
    await page.screenshot({ path: `evidence/transport-${mode}.png` });
    await act(page, "pause");
    await expect
      .poll(async () => (await session(page)).run.state.tick, {
        timeout: 10000,
        intervals: [1000],
      })
      .toBeGreaterThan(state.tick);
    // Stop the isolated run before the next test stages a snapshot in SQLite.
    await act(page, "pause");
    expect((await session(page)).run.state.status).toBe("paused");
    expect(errors).toEqual([]);
  });
}

// Later crew must remain physically visible when their independently chosen
// transport is an aircraft or portal, not only in the first bicycle fixture.
for (const mode of ["helicopter", "jetpack", "teleporter"]) {
  test(`independent crew ${mode} remains visible while followed`, async ({
    page,
    context,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const state = await installSnapshot(context, `crew_${mode}`);
    const member = state.crew.find((person) => {
      const voyage = person.voyage;
      return (
        voyage?.mode === mode &&
        !voyage.onShore &&
        (mode === "teleporter"
          ? voyage.phase === "Portal arrival"
          : voyage.phase.startsWith("Flying to"))
      );
    });
    expect(member).toBeTruthy();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    await rendered(page);
    await page
      .getByRole("button", { name: /Open the business · crew/ })
      .click();
    await page.getByRole("button", { name: "The crew", exact: true }).click();
    await page
      .getByRole("button", { name: `Follow ${member.name}`, exact: true })
      .click();
    const canvas = page.locator("canvas").first();
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute("data-follow-target", member.id);
    await expect
      .poll(async () => {
        const all = JSON.parse(
          (await canvas.getAttribute("data-crew-transports")) || "{}",
        );
        return all[member.id];
      })
      .toMatchObject({
        mode,
        visible: true,
        pilotVisible: true,
        onShore: false,
      });
    await page.screenshot({ path: `evidence/crew-${mode}.png` });
    expect(errors).toEqual([]);
  });
}

test("rest hides requests, doubles the clock and morning brings the orders back", async ({
  page,
  context,
  baseURL,
}) => {
  const { fresh, worldTime } = await import("../shared/engine.js");
  const { updateSchedule } = await import("../shared/realism.js");
  const s = fresh(42);
  s.status = "running";
  s.controller = "rules";
  s.tick = 1436;
  s.world = worldTime(s.tick, s.seed);
  updateSchedule(s, 1440);
  s.brandon.homeRoutine = { phase: "sleeping", elapsed: 0, vehicle: "foot" };
  s.brandon.labor = {
    day: s.world.day,
    status: "off_duty",
    pending: [],
    breakRemaining: 0,
    breaksTaken: [],
    workedTicks: 0,
    restTicks: 0,
  };
  const requests = s.customerQueue.map((o) => o.id);
  const { clockOut } = await import("../shared/business-hours.js");
  clockOut(s);
  await installState(context, s, {
    baseURL,
    ...(process.env.REST_TEST_DB
      ? { databasePath: process.env.REST_TEST_DB }
      : {}),
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(page.locator("canvas").first())
    .toBeVisible({ timeout: 60000 })
    .catch((error) => {
      throw new Error(
        `${error.message}\nPage errors: ${JSON.stringify(errors)}`,
      );
    });
  await rendered(page);
  await expect(page.locator(".order-bubble")).toHaveCount(0);
  await expect(page.locator(".business-launch")).toContainText(
    `${requests.length} pending orders`,
  );
  await expect(page.locator(".speed-control")).toContainText(
    "Clocked out · 2×",
  );
  await page.screenshot({ path: "evidence/rest-orders-hidden.png" });
  // Capture actual published ticks: the real server advances twice per interval
  // during rest, then once per interval after opening and waking.
  await page.evaluate(async () => {
    const { run } = await fetch("/api/session").then((r) => r.json());
    window.restTicks = [];
    window.restStream = new EventSource(`/api/runs/${run.id}/events`);
    window.restStream.onmessage = (e) => {
      const frame = JSON.parse(e.data);
      if (frame.state) window.restTicks.push(frame.state.tick);
    };
  });
  await act(page, "start");
  await expect
    .poll(async () => (await session(page)).run.state.tick)
    .toBeGreaterThan(1444);
  await act(page, "pause");
  const after = (await session(page)).run.state;
  expect(after.customerQueue.some((o) => requests.includes(o.id))).toBe(true);
  await expect(page.locator(".resting-notice")).toHaveCount(0);
  await expect(page.locator(".business-launch")).toContainText(
    `${after.customerQueue.length} pending orders`,
  );
  await expect(page.locator(".speed-control")).toContainText("Watch at");
  const ticks = await page.evaluate(() => {
    window.restStream.close();
    return [...new Set(window.restTicks)];
  });
  const differences = ticks.slice(1).map((tick, i) => tick - ticks[i]);
  expect(differences).toContain(2);
  expect(differences).toContain(1);
  await page.screenshot({ path: "evidence/rest-orders-returned.png" });
  expect(errors).toEqual([]);
});

test("creative weather controls persist, clear storms, and resume automatic weather", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Fullstack Brandon simulation", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60000 });
  await rendered(page);
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("button", { name: "Thunderstorm", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Temporary storm" }),
  ).toBeVisible();
  expect((await session(page)).run.state.world.weather).toBe("storm");
  await page
    .getByRole("button", { name: "Thunder sound Off", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thunder sound On", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("dialog", { name: "Controls" })
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-weather",
    "storm",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Fullstack Brandon simulation", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60000 });
  await rendered(page);
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Thunderstorm", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const [label, weather] of [
    ["Clear weather", "clear"],
    ["Clouds", "cloudy"],
    ["Rain", "rain"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect((await session(page)).run.state.world.weather).toBe(weather);
  }
  await page.screenshot({ path: "evidence/creative-weather-controls.png" });
  await page
    .getByRole("button", { name: "Resume automatic weather", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume automatic weather", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (await session(page)).run.state.environment.weatherOverride,
  ).toBeNull();
  expect(errors).toEqual([]);
});
