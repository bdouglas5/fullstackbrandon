import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
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
} from "./figurine.js";

/**
 * Townsfolk generator: the figurine's clay, in a smaller and simpler body.
 *
 * Every person is two sculpted pieces on a neck pivot: a body (coat, apron,
 * dress) and a head (skin, hair, hat), plus jointed limbs built by the kit.
 * Each piece is polygonized once per distinct silhouette, painted in crisp
 * regions with baked cavity shading, and shared by every person who wears it.
 * Hair, hats and outfits are small libraries of volumes, so a cast of very
 * different silhouettes costs a handful of sculpts.
 */

export const TOWN = {
  neckY: 0.5, // head pivot
  hipY: 0.2,
  hipX: 0.072,
  kneeDrop: 0.078,
  shoulderX: 0.14,
  shoulderY: 0.462,
  elbowDrop: 0.088,
  headY: 0.668, // skull center
};

// Townsfolk are about fifty pixels tall in the game, so the sculpt grid is
// coarser than the hero's; the head is a little finer than the body.
const DETAIL = { body: 0.03, head: 0.025 };

// Hairline as a surface: high on the forehead, low at the nape, lifted at the
// temples so the ears stay clear. Positive above the line.
const hairline = (base, front, sides) => (x, y, z) => {
  const line =
    base +
    front * z +
    sides * THREE.MathUtils.smoothstep(Math.abs(x), 0.085, 0.15);
  return y - line;
};

const skull = (h) =>
  ellipsoid(0, TOWN.headY, 0, 0.165 * h, 0.158 * h, 0.153 * h);

// ---------------------------------------------------------------------------
// Hair: each style is a function of head scale returning volumes.

