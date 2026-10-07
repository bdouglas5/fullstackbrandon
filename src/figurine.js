import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  mergeVertices,
  mergeGeometries,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Sculpted figurine courier.
 *
 * The body is one continuous surface, modeled the way a toy sculptor works in
 * clay: rounded volumes blended together with soft fillets at the shoulders,
 * hips, neck and wrists. It is polygonized once (surface nets), painted with
 * crisp color regions, given baked cavity shading, and skinned to the same
 * joint names the animation, vehicles, crew copies and tests already use.
 * Color regions are separate meshes that share boundary vertices and one
 * skeleton, so the figure reads as a single painted piece while crew uniforms
 * can still be swapped per region.
 */

// ---------------------------------------------------------------------------
// Signed distance primitives. Scalars only: these run ~10^6 times per build.

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
function smax(a, b, k) {
  return -smin(-a, -b, k);
}

function roundCone(ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax,
    bay = by - ay,
    baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const srr = Math.sign(rr) * rr * rr;
  return (x, y, z) => {
    const pax = x - ax,
      pay = y - ay,
      paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy,
      qy = pay * l2 - bay * yy,
      qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = srr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}
function ellipsoid(cx, cy, cz, rx, ry, rz) {
  return (x, y, z) => {
    const px = (x - cx) / rx,
      py = (y - cy) / ry,
      pz = (z - cz) / rz;
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const k1 = Math.sqrt(
      (px * px) / (rx * rx) + (py * py) / (ry * ry) + (pz * pz) / (rz * rz),
    );
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}
function roundBox(cx, cy, cz, hx, hy, hz, r) {
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r,
      qy = Math.abs(y - cy) - hy + r,
      qz = Math.abs(z - cz) - hz + r;
    const mx = Math.max(qx, 0),
      my = Math.max(qy, 0),
      mz = Math.max(qz, 0);
    return (
      Math.sqrt(mx * mx + my * my + mz * mz) +
      Math.min(Math.max(qx, Math.max(qy, qz)), 0) -
      r
    );
  };
}
// Torus around an arbitrary unit axis.
function torus(cx, cy, cz, nx, ny, nz, R, r) {
  return (x, y, z) => {
    const qx = x - cx,
      qy = y - cy,
      qz = z - cz;
    const h = qx * nx + qy * ny + qz * nz;
    const rx = qx - h * nx,
      ry = qy - h * ny,
      rz = qz - h * nz;
    const radial = Math.sqrt(rx * rx + ry * ry + rz * rz) - R;
    return Math.sqrt(radial * radial + h * h) - r;
  };
}
// Squash a primitive along z (a flatter chest or skull) with a bounded error.
function squashZ(fn, s) {
  return (x, y, z) => fn(x, y, z / s) * Math.min(1, s);
}

// ---------------------------------------------------------------------------
// The sculpt. Units are the courier's local space: feet at y=0, facing +z.

const ARM_SPREAD = 0.55; // bind pose is a relaxed A-pose; rest pose hangs down
const JOINTS = {
  hips: [0, 0.4, 0],
  chest: [0, 0.66, 0],
  head: [0, 0.96, 0],
  leg: 0.12,
  legY: 0.41,
  knee: 0.17,
  shoulder: [0.28, 0.83],
  elbow: 0.16,
};

// Cap placement shared by the sculpt, its shadow, the badge and the brim.
const CAP = { y: 1.236, z: -0.034, slope: 0.27, rim: 1.254 };
const capRimY = (z) => CAP.rim + CAP.slope * z;

function armFrame(side) {
  const s = Math.sin(ARM_SPREAD),
    c = Math.cos(ARM_SPREAD);
  const dir = [side * s, -c, 0];
  const S = [side * JOINTS.shoulder[0], JOINTS.shoulder[1], 0];
  const at = (t) => [S[0] + dir[0] * t, S[1] + dir[1] * t, S[2]];
  return { dir, S, E: at(JOINTS.elbow), W: at(0.255), H: at(0.325), at };
}

/**
 * Each primitive: distance fn, blend radius into the body, bounding sphere for
 * early-out, a paint tag and skin weights (bone name → weight, or a function).
 */
function sculpt() {
  const prims = [];
  const add = (name, fn, k, bound, paint, bones) =>
    prims.push({ name, fn, k, bound, paint, bones });
  // The overshirt is cut square at the belt line and the trousers rise to it,
  // so the hips read as trousers, not a rounded nappy.
  const shirtBody = squashZ(
    roundCone(0, 0.47, 0, 0, 0.79, 0, 0.215, 0.178),
    0.8,
  );
  const torso = (x, y, z) => smax(shirtBody(x, y, z), 0.45 - y, 0.016);
  add("torso", torso, 0, [0, 0.63, 0, 0.42], "shirt", (x, y) => {
    const t = THREE.MathUtils.smoothstep(y, 0.5, 0.74);
    return { hips: 1 - t, chest: t };
  });
  add(
    "hem",
    squashZ(torus(0, 0.452, 0, 0, 1, 0, 0.198, 0.03), 0.8),
    0.014,
    [0, 0.45, 0, 0.26],
    "cuff",
    { hips: 1 },
  );
  add(
    "pelvis",
    // Cut off above the crotch so the legs stand apart with a gap between the thighs.
    (() => {
      const hips = squashZ(roundCone(0, 0.4, 0, 0, 0.44, 0, 0.19, 0.2), 0.8);
      return (x, y, z) => smax(hips(x, y, z), 0.355 - y, 0.012);
    })(),
    0.02,
    [0, 0.4, 0, 0.26],
    "trousers",
    { hips: 1 },
  );
  for (const side of [-1, 1]) {
    const leg = side < 0 ? "left leg" : "right leg";
    const knee = side < 0 ? "left knee" : "right knee";
    const x = side * JOINTS.leg;
    add(
      `${leg} thigh`,
      roundCone(x, 0.43, 0, x, 0.245, 0, 0.074, 0.07),
      0.02,
      [x, 0.34, 0, 0.2],
      "trousers",
      { [leg]: 1 },
    );
    add(
      `${leg} shin`,
      roundCone(x, 0.235, 0.002, x, 0.115, 0.008, 0.07, 0.064),
      0.03,
      [x, 0.18, 0, 0.16],
      "trousers",
      { [knee]: 1 },
    );
    // A chunky sneaker: rounded last, raised toe cap, flat sole.
    const last = roundBox(x, 0.062, 0.04, 0.083, 0.058, 0.13, 0.05);
    const toe = ellipsoid(x, 0.07, 0.105, 0.088, 0.067, 0.082);
    add(
      `${leg} sneaker`,
      (px, py, pz) =>
        smax(smin(last(px, py, pz), toe(px, py, pz), 0.04), -py + 0.004, 0.012),
      0.03,
      [x, 0.07, 0.04, 0.2],
      "shoe",
      { [knee]: 1 },
    );
  }
  add(
    "neck",
    roundCone(0, 0.83, 0, 0, 1.0, 0.004, 0.078, 0.07),
    0.045,
    [0, 0.92, 0, 0.16],
    "skin",
    (x, y) => {
      const t = THREE.MathUtils.smoothstep(y, 0.88, 0.99);
      return { chest: 1 - t, head: t };
    },
  );
  const head = { head: 1 };
  add(
    "skull",
    ellipsoid(0, 1.165, 0, 0.3, 0.282, 0.276),
    0.032,
    [0, 1.165, 0, 0.31],
    "skin",
    head,
  );
  for (const side of [-1, 1]) {
    // Slim cheeks keep the head round rather than chubby.
    add(
      "cheek",
      ellipsoid(side * 0.1, 1.085, 0.15, 0.1, 0.082, 0.08),
      0.05,
      [side * 0.1, 1.085, 0.15, 0.11],
      "skin",
      head,
    );
    add(
      "ear",
      ellipsoid(side * 0.292, 1.13, -0.01, 0.036, 0.054, 0.042),
      0.028,
      [side * 0.29, 1.13, -0.01, 0.06],
      "skin",
      head,
    );
    add(
      "sideburn",
      ellipsoid(side * 0.268, 1.17, 0.02, 0.045, 0.075, 0.055),
      0.018,
      [side * 0.258, 1.18, 0.035, 0.11],
      "hair",
      head,
    );
  }
  add(
    "nose",
    ellipsoid(0, 1.11, 0.268, 0.03, 0.026, 0.024),
    0.022,
    [0, 1.11, 0.268, 0.04],
    "skin",
    head,
  );
  // Short sculpted hair: a cap-shaped mass at the back that stops at the
  // nape and in front of the ears.
  const hairBack = ellipsoid(0, 1.155, -0.03, 0.31, 0.29, 0.27);
  add(
    "hair",
    (x, y, z) =>
      smax(
        smax(hairBack(x, y, z), z - 0.01 + (y - 1.2) * 0.3, 0.05),
        0.985 - y,
        0.04,
      ),
    0.014,
    [0, 1.15, -0.04, 0.33],
    "hair",
    head,
  );
  // A soft courier cap, pushed back a touch so the brows and eyes read from
  // the high game camera: crown sits on the skull, the rim rises at the front
  // and dips at the back, and the rim edge is rolled rather than cut.
  const crown = ellipsoid(0, CAP.y, CAP.z, 0.319, 0.262, 0.316);
  const rimNorm = Math.hypot(1, CAP.slope);
  add(
    "cap",
    (x, y, z) =>
      smax(crown(x, y, z), (CAP.rim + CAP.slope * z - y) / rimNorm, 0.034),
    0.016,
    [0, 1.3, 0, 0.34],
    "cap",
    head,
  );
  add(
    "cap button",
    ellipsoid(0, CAP.y + 0.258, CAP.z, 0.034, 0.024, 0.034),
    0.012,
    [0, CAP.y + 0.258, CAP.z, 0.04],
    "cap",
    head,
  );
  for (const side of [-1, 1]) {
    const arm = side < 0 ? "left arm" : "right arm";
    const elbow = side < 0 ? "left elbow" : "right elbow";
    const { S, E, W, H, dir } = armFrame(side);
    add(
      `${arm} shoulder`,
      ellipsoid(side * 0.235, 0.815, 0, 0.092, 0.092, 0.088),
      0.05,
      [side * 0.235, 0.815, 0, 0.1],
      "shirt",
      { chest: 0.55, [arm]: 0.45 },
    );
    add(
      `${arm} upper`,
      roundCone(...S, ...E, 0.079, 0.071),
      0.035,
      [(S[0] + E[0]) / 2, (S[1] + E[1]) / 2, 0, 0.17],
      "shirt",
      { [arm]: 1 },
    );
    add(
      `${arm} forearm`,
      roundCone(...E, ...W, 0.07, 0.064),
      0.022,
      [(E[0] + W[0]) / 2, (E[1] + W[1]) / 2, 0, 0.13],
      "shirt",
      { [elbow]: 1 },
    );
    add(
      `${arm} cuff`,
      torus(...W, ...dir, 0.06, 0.022),
      0.01,
      [W[0], W[1], 0, 0.09],
      "cuff",
      { [elbow]: 1 },
    );
    // Oversized mitten hand with a thumb nub turned toward the body.
    add(
      `${arm} hand`,
      ellipsoid(H[0], H[1], H[2] + 0.004, 0.077, 0.088, 0.07),
      0.026,
      [H[0], H[1], 0, 0.1],
      "skin",
      { [elbow]: 1 },
    );
    add(
      `${arm} thumb`,
      ellipsoid(
        H[0] - side * 0.035,
        H[1] + 0.012,
        H[2] + 0.05,
        0.032,
        0.04,
        0.03,
      ),
      0.024,
      [H[0] - side * 0.035, H[1], 0.05, 0.05],
      "skin",
      { [elbow]: 1 },
    );
  }
  return prims;
}

// Backpack straps follow the finished torso: sample the front and back of the
// chest, push each point onto the surface, then chain capsules through them.
function strapPrims(field) {
  const prims = [],
    lines = [];
  const surface = (x, y, z, dx, dy, dz, start = 0.5) => {
    // March from outside toward the body along -dir until the surface.
    let px = x + dx * start,
      py = y + dy * start,
      pz = z + dz * start;
    for (let i = 0; i < 80; i++) {
      const d = field(px, py, pz);
      if (d < 1e-4) break;
      px -= dx * d;
      py -= dy * d;
      pz -= dz * d;
    }
    return [px, py, pz];
  };
  for (const side of [-1, 1]) {
    const pts = [];
    const x0 = side * 0.118;
    for (const y of [0.545, 0.62, 0.7, 0.77, 0.83])
      pts.push(surface(x0 + side * (y - 0.55) * 0.05, y, 0, 0, 0, 1));
    pts.push(surface(side * 0.135, 0.875, 0.06, 0, 0.82, 0.57, 0.1));
    pts.push(surface(side * 0.14, 0.885, -0.04, 0, 0.85, -0.52, 0.1));
    for (const y of [0.83, 0.77])
      pts.push(surface(side * 0.13, y, 0, 0, 0, -1));
    const lift = (p, amount) => {
      const n = gradient(field, p[0], p[1], p[2]);
      return [p[0] + n[0] * amount, p[1] + n[1] * amount, p[2] + n[2] * amount];
    };
    lines.push(pts.map((p) => lift(p, 0.004)));
    for (let i = 1; i < pts.length; i++) {
      const A = lift(pts[i - 1], -0.004),
        B = lift(pts[i], -0.004);
      prims.push({
        name: "strap",
        fn: roundCone(...A, ...B, 0.017, 0.017),
        k: 0.014,
        bound: [
          (A[0] + B[0]) / 2,
          (A[1] + B[1]) / 2,
          (A[2] + B[2]) / 2,
          Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) / 2 + 0.04,
        ],
        paint: "shirt",
        bones: { chest: 1 },
      });
    }
  }
  return { prims, lines };
}

