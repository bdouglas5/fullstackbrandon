import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { openStore } from "../server/store.js";
import { clockOut } from "../shared/business-hours.js";
import { updateSchedule } from "../shared/realism.js";
import {
  fresh,
  begin,
  NODES,
  DAY_TICKS,
  command as engineCommand,
} from "../shared/engine.js";

async function install(context, s) {
  s.status = "paused";
  const session = randomBytes(32).toString("hex"),
    id = randomUUID();
  const { db, save } = openStore(
    resolve(process.env.LW_ZOMBIE_TEST_DATABASE || "data/browser-test.sqlite"),
  );
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions(id,created,last_seen,current_run) VALUES(?,?,?,?)",
  ).run(session, now, now, id);
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    id,
    session,
    JSON.stringify(s),
    now,
    now,
    null,
  );
  save(id, s);
  db.close();
  await context.addCookies([
    {
      name: "lw_session",
      value: session,
      url: test.info().project.use.baseURL,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}
async function state(page) {
  return (await (await page.request.get("/api/session")).json()).run;
}
async function act(page, type) {
  const run = await state(page);
  const r = await page.request.post(`/api/runs/${run.id}/command`, {
    headers: { "X-Little-Worlds": "1" },
    data: { type },
  });
  expect(r.ok()).toBe(true);
}
test.beforeEach(async ({ page }) =>
  page.addInitScript(() =>
    localStorage.setItem("little-worlds:intro:v1", "seen"),
  ),
);

test("flowing route stays attached to Brandon while he approaches the workshop", async ({
  page,
  context,
}) => {
  const s = fresh();
  s.money = 1000;
  s.brandon.node = "garden";
  s.brandon.position = [...NODES.garden];
  expect(begin(s, "buy_bike")).toBeTruthy();
  await install(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-route-style", "flowing", {
    timeout: 60000,
  });
  await act(page, "start");
  const sampling = page.evaluate(async () => {
    const canvas = document.querySelector("canvas"),
      samples = [];
    let previous = "";
    const end = performance.now() + 12000;
    while (performance.now() < end) {
      await new Promise(requestAnimationFrame);
      const d = canvas.dataset;
      if (d.renderFrames === previous || !d.routePosition || !d.routeStart)
        continue;
      previous = d.renderFrames;
      samples.push({
        position: JSON.parse(d.routePosition),
        start: JSON.parse(d.routeStart),
        points: JSON.parse(d.routePoints),
      });
    }
    return samples;
  });
  await expect
    .poll(async () => (await state(page)).state.brandon.buildingVisit?.phase, {
      timeout: 30000,
      intervals: [100],
    })
    .toBe("inside");
  await act(page, "pause");
  const samples = await sampling;
  expect(samples.length).toBeGreaterThanOrEqual(3);
  for (const sample of samples) {
    expect(
      Math.hypot(...sample.position.map((v, i) => v - sample.start[i])),
    ).toBeLessThan(0.000001);
    expect(sample.points.every((p) => p.every(Number.isFinite))).toBe(true);
  }
  expect(
    Math.hypot(
      ...samples.at(-1).position.map((v, i) => v - samples[0].position[i]),
    ),
  ).toBeGreaterThan(0.2);
  await page.screenshot({
    path: "evidence/zombies/continuous-workshop-route.png",
  });
  expect((await state(page)).state.brandon.position).toEqual([4.45, -4.78]);
  await page.screenshot({ path: "evidence/zombies/workshop-door-entry.png" });
  expect(errors).toEqual([]);
});

test("central zombies visibly approach before a nearby weapon encounter", async ({
  page,
  context,
}) => {
  const s = fresh();
  s.brandon.action = "wait";
  s.brandon.target = "home";
  s.brandon.work = -1000;
  engineCommand(s, "spawn_zombie");
  await install(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-zombies", "1", { timeout: 60000 });
  await expect(canvas).toHaveAttribute("data-combat-phase", "none");
  await page.screenshot({ path: "evidence/zombies/central-spawn.png" });
  await act(page, "start");
  await expect
    .poll(async () => (await state(page)).state.zombies[0].position[0], {
      timeout: 10000,
    })
    .toBeGreaterThan(1.6);
  await expect(canvas).toHaveAttribute("data-combat-phase", "attack", {
    timeout: 30000,
  });
  await act(page, "pause");
  await page.screenshot({ path: "evidence/zombies/slow-approach-combat.png" });
  expect(errors).toEqual([]);
});

test("end of shift parks the van at home and enters the house", async ({
  page,
  context,
}) => {
  const s = fresh();
  s.tick = 600;
  s.world.hour = 18;
  s.customerQueue = [];
  s.queue = [];
  s.vehicles.push("van");
  s.vehicle = "van";
  s.brandon.mountedMode = "van";
  s.brandon.action = "rest";
  s.brandon.target = "home";
  updateSchedule(s, DAY_TICKS);
  expect(clockOut(s)).toBe(true);
  await install(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await act(page, "start");
  await expect
    .poll(async () => (await state(page)).state.brandon.homeRoutine?.phase, {
      timeout: 30000,
    })
    .toBe("sleeping");
  await act(page, "pause");
  const run = await state(page);
  expect(run.state.vehicle).toBe("van");
  expect(run.state.brandon.mountedMode).toBe("foot");
  expect(run.state.vehicleLocations.van.position).toEqual([8.7, -3.8]);
  await page.screenshot({ path: "evidence/zombies/home-rest.png" });
  expect(errors).toEqual([]);
});

test("controls toggle automatic weather and spawn zombies from the renamed drawer", async ({
  page,
  context,
}) => {
  const s = fresh();
  s.carry = 3;
  await install(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-cargo-cases", "3", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Controls", exact: true });
  await expect(drawer).toBeVisible();
  const weather = drawer.getByRole("button", {
    name: "Automatic weather",
    exact: true,
  });
  await expect(weather).toHaveAttribute("aria-pressed", "true");
  await weather.click();
  await expect
    .poll(async () => (await state(page)).state.environment.weatherEnabled)
    .toBe(false);
  await expect(canvas).toHaveAttribute("data-weather", "clear");
  await weather.click();
  await expect
    .poll(async () => (await state(page)).state.environment.weatherEnabled)
    .toBe(true);
  for (const label of ["Storm", "Rain", "Fog", "Cloud cover"])
    await expect(
      drawer.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: /Spawn Zombie/ }),
  ).toBeEnabled();
  await drawer.getByRole("button", { name: /Spawn Zombie/ }).click();
  await expect
    .poll(
      async () =>
        (await state(page)).state.zombies.filter((z) => z.hp > 0).length,
    )
    .toBe(1);
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-zombies", "1", { timeout: 15000 });
  expect(errors).toEqual([]);
});

