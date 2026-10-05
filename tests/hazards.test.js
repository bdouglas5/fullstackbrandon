import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  command,
  step,
  begin,
  baseline,
  clone,
  inventoryTotal,
  NODES,
  DAY_TICKS,
} from "../shared/engine.js";
import { CREATURE, OIL, liveSpills } from "../shared/hazards.js";

import { PEOPLE, route } from "../shared/engine.js";
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
// Brandon starts at the cafe and delivers to Cleo along the market road. The
// returned point lies on the first road edge, past the walk to the vehicle.
let ROAD;
function roadTrip(vehicle = "van") {
  const s = isolated();
  if (vehicle !== "foot") {
    s.vehicles = [vehicle];
    s.vehicle = vehicle;
  }
  s.carry = 1;
  s.cafe--;
  enqueue(s, "cleo");
  assert.ok(begin(s, "serve_cleo"));
  const path = route("cafe", s.brandon.target);
  const [a, c] = [NODES[path[0]], NODES[path[1]]];
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  assert.ok(len >= 6, "first road edge is long enough");
  ROAD = [a[0] + ((c[0] - a[0]) * 4) / len, a[1] + ((c[1] - a[1]) * 4) / len];
  return s;
}
function run(s, until, limit = 400) {
  let n = 0;
  while (!until(s)) {
    step(s);
    assert.ok(++n < limit, "condition never reached");
  }
  return n;
}
test("oil spills snap to the road, cap at six and only exist on roads", () => {
  const s = fresh();
  command(s, "place_oil", { x: 10.4, z: -0.7 });
  assert.equal(liveSpills(s).length, 1);
  assert.equal(liveSpills(s)[0].x, 10);
  assert.throws(() => command(s, "place_oil", { x: 10, z: -0.7 }), /already/);
  assert.throws(() => command(s, "place_oil", { x: 30, z: 30 }), /road/);
  for (const z of [2.2, 3, 4, 5, 6.5, -1.7])
    try {
      command(s, "place_oil", { x: 10, z });
    } catch {}
  assert.ok(liveSpills(s).length <= OIL.max);
});
test("a van spins out on oil, sits dazed, then carries on and slips again on a second pass", () => {
  const s = roadTrip("van");
  command(s, "place_oil", { x: ROAD[0], z: ROAD[1] });
  run(s, () => s.brandon.slip);
  assert.equal(s.hazards.slips, 1);
  const spun = [...s.brandon.position];
  for (let i = 0; i < OIL.slipTicks - 1; i++) {
    step(s);
    assert.ok(s.brandon.slip, "still spinning or dazed");
    assert.deepEqual(s.brandon.position, spun);
  }
  step(s);
  assert.equal(s.brandon.slip, null);
  run(
    s,
    () =>
      s.brandon.position[0] > ROAD[0] + OIL.radius + 0.3 ||
      s.brandon.node === "market",
  );
  assert.equal(s.hazards.slips, 1, "one slip per pass");
  assert.equal(liveSpills(s).length, 1, "the oil stays");
  // Back to the start of the same trip: the oil is still there.
  s.brandon.move = null;
  s.brandon.node = "cafe";
  s.brandon.position = [...NODES.cafe];
  run(s, () => s.hazards.slips === 2);
});
test("rocket skates spin out on oil and remain equipped", () => {
  const s = roadTrip("rocket_skates");
  command(s, "place_oil", { x: ROAD[0], z: ROAD[1] });
  run(s, () => s.brandon.slip);
  assert.equal(s.brandon.mountedMode, "rocket_skates");
  run(s, () => !s.brandon.slip);
  assert.equal(s.brandon.mountedMode, "rocket_skates");
  assert.equal(s.hazards.slips, 1);
});
test("walking Brandon slips too", () => {
  const s = roadTrip("foot");
  command(s, "place_oil", { x: ROAD[0], z: ROAD[1] });
  run(s, () => s.brandon.slip);
});
test("oil dries up after a full day", () => {
  const s = fresh();
  s.status = "running";
  command(s, "place_oil", { x: 10, z: -0.7 });
  const o = liveSpills(s)[0];
  assert.equal(o.expiresAt - o.placedAt, DAY_TICKS);
  s.tick = o.expiresAt - 1;
  step(s);
  step(s);
  assert.equal(liveSpills(s).length, 0);
});
test("the spill kit makes Brandon stop, dismount and scrub the oil away", () => {
  const s = roadTrip("van");
  s.tools.spill_kit = 1;
  command(s, "place_oil", { x: ROAD[0], z: ROAD[1] });
  run(s, () => s.brandon.combat?.kind === "cleanup");
  assert.equal(s.brandon.combat.phase, "dismount");
  const phases = new Set();
  run(s, () => {
    if (s.brandon.combat) phases.add(s.brandon.combat.phase);
    return !s.brandon.combat;
  });
  assert.deepEqual([...phases], ["dismount", "clean", "remount"]);
  assert.equal(s.hazards.slips, 0);
  assert.equal(s.hazards.cleaned, 1);
  assert.equal(liveSpills(s).length, 0);
  run(s, () => s.brandon.node === "market" || !s.brandon.action);
  assert.equal(s.hazards.slips, 0);
});
test("the Pro spill kit cleans twice as fast", () => {
  const ticks = (level) => {
    const s = roadTrip("van");
    s.tools.spill_kit = level;
    command(s, "place_oil", { x: ROAD[0], z: ROAD[1] });
    run(s, () => s.brandon.combat?.phase === "clean");
    let n = 0;
    while (s.brandon.combat?.phase === "clean") {
      step(s);
      n++;
    }
    return n;
  };
  assert.equal(ticks(1), OIL.cleanTicks);
  assert.equal(ticks(2), OIL.cleanTicks / 2);
});

