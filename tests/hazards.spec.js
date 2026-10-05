import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { openStore } from "../server/store.js";
import {
  fresh,
  begin,
  command as engineCommand,
  step,
  NODES,
  PEOPLE,
  route,
} from "../shared/engine.js";

mkdirSync("evidence/hazards", { recursive: true });

async function installState(context, source) {
  const s = JSON.parse(JSON.stringify(source));
  s.status = "paused";
  s.speed = 1;
  const session = randomBytes(32).toString("hex"),
    id = randomUUID();
  const { db, save } = openStore(
    resolve(
      process.env.LW_HAZARD_TEST_DATABASE || "data/hazards-browser-test.sqlite",
    ),
  );
  try {
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
  } finally {
    db.close();
  }
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
async function session(page) {
  return (await page.request.get("/api/session")).json();
}
async function command(page, type, value) {
  const { run } = await session(page);
  const response = await page.request.post(`/api/runs/${run.id}/command`, {
    headers: { "X-Little-Worlds": "1" },
    data: { type, value },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

function isolated() {
  const s = fresh();
  s.status = "running";
  s.cafe = 6;
  s.harbor = 0;
  s.operations.shipments = [];
  s.queue = [];
  s.customerQueue = [];
  s.arrivals = 0;
  s.office.stage = "complete";
  s.operations.origin = "cafe";
  s.brandon.node = "cafe";
  s.brandon.position = [...NODES.cafe];
  s.brandon.labor = {
    day: 1,
    status: "working",
    breaksTaken: ["morning", "lunch", "afternoon"],
    pending: [],
    breakRemaining: 0,
    workedTicks: 0,
    restTicks: 0,
  };
  // Full daylight, clear sky.
  s.tick = 300;
  return s;
}
function enqueue(s, id) {
  const person = PEOPLE.find((p) => p.id === id);
  s.customerQueue.push({
    ...person,
    customerId: id,
    id: `test-${s.arrivals}`,
    arrived: s.tick,
    assigned: null,
  });
  s.queue.push(s.tick);
  s.arrivals++;
}
function roadTrip(vehicle = "van", kit = 0) {
  const s = isolated();
  s.vehicles = [vehicle];
  s.vehicle = vehicle;
  s.carry = 1;
  s.cafe--;
  if (kit) s.tools.spill_kit = kit;
  enqueue(s, "cleo");
  if (!begin(s, "serve_cleo")) throw new Error("trip not legal");
  engineCommand(s, "place_oil", { x: 8, z: 2 });
  return s;
}
function sailing() {
  const s = isolated();
  s.vehicles = ["sailboat"];
  s.brandon.node = "harbor_dock";
  s.brandon.position = [...NODES.harbor_dock];
  enqueue(s, "tess");
  s.carry = 1;
  s.cafe--;
  begin(s, "serve_tess");
  engineCommand(s, "creature", true);
  return s;
}
const run = (s, until, limit = 3000) => {
  for (let i = 0; !until(s); i++) {
    step(s);
    if (i > limit) throw new Error("fixture never reached its state");
  }
  return s;
};
async function shoot(page, name, zoom = -900) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-oil-spills", /\d/, {
    timeout: 90000,
  });
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, zoom);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `evidence/hazards/${name}.png` });
}

