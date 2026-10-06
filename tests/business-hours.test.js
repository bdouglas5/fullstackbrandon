import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  step,
  begin,
  baseline,
  worldTime,
  command,
} from "../shared/engine.js";
import { updateSchedule } from "../shared/realism.js";
import {
  ordersOpen,
  visibleOrders,
  simulationSpeed,
  clockOut,
  shiftEnded,
} from "../shared/business-hours.js";
import { advanceOrderNotifications } from "../src/order-notifications.js";
import { makeDecider } from "../server/jev.js";

function atTime(tick) {
  const s = fresh(42);
  s.tick = tick;
  s.world = worldTime(tick, s.seed);
  s.status = "running";
  updateSchedule(s, 1440);
  return s;
}

test("off-hours hide saved orders and reopening restores the same requests", () => {
  const s = atTime(600); // Monday 18:00
  const requests = structuredClone(s.customerQueue);
  assert.ok(requests.length);
  assert.equal(ordersOpen(s), false);
  assert.deepEqual(visibleOrders(s), []);
  const arrivals = s.arrivals;
  const waiting = s.customerQueue.map((o) => o.serviceWait);
  for (let i = 0; i < 60; i++) step(s);
  assert.equal(s.arrivals, arrivals);
  assert.deepEqual(
    s.customerQueue.map((o) => o.serviceWait),
    waiting,
  );
  assert.deepEqual(
    s.customerQueue.map((o) => o.id),
    requests.map((o) => o.id),
  );
  s.tick = 1439;
  s.world = worldTime(s.tick, s.seed);
  step(s); // Tuesday 08:00
  assert.equal(ordersOpen(s), true);
  assert.ok(
    requests.every((request) =>
      visibleOrders(s).some((o) => o.id === request.id),
    ),
  );
});

test("weekends hide orders and normal evening delivery hours reopen them", () => {
  const s = atTime(240); // Monday noon
  s.schedule.phase = "night_deliveries";
  assert.equal(ordersOpen(s), true);
  s.schedule.phase = "weekend";
  assert.equal(ordersOpen(s), false);
});

test("Brandon's break hides bubbles even with employees working; return animates pending requests afresh", () => {
  const s = atTime(240);
  s.crew = [{ labor: { status: "working" } }];
  let notices = advanceOrderNotifications(null, s, 0);
  assert.ok(notices.items.length);
  s.brandon.labor = { status: "rest_break", breakRemaining: 2, pending: [] };
  notices = advanceOrderNotifications(notices, s, 1000);
  assert.deepEqual(notices.items, []);
  assert.equal(simulationSpeed(s), 1);
  s.brandon.labor.status = "working";
  s.brandon.labor.breakRemaining = 0;
  notices = advanceOrderNotifications(notices, s, 2000);
  assert.equal(notices.items.length, s.customerQueue.length);
  assert.ok(
    notices.items.every(
      (o) =>
        o.status === "pending" &&
        o.appearedAt === 2000 &&
        o.fulfilledAt === null,
    ),
  );
});

test("sleep doubles each selected pace without changing it and waking restores it", () => {
  const s = atTime(900);
  s.customerQueue = [];
  s.brandon.homeRoutine = { phase: "sleeping" };
  clockOut(s);
  for (const speed of [1, 2, 4, 8]) {
    s.speed = speed;
    assert.equal(simulationSpeed(s), speed * 2);
    assert.equal(s.speed, speed);
  }
  s.tick = 1440;
  s.world = worldTime(s.tick, s.seed);
  updateSchedule(s, 1440);
  s.brandon.labor = { status: "working", pending: [], breakRemaining: 0 };
  assert.equal(ordersOpen(s), false, "opening hours alone do not wake Brandon");
  s.customerQueue = fresh(42).customerQueue;
  begin(s, baseline(s));
  assert.equal(s.brandon.homeRoutine.phase, "exiting");
  assert.equal(simulationSpeed(s), 8);
  assert.equal(ordersOpen(s), true);
});