const HAIR = {
  // A snug cap of hair with a low back: the base for most styles.
  crop: (h) => {
    const cap = ellipsoid(0, 0.676, -0.01, 0.173 * h, 0.168 * h, 0.166 * h);
    const line = hairline(0.645, 0.5, 0.08);
    return [
      {
        fn: (x, y, z) => smax(cap(x, y, z), -line(x, y, z) * 0.8, 0.035),
        k: 0.012,
        bound: [0, 0.7, -0.01, 0.2],
      },
    ];
  },
  // A bun rides high on bare hair and drops to the nape under a hat.
  bun: (h, hat) => [
    ...HAIR.crop(h),
    {
      fn:
        hat !== "none"
          ? ellipsoid(0, 0.665, -0.155 * h, 0.07, 0.066, 0.066)
          : ellipsoid(0, 0.83 * h, -0.065 * h, 0.075, 0.07, 0.072),
      k: 0.035,
      bound: [0, hat !== "none" ? 0.665 : 0.83, -0.1, 0.12],
    },
  ],
  topknot: (h) => [
    ...HAIR.crop(h),
    {
      fn: ellipsoid(0, 0.875 * h, 0.0, 0.058, 0.07, 0.058),
      k: 0.04,
      bound: [0, 0.85, 0, 0.1],
    },
  ],
  spike: (h) => [
    ...HAIR.crop(h),
    ...[
      [0, 0.0, 0.03],
      [-0.07, -0.02, 0.0],
      [0.07, -0.02, 0.0],
      [-0.035, -0.07, 0.0],
      [0.035, -0.07, 0.0],
    ].map(([x, z, lean]) => ({
      fn: roundCone(
        x,
        0.8 * h - 0.04,
        z,
        x * 1.4,
        0.9 * h + lean,
        z + lean,
        0.044,
        0.012,
      ),
      k: 0.03,
      bound: [x, 0.84, z, 0.1],
    })),
  ],
  puff: (h) => {
    const big = ellipsoid(
      0,
      0.72 * h - 0.02,
      -0.025,
      0.215 * h,
      0.2 * h,
      0.2 * h,
    );
    const line = hairline(0.64, 0.6, 0.06);
    return [
      {
        fn: (x, y, z) => smax(big(x, y, z), -line(x, y, z) * 0.8, 0.04),
        k: 0.02,
        bound: [0, 0.72, -0.02, 0.26],
      },
    ];
  },
  curls: (h, hat) => [
    ...HAIR.crop(h),
    ...Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.145 * h;
      const x = Math.sin(a) * r,
        z = Math.cos(a) * r * 0.9 - 0.02;
      // Curls ring the crown and thicken toward the back; under a hat they
      // peek out below its rim instead.
      const y = hat !== "none" ? 0.655 : 0.745 * h + (z < 0 ? 0.0 : 0.04);
      return {
        fn: ellipsoid(x, y, z, 0.062, 0.058, 0.062),
        k: 0.03,
        bound: [x, y, z, 0.08],
      };
    }),
  ],
  bob: (h) => {
    const bob = ellipsoid(0, 0.645, -0.02, 0.192 * h, 0.172 * h, 0.172 * h);
    const line = hairline(0.56, 0.62, 0.05);
    return [
      ...HAIR.crop(h),
      {
        fn: (x, y, z) =>
          smax(
            smax(bob(x, y, z), -line(x, y, z) * 0.8, 0.03),
            z - 0.03 + (y - 0.7) * 0.6,
            0.03,
          ),
        k: 0.02,
        bound: [0, 0.65, -0.02, 0.22],
      },
    ];
  },
  long: (h) => [
    ...HAIR.bob(h),
    {
      fn: roundCone(0, 0.62, -0.1, 0, 0.5, -0.115, 0.15, 0.13),
      k: 0.04,
      bound: [0, 0.56, -0.11, 0.22],
    },
  ],
  pigtails: (h) => [
    ...HAIR.crop(h),
    ...[-1, 1].map((s) => ({
      fn: roundCone(s * 0.17, 0.7, -0.01, s * 0.225, 0.575, 0.0, 0.055, 0.04),
      k: 0.035,
      bound: [s * 0.2, 0.64, 0, 0.14],
    })),
  ],
  ponytail: (h) => [
    ...HAIR.crop(h),
    {
      fn: roundCone(0, 0.72, -0.16 * h, 0, 0.545, -0.235, 0.05, 0.034),
      k: 0.035,
      bound: [0, 0.63, -0.2, 0.18],
    },
  ],
  // An elder's horseshoe: hair only around the sides and back.
  fringe: (h) => {
    const cap = ellipsoid(0, 0.676, -0.012, 0.172 * h, 0.166 * h, 0.163 * h);
    return [
      {
        fn: (x, y, z) =>
          smax(
            smax(cap(x, y, z), y - 0.725 - 0.0 * z, 0.03),
            -(y - (0.58 - 0.12 * Math.max(0, z))) * 0.8,
            0.03,
          ),
        k: 0.012,
        bound: [0, 0.66, -0.01, 0.2],
      },
    ];
  },
  none: () => [],
};

// A beard sculpted into the jaw, in the hair color, with the mouth left bare.
const BEARD = (h) => {
  const jaw = ellipsoid(0, 0.585, 0.045, 0.145 * h, 0.095, 0.115);
  const mouth = ellipsoid(0, 0.598, 0.14, 0.05, 0.03, 0.06);
  return [
    {
      fn: (x, y, z) =>
        smax(
          smax(jaw(x, y, z), -(y - 0.628) * 0.8, 0.03),
          -mouth(x, y, z),
          0.012,
        ),
      k: 0.02,
      bound: [0, 0.58, 0.05, 0.18],
    },
  ];
};

// ---------------------------------------------------------------------------
// Hats: separate paint region, always a little outside the hair they cover.

