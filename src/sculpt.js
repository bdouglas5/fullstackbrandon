import * as THREE from "three";

/**
 * Clay sculpting for rigid props: vehicles, gadgets, crates.
 *
 * This is the same procedure that builds the figurine courier (figurine.js):
 * soft-blended signed-distance volumes, polygonized once with surface nets,
 * relaxed onto the true surface, split into crisp paint regions along implicit
 * boundaries, and shaded with baked cavity darkening. Props simply skip the
 * skeleton. The distance functions below are scalar-only because they run
 * millions of times per build; every build is cached by key.
 */

// ---------------------------------------------------------------------------
// Blending.

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------------------
// Primitives. Each carries a bounding sphere (fn.bound) so the field can skip
// volumes that are too far away to matter.

const tag = (fn, cx, cy, cz, r) => {
  fn.bound = [cx, cy, cz, r];
  return fn;
};

/** Rounded box. h* are half extents; r is the corner radius. */
export function rbox(cx, cy, cz, hx, hy, hz, r = 0.05) {
  r = Math.min(r, hx, hy, hz);
  return tag(
    (x, y, z) => {
      const qx = Math.abs(x - cx) - hx + r,
        qy = Math.abs(y - cy) - hy + r,
        qz = Math.abs(z - cz) - hz + r;
      const mx = qx > 0 ? qx : 0,
        my = qy > 0 ? qy : 0,
        mz = qz > 0 ? qz : 0;
      return (
        Math.sqrt(mx * mx + my * my + mz * mz) +
        Math.min(Math.max(qx, Math.max(qy, qz)), 0) -
        r
      );
    },
    cx,
    cy,
    cz,
    Math.hypot(hx, hy, hz),
  );
}

