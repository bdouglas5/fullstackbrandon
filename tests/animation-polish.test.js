import test from "node:test";
import { WHEEL_RADIUS } from "../src/toy-scale.js";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { ActorMotion, articulate } from "../src/world-motion.js";
import { animateVehicle, animateCitizen } from "../src/world-animation.js";

const world = buildWorld();
const still = { walkCycle: 0, moving: false, speed: 0, step: 0, turnRate: 0 };
const moving = {
  walkCycle: Math.PI / 2,
  moving: true,
  speed: 5,
  step: 0.08,
  travelled: 2,
  turnRate: 3,
  acceleration: 4,
  verticalSpeed: 1,
};
const transforms = (root) => {
  const values = [];
  root.traverse((node) =>
    values.push([
      node.position.toArray(),
      node.rotation.toArray(),
      node.scale.toArray(),
    ]),
  );
  return values;
};

test("backpack carrying leaves the face registered while walking and unloading", () => {
  const body = world.body.clone(true);
  const head = body.getObjectByName("head rig");
  const elbow = body.getObjectByName("left arm").getObjectByName("elbow");
  assert.ok(
    head && elbow,
    "the real model provides the articulated head and elbow pivots",
  );
  assert.ok(head.getObjectByName("cap"));
  const face = head.children.map((node) => node.position.toArray());
  for (let i = 0; i < 40; i++)
    articulate(body, moving, {
      walking: true,
      carrying: true,
      time: i / 60,
      dt: 1 / 60,
    });
  assert.ok(
    head.rotation.y > 0.02,
    "head looks into a measured turn with free arms",
  );
  assert.ok(
    body.userData.cargoCases === 1,
    "carrying puts a case on the backpack",
  );
  assert.deepEqual(
    head.children.map((node) => node.position.toArray()),
    face,
    "eyes, brows and cap stay registered to the face",
  );
  assert.equal(body.getObjectByName("carried parcel").visible, false);
  const walkingHead = head.rotation.x;
  for (let i = 0; i < 45; i++)
    articulate(body, still, { working: true, time: i / 60, dt: 1 / 60 });
  assert.equal(body.userData.cargoCases, 0, "cargo clears after unloading");
  assert.equal(body.getObjectByName("carried parcel").visible, false);
});

test("seated joints use one absolute pose and copies spawned mid-stride return to neutral", () => {
  const seated = world.body.clone(true);
  const leg = seated.getObjectByName("left leg");
  leg.rotation.x = -0.85;
  leg.getObjectByName("knee").rotation.x = 0.8;
  articulate(seated, still, { seated: true, reducedMotion: true });
  assert.equal(leg.rotation.x, -1.03);
  assert.equal(leg.getObjectByName("knee").rotation.x, 1.18);
  const body = world.body.clone(true);
  for (let i = 0; i < 40; i++)
    articulate(body, moving, { walking: true, dt: 1 / 60 });
  const crew = body.clone(true);
  articulate(crew, still, { reducedMotion: true });
  assert.equal(crew.getObjectByName("left leg").rotation.x, 0);
  assert.equal(crew.getObjectByName("right leg").rotation.x, 0);
  assert.equal(crew.position.y, 0);
  assert.equal(crew.rotation.x, 0);
  assert.equal(crew.rotation.z, 0);
  assert.ok(
    body.getObjectByName("left leg").rotation.x > 0.65,
    "the clone never changes the original rig",
  );
});

test("reduced motion retains mounted poses and stops all decorative character movement", () => {
  for (const options of [
    { walking: true },
    { working: true, carrying: true },
    { cycling: true },
    { seated: true },
    { flying: true },
    {},
  ]) {
    const body = world.body.clone(true);
    for (let i = 0; i < 20; i++)
      articulate(body, moving, { ...options, time: i / 60, dt: 1 / 60 });
    articulate(body, moving, { ...options, reducedMotion: true, time: 1 });
    const fixed = transforms(body);
    articulate(
      body,
      { ...moving, walkCycle: 97 },
      { ...options, reducedMotion: true, time: 134 },
    );
    assert.deepEqual(transforms(body), fixed);
  }
});

