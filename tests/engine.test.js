import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  capacity,
  begin,
  decisionReady,
  baseline,
  step,
  command,
  route,
  legal,
  clone,
  metrics,
  evaluateRun,
  inventoryTotal,
  TRANSPORT,
  TOOLS,
} from "../shared/engine.js";
function run(seed = 42, changes = [], until = 120000) {
  const s = fresh(seed);
  s.status = "running";
  while (s.status === "running" && s.tick < until) {
    for (const c of changes.filter((c) => c.tick === s.tick))
      command(s, c.type, c.value);
    if (decisionReady(s))
      assert.ok(begin(s, baseline(s)), `legal baseline at ${s.tick}`);
    step(s);
    assert.equal(inventoryTotal(s), s.initial, `inventory at ${s.tick}`);
    assert.equal(
      s.money,
      s.startingMoney + s.earned + s.grants * 40 - s.spent,
      `money at ${s.tick}`,
    );
    assert.equal(s.arrivals, s.served + s.queue.length);
    assert.equal(s.queue.length, s.customerQueue.length);
    assert.ok(s.carry >= 0 && s.carry <= capacity(s));
    assert.ok(s.money >= 0 && s.harbor >= 0 && s.cafe >= 0 && s.battery >= 0);
  }
  return s;
}
test("career starts on foot with no money, vehicle, gadget, or employee", () => {
  const s = fresh();
  assert.equal(s.money, 0);
  assert.equal(s.vehicle, "foot");
  assert.deepEqual(s.vehicles, []);
  assert.deepEqual(s.tools, {});
  assert.deepEqual(s.crew, []);
  assert.equal(s.status, "ready");
  assert.ok(!legal(s).includes("sail"));
  assert.ok(!legal(s).includes("drive_van"));
  assert.ok(!legal(s).includes("buy_bike"));
  assert.equal(inventoryTotal(s), 6);
  assert.equal(s.startingMoney, 12);
  assert.equal(s.spent, 12);
});
test("closed bridge forces a genuine alternative road route", () => {
  assert.deepEqual(route("harbor", "cafe"), ["harbor", "west", "east", "cafe"]);
  assert.deepEqual(route("harbor", "cafe", true), [
    "harbor",
    "west",
    "nw",
    "ne",
    "east",
    "cafe",
  ]);
  assert.deepEqual(route("market", "cafe", false, true), [
    "market",
    "charge",
    "workshop",
    "ne",
    "east",
    "cafe",
  ]);
});
test("unattended careers retire only after the entire fleet and every Pro gadget", () => {
  for (const seed of [0, 7, 42, 99]) {
    const s = run(seed);
    assert.equal(s.status, "complete");
    assert.ok(s.money >= s.retirement.target);
    assert.equal(s.crew.length, 3);
    assert.deepEqual(s.vehicles, Object.keys(TRANSPORT));
    assert.ok(Object.keys(TOOLS).every((id) => s.tools[id] === 2));
    assert.ok(Object.keys(TRANSPORT).every((id) => s.transportUsage[id] > 0));
    assert.ok(s.crew.every((c) => c.deliveries > 0));
    assert.ok(s.rating.count > 50);
    assert.ok(s.generated > 0);
    assert.equal(s.office.stage, "complete");
    assert.equal(s.construction.stage, "complete");
    assert.equal(s.construction.deal.status, "agreed");
    assert.ok(s.production.expanded && s.production.produced >= 24);
    assert.ok(s.operations.importsPaid > 0 && s.operations.resourcesPaid > 0);
    assert.ok(
      s.crew.every(
        (c) =>
          c.vehicles.length > 0 && c.wageArrears === 0 && c.node === "home",
      ),
    );
    assert.equal(s.brandon.node, "home");
    assert.ok(s.wages > 0 && s.schedule.totalNightDeliveries >= 2);
    assert.ok(
      s.decisions.length <= 120 &&
        s.events.length <= 80 &&
        s.customerHistory.length <= 80 &&
        s.reviews.length <= 60 &&
        s.dispatch.length <= 40,
    );
  }
});
test("disrupted careers preserve ledgers and recover all the way to retirement", () => {
  for (const seed of [1, 13, 64]) {
    const s = run(seed, [
      { tick: 10, type: "bridge" },
      { tick: 40, type: "rush" },
      { tick: 80, type: "shortage" },
      { tick: 120, type: "storm" },
      { tick: 160, type: "power" },
      { tick: 210, type: "puncture" },
      { tick: 260, type: "traffic" },
      { tick: 400, type: "grant" },
    ]);
    assert.equal(s.status, "complete");
    assert.equal(s.stormOverride, null);
    assert.equal(s.flatTire, false);
    assert.ok(s.tireRepairs > 0);
    assert.ok(s.vehicles.includes("teleporter"));
  }
});
test("careers reproduce exactly from seed and recorded visitor actions", () => {
  const changes = [
    { tick: 12, type: "bridge" },
    { tick: 24, type: "rush" },
    { tick: 60, type: "objective", value: "waste" },
    { tick: 70, type: "storm" },
  ];
  const a = run(5, changes, 1100),
    b = run(5, changes, 1100);
  assert.deepEqual(a, b);
  assert.deepEqual(evaluateRun(a).metrics, metrics(a));
});
test("illegal actions cannot create supplies, vehicles, or purchases", () => {
  const s = fresh();
  for (const a of ["deliver", "repair", "invent", "buy_van", "sail", "fly"])
    assert.equal(begin(s, a), false);
  assert.equal(s.decisions.length, 0);
  assert.equal(begin(s, "pickup_shipment").action, "pickup_shipment");
  assert.equal(begin(s, "wait"), false);
  assert.equal(s.money, 0);
});
test("decision alternatives capture legal preassignment context", () => {
  const s = fresh();
  s.carry = 1;
  s.cafe--;
  const order = s.customerQueue.find((c) => !c.requires),
    a = `serve_${order.customerId}`;
  const d = begin(s, a);
  assert.ok(d.choices.includes(a));
  assert.equal(d.context.carrying, 1);
  assert.equal(order.assigned, "brandon");
  s.money = 90;
  assert.equal(d.context.money, 0);
});
test("pause freezes every actor, inventory, weather, and clock", () => {
  const s = run(42, [], 1000);
  command(s, "pause");
  const before = clone(s);
  step(s);
  assert.deepEqual(s, before);
});
test("shortages are ledger losses and have bounded repeats", () => {
  const s = fresh();
  command(s, "shortage");
  assert.equal(s.harbor, 3);
  assert.ok(s.lost > 0);
  command(s, "shortage");
  assert.equal(inventoryTotal(s), s.initial);
  assert.throws(() => command(s, "shortage"));
});
test("an interruption preserves the physical edge and its position", () => {
  const s = fresh();
  s.status = "running";
  s.brandon.node = "west";
  s.brandon.position = [-1.5, 2];
  s.carry = 1;
  s.cafe--;
  begin(s, "deliver");
  step(s);
  step(s);
  const position = [...s.brandon.position],
    edge = { ...s.brandon.move };
  command(s, "bridge");
  assert.deepEqual(s.brandon.position, position);
  assert.deepEqual(s.brandon.move, edge);
  begin(s, baseline(s));
  for (let i = 0; i < 8; i++) step(s);
  assert.notDeepEqual(s.brandon.position, position);
});
test("retirement cannot be triggered by the old tick or order limits", () => {
  const s = fresh();
  s.status = "running";
  s.limit = 1;
  s.target = 0;
  for (let i = 0; i < 10; i++) step(s);
  assert.equal(s.status, "running");
  assert.equal(s.retirement.ready, false);
});
test("visitor requests save toward a future purchase without freezing work", () => {
  const s = fresh();
  command(s, "prefer", "buy_helicopter");
  s.status = "running";
  for (let i = 0; i < 15000 && !s.vehicles.includes("helicopter"); i++) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.ok(s.vehicles.includes("helicopter"));
  assert.ok(s.served > 10);
  assert.equal(s.request, null);
  assert.ok(s.money >= 0);
  assert.ok(
    !s.vehicles.includes("van"),
    "saved for requested investment before automatic ladder",
  );
});
test("finite supply never replenishes without a paid shipment or production", () => {
  const s = fresh();
  s.status = "running";
  const opening = inventoryTotal(s);
  for (let i = 0; i < 120; i++) step(s);
  assert.equal(s.generated, 0);
  assert.equal(s.initial, opening);
  assert.equal(inventoryTotal(s), opening);
  assert.equal(s.harbor, 6);
});
test("speed is validated and changes pacing without changing simulated state", () => {
  const s = fresh();
  command(s, "speed", 8);
  assert.equal(s.speed, 8);
  assert.equal(s.tick, 0);
  assert.throws(() => command(s, "speed", 100));
});