export function ellipsoid(cx, cy, cz, rx, ry, rz) {
  return tag(
    (x, y, z) => {
      const px = (x - cx) / rx,
        py = (y - cy) / ry,
        pz = (z - cz) / rz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(
        (px * px) / (rx * rx) + (py * py) / (ry * ry) + (pz * pz) / (rz * rz),
      );
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
    cx,
    cy,
    cz,
    Math.max(rx, ry, rz),
  );
}

/** Capsule or tapered round cone between two points. */
export function roundCone(ax, ay, az, bx, by, bz, r1, r2 = r1) {
  const bax = bx - ax,
    bay = by - ay,
    baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const srr = Math.sign(rr) * rr * rr;
  return tag(
    (x, y, z) => {
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
    },
    (ax + bx) / 2,
    (ay + by) / 2,
    (az + bz) / 2,
    Math.sqrt(l2) / 2 + Math.max(r1, r2),
  );
}

/**
 * Rounded cylinder on the x, y or z axis: a wheel, hub cap, drum or can.
 * `round` softens both rims.
 */
export function cylinder(axis, cx, cy, cz, radius, half, round = 0.02) {
  round = Math.min(round, radius, half);
  const a = { x: 0, y: 1, z: 2 }[axis];
  return tag(
    (x, y, z) => {
      const p = [x - cx, y - cy, z - cz];
      const h = Math.abs(p[a]);
      const u = p[(a + 1) % 3],
        v = p[(a + 2) % 3];
      const rad = Math.sqrt(u * u + v * v);
      const qx = rad - radius + round,
        qy = h - half + round;
      const mx = qx > 0 ? qx : 0,
        my = qy > 0 ? qy : 0;
      return (
        Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - round
      );
    },
    cx,
    cy,
    cz,
    Math.hypot(radius, half),
  );
}

/**
 * Annulus on the x, y or z axis with a rounded cross-section: a tire, a drum
 * wall or a collar. Rin/Rout are inner and outer radii.
 */
export function ring(axis, cx, cy, cz, Rin, Rout, half, round = 0.02) {
  const mid = (Rin + Rout) / 2,
    w = (Rout - Rin) / 2;
  round = Math.min(round, w, half);
  const a = { x: 0, y: 1, z: 2 }[axis];
  return tag(
    (x, y, z) => {
      const p = [x - cx, y - cy, z - cz];
      const h = Math.abs(p[a]);
      const u = p[(a + 1) % 3],
        v = p[(a + 2) % 3];
      const rad = Math.abs(Math.sqrt(u * u + v * v) - mid);
      const qx = rad - w + round,
        qy = h - half + round;
      const mx = qx > 0 ? qx : 0,
        my = qy > 0 ? qy : 0;
      return (
        Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - round
      );
    },
    cx,
    cy,
    cz,
    Rout + half,
  );
}

/** Torus around an arbitrary unit axis (nx, ny, nz). */
export function torus(cx, cy, cz, nx, ny, nz, R, r) {
  return tag(
    (x, y, z) => {
      const qx = x - cx,
        qy = y - cy,
        qz = z - cz;
      const h = qx * nx + qy * ny + qz * nz;
      const rx = qx - h * nx,
        ry = qy - h * ny,
        rz = qz - h * nz;
      const radial = Math.sqrt(rx * rx + ry * ry + rz * rz) - R;
      return Math.sqrt(radial * radial + h * h) - r;
    },
    cx,
    cy,
    cz,
    R + r,
  );
}

// ---------------------------------------------------------------------------
// Transforms.

export function at(fn, dx, dy, dz) {
  const [bx, by, bz, br] = fn.bound || [0, 0, 0, 1e3];
  return tag(
    (x, y, z) => fn(x - dx, y - dy, z - dz),
    bx + dx,
    by + dy,
    bz + dz,
    br,
  );
}
/** Mirror across x = 0: one side authored, both built. */
export function mirrorX(fn) {
  const [bx, , , br] = fn.bound || [0, 0, 0, 1e3];
  const [, by, bz] = fn.bound || [0, 0, 0];
  return tag((x, y, z) => fn(Math.abs(x), y, z), 0, by, bz, Math.abs(bx) + br);
}
const rotation = (axis, angle) => {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  // Inverse rotation applied to the sample point.
  if (axis === "y") return (x, y, z) => [c * x - s * z, y, s * x + c * z];
  if (axis === "x") return (x, y, z) => [x, c * y + s * z, -s * y + c * z];
  return (x, y, z) => [c * x + s * y, -s * x + c * y, z];
};
/** Rotate a volume about its own origin-relative pivot (px, py, pz). */
export function rotate(fn, axis, angle, px = 0, py = 0, pz = 0) {
  const inv = rotation(axis, angle);
  const [bx, by, bz, br] = fn.bound || [0, 0, 0, 1e3];
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const dx = bx - px,
    dy = by - py,
    dz = bz - pz;
  const f =
    axis === "y"
      ? [c * dx + s * dz, dy, -s * dx + c * dz]
      : axis === "x"
        ? [dx, c * dy - s * dz, s * dy + c * dz]
        : [c * dx - s * dy, s * dx + c * dy, dz];
  return tag(
    (x, y, z) => {
      const q = inv(x - px, y - py, z - pz);
      return fn(q[0] + px, q[1] + py, q[2] + pz);
    },
    px + f[0],
    py + f[1],
    pz + f[2],
    br,
  );
}
/** Flatten a volume along one axis (a thinner window or a flatter hood). */
export function squash(fn, axis, s) {
  const a = { x: 0, y: 1, z: 2 }[axis];
  const [bx, by, bz, br] = fn.bound || [0, 0, 0, 1e3];
  const c = [bx, by, bz];
  return tag(
    (x, y, z) => {
      const p = [x, y, z];
      p[a] = p[a] / s;
      return fn(p[0], p[1], p[2]) * Math.min(1, s);
    },
    ...c.map((v, i) => (i === a ? v * s : v)),
    br * Math.max(1, s),
  );
}

// ---------------------------------------------------------------------------
// The field: a smooth union of parts, then smooth subtraction of carved
// volumes (windows, wheel wells, hollows).

export function makeField(parts, carves = []) {
  const n = parts.length;
  const fns = parts.map((p) => p.fn),
    ks = parts.map((p) => p.k),
    bx = new Float64Array(n),
    by = new Float64Array(n),
    bz = new Float64Array(n),
    br = new Float64Array(n);
  parts.forEach((p, i) => {
    const b = p.fn.bound;
    if (!b) throw new Error(`sculpt part "${p.name}" has no bounding sphere`);
    [bx[i], by[i], bz[i], br[i]] = b;
    br[i] += p.k + 0.03;
  });
  const m = carves.length;
  const cf = carves.map((c) => c.fn),
    ck = carves.map((c) => c.k);
  const cb = carves.map((c) => c.fn.bound);
  return (x, y, z) => {
    let d = fns[0](x, y, z);
    for (let i = 1; i < n; i++) {
      const dx = x - bx[i],
        dy = y - by[i],
        dz = z - bz[i];
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - br[i];
      if (far > d + ks[i]) continue;
      d = smin(d, fns[i](x, y, z), ks[i]);
    }
    for (let i = 0; i < m; i++) {
      const b = cb[i];
      const dx = x - b[0],
        dy = y - b[1],
        dz = z - b[2];
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - b[3] - 0.03;
      if (far > ck[i] - d) continue;
      d = smax(d, -cf[i](x, y, z), ck[i]);
    }
    return d;
  };
}

export function gradient(field, x, y, z, e = 0.0025) {
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
  // Narrow band: a coarse pass finds where the surface can be.
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
      const t = ga / (ga - gb);
      const idx = P.length / 3;
      P.push(
        P[a * 3] + (P[b * 3] - P[a * 3]) * t,
        P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t,
        P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t,
      );
      value.set(idx, 0);
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
// Build.

const built = new Map();

/**
 * Sculpt one rigid piece.
 *
 *   key      cache key; identical keys share geometry
 *   h        grid size. Big soft toys need ~0.03, small gadgets ~0.015
 *   bounds   [x0, y0, z0, x1, y1, z1] build box
 *   parts    [{ name, fn, k, paint }]  blended union; k is the fillet radius
 *   carve    [{ fn, k }]               subtracted afterwards (windows, hollows)
 *   decals   [{ id, region, g }]       paint regions cut by an implicit g<=0
 *   order    paint tags in claiming priority; `fallback` takes the rest
 *   occluders extra fields that darken the piece (neighbours it sits against)
 *   ao       cavity darkness (default 1), shade: painted underside falloff
 */
export function sculptGeometry(spec) {
  if (built.has(spec.key)) return built.get(spec.key);
  const {
    parts,
    carve = [],
    decals = [],
    bounds,
    h = 0.03,
    occluders = [],
    ao = 1,
    shade = 0.14,
    fallback,
  } = spec;
  const field = makeField(parts, carve);
  const occlusion = occluders.length
    ? (x, y, z) => {
        let d = field(x, y, z);
        for (const o of occluders) d = Math.min(d, o(x, y, z));
        return d;
      }
    : field;
  const mesh = polygonize(field, bounds, h);
  relax(field, mesh.positions, h);

  const np = parts.length;
  const tags = [...new Set(parts.map((p) => p.paint))];
  const paintOf = new Int32Array(parts.map((p) => tags.indexOf(p.paint)));
  const cache = new Map();
  const dist = (i, x, y, z) => {
    let d = cache.get(i);
    if (!d) {
      d = new Float64Array(np);
      for (let p = 0; p < np; p++) d[p] = parts[p].fn(x, y, z);
      cache.set(i, d);
    }
    return d;
  };
  const mask = (names) => tags.map((t) => names.includes(t));
  const tagMin = (d, m) => {
    let v = Infinity;
    for (let p = 0; p < np; p++) if (m[paintOf[p]] && d[p] < v) v = d[p];
    return v;
  };
  const rules = decals.map((d) => ({ id: d.id, region: d.region, g: d.g }));
  // Priority: listed tags first, then any others; decal names in `order` are ignored.
  const order = [...(spec.order || []), ...tags].filter(
    (t, i, all) => t !== fallback && tags.includes(t) && all.indexOf(t) === i,
  );
  const lastFallback = fallback ?? tags[tags.length - 1];
  for (let r = 0; r < order.length; r++) {
    const own = mask([order[r]]),
      rest = mask([...order.slice(r + 1), lastFallback]);
    rules.push({
      id: order[r],
      region: order[r],
      g: (x, y, z, i) => {
        const d = dist(i, x, y, z);
        return tagMin(d, own) - tagMin(d, rest);
      },
    });
  }
  const tris = paintRegions(mesh, rules, lastFallback);

  const P = mesh.positions,
    count = P.length / 3;
  const normals = new Float32Array(count * 3),
    colors = new Float32Array(count * 3);
  const [, y0, , , y1] = [
    bounds[0],
    bounds[1],
    bounds[2],
    bounds[3],
    bounds[4],
  ];
  for (let i = 0; i < count; i++) {
    let x = P[i * 3],
      y = P[i * 3 + 1],
      z = P[i * 3 + 2];
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
    normals.set(n, i * 3);
    // Baked cavity shading: enclosed corners and creases darken.
    let occ = 0;
    for (let s = 1; s <= 5; s++) {
      const step = s * h * 0.9;
      occ +=
        (step - occlusion(x + n[0] * step, y + n[1] * step, z + n[2] * step)) /
        (1 << s);
    }
    const cavity = THREE.MathUtils.clamp(
      1 - (occ * 3.2 * ao) / (h * 45),
      0.45,
      1,
    );
    // A painter darkens undersides and lets the top catch light.
    const t = THREE.MathUtils.clamp((y - y0) / (y1 - y0 || 1), 0, 1);
    const underside =
      1 - shade * (1 - t) * (1 - t) - shade * 0.5 * Math.max(0, -n[1]);
    const c = cavity * underside;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  const regions = {};
  const names = [...new Set([...tags, ...decals.map((d) => d.region)])];
  for (const region of names) {
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
      col = new Float32Array(n * 3);
    for (const [src, dst] of remap) {
      for (let c = 0; c < 3; c++) {
        pos[dst * 3 + c] = P[src * 3 + c];
        nor[dst * 3 + c] = normals[src * 3 + c];
        col[dst * 3 + c] = colors[src * 3 + c];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(index);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    regions[region] = g;
  }
  const result = { regions, triangles: tris.length, vertices: count };
  built.set(spec.key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Materials and meshes.

const materials = new Map();
/** Painted finishes: vinyl, enamel, rubber. Shared so props batch together. */
export const SCULPT_FINISH = {
  paint: { roughness: 0.5, metalness: 0 },
  gloss: { roughness: 0.3, metalness: 0 },
  soft: { roughness: 0.72, metalness: 0 },
  rubber: { roughness: 0.78, metalness: 0 },
  metal: { roughness: 0.38, metalness: 0.35 },
};
export function sculptMaterial(color, finish = "paint") {
  const key = `${color}/${finish}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        vertexColors: true,
        ...SCULPT_FINISH[finish],
      }),
    );
  return materials.get(key);
}

/** Flat-colored version for plain geometry that carries no baked vertex colors. */
const plain = new Map();
export function plainMaterial(color, finish = "paint") {
  const key = `${color}/${finish}`;
  if (!plain.has(key))
    plain.set(
      key,
      new THREE.MeshStandardMaterial({ color, ...SCULPT_FINISH[finish] }),
    );
  return plain.get(key);
}

/**
 * Sculpt a piece and add one mesh per paint region straight into `parent`.
 * `paints` maps region -> [color, finish]; `names` renames region meshes so
 * tests, recoloring and animation can find them. Returns the meshes in region
 * order (paint tags first, in the order the parts introduce them).
 */
export function sculptInto(
  parent,
  spec,
  paints,
  { name = spec.key, names = {} } = {},
) {
  const { regions } = sculptGeometry(spec);
  const meshes = [];
  for (const [region, geometry] of Object.entries(regions)) {
    const [color, finish] = paints[region] || ["#ffffff", "paint"];
    const mesh = new THREE.Mesh(geometry, sculptMaterial(color, finish));
    mesh.name = names[region] || `${name} ${region}`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.sculptRegion = region;
    parent.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/** Same, collected into its own group. */
export function sculptGroup(
  spec,
  paints,
  { name = spec.key, names = {}, y = 0 } = {},
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.y = y;
  sculptInto(group, spec, paints, { name, names });
  group.userData.sculpted = true;
  return group;
}

export function sculptStats() {
  let triangles = 0,
    pieces = 0;
  const byKey = {};
  for (const [key, b] of built) {
    triangles += b.triangles;
    pieces++;
    byKey[key] = b.triangles;
  }
  return { pieces, triangles, byKey };
}
