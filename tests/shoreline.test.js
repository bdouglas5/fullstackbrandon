import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fresh, begin, step, NODES } from "../shared/engine.js";
import { SHORELINE, shorelineCollection } from "../shared/shoreline.js";
import { destinationApproach } from "../src/navigation-path.js";
import { createShorelineWorld } from "../src/world-shoreline.js";
import { createFigurine } from "../src/figurine.js";
import { animateCharacter } from "../src/world-animation.js";

function cleanupRun(stock = 24) {
  const state = fresh(42);
  state.status = "running";
  state.salvageStock = stock;
  state.brandon.node = "garden";
  state.brandon.position = [...NODES.garden];
  assert.ok(begin(state, "salvage"));
  return state;
}
test("shoreline cleanup walks off the road, collects only on shore, and returns without losing plastic", () => {
  const s = cleanupRun();
  let sawApproach = false,
    sawPickup = false;
  const initial = s.salvageStock;
  for (let i = 0; i < 150 && s.brandon.action; i++) {
    step(s);
    const visit = s.brandon.buildingVisit;
    if (visit?.phase === "entering") {
      sawApproach = true;
      assert.equal(s.scrap, 0);
      assert.equal(s.brandon.work, 0);
    }
    if (visit?.phase === "inside") {
      sawPickup = true;
      assert.deepEqual(s.brandon.position, SHORELINE.position);
    }
  }
  assert.ok(sawApproach && sawPickup);
  assert.equal(s.scrap, 6);
  assert.equal(s.shorelineCleaned, 6);
  assert.equal(s.salvageStock, initial - 6);
  assert.equal(s.brandon.buildingVisit.phase, "exiting");
  for (let i = 0; i < 100 && s.brandon.buildingVisit; i++) step(s);
  assert.equal(s.brandon.buildingVisit, null);
  assert.deepEqual(s.brandon.position, NODES.garden);
  assert.equal(s.scrap, 6);
  assert.deepEqual(
    destinationApproach({ action: "salvage", target: "garden" }, s).at(-1),
    [SHORELINE.position[0], 0.43, SHORELINE.position[1]],
  );
});
test("partial shoreline stock awards only the plastic actually available", () => {
  const s = cleanupRun(2);
  for (let i = 0; i < 150 && s.brandon.action; i++) step(s);
  assert.equal(s.scrap, 2);
  assert.equal(s.shorelineCleaned, 2);
  assert.equal(s.salvageStock, 0);
});
test("plastic disappears during pickup, bag is visible, and reduced motion stays finite", () => {
  const w = { world: new THREE.Group() };
  const visual = createShorelineWorld(w);
  const s = cleanupRun();
  for (let i = 0; i < 100 && s.brandon.buildingVisit?.phase !== "inside"; i++)
    step(s);
  s.brandon.work = 9;
  const motion = {
    position: new THREE.Vector3(
      ...[SHORELINE.position[0], 0.43, SHORELINE.position[1]],
    ),
    facing: 0,
  };
  const status = visual.update(s, motion, 2, false);
  assert.equal(status.remaining, 21);
  assert.equal(visual.bag.visible, true);
  assert.equal(visual.lifted.visible, true);
  assert.equal(visual.pieces.filter((p) => p.visible).length, 20);
  visual.update(s, motion, 0.1, true);
  assert.ok(visual.lifted.position.toArray().every(Number.isFinite));
  s.salvageStock = 0;
  s.brandon.action = null;
  s.brandon.buildingVisit = null;
  visual.update(s, motion, 0.1, false);
  assert.equal(visual.pieces.filter((p) => p.visible).length, 0);
  assert.equal(visual.bag.visible, false);
  assert.equal(shorelineCollection(s).remaining, 0);
});
test("Brandon visibly crouches to pick up plastic with his parcel rig", () => {
  const body = createFigurine(null).body;
  const still = { moving: false, speed: 0, phase: 0, acceleration: 0 };
  const heights = [];
  for (let i = 0; i < 240; i++) {
    animateCharacter(body, still, {
      working: true,
      task: "gather",
      gatheringPlastic: true,
      dt: 1 / 60,
      time: i / 60,
    });
    heights.push(body.position.y);
  }
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 0.05,
    "cleanup includes a visible crouch and lift",
  );
});
