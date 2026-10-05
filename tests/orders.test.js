import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  begin,
  step,
  baseline,
  command,
  legal,
  nearestOrder,
  normalizeOrders,
  inventoryTotal,
  PEOPLE,
  NODES,
} from "../shared/engine.js";

function isolated() {
  const s = fresh(42);
  Object.assign(s, {
    status: "running",
    customerQueue: [],
    queue: [],
    arrivals: 0,
  });
  return s;
}
function enqueue(s, customerId, cases) {
  const person = PEOPLE.find((p) => p.id === customerId);
  const order = {
    ...person,
    customerId,
    id: `test-${s.arrivals++}`,
    cases,
    arrived: s.tick,
    assigned: null,
  };
  s.customerQueue.push(order);
  s.queue.push(s.tick);
  return order;
}
function carry(s, cases) {
  s.cafe -= cases;
  s.carry += cases;
}
function placeAt(s, customerId) {
  const person = PEOPLE.find((p) => p.id === customerId);
  s.brandon.node = person.node;
  s.brandon.position = [...NODES[person.node]];
}
function finish(s, action) {
  assert.ok(begin(s, action), action);
  for (let i = 0; i < 1000 && s.brandon.action; i++) step(s);
  assert.equal(s.brandon.action, null);
}

test("generated orders use multiple cases and never duplicate a waiting business", () => {
  const s = isolated();
  command(s, "rush");
  command(s, "rush");
  for (let i = 0; i < 500; i++) step(s);
  assert.equal(
    new Set(s.customerQueue.map((order) => order.customerId)).size,
    s.customerQueue.length,
  );
  assert.ok(s.customerQueue.some((order) => order.cases > 1));
  assert.ok(
    s.customerQueue.every((order) => order.cases >= 1 && order.cases <= 3),
  );
  assert.equal(s.arrivals, s.served + s.customerQueue.length);
});

test("a delivery consumes all cases in one order and records one completion", () => {
  const s = isolated();
  const order = enqueue(s, "cleo", 3);
  placeAt(s, "cleo");
  carry(s, 2);
  assert.ok(!legal(s).includes("serve_cleo"));
  assert.equal(begin(s, "serve_cleo"), false);
  assert.equal(s.served, 0);
  carry(s, 1);
  finish(s, "serve_cleo");
  assert.equal(s.carry, 0);
  assert.equal(s.served, 1);
  assert.equal(s.casesDelivered, 3);
  assert.equal(s.customerHistory[0].id, order.id);
  assert.equal(s.customerHistory[0].cases, 3);
  assert.equal(s.customerQueue.length, 0);
  assert.equal(inventoryTotal(s), s.initial);
});

test("dispatch serves the nearest complete order instead of the oldest or a partial order", () => {
  const s = isolated();
  enqueue(s, "theo", 1);
  const close = enqueue(s, "cleo", 3);
  placeAt(s, "cleo");
  carry(s, 2);
  assert.equal(nearestOrder(s).customerId, "theo");
  assert.equal(baseline(s), "serve_theo");
  carry(s, 1);
  assert.equal(nearestOrder(s).id, close.id);
  assert.equal(baseline(s), "serve_cleo");
  close.assigned = "crew-0";
  assert.equal(nearestOrder(s).customerId, "theo");
});

test("after a handoff remaining cargo goes to the next nearest complete order", () => {
  const s = isolated();
  s.tools.cargo_rack = 1;
  enqueue(s, "theo", 2);
  enqueue(s, "cleo", 3);
  placeAt(s, "cleo");
  carry(s, 5);
  finish(s, baseline(s));
  assert.equal(s.carry, 2);
  assert.equal(baseline(s), "serve_theo");
  assert.equal(inventoryTotal(s), s.initial);
});

test("island orders respect the full transport capacity and choose a capable boat", () => {
  const s = isolated();
  s.vehicles = ["jetpack"];
  s.preferredTransport = "jetpack";
  s.storm = false;
  enqueue(s, "tess", 3);
  carry(s, 3);
  assert.ok(!legal(s).includes("serve_tess"));
  s.vehicles.push("sailboat");
  assert.ok(begin(s, "serve_tess"));
  assert.equal(s.brandon.transport, "sailboat");
});