const HATS = {
  sun: (h) => [
    // A wide straw brim, dished at the edge, over a soft crown.
    {
      fn: ellipsoid(0, 0.762 * h - 0.02, 0, 0.318, 0.027, 0.318),
      k: 0.025,
      bound: [0, 0.76, 0, 0.34],
    },
    {
      fn: ellipsoid(0, 0.768 * h, 0, 0.18 * h, 0.115 * h, 0.178 * h),
      k: 0.03,
      bound: [0, 0.78, 0, 0.22],
    },
  ],
  beanie: (h) => [
    {
      fn: smaxCut(
        ellipsoid(0, 0.7 * h - 0.005, -0.006, 0.19 * h, 0.17 * h, 0.186 * h),
        0.668,
      ),
      k: 0.015,
      bound: [0, 0.74, 0, 0.22],
    },
    {
      fn: torus(0, 0.676, -0.006, 0, 1, 0, 0.176 * h, 0.03),
      k: 0.02,
      bound: [0, 0.676, 0, 0.24],
      paint: "trimHat",
    },
    {
      fn: ellipsoid(0, 0.86 * h + 0.01, -0.006, 0.05, 0.05, 0.05),
      k: 0.03,
      bound: [0, 0.87, 0, 0.07],
      paint: "trimHat",
    },
  ],
  chef: (h) => [
    {
      fn: roundCone(0, 0.755 * h, 0, 0, 0.865 * h, 0, 0.14, 0.158),
      k: 0.03,
      bound: [0, 0.82, 0, 0.24],
    },
    {
      fn: ellipsoid(0, 0.94 * h, 0, 0.17, 0.1, 0.17),
      k: 0.05,
      bound: [0, 0.94, 0, 0.22],
    },
    {
      fn: torus(0, 0.742 * h, 0, 0, 1, 0, 0.155, 0.026),
      k: 0.02,
      bound: [0, 0.74, 0, 0.2],
      paint: "trimHat",
    },
  ],
  bakers: (h) => [
    {
      fn: ellipsoid(0, 0.75 * h, -0.025, 0.2 * h, 0.1, 0.21 * h),
      k: 0.03,
      bound: [0, 0.75, -0.02, 0.26],
    },
    {
      fn: torus(0, 0.714 * h, -0.006, 0, 1, 0, 0.17 * h, 0.022),
      k: 0.02,
      bound: [0, 0.71, 0, 0.2],
      paint: "trimHat",
    },
  ],
  visor: (h) => [
    {
      fn: torus(0, 0.712 * h, 0, 0, 1, 0, 0.172 * h, 0.022),
      k: 0.015,
      bound: [0, 0.712, 0, 0.2],
    },
    {
      fn: ellipsoid(0, 0.708 * h, 0.2, 0.15, 0.016, 0.13),
      k: 0.02,
      bound: [0, 0.708, 0.2, 0.18],
    },
  ],
  bucket: (h) => [
    {
      fn: smaxCut(
        ellipsoid(0, 0.725 * h, 0, 0.19 * h, 0.14 * h, 0.186 * h),
        0.665,
      ),
      k: 0.015,
      bound: [0, 0.74, 0, 0.22],
    },
    {
      fn: ellipsoid(0, 0.678 * h, 0, 0.27, 0.022, 0.27),
      k: 0.03,
      bound: [0, 0.68, 0, 0.3],
    },
  ],
  newsboy: (h) => [
    {
      fn: ellipsoid(0, 0.752 * h, 0.01, 0.215 * h, 0.088, 0.215 * h),
      k: 0.04,
      bound: [0, 0.75, 0, 0.26],
    },
    {
      fn: ellipsoid(0, 0.715 * h, 0.178, 0.1, 0.02, 0.085),
      k: 0.02,
      bound: [0, 0.715, 0.18, 0.13],
    },
  ],
  band: (h) => [
    {
      fn: torus(0, 0.715 * h, -0.004, 0, 1, 0, 0.169 * h, 0.021),
      k: 0.012,
      bound: [0, 0.715, 0, 0.2],
    },
  ],
  none: () => [],
};
// Hats and beanies sit on the upper skull only.
function smaxCut(fn, floorY) {
  return (x, y, z) => smax(fn(x, y, z), -(y - floorY) * 0.9, 0.012);
}

// ---------------------------------------------------------------------------
// Outfits: torso volumes in the body's own cloth, plus trim details.

const torso = (b) =>
  squashZ(roundCone(0, 0.25, 0, 0, 0.47, 0, 0.14 * b, 0.106 * b), 0.82);