// Distance to a polyline: painted bands get crisp parallel edges.
function polylineDistance(points) {
  return (x, y, z) => {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay, az] = points[i - 1],
        [bx, by, bz] = points[i];
      const ux = bx - ax,
        uy = by - ay,
        uz = bz - az;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) /
            (ux * ux + uy * uy + uz * uz),
        ),
      );
      const dx = x - ax - ux * t,
        dy = y - ay - uy * t,
        dz = z - az - uz * t;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return best;
  };
}

function makeField(prims) {
  const n = prims.length;
  const fns = prims.map((p) => p.fn),
    ks = prims.map((p) => p.k),
    bx = new Float64Array(n),
    by = new Float64Array(n),
    bz = new Float64Array(n),
    br = new Float64Array(n);
  prims.forEach((p, i) => {
    [bx[i], by[i], bz[i], br[i]] = p.bound;
  });
  return (x, y, z) => {
    let d = fns[0](x, y, z);
    for (let i = 1; i < n; i++) {
      // Bounding-sphere early-out: a primitive farther than the current
      // surface plus its blend radius cannot change the union.
      const dx = x - bx[i],
        dy = y - by[i],
        dz = z - bz[i];
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - br[i];
      if (far > d + ks[i]) continue;
      d = smin(d, fns[i](x, y, z), ks[i]);
    }
    return d;
  };
}

