import test from "node:test";
import assert from "node:assert/strict";
import {
  createRouteOverlay,
  destinationDistances,
  removeSpikes,
  smoothRoute,
} from "../src/route-overlay.js";

test("route dashes stay fixed across motion samples and street corners", () => {
  const end = [8, 0.43, 6];
  const corner = [8, 0.43, 0];
  const first = destinationDistances([[0, 0.43, 0], corner, end]);
  const moving = destinationDistances([[3, 0.43, 0], corner, end]);
  const turned = destinationDistances([[8, 0.43, 2], end]);
  assert.equal(first[1], moving[1]);
  // A fixed street coordinate has the same dash phase, even as its distance
  // from the moving start changes or the preceding corner disappears.
  assert.equal(first[0] + 5, moving[0] + 2);
  assert.equal(first[1] + 4, turned[0] + 2);
});

test("wide route paint is depth tested, raised off roads, and trims reused buffers", () => {
  const overlay = createRouteOverlay();
  overlay.update([
    [0, 0.43, 0],
    [8, 0.43, 0],
    [8, 0.43, 6],
  ]);
  const geometry = overlay.line.geometry;
  assert.ok(overlay.line.material.linewidth > 3);
  assert.equal(overlay.line.material.depthTest, true);
  assert.ok(geometry.attributes.instanceStart.getY(0) > 0.43);
  assert.ok(geometry.instanceCount > 60);
  const first = geometry.instanceCount;
  overlay.update([
    [8, 0.43, 2],
    [8, 0.43, 6],
  ]);
  assert.equal(overlay.line.geometry, geometry);
  assert.ok(geometry.instanceCount < first);
  const last = geometry.instanceCount - 1;
  assert.equal(geometry.attributes.instanceDistanceEnd.getX(last), 0);
  // The line starts exactly at the courier and the door end is faded out.
  assert.equal(geometry.attributes.instanceStart.getX(0), 8);
  assert.equal(geometry.attributes.instanceStart.getZ(0), 2);
  assert.ok(geometry.attributes.instanceColorEnd.getX(last) < 0.1);
  overlay.update([[8, 0.43, 6]]);
  assert.equal(overlay.line.visible, false);
  geometry.dispose();
  overlay.line.material.dispose();
});

test("smoothed route rounds corners, drops kinks and keeps street dash phase", () => {
  const door = [8, 0.43, 6];
  const path = [[0, 0.43, 0], [8, 0.43, 0], door];
  const a = smoothRoute(path);
  const b = smoothRoute([[3, 0.43, 0], ...path.slice(1)]);
  assert.deepEqual(a.samples.at(-1), door);
  assert.deepEqual(a.samples[0], path[0]);
  // The corner is cut, not a hard 90 degrees.
  assert.ok(a.samples.every((p) => !(p[0] === 8 && p[2] === 0)));
  // Same street position, same distance from the destination.
  const fromEnd = (r, i) => r.samples[r.samples.length - 1 - i];
  assert.deepEqual(fromEnd(a, 10), fromEnd(b, 10));
  const spiked = removeSpikes([
    [0, 0.43, 0],
    [2, 0.43, 0],
    [1.9, 0.43, 0],
    [4, 0.43, 0],
  ]);
  assert.equal(spiked.length, 3);
});