test("travelling home and combat keep the selected pace until Brandon is resting", () => {
  const s = atTime(900);
  s.customerQueue = [];
  s.speed = 4;
  s.brandon.action = "rest";
  s.brandon.target = "home";
  s.brandon.move = { to: "home" };
  clockOut(s);
  assert.equal(simulationSpeed(s), 4);
  assert.equal(ordersOpen(s), false);
  s.brandon.move = null;
  assert.equal(simulationSpeed(s), 8);
  s.brandon.combat = { phase: "attack" };
  assert.equal(simulationSpeed(s), 4);
});

test("thinking, breaks and daytime visits home never end a shift", () => {
  const s = atTime(240);
  s.brandon.node = "home";
  for (const routine of [null, { phase: "entering" }, { phase: "sleeping" }]) {
    s.brandon.homeRoutine = routine;
    assert.equal(clockOut(s), false);
    assert.equal(shiftEnded(s), false);
    assert.equal(simulationSpeed(s), 1);
    assert.throws(() => command(s, "next_shift"), /clocks out/);
  }
  s.brandon.labor = { status: "meal_break", breakRemaining: 10, pending: [] };
  assert.equal(clockOut(s), false);
  assert.equal(shiftEnded(s), false);
});

test("end-of-shift rest clocks out once after work finishes, then advances to evening service", () => {
  const s = atTime(600);
  s.brandon.action = "collect";
  assert.equal(clockOut(s), false);
  s.brandon.action = null;
  s.customerQueue = [];
  assert.equal(
    shiftEnded(s),
    false,
    "schedule alone is not a clock-out decision",
  );
  assert.ok(begin(s, "rest"));
  assert.equal(shiftEnded(s), true);
  assert.equal(s.events.filter((e) => e.type === "clock_out").length, 1);
  assert.equal(clockOut(s), false);
  command(s, "next_shift");
  assert.equal(s.daytimeUntil, 720); // Monday 20:00
  while (s.tick < 720) step(s);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.brandon.shift.status, "working");
  assert.equal(simulationSpeed(s), 1);
  assert.equal(s.daytimeUntil, null);
});

test("Friday night clock-out skips the weekend and resumes Monday's shift", () => {
  const s = atTime(4 * 1440 + 840);
  s.customerQueue = [];
  assert.equal(clockOut(s), true);
  command(s, "next_shift");
  assert.equal(s.daytimeUntil, 7 * 1440);
  while (s.tick < 7 * 1440) step(s);
  assert.equal(s.world.day, 8);
  assert.equal(s.world.hour, 8);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.daytimeUntil, null);
});

test("Jev explicitly ends off-hours shifts without asking the model to choose more work", async () => {
  const s = atTime(840);
  s.customerQueue = [];
  s.controller = "jev";
  const decide = makeDecider(null, {
    key: "test",
    fetcher: () => {
      throw new Error("Clock-out must not request model work");
    },
  });
  const choice = await decide(s, "test-session");
  assert.equal(choice.action, "rest");
  assert.match(choice.fallback, /Clocking out/);
  assert.ok(begin(s, choice.action, choice));
  assert.equal(shiftEnded(s), true);
});

test("outstanding deliveries finish after closing before clock-out locks work", () => {
  const s = atTime(600);
  s.customerQueue = [
    s.customerQueue.find((o) => o.island === "home" && !o.requires),
  ];
  s.carry = 12;
  const action = baseline(s);
  assert.match(action, /^serve_/);
  assert.equal(clockOut(s), false);
  assert.throws(() => command(s, "next_shift"), /clocks out/);
  assert.ok(begin(s, action));
  for (let i = 0; i < 100 && s.brandon.action; i++) step(s);
  assert.equal(s.customerQueue.length, 0);
  // Leave the customer's building before ending the shift.
  while (s.brandon.buildingVisit) step(s);
  assert.equal(baseline(s), "rest");
  // The ride home takes real time; with the night quota met the next shift is
  // tomorrow's, so arriving after 20:00 does not wake him straight back up.
  s.schedule.nightDelivered = s.schedule.nightQuota;
  assert.ok(begin(s, "rest"));
  assert.equal(shiftEnded(s), true);
  while (s.brandon.homeRoutine?.phase !== "sleeping") step(s);
  assert.equal(s.brandon.action, "rest");
  s.request = "buy_bike";
  assert.equal(baseline(s), "rest");
  assert.equal(begin(s, "buy_bike"), false);
  assert.equal(begin(s, "collect"), false);
  assert.equal(s.brandon.homeRoutine.phase, "sleeping");
  command(s, "next_shift");
  while (s.tick < s.brandon.shift.nextShiftAt) step(s);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.brandon.shift.status, "working");
});

