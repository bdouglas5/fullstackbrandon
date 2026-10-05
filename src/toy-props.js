import * as THREE from "three";
import {
  sculptInto,
  sculptMaterial,
  plainMaterial,
  rbox,
  ellipsoid,
  cylinder,
  roundCone,
  torus,
  mirrorX,
  rotate,
  smax,
} from "./sculpt.js";
import { PAL } from "./toy-vehicles.js";

/**
 * Gadgets and cargo, sculpted for the chibi courier.
 *
 * Gadget groups are authored in the courier's own units (the work effect and
 * the workbench scale them), standing on y = 0 with their front toward +z.
 * Each is one big readable silhouette with two or three color blocks and a
 * single identifying accent; nothing smaller than the courier's mitten hand.
 */

// Local frame of a volume tilted about x around a pivot: used so decals follow
// a tilted face.
const tilted = (angle, py, pz = 0) => {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return (x, y, z) => [
    x,
    c * (y - py) + s * (z - pz),
    -s * (y - py) + c * (z - pz),
  ];
};

const GOLD = "#e7b867";
const SILVER = "#a9b8bd";
const GREEN = "#8aab8c";
const SKY = "#a6dce1";
const ORANGE = "#cd8b60";

const GADGETS = {
  repair_kit: {
    h: 0.026,
    bounds: [-0.4, 0, -0.3, 0.4, 0.62, 0.3],
    fallback: "box",
    order: ["plus", "steel", "latch", "handle"],
    parts: [
      {
        name: "body",
        fn: rbox(0, 0.14, 0, 0.27, 0.14, 0.18, 0.06),
        k: 0.02,
        paint: "box",
      },
      {
        name: "lid",
        fn: rbox(0, 0.31, 0, 0.28, 0.05, 0.19, 0.05),
        k: 0.02,
        paint: "lid",
      },
      {
        name: "post",
        fn: mirrorX(roundCone(0.14, 0.33, 0, 0.14, 0.45, 0, 0.03)),
        k: 0.02,
        paint: "handle",
      },
      {
        name: "grip",
        fn: roundCone(-0.14, 0.45, 0, 0.14, 0.45, 0, 0.036),
        k: 0.02,
        paint: "handle",
      },
      {
        name: "wrench",
        fn: roundCone(0.04, 0.36, 0.06, 0.2, 0.46, 0.11, 0.034),
        k: 0.02,
        paint: "steel",
      },
      {
        name: "wrench head",
        fn: ellipsoid(0.22, 0.47, 0.115, 0.06, 0.06, 0.03),
        k: 0.02,
        paint: "steel",
      },
      {
        name: "latch",
        fn: rbox(0, 0.27, 0.185, 0.05, 0.05, 0.02, 0.012),
        k: 0.01,
        paint: "latch",
      },
    ],
    decals: [
      {
        id: "plus",
        region: "plus",
        g: (x, y, z) =>
          Math.max(
            0.15 - z,
            Math.min(
              Math.max(Math.abs(x) - 0.1, Math.abs(y - 0.15) - 0.028),
              Math.max(Math.abs(x) - 0.028, Math.abs(y - 0.15) - 0.1),
            ),
          ),
      },
    ],
    paints: {
      box: [GOLD, "paint"],
      lid: [PAL.coral, "paint"],
      handle: [PAL.navy, "soft"],
      steel: [SILVER, "metal"],
      latch: [PAL.navy, "soft"],
      plus: [PAL.cream, "paint"],
    },
    names: {
      box: "Repair toolbox",
      lid: "Toolbox lid",
      handle: "Toolbox handle",
      steel: "Toolbox wrench",
      plus: "Toolbox emblem",
    },
  },

  cargo_rack: {
    h: 0.026,
    bounds: [-0.4, 0, -0.32, 0.4, 0.62, 0.32],
    fallback: "metal",
    order: ["wood", "band"],
    parts: [
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => ({
          name: "upright",
          fn: roundCone(
            sx * 0.29,
            0.02,
            sz * 0.2,
            sx * 0.29,
            0.52,
            sz * 0.2,
            0.032,
          ),
          k: 0.02,
          paint: "metal",
        })),
      ),
      {
        name: "low shelf",
        fn: rbox(0, 0.2, 0, 0.31, 0.025, 0.22, 0.015),
        k: 0.02,
        paint: "shelf",
      },
      {
        name: "top shelf",
        fn: rbox(0, 0.5, 0, 0.31, 0.025, 0.22, 0.015),
        k: 0.02,
        paint: "shelf",
      },
      {
        name: "crate",
        fn: rbox(0, 0.32, 0.02, 0.2, 0.09, 0.15, 0.04),
        k: 0.02,
        paint: "wood",
      },
    ],
    decals: [
      {
        id: "band",
        region: "band",
        g: (x, y) => Math.max(Math.abs(x) - 0.03, 0.26 - y),
      },
    ],
    paints: {
      metal: [SILVER, "metal"],
      shelf: [GREEN, "paint"],
      wood: [PAL.wood, "soft"],
      band: [PAL.cream, "soft"],
    },
    names: {
      metal: "Rack upright",
      shelf: "Rack shelf",
      wood: "Rack crate",
      band: "Rack crate band",
    },
  },

  cooler: {
    h: 0.026,
    bounds: [-0.42, 0, -0.3, 0.42, 0.5, 0.3],
    fallback: "body",
    order: ["latch", "grip"],
    parts: [
      {
        name: "body",
        fn: rbox(0, 0.17, 0, 0.28, 0.17, 0.2, 0.07),
        k: 0.02,
        paint: "body",
      },
      {
        name: "lid",
        fn: rbox(0, 0.375, 0, 0.3, 0.045, 0.22, 0.04),
        k: 0.02,
        paint: "lid",
      },
      {
        name: "grip",
        fn: mirrorX(rbox(0.31, 0.2, 0, 0.03, 0.03, 0.1, 0.02)),
        k: 0.01,
        paint: "grip",
      },
      {
        name: "latch",
        fn: rbox(0, 0.33, 0.205, 0.05, 0.045, 0.02, 0.012),
        k: 0.01,
        paint: "latch",
      },
    ],
    paints: {
      body: [SKY, "paint"],
      lid: [PAL.cream, "paint"],
      grip: [PAL.navy, "soft"],
      latch: [PAL.coral, "paint"],
    },
    names: {
      body: "Cold-brine cooler",
      lid: "Cooler lid",
      grip: "Cooler grab handle",
      latch: "Cooler lock",
    },
  },

  rain_gear: {
    h: 0.026,
    bounds: [-0.5, 0, -0.5, 0.5, 0.82, 0.5],
    fallback: "canopy",
    order: ["stripe", "pole"],
    parts: [
      {
        name: "canopy",
        fn: Object.assign(
          (() => {
            const dome = ellipsoid(0, 0.5, 0, 0.44, 0.24, 0.44);
            return (x, y, z) => smax(dome(x, y, z), 0.5 - y, 0.02);
          })(),
          { bound: [0, 0.6, 0, 0.5] },
        ),
        k: 0.02,
        paint: "canopy",
      },
      {
        name: "pole",
        fn: roundCone(0, 0.05, 0, 0, 0.78, 0, 0.03),
        k: 0.02,
        paint: "pole",
      },
      {
        name: "tip",
        fn: ellipsoid(0, 0.78, 0, 0.035, 0.035, 0.035),
        k: 0.02,
        paint: "pole",
      },
      {
        name: "hook",
        fn: torus(0.07, 0.07, 0, 0, 0, 1, 0.07, 0.03),
        k: 0.02,
        paint: "pole",
      },
    ],
    decals: [
      {
        id: "stripe",
        region: "stripe",
        g: (x, y, z) => Math.max(-Math.sin(4 * Math.atan2(z, x)), 0.5 - y),
      },
    ],
    paints: {
      canopy: [PAL.gold, "paint"],
      stripe: [PAL.coral, "paint"],
      pole: [PAL.navy, "soft"],
    },
    names: {
      canopy: "Waterproof jar umbrella",
      stripe: "Umbrella stripes",
      pole: "Umbrella pole",
    },
  },

  solar_panel: (() => {
    const a = 0.55,
      pivot = 0.36;
    const local = tilted(a, pivot);
    const cells = [-0.18, 0, 0.18].flatMap((cx) =>
      [-0.1, 0.1].map((cz) => [cx, cz]),
    );
    return {
      h: 0.026,
      bounds: [-0.42, 0, -0.34, 0.42, 0.62, 0.34],
      fallback: "frame",
      order: ["cell", "stand"],
      parts: [
        {
          name: "panel",
          fn: rotate(
            rbox(0, pivot, 0, 0.32, 0.028, 0.23, 0.02),
            "x",
            a,
            0,
            pivot,
            0,
          ),
          k: 0.02,
          paint: "frame",
        },
        {
          name: "leg",
          fn: mirrorX(roundCone(0.2, 0.0, 0.12, 0.2, 0.3, 0.02, 0.03)),
          k: 0.02,
          paint: "stand",
        },
        {
          name: "back leg",
          fn: roundCone(0, 0.0, -0.22, 0, 0.32, -0.05, 0.03),
          k: 0.02,
          paint: "stand",
        },
        {
          name: "foot",
          fn: rbox(0, 0.02, 0.02, 0.28, 0.02, 0.2, 0.015),
          k: 0.02,
          paint: "stand",
        },
      ],
      decals: [
        {
          id: "cell",
          region: "cell",
          g: (x, y, z) => {
            const [lx, ly, lz] = local(x, y, z);
            if (ly < 0.012) return 1;
            let d = Infinity;
            for (const [cx, cz] of cells)
              d = Math.min(
                d,
                Math.max(Math.abs(lx - cx) - 0.075, Math.abs(lz - cz) - 0.085),
              );
            return d;
          },
        },
      ],
      paints: {
        frame: [PAL.gold, "paint"],
        stand: [PAL.navy, "soft"],
        cell: ["#4f86b8", "gloss"],
      },
      names: {
        frame: "Solar charger",
        stand: "Solar stand",
        cell: "Solar cells",
      },
    };
  })(),

  cargo_dolly: {
    h: 0.026,
    bounds: [-0.4, 0, -0.2, 0.4, 0.74, 0.35],
    fallback: "frame",
    order: ["tire", "grip"],
    parts: [
      {
        name: "rail",
        fn: mirrorX(roundCone(0.14, 0.05, 0.1, 0.14, 0.62, -0.08, 0.032)),
        k: 0.02,
        paint: "frame",
      },
      {
        name: "cross",
        fn: roundCone(-0.14, 0.38, 0, 0.14, 0.38, 0, 0.032),
        k: 0.02,
        paint: "frame",
      },
      {
        name: "grip",
        fn: roundCone(-0.17, 0.65, -0.09, 0.17, 0.65, -0.09, 0.036),
        k: 0.02,
        paint: "grip",
      },
      {
        name: "toe plate",
        fn: rbox(0, 0.03, 0.18, 0.18, 0.025, 0.1, 0.015),
        k: 0.02,
        paint: "frame",
      },
      {
        name: "axle",
        fn: roundCone(-0.22, 0.08, -0.03, 0.22, 0.08, -0.03, 0.028),
        k: 0.02,
        paint: "frame",
      },
      {
        name: "wheel",
        fn: mirrorX(cylinder("x", 0.22, 0.08, -0.03, 0.08, 0.035, 0.02)),
        k: 0.01,
        paint: "tire",
      },
    ],
    paints: {
      frame: [ORANGE, "paint"],
      grip: [PAL.navy, "soft"],
      tire: [PAL.navy, "rubber"],
    },
    names: { frame: "Dolly frame", grip: "Dolly handle", tire: "Dolly wheel" },
  },

  navigation: (() => {
    const a = -0.28,
      py = 0.4;
    const local = tilted(a, py);
    return {
      h: 0.026,
      bounds: [-0.34, 0, -0.2, 0.34, 0.76, 0.2],
      fallback: "case",
      order: ["pin", "route", "screen", "stand"],
      parts: [
        {
          name: "base",
          fn: cylinder("y", 0, 0.025, 0, 0.17, 0.025, 0.02),
          k: 0.02,
          paint: "stand",
        },
        {
          name: "post",
          fn: roundCone(0, 0.03, 0, 0, 0.26, 0, 0.04),
          k: 0.02,
          paint: "stand",
        },
        {
          name: "tablet",
          fn: rotate(rbox(0, py, 0, 0.25, 0.19, 0.035, 0.05), "x", a, 0, py, 0),
          k: 0.02,
          paint: "case",
        },
        {
          name: "antenna",
          fn: roundCone(0.19, 0.56, -0.03, 0.22, 0.72, -0.04, 0.024),
          k: 0.01,
          paint: "stand",
        },
        {
          name: "antenna tip",
          fn: ellipsoid(0.225, 0.73, -0.04, 0.034, 0.034, 0.034),
          k: 0.01,
          paint: "pin",
        },
        {
          name: "pin",
          fn: ellipsoid(0.07, 0.46, 0.05, 0.04, 0.04, 0.04),
          k: 0.01,
          paint: "pin",
        },
      ],
      decals: [
        {
          id: "route",
          region: "route",
          g: (x, y, z) => {
            const [lx, ly, lz] = local(x, y, z);
            if (lz < 0.02) return 1;
            // A bent route line across the map.
            const t = Math.abs(
              ly - (0.04 + 0.5 * lx) + Math.sin(lx * 14) * 0.02,
            );
            return Math.max(t - 0.014, Math.abs(lx) - 0.17);
          },
        },
        {
          id: "screen",
          region: "screen",
          g: (x, y, z) => {
            const [lx, ly, lz] = local(x, y, z);
            return lz < 0.02
              ? 1
              : Math.max(Math.abs(lx) - 0.2, Math.abs(ly) - 0.145);
          },
        },
      ],
      paints: {
        case: ["#355f69", "paint"],
        screen: ["#b8e5bf", "gloss"],
        route: [PAL.teal, "paint"],
        stand: [PAL.navy, "soft"],
        pin: [PAL.coral, "paint"],
      },
      names: {
        case: "Route planner",
        screen: "Planner map",
        route: "Planner route",
        stand: "Planner stand",
        pin: "Planner pin",
      },
    };
  })(),

  scanner: {
    h: 0.026,
    bounds: [-0.34, 0, -0.26, 0.34, 0.46, 0.46],
    fallback: "body",
    order: ["lens", "label", "button"],
    parts: [
      {
        name: "body",
        fn: rbox(0, 0.14, 0, 0.26, 0.14, 0.2, 0.07),
        k: 0.02,
        paint: "body",
      },
      {
        name: "cover",
        fn: rbox(0, 0.3, -0.03, 0.22, 0.035, 0.15, 0.03),
        k: 0.02,
        paint: "cover",
      },
      {
        name: "lens",
        fn: ellipsoid(0, 0.335, 0.1, 0.06, 0.03, 0.05),
        k: 0.02,
        paint: "lens",
      },
      {
        name: "label",
        fn: rbox(0, 0.09, 0.3, 0.13, 0.012, 0.12, 0.008),
        k: 0.005,
        paint: "label",
      },
      ...[-1, 0, 1].map((i) => ({
        name: "button",
        fn: ellipsoid(i * 0.1, 0.22, 0.2, 0.032, 0.032, 0.02),
        k: 0.01,
        paint: "button",
      })),
    ],
    carve: [{ fn: rbox(0, 0.09, 0.2, 0.14, 0.02, 0.035, 0.01), k: 0.01 }],
    paints: {
      body: [PAL.cream, "paint"],
      cover: [SKY, "paint"],
      lens: [PAL.coral, "gloss"],
      label: ["#fff3cc", "soft"],
      button: [PAL.teal, "paint"],
    },
    names: {
      body: "Batch-label printer",
      cover: "Printer cover",
      lens: "Scanner lens",
      label: "Printed label",
      button: "Printer buttons",
    },
  },

  generator: {
    h: 0.026,
    bounds: [-0.42, 0, -0.3, 0.42, 0.62, 0.3],
    fallback: "body",
    order: ["slot", "dial", "cage"],
    parts: [
      {
        name: "body",
        fn: rbox(0, 0.2, 0, 0.28, 0.18, 0.2, 0.07),
        k: 0.02,
        paint: "body",
      },
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => ({
          name: "cage post",
          fn: roundCone(
            sx * 0.33,
            0.02,
            sz * 0.23,
            sx * 0.33,
            0.44,
            sz * 0.23,
            0.034,
          ),
          k: 0.015,
          paint: "cage",
        })),
      ),
      {
        name: "cage front",
        fn: roundCone(-0.33, 0.44, 0.23, 0.33, 0.44, 0.23, 0.034),
        k: 0.015,
        paint: "cage",
      },
      {
        name: "cage back",
        fn: roundCone(-0.33, 0.44, -0.23, 0.33, 0.44, -0.23, 0.034),
        k: 0.015,
        paint: "cage",
      },
      {
        name: "exhaust",
        fn: roundCone(-0.14, 0.36, -0.05, -0.14, 0.56, -0.05, 0.045),
        k: 0.02,
        paint: "cage",
      },
      {
        name: "dial",
        fn: ellipsoid(0.14, 0.27, 0.195, 0.055, 0.055, 0.02),
        k: 0.01,
        paint: "dial",
      },
    ],
    decals: [
      {
        id: "slot",
        region: "slot",
        g: (x, y, z) =>
          Math.max(
            0.17 - z,
            x - 0.02,
            -x - 0.2,
            Math.abs(y - 0.18) - 0.1,
            Math.abs(((y / 0.05) % 1) - 0.5) - 0.2,
          ),
      },
    ],
    paints: {
      body: [GOLD, "paint"],
      cage: [PAL.navy, "soft"],
      dial: [PAL.cream, "gloss"],
      slot: ["#554f47", "soft"],
    },
    names: {
      body: "Brine generator",
      cage: "Generator safety cage",
      dial: "Generator dial",
      slot: "Cooling vent",
    },
  },

  winch: {
    h: 0.026,
    bounds: [-0.42, 0, -0.25, 0.42, 0.5, 0.3],
    fallback: "drum",
    order: ["rope", "knob", "flange", "base"],
    parts: [
      {
        name: "drum",
        fn: cylinder("x", 0, 0.22, 0, 0.13, 0.2, 0.02),
        k: 0.02,
        paint: "drum",
      },
      {
        name: "flange",
        fn: mirrorX(cylinder("x", 0.2, 0.22, 0, 0.18, 0.025, 0.015)),
        k: 0.02,
        paint: "flange",
      },
      {
        name: "base",
        fn: rbox(0, 0.04, 0, 0.27, 0.04, 0.14, 0.03),
        k: 0.02,
        paint: "base",
      },
      {
        name: "bracket",
        fn: mirrorX(rbox(0.23, 0.14, 0, 0.03, 0.12, 0.1, 0.02)),
        k: 0.02,
        paint: "base",
      },
      {
        name: "crank",
        fn: roundCone(0.27, 0.22, 0, 0.27, 0.38, 0, 0.03),
        k: 0.02,
        paint: "flange",
      },
      {
        name: "knob",
        fn: roundCone(0.27, 0.38, 0, 0.35, 0.38, 0, 0.032),
        k: 0.02,
        paint: "knob",
      },
      {
        name: "hook",
        fn: torus(0, 0.06, 0.2, 1, 0, 0, 0.05, 0.02),
        k: 0.02,
        paint: "flange",
      },
      {
        name: "line",
        fn: roundCone(0, 0.18, 0.13, 0, 0.1, 0.2, 0.022),
        k: 0.01,
        paint: "rope",
      },
    ],
    decals: [
      {
        id: "rope",
        region: "rope",
        g: (x, y, z) =>
          Math.max(Math.abs(x) - 0.17, Math.abs(((x / 0.055) % 1) - 0.5) - 0.3),
      },
    ],
    paints: {
      drum: [SILVER, "metal"],
      flange: [PAL.gold, "paint"],
      base: [PAL.navy, "soft"],
      knob: [PAL.coral, "paint"],
      rope: ["#cfb581", "soft"],
    },
    names: {
      drum: "Cargo winch",
      flange: "Winch flange",
      base: "Winch mount",
      knob: "Winch crank",
      rope: "Winch cable coil",
    },
  },

  spill_kit: {
    h: 0.026,
    bounds: [-0.4, 0, -0.3, 0.42, 0.78, 0.3],
    fallback: "bucket",
    order: ["rim", "suds", "sponge", "stick"],
    parts: [
      {
        name: "bucket",
        fn: cylinder("y", -0.06, 0.17, 0, 0.17, 0.16, 0.05),
        k: 0.02,
        paint: "bucket",
      },
      {
        name: "rim",
        fn: torus(-0.06, 0.325, 0, 0, 1, 0, 0.165, 0.028),
        k: 0.015,
        paint: "rim",
      },
      {
        name: "suds",
        fn: ellipsoid(-0.06, 0.33, 0, 0.14, 0.05, 0.14),
        k: 0.02,
        paint: "suds",
      },
      {
        name: "bubbles",
        fn: ellipsoid(-0.12, 0.39, 0.05, 0.05, 0.04, 0.05),
        k: 0.015,
        paint: "suds",
      },
      {
        name: "stick",
        fn: roundCone(0.04, 0.3, 0.02, 0.24, 0.66, 0.08, 0.026),
        k: 0.02,
        paint: "stick",
      },
      {
        name: "sponge",
        fn: rbox(0.28, 0.7, 0.09, 0.1, 0.055, 0.075, 0.035),
        k: 0.02,
        paint: "sponge",
      },
    ],
    decals: [],
    paints: {
      bucket: [PAL.coral, "paint"],
      rim: [PAL.cream, "paint"],
      suds: ["#f6fbff", "soft"],
      stick: ["#b88a5a", "soft"],
      sponge: [GOLD, "soft"],
    },
    names: {
      bucket: "Spill kit bucket",
      rim: "Spill kit rim",
      suds: "Spill kit suds",
      stick: "Spill kit mop handle",
      sponge: "Spill kit sponge",
    },
  },
};

