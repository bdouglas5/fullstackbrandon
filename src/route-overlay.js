import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// Measure backwards from the destination: trimming the travelled prefix must
// never move the dashes on the street still ahead of the courier.
export function destinationDistances(points) {
  const distances = new Array(points.length).fill(0);
  for (let i = points.length - 2; i >= 0; i--)
    distances[i] =
      distances[i + 1] -
      Math.hypot(
        ...points[i].map((value, axis) => value - points[i + 1][axis]),
      );
  return distances;
}

export function createRouteOverlay() {
  const material = new LineMaterial({
    color: "#eaffaf",
    linewidth: 3.2,
    dashed: true,
    dashSize: 0.27,
    gapSize: 0.19,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: true,
    alphaToCoverage: true,
  });
  const line = new Line2(new LineGeometry(), material);
  line.name = "Flowing delivery route";
  line.frustumCulled = false;
  let capacity = 0;
  function update(points, dt = 0, running = true) {
    // The route is the follower's actual trajectory. Never ease a second copy
    // of its geometry independently of the person travelling along it.
    if (running) material.dashOffset -= Math.max(0, dt) * 0.65;
    const count = Math.max(0, points.length - 1);
    if (count > capacity) {
      capacity = Math.max(128, count);
      line.geometry.dispose();
      line.geometry = new LineGeometry();
      line.geometry.setPositions(new Float32Array((capacity + 1) * 3));
      line.computeLineDistances();
      for (const name of ["instanceStart", "instanceDistanceStart"])
        line.geometry.attributes[name].data.setUsage(THREE.DynamicDrawUsage);
    }
    line.visible = count > 0;
    if (!count) return;
    const attributes = line.geometry.attributes;
    const distances = destinationDistances(points);
    for (let i = 0; i < count; i++) {
      // Lift the paint off the surface, while retaining normal depth testing
      // so the character and vehicles naturally cover it as they pass.
      attributes.instanceStart.setXYZ(
        i,
        points[i][0],
        points[i][1] + 0.045,
        points[i][2],
      );
      attributes.instanceEnd.setXYZ(
        i,
        points[i + 1][0],
        points[i + 1][1] + 0.045,
        points[i + 1][2],
      );
      attributes.instanceDistanceStart.setX(i, distances[i]);
      attributes.instanceDistanceEnd.setX(i, distances[i + 1]);
    }
    attributes.instanceStart.data.needsUpdate = true;
    attributes.instanceDistanceStart.data.needsUpdate = true;
    line.geometry.instanceCount = count;
  }
  return { line, update };
}
