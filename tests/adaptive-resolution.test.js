import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdaptiveResolution,
  resolutionCeiling,
} from "../src/adaptive-resolution.js";

function frames(controller, start, duration, fps, cost = 5) {
  const changes = [];
  const interval = 1000 / fps;
  let time = start;
  for (; time < start + duration; time += interval) {
    const change = controller.sample(time, cost);
    if (change) changes.push(change);
  }
  return { time, changes };
}

test("sustained slow frames step down to a bounded minimum", () => {
  const quality = createAdaptiveResolution();
  const { changes } = frames(quality, 0, 40000, 30);
  assert.deepEqual(
    changes.map((c) => c.scale),
    [0.85, 0.7, 0.58, 0.45],
  );
  assert.ok(changes.every((c) => c.direction === "lower" && c.fps === 30));
  assert.equal(quality.scale, 0.45);
});

test("60 FPS recovers quality slowly and never exceeds the ceiling", () => {
  const quality = createAdaptiveResolution();
  const slow = frames(quality, 0, 6000, 30);
  assert.equal(quality.scale, 0.85);
  const early = frames(quality, slow.time, 6000, 60);
  assert.equal(early.changes.length, 0);
  const recovered = frames(quality, early.time, 30000, 60);
  assert.deepEqual(
    recovered.changes.map((c) => c.direction),
    ["higher"],
  );
  assert.equal(quality.scale, 1);
});

test("brief stalls, startup, and middle-band FPS do not cause quality flicker", () => {
  const quality = createAdaptiveResolution();
  frames(quality, 0, 2000, 20);
  assert.equal(quality.scale, 1);
  const stable = frames(quality, 2000, 6000, 60);
  quality.sample(stable.time + 200, 5);
  assert.equal(frames(quality, stable.time + 217, 5000, 60).changes.length, 0);
  assert.equal(frames(quality, 14000, 12000, 56).changes.length, 0);
});

test("reset preserves resolution but discards hidden-tab and resize history", () => {
  const quality = createAdaptiveResolution();
  frames(quality, 0, 6000, 30);
  quality.reset(100000);
  assert.equal(quality.scale, 0.85);
  assert.equal(frames(quality, 100000, 2900, 20).changes.length, 0);
  quality.reset(200000);
  assert.equal(quality.sample(200000), null);
  assert.equal(quality.scale, 0.85);
});

test("CPU-heavy frames cannot immediately probe a higher resolution", () => {
  const quality = createAdaptiveResolution();
  const slow = frames(quality, 0, 6000, 30);
  assert.equal(frames(quality, slow.time, 30000, 60, 15).changes.length, 0);
  assert.equal(quality.scale, 0.85);
});

test("a failed recovery probe waits longer before trying again", () => {
  const quality = createAdaptiveResolution();
  const slow = frames(quality, 0, 6000, 30);
  const fast = frames(quality, slow.time, 13000, 60);
  assert.equal(quality.scale, 1);
  const failed = frames(quality, fast.time, 6000, 30);
  assert.equal(quality.scale, 0.85);
  assert.equal(failed.changes.length, 1);
  assert.equal(frames(quality, failed.time, 20000, 60).changes.length, 0);
});

test("pixel budget respects density and viewport area", () => {
  assert.equal(resolutionCeiling(600, 800, 3), 1.5);
  assert.equal(resolutionCeiling(1200, 800, 1), 1);
  const ratio = resolutionCeiling(3840, 2160, 2);
  assert.ok(3840 * 2160 * ratio ** 2 <= 3000001);
});

test("even extremely slow visible frames can reduce resolution", () => {
  const quality = createAdaptiveResolution();
  assert.ok(frames(quality, 0, 30000, 0.8).changes.length > 0);
});