export const GADGET_IDS = Object.keys(GADGETS);

/** Fill an existing gadget group (handles stay valid) with its sculpted model. */
export function buildGadget(id, group) {
  const def = GADGETS[id];
  if (!def) throw new Error(`Unknown gadget ${id}`);
  const { paints, names, ...rest } = def;
  sculptInto(group, { key: `gadget/${id}/v1`, ...rest }, paints, {
    names,
    name: id,
  });
  return group;
}

// ---------------------------------------------------------------------------
// Cargo.

const crateSpec = (w, h, d, tag) => ({
  key: `crate/${tag}/${w}x${h}x${d}/v1`,
  h: 0.035,
  bounds: [
    -w / 2 - 0.05,
    -h / 2 - 0.05,
    -d / 2 - 0.05,
    w / 2 + 0.05,
    h / 2 + 0.05,
    d / 2 + 0.05,
  ],
  fallback: "wood",
  order: ["band"],
  parts: [
    {
      name: "crate",
      fn: rbox(0, 0, 0, w / 2, h / 2, d / 2, Math.min(w, h, d) * 0.16),
      k: 0.02,
      paint: "wood",
    },
  ],
  decals: [
    {
      id: "band",
      region: "band",
      g: (x) => Math.abs(x) - Math.min(0.045, w * 0.12),
    },
  ],
});

