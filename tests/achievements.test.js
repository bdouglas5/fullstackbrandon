import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  command,
  begin,
  baseline,
  step,
  clone,
} from "../shared/engine.js";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  updateAchievements,
  retirementRequirements,
} from "../shared/achievements.js";
import { TOOLS, TRANSPORT } from "../shared/catalog.js";

test("achievement tree has unique IDs, valid preceding dependencies, and starts empty", () => {
  const prior = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(!prior.has(a.id));
    a.requires.forEach((id) =>
      assert.ok(prior.has(id), `${a.id} depends on ${id}`),
    );
    prior.add(a.id);
  }
  assert.deepEqual(fresh().achievements.unlocked, {});
});
test("real engine progress awards once, survives serialization and spending, resets with a new career", () => {
  const s = fresh();
  command(s, "start");
  while (!s.served && s.tick < 1500) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.ok(s.achievements.unlocked["orders-1"]);
  const earnedAt = s.achievements.unlocked["orders-1"].tick;
  s.money = 1500;
  updateAchievements(s);
  s.money = 0;
  updateAchievements(s);
  const restored = clone(s);
  updateAchievements(restored);
  assert.equal(restored.achievements.unlocked["orders-1"].tick, earnedAt);
  assert.ok(restored.achievements.unlocked["savings-1500"]);
  assert.ok(
    !retirementRequirements(restored).find((r) => r.id === "fund").complete,
  );
  assert.deepEqual(fresh().achievements.unlocked, {});
});
test("catalog equipment, upgrades, team and production unlock from authoritative state", () => {
  const s = fresh();
  s.tools = Object.fromEntries(Object.keys(TOOLS).map((id) => [id, 2]));
  s.vehicles = Object.keys(TRANSPORT);
  s.transportUsage = Object.fromEntries(s.vehicles.map((id) => [id, 1]));
  s.crew = Array.from({ length: 3 }, () => ({
    vehicles: ["bike"],
    wageArrears: 0,
  }));
  s.construction.stage = "complete";
  s.production.expanded = true;
  s.production.produced = 24;
  s.schedule.totalNightDeliveries = 2;
  s.money = s.retirement.target;
  updateAchievements(s);
  for (const id of [
    "tool-master",
    "fleet-master",
    "team-ready",
    "production-24",
    "retirement-ready",
  ])
    assert.ok(s.achievements.unlocked[id], id);
  assert.ok(!s.achievements.unlocked.retired);
  s.crew[0].wageArrears = 1;
  assert.ok(!retirementRequirements(s).every((r) => r.complete));
  assert.ok(s.achievements.unlocked["team-ready"]);
  s.crew[0].wageArrears = 0;
  s.retirement.target += 2500;
  assert.ok(!retirementRequirements(s).find((r) => r.id === "fund").complete);
});
test("legacy recognition is marked honestly and does not affect future unlocks", () => {
  const s = fresh();
  delete s.achievements;
  s.served = 10;
  s.tick = 999;
  updateAchievements(s, { backfill: true });
  assert.equal(s.achievements.unlocked["orders-10"].backfilled, true);
  s.served = 50;
  updateAchievements(s);
  assert.equal(s.achievements.unlocked["orders-50"].backfilled, false);
  assert.ok(ACHIEVEMENT_BY_ID["orders-50"]);
});

test("discoveries reveal one prerequisite at a time and collection never satisfies a new run", async () => {
  const { achievementDiscovery, achievementLayout } =
    await import("../shared/achievements.js");
  const s = fresh();
  assert.equal(
    achievementDiscovery(ACHIEVEMENT_BY_ID["orders-1"], s).hidden,
    false,
  );
  assert.equal(
    achievementDiscovery(ACHIEVEMENT_BY_ID["orders-10"], s).hidden,
    true,
  );
  s.achievementCollection = {
    unlocked: { "orders-1": { tick: 20, seed: 41 } },
  };
  const next = achievementDiscovery(ACHIEVEMENT_BY_ID["orders-10"], s);
  assert.equal(next.hidden, false);
  assert.deepEqual(next.blockedBy, ["orders-1"]);
  assert.equal(
    achievementDiscovery(ACHIEVEMENT_BY_ID["orders-50"], s).hidden,
    true,
  );
  s.served = 10;
  updateAchievements(s);
  assert.equal(
    achievementDiscovery(ACHIEVEMENT_BY_ID["orders-50"], s).hidden,
    false,
  );
  for (const branch of new Set(ACHIEVEMENTS.map((a) => a.branch))) {
    const layout = achievementLayout(branch);
    const positions = new Map(layout.nodes.map((a) => [a.id, a]));
    for (const a of layout.nodes) {
      for (const parent of a.requires.filter((id) => positions.has(id)))
        assert.ok(positions.get(parent).x < a.x);
      assert.ok(a.x + 184 < layout.width);
      assert.ok(a.y + 96 < layout.height);
    }
    assert.equal(
      new Set(layout.nodes.map((a) => `${a.x},${a.y}`)).size,
      layout.nodes.length,
    );
  }
});

test("three actual seeded runs unlock different challenge trophies", () => {
  const collected = new Set();
  for (const seed of [42, 43, 44]) {
    const s = fresh(seed);
    command(s, "start");
    while (s.served < 50 && s.tick < 20000) {
      if (!s.brandon.action) begin(s, baseline(s));
      step(s);
    }
    assert.equal(s.served, 50, `seed ${seed}`);
    const earned = Object.keys(s.achievements.unlocked).filter((id) =>
      id.startsWith("seed-"),
    );
    assert.equal(earned.length, 1);
    earned.forEach((id) => collected.add(id));
  }
  assert.equal(collected.size, 3);
});

test("all nonexclusive trophies are reachable through a real career and a continued chapter", () => {
  const s = fresh(42);
  command(s, "start");
  let chapters = 0;
  const reachable = ACHIEVEMENTS.filter(
    (a) => a.seedClass == null || a.seedClass === 0,
  );
  while (s.tick < 120000) {
    if (s.status === "complete") {
      command(s, "extend");
      command(s, "start");
      chapters++;
    }
    const missing = reachable.filter((a) => !s.achievements.unlocked[a.id]);
    if (!missing.length) break;
    const outpost = missing.find(
      (a) => a.id.startsWith("outpost-") && !s.outposts[a.id.slice(8)],
    );
    if (chapters && outpost && !s.brandon.action && !s.request)
      command(s, "prefer", outpost.id.replace("outpost-", "expand_"));
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.equal(chapters, 1);
  assert.deepEqual(
    reachable.filter((a) => !s.achievements.unlocked[a.id]).map((a) => a.id),
    [],
  );
  assert.equal(
    Object.keys(s.achievements.unlocked).length,
    ACHIEVEMENTS.length - 2,
  );
});
