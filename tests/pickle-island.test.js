import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { updateBusinessWorld } from "../src/world-realism.js";
import {
  ISLAND_BOUNDS,
  quaySlot,
  QUAY_SLOTS,
  BRIDGE,
} from "../src/world-pickle-island.js";
import { NODES } from "../shared/engine.js";
import { FARM, FARM_ISLAND } from "../shared/islands.js";
import { SHORE_VECTORS } from "../src/world-water.js";

const w = buildWorld();
const done = {
  tick: 100,
  brandon: {},
  office: { stage: "complete" },
  construction: { stage: "complete", progress: 1 },
  production: { fermenting: [{ cases: 5 }], packing: [{ cases: 2 }] },
  operations: {
    islandPort: 8,
    shipments: [
      { status: "port", arrivesAt: 90, portNode: "farm_port", cases: 8 },
    ],
  },
};
const hull = () => {
  w.realism.importShip.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(
    w.realism.importShip.getObjectByName("Supplier cargo hull underbody"),
  );
};

test("the freighter lies along the back (south) quay and never overlaps the island", () => {
  updateBusinessWorld(w, done, 1, 1 / 30, true);
  const ship = hull();
  const island = {
    west: FARM.x + ISLAND_BOUNDS.west,
    east: FARM.x + ISLAND_BOUNDS.east,
    north: FARM.z + ISLAND_BOUNDS.north,
    south: FARM.z + ISLAND_BOUNDS.south,
  };
  // Behind the island, not beside it: the hull begins south of the quay with
  // a gap for the fenders, and is wider than it is deep (it lies along it).
  assert.ok(ship.min.z > island.south + 0.25, `hull ${ship.min.z} vs quay`);
  assert.ok(ship.max.x - ship.min.x > ship.max.z - ship.min.z);
  assert.ok(ship.min.z > island.north);
  // The hull is still alongside the island, not adrift beyond its length.
  assert.ok(ship.max.x > island.west && ship.min.x < island.east);
});

test("the quay node sits on the quay and the crane reaches the receiving pallets", () => {
  updateBusinessWorld(w, done, 1, 1 / 30, true);
  const [x, z] = NODES.farm_port;
  assert.ok(x > FARM.x + ISLAND_BOUNDS.west && x < FARM.x + ISLAND_BOUNDS.east);
  assert.ok(
    z < FARM.z + ISLAND_BOUNDS.south && z > FARM.z + ISLAND_BOUNDS.south - 2,
  );
  const mast = new THREE.Vector3();
  w.realism.freighter.crane.getWorldPosition(mast);
  for (let i = 0; i < QUAY_SLOTS; i++) {
    const slot = quaySlot(i);
    const reach = Math.hypot(
      FARM.x + slot[0] - mast.x,
      FARM.z + slot[2] - mast.z,
    );
    assert.ok(reach < 2.4, `slot ${i} is ${reach.toFixed(2)} from the crane`);
  }
});

test("the crane sets crates on the quay pallets while the sea hugs the new shore", () => {
  const fresh = {
    ...done,
    tick: 100,
    operations: {
      ...done.operations,
      shipments: [
        { status: "port", arrivesAt: 99, portNode: "farm_port", cases: 8 },
      ],
    },
  };
  const state = { ...fresh };
  let carried = false;
  for (let t = 0; t < 40; t += 0.1) {
    updateBusinessWorld(w, state, 8 + t, 0.1, false);
    if (w.realism.quayYard.crates.some((c) => c.visible)) carried = true;
  }
  assert.ok(carried, "a crate was lifted from the ship");
  const settled = w.realism.quayYard.crates.filter((c) => c.visible);
  assert.ok(settled.length >= 2);
  for (const crate of settled) {
    const slot = w.realism.quayYard.crates.indexOf(crate);
    const target = w.realism.quayYard.slot(slot);
    assert.ok(Math.abs(crate.position.x - target[0]) < 1.5);
  }
  // The sea reads the expanded outline once the island stands.
  const v = SHORE_VECTORS.find(
    (s) => s.x === FARM_ISLAND.x && s.y === FARM_ISLAND.z,
  );
  assert.ok(v && v.z === FARM_ISLAND.hx);
});

test("the old orchard steps aside as the island rises, and the bridge spans harbor to gate", () => {
  const base = { ...done, construction: { stage: "unowned", progress: 0 } };
  updateBusinessWorld(w, base, 0, 1 / 30, true);
  assert.equal(w.realism.estate.visible, false);
  assert.ok(w.realism.orchard.length > 5);
  assert.ok(w.realism.orchard.every((piece) => piece.visible));
  updateBusinessWorld(w, done, 1, 1 / 30, true);
  assert.ok(w.realism.orchard.every((piece) => !piece.visible));
  assert.equal(w.realism.causeway.visible, true);
  assert.equal(w.realism.island.garden.garden.visible, true);
  assert.ok(BRIDGE.length > 7 && BRIDGE.length < 9);
  // Bridge start is on the harbor pier; its end lands on the gate pier.
  assert.ok(Math.abs(BRIDGE.start.x - -4) < 2 && BRIDGE.start.z > 13);
  const endX = BRIDGE.start.x + Math.sin(BRIDGE.yaw) * BRIDGE.length;
  const endZ = BRIDGE.start.z + Math.cos(BRIDGE.yaw) * BRIDGE.length;
  assert.ok(Math.abs(endX - NODES.farm_gate[0]) < 1.5);
  assert.ok(Math.abs(endZ - NODES.farm_gate[1]) < 1.5);
});
