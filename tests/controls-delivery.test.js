import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  begin,
  step,
  command,
  normalizeOrders,
  NODES,
  PEOPLE,
  DAY_TICKS,
  worldTime,
  normalizeWeather,
} from "../shared/engine.js";
import { HOME_BUSINESSES, businessEntrance } from "../shared/islands.js";
import { simulationSpeed, clockOut } from "../shared/business-hours.js";
import { updateSchedule } from "../shared/realism.js";
import { createFigurine } from "../src/figurine.js";
import { animateCharacter } from "../src/world-animation.js";

test("saved layout destinations and active targets migrate without losing cargo", () => {
  const s = fresh();
  s.layoutVersion = 2;
  const p = PEOPLE.find((p) => p.id === "theo");
  s.customerQueue = [
    {
      ...p,
      id: "old",
      customerId: p.id,
      node: "helipad",
      position: [14.5, -3.4],
      cases: 1,
      arrived: 0,
    },
  ];
  s.brandon.action = "serve_theo";
  s.brandon.orderId = "old";
  s.brandon.target = "helipad";
  s.carry = 2;
  normalizeOrders(s);
  assert.equal(s.customerQueue[0].node, "burger");
  assert.deepEqual(s.customerQueue[0].position, HOME_BUSINESSES.theo.position);
  assert.equal(s.brandon.target, "burger");
  assert.equal(s.carry, 2);
});

test("each local delivery enters its real shop before the order can complete, then exits", () => {
  for (const [id, business] of Object.entries(HOME_BUSINESSES)) {
    const s = fresh();
    s.status = "running";
    s.carry = 3;
    s.tools.cooler = 1;
    const p = PEOPLE.find((p) => p.id === id);
    s.customerQueue = [
      { ...p, id: "delivery", customerId: id, cases: 1, arrived: 0 },
    ];
    s.queue = [0];
    s.brandon.node = business.node;
    s.brandon.position = [...NODES[business.node]];
    assert.ok(begin(s, `serve_${id}`));
    let entered = false,
      completed = false;
    for (let i = 0; i < 80; i++) {
      step(s);
      const visit = s.brandon.buildingVisit;
      if (visit?.phase === "entering") assert.equal(s.served, 0);
      if (visit?.phase === "inside") {
        entered = true;
        assert.deepEqual(s.brandon.position, businessEntrance(business).inside);
      }
      if (s.customerHistory.some((o) => o.id === "delivery")) completed = true;
      if (completed && !visit) break;
    }
    assert.ok(entered && completed, id);
    assert.deepEqual(s.brandon.position, NODES[business.node]);
    assert.equal(s.carry, 2);
  }
});

test("creative weather choices expire and restore the natural weather front", () => {
  for (const weather of ["clear", "cloudy", "rain", "fog", "storm"]) {
    const s = fresh(42);
    s.status = "running";
    command(s, "environment", { key: "weather", value: weather });
    assert.equal(s.world.weather, weather);
    assert.equal(s.storm, weather === "storm");
    const restored = structuredClone(s);
    normalizeWeather(restored);
    assert.equal(restored.environment.weatherUntil, 180);
    for (let i = 0; i < 179; i++) {
      step(s);
      assert.equal(s.world.weather, weather);
    }
    step(s);
    assert.equal(s.world.weather, worldTime(s.tick, s.seed).weather);
    assert.equal(s.environment.weatherOverride, null);
  }
});

test("automatic weather can resume early and old off settings become temporary", () => {
  const s = fresh(42);
  command(s, "environment", { key: "weather", value: "storm" });
  command(s, "environment", { key: "soundEnabled", value: true });
  assert.equal(s.world.weather, "storm");
  command(s, "environment", { key: "weather", value: "auto" });
  assert.equal(s.world.weather, worldTime(s.tick, s.seed).weather);
  assert.equal(s.environment.soundEnabled, true);
  assert.throws(() =>
    command(s, "environment", { key: "weather", value: "snow" }),
  );
  s.environment = { weatherEnabled: false };
  normalizeWeather(s);
  assert.equal(s.environment.weatherUntil, s.tick + 180);
  assert.equal(s.environment.weatherOverride, "clear");
  normalizeWeather(s);
  assert.equal(s.environment.weatherUntil, s.tick + 180);
  s.environment = { storm: true, rain: false, clouds: 0 };
  s.stormOverride = true;
  normalizeWeather(s);
  assert.equal(s.environment.weatherEnabled, true);
  assert.equal(s.environment.weatherOverride, null);
  assert.equal(s.stormOverride, null);
});