/** A rounded wooden crate with a cream strap, centered on its own origin. */
export function toyCrate(parent, w, h, d, tag, { wood = PAL.wood } = {}) {
  return sculptInto(
    parent,
    crateSpec(w, h, d, tag),
    { wood: [wood, "soft"], band: [PAL.cream, "soft"] },
    { names: { wood: "supply crate", band: "crate strap" } },
  );
}

/**
 * Re-skin an existing mesh as a sculpted crate or parcel in place: same object,
 * position and parent (renderer references and batching stay valid).
 */
export function reskinMesh(mesh, w, h, d, tag, { wood = PAL.wood } = {}) {
  const holder = new THREE.Group();
  const [body, band] = toyCrate(holder, w, h, d, tag, { wood });
  mesh.geometry = body.geometry;
  mesh.material = body.material;
  mesh.clear();
  mesh.castShadow = mesh.receiveShadow = true;
  if (band) {
    const strap = new THREE.Mesh(band.geometry, band.material);
    strap.name = "crate strap";
    strap.castShadow = true;
    mesh.add(strap);
  }
  return mesh;
}

/** The harbor crates: same meshes, positions and count, new chunky geometry. */
export function reskinCrates(crates) {
  for (const crate of crates) reskinMesh(crate, 0.44, 0.44, 0.44, "harbor");
}
