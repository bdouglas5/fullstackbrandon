import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  begin,
  step,
  command,
  NODES,
  PEOPLE,
  route,
  decisionReady,
  clone,
} from "../shared/engine.js";
import { OIL, liveSpills } from "../shared/hazards.js";
import { businessEntrance, HOME_BUSINESSES } from "../shared/islands.js";
import { createFigurine } from "../src/figurine.js";
import { applyTransportTransition } from "../src/world-realism.js";
import * as THREE from "three";
import { ActorMotion } from "../src/world-motion.js";
import { animateCharacter } from "../src/world-animation.js";

function fixture(mode) {
  const s = fresh(42);
  s.status = "running";
  s.office.stage = "complete";
  s.operations.origin = "cafe";
  s.operations.shipments = [];
  s.brandon.node = "cafe";
  s.brandon.position = [...NODES.cafe];
  s.tools.cooler = 1;
  s.vehicles = mode === "foot" ? [] : [mode];
  s.vehicle = mode;
  s.brandon.mountedMode = mode;
  if (mode !== "foot")
    s.vehicleLocations[mode] = { node: "cafe", position: [...NODES.cafe] };
  s.carry = 3;
  s.cafe = 8;
  s.customerQueue = ["cleo", "maya"].map((id, i) => ({
    ...PEOPLE.find((p) => p.id === id),
    customerId: id,
    id: `audit-${i}`,
    arrived: 0,
    cases: i === 0 ? 2 : 1,
    assigned: null,
  }));
  s.queue = [0, 0];
  s.arrivals = 2;
  return s;
}
function until(s, done, limit = 600) {
  for (let i = 0; i < limit; i++) {
    if (done()) return;
    step(s);
  }
  assert.fail("interaction failed to finish");
}
for (const mode of ["foot", "bike", "van", "rocket_skates"]) {
  for (const kit of [0, 1, 2])
    test(`${mode}, spill kit ${kit}: interruption preserves the committed trip and cargo across reload`, () => {
      let s = fixture(mode);
      s.tools.spill_kit = kit;
      assert.ok(begin(s, "serve_cleo"));
      const path = route("cafe", s.brandon.target),
        a = NODES[path[0]],
        z = NODES[path[1]];
      const len = Math.hypot(z[0] - a[0], z[1] - a[1]);
      command(s, "place_oil", {
        x: a[0] + ((z[0] - a[0]) * 4) / len,
        z: a[1] + ((z[1] - a[1]) * 4) / len,
      });
      until(s, () => !!(s.brandon.combat || s.brandon.slip));
      const frozen = {
        action: s.brandon.action,
        work: s.brandon.work,
        progress: s.brandon.move.progress,
        cargo: s.carry,
        decision: s.brandon.decisionId,
      };
      const phases = new Set();
      do {
        if (s.brandon.combat) phases.add(s.brandon.combat.phase);
        assert.equal(decisionReady(s), false);
        assert.equal(begin(s, "rest", { controller: "jev" }), false);
        s = clone(s);
        step(s);
        assert.equal(s.brandon.action, frozen.action);
        assert.equal(s.brandon.work, frozen.work);
        if (s.brandon.combat || s.brandon.slip)
          assert.equal(s.brandon.move.progress, frozen.progress);
        assert.equal(s.carry, frozen.cargo);
        assert.equal(s.brandon.decisionId, frozen.decision);
        assert.equal(s.brandon.mountedMode, mode);
      } while (s.brandon.combat || s.brandon.slip);
      if (kit) {
        assert.deepEqual([...phases], ["dismount", "clean", "remount"]);
        assert.equal(s.hazards.cleaned, 1);
        assert.equal(s.hazards.slips, 0);
        assert.equal(liveSpills(s).length, 0);
      } else assert.equal(s.hazards.slips, 1);
      until(s, () => s.customerHistory.some((o) => o.id === "audit-0"));
      assert.equal(s.carry, 1);
      assert.equal(s.casesDelivered, 2);
    });
}
for (const mode of ["bike", "van", "rocket_skates"])
  test(`${mode}: park, enter, deliver two, exit, retrieve and board the same equipment`, () => {
    const s = fixture(mode);
    assert.ok(begin(s, "serve_cleo", { controller: "jev" }));
    until(s, () => s.brandon.buildingVisit?.phase === "inside");
    assert.equal(s.brandon.mountedMode, "foot");
    assert.equal(s.carry, 3);
    const parked = clone(s.vehicleLocations[mode]);
    assert.deepEqual(
      s.brandon.position,
      businessEntrance(HOME_BUSINESSES.cleo).inside,
    );
    until(s, () => !s.brandon.action);
    assert.equal(s.carry, 1);
    assert.equal(decisionReady(s), false);
    assert.equal(begin(s, "serve_maya", { controller: "jev" }), false);
    until(s, () => decisionReady(s));
    assert.deepEqual(s.vehicleLocations[mode], parked);
    assert.ok(begin(s, "serve_maya", { controller: "jev" }));
    until(s, () => s.brandon.transition?.to === mode);
    assert.deepEqual(s.brandon.position, parked.position);
    assert.deepEqual(s.vehicleLocations[mode], parked);
    assert.equal(s.carry, 1);
    until(s, () => s.customerHistory.some((o) => o.id === "audit-1"));
    assert.equal(s.carry, 0);
    assert.equal(s.casesDelivered, 3);
  });