test("weather fronts vary in length and do not repeat daily or across seeds", () => {
  const sequence = (seed) =>
    Array.from({ length: 4000 }, (_, tick) => worldTime(tick, seed).weather);
  const a = sequence(42);
  assert.deepEqual(a, sequence(42));
  assert.notDeepEqual(a, sequence(43));
  assert.notDeepEqual(a.slice(0, 1440), a.slice(1440, 2880));
  assert.equal(new Set(a).size, 5);
  const changes = a.flatMap((w, i) => (i && w !== a[i - 1] ? [i] : []));
  assert.ok(new Set(changes.slice(1).map((n, i) => n - changes[i])).size > 3);
});

test("daytime advances the simulation to morning and restores the chosen pace", () => {
  const s = fresh();
  s.customerQueue = [];
  s.status = "paused";
  s.speed = 4;
  s.tick = 840;
  s.world.hour = 22;
  s.world.phase = "night";
  s.brandon.node = "home";
  s.brandon.action = null;
  s.brandon.homeRoutine = { phase: "sleeping" };
  updateSchedule(s, DAY_TICKS);
  clockOut(s);
  command(s, "next_shift");
  assert.equal(s.daytimeUntil, DAY_TICKS);
  assert.equal(simulationSpeed(s), 64);
  s.tick = s.daytimeUntil - 1;
  step(s);
  assert.equal(s.world.hour, 8);
  assert.equal(s.daytimeUntil, null);
  assert.equal(simulationSpeed(s), 4);
});

test("backpack fills bottom up and unloads top down without a parcel in the hands", () => {
  const body = createFigurine(null).body;
  const frame = (n) =>
    animateCharacter(body, { moving: false }, { cargoCount: n, dt: 0.12 });
  frame(3);
  frame(3);
  frame(3);
  const boxes = body
    .getObjectByName("backpack")
    .children.filter((o) => o.name === "Backpack cargo case");
  assert.deepEqual(
    boxes.map((b) => b.visible),
    [true, true, true],
  );
  assert.ok(
    boxes[0].position.y < boxes[1].position.y &&
      boxes[1].position.y < boxes[2].position.y,
  );
  frame(1);
  assert.deepEqual(
    boxes.map((b) => b.visible),
    [true, true, false],
  );
  frame(1);
  assert.deepEqual(
    boxes.map((b) => b.visible),
    [true, false, false],
  );
  assert.equal(body.getObjectByName("carried parcel").visible, false);
});

test("bike dismount holds position then leaves the bike parked during the dock approach", () => {
  const s = fresh(42);
  s.status = "running";
  s.vehicles.push("bike", "sailboat");
  s.orchard = 4;
  s.initial += 4;
  s.vehicle = "bike";
  s.brandon.vehicle = "bike";
  s.brandon.mountedMode = "bike";
  assert.ok(begin(s, "sail"));
  let parked,
    walked = 0,
    held = 0;
  for (let i = 0; i < 300 && !s.brandon.voyage; i++) {
    const before = [...s.brandon.position];
    const wasTransitioning = !!s.brandon.transition;
    const beforeProgress = s.brandon.move?.progress;
    step(s);
    if (s.brandon.transition || wasTransitioning) {
      assert.deepEqual(s.brandon.position, before);
      held++;
    }
    if (
      s.brandon.move?.docking &&
      s.brandon.mountedMode === "foot" &&
      !s.brandon.transition
    ) {
      parked ||= [...s.vehicleLocations.bike.position];
      assert.deepEqual(s.vehicleLocations.bike.position, parked);
      const distance = Math.hypot(
        ...s.brandon.position.map((n, i) => n - before[i]),
      );
      if (beforeProgress != null)
        assert.ok(s.brandon.move.progress - beforeProgress <= 0.480001);
      if (distance > 0) walked++;
    }
  }
  assert.ok(held > 0 && walked > 0);
  assert.ok(s.brandon.voyage);
});
