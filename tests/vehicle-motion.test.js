import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fresh, begin, baseline, step, NODES } from "../shared/engine.js";
import {
  ActorMotion,
  movementTrajectory,
  routeTrajectory,
} from "../src/world-motion.js";
import { setCrewTransportVisibility } from "../src/world-details.js";

test("crew walk to boats and aircraft before showing their transport in a voyage", () => {
  const parts = [
    "group",
    "body",
    "bicycle",
    "rider",
    "boat",
    "sailor",
    "helicopter",
    "pilot",
    "jetpack",
    "jetPilot",
    "teleporter",
    "portalPilot",
  ];
  for (const vehicle of ["sailboat", "helicopter", "jetpack", "teleporter"]) {
    const rig = Object.fromEntries(
      parts.map((part) => [part, { visible: true }]),
    );
    const member = { vehicle, move: { from: "cafe", to: "harbor" } };
    const walking = setCrewTransportVisibility(rig, member, true);
    assert.equal(walking.mode, "foot");
    assert.equal(rig.group.visible, true);
    for (const part of [
      "bicycle",
      "boat",
      "helicopter",
      "jetpack",
      "teleporter",
    ])
      assert.equal(rig[part].visible, false);
    const travelling = setCrewTransportVisibility(
      rig,
      { ...member, voyage: { mode: vehicle } },
      true,
    );
    assert.equal(travelling.mode, vehicle);
    assert.equal(travelling.pilotVisible, true);
    assert.equal(rig.group.visible, false);
  }
});

function distanceToRoute(point, path) {
  const p = new THREE.Vector3(...point);
  return Math.min(
    ...path.slice(1).map((end, index) => {
      const segment = new THREE.Line3(
        new THREE.Vector3(...path[index]),
        new THREE.Vector3(...end),
      );
      return segment
        .closestPointToPoint(p, true, new THREE.Vector3())
        .distanceTo(p);
    }),
  );
}

test("all vehicle noses follow displacement through corners and full turnarounds", () => {
  for (const mode of [
    "foot",
    "bike",
    "van",
    "sailboat",
    "helicopter",
    "jetpack",
  ]) {
    const motion = new ActorMotion();
    const state = { tick: 0, status: "running", vehicle: mode };
    const snapshot = (position) => ({
      id: "brandon",
      node: null,
      position,
      vehicle: mode,
      ...(["sailboat", "helicopter", "jetpack"].includes(mode)
        ? {
            voyage: {
              mode,
              position,
              altitude: mode === "sailboat" ? 0.08 : 7,
            },
          }
        : {}),
    });
    motion.update(snapshot([0, 0]), state, 1 / 60);
    for (const point of [
      [0, -2],
      [2, -2],
      [-2, -2],
      [-2, 2],
      [2, 2],
    ]) {
      state.tick++;
      const actor = snapshot(point);
      for (let frame = 0; frame < 24; frame++) {
        const previous = motion.position.clone();
        motion.update(actor, state, 1 / 60);
        const velocity = motion.position.clone().sub(previous);
        velocity.y = 0;
        if (velocity.length() > 0.0005) {
          const forward = new THREE.Vector3(
            Math.sin(motion.heading),
            0,
            Math.cos(motion.heading),
          );
          assert.ok(
            forward.dot(velocity.normalize()) > 0.999999,
            `${mode} must move nose-first`,
          );
          assert.equal(motion.reversing, false);
        }
      }
    }
  }
});