// ---------------------------------------------------------------------------
function sailing() {
  const s = isolated();
  s.vehicles = ["sailboat"];
  s.brandon.node = "harbor_dock";
  s.brandon.position = [...NODES.harbor_dock];
  enqueue(s, "tess");
  s.carry = 1;
  s.cafe--;
  assert.ok(begin(s, "serve_tess"));
  command(s, "creature", true);
  return s;
}
test("tentacles grab Brandon's boat for 90 to 120 ticks, then let go", () => {
  const s = sailing();
  run(s, () => s.brandon.voyage?.held, 1500);
  const hold = s.brandon.voyage.held;
  assert.ok(!s.brandon.voyage.onShore);
  const length = hold.until - hold.at;
  assert.ok(
    length >= CREATURE.holdMin && length <= CREATURE.holdMax,
    `${length}`,
  );
  const frozen = [...s.brandon.voyage.position];
  const progress = s.brandon.voyage.elapsed;
  for (let i = 0; i < length - 2; i++) step(s);
  assert.deepEqual(s.brandon.voyage.position, frozen);
  assert.equal(s.brandon.voyage.elapsed, progress);
  run(s, () => !s.brandon.voyage?.held);
  run(s, () => s.brandon.voyage?.elapsed > progress, 50);
  assert.equal(s.hazards.creature.grabs, 1);
});
test("one pickle toll frees the boat immediately and is accounted for", () => {
  const s = sailing();
  s.cafe = 12;
  run(s, () => s.brandon.voyage?.held, 1500);
  const total = inventoryTotal(s);
  command(s, "pay_toll", "brandon");
  assert.equal(s.hazards.creature.pickles, CREATURE.toll);
  assert.equal(inventoryTotal(s), total);
  run(s, () => !s.brandon.voyage?.held, 20);
  assert.throws(() => command(s, "pay_toll", "brandon"), /held/);
});
test("the toll needs pickles", () => {
  const s = sailing();
  s.cafe = 0;
  s.carry = 0;
  s.harbor = 0;
  s.operations.oldWarehouse = 0;
  run(s, () => s.brandon.voyage?.held, 1500);
  assert.throws(() => command(s, "pay_toll", "brandon"), /pickle/);
});
test("turning the creature off releases anything it holds", () => {
  const s = sailing();
  run(s, () => s.brandon.voyage?.held, 1500);
  command(s, "creature", false);
  run(s, () => !s.brandon.voyage?.held, 20);
});
test("the cargo boat is held, frozen at sea and arrives late", () => {
  const s = fresh();
  s.status = "running";
  s.money = 300;
  command(s, "creature", true);
  s.operations.shipments.push({
    id: "ship-test",
    kind: "pickles",
    cases: 6,
    remaining: 6,
    status: "at_sea",
    orderedAt: s.tick,
    departsAt: s.tick,
    arrivesAt: s.tick + 100,
    portNode: "harbor_dock",
  });
  const x = s.operations.shipments.at(-1);
  run(s, () => x.held, 200);
  const before = x.arrivesAt;
  step(s);
  assert.equal(x.arrivesAt, before + 1);
  const waited = x.held.until - s.tick;
  run(s, () => x.status === "port", 400);
  assert.ok(s.tick >= before + waited);
  assert.ok(!x.held);
});
test("hazard state survives a clone and an old save without hazards", () => {
  const s = fresh();
  delete s.hazards;
  step(clone(s));
  command(s, "place_oil", { x: 10, z: -0.7 });
  assert.equal(clone(s).hazards.spills.length, 1);
});
test("with no spot given, oil turns up at random on a road, reproducibly", () => {
  const spots = new Set();
  for (let seed = 1; seed < 12; seed++) {
    const s = fresh(seed);
    command(s, "place_oil");
    command(s, "place_oil");
    const [a, b] = liveSpills(s);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= OIL.radius);
    spots.add(`${a.x},${a.z}`);
    const again = fresh(seed);
    command(again, "place_oil");
    assert.equal(liveSpills(again)[0].x, a.x);
  }
  assert.ok(spots.size > 5, "spots vary");
  const s = fresh();
  for (let i = 0; i < OIL.max; i++) command(s, "place_oil");
  assert.throws(() => command(s, "place_oil"), /Only/);
});