const OUTFITS = {
  tee: (b) => [
    { fn: torso(b), k: 0, bound: [0, 0.36, 0, 0.26], paint: "cloth" },
  ],
  dress: (b) => [
    { fn: torso(b), k: 0, bound: [0, 0.36, 0, 0.26], paint: "cloth" },
    {
      fn: squashZ(roundCone(0, 0.14, 0, 0, 0.36, 0, 0.176 * b, 0.12 * b), 0.86),
      k: 0.06,
      bound: [0, 0.25, 0, 0.27],
      paint: "cloth",
    },
  ],
  coat: (b) => [
    { fn: torso(b), k: 0, bound: [0, 0.36, 0, 0.26], paint: "cloth" },
    {
      fn: squashZ(roundCone(0, 0.11, 0, 0, 0.34, 0, 0.17 * b, 0.125 * b), 0.84),
      k: 0.06,
      bound: [0, 0.23, 0, 0.27],
      paint: "cloth",
    },
    // A buttoned front placket in trim.
    {
      fn: roundBox(0, 0.27, 0.112 * b, 0.012, 0.15, 0.012, 0.01),
      k: 0.012,
      bound: [0, 0.27, 0.11, 0.17],
      paint: "trim",
    },
  ],
  apron: (b) => {
    // The bib is the coat's own surface, lifted a hair and trimmed to a panel,
    // so it wraps the belly instead of sitting on it like a plate.
    const coat = torso(b);
    const panel = (x, y, z) =>
      smax(
        smax(
          smax(coat(x, y, z) - 0.015, (Math.abs(x) - 0.1 * b) * 0.9, 0.035),
          (y - 0.455) * 0.9,
          0.02,
        ),
        (0.014 - z) * 0.9,
        0.04,
      );
    return [
      { fn: coat, k: 0, bound: [0, 0.36, 0, 0.26], paint: "cloth" },
      { fn: panel, k: 0.012, bound: [0, 0.34, 0.06, 0.2], paint: "trim" },
      ...[-1, 1].map((s) => ({
        fn: roundCone(
          s * 0.078 * b,
          0.452,
          0.088,
          s * 0.04,
          0.508,
          0.04,
          0.015,
          0.015,
        ),
        k: 0.012,
        bound: [s * 0.06, 0.48, 0.07, 0.07],
        paint: "trim",
      })),
    ];
  },
  vest: (b) => [
    { fn: torso(b), k: 0, bound: [0, 0.36, 0, 0.26], paint: "cloth" },
    // Vest panels either side of an open front, in trim.
    ...[-1, 1].map((s) => ({
      fn: (x, y, z) =>
        smax(
          squashZ(
            roundCone(0, 0.25, 0, 0, 0.466, 0, 0.148 * b, 0.112 * b),
            0.82,
          )(x, y, z),
          -(s * x - 0.03 - Math.max(0, y - 0.3) * 0.2),
          0.02,
        ),
      k: 0.01,
      bound: [s * 0.07, 0.36, 0, 0.2],
      paint: "trim",
    })),
  ],
  cardigan: (b) => [
    { fn: torso(b), k: 0, bound: [0, 0.36, 0, 0.26], paint: "cloth" },
    {
      fn: squashZ(roundCone(0, 0.2, 0, 0, 0.3, 0, 0.152 * b, 0.146 * b), 0.82),
      k: 0.03,
      bound: [0, 0.25, 0, 0.2],
      paint: "cloth",
    },
    {
      fn: roundBox(0, 0.32, 0.114 * b, 0.016, 0.14, 0.012, 0.01),
      k: 0.012,
      bound: [0, 0.32, 0.11, 0.16],
      paint: "trim",
    },
  ],
};

// A collar ring and a hem band make every outfit read as sewn, not poured.
const COLLAR = {
  fn: squashZ(torus(0, 0.478, 0.006, 0, 1, 0, 0.066, 0.026), 0.9),
  k: 0.014,
  bound: [0, 0.478, 0, 0.1],
  paint: "trim",
};

// ---------------------------------------------------------------------------

const bodyCache = new Map(),
  headCache = new Map();
const keyOf = (o) => JSON.stringify(o);

function extractRegions(tris, P, regionIds, attributes) {
  const regions = {};
  for (const region of regionIds) {
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
        nor[dst * 3 + c] = attributes.normals[src * 3 + c];
        col[dst * 3 + c] = attributes.shade[src * 3 + c];
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    regions[region] = geometry;
  }
  return regions;
}

