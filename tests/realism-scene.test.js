import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { crateSlot } from "../src/world-freighter.js";
import { animateVehicle } from "../src/world-animation.js";
import { optimizeWorld } from "../src/optimize-world.js";
import {
  repairPose,
  animateTireRepair,
  applyTransportTransition,
  transportTransitionPose,
  updateBusinessWorld,
  separateRenderedActors,
} from "../src/world-realism.js";
import {
  trafficMotionAllowed,
  resolveTrafficPositions,
  transportRadius,
  constrainRoadMotion,
  roadEntryAllowed,
} from "../shared/traffic.js";
const w = buildWorld();
const still = {
  position: new THREE.Vector3(0, 0.43, 0),
  heading: 0,
  moving: false,
  walkCycle: 0,
};

test("swept traffic prevents fast vans tunneling through a courier and grants narrow road reservations", () => {
  const van = { id: "brandon", position: [-3, 0], vehicle: "van" },
    courier = {
      id: "crew",
      position: [0, 0],
      vehicle: "foot",
      move: { from: "B", to: "A" },
    };
  assert.equal(trafficMotionAllowed(van, [3, 0], [courier]).allowed, false);
  assert.equal(trafficMotionAllowed(van, [-2, 0], [courier]).allowed, true);
  assert.equal(
    roadEntryAllowed({ brandon: van, crew: [courier] }, van, "A", "B", "van")
      .allowed,
    false,
  );
  const lanes = constrainRoadMotion(
    {
      brandon: { ...van, vehicle: "foot", move: { from: "A", to: "B" } },
      crew: [],
    },
    { ...van, vehicle: "foot", move: { from: "A", to: "B" } },
    [-1, 0],
    { A: [-3, 0], B: [3, 0] },
  );
  assert.equal(lanes.allowed, true);
  assert.equal(lanes.position[1], -0.52);
});

test("coincident spawn and interpolated opposite couriers retain full physical clearance", () => {
  for (let frame = 0; frame <= 120; frame++) {
    const t = frame / 120;
    const entries = [
      {
        id: "brandon",
        mode: "van",
        position: new THREE.Vector3(-2 + 4 * t, 0.43, 0),
        objects: [new THREE.Group()],
      },
      {
        id: "crew-1",
        mode: "foot",
        position: new THREE.Vector3(2 - 4 * t, 0.43, 0),
        objects: [new THREE.Group()],
      },
      {
        id: "crew-2",
        mode: "bike",
        position: new THREE.Vector3(0, 0.43, 1 - 2 * t),
        objects: [new THREE.Group()],
      },
    ];
    const positions = separateRenderedActors(entries);
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length; j++)
        assert.ok(
          Math.hypot(
            positions[i].position[0] - positions[j].position[0],
            positions[i].position[2] - positions[j].position[2],
          ) +
            1e-5 >=
            positions[i].radius + positions[j].radius,
        );
  }
  const original = [
    { id: "a", position: [0, 0], mode: "foot" },
    { id: "b", position: [0, 0], mode: "foot" },
  ];
  const resolved = resolveTrafficPositions(original);
  assert.deepEqual(original[0].position, [0, 0]);
  assert.ok(Math.hypot(...resolved[0].position) > 0.2);
});

test("tire repair dismounts driver, raises real chassis, removes wheel and reinflates it before replacement", () => {
  w.van.position.copy(still.position);
  const snapshots = [];
  for (const [i, phase] of [
    "inspect",
    "jack",
    "remove",
    "patch",
    "replace",
    "lower",
  ].entries()) {
    animateVehicle(w.van, still, {
      kind: "van",
      chassis: w.chassis,
      wheels: w.wheels,
      dt: 1,
    });
    const pose = animateTireRepair(
      w,
      { action: "patch", repair: { phase, progress: (i + 0.75) / 6 } },
      true,
      still,
      i,
      1 / 30,
      true,
    );
    snapshots.push(pose);
    assert.equal(w.repairRig.visible, true);
    assert.equal(w.driver.visible, false);
    assert.equal(w.brandon.visible, true);
    assert.ok(Number.isFinite(w.wheels[0].position.x));
  }
  assert.ok(snapshots[1].lift > 0.8);
  assert.ok(snapshots[2].removed > 0.8);
  assert.ok(snapshots[3].inflation > 0.9);
  assert.ok(snapshots[4].removed < 0.2);
  assert.equal(repairPose({}, true).inflation, 0.38);
  animateTireRepair(w, {}, false, still, 7, 1 / 30, true);
  assert.equal(w.repairRig.visible, false);
  assert.deepEqual(
    w.wheels[0].position.toArray(),
    w.wheels[0].userData.restPosition,
  );
  assert.equal(w.wheels[0].scale.y, 1);
});