function gradient(field, x, y, z, e = 0.0025) {
  // Tetrahedral central difference: four taps, smooth analytic-looking normals.
  const a = field(x + e, y - e, z - e),
    b = field(x - e, y - e, z + e),
    c = field(x - e, y + e, z - e),
    d = field(x + e, y + e, z + e);
  const gx = a - b - c + d,
    gy = -a - b + c + d,
    gz = -a + b - c + d;
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

// ---------------------------------------------------------------------------
// Surface nets polygonization.

function polygonize(field, bounds, h) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / h) + 1,
    ny = Math.ceil((y1 - y0) / h) + 1,
    nz = Math.ceil((z1 - z0) / h) + 1;
  const values = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // Narrow band: a coarse pass finds where the surface can be. Samples far
  // from it inherit the coarse value, which only has to carry the sign.
  const stride = 3,
    cx = Math.ceil((nx - 1) / stride) + 1,
    cy = Math.ceil((ny - 1) / stride) + 1,
    cz = Math.ceil((nz - 1) / stride) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++)
        coarse[i + cx * (j + cy * k)] = field(
          x0 + Math.min(i * stride, nx - 1) * h,
          y0 + Math.min(j * stride, ny - 1) * h,
          z0 + Math.min(k * stride, nz - 1) * h,
        );
  const band = h * stride * 1.2;
  for (let k = 0; k < nz; k++) {
    const ck = Math.round(k / stride);
    for (let j = 0; j < ny; j++) {
      const cj = Math.round(j / stride);
      for (let i = 0; i < nx; i++) {
        const near = coarse[Math.round(i / stride) + cx * (cj + cy * ck)];
        values[id(i, j, k)] =
          Math.abs(near) > band
            ? near
            : field(x0 + i * h, y0 + j * h, z0 + k * h);
      }
    }
  }
  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions = [];
  const corner = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const offset = corner.map(([a, b, d]) => a + nx * (b + ny * d));
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const v = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const base = id(i, j, k);
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = values[base + offset[c]];
          if (v[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0,
          sy = 0,
          sz = 0,
          count = 0;
        for (let e = 0; e < 12; e++) {
          const a = edges[e][0],
            b = edges[e][1];
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          const ca = corner[a],
            cb = corner[b];
          sx += ca[0] + (cb[0] - ca[0]) * t;
          sy += ca[1] + (cb[1] - ca[1]) * t;
          sz += ca[2] + (cb[2] - ca[2]) * t;
          count++;
        }
        cellVertex[cid(i, j, k)] = positions.length / 3;
        positions.push(
          x0 + (i + sx / count) * h,
          y0 + (j + sy / count) * h,
          z0 + (k + sz / count) * h,
        );
      }
  const triangles = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Split along the shorter diagonal for even shading.
    const P = positions;
    const dAC = Math.hypot(
      P[a * 3] - P[c * 3],
      P[a * 3 + 1] - P[c * 3 + 1],
      P[a * 3 + 2] - P[c * 3 + 2],
    );
    const dBD = Math.hypot(
      P[b * 3] - P[d * 3],
      P[b * 3 + 1] - P[d * 3 + 1],
      P[b * 3 + 2] - P[d * 3 + 2],
    );
    const tris =
      dAC < dBD
        ? [
            [a, b, c],
            [a, c, d],
          ]
        : [
            [a, b, d],
            [b, c, d],
          ];
    for (const t of tris) triangles.push(flip ? [t[0], t[2], t[1]] : t);
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const here = values[id(i, j, k)] < 0;
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
          const there = values[id(i + 1, j, k)] < 0;
          if (here !== there)
            quad(
              cellVertex[cid(i, j - 1, k - 1)],
              cellVertex[cid(i, j, k - 1)],
              cellVertex[cid(i, j, k)],
              cellVertex[cid(i, j - 1, k)],
              !here,
            );
        }
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
          const there = values[id(i, j + 1, k)] < 0;
          if (here !== there)
            quad(
              cellVertex[cid(i - 1, j, k - 1)],
              cellVertex[cid(i - 1, j, k)],
              cellVertex[cid(i, j, k)],
              cellVertex[cid(i, j, k - 1)],
              !here,
            );
        }
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
          const there = values[id(i, j, k + 1)] < 0;
          if (here !== there)
            quad(
              cellVertex[cid(i - 1, j - 1, k)],
              cellVertex[cid(i, j - 1, k)],
              cellVertex[cid(i, j, k)],
              cellVertex[cid(i - 1, j, k)],
              !here,
            );
        }
      }
  return { positions, triangles };
}

// Pull every vertex onto the true blended surface; the grid only finds it.
function relax(field, positions, h) {
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i],
      y = positions[i + 1],
      z = positions[i + 2];
    const ox = x,
      oy = y,
      oz = z;
    for (let n = 0; n < 3; n++) {
      const d = field(x, y, z);
      if (Math.abs(d) < 1e-5) break;
      const g = gradient(field, x, y, z);
      x -= g[0] * d;
      y -= g[1] * d;
      z -= g[2] * d;
    }
    const moved = Math.hypot(x - ox, y - oy, z - oz);
    const limit = h * 0.9;
    const s = moved > limit ? limit / moved : 1;
    positions[i] = ox + (x - ox) * s;
    positions[i + 1] = oy + (y - oy) * s;
    positions[i + 2] = oz + (z - oz) * s;
  }
}

// ---------------------------------------------------------------------------
// Crisp paint regions: clip triangles along smooth implicit boundaries.

function paintRegions(mesh, rules, fallback) {
  const P = mesh.positions;
  let tris = mesh.triangles.map((t) => [...t, null]);
  const edgeCache = new Map();
  for (const rule of rules) {
    const value = new Map();
    const g = (i) => {
      if (!value.has(i))
        value.set(i, rule.g(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], i));
      return value.get(i);
    };
    const split = (a, b) => {
      const key = `${rule.id}:${Math.min(a, b)}:${Math.max(a, b)}`;
      if (edgeCache.has(key)) return edgeCache.get(key);
      const ga = g(a),
        gb = g(b);
      let t = ga / (ga - gb);
      // The paint boundary is a smooth implicit curve, but interpolating its
      // value between two vertices lands off it wherever the field is curved,
      // which shows as ragged hairlines and hems. Walk the chord (false
      // position) to the true crossing so every boundary vertex lies on it.
      if (!rule.coarse) {
        const ax = P[a * 3],
          ay = P[a * 3 + 1],
          az = P[a * 3 + 2];
        const dx = P[b * 3] - ax,
          dy = P[b * 3 + 1] - ay,
          dz = P[b * 3 + 2] - az;
        let lo = 0,
          hi = 1,
          glo = ga,
          ghi = gb;
        for (let k = 0; k < 7; k++) {
          const gm = rule.g(ax + dx * t, ay + dy * t, az + dz * t);
          if (Math.abs(gm) < 1e-6) break;
          if (gm < 0 === glo < 0) {
            lo = t;
            glo = gm;
          } else {
            hi = t;
            ghi = gm;
          }
          t =
            glo === ghi ? (lo + hi) / 2 : lo + ((hi - lo) * glo) / (glo - ghi);
          t = Math.min(hi, Math.max(lo, t));
        }
      }
      const idx = P.length / 3;
      P.push(
        P[a * 3] + (P[b * 3] - P[a * 3]) * t,
        P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t,
        P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t,
      );
      value.set(idx, 0);
      mesh.onSplit?.(idx, a, b, t);
      edgeCache.set(key, idx);
      return idx;
    };
    const next = [];
    for (const tri of tris) {
      if (tri[3] !== null) {
        next.push(tri);
        continue;
      }
      const [a, b, c] = tri;
      const ins = [g(a) <= 0, g(b) <= 0, g(c) <= 0];
      const n = ins.filter(Boolean).length;
      if (n === 3) {
        next.push([a, b, c, rule.region]);
        continue;
      }
      if (n === 0) {
        next.push(tri);
        continue;
      }
      // Rotate so the lone vertex (the one on its own side) comes first.
      const lone = n === 1 ? ins.indexOf(true) : ins.indexOf(false);
      const v = [tri[lone], tri[(lone + 1) % 3], tri[(lone + 2) % 3]];
      const ab = split(v[0], v[1]),
        ac = split(v[0], v[2]);
      const loneRegion = n === 1 ? rule.region : null,
        pairRegion = n === 1 ? null : rule.region;
      next.push([v[0], ab, ac, loneRegion]);
      next.push([ab, v[1], v[2], pairRegion]);
      next.push([ab, v[2], ac, pairRegion]);
    }
    tris = next;
  }
  for (const t of tris) if (t[3] === null) t[3] = fallback;
  return tris;
}