test("vehicle banking leaves authoritative route positions and nose headings unchanged", () => {
  for (const [kind, source] of [
    ["bike", world.bike],
    ["van", world.van],
    ["sailboat", world.boat],
    ["helicopter", world.helicopter],
    ["jetpack", world.jetpack],
  ]) {
    const root = source.clone(true);
    root.position.set(7, kind === "helicopter" ? 8 : 0.43, 4);
    root.rotation.y = 1.31;
    const position = root.position.toArray();
    for (let frame = 0; frame < 180; frame++) {
      const pose = animateVehicle(root, moving, {
        kind,
        time: frame / 30,
        dt: 1 / 30,
      });
      assert.deepEqual(root.position.toArray(), position);
      assert.equal(root.rotation.y, 1.31);
      const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
      nose.y = 0;
      assert.ok(
        nose
          .normalize()
          .dot(new THREE.Vector3(Math.sin(1.31), 0, Math.cos(1.31))) > 0.999999,
        `${kind} points along its route even when banked`,
      );
      assert.ok(
        Math.abs(pose.pitch) <= 0.16 && Math.abs(pose.roll) <= 0.14,
        `${kind} secondary motion stays bounded`,
      );
    }
    animateVehicle(root, moving, { kind, reducedMotion: true, time: 7 });
    const fixed = transforms(root);
    animateVehicle(root, moving, { kind, reducedMotion: true, time: 15 });
    assert.deepEqual(
      transforms(root),
      fixed,
      `${kind} respects reduced motion`,
    );
  }
});

test("cloned crew bicycles rotate their own wheels by actual distance, including after a stop", () => {
  const crew = world.createCrew({
    id: "animation-bike",
    name: "Mira",
    color: "#de976f",
    vehicle: "bike",
  });
  const wheels = crew.bicycle.children.filter((node) =>
    node.children.some((part) => part.name === "bicycle spoke"),
  );
  assert.equal(wheels.length, 2);
  const before = wheels.map((wheel) => wheel.rotation.x);
  animateVehicle(
    crew.bicycle,
    { ...moving, step: 0.5 * WHEEL_RADIUS.bike },
    { kind: "bike", dt: 1 / 30 },
  );
  wheels.forEach((wheel, index) =>
    assert.ok(Math.abs(wheel.rotation.x - before[index] - 0.5) < 1e-12),
  );
  const stopped = wheels.map((wheel) => wheel.rotation.x);
  animateVehicle(crew.bicycle, still, { kind: "bike", dt: 1 / 30 });
  assert.deepEqual(
    wheels.map((wheel) => wheel.rotation.x),
    stopped,
  );
  assert.ok(world.bikeWheels.every((wheel) => wheel.rotation.x === 0));
});

test("helicopter rotor spools up, coasts down and stops under reduced motion", () => {
  const root = new THREE.Group();
  const rotor = new THREE.Group(),
    tailRotor = new THREE.Group();
  root.add(rotor, tailRotor);
  root.position.y = 7;
  let speed = 0;
  for (let i = 0; i < 90; i++)
    speed = animateVehicle(root, moving, {
      kind: "helicopter",
      rotor,
      tailRotor,
      dt: 1 / 30,
    }).rotorSpeed;
  assert.ok(speed > 38 && speed < 39);
  const firstStop = animateVehicle(root, still, {
    kind: "helicopter",
    rotor,
    tailRotor,
    active: false,
    dt: 1 / 30,
  }).rotorSpeed;
  assert.ok(
    firstStop > 0 && firstStop < speed,
    "rotor has a visible coast-down",
  );
  for (let i = 0; i < 180; i++)
    speed = animateVehicle(root, still, {
      kind: "helicopter",
      rotor,
      tailRotor,
      active: false,
      dt: 1 / 30,
    }).rotorSpeed;
  assert.ok(speed < 0.01);
  animateVehicle(root, moving, {
    kind: "helicopter",
    rotor,
    tailRotor,
    reducedMotion: true,
  });
  const pose = [rotor.rotation.y, tailRotor.rotation.x];
  animateVehicle(root, moving, {
    kind: "helicopter",
    rotor,
    tailRotor,
    reducedMotion: true,
  });
  assert.deepEqual([rotor.rotation.y, tailRotor.rotation.x], pose);
});

