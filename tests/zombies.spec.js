import { test, expect } from "@playwright/test";
import { careerSnapshots } from "./fixtures/career.js";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { openStore } from "../server/store.js";
import { clone, command as engineCommand, step } from "../shared/engine.js";

async function installState(context, source) {
  const s = clone(source);
  s.status = "paused";
  s.speed = 1;
  const session = randomBytes(32).toString("hex"),
    id = randomUUID();
  const { db, save } = openStore(
    resolve(process.env.LW_ZOMBIE_TEST_DATABASE || "data/browser-test.sqlite"),
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

test("five visitor zombies stop a van delivery, fight on foot, persist and resume the same trip", async ({
  page,
  context,
}) => {
  const source = clone(careerSnapshots("van").van);
  await installState(context, source);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-combat-phase", "none", {
    timeout: 60000,
  });
  const spawn = page.locator(".zombie-control button");
  for (let i = 0; i < 5; i++) {
    await expect(spawn).toBeEnabled();
    await spawn.click();
    await expect(spawn).toContainText(`${i + 1}/5`);
  }
  await expect(spawn).toBeDisabled();
  const before = (await session(page)).run.state;
  const sixth = await page.request.post(
    `/api/runs/${(await session(page)).run.id}/command`,
    { headers: { "X-Little-Worlds": "1" }, data: { type: "spawn_zombie" } },
  );
  expect(sixth.status()).toBe(400);
  await command(page, "start");
  await expect(canvas).toHaveAttribute("data-combat-phase", "attack", {
    timeout: 30000,
  });
  await command(page, "pause");
  await expect(canvas).toHaveAttribute("data-combat-on-foot", "true");
  const interrupted = (await session(page)).run.state;
  // The trip advances while zombies approach; persistence preserves the task
  // at the actual encounter, rather than the task at the earlier spawn click.
  expect(interrupted.brandon.combat).toBeTruthy();
  expect(interrupted.brandon.combat.vehicle).toBeTruthy();
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -1200);
  await page.screenshot({ path: "evidence/zombies/van-encounter.png" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-combat-on-foot", "true", {
    timeout: 60000,
  });
  const restored = (await session(page)).run.state;
  expect(restored.brandon.combat).toEqual(interrupted.brandon.combat);
  expect(restored.zombies).toEqual(interrupted.zombies);
  await command(page, "speed", 8);
  await command(page, "start");
  await expect
    .poll(async () => (await session(page)).run.state.defense.defeated, {
      timeout: 30000,
    })
    .toBe(5);
  await expect(canvas).toHaveAttribute("data-combat-phase", "none", {
    timeout: 30000,
  });
  await command(page, "pause");
  expect(errors).toEqual([]);
});

test("four-tier weapon shop spends recorded coins and caps at particle gun; mobile spawn control fits", async ({
  page,
  context,
}) => {
  const source = clone(careerSnapshots("van").van);
  source.money += 1000;
  source.startingMoney += 1000;
  await installState(context, source);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await page.locator(".business-launch").click();
  await page
    .getByRole("button", { name: "Zombie defense", exact: true })
    .click();
  const moneyBefore = (await session(page)).run.state.money;
  for (const [name, price] of [
    ["Machete", 40],
    ["Gun", 90],
    ["Zombie spray", 170],
    ["Particle gun", 280],
  ]) {
    const card = page
      .locator(".defense-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card
      .getByRole("button", {
        name: `Buy & equip · ${price} coins`,
        exact: true,
      })
      .click();
    await expect(
      card.getByRole("button", { name: "Equipped", exact: true }),
    ).toBeDisabled();
  }
  const equipped = (await session(page)).run.state;
  expect(equipped.money).toBe(moneyBefore - 580);
  expect(equipped.defense.weapon).toBe("particle_gun");
  await page.screenshot({ path: "evidence/zombies/weapon-shop.png" });
  await page.reload();
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  expect((await session(page)).run.state.defense.weapon).toBe("particle_gun");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".zombie-control button")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: "evidence/zombies/mobile-spawn.png" });
});

test("particle gun disintegration renders a bounded particle burst in the merged miniature world", async ({
  page,
  context,
}) => {
  const s = clone(careerSnapshots("van").van);
  s.money += 1000;
  s.startingMoney += 1000;
  for (const id of ["machete", "gun", "spray", "particle_gun"])
    engineCommand(s, "buy_weapon", id);
  for (let i = 0; i < 5; i++) engineCommand(s, "spawn_zombie");
  // A contact fixture isolates the particle effect from the separate pursuit test.
  s.zombies.forEach(
    (z) => (z.position = [s.brandon.position[0], s.brandon.position[1] + 0.8]),
  );
  s.status = "running";
  for (let i = 0; i < 5; i++) step(s);
  expect(s.defense.defeated).toBe(5);
  await installState(context, s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-defense-particles", "60", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -1000);
  await page.screenshot({
    path: "evidence/zombies/particle-disintegration.png",
  });
  expect(errors).toEqual([]);
});