test("the morning shortcut keeps Brandon clocked out through the evening shift", () => {
  const s = atTime(600);
  s.customerQueue = [];
  assert.ok(clockOut(s));
  command(s, "next_shift", "morning");
  assert.equal(s.daytimeUntil, 1440);
  s.tick = 719;
  step(s);
  assert.equal(shiftEnded(s), true);
  assert.equal(baseline(s), "rest");
  assert.equal(s.daytimeUntil, 1440);
  s.tick = 1439;
  step(s);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.brandon.shift.status, "working");
  assert.equal(s.world.hour, 8);
});

test("stock-blocked evening backlog clocks out once, sleeps, then resumes paid deliveries", () => {
  const s = atTime(1216); // Tuesday 04:16 (20:16 elapsed in the decision log)
  s.operations.shipments = [
    {
      id: "tomorrow-stock",
      kind: "pickles",
      cases: 6,
      remaining: 6,
      status: "at_sea",
      orderedAt: 500,
      departsAt: 1395,
      arrivesAt: 1440,
      arrivalDay: 2,
      arrivalHour: 8,
      portNode: "harbor_dock",
    },
  ];
  s.carry = s.cafe = s.harbor = 0;
  Object.assign(s.operations, {
    oldWarehouse: 0,
    islandPort: 0,
    inboundCarry: 0,
    resourceCarry: 0,
  });
  const ids = s.customerQueue.map((o) => o.id);
  assert.equal(baseline(s), "rest");
  assert.ok(begin(s, baseline(s)));
  const decisions = s.decisionCount;
  while (s.tick < 1439) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.equal(s.decisionCount, decisions);
  assert.equal(s.brandon.homeRoutine.phase, "sleeping");
  assert.equal(s.brandon.shift.nextShiftAt, 1440);
  assert.deepEqual(
    s.customerQueue.map((o) => o.id),
    ids,
  );
  step(s);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.brandon.action, null);
  assert.equal(baseline(s), "pickup_shipment");
  const served = s.served;
  while (s.tick < 2200 && s.served === served) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.ok(
    s.served > served,
    "saved requests resume after the shipment is unloaded",
  );
});

test("a daytime supply wait stays one decision and ends when stock becomes available", () => {
  const s = atTime(0);
  s.carry = s.cafe = s.harbor = 0;
  s.money = 0;
  s.scrap = 10;
  s.tools.cooler = 1;
  Object.assign(s.operations, { oldWarehouse: 0, islandPort: 0 });
  s.operations.shipments = [
    {
      id: "pending",
      kind: "pickles",
      cases: 6,
      remaining: 6,
      status: "at_sea",
      orderedAt: -45,
      departsAt: -45,
      arrivesAt: 60,
      arrivalDay: 1,
      arrivalHour: 9,
      portNode: "harbor_dock",
    },
  ];
  assert.equal(baseline(s), "wait");
  const d = begin(s, "wait");
  assert.match(d.reason, /paid shipment/);
  while (s.tick < 59) step(s);
  assert.equal(s.brandon.action, "wait");
  assert.equal(s.decisionCount, 1);
  step(s);
  assert.equal(s.brandon.action, null);
  assert.equal(baseline(s), "pickup_shipment");
  assert.match(d.outcome, /Waiting ended/);
  assert.equal(d.completedAt, 60);
});