test("oil: the van reaches the spill, spins and sits dazed", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const s = roadTrip("van");
  run(s, (x) => x.brandon.slip?.elapsed === 3);
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "oil-van-spinning", -600);
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-oil-spills", "1");
  expect(errors).toEqual([]);
});
test("oil: dazed after the spin, stars over the van", async ({
  page,
  context,
}) => {
  const s = roadTrip("van");
  run(s, (x) => x.brandon.slip?.elapsed === 6);
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "oil-van-dazed", -600);
});
test("oil: Brandon on foot slips", async ({ page, context }) => {
  const s = roadTrip("foot");
  run(s, (x) => x.brandon.slip?.elapsed === 2);
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "oil-foot-spinning");
});
test("oil: the spill kit scrubs while foam rises", async ({
  page,
  context,
}) => {
  const s = roadTrip("van", 1);
  run(
    s,
    (x) =>
      x.brandon.combat?.phase === "clean" && x.brandon.combat.elapsed === 4,
  );
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "oil-cleaning", -600);
});
test("oil: on foot with the spill kit, close up", async ({ page, context }) => {
  const s = roadTrip("foot", 2);
  run(
    s,
    (x) =>
      x.brandon.combat?.phase === "clean" && x.brandon.combat.elapsed === 1,
  );
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "oil-cleaning-close", -1300);
});
test("oil: parked puddle on the road", async ({ page, context }) => {
  const s = isolated();
  engineCommand(s, "place_oil", { x: 8.2, z: 2 });
  s.tick += 12;
  s.brandon.node = "cafe";
  s.brandon.position = [6.9, 2];
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "oil-puddle", -700);
  const c = page.locator("canvas").first();
  await expect(c).toHaveAttribute("data-oil-spills", "1");
});
test("creature: tentacles hold Brandon's boat", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const s = sailing();
  run(
    s,
    (x) => x.brandon.voyage?.held && x.tick - x.brandon.voyage.held.at >= 8,
  );
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "creature-boat", -700);
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-creature-holds",
    "1",
  );
  expect(errors).toEqual([]);
});
test("creature: tentacles hold the cargo boat at sea", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const s = isolated();
  s.brandon.node = "harbor_dock";
  s.brandon.position = [...NODES.harbor_dock];
  s.operations.shipments.push({
    id: "ship-e2e",
    kind: "pickles",
    cases: 6,
    remaining: 6,
    status: "at_sea",
    orderedAt: s.tick,
    departsAt: s.tick,
    arrivesAt: s.tick + 100,
    portNode: "harbor_dock",
  });
  engineCommand(s, "creature", true);
  const x = s.operations.shipments[0];
  run(s, () => x.held && s.tick - x.held.at >= 8);
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "creature-cargo-boat", 1800);
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-creature-holds",
    "1",
  );
  expect(errors).toEqual([]);
});
test("creature: the shadow lurks when awake and idle", async ({
  page,
  context,
}) => {
  const s = isolated();
  engineCommand(s, "creature", true);
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await shoot(page, "creature-lurking", -300);
});
test("creature: the panel lists the hold and the toll frees it", async ({
  page,
  context,
}) => {
  const s = sailing();
  s.cafe = 10;
  run(
    s,
    (x) => x.brandon.voyage?.held && x.tick - x.brandon.voyage.held.at >= 8,
  );
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.getByText("Held · lets go in about")).toBeVisible();
  await page.screenshot({ path: "evidence/hazards/controls-panel.png" });
  await page.getByRole("button", { name: "Pay 6 pickles" }).click();
  await expect
    .poll(async () => (await session(page)).run.state.hazards.creature.paid)
    .toBe(1);
});
test("oil button drops a spill at random without rebuilding the scene", async ({
  page,
  context,
}) => {
  await installState(context, isolated());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-oil-spills", "0", {
    timeout: 90000,
  });
  await canvas.evaluate((c) => (c.dataset.keep = "same"));
  await page.getByRole("button", { name: "Controls" }).click();
  await page.getByRole("button", { name: /Spill oil on a road/ }).click();
  await expect(canvas).toHaveAttribute("data-oil-spills", "1", {
    timeout: 30000,
  });
  // Same canvas element: the 3D scene was not torn down and rebuilt.
  await expect(canvas).toHaveAttribute("data-keep", "same");
  expect((await session(page)).run.state.hazards.spills.length).toBe(1);
});

for (const kit of [0, 1])
  test(`rocket skates: ${kit ? "park to clean, keeping cargo" : "spin while still equipped"}`, async ({
    page,
    context,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const s = roadTrip("rocket_skates", kit);
    s.carry = 3;
    run(s, (x) =>
      kit ? x.brandon.combat?.phase === "clean" : x.brandon.slip?.elapsed === 3,
    );
    await installState(context, s);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click({ force: true });
    await shoot(page, kit ? "rocket-cleaning" : "rocket-spinning", -600);
    const canvas = page.locator("canvas").first();
    await expect(canvas).toHaveAttribute("data-skates-visible", String(!kit));
    await expect(canvas).toHaveAttribute("data-skater-visible", String(!kit));
    if (kit) {
      await expect(canvas).toHaveAttribute("data-combat-on-foot", "true");
      await expect(canvas).toHaveAttribute("data-cargo-cases", "3");
    }
    expect(errors).toEqual([]);
  });
