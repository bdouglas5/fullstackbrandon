import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { animateCharacter } from "../src/world-animation.js";
import { placePedals } from "../src/toy-vehicles.js";
import { sculptStats } from "../src/sculpt.js";
import { SEAT, CHAR_SCALE } from "../src/toy-scale.js";
import { transportRadius } from "../shared/traffic.js";

// The vehicles, gadgets and cargo are sculpted around the posed courier. These
// tests fail when the figurine, its poses or a seat drift apart.

const world = buildWorld();
const motion = (phase = 0) => ({ walkCycle: phase, speed: 3, moving: true });
const pose = (body, flags, phase = 0) => {
  for (let f = 0; f < 120; f++)
    animateCharacter(body, motion(phase), { time: 0.5, dt: 1 / 60, ...flags });
};
const at = (frame, bone, local) => {
  frame.updateMatrixWorld(true);
  return frame.worldToLocal(bone.localToWorld(new THREE.Vector3(...local)));
};
const leg = (body, side) => body.getObjectByName(`${side} leg`);
const hand = (body, side, frame) =>
  at(
    frame,
    body.getObjectByName(`${side} arm`).getObjectByName("elbow"),
    [0, -0.165, 0],
  );
const sole = (body, side, frame) =>
  at(frame, leg(body, side).getObjectByName("knee"), [0, -0.236, 0.06]);
const hip = (body, frame) => at(frame, leg(body, "left"), [0, 0, 0]);

test("van driver sits on the cushion with hands on the steering wheel", () => {
  pose(world.driver, { seated: true });
  const frame = world.chassis;
  const h = hip(world.driver, frame);
  assert.ok(
    h.y > 0.47 && h.y < 0.58,
    `hips rest on the seat (${h.y.toFixed(3)})`,
  );
  assert.ok(
    Math.abs(sole(world.driver, "left", frame).y - 0.38) < 0.04,
    "soles rest on the cabin floor",
  );
  const wheel = new THREE.Vector3(
    SEAT.van.position[0],
    SEAT.van.position[1] + 0.33,
    SEAT.van.position[2] + 0.16,
  );
  for (const side of ["left", "right"]) {
    const d = hand(world.driver, side, frame).distanceTo(wheel);
    assert.ok(
      Math.abs(d - 0.14) < 0.05,
      `${side} hand is on the wheel rim (${d.toFixed(3)})`,
    );
  }
  // Cap clears the roof.
  const head = at(
    frame,
    world.driver.getObjectByName("head rig"),
    [0, 0.33, 0],
  );
  assert.ok(head.y < 1.1, "cap stays under the roof lining");
});

test("cyclist hands hold the bars and pedal plates stay under the soles through a stroke", () => {
  const bike = world.bike;
  for (const phase of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    pose(world.rider, { cycling: true }, phase);
    placePedals(bike);
    for (const side of ["left", "right"]) {
      const grip = new THREE.Vector3(
        side === "left" ? -0.18 : 0.18,
        0.47,
        0.21,
      );
      assert.ok(
        hand(world.rider, side, bike).distanceTo(grip) < 0.08,
        `${side} hand on grip`,
      );
      const plate = bike.getObjectByName(`Pedal plate ${side}`).position;
      const s = sole(world.rider, side, bike);
      assert.ok(
        Math.abs(plate.y + 0.014 - s.y) < 0.02,
        `${side} plate under sole at ${phase}`,
      );
      assert.ok(Math.hypot(plate.x - s.x, plate.z - s.z) < 0.05);
    }
  }
});

test("pilot's head sits inside the helicopter canopy; sailor stands on the cockpit floor", () => {
  pose(world.pilot, { seated: true });
  const top = at(
    world.helicopter,
    world.pilot.getObjectByName("head rig"),
    [0, 0.32, 0],
  );
  const c = world.helicopter.children[1];
  assert.equal(c.name, "Helicopter cockpit canopy");
  const p = c.position,
    s = c.scale;
  const inside = (v) =>
    ((v.x - p.x) / s.x) ** 2 +
    ((v.y - p.y) / s.y) ** 2 +
    ((v.z - p.z) / s.z) ** 2;
  assert.ok(inside(top) < 1, "cap top is under the glass");
  const sailor = world.body.clone(true);
  sailor.scale.setScalar(CHAR_SCALE);
  sailor.position.set(...SEAT.sailboat.position);
  world.boat.add(sailor);
  pose(sailor, {});
  assert.ok(Math.abs(sole(sailor, "left", world.boat).y - 0.5) < 0.04);
  sailor.removeFromParent();
});

test("every model stays inside its simulation footprint", () => {
  const extent = (root) => {
    const box = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (
        !o.isMesh ||
        o.isSkinnedMesh ||
        /exhaust|glow|portal|ring/i.test(o.name)
      )
        return;
      if (o.material?.isMeshBasicMaterial) return;
      box.expandByObject(o);
    });
    return box;
  };
  const cases = [
    ["van", world.van],
    ["bike", world.bike],
    ["sailboat", world.boat],
    ["helicopter", world.helicopter],
    ["rocket_skates", world.rocketSkates],
    ["jetpack", world.jetpack],
    ["teleporter", world.teleporter],
  ];
  // Largest half extent each model may reach (world units). These are the
  // authored sizes, not the collision circle: the simulation radius is a
  // spacing rule and the bicycle has always been longer than its circle.
  const limit = {
    van: 0.95,
    bike: 0.7,
    sailboat: 0.9,
    helicopter: 1.6,
    rocket_skates: 0.45,
    jetpack: 0.36,
    teleporter: 0.5,
  };
  for (const [mode, root] of cases) {
    const saved = root.position.clone();
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    const box = extent(root);
    const half = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
    assert.ok(
      half <= limit[mode],
      `${mode} half extent ${half.toFixed(2)} > ${limit[mode]} (collision radius ${transportRadius(mode)})`,
    );
    root.position.copy(saved);
  }
});

test("sculpted models stay inside their triangle budgets", () => {
  const { byKey } = sculptStats();
  const budgets = [
    [/^van\/body/, 16000],
    [/^van\/cabin/, 7000],
    [/^van\/wheel/, 2500],
    [/^bike\//, 4000],
    [/^heli\/pod/, 12000],
    [/^boat\/hull/, 9000],
    [/^gadget\//, 8000],
    [/^crate\//, 4000],
  ];
  for (const [key, count] of Object.entries(byKey)) {
    const budget = budgets.find(([re]) => re.test(key));
    if (budget)
      assert.ok(count <= budget[1], `${key}: ${count} > ${budget[1]}`);
  }
  const total = Object.values(byKey).reduce((a, b) => a + b, 0);
  assert.ok(total < 330000, `sculpted props total ${total}`);
});