test("legacy duplicates merge without losing cases, courier assignment or inventory", () => {
  const s = isolated();
  const first = enqueue(s, "cleo", 1);
  const assigned = enqueue(s, "cleo", 1);
  delete first.cases;
  delete assigned.cases;
  delete s.orderSchemaVersion;
  delete s.casesDelivered;
  assigned.assigned = "brandon";
  s.brandon.orderId = assigned.id;
  const total = inventoryTotal(s);
  normalizeOrders(s);
  assert.equal(s.customerQueue.length, 1);
  assert.equal(s.customerQueue[0].id, assigned.id);
  assert.equal(s.customerQueue[0].cases, 2);
  assert.equal(s.brandon.orderId, assigned.id);
  assert.equal(s.arrivals, s.served + s.queue.length);
  assert.equal(inventoryTotal(s), total);
  assert.deepEqual(normalizeOrders(s), s);
});

test("satellite inventory never fulfills customer orders without a physical courier", () => {
  const s = isolated();
  enqueue(s, "amara", 3);
  s.outposts.juniper = { stock: 2, served: 0, earned: 0 };
  s.cafe -= 2;
  for (let i = 0; i < 12; i++) step(s);
  assert.equal(s.served, 0);
  assert.equal(s.outposts.juniper.stock, 2);
  s.outposts.juniper.stock++;
  s.cafe--;
  for (let i = 0; i < 12; i++) step(s);
  assert.equal(s.served, 0);
  assert.equal(s.casesDelivered, 0);
  assert.equal(s.outposts.juniper.stock, 3);
  assert.equal(inventoryTotal(s), s.initial);
});

test("saved island voyages redock with all stock retained and current business addresses", () => {
  const s = isolated();
  const order = enqueue(s, "tess", 2);
  order.position = [13, 14.4];
  order.assigned = "brandon";
  carry(s, 3);
  s.carry--;
  s.brandon.stowedCargo = 1;
  Object.assign(s.brandon, {
    action: "serve_tess",
    orderId: order.id,
    voyage: { mode: "sailboat" },
  });
  delete s.layoutVersion;
  const total = inventoryTotal(s);
  normalizeOrders(s);
  assert.equal(s.brandon.voyage, null);
  assert.equal(s.brandon.action, null);
  assert.equal(s.brandon.orderId, null);
  assert.equal(order.assigned, null);
  assert.equal(s.served, 0);
  assert.equal(s.carry, 3);
  assert.deepEqual(s.brandon.position, NODES.harbor_dock);
  assert.deepEqual(
    order.position,
    PEOPLE.find((person) => person.id === "tess").position,
  );
  assert.equal(inventoryTotal(s), total);
});

test("couriers physically replenish the packing room for complete multi-case orders", () => {
  const s = isolated();
  s.harbor += s.cafe;
  s.cafe = 0;
  s.operations.origin = "cafe";
  s.office.stage = "complete";
  s.brandon.node = "home";
  s.brandon.position = [...NODES.home];
  enqueue(s, "bea", 3);
  s.crew.push({
    ...structuredClone(s.brandon),
    id: "crew-0",
    name: "Alex",
    efficiency: 0.68,
    vehicles: [],
    wagePerDay: 6,
    paidDay: 1,
    wageArrears: 0,
    node: "cafe",
    position: [...NODES.cafe],
  });
  let collected = false;
  for (
    let i = 0;
    i < 1200 && !s.customerHistory.some((order) => order.customerId === "bea");
    i++
  ) {
    step(s);
    collected ||= s.crew[0].action === "restock";
    assert.equal(inventoryTotal(s), s.initial);
  }
  assert.ok(collected);
  assert.ok(s.crew[0].deliveries > 0);
  assert.ok(
    s.customerHistory.some(
      (order) => order.customerId === "bea" && order.cases === 3,
    ),
  );
});