test("all transport changes expose one walking body and hide mounted copies until boarded", () => {
  for (const to of [
    "bike",
    "van",
    "rocket_skates",
    "helicopter",
    "jetpack",
    "sailboat",
    "teleporter",
  ]) {
    for (const p of [0.15, 0.5, 0.9]) {
      const result = applyTransportTransition(
        w,
        { transition: { from: "foot", to, progress: p } },
        still,
        { reducedMotion: true },
      );
      assert.equal(w.brandon.visible, true);
      assert.equal(result.standing, true);
      for (const pilot of [
        w.rider,
        w.driver,
        w.pilot,
        w.jetPilot,
        w.portalPilot,
        w.skater,
      ])
        assert.equal(pilot.visible, false);
      assert.ok(Number.isFinite(w.brandon.position.x));
    }
  }
  assert.ok(
    transportTransitionPose({ from: "van", to: "foot", progress: 0.05 })
      .offset <
      transportTransitionPose({ from: "van", to: "foot", progress: 0.5 })
        .offset,
  );
});

test("contractor build, real factory process, shipment and home garage survive optimization", () => {
  optimizeWorld(w);
  const base = {
    tick: 10,
    brandon: {},
    office: { stage: "garage" },
    construction: { stage: "unowned", progress: 0 },
    production: {},
    operations: { shipments: [] },
  };
  updateBusinessWorld(w, base, 0, 1 / 30, true);
  assert.equal(w.cafe.visible, false);
  assert.equal(w.realism.estate.visible, false);
  assert.ok(w.realism.garage.getObjectByName("Garage pickle packing bench"));
  updateBusinessWorld(
    w,
    {
      ...base,
      office: { stage: "building" },
      construction: { stage: "building", progress: 0.7 },
    },
    1,
    1 / 30,
    true,
  );
  assert.equal(w.realism.contractor.visible, true);
  assert.equal(w.realism.walls.visible, true);
  assert.equal(w.realism.roof.visible, false);
  assert.equal(w.realism.officeBuild.visible, true);
  const active = {
    ...base,
    office: { stage: "complete" },
    construction: { stage: "complete", progress: 1 },
    production: { fermenting: [{ cases: 5 }], packing: [{ cases: 2 }] },
    operations: {
      shipments: [
        {
          status: "at_sea",
          orderedAt: 0,
          arrivesAt: 20,
          portNode: "farm_port",
        },
      ],
    },
  };
  const report = updateBusinessWorld(w, active, 2, 1 / 30, false);
  assert.equal(w.cafe.visible, true);
  assert.equal(w.realism.contractor.visible, false);
  assert.equal(w.realism.greenhouse.parent.visible, true);
  assert.equal(report.factoryActive, true);
  assert.equal(w.realism.importShip.visible, true);
  assert.equal(report.shipmentStage, "at_sea");
  assert.ok(w.realism.factory.getObjectByName("Fermentation vat"));
  assert.ok(w.realism.home.getObjectByName("Weekend charcoal barbecue"));
  const jarX = w.realism.jars[0].position.x;
  updateBusinessWorld(w, active, 3, 1 / 30, false);
  assert.notEqual(w.realism.jars[0].position.x, jarX);
  const crew = w.createCrew({
    id: "kai",
    name: "Kai",
    vehicle: "rocket_skates",
  });
  assert.ok(crew.van && crew.rocketSkates && crew.skater);
  assert.ok(transportRadius("van") > transportRadius("foot"));
});