test("clock-out notice advances through the night to the next shift", async ({
  page,
  context,
}) => {
  const s = fresh();
  s.customerQueue = [];
  s.tick = 840;
  s.world = { day: 1, hour: 22, phase: "night", weather: "clear", light: 0.13 };
  s.brandon.node = "home";
  s.brandon.position = [7.45, -4.85];
  s.brandon.homeRoutine = {
    phase: "sleeping",
    elapsed: 0,
    vehicle: "foot",
    start: [...s.brandon.position],
  };
  updateSchedule(s, 1440);
  expect(clockOut(s)).toBe(true);
  await install(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(page.locator(".resting-notice")).toBeVisible({ timeout: 60000 });
  const notice = await page.locator(".resting-notice").boundingBox();
  const world = await page.locator(".world-panel").boundingBox();
  expect(notice.y - world.y).toBeLessThan(100);
  expect(notice.height).toBeLessThan(65);
  await page.screenshot({ path: "evidence/resting-notice-night.png" });
  await page
    .locator(".resting-notice")
    .getByRole("button", { name: "Go to next shift" })
    .click();
  await expect(page.locator(".resting-notice")).toContainText(
    "Advancing to morning",
  );
  await expect(page.locator(".shift-fade.advancing")).toBeAttached();
  await expect
    .poll(async () => (await state(page)).state.tick, { timeout: 30000 })
    .toBeGreaterThanOrEqual(1440);
  await expect
    .poll(async () => (await state(page)).state.daytimeUntil)
    .toBeFalsy();
  await act(page, "pause");
  await expect
    .poll(
      async () =>
        Number(
          await page
            .locator("canvas")
            .first()
            .getAttribute("data-night-strength"),
        ),
      { timeout: 15000 },
    )
    .toBeLessThan(0.2);
  await page.screenshot({ path: "evidence/rest-to-daytime.png" });
  expect(errors).toEqual([]);
});

test("home garage receives the stock before Brine & Co unlocks", async ({
  page,
  context,
}) => {
  const s = fresh();
  s.harbor = 3;
  s.operations.inboundCarry = 3;
  s.brandon.node = "home";
  s.brandon.position = [...NODES.home];
  expect(begin(s, "unload_shipment")).toBeTruthy();
  await install(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const garage = page.getByRole("button", {
    name: /Home garage.*0 pickle cases/,
  });
  await expect(garage).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator(".map-label").filter({ hasText: "Brine & Co." }),
  ).toHaveCount(0);
  await act(page, "start");
  await expect
    .poll(async () => (await state(page)).state.cafe, {
      timeout: 30000,
      intervals: [100],
    })
    .toBe(3);
  await act(page, "pause");
  const current = (await state(page)).state;
  expect(current.operations.origin).toBe("home");
  expect(current.office.stage).toBe("garage");
  expect(current.brandon.position[0]).toBeGreaterThan(8);
  await expect(
    page.getByRole("button", { name: /Home garage.*3 pickle cases/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Home garage.*3 pickle cases/ })
    .click();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-workplace-origin",
    "home",
    { timeout: 60000 },
  );
  await page.screenshot({ path: "evidence/home-garage-loading-bay.png" });
  expect(errors).toEqual([]);
});

for (const moment of ["thinking", "entering home", "meal break"]) {
  test(`next-shift notice stays hidden while ${moment} during working hours`, async ({
    page,
    context,
  }) => {
    const s = fresh();
    s.tick = 240;
    s.world = { day: 1, hour: 12, phase: "day", weather: "clear", light: 1 };
    updateSchedule(s, 1440);
    s.brandon.node = "home";
    s.brandon.position = [7.45, -4.85];
    if (moment === "entering home")
      s.brandon.homeRoutine = { phase: "entering", elapsed: 1 };
    if (moment === "meal break")
      s.brandon.labor = {
        pending: [],
        status: "meal_break",
        breakRemaining: 15,
      };
    await install(context, s);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Simulation speed" }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".resting-notice")).toHaveCount(0);
    await expect(page.locator(".speed-control")).toContainText("Watch at");
  });
}

test("riding near a dock remains mounted and a dismounted bike stays at its parking spot", async ({
  page,
  context,
}) => {
  const s = fresh(42);
  s.vehicles.push("bike");
  s.vehicle = "bike";
  s.brandon.mountedMode = "bike";
  s.brandon.position = [...NODES.harbor_dock];
  s.brandon.node = "harbor_dock";
  await install(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-active-vehicle", "bike", {
    timeout: 60000,
  });
  await expect(canvas).toHaveAttribute("data-rider-visible", "true");
  await expect(canvas).toHaveAttribute("data-walker-visible", "false");
  s.brandon.mountedMode = "foot";
  s.brandon.position = [NODES.harbor_dock[0] + 1, NODES.harbor_dock[1]];
  s.vehicleLocations.bike = {
    node: "harbor_dock",
    position: [...NODES.harbor_dock],
  };
  await install(context, s);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-active-vehicle", "foot", {
    timeout: 60000,
  });
  await expect(canvas).toHaveAttribute("data-rider-visible", "false");
  const parking = JSON.parse(await canvas.getAttribute("data-bike-position"));
  expect(parking[0]).toBeCloseTo(NODES.harbor_dock[0], 5);
  expect(parking[2]).toBeCloseTo(NODES.harbor_dock[1], 5);
});
