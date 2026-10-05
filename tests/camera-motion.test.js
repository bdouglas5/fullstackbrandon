import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { createCameraMotion } from "../src/camera-motion.js";

test("camera eases into a slower speed and glides to rest", () => {
  const motion = createCameraMotion();
  const forward = new Vector3(0, 0, -1);
  motion.advance(forward, 50, 1 / 60);
  const startingSpeed = motion.speed;
  assert.ok(startingSpeed > 0 && startingSpeed < 2);
  for (let i = 0; i < 59; i++) motion.advance(forward, 50, 1 / 60);
  assert.ok(motion.speed > 10 && motion.speed < 11);
  const runningSpeed = motion.speed;
  const coast = motion.advance(new Vector3(), 50, 1 / 60).length();
  assert.ok(coast > 0);
  assert.ok(motion.speed > 0 && motion.speed < runningSpeed);
  for (let i = 0; i < 120; i++) motion.advance(new Vector3(), 50, 1 / 60);
  assert.equal(motion.speed, 0);
  assert.equal(motion.advance(new Vector3(), 50, 1 / 60).length(), 0);
});

test("camera easing is frame-rate independent and diagonal speed is normalized", () => {
  const travel = (fps, direction) => {
    const motion = createCameraMotion();
    const position = new Vector3();
    for (let i = 0; i < fps; i++)
      position.add(motion.advance(direction, 50, 1 / fps));
    return position.length();
  };
  const forward = new Vector3(0, 0, -1);
  assert.ok(Math.abs(travel(30, forward) - travel(60, forward)) < 1e-10);
  assert.ok(
    Math.abs(travel(60, forward) - travel(60, new Vector3(1, 0, -1))) < 1e-10,
  );
});

test("reset cancels momentum and reduced motion responds immediately", () => {
  const motion = createCameraMotion();
  motion.advance(new Vector3(1, 0, 0), 50, 0.1);
  motion.stop();
  assert.equal(motion.advance(new Vector3(), 50, 0.1).length(), 0);
  assert.equal(
    motion.advance(new Vector3(1, 0, 0), 50, 0.1, true).length(),
    1.1,
  );
  assert.equal(motion.advance(new Vector3(), 50, 0.1, true).length(), 0);
});