test("aircraft motion and dotted route retain takeoff, cruise and landing in 3D", () => {
  const stages = [
    { from: [0, 0], to: [0, 0], fromAltitude: 0.48, toAltitude: 7 },
    { from: [0, 0], to: [10, 0], fromAltitude: 7, toAltitude: 7 },
    { from: [10, 0], to: [10, 0], fromAltitude: 7, toAltitude: 0.48 },
    {
      from: [10, 0],
      to: [11, 1],
      fromAltitude: 0.48,
      toAltitude: 0.43,
      onShore: true,
    },
  ];
  const before = {
    voyage: {
      mode: "helicopter",
      island: "test",
      position: [0, 0],
      altitude: 0.48,
      stages,
      stageIndex: 0,
      stageWork: 0,
      elapsed: 0,
    },
  };
  const after = {
    voyage: {
      ...before.voyage,
      position: [10, 0],
      altitude: 3,
      stageIndex: 2,
      stageWork: 1,
      elapsed: 10,
    },
  };
  const state = { tick: 0, status: "running" };
  assert.deepEqual(movementTrajectory(before, after, [0, 0.48, 0], state), [
    [0, 0.48, 0],
    [0, 7, 0],
    [10, 7, 0],
    [10, 3, 0],
  ]);
  const line = routeTrajectory(before, state);
  assert.deepEqual(line, [
    [0, 0.48, 0],
    [0, 7, 0],
    [10, 7, 0],
    [10, 0.48, 0],
  ]);
  const motion = new ActorMotion();
  motion.update(before, state, 1 / 60);
  state.tick++;
  for (let frame = 0; frame < 24; frame++) {
    motion.update(after, state, 1 / 60);
    assert.ok(distanceToRoute(motion.position.toArray(), line) < 1e-8);
    assert.deepEqual(
      routeTrajectory(after, state, motion)[0],
      motion.position.toArray(),
    );
  }
});

test("road routes retain the committed edge when a closure changes the next route", () => {
  const actor = {
    node: "west",
    position: [0, 2],
    action: "deliver",
    target: "cafe",
    vehicle: "bike",
    move: { from: "west", to: "east" },
  };
  const points = routeTrajectory(actor, { bridgeClosed: true, traffic: false });
  assert.deepEqual(points, [
    [0, 0.43, 2],
    [NODES.east[0], 0.43, NODES.east[1]],
    [4, 0.43, 2],
    [3.57, 0.43, 0.69],
    [3.57, 0.43, 0.2],
  ]);
});

test("live road, sea and air journeys stay on the drawn route for Brandon and the crew", () => {
  const state = fresh(42);
  state.status = "running";
  const motions = new Map(),
    modes = new Set();
  let checked = 0,
    crewChecked = 0;
  for (let tick = 0; tick < 120000 && state.status === "running"; tick++) {
    if (!state.brandon.action) begin(state, baseline(state));
    step(state);
    for (const actor of [state.brandon, ...state.crew]) {
      if (!motions.has(actor.id)) motions.set(actor.id, new ActorMotion());
      const motion = motions.get(actor.id);
      const previousActor = motion.actor;
      // Start the new snapshot before measuring its route, then inspect frames
      // between snapshots to catch altitude drift and skipped route corners.
      motion.update(actor, state, 0);
      if (
        actor.voyage &&
        previousActor?.voyage?.mode === actor.voyage.mode &&
        previousActor.voyage.island === actor.voyage.island &&
        actor.voyage.elapsed >= previousActor.voyage.elapsed
      ) {
        // Each engine step advances just one stage. Repeated outbound/return
        // coordinates must not make interpolation replay an earlier leg.
        const direct = new THREE.Vector3(...motion.trajectory[0]).distanceTo(
          new THREE.Vector3(...motion.trajectory.at(-1)),
        );
        assert.ok(
          motion.distance <= direct + 1e-7,
          `tick ${state.tick}: journey replayed an old corner`,
        );
      }
      const line = routeTrajectory(actor, state, motion);
      for (let frame = 0; frame < 4; frame++) {
        const previous = motion.position.clone();
        motion.update(actor, state, 0.09);
        const drawn = routeTrajectory(actor, state, motion);
        assert.deepEqual(drawn[0], motion.position.toArray());
        if (line.length > 1) {
          assert.ok(
            distanceToRoute(motion.position.toArray(), line) < 1e-7,
            `tick ${state.tick}, ${actor.id}`,
          );
          checked++;
          if (actor.id !== "brandon") crewChecked++;
        }
        const displacement = motion.position.clone().sub(previous);
        displacement.y = 0;
        if (displacement.length() > 0.0005) {
          const forward = new THREE.Vector3(
            Math.sin(motion.heading),
            0,
            Math.cos(motion.heading),
          );
          assert.ok(forward.dot(displacement.normalize()) > 0.999999);
          modes.add(actor.voyage?.mode || actor.vehicle || state.vehicle);
        }
      }
    }
  }
  for (const mode of [
    "foot",
    "bike",
    "van",
    "sailboat",
    "helicopter",
    "jetpack",
  ])
    assert.ok(modes.has(mode), `must exercise ${mode}`);
  assert.ok(checked > 1000);
  assert.ok(crewChecked > 1000);
});
