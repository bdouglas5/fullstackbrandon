import test from "node:test";
import assert from "node:assert/strict";
import { fresh, begin, step, NODES } from "../shared/engine.js";
import {
  ActorMotion,
  movementTrajectory,
  routeTrajectory,
} from "../src/world-motion.js";
import { roadLanePoint } from "../shared/traffic.js";

test("late road snapshots keep moving forward on the exact displayed route", () => {
  const s = fresh();
  s.status = "running";
  const b = s.brandon;
  b.target = "workshop";
  b.action = "buy_bike";
  b.mountedMode = "foot";
  const a = NODES.home,
    z = NODES.workshop;
  const length = Math.hypot(z[0] - a[0], z[1] - a[1]);
  const direction = z.map((v, i) => (v - a[i]) / length);
  const motion = new ActorMotion();
  let backwards = 0,
    still = 0,
    frames = 0;
  for (let tick = 0; tick < 6; tick++) {
    s.tick++;
    b.move = {
      from: "home",
      to: "workshop",
      distance: length,
      progress: tick * 0.48,
    };
    b.navigationStep = 0.48;
    b.position = roadLanePoint(
      b,
      a.map((v, i) => v + direction[i] * b.move.progress),
      NODES,
    ).position;
    const count = tick % 2 ? 27 : 24;
    for (let frame = 0; frame < count; frame++) {
      const old = motion.position.clone();
      motion.update(b, s, 1 / 60);
      const points = routeTrajectory(b, s, motion);
      assert.ok(
        motion.position.distanceTo({
          x: points[0][0],
          y: points[0][1],
          z: points[0][2],
        }) < 1e-8,
      );
      if (tick < 2) continue;
      const dx = motion.position.x - old.x,
        dz = motion.position.z - old.z;
      if (dx * direction[0] + dz * direction[1] < -1e-6) backwards++;
      if (Math.hypot(dx, dz) < 1e-5) still++;
      frames++;
    }
  }
  assert.equal(backwards, 0, "new snapshots must not pull Brandon backward");
  assert.ok(
    still / frames < 0.05,
    `unexpected idle frames: ${still}/${frames}`,
  );
});

test("consumed avoidance corners stay in the movement path between snapshots", () => {
  const s = fresh();
  const before = { ...s.brandon, position: [4, 2] };
  const actor = {
    ...before,
    position: [4.4, 2.4],
    navigationTrail: [
      [4, 2.4],
      [4.4, 2.4],
    ],
  };
  assert.deepEqual(movementTrajectory(before, actor, [4, 0.43, 2], s), [
    [4, 0.43, 2],
    [4, 0.43, 2.4],
    [4.4, 0.43, 2.4],
  ]);
});

test("workshop visits physically walk through the doorway and back outside", () => {
  const s = fresh();
  s.status = "running";
  s.money = 1000;
  assert.ok(begin(s, "buy_bike"));
  let entered = false,
    exited = false;
  for (let i = 0; i < 150; i++) {
    const before = [...s.brandon.position];
    const phase = s.brandon.buildingVisit?.phase;
    step(s);
    const visit = s.brandon.buildingVisit;
    if (phase === "entering" || phase === "exiting") {
      assert.ok(
        Math.hypot(...s.brandon.position.map((v, n) => v - before[n])) <=
          0.320001,
      );
    }
    if (visit?.phase === "inside") {
      entered = true;
      assert.deepEqual(s.brandon.position, [4.45, -4.78]);
    }
    if (entered && phase === "exiting" && !visit) {
      exited = true;
      assert.ok(s.brandon.position[1] > -3.5);
      break;
    }
  }
  assert.ok(entered && exited);
});

test("workshop road arrival has no grass reset and route continues to its interior", () => {
  const s = fresh();
  s.status = "running";
  s.money = 1000;
  assert.ok(begin(s, "buy_bike"));
  const motion = new ActorMotion();
  let arrived = false;
  for (let i = 0; i < 150; i++) {
    motion.update(s.brandon, s, 0.4);
    const points = routeTrajectory(s.brandon, s, motion);
    if (s.brandon.move && s.brandon.target === "workshop")
      assert.deepEqual(points.at(-1), [4.45, 0.43, -4.78]);
    step(s);
    if (
      !s.brandon.move &&
      s.brandon.node === "workshop" &&
      !s.brandon.buildingVisit
    ) {
      assert.deepEqual(s.brandon.position, NODES.workshop);
      arrived = true;
      break;
    }
  }
  assert.ok(arrived);
});