test("boarding and dismounting retain every visible backpack case", () => {
  const body = createFigurine(null).body,
    root = new THREE.Group();
  root.add(body);
  const rig = { brandon: root, body, bike: new THREE.Group() };
  const motion = { position: new THREE.Vector3(), heading: 0 };
  for (const [from, to] of [
    ["foot", "bike"],
    ["bike", "foot"],
  ]) {
    for (let i = 0; i < 30; i++)
      applyTransportTransition(
        rig,
        { transition: { from, to, progress: i / 30 } },
        motion,
        { cargoCount: 3, dt: 0.1 },
      );
    const cases = body
      .getObjectByName("backpack")
      .children.filter((o) => o.name === "Backpack cargo case");
    assert.equal(cases.filter((o) => o.visible).length, 3);
  }
});

test("a road disruption waits for the current edge and never strands an orphaned trip", () => {
  const s = fixture("van");
  assert.ok(begin(s, "serve_cleo"));
  until(s, () => !!s.brandon.move && !s.brandon.transition);
  const edge = clone(s.brandon.move);
  const id = s.brandon.decisionId;
  command(s, "puncture", true);
  assert.equal(s.brandon.action, "serve_cleo");
  assert.equal(s.brandon.decisionId, id);
  assert.equal(decisionReady(s), false);
  until(s, () => decisionReady(s));
  assert.equal(s.brandon.node, edge.to);
  assert.equal(s.carry, 3);
  assert.equal(s.brandon.orderId, null);
});

test("spin recovery does not predict forward motion between server snapshots", () => {
  const s = fixture("rocket_skates"),
    b = s.brandon;
  b.move = { from: "cafe", to: "market", progress: 0, distance: 8 };
  b.slip = { elapsed: 2 };
  b.target = "market";
  b.navigationStep = 1.8;
  const motion = new ActorMotion();
  motion.update(b, s, 1 / 60);
  const start = motion.position.clone();
  for (let frame = 0; frame < 180; frame++) motion.update(b, s, 1 / 60);
  assert.equal(motion.position.distanceTo(start), 0);
});

test("boarding advances smoothly between snapshots and freezes when paused", () => {
  const rig = {
    brandon: new THREE.Group(),
    body: createFigurine(null).body,
    bike: new THREE.Group(),
  };
  const actor = {
    transition: {
      from: "foot",
      to: "bike",
      progress: 0.25,
      duration: 4,
      startedAt: 10,
    },
  };
  const motion = { position: new THREE.Vector3(), heading: 0, interval: 0.4 };
  let before = applyTransportTransition(rig, actor, motion, {
    dt: 1 / 60,
  }).progress;
  for (let i = 0; i < 20; i++) {
    const next = applyTransportTransition(rig, actor, motion, {
      dt: 1 / 60,
    }).progress;
    assert.ok(next >= before && next - before < 0.011);
    before = next;
  }
  assert.ok(before <= 0.5);
  const paused = applyTransportTransition(rig, actor, motion, {
    active: false,
    dt: 1 / 60,
  });
  assert.equal(paused.progress, before);
  assert.equal(
    applyTransportTransition(rig, actor, motion, { active: false, dt: 1 })
      .progress,
    paused.progress,
  );
});

test("rocket skating keeps the feet planted in the boots through travel, turns and stops", () => {
  const body = createFigurine(null).body;
  const marker = new THREE.Object3D();
  marker.position.y = -0.24;
  body.getObjectByName("left leg").getObjectByName("knee").add(marker);
  body.updateMatrixWorld(true);
  const foot = new THREE.Vector3();
  marker.getWorldPosition(foot);
  for (let i = 0; i < 240; i++) {
    animateCharacter(
      body,
      {
        moving: i < 120,
        speed: i < 120 ? 2 : 0,
        facing: i / 20,
        turnRate: 2,
        walkCycle: i * 0.2,
      },
      { skating: true, flying: true, cargoCount: 3, time: i / 60, dt: 1 / 60 },
    );
    body.updateMatrixWorld(true);
    assert.ok(
      marker.getWorldPosition(new THREE.Vector3()).distanceTo(foot) < 1e-8,
    );
  }
});