test("short roads reserve the entire junction approach before two vans meet", () => {
  const owner = {
    id: "van-a",
    vehicle: "van",
    mountedMode: "van",
    position: [0, 0],
    move: { from: "west", to: "north", progress: 0, distance: 5 },
  };
  const incoming = {
    id: "van-b",
    vehicle: "van",
    mountedMode: "van",
    position: [3, 0],
    move: { from: "east", to: "west", progress: 0, distance: 3 },
  };
  const state = {
    brandon: owner,
    crew: [incoming],
    trafficJunctions: { west: owner.id },
  };
  const result = constrainRoadMotion(state, incoming, [1.9, 0], {
    east: [3, 0],
    west: [0, 0],
    north: [0, 5],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.yieldingTo, owner.id);
  assert.deepEqual(result.position, incoming.position);
});

test("a terminal delivery cannot finish at a detour point while its service bay is occupied", () => {
  const courier = {
    id: "brandon",
    position: [3.2, -0.52],
    vehicle: "foot",
    target: "shop",
    move: { from: "road", to: "shop", progress: 2.8, distance: 3 },
  };
  const blocker = { id: "crew-1", position: [3, 0], vehicle: "foot" };
  const result = constrainRoadMotion(
    { brandon: courier, crew: [blocker] },
    courier,
    [3, 0],
    { road: [0, 0], shop: [3, 0] },
  );
  assert.equal(result.docking, true);
  assert.equal(result.progressFactor, 0);
});

test("opposing small couriers release their departure junction before reserving arrival", () => {
  const a = {
    id: "a",
    vehicle: "rocket_skates",
    position: [0, -0.52],
    move: { from: "left", to: "right", progress: 0, distance: 2.5 },
  };
  const b = {
    id: "b",
    vehicle: "bike",
    position: [2.5, 0.47],
    move: { from: "right", to: "left", progress: 0, distance: 2.5 },
  };
  const state = {
    brandon: a,
    crew: [b],
    trafficJunctions: { left: "a", right: "b" },
  };
  const nodes = { left: [0, 0], right: [2.5, 0] };
  assert.equal(constrainRoadMotion(state, a, [1, 0], nodes).allowed, false);
  assert.equal(state.trafficJunctions.left, undefined);
  const second = constrainRoadMotion(state, b, [1.5, 0], nodes);
  assert.equal(second.allowed, true);
  b.position = second.position;
  assert.equal(constrainRoadMotion(state, a, [1, 0], nodes).allowed, true);
});

test("a van's boarding approach reserves its narrow road before it mounts", () => {
  const entering = { id: "a", vehicle: "bike", position: [0, 0] };
  const boarding = {
    id: "b",
    vehicle: "van",
    mountedMode: "foot",
    position: [4, 0],
    move: { from: "B", to: "A", walkToVehicle: true, progress: 0, distance: 4 },
  };
  assert.equal(
    roadEntryAllowed(
      { brandon: entering, crew: [boarding] },
      entering,
      "A",
      "B",
      "bike",
    ).allowed,
    false,
  );
});

test("garage stock stays at home through the office upgrade and charging has a separate footprint", () => {
  const world = buildWorld();
  const garage = world.realism.garage;
  const charger = world.world.getObjectByName(
    "Electric vehicle charging station",
  );
  world.world.updateMatrixWorld(true);
  const garageBounds = new THREE.Box3().setFromObject(garage);
  const chargingBounds = new THREE.Box3().setFromObject(charger);
  assert.ok(
    chargingBounds.min.x > garageBounds.max.x,
    "charging canopy does not overlap the garage",
  );
  const s = {
    cafe: 4,
    office: { stage: "garage" },
    operations: { origin: "home", shipments: [] },
    construction: {},
    production: {},
  };
  updateBusinessWorld(world, s, 0, 1 / 30, true);
  assert.equal(world.realism.garageStock.filter((o) => o.visible).length, 4);
  assert.equal(world.cafe.visible, false);
  s.office.stage = "complete";
  s.operations.origin = "cafe";
  s.operations.oldOrigin = "home";
  s.operations.oldWarehouse = 3;
  updateBusinessWorld(world, s, 0, 1 / 30, true);
  assert.equal(world.realism.garageStock.filter((o) => o.visible).length, 3);
  assert.equal(world.cafe.visible, true);
});

test("freighter berths at the harbor pier, unloads crates onto it and is three times the old barge", () => {
  const world = buildWorld();
  const state = (tick) => ({
    tick,
    brandon: {},
    office: { stage: "garage" },
    construction: { stage: "unowned", progress: 0 },
    production: {},
    operations: {
      shipments: [
        {
          status: "port",
          kind: "pickles",
          cases: 6,
          orderedAt: -45,
          departsAt: -45,
          arrivesAt: 0,
          portNode: "harbor_dock",
        },
      ],
    },
  });
  const ship = world.realism.importShip;
  const at = (tick, time, reduced = false) => {
    const st = state(tick);
    st.harbor = 6;
    updateBusinessWorld(world, st, time, 0.1, reduced);
  };
  at(2, 0);
  const size = new THREE.Box3()
    .setFromObject(ship)
    .getSize(new THREE.Vector3());
  assert.ok(
    size.z > 9 && size.x > 3.3,
    "ship is about 3x the old 1.2 x 3 hull",
  );
  assert.ok(Math.abs(ship.position.x + 7.95) < 1 && ship.position.z > 17);
  const visible = () => world.crates.filter((c) => c.visible).length;
  assert.equal(visible(), 0, "no crates on the pier before the crane works");
  // Run the fog fade-in and the crane for a while; track the carried crate.
  let carried = false,
    time = 0;
  for (; time < 90; time += 0.1) {
    at(2, time);
    const slot = world.crates.find(
      (c, i) =>
        c.visible &&
        Math.hypot(
          c.position.x - crateSlot(i)[0],
          c.position.z - crateSlot(i)[2],
        ) > 0.3,
    );
    if (slot) carried = true;
  }
  assert.ok(carried, "a real crate is lifted off the ship and swung over");
  assert.equal(visible(), 3, "all three crates were set down on the pier");
  world.crates.slice(0, 3).forEach((c, i) => {
    const [x, y, z] = crateSlot(i);
    assert.ok(Math.hypot(c.position.x - x, c.position.z - z) < 0.01);
  });
  // Brandon takes stock: the extra crates fade rather than pop.
  const taken = state(2);
  taken.harbor = 0;
  updateBusinessWorld(world, taken, time, 0.1, false);
  assert.equal(visible(), 3, "crates are still fading right after pickup");
  for (let i = 0; i < 40; i++)
    updateBusinessWorld(world, taken, time + i * 0.1, 0.1, false);
  assert.equal(visible(), 0, "crates have faded away");
});
