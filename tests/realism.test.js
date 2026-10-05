import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  begin,
  decisionReady,
  baseline,
  step,
  legal,
  command,
  inventoryTotal,
  ECONOMY,
  DAY_TICKS,
  normalizeRealism,
  NODES,
} from "../shared/engine.js";
function funded(amount = 1000) {
  const s = fresh(42);
  s.status = "running";
  s.cafe = 6;
  s.harbor = 0;
  s.operations.shipments = [];
  s.money += amount;
  s.startingMoney += amount;
  return s;
}
function act(s, action) {
  for (let i = 0; !decisionReady(s) && i < 3000; i++) step(s);
  for (let i = 0; !legal(s).includes(action) && i < DAY_TICKS * 3; i++) step(s);
  assert.ok(begin(s, action), `${action} legal at ${s.tick}`);
  for (let i = 0; s.brandon.action && i < 3000; i++) step(s);
  assert.equal(s.brandon.action, null, `${action} finishes`);
  for (let i = 0; !decisionReady(s) && i < 3000; i++) step(s);
  assert.ok(decisionReady(s), `${action} exits safely`);
}
function place(s, node) {
  s.brandon.node = node;
  s.brandon.position = [...NODES[node]];
  s.brandon.move = null;
  s.brandon.buildingVisit = null;
  s.brandon.mountedMode = "foot";
}
function ledger(s) {
  assert.equal(inventoryTotal(s), s.initial);
  assert.equal(s.money, s.startingMoney + s.earned + s.grants * 40 - s.spent);
}
test("garage startup explicitly pays for its finite opening stock and suppliers never create free cases", () => {
  const s = fresh();
  assert.equal(s.operations.origin, "home");
  assert.equal(s.office.stage, "garage");
  assert.equal(s.money, 0);
  assert.equal(s.startingMoney, 12);
  assert.equal(s.spent, 12);
  assert.equal(s.harbor, 6);
  s.status = "running";
  for (let i = 0; i < 200; i++) step(s);
  assert.equal(s.generated, 0);
  ledger(s);
});
test("paid shipment travels to port and must physically return to the business before customer use", () => {
  const s = funded(30);
  place(s, "home");
  act(s, "order_import");
  assert.equal(s.operations.importsPaid, 24);
  assert.equal(s.harbor, 0);
  const shipment = s.operations.shipments[0];
  while (s.tick < shipment.arrivesAt) step(s);
  assert.equal(s.harbor, 12);
  act(s, "pickup_shipment");
  assert.equal(s.operations.inboundCarry, 3);
  assert.equal(s.carry, 0);
  assert.equal(s.cafe, 6);
  act(s, "unload_shipment");
  assert.equal(s.cafe, 9);
  assert.equal(s.operations.inboundCarry, 0);
  ledger(s);
});
test("office construction gates employee hiring and employee vehicles cost separately", () => {
  const s = funded();
  assert.ok(!legal(s).includes("hire_employee"));
  place(s, "home");
  act(s, "build_office");
  assert.equal(s.office.stage, "building");
  while (s.office.stage !== "complete") step(s);
  assert.equal(s.operations.origin, "cafe");
  assert.equal(s.operations.oldWarehouse, 6);
  act(s, "hire_employee");
  const employee = s.crew[0];
  assert.deepEqual(employee.vehicles, []);
  assert.equal(employee.wagePerDay, 6);
  const before = s.money;
  act(s, `buy_${employee.id}_bike`);
  assert.deepEqual(employee.vehicles, ["bike"]);
  assert.equal(before - s.money, 24);
  ledger(s);
});
test("the private island requires a physical negotiated agreement and contractor construction", () => {
  const s = funded();
  s.office.stage = "complete";
  s.vehicles = ["sailboat"];
  place(s, "harbor_dock");
  assert.ok(!legal(s).includes("buy_island"));
  act(s, "negotiate_island");
  assert.equal(s.construction.deal.status, "agreed");
  assert.ok(s.construction.deal.negotiatedAt > 0);
  act(s, "buy_island");
  assert.equal(s.construction.stage, "purchased");
  act(s, "hire_contractor");
  const stages = new Set();
  while (s.construction.stage !== "complete") {
    stages.add(s.construction.stage);
    step(s);
  }
  assert.ok(
    stages.has("reclamation") &&
      stages.has("foundation") &&
      stages.has("building"),
  );
  assert.equal(s.operations.origin, "farm_shop");
  ledger(s);
});
test("seed, brine and jar kits are consumed through growing fermentation and packing before sales stock", () => {
  const s = funded();
  s.construction.stage = "complete";
  s.operations.origin = "farm_shop";
  s.production.resources = 6;
  const before = s.cafe;
  place(s, "farm_shop");
  act(s, "plant_crop");
  assert.equal(s.production.resources, 0);
  assert.equal(s.production.growing.length, 1);
  assert.equal(s.cafe, before);
  const phases = new Set();
  for (
    let i = 0;
    i < ECONOMY.growTicks + ECONOMY.fermentTicks + ECONOMY.packTicks + 3;
    i++
  ) {
    step(s);
    for (const phase of ["growing", "fermenting", "packing"])
      if (s.production[phase].length) phases.add(phase);
  }
  assert.equal(phases.size, 3);
  assert.equal(s.production.produced, 6);
  assert.equal(s.cafe, before + 6);
  ledger(s);
});
test("ten-hour shifts include real breaks, hard night cutoff, weekends and daily wages", () => {
  const s = funded();
  s.office.stage = "complete";
  act(s, "hire_employee");
  const member = s.crew[0];
  member.action = null;
  s.customerQueue = [];
  s.queue = [];
  s.arrivals = 0;
  s.tick = DAY_TICKS * 5;
  step(s);
  assert.equal(s.schedule.weekday, "Saturday");
  assert.equal(s.schedule.phase, "weekend");
  assert.equal(legal(s).includes("collect"), false);
  assert.ok(s.wages >= 12);
  s.tick = DAY_TICKS * 7 + 120;
  step(s);
  assert.equal(s.schedule.weekday, "Monday");
  assert.ok(s.brandon.labor.breakRemaining > 0);
  assert.equal(baseline(s), "rest");
  ledger(s);
});
test("puncture repair has six physical stages and transport boarding blocks motion", () => {
  const s = funded();
  s.vehicles = ["van"];
  s.vehicle = "van";
  place(s, "home");
  act(s, "collect");
  place(s, "harbor_dock");
  s.battery = 10;
  assert.ok(begin(s, "charge"));
  for (let i = 0; !s.brandon.transition && i < 20; i++) step(s);
  assert.ok(s.brandon.transition);
  const initial = [...s.brandon.position];
  step(s);
  assert.deepEqual(s.brandon.position, initial);
  command(s, "puncture");
  const stages = new Set();
  for (let i = 0; !decisionReady(s) && i < 3000; i++) step(s);
  assert.ok(begin(s, "patch"));
  while (s.brandon.action) {
    step(s);
    if (s.brandon.repair) stages.add(s.brandon.repair.phase);
  }
  assert.equal(stages.size, 6);
  assert.equal(s.flatTire, false);
  assert.equal(s.tireRepairs, 1);
  ledger(s);
});
test("migration preserves earned career state and records missing schemas without resetting money or cargo", () => {
  const s = fresh();
  delete s.realismVersion;
  delete s.operations;
  delete s.production;
  delete s.office;
  delete s.schedule;
  delete s.construction;
  s.tick = 80;
  s.money = 123;
  s.carry = 2;
  s.cafe -= 2;
  s.version = "3.1.0";
  normalizeRealism(s);
  assert.equal(s.money, 123);
  assert.equal(s.carry, 2);
  assert.equal(s.office.stage, "complete");
  assert.equal(s.version, "4.0.0");
  ledger(s);
});
test("paid weekend vacation physically visits the resort and completes a full stay before Monday boost", () => {
  const s = funded(200);
  s.vehicles = ["helicopter"];
  s.tools.winch = 1;
  s.tick = DAY_TICKS * 5;
  s.request = "vacation_resort";
  step(s);
  place(s, "helipad");
  const before = s.money;
  assert.ok(begin(s, "vacation_resort"));
  assert.equal(s.money, before - 28);
  let onShore = false,
    restingTicks = 0;
  while (s.brandon.action) {
    step(s);
    onShore ||= !!s.brandon.voyage?.onShore;
    if (s.brandon.voyage?.phase === "Resting at Sunset Bay Resort")
      restingTicks++;
  }
  assert.ok(onShore);
  assert.ok(restingTicks >= 120);
  assert.equal(s.workweek.vacation.status, "complete");
  assert.equal(s.workweek.vacations, 1);
  assert.ok(
    s.workweek.vacation.completedAt - s.workweek.vacation.arrivedAt >= 120,
  );
  ledger(s);
});
test("plain-language business requests preserve prerequisites and named employee ownership", () => {
  const s = funded();
  command(s, "chat", "buy rocket skates");
  assert.equal(s.request, "buy_rocket_skates");
  assert.equal(baseline(s), "buy_van");
  command(s, "chat", "build an office");
  assert.equal(s.request, "build_office");
  command(s, "chat", "negotiate an island deal");
  assert.equal(s.request, "negotiate_island");
  assert.equal(baseline(s), "build_office");
  s.office.stage = "complete";
  act(s, "hire_employee");
  command(s, "chat", "buy Alex a bicycle");
  assert.equal(s.request, "buy_crew-1_bike");
  assert.equal(baseline(s), "buy_crew-1_bike");
});

test("a punctured van permits a physical walking fallback and retrieval of the parked bicycle", () => {
  const s = funded();
  place(s, "workshop");
  act(s, "buy_bike");
  act(s, "buy_van");
  place(s, "home");
  s.brandon.mountedMode = "van";
  s.vehicleLocations.van = { node: "home", position: [...NODES.home] };
  s.flatTire = true;
  act(s, "ride_bike");
  assert.equal(s.brandon.node, "workshop");
  assert.equal(s.vehicle, "bike");
  assert.equal(
    s.flatTire,
    true,
    "changing vehicles does not secretly repair the tire",
  );
  assert.equal(s.vehicleLocations.van.node, "home", "parked van stays at home");
  ledger(s);
});