// ---------------------------------------------------------------------------
// One-time build, shared by every copy of the courier.

const REGION_ORDER = [
  "skin",
  "hair",
  "cap",
  "badge",
  "shirt",
  "tee",
  "cuff",
  "strap",
  "trousers",
  "shoe",
  "sole",
];
// Mesh names keep the existing animation, recolor and test contract.
const REGION_NAMES = {
  skin: "Brandon skin",
  hair: "Hair",
  cap: "cap",
  badge: "Cap embroidered badge",
  shirt: "teal overshirt",
  tee: "t-shirt",
  cuff: "Rolled linen cuff",
  strap: "Backpack woven shoulder strap",
  trousers: "trousers",
  shoe: "sneaker",
  sole: "Sneaker rubber sole",
};
const BONES = [
  "hips",
  "chest",
  "head",
  "left leg",
  "left knee",
  "right leg",
  "right knee",
  "left arm",
  "left elbow",
  "right arm",
  "right elbow",
];

// Two levels of detail share one sculpt: the hero surface for close views
// and a lighter one for distant copies (crew, vehicle seats, overview).
export const FIGURINE_DETAIL = { hero: 0.0205, far: 0.034 };
let sculptCache = null;
const buildCache = new Map();

function sculptFields() {
  if (sculptCache) return sculptCache;
  const base = sculpt();
  const straps = strapPrims(makeField(base));
  const prims = [...base, ...straps.prims];
  const strapBands = straps.lines.map(polylineDistance);
  const field = makeField(prims);
  // Separate pieces still darken the body beneath them.
  const brim = ellipsoid(0, capRimY(0.25) - 0.008, 0.25, 0.25, 0.035, 0.16);
  const pack = roundBox(0, 0.69, -0.245, 0.185, 0.195, 0.1, 0.075);
  const occlusion = (x, y, z) =>
    Math.min(field(x, y, z), brim(x, y, z), pack(x, y, z));
  const tags = [...new Set(prims.map((p) => p.paint))];
  const paintOf = new Int32Array(prims.map((p) => tags.indexOf(p.paint)));
  const boneIndex = new Map(BONES.map((b, i) => [b, i]));
  // Constant skin weights are flattened once; split ones stay functions.
  const boneSpec = prims.map((p) =>
    typeof p.bones === "function"
      ? p.bones
      : Object.entries(p.bones).map(([bone, w]) => [boneIndex.get(bone), w]),
  );
  sculptCache = {
    strapBands,
    prims,
    field,
    occlusion,
    tags,
    paintOf,
    boneIndex,
    boneSpec,
  };
  return sculptCache;
}

