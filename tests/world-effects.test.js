import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createVehicleEffects } from "../src/world-effects.js";

const actor = () => ({
  position: new THREE.Vector3(0, 0.43, 0),
  heading: 0,
  moving: true,
});
function travel(
  effects,
  motion,
  { kind = "van", active = true, reducedMotion = false, frames = 20 } = {},
) {
  for (let frame = 0; frame < frames; frame++) {
    motion.position.z += 0.12;
    const time = frame / 30;
    effects.emit("courier", kind, motion, 1 / 30, {
      active,
      time,
      reducedMotion,
    });
    effects.update(time, 1 / 30, reducedMotion);
  }
}

test("travel particles require active physical movement and expire promptly", () => {
  const scene = new THREE.Scene(),
    effects = createVehicleEffects(scene),
    motion = actor();
  travel(effects, motion, { active: false });
  assert.equal(effects.count, 0);
  motion.moving = false;
  travel(effects, motion);
  assert.equal(effects.count, 0);
  motion.moving = true;
  travel(effects, motion);
  assert.ok(effects.count > 0);
  assert.equal(effects.points.visible, true);
  effects.update(3, 2);
  assert.equal(effects.count, 0);
  assert.equal(effects.points.visible, false);
  effects.dispose();
  assert.equal(scene.children.length, 0);
});

test("particle pool remains finite, bounded and subdued across every vehicle", () => {
  const effects = createVehicleEffects(new THREE.Scene());
  for (const kind of [
    "foot",
    "bike",
    "van",
    "sailboat",
    "jetpack",
    "helicopter",
  ])
    travel(effects, actor(), { kind, frames: 120 });
  const attributes = effects.points.geometry.attributes;
  assert.equal(attributes.position.count, 180);
  assert.ok(effects.count <= 180);
  assert.ok(effects.count > 0);
  for (const attribute of Object.values(attributes))
    assert.ok(attribute.array.every(Number.isFinite));
  assert.ok(attributes.particleColor.array.every((v) => v >= 0 && v <= 1));
  assert.ok(attributes.particleOpacity.array.every((v) => v >= 0 && v <= 0.38));
  effects.dispose();
});

test("reduced motion clears existing trails and prevents new ones", () => {
  const effects = createVehicleEffects(new THREE.Scene()),
    motion = actor();
  travel(effects, motion);
  assert.ok(effects.count > 0);
  effects.update(1, 1 / 30, true);
  assert.equal(effects.count, 0);
  assert.equal(effects.points.visible, false);
  travel(effects, motion, { reducedMotion: true });
  assert.equal(effects.count, 0);
  effects.dispose();
});

test("descent produces only low-altitude wash; teleport jumps do not leave trails", () => {
  const effects = createVehicleEffects(new THREE.Scene()),
    motion = actor();
  motion.position.y = 3;
  motion.moving = false;
  for (let frame = 0; frame < 20; frame++) {
    motion.position.y -= 0.025;
    effects.emit("pilot", "helicopter", motion, 1 / 30, {
      active: true,
      time: frame / 30,
    });
    effects.update(frame / 30, 1 / 30);
  }
  assert.equal(effects.count, 0);
  motion.position.y = 1.7;
  for (let frame = 20; frame < 30; frame++) {
    motion.position.y -= 0.045;
    effects.emit("pilot", "helicopter", motion, 1 / 30, {
      active: true,
      time: frame / 30,
    });
    effects.update(frame / 30, 1 / 30);
  }
  assert.ok(effects.count > 0);
  effects.update(3, 2);
  motion.position.set(100, 0.43, 100);
  motion.moving = true;
  effects.emit("pilot", "helicopter", motion, 1 / 30, {
    active: true,
    time: 3,
  });
  effects.update(3, 1 / 30);
  assert.equal(effects.count, 0);
  effects.dispose();
});