// Surface, normals and baked cavity shading for one sculpt.
function finish(
  field,
  mesh,
  tris,
  regionIds,
  { occlusion = field, cheeks = false, cavity = 3.4 } = {},
) {
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
        (step - occlusion(x + n[0] * step, y + n[1] * step, z + n[2] * step)) /
        (1 << s);
    }
    const ao = THREE.MathUtils.clamp(1 - occ * cavity, 0.45, 1);
    let r = ao,
      g = ao,
      b = ao;
    if (cheeks)
      for (let side = -1; side <= 1; side += 2) {
        const c = Math.exp(
          -((x - side * 0.088) ** 2 + (y - 0.628) ** 2 + (z - 0.128) ** 2) /
            0.0008,
        );
        r *= 1 + c * 0.06;
        g *= 1 - c * 0.14;
        b *= 1 - c * 0.12;
      }
    shade[i * 3] = r;
    shade[i * 3 + 1] = g;
    shade[i * 3 + 2] = b;
  }
  return extractRegions(tris, P, regionIds, { normals, shade });
}

function sculptRegions({
  prims,
  bounds,
  order,
  fallback,
  occlusion,
  cheeks,
  cavity,
  detail,
}) {
  const field = makeField(prims);
  const mesh = polygonize(field, bounds, detail);
  relax(field, mesh.positions, detail);
  const tags = [...new Set(prims.map((p) => p.paint))];
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
  const minOf = (d, wanted) => {
    let v = Infinity;
    for (let p = 0; p < prims.length; p++)
      if (wanted.includes(prims[p].paint) && d[p] < v) v = d[p];
    return v;
  };
  // Earlier entries in `order` claim the surface where their volumes lead.
  const rules = order
    .filter((tag) => tags.includes(tag))
    .map((tag, r, list) => {
      const rest = [...order.slice(order.indexOf(tag) + 1), fallback].filter(
        (t) => tags.includes(t),
      );
      return {
        id: tag,
        region: tag,
        g: (x, y, z, i) => {
          const d = distances(i, x, y, z);
          return minOf(d, [tag]) - (rest.length ? minOf(d, rest) : 1);
        },
      };
    });
  const tris = paintRegions(mesh, rules, fallback);
  const regions = finish(field, mesh, tris, [...order, fallback], {
    occlusion: occlusion || field,
    cheeks,
    cavity,
  });
  return { regions, field };
}

/** Body sculpt: coat/apron/dress cloth and trim, with the neck hole implicit. */
export function townsBody(spec) {
  const o = spec.outfit || {};
  const key = keyOf([o.type || "tee", spec.build || 1, !!o.collar]);
  if (bodyCache.has(key)) return bodyCache.get(key);
  const b = spec.build || 1;
  const long = ["dress", "coat"].includes(o.type);
  const belt = (fn) => (x, y, z) => smax(fn(x, y, z), 0.3 - y, 0.012);
  const prims = [
    ...(OUTFITS[o.type || "tee"] || OUTFITS.tee)(b).map((p) =>
      long || p.paint === "trim" ? p : { ...p, fn: belt(p.fn) },
    ),
    long
      ? {
          fn: ellipsoid(0, 0.2, 0, 0.12 * b, 0.07, 0.1),
          k: 0.04,
          bound: [0, 0.2, 0, 0.14],
          paint: "cloth",
        }
      : {
          fn: (
            (f) => (x, y, z) =>
              smax(f(x, y, z), 0.255 - y, 0.01)
          )(
            squashZ(
              roundCone(0, 0.27, 0, 0, 0.31, 0, 0.13 * b, 0.138 * b),
              0.82,
            ),
          ),
          k: 0.02,
          bound: [0, 0.26, 0, 0.22],
          paint: "pants",
        },
    ...[-1, 1].map((s) => ({
      fn: ellipsoid(s * 0.128 * b, 0.465, 0, 0.062, 0.06, 0.058),
      k: 0.04,
      bound: [s * 0.128, 0.465, 0, 0.07],
      paint: "cloth",
    })),
  ];
  if (o.collar !== false) prims.push(COLLAR);
  const { regions } = sculptRegions({
    prims,
    bounds: [-0.27, 0.08, -0.25, 0.27, 0.6, 0.25],
    order: ["trim", "pants"],
    fallback: "cloth",
    detail: DETAIL.body,
  });
  bodyCache.set(key, regions);
  return regions;
}