export function figurineGeometry(resolution = FIGURINE_DETAIL.hero) {
  if (buildCache.has(resolution)) return buildCache.get(resolution);
  const {
    prims,
    field,
    occlusion,
    tags,
    paintOf,
    boneIndex,
    boneSpec,
    strapBands,
  } = sculptFields();
  const bounds = [-0.6, -0.02, -0.36, 0.6, 1.52, 0.36];
  const mesh = polygonize(field, bounds, resolution);
  relax(field, mesh.positions, resolution);

  const np = prims.length;
  const cache = new Map();
  const dist = (i, x, y, z) => {
    let d = i === undefined ? undefined : cache.get(i);
    if (!d) {
      d = new Float64Array(np);
      for (let p = 0; p < np; p++) d[p] = prims[p].fn(x, y, z);
      if (i !== undefined) cache.set(i, d);
    }
    return d;
  };
  const mask = (names) => tags.map((t) => names.includes(t));
  const tagMin = (d, m) => {
    let v = Infinity;
    for (let p = 0; p < np; p++) if (m[paintOf[p]] && d[p] < v) v = d[p];
    return v;
  };
  const shoeMask = mask(["shoe"]),
    trouserMask = mask(["trousers"]),
    shirtMask = mask(["shirt"]),
    trimMask = mask(["skin", "cuff"]);
  // Decals first, then each paint tag claims where its volumes dominate.
  const rules = [
    {
      id: "badge",
      region: "badge",
      // Embroidered patch centered on the cap front.
      g: (x, y, z) =>
        Math.hypot(x, (y - (CAP.y + 0.135)) * 1.05, Math.max(0, 0.22 - z)) -
        0.046,
    },
    {
      id: "sole",
      region: "sole",
      g: (x, y, z, i) => {
        const d = dist(i, x, y, z);
        return Math.max(
          y - 0.026,
          tagMin(d, shoeMask) - tagMin(d, trouserMask),
        );
      },
    },
    {
      id: "tee",
      region: "tee",
      // V-neck opening of the overshirt, only on the chest front.
      g: (x, y, z, i) => {
        const d = dist(i, x, y, z);
        const half = 0.034 + Math.max(0, y - 0.66) * 0.42;
        return Math.max(
          Math.abs(x) - half,
          0.53 - y,
          y - 0.875,
          0.02 - z,
          tagMin(d, shirtMask) - tagMin(d, trimMask),
        );
      },
    },
  ];
  rules.push({
    id: "strap",
    region: "strap",
    g: (x, y, z) =>
      Math.min(...strapBands.map((band) => band(x, y, z))) - 0.021,
  });
  const order = ["cuff", "cap", "hair", "skin", "shoe", "trousers"];
  for (let r = 0; r < order.length; r++) {
    const own = mask([order[r]]),
      rest = mask([...order.slice(r + 1), "shirt"]);
    rules.push({
      id: order[r],
      region: order[r],
      g: (x, y, z, i) => {
        const d = dist(i, x, y, z);
        return tagMin(d, own) - tagMin(d, rest);
      },
    });
  }
  const tris = paintRegions(mesh, rules, "shirt");

  // Per-vertex attributes on the final (split) vertex set.
  const P = mesh.positions,
    count = P.length / 3;
  const normals = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    skinIndex = new Uint16Array(count * 4),
    skinWeight = new Float32Array(count * 4);
  const weights = new Float64Array(BONES.length);
  for (let i = 0; i < count; i++) {
    let x = P[i * 3],
      y = P[i * 3 + 1],
      z = P[i * 3 + 2];
    // Split vertices sit on chords; settle them back onto the surface.
    const d0 = field(x, y, z);
    if (Math.abs(d0) > 1e-4) {
      const g0 = gradient(field, x, y, z);
      x -= g0[0] * d0;
      y -= g0[1] * d0;
      z -= g0[2] * d0;
      P[i * 3] = x;
      P[i * 3 + 1] = y;
      P[i * 3 + 2] = z;
    }
    const n = gradient(field, x, y, z);
    normals[i * 3] = n[0];
    normals[i * 3 + 1] = n[1];
    normals[i * 3 + 2] = n[2];
    // Baked cavity shading: how enclosed the surface around this point is.
    // Darkens armpits, the neck crease, under the cap and brim.
    let occ = 0;
    for (let s = 1; s <= 5; s++) {
      const step = s * 0.022;
      occ +=
        (step - occlusion(x + n[0] * step, y + n[1] * step, z + n[2] * step)) /
        (1 << s);
    }
    const ao = THREE.MathUtils.clamp(1 - occ * 3.2, 0.42, 1);
    // A touch of painted warmth on the cheeks.
    let r = ao,
      gg = ao,
      b = ao;
    for (let side = -1; side <= 1; side += 2) {
      const c = Math.exp(
        -((x - side * 0.15) ** 2 + (y - 1.075) ** 2 + (z - 0.23) ** 2) / 0.0018,
      );
      r *= 1 + c * 0.06;
      gg *= 1 - c * 0.13;
      b *= 1 - c * 0.12;
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = gg;
    colors[i * 3 + 2] = b;
    // Skin weights from the volumes a point belongs to. Points in a blended
    // fillet sit near two volumes and bend smoothly between them.
    const d = dist(i, x, y, z);
    weights.fill(0);
    for (let p = 0; p < np; p++) {
      const influence = Math.exp(-Math.max(0, d[p]) / 0.018);
      if (influence < 1e-4) continue;
      const spec = boneSpec[p];
      if (typeof spec === "function") {
        const bones = spec(x, y, z);
        for (const bone in bones)
          weights[boneIndex.get(bone)] += influence * bones[bone];
      } else
        for (let q = 0; q < spec.length; q++)
          weights[spec[q][0]] += influence * spec[q][1];
    }
    // Keep the four strongest influences.
    let total = 0;
    for (let slot = 0; slot < 4; slot++) {
      let best = -1,
        bestW = 0;
      for (let k = 0; k < weights.length; k++)
        if (weights[k] > bestW) {
          bestW = weights[k];
          best = k;
        }
      if (best < 0) break;
      skinIndex[i * 4 + slot] = best;
      skinWeight[i * 4 + slot] = bestW;
      total += bestW;
      weights[best] = 0;
    }
    for (let slot = 0; slot < 4; slot++) skinWeight[i * 4 + slot] /= total || 1;
  }
  // Region geometries keep only their own vertices. Boundary vertices are
  // duplicated with identical positions and normals, so seams are invisible.
  const regions = {};
  for (const region of REGION_ORDER) {
    const remap = new Map(),
      index = [];
    for (const t of tris) {
      if (t[3] !== region) continue;
      for (let c = 0; c < 3; c++) {
        let v = remap.get(t[c]);
        if (v === undefined) remap.set(t[c], (v = remap.size));
        index.push(v);
      }
    }
    if (!index.length) continue;
    const n = remap.size;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      col = new Float32Array(n * 3),
      si = new Uint16Array(n * 4),
      sw = new Float32Array(n * 4);
    for (const [src, dst] of remap) {
      for (let c = 0; c < 3; c++) {
        pos[dst * 3 + c] = P[src * 3 + c];
        nor[dst * 3 + c] = normals[src * 3 + c];
        col[dst * 3 + c] = colors[src * 3 + c];
      }
      for (let c = 0; c < 4; c++) {
        si[dst * 4 + c] = skinIndex[src * 4 + c];
        sw[dst * 4 + c] = skinWeight[src * 4 + c];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    g.setIndex(index);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    regions[region] = g;
  }
  // Face details are placed on the sculpted surface, not floated in front.
  const onFace = (x, y) => {
    let z = 0.5;
    for (let i = 0; i < 80; i++) {
      const d = field(x, y, z);
      if (d < 1e-4) break;
      z -= d;
    }
    return [x, y, z, gradient(field, x, y, z)];
  };
  const built = {
    regions,
    face: {
      eyes: [-1, 1].map((s) => onFace(s * 0.098, 1.168)),
      brows: [-1, 1].map((s) => onFace(s * 0.1, 1.168 + 0.07)),
      mouth: onFace(0, 1.058),
      badge: onFace(0, CAP.y + 0.135),
      patch: onFace(0.17, 0.69),
    },
    triangles: tris.length,
    vertices: count,
  };
  buildCache.set(resolution, built);
  return built;
}

// ---------------------------------------------------------------------------
// Townsfolk: the same sculpting, smaller and rigid. Head, neck, shoulders and
// coat are one painted surface; arms and legs stay separate and instanced so
// a whole crowd costs a handful of draw calls.

const TOWNSFOLK_DETAIL = 0.025;
const townsfolkCache = new Map();
export function townsfolkGeometry(style = 0, dress = false) {
  const key = `${style}/${dress}`;
  if (townsfolkCache.has(key)) return townsfolkCache.get(key);
  const prims = [];
  const add = (fn, k, bound, paint) => prims.push({ fn, k, bound, paint });
  add(
    squashZ(roundCone(0, 0.25, 0, 0, 0.47, 0, 0.142, 0.108), 0.82),
    0,
    [0, 0.36, 0, 0.26],
    "cloth",
  );
  if (dress)
    add(
      squashZ(roundCone(0, 0.15, 0, 0, 0.36, 0, 0.17, 0.118), 0.85),
      0.06,
      [0, 0.25, 0, 0.26],
      "cloth",
    );
  add(
    ellipsoid(0, 0.2, 0, 0.118, 0.07, 0.098),
    0.04,
    [0, 0.2, 0, 0.14],
    "cloth",
  );
  for (const side of [-1, 1])
    add(
      ellipsoid(side * 0.128, 0.465, 0, 0.062, 0.06, 0.058),
      0.04,
      [side * 0.128, 0.465, 0, 0.07],
      "cloth",
    );
  add(
    roundCone(0, 0.49, 0, 0, 0.59, 0.003, 0.05, 0.046),
    0.035,
    [0, 0.54, 0, 0.1],
    "skin",
  );
  add(
    ellipsoid(0, 0.668, 0, 0.165, 0.158, 0.153),
    0.025,
    [0, 0.668, 0, 0.17],
    "skin",
  );
  for (const side of [-1, 1]) {
    add(
      ellipsoid(side * 0.07, 0.618, 0.09, 0.07, 0.055, 0.055),
      0.045,
      [side * 0.07, 0.618, 0.09, 0.08],
      "skin",
    );
    add(
      ellipsoid(side * 0.161, 0.655, -0.005, 0.02, 0.03, 0.024),
      0.016,
      [side * 0.16, 0.655, 0, 0.04],
      "skin",
    );
  }
  add(
    ellipsoid(0, 0.638, 0.152, 0.017, 0.015, 0.014),
    0.012,
    [0, 0.638, 0.152, 0.03],
    "skin",
  );
  const hairCap = ellipsoid(0, 0.675, -0.012, 0.172, 0.166, 0.163);
  const fringe = 0.712; // hairline height at the forehead
  add(
    (x, y, z) =>
      smax(hairCap(x, y, z), fringe - y + Math.max(0, -z) * 1.1, 0.03),
    0.01,
    [0, 0.7, 0, 0.19],
    "hair",
  );
  if (style === 0)
    add(
      ellipsoid(0, 0.81, -0.075, 0.075, 0.07, 0.07),
      0.035,
      [0, 0.81, -0.075, 0.08],
      "hair",
    );
  else if (style === 1) {
    const bob = ellipsoid(0, 0.64, -0.02, 0.19, 0.17, 0.17);
    add(
      (x, y, z) =>
        smax(
          smax(bob(x, y, z), z - 0.03 + (y - 0.7) * 0.6, 0.03),
          0.53 - y,
          0.03,
        ),
      0.02,
      [0, 0.64, -0.02, 0.2],
      "hair",
    );
  } else
    for (const side of [-1, 1])
      add(
        ellipsoid(side * 0.06, 0.8, 0.03, 0.07, 0.04, 0.07),
        0.04,
        [side * 0.06, 0.8, 0.03, 0.08],
        "hair",
      );
  const field = makeField(prims);
  const mesh = polygonize(
    field,
    [-0.26, 0.08, -0.26, 0.26, 0.9, 0.26],
    TOWNSFOLK_DETAIL,
  );
  relax(field, mesh.positions, TOWNSFOLK_DETAIL);
  const tags = ["hair", "skin", "cloth"];
  const paintOf = prims.map((p) => tags.indexOf(p.paint));
  const dist = new Map();
  const distances = (i, x, y, z) => {
    if (i === undefined) return prims.map((p) => p.fn(x, y, z));
    if (!dist.has(i))
      dist.set(
        i,
        prims.map((p) => p.fn(x, y, z)),
      );
    return dist.get(i);
  };
  const tagMin = (d, set) => {
    let v = Infinity;
    for (let p = 0; p < prims.length; p++)
      if (set.includes(paintOf[p]) && d[p] < v) v = d[p];
    return v;
  };
  const tris = paintRegions(
    mesh,
    [
      {
        id: "hair",
        region: "hair",
        g: (x, y, z, i) => {
          const d = distances(i, x, y, z);
          return tagMin(d, [0]) - tagMin(d, [1, 2]);
        },
      },
      {
        id: "skin",
        region: "skin",
        g: (x, y, z, i) => {
          const d = distances(i, x, y, z);
          return tagMin(d, [1]) - tagMin(d, [2]);
        },
      },
    ],
    "cloth",
  );
  const P = mesh.positions,
    count = P.length / 3;
  const normals = new Float32Array(count * 3),
    shade = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x = P[i * 3],
      y = P[i * 3 + 1],
      z = P[i * 3 + 2];
    const d0 = field(x, y, z);
    if (Math.abs(d0) > 1e-4) {
      const g0 = gradient(field, x, y, z);
      P[i * 3] = x -= g0[0] * d0;
      P[i * 3 + 1] = y -= g0[1] * d0;
      P[i * 3 + 2] = z -= g0[2] * d0;
    }
    const n = gradient(field, x, y, z);
    normals.set(n, i * 3);
    let occ = 0;
    for (let s = 1; s <= 4; s++) {
      const step = s * 0.015;
      occ +=
        (step - field(x + n[0] * step, y + n[1] * step, z + n[2] * step)) /
        (1 << s);
    }
    const ao = THREE.MathUtils.clamp(1 - occ * 3.4, 0.45, 1);
    let r = ao,
      g = ao,
      b = ao;
    for (let side = -1; side <= 1; side += 2) {
      const c = Math.exp(
        -((x - side * 0.085) ** 2 + (y - 0.63) ** 2 + (z - 0.13) ** 2) / 0.0007,
      );
      r *= 1 + c * 0.05;
      g *= 1 - c * 0.12;
      b *= 1 - c * 0.11;
    }
    shade[i * 3] = r;
    shade[i * 3 + 1] = g;
    shade[i * 3 + 2] = b;
  }
  const regions = {};
  for (const region of ["skin", "cloth", "hair"]) {
    const remap = new Map(),
      index = [];
    for (const t of tris) {
      if (t[3] !== region) continue;
      for (let c = 0; c < 3; c++) {
        let v = remap.get(t[c]);
        if (v === undefined) remap.set(t[c], (v = remap.size));
        index.push(v);
      }
    }
    if (!index.length) continue;
    const pos = new Float32Array(remap.size * 3),
      nor = new Float32Array(remap.size * 3),
      col = new Float32Array(remap.size * 3);
    for (const [src, dst] of remap)
      for (let c = 0; c < 3; c++) {
        pos[dst * 3 + c] = P[src * 3 + c];
        nor[dst * 3 + c] = normals[src * 3 + c];
        col[dst * 3 + c] = shade[src * 3 + c];
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    regions[region] = geometry;
  }
  const onFace = (x, y) => {
    let z = 0.4;
    for (let i = 0; i < 60; i++) {
      const d = field(x, y, z);
      if (d < 1e-4) break;
      z -= d;
    }
    return [x, y, z, gradient(field, x, y, z)];
  };
  const built = { regions, eyes: [-1, 1].map((s) => onFace(s * 0.058, 0.662)) };
  townsfolkCache.set(key, built);
  return built;
}

// ---------------------------------------------------------------------------
// Rig. A Group subclass so deep clones rebind their own skeleton.

const FINISH = {
  skin: { roughness: 0.52 },
  hair: { roughness: 0.46 },
  cap: { roughness: 0.48 },
  badge: { roughness: 0.42 },
  shirt: { roughness: 0.66 },
  tee: { roughness: 0.7 },
  cuff: { roughness: 0.66 },
  strap: { roughness: 0.58 },
  trousers: { roughness: 0.7 },
  shoe: { roughness: 0.34 },
  sole: { roughness: 0.6 },
};

const liveBodies = new Set();
export class FigurineBody extends THREE.Group {
  constructor() {
    super();
    liveBodies.add(new WeakRef(this));
  }
  clone(recursive = true) {
    const copy = new this.constructor().copy(this, recursive);
    if (!recursive) return copy;
    const pairs = new Map();
    const walk = (a, b) => {
      pairs.set(a, b);
      a.children.forEach((child, i) => walk(child, b.children[i]));
    };
    walk(this, copy);
    const skeletons = new Map();
    for (const [source, target] of pairs) {
      if (!source.isSkinnedMesh) continue;
      if (!skeletons.has(source.skeleton))
        skeletons.set(
          source.skeleton,
          new THREE.Skeleton(
            source.skeleton.bones.map((bone) => pairs.get(bone)),
            source.skeleton.boneInverses,
          ),
        );
      target.bind(skeletons.get(source.skeleton), source.bindMatrix);
    }
    return copy;
  }
}

// Distant copies (crew across the bay, seated pilots, the overview camera)
// switch to the lighter surface. The far level is built in idle time.
let farReady = false,
  farScheduled = false;
const worldPosition = new THREE.Vector3();
export function updateFigurineDetail(camera, viewportHeight = 900) {
  if (!farReady) {
    if (!farScheduled && typeof window !== "undefined") {
      farScheduled = true;
      const build = () => {
        figurineGeometry(FIGURINE_DETAIL.far);
        farReady = true;
      };
      (window.requestIdleCallback || ((f) => setTimeout(f, 400)))(build);
    }
    return 0;
  }
  const hero = figurineGeometry(FIGURINE_DETAIL.hero).regions,
    far = figurineGeometry(FIGURINE_DETAIL.far).regions;
  const pixels =
    viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  let detailed = 0;
  for (const ref of liveBodies) {
    const body = ref.deref();
    if (!body) {
      liveBodies.delete(ref);
      continue;
    }
    if (!body.parent) continue;
    body.getWorldPosition(worldPosition);
    const height =
      1.5 * new THREE.Vector3().setFromMatrixScale(body.matrixWorld).y;
    const onScreen =
      (height / Math.max(0.01, camera.position.distanceTo(worldPosition))) *
      pixels;
    // Hysteresis keeps a character from flickering between levels.
    const wasHero = body.userData.detail !== "far";
    const hi = onScreen > (wasHero ? 52 : 64);
    if (hi === wasHero && body.userData.detail) {
      if (hi) detailed++;
      continue;
    }
    body.userData.detail = hi ? "hero" : "far";
    const set = hi ? hero : far;
    body.traverse((o) => {
      const region = o.userData.figurineRegion;
      if (!region) return;
      o.visible = !!set[region];
      if (set[region]) o.geometry = set[region];
    });
    if (hi) detailed++;
  }
  return detailed;
}

/** Swap a crew uniform or contractor kit while keeping baked shading. */
export function recolorFigurine(body, colors) {
  const regions = {
    shirt: ["teal overshirt"],
    cap: ["cap", "cap brim"],
    trousers: ["trousers"],
  };
  for (const [key, color] of Object.entries(colors)) {
    for (const name of regions[key] || [key])
      body.traverse((o) => {
        if (o.name !== name || !o.material) return;
        o.material = o.material.clone();
        o.material.color.set(color);
      });
  }
  return body;
}

// Tiny painted details (an emblem, a patch, a charm) are baked into one
// vertex-coloured mesh each, so a handful of stitches costs one draw call.
const detailMaterial = (roughness = 0.55) =>
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0,
  });
function bakeParts(parts) {
  const geometries = parts.map(({ geometry, color, matrix }) => {
    const g = geometry.index
      ? geometry.clone()
      : mergeVertices(geometry.clone());
    g.deleteAttribute("uv");
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((g) => g.dispose());
  return merged;
}
const at = (x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

export function createFigurine(kit, look = {}) {
  const c = {
    shirt: "#216f75",
    tee: "#fff2d8",
    trousers: "#2a4253",
    cap: "#263e4e",
    badge: "#f5d490",
    skin: "#f0b58f",
    hair: "#5b3a2a",
    pack: "#f0bf55",
    flap: "#d9a441",
    shoe: "#fbf0dc",
    sole: "#d8c29c",
    cuff: "#7aa29c",
    ...look,
  };
  const colors = {
    skin: c.skin,
    hair: c.hair,
    cap: c.cap,
    badge: c.badge,
    shirt: c.shirt,
    tee: c.tee,
    cuff: c.cuff,
    strap: c.flap,
    trousers: c.trousers,
    shoe: c.shoe,
    sole: c.sole,
  };
  const built = figurineGeometry();
  const body = new FigurineBody();
  body.userData.toyRig = true;
  body.userData.sculpted = true;
  // A stable identity keeps every gesture schedule the same on every run.
  body.userData.castId = "brandon";
  const bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  // Bone names are the animation contract. Arms hang from the chest so the
  // shoulders follow a spine twist; legs hang from the hips.
  const hips = bone("hips", body, ...JOINTS.hips);
  const chest = bone("chest", hips, 0, JOINTS.chest[1] - JOINTS.hips[1], 0);
  const head = bone("head rig", chest, 0, JOINTS.head[1] - JOINTS.chest[1], 0);
  const legs = [],
    arms = [],
    knees = [],
    elbows = [];
  for (const side of [-1, 1]) {
    const leg = bone(
      side < 0 ? "left leg" : "right leg",
      hips,
      side * JOINTS.leg,
      JOINTS.legY - JOINTS.hips[1],
      0,
    );
    knees.push(bone("knee", leg, 0, -JOINTS.knee, 0));
    legs.push(leg);
    const arm = bone(
      side < 0 ? "left arm" : "right arm",
      chest,
      side * JOINTS.shoulder[0],
      JOINTS.shoulder[1] - JOINTS.chest[1],
      0,
    );
    elbows.push(bone("elbow", arm, 0, -JOINTS.elbow, 0));
    arms.push(arm);
  }
  const byName = {
    hips,
    chest,
    head,
    "left leg": legs[0],
    "left knee": knees[0],
    "right leg": legs[1],
    "right knee": knees[1],
    "left arm": arms[0],
    "left elbow": elbows[0],
    "right arm": arms[1],
    "right elbow": elbows[1],
  };
  // Bind in the sculpted A-pose, then relax the arms to hang at the sides.
  arms[0].rotation.z = -ARM_SPREAD;
  arms[1].rotation.z = ARM_SPREAD;
  body.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map((n) => byName[n]));
  const material = (region) =>
    kit?.figurineMaterial?.(colors[region], FINISH[region]) ||
    new THREE.MeshStandardMaterial({
      color: colors[region],
      vertexColors: true,
      metalness: 0,
      ...FINISH[region],
    });
  for (const [region, geometry] of Object.entries(built.regions)) {
    const m = new THREE.SkinnedMesh(geometry, material(region));
    m.name = REGION_NAMES[region];
    m.castShadow = m.receiveShadow = true;
    m.userData.figurineRegion = region;
    // The cap travels inside the head rig so the face stays one unit.
    if (region === "cap" || region === "badge") {
      head.add(m);
      m.position.set(0, -JOINTS.head[1], 0);
    } else body.add(m);
    m.updateMatrixWorld(true);
    m.bind(skeleton, new THREE.Matrix4());
    m.boundingSphere = geometry.boundingSphere.clone();
    m.boundingSphere.radius *= 1.35;
    m.boundingBox = geometry.boundingBox.clone().expandByScalar(0.12);
  }
  skeleton.calculateInverses();
  arms[0].rotation.z = 0;
  arms[1].rotation.z = 0;

  // Rigid painted details ride on their bones.
  const headRoot = new THREE.Group();
  headRoot.name = "Sculpted face details";
  headRoot.position.set(0, -JOINTS.head[1], 0);
  head.add(headRoot);
  const gloss = (color, roughness = 0.24) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const place = (mesh, [x, y, z, n], inset = 0, parent = headRoot) => {
    mesh.position.set(x - n[0] * inset, y - n[1] * inset, z - n[2] * inset);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(...n),
    );
    parent.add(mesh);
    return mesh;
  };
  // Eyes are tall painted ovals with two catchlights, so they look wet.
  const eyeGeometry = new THREE.SphereGeometry(0.052, 18, 12);
  const glint = new THREE.SphereGeometry(0.0145, 10, 8);
  const glintSmall = new THREE.SphereGeometry(0.0072, 8, 6);
  const eyeMaterial = gloss("#1d2830", 0.2);
  const glintMaterial = gloss("#fffaf0", 0.3);
  for (const eye of built.face.eyes) {
    const e = place(new THREE.Mesh(eyeGeometry, eyeMaterial), eye, 0.012);
    e.name = "Eye";
    e.scale.set(0.78, 1.18, 0.42);
  }
  // Brows sit in pivots so their lift and tilt can act without disturbing the
  // orientation that seats them on the forehead.
  const browMaterial = gloss(c.brow || c.hair, 0.5);
  const browGeometry = new THREE.CapsuleGeometry(0.0115, 0.044, 3, 8);
  browGeometry.rotateZ(Math.PI / 2);
  built.face.brows.forEach((spot, i) => {
    const side = i ? 1 : -1;
    const pivot = place(new THREE.Group(), spot, 0.004);
    pivot.name = "Brow rig";
    const brow = new THREE.Mesh(browGeometry, browMaterial);
    brow.name = "Brow";
    brow.rotation.z = -side * 0.1;
    brow.userData.side = side;
    pivot.add(brow);
  });
  // The mouth is a pivot holding a smile arc and a small open-mouth shape.
  const mouthRig = place(new THREE.Group(), built.face.mouth, 0.004);
  mouthRig.name = "Mouth rig";
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.0085, 6, 14, Math.PI),
    gloss("#7c3a30", 0.5),
  );
  mouth.name = "smile";
  mouth.rotation.z = Math.PI;
  mouthRig.add(mouth);
  const mouthOpen = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 14, 10),
    gloss("#5c2622", 0.45),
  );
  mouthOpen.name = "Mouth open";
  mouthOpen.position.set(0, -0.004, -0.004);
  mouthOpen.scale.set(1, 0.7, 0.3);
  mouthOpen.visible = false;
  mouthRig.add(mouthOpen);
  // Rigid cap brim, broken in and gently dished. Smooth normals make it read
  // as one soft piece of clay rather than a bevelled plank.
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, 0.235, 0.15, 0, Math.PI * 2);
  let brimGeometry = new THREE.ExtrudeGeometry(brimShape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 6,
    curveSegments: 40,
  });
  brimGeometry.deleteAttribute("uv");
  brimGeometry.rotateX(Math.PI / 2);
  const bp = brimGeometry.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    bp.setY(i, bp.getY(i) - x * x * 0.6);
  }
  brimGeometry = mergeVertices(brimGeometry, 1e-4);
  brimGeometry.computeVertexNormals();
  // Painted shading: the underside of the brim sits in its own shade.
  const bn = brimGeometry.attributes.normal,
    bq = brimGeometry.attributes.position;
  const shade = new Float32Array(bq.count * 3);
  for (let i = 0; i < bq.count; i++) {
    const under = THREE.MathUtils.smoothstep(-bn.getY(i), 0.1, 0.65);
    shade.fill(1 - under * 0.4, i * 3, i * 3 + 3);
  }
  brimGeometry.setAttribute("color", new THREE.BufferAttribute(shade, 3));
  const brim = new THREE.Mesh(brimGeometry, material("cap"));
  brim.material = body.getObjectByName("cap").material;
  brim.name = "cap brim";
  brim.position.set(0, capRimY(0.235) + 0.012, 0.235);
  brim.rotation.x = -0.05;
  brim.castShadow = brim.receiveShadow = true;
  headRoot.add(brim);
  // A stitched pickle on the cap badge: the shop's mark, in a few soft shapes.
  const emblem = place(
    new THREE.Mesh(
      bakeParts([
        {
          geometry: new THREE.CapsuleGeometry(0.0125, 0.03, 3, 10),
          color: "#5d9a3e",
          matrix: at(0, 0, 0, 1, 1, 0.5, 0.55),
        },
        ...[
          [-0.006, -0.008],
          [0.004, 0.001],
          [0.0, -0.016],
          [0.009, 0.012],
        ].map(([bx, by]) => ({
          geometry: new THREE.SphereGeometry(0.0034, 6, 5),
          color: "#3f7430",
          matrix: at(bx, by, 0.0065),
        })),
      ]),
      detailMaterial(0.5),
    ),
    built.face.badge,
    0.002,
  );
  emblem.name = "Cap pickle emblem";
  emblem.castShadow = false;

  // Backpack and carried case ride on the chest.
  const chestRoot = new THREE.Group();
  chestRoot.name = "Chest-mounted gear";
  chestRoot.position.set(0, -JOINTS.chest[1], 0);
  chest.add(chestRoot);
  const paint = (color, roughness = 0.46) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const pack = new THREE.Mesh(
    new RoundedBoxGeometry(0.36, 0.38, 0.2, 3, 0.075),
    paint(c.pack),
  );
  pack.name = "backpack";
  pack.position.set(0, 0.69, -0.245);
  pack.castShadow = pack.receiveShadow = true;
  chestRoot.add(pack);
  const flap = new THREE.Mesh(
    new RoundedBoxGeometry(0.37, 0.15, 0.215, 3, 0.06),
    paint(c.flap),
  );
  flap.name = "Backpack flap";
  flap.position.set(0, 0.125, 0.004);
  flap.castShadow = true;
  pack.add(flap);
  const pocket = new THREE.Mesh(
    new RoundedBoxGeometry(0.22, 0.13, 0.06, 2, 0.028),
    paint(c.flap),
  );
  pocket.name = "Backpack pocket";
  pocket.position.set(0, -0.06, -0.11);
  pack.add(pocket);
  const buckle = new THREE.Mesh(
    new RoundedBoxGeometry(0.06, 0.05, 0.02, 1, 0.008),
    paint("#e8d7a4", 0.3),
  );
  buckle.name = "Backpack buckle";
  buckle.position.set(0, 0.07, 0.112);
  flap.add(buckle);
  // A sewn courier patch on the chest, outlined in a darker stitch.
  const patch = place(
    new THREE.Mesh(
      bakeParts([
        {
          geometry: new RoundedBoxGeometry(0.074, 0.05, 0.01, 1, 0.012),
          color: "#2a4253",
        },
        {
          geometry: new RoundedBoxGeometry(0.064, 0.04, 0.014, 1, 0.01),
          color: "#f3e2b6",
        },
        {
          geometry: new RoundedBoxGeometry(0.044, 0.008, 0.016, 1, 0.003),
          color: "#e0a43e",
          matrix: at(0, -0.008, 0),
        },
      ]),
      detailMaterial(0.7),
    ),
    built.face.patch,
    0.002,
    chestRoot,
  );
  patch.name = "Courier patch";
  patch.castShadow = false;
  // A pickle charm on a short cord swings from the pack's lower corner.
  const charm = new THREE.Group();
  charm.name = "Pickle charm";
  charm.position.set(0.12, -0.17, -0.104);
  pack.add(charm);
  const charmBody = new THREE.Mesh(
    bakeParts([
      {
        geometry: new THREE.CylinderGeometry(0.0045, 0.0045, 0.05, 6),
        color: "#2a4253",
        matrix: at(0, -0.025, 0),
      },
      {
        geometry: new THREE.CapsuleGeometry(0.021, 0.05, 4, 10),
        color: "#5d9a3e",
        matrix: at(0, -0.085, 0, 1, 1, 0.8),
      },
      ...[
        [0.012, -0.073, 0.014],
        [-0.011, -0.101, 0.013],
        [0.006, -0.115, 0.015],
        [-0.012, -0.063, 0.012],
      ].map(([bx, by, bz]) => ({
        geometry: new THREE.SphereGeometry(0.0055, 6, 5),
        color: "#3f7430",
        matrix: at(bx, by, bz),
      })),
    ]),
    detailMaterial(0.5),
  );
  charmBody.name = "Pickle charm body";
  charmBody.castShadow = true;
  charm.add(charmBody);
  // Work props live in the hands, collapsed until a task calls for them.
  const toolMaterial = (color, roughness = 0.5) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const prop = (name, parent, y, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(0, y, z);
    g.scale.setScalar(0.0001);
    g.visible = false;
    parent.add(g);
    return g;
  };
  // A hammer is gripped near the end of its handle and carries on along the
  // forearm; its head lies in the plane of the swing.
  const hammer = prop("Hammer", elbows[0], -0.165, 0.035);
  const handle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.02, 0.22, 3, 8),
    toolMaterial("#b97b45", 0.55),
  );
  handle.position.y = -0.055;
  const hammerHead = new THREE.Mesh(
    new RoundedBoxGeometry(0.06, 0.065, 0.12, 2, 0.02),
    toolMaterial("#6b7479", 0.35),
  );
  hammerHead.position.set(0, -0.19, 0.0);
  hammer.add(handle, hammerHead);
  hammer.traverse((o) => o.isMesh && (o.castShadow = true));
  // A clipboard lies along the forearm, its face turned toward the reader.
  const board = prop("Clipboard", elbows[1], -0.2, 0.05);
  const boardBack = new THREE.Mesh(
    new RoundedBoxGeometry(0.17, 0.22, 0.016, 2, 0.01),
    toolMaterial("#a97a4c", 0.6),
  );
  const paper = new THREE.Mesh(
    new RoundedBoxGeometry(0.14, 0.18, 0.01, 1, 0.004),
    toolMaterial("#fff8e6", 0.8),
  );
  paper.position.z = 0.008;
  const clip = new THREE.Mesh(
    new RoundedBoxGeometry(0.06, 0.03, 0.02, 1, 0.008),
    toolMaterial("#b9c0c4", 0.3),
  );
  clip.position.set(0, 0.105, 0.012);
  board.add(boardBack, paper, clip);
  board.traverse((o) => o.isMesh && (o.castShadow = true));
  const parcel = new THREE.Mesh(
    new RoundedBoxGeometry(0.44, 0.36, 0.34, 2, 0.045),
    paint("#cb9660", 0.55),
  );
  parcel.name = "carried parcel";
  parcel.position.set(0, 0.68, 0.4);
  parcel.castShadow = parcel.receiveShadow = true;
  const tape = new THREE.Mesh(
    new RoundedBoxGeometry(0.08, 0.365, 0.345, 1, 0.012),
    paint("#fff0cd", 0.7),
  );
  tape.name = "parcel tape";
  parcel.add(tape);
  const label = new THREE.Mesh(
    new RoundedBoxGeometry(0.13, 0.12, 0.02, 1, 0.008),
    paint("#fff8e6"),
  );
  label.name = "Shipping label";
  label.position.set(0.12, 0.03, 0.17);
  parcel.add(label);
  parcel.visible = false;
  chestRoot.add(parcel);
  return { body, head, legs, arms, parcel, skeleton };
}

// Shared sculpt toolkit: the townsfolk generator builds on the same clay.
export {
  smin,
  smax,
  roundCone,
  ellipsoid,
  roundBox,
  torus,
  squashZ,
  polygonize,
  relax,
  paintRegions,
  makeField,
  gradient,
  polylineDistance,
};
