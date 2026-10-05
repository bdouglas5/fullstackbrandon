import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  begin,
  baseline,
  step,
  inventoryTotal,
  NODES,
} from "../shared/engine.js";
import { planShipment } from "../shared/realism.js";
import { movementPoints, movementTrajectory } from "../src/world-motion.js";
import { resolveTrafficPositions } from "../shared/traffic.js";

test("opening stock travels from the dock to the garage before dispatch", () => {
  const s = fresh();
  s.status = "running";
  assert.equal(s.cafe, 0);
  assert.equal(s.harbor, 6);
  assert.equal(s.operations.shipments[0].status, "port");
  assert.equal(baseline(s), "pickup_shipment");
  let carried = false,
    received = false;
  for (let i = 0; i < 250 && !received; i++) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
    carried ||= s.operations.inboundCarry > 0;
    received ||= s.cafe > 0;
    assert.equal(inventoryTotal(s), 6);
    if (s.brandon.node === "harbor_dock" && !s.brandon.move) {
      assert.ok(s.brandon.position[0] >= -5.6);
      assert.ok(s.brandon.position[1] <= 15.2);
    }
  }
  assert.ok(carried && received);
  assert.equal(s.brandon.node, "home");
  assert.equal(s.generated, 0);
});

test("shipments choose dated weekday arrivals with sailing and collection lead time", () => {
  const s = fresh();
  s.cafe = 20;
  s.harbor = 0;
  const planned = planShipment(s);
  assert.equal(planned.arrivalDay, 1);
  assert.equal(planned.arrivalHour, 13);
  assert.equal(planned.departsAt, planned.arrivesAt - 45);
  s.tick = 4 * 1440 + 9 * 60; // Friday 17:00
  s.cafe = 0;
  const next = planShipment(s);
  assert.equal(next.arrivalDay, 8);
  assert.equal(next.arrivalHour, 8);
});

test("stationary service and departure updates do not revisit the road center", () => {
  const s = fresh();
  const actor = { ...s.brandon, node: "home", position: [5.9, -2.25] };
  assert.deepEqual(movementPoints(actor, actor, [5.85, -2.25], s), [
    [5.85, -2.25],
    [5.9, -2.25],
  ]);
  const departing = {
    ...actor,
    move: { from: "home", to: "workshop", progress: 0.3 },
    position: [6.7, -2.88],
  };
  assert.equal(movementPoints(actor, departing, actor.position, s).length, 2);
  const dock = { ...actor, node: "harbor_dock", position: [-5.1, 15.15] };
  assert.ok(
    movementTrajectory(null, dock, null, s).every((p) => p[1] === 0.43),
  );
});

test("crowd separation yields around Brandon without shifting his route", () => {
  const people = resolveTrafficPositions([
    { id: "brandon", mode: "foot", position: [0, 0] },
    { id: "customer", mode: "foot", position: [0, 0] },
  ]);
  assert.deepEqual(people[0].position, [0, 0]);
  assert.ok(Math.hypot(...people[1].position) >= 0.55);
});

test("garage unloading must walk inside before cases become dispatch stock", async () => {
  const { HOME_GARAGE } = await import("../shared/islands.js");
  const s = fresh();
  s.status = "running";
  s.harbor = 3;
  s.operations.inboundCarry = 3;
  s.brandon.node = "home";
  s.brandon.position = [...NODES.home];
  assert.ok(begin(s, "unload_shipment"));
  let entered = false;
  while (s.brandon.action) {
    step(s);
    if (s.brandon.buildingVisit?.phase === "entering") assert.equal(s.cafe, 0);
    if (s.brandon.buildingVisit?.phase === "inside") {
      entered = true;
      assert.deepEqual(s.brandon.position, HOME_GARAGE.inside);
    }
    assert.equal(inventoryTotal(s), 6);
  }
  assert.ok(entered);
  assert.equal(s.cafe, 3);
  assert.equal(s.operations.origin, "home");
  assert.equal(s.office.stage, "garage");
});