/** Head sculpt around the neck pivot: skin, hair and hat, plus face landmarks. */
export function townsHead(spec) {
  const h = spec.head || 1;
  const hair = spec.hair?.style || "crop";
  const hat = spec.hat?.style || "none";
  const key = keyOf([h, hair, hat, !!spec.beard]);
  if (headCache.has(key)) return headCache.get(key);
  const prims = [];
  const add = (fn, k, bound, paint) => prims.push({ fn, k, bound, paint });
  add(
    roundCone(0, 0.49, 0, 0, 0.59, 0.003, 0.05, 0.046),
    0.035,
    [0, 0.54, 0, 0.1],
    "skin",
  );
  add(skull(h), 0.025, [0, TOWN.headY, 0, 0.18 * h], "skin");
  for (const side of [-1, 1]) {
    add(
      ellipsoid(side * 0.07, 0.618, 0.09, 0.07, 0.055, 0.055),
      0.045,
      [side * 0.07, 0.618, 0.09, 0.08],
      "skin",
    );
    add(
      ellipsoid(side * 0.161 * h, 0.655, -0.005, 0.02, 0.03, 0.024),
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
  const skinOnly = makeField([...prims]);
  for (const p of (HAIR[hair] || HAIR.crop)(h, hat))
    add(p.fn, p.k, p.bound, "hair");
  if (spec.beard) for (const p of BEARD(h)) add(p.fn, p.k, p.bound, "hair");
  for (const p of (HATS[hat] || HATS.none)(h))
    add(p.fn, p.k, p.bound, p.paint || "hat");
  const { regions } = sculptRegions({
    prims,
    bounds: [-0.34, 0.46, -0.34, 0.34, 1.1, 0.34],
    order: ["trimHat", "hat", "hair"],
    fallback: "skin",
    cheeks: true,
    cavity: 3.0,
    detail: DETAIL.head,
  });
  // Face landmarks sit on the bare skull, whatever is worn over it.
  const onFace = (x, y) => {
    let z = 0.4;
    for (let i = 0; i < 60; i++) {
      const d = skinOnly(x, y, z);
      if (d < 1e-4) break;
      z -= d;
    }
    return [x, y, z, gradient(skinOnly, x, y, z)];
  };
  // Everything is expressed around the neck pivot so the head can turn.
  const around = ([x, y, z, n]) => [x, y - TOWN.neckY, z, n];
  for (const geometry of Object.values(regions))
    geometry.translate(0, -TOWN.neckY, 0);
  const built = {
    regions,
    face: {
      eyes: [-1, 1].map((s) =>
        around(onFace(s * 0.058 * (h > 1 ? 1.04 : 1), 0.662)),
      ),
      brows: [-1, 1].map((s) => around(onFace(s * 0.06, 0.704))),
      mouth: around(onFace(0, 0.592)),
      nose: around(onFace(0, 0.638)),
      ears: [-1, 1].map((s) => [s * 0.162 * h, 0.655 - TOWN.neckY, -0.005]),
      top: 0.668 + 0.158 * h - TOWN.neckY,
      brim: hat === "sun" ? 0.742 * h - TOWN.neckY : null,
    },
  };
  headCache.set(key, built);
  return built;
}

// One painted mesh per piece: each region's tint is baked into the vertex
// colors on top of the cavity shading, so a person is two draw calls (body and
// head) instead of one per region, and nothing about them needs a material.
const bakedCache = new Map();
export function bakePiece(regions, tints, key) {
  const id = `${key}/${Object.keys(regions)
    .map((r) => tints[r])
    .join(",")}`;
  if (bakedCache.has(id)) return bakedCache.get(id);
  const parts = Object.entries(regions).map(([name, source]) => {
    const g = source.clone();
    const tint = new THREE.Color(tints[name] || "#ffffff");
    const color = g.attributes.color;
    for (let i = 0; i < color.count; i++)
      color.setXYZ(
        i,
        color.getX(i) * tint.r,
        color.getY(i) * tint.g,
        color.getZ(i) * tint.b,
      );
    return g;
  });
  const merged = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
  if (parts.length > 1) parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  bakedCache.set(id, merged);
  return merged;
}