test("suspension settles after travel and simulation motion rates stay finite at corners", () => {
  const van = new THREE.Group(),
    chassis = new THREE.Group();
  van.add(chassis);
  for (let i = 0; i < 30; i++)
    animateVehicle(van, moving, { kind: "van", chassis, dt: 1 / 30 });
  assert.ok(chassis.position.y > 0 && Math.abs(chassis.rotation.x) > 0.001);
  for (let i = 0; i < 90; i++)
    animateVehicle(van, still, { kind: "van", chassis, dt: 1 / 30 });
  assert.ok(
    Math.abs(chassis.position.y) < 1e-8 && Math.abs(chassis.rotation.x) < 1e-8,
  );
  const motion = new ActorMotion();
  const state = { tick: 0, status: "running" };
  motion.update({ position: [0, 0] }, state, 0);
  for (const position of [
    [0, 2],
    [2, 2],
    [2, -2],
    [-2, -2],
  ]) {
    state.tick++;
    for (let i = 0; i < 24; i++) {
      motion.update({ position }, state, 1 / 60);
      assert.ok(
        [
          motion.speed,
          motion.acceleration,
          motion.turnRate,
          motion.verticalSpeed,
        ].every(Number.isFinite),
      );
      assert.ok(
        Math.abs(motion.turnRate) <= 5 && Math.abs(motion.acceleration) <= 12,
      );
    }
  }
  motion.update({ position: [-2, -2] }, state, 1 / 60, true);
  assert.deepEqual(
    [motion.speed, motion.acceleration, motion.turnRate, motion.verticalSpeed],
    [0, 0, 0, 0],
  );
});

test("customer greeting eases back into a breathing idle without drifting from their address", () => {
  const person = world.customers[0];
  const address = [person.position.x, person.position.z];
  for (let i = 0; i < 30; i++)
    animateCitizen(person, { pending: true, time: i / 30, dt: 1 / 30 });
  const arm = person.userData.limbs[2];
  assert.ok(arm.rotation.x < -0.6);
  for (let i = 0; i < 90; i++)
    animateCitizen(person, { time: i / 30, dt: 1 / 30 });
  assert.ok(Math.abs(arm.rotation.x) < 0.05);
  assert.deepEqual([person.position.x, person.position.z], address);
  animateCitizen(person, { time: 9, reducedMotion: true });
  const pose = transforms(person);
  animateCitizen(person, { time: 19, reducedMotion: true });
  assert.deepEqual(transforms(person), pose);
});

test("parked bicycles keep pedal and wheel transforms while the courier walks", () => {
  articulate(world.rider, moving, { cycling: true, dt: 0.1 });
  animateVehicle(world.bike, moving, { kind: "bike", active: true });
  const pedals = [];
  world.bike.traverse((o) => {
    if (o.name.startsWith("Pedal plate")) pedals.push(o);
  });
  assert.ok(pedals.length > 0);
  const before = pedals.map((o) => o.position.toArray());
  // Even a changed hidden rider pose must not move a parked pedal plate.
  articulate(
    world.rider,
    { ...moving, walkCycle: 4 },
    { cycling: true, dt: 0.1 },
  );
  animateVehicle(
    world.bike,
    { ...moving, step: 1 },
    { kind: "bike", active: false },
  );
  assert.deepEqual(
    pedals.map((o) => o.position.toArray()),
    before,
  );
});
