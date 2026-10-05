import test from "node:test";
import assert from "node:assert/strict";
import {
  createRouteOverlay,
  destinationDistances,
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
  assert.equal(geometry.instanceCount, 2);
  overlay.update([
    [8, 0.43, 2],
    [8, 0.43, 6],
  ]);
  assert.equal(overlay.line.geometry, geometry);
  assert.equal(geometry.instanceCount, 1);
  assert.equal(geometry.attributes.instanceDistanceStart.getX(0), -4);
  overlay.update([[8, 0.43, 6]]);
  assert.equal(overlay.line.visible, false);
  geometry.dispose();
  overlay.line.material.dispose();
});
