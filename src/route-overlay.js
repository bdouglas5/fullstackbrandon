import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { roundNavigation } from "./navigation-path.js";

const SAMPLE_STEP = 0.14;
const MAX_SAMPLES = 420;
const LIFT = 0.045;
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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

// Forecast seams can leave a tiny out-and-back kink; paint straight through it.
export function removeSpikes(points, reach = 0.4) {
  const out = [];
  for (const p of points) {
    while (out.length >= 2) {
      const a = out.at(-2),
        b = out.at(-1),
        ab = gap(a, b),
        bp = gap(b, p);
      if (ab < 1e-9 || bp < 1e-9) break;
      const dot =
        ((b[0] - a[0]) * (p[0] - b[0]) + (b[2] - a[2]) * (p[2] - b[2])) /
        (ab * bp);
      if (dot < -0.5 && Math.min(ab, bp) < reach) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

// A rounded, evenly spaced version of the route. Samples are counted from the
// destination so each one keeps its street position as the courier advances;
// the last sample is always the courier's own pose.
export function smoothRoute(points, { radius = 0.5, step = SAMPLE_STEP } = {}) {
  const clean = removeSpikes(
    points.filter((p, i) => !i || gap(p, points[i - 1]) > 1e-7),
  );
  if (clean.length < 2) return { samples: clean, step, total: 0 };
  const poly = roundNavigation(clean, radius);
  const lengths = [];
  let total = 0;
  for (let i = 1; i < poly.length; i++) {
    lengths.push(gap(poly[i - 1], poly[i]));
    total += lengths[i - 1];
  }
  const stride = Math.max(step, total / MAX_SAMPLES);
  const samples = [poly.at(-1)];
  let seg = poly.length - 2,
    into = 0;
  for (let e = stride; e < total - stride * 0.25; e += stride) {
    // Walk backwards from the end until arclength `e` is reached.
    let need = e - into;
    while (seg > 0 && need > lengths[seg]) {
      need -= lengths[seg];
      into += lengths[seg];
      seg--;
    }
    const k = lengths[seg] ? 1 - need / lengths[seg] : 1;
    samples.push(poly[seg].map((v, n) => v + (poly[seg + 1][n] - v) * k));
  }
  samples.push(poly[0]);
  return { samples: samples.reverse(), step: stride, total };
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
    vertexColors: true,
  });
  // Per-vertex fade rides in the colour channel: strip it from the paint and
  // apply it as opacity, so the route eases in at the courier's feet and out
  // at the door.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "gl_FragColor = vec4( diffuseColor.rgb, alpha );",
      "float fade = max( vColor.r, 0.0001 ); gl_FragColor = vec4( diffuseColor.rgb / fade, alpha * fade );",
    );
  };
  material.customProgramCacheKey = () => "route-fade";
  const line = new Line2(new LineGeometry(), material);
  line.name = "Flowing delivery route";
  line.frustumCulled = false;
  const geometry = line.geometry;
  geometry.setPositions(new Float32Array((MAX_SAMPLES + 2) * 3));
  geometry.setColors(new Float32Array((MAX_SAMPLES + 2) * 3).fill(1));
  line.computeLineDistances();
  for (const name of [
    "instanceStart",
    "instanceDistanceStart",
    "instanceColorStart",
  ])
    geometry.attributes[name].data.setUsage(THREE.DynamicDrawUsage);

  // The route as drawn last frame, indexed from the destination.
  let drawn = [];
  let flow = 0.65;
  let clock = 0;
  const shown = [];
  function update(points, dt = 0, running = true, speed = 0) {
    dt = Math.max(0, dt);
    clock += dt;
    // The route is the follower's actual trajectory. Never ease a second copy
    // of its geometry independently of the person travelling along it; only
    // the far road eases, the end at the courier is pinned to their pose.
    const target = smoothRoute(points);
    const samples = target.samples;
    const count = Math.max(0, samples.length - 1);
    line.visible = count > 0;
    if (!count) {
      drawn = [];
      return;
    }
    const n = samples.length;
    const reused = drawn.length > 0 && gap(drawn.at(-1), samples.at(-1)) < 0.08;
    const k = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
    shown.length = n;
    for (let i = 0; i < n; i++) {
      // i counts from the courier; index from the destination is n - 1 - i.
      const mine = samples[i],
        old = reused ? drawn[drawn.length - (n - i)] : null;
      const fromCourier = (i + 1) * target.step;
      const w = old ? 1 - (1 - k) * smooth(0.3, 1.5, fromCourier) : 1;
      shown[i] = old
        ? [
            old[0] + (mine[0] - old[0]) * w,
            old[1] + (mine[1] - old[1]) * w,
            old[2] + (mine[2] - old[2]) * w,
          ]
        : mine;
    }
    drawn = shown.map((p) => p.slice());
    // Dashes march with the courier: faster when they hurry, still at rest.
    const want = 0.5 + Math.min(2, speed) * 0.4;
    flow += (want - flow) * (dt > 0 ? 1 - Math.exp(-dt * 4) : 1);
    if (running) material.dashOffset -= dt * flow;
    material.opacity = 0.86 + Math.sin(clock * 2.4) * 0.05;
    const attributes = geometry.attributes;
    const fadeAt = (i) => {
      const fromCourier = i === 0 ? 0 : i * target.step;
      const toDoor = (n - 1 - i) * target.step;
      return Math.max(
        0.02,
        smooth(0.05, 0.75, fromCourier) * smooth(0, 0.55, toDoor),
      );
    };
    for (let i = 0; i < count; i++) {
      const a = shown[i],
        b = shown[i + 1];
      attributes.instanceStart.setXYZ(i, a[0], a[1] + LIFT, a[2]);
      attributes.instanceEnd.setXYZ(i, b[0], b[1] + LIFT, b[2]);
      // Counted from the destination, so dash phase is pinned to the street.
      const da = i === 0 ? -target.total : -(n - 1 - i) * target.step,
        db = (n - 2 - i) * -target.step || 0;
      attributes.instanceDistanceStart.setX(i, da);
      attributes.instanceDistanceEnd.setX(i, db);
      const fa = fadeAt(i),
        fb = fadeAt(i + 1);
      attributes.instanceColorStart.setXYZ(i, fa, fa, fa);
      attributes.instanceColorEnd.setXYZ(i, fb, fb, fb);
    }
    attributes.instanceStart.data.needsUpdate = true;
    attributes.instanceDistanceStart.data.needsUpdate = true;
    attributes.instanceColorStart.data.needsUpdate = true;
    geometry.instanceCount = count;
  }
  return { line, update };
}
