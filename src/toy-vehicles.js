import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  sculptGroup,
  sculptInto,
  plainMaterial,
  rbox,
  ellipsoid,
  cylinder,
  ring,
  roundCone,
  torus,
  mirrorX,
  rotate,
} from "./sculpt.js";
import { SEAT, WHEEL_RADIUS } from "./toy-scale.js";

/**
 * Sculpted toy vehicles, sized to the chibi courier (toy-scale.js).
 *
 * Each builder fills an existing group (so every handle the renderer, crew
 * clones and tests already hold stays valid) with soft-blended clay volumes:
 * large painted body masses, fat wheels, one or two accent parts. Footprints
 * stay inside shared/traffic.js transportRadius so the simulation is untouched.
 */

export const PAL = {
  teal: "#216f75",
  tealDark: "#17525a",
  cream: "#fff2d8",
  navy: "#263e4e",
  gold: "#f8cb68",
  coral: "#ed8970",
  wood: "#c38d55",
  woodDark: "#8f694d",
  sky: "#9fd6d6",
  silver: "#aebdc2",
};

const canvasSign = (text, w, h = w / 4) => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 / (w / h));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAL.cream;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PAL.navy;
  ctx.font = `bold ${Math.round(canvas.height * 0.52)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height * 0.54);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
  );
  mesh.name = `sign ${text}`;
  return mesh;
};

const glassMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: "#aee9e6",
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

const lampMaterial = (color = "#fff3c0", emissive = "#ffcd68") =>
  new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.5,
    roughness: 0.25,
  });

// ---------------------------------------------------------------------------
// Delivery van: a soft two-tone box with a big glass cabin so the courier's
// oversized head and mitten hands read through the windows.

export function buildVan(van, chassis) {
  const [x0, y0, z0] = SEAT.van.position;
  const R = WHEEL_RADIUS.van;
  // Everything is derived from the seated courier: soles on the floor, hips on
  // the cushion, hands on the wheel, cap clear of the roof.
  const floor = y0 + 0.043, // sole height above the body origin (0.083 x 0.52)
    belt = 0.7,
    roof = 1.17,
    halfW = 0.47;
  const body = {
    key: "van/body/v2",
    h: 0.04,
    bounds: [-0.6, 0.2, -0.9, 0.6, 1.3, 0.92],
    fallback: "cream",
    order: ["navy", "gold", "teal"],
    parts: [
      {
        name: "lower",
        fn: rbox(0, 0.5, 0, halfW, 0.22, 0.8, 0.15),
        k: 0.07,
        paint: "cream",
      },
      {
        name: "shell",
        fn: rbox(
          0,
          (0.5 + roof) / 2,
          -0.12,
          halfW - 0.01,
          (roof - 0.5) / 2,
          0.7,
          0.2,
        ),
        k: 0.06,
        paint: "cream",
      },
      {
        name: "nose",
        fn: rbox(0, 0.62, 0.65, halfW, 0.17, 0.17, 0.12),
        k: 0.05,
        paint: "cream",
      },
      {
        name: "front bumper",
        fn: rbox(0, 0.36, 0.78, halfW - 0.01, 0.07, 0.06, 0.05),
        k: 0.03,
        paint: "navy",
      },
      {
        name: "rear bumper",
        fn: rbox(0, 0.36, -0.8, halfW - 0.01, 0.07, 0.06, 0.05),
        k: 0.03,
        paint: "navy",
      },
    ],
    carve: [
      // Glasshouse: wide windshield and side windows over a hollow cab.
      { fn: rbox(0, 0.9, 0.62, 0.33, 0.2, 0.1, 0.07), k: 0.03 },
      { fn: mirrorX(rbox(halfW, 0.9, 0.17, 0.1, 0.2, 0.29, 0.07)), k: 0.03 },
      { fn: rbox(0, 0.715, 0.17, halfW - 0.1, 0.375, 0.36, 0.08), k: 0.04 },
      { fn: rbox(0, 0.9, 0.46, halfW - 0.1, 0.2, 0.17, 0.08), k: 0.04 },
      // Wheel arches.
      {
        fn: mirrorX(cylinder("x", halfW, R, 0.5, R + 0.04, 0.13, 0.03)),
        k: 0.04,
      },
      {
        fn: mirrorX(cylinder("x", halfW, R, -0.5, R + 0.04, 0.13, 0.03)),
        k: 0.04,
      },
      { fn: rbox(0, 0.58, 0.82, 0.14, 0.04, 0.035, 0.02), k: 0.01 },
    ],
    decals: [
      {
        id: "stripe",
        region: "gold",
        g: (x, y, z) =>
          Math.max(Math.abs(y - 0.77) - 0.03, z - 0.08, -0.74 - z),
      },
      {
        id: "grille",
        region: "navy",
        g: (x, y, z) =>
          Math.max(Math.abs(x) - 0.145, Math.abs(y - 0.58) - 0.045, 0.78 - z),
      },
      {
        id: "lower",
        region: "teal",
        g: (x, y, z) => Math.min(y - belt - 0.02, Math.max(z - 0.5, y - 0.86)),
      },
    ],
  };
  const hull = sculptGroup(
    body,
    {
      cream: [PAL.cream, "paint"],
      teal: [PAL.teal, "paint"],
      gold: [PAL.gold, "paint"],
      navy: [PAL.navy, "soft"],
    },
    {
      name: "Van body",
      names: {
        cream: "van upper body",
        teal: "van lower body",
        gold: "van side stripe",
        navy: "van trim",
      },
    },
  );
  chassis.add(hull);

  // Cabin furniture: seats and a steering wheel, kept separate so the cavity
  // carved into the shell cannot remove them.
  const cabin = {
    key: "van/cabin/v2",
    h: 0.03,
    bounds: [-0.42, floor - 0.02, -0.34, 0.42, 0.95, 0.6],
    fallback: "navy",
    order: ["wheel"],
    parts: [
      {
        name: "seat base",
        fn: mirrorX(rbox(0.2, floor + 0.06, 0.07, 0.16, 0.06, 0.16, 0.04)),
        k: 0.02,
        paint: "navy",
      },
      {
        name: "seat back",
        fn: mirrorX(rbox(0.2, floor + 0.3, -0.225, 0.16, 0.22, 0.04, 0.05)),
        k: 0.02,
        paint: "navy",
      },
      {
        name: "dash",
        fn: rbox(0, floor + 0.14, 0.52, 0.37, 0.14, 0.07, 0.05),
        k: 0.02,
        paint: "navy",
      },
      {
        name: "column",
        fn: roundCone(x0, y0 + 0.33, z0 + 0.2, x0, floor + 0.2, 0.47, 0.03),
        k: 0.02,
        paint: "navy",
      },
      {
        name: "steering wheel",
        fn: torus(x0, y0 + 0.33, z0 + 0.16, 0, 0.3, -0.95, 0.14, 0.03),
        k: 0.01,
        paint: "wheel",
      },
    ],
  };
  const cabinGroup = sculptGroup(
    cabin,
    { navy: [PAL.navy, "soft"], wheel: [PAL.cream, "paint"] },
    {
      name: "Van cabin",
      names: { navy: "van seats", wheel: "steering wheel" },
    },
  );
  chassis.add(cabinGroup);

  // Glass: shallow planes so the cabin reads without hiding the courier.
  const glass = glassMaterial();
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), glass);
  windshield.name = "van windshield";
  windshield.position.set(0, 0.9, 0.6);
  windshield.rotation.x = -0.12;
  chassis.add(windshield);
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.36), glass);
    pane.name = "van side window";
    pane.position.set(side * (halfW - 0.04), 0.9, 0.17);
    pane.rotation.y = (side * Math.PI) / 2;
    chassis.add(pane);
  }

  // Round headlamps and tail lamps.
  const headlights = [];
  for (const x of [-0.3, 0.3]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 18, 12),
      lampMaterial(),
    );
    lamp.name = "headlight";
    lamp.position.set(x, 0.58, 0.8);
    lamp.scale.set(1, 1, 0.55);
    lamp.castShadow = true;
    chassis.add(lamp);
    headlights.push(lamp);
    const tail = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 10),
      new THREE.MeshStandardMaterial({ color: PAL.coral, roughness: 0.35 }),
    );
    tail.name = "rear light";
    tail.position.set(x * 1.4, 0.66, -0.79);
    tail.scale.set(1, 1.4, 0.5);
    chassis.add(tail);
  }

  // Brand plate on each cargo side.
  for (const side of [-1, 1]) {
    const plate = canvasSign("B. PICKLES", 0.5, 0.14);
    if (!plate) continue;
    plate.position.set(side * (halfW + 0.004), 0.84, -0.36);
    plate.rotation.y = (side * Math.PI) / 2;
    chassis.add(plate);
  }

  // Fat wheels: tire, painted hub and cap, shared geometry across all four.
  const wheelSpec = {
    key: "van/wheel/v2",
    h: 0.035,
    bounds: [-0.14, -0.3, -0.3, 0.14, 0.3, 0.3],
    fallback: "tire",
    order: ["cap", "hub"],
    parts: [
      {
        name: "tire",
        fn: cylinder("x", 0, 0, 0, R, 0.1, 0.07),
        k: 0.02,
        paint: "tire",
      },
      {
        name: "hub",
        fn: cylinder("x", 0.075, 0, 0, R * 0.6, 0.04, 0.025),
        k: 0.015,
        paint: "hub",
      },
      {
        name: "cap",
        fn: cylinder("x", 0.1, 0, 0, 0.065, 0.025, 0.02),
        k: 0.012,
        paint: "cap",
      },
    ],
  };
  const wheels = [];
  for (const x of [-halfW, halfW])
    for (const z of [-0.5, 0.5]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, R, z);
      chassis.add(wheel);
      wheels.push(wheel);
      const holder = sculptGroup(
        wheelSpec,
        {
          tire: [PAL.navy, "rubber"],
          hub: [PAL.cream, "paint"],
          cap: [PAL.teal, "paint"],
        },
        {
          name: "wheel mesh",
          names: { tire: "van tire", hub: "van hub", cap: "van hub cap" },
        },
      );
      if (x < 0) holder.rotation.y = Math.PI;
      wheel.add(holder);
    }

  return { headlights, wheels, hull, windshield };
}

// ---------------------------------------------------------------------------
// Cargo bicycle: a low, chunky cruiser. The chibi's legs are 0.21 long, so the
// saddle sits barely above the wheel hubs and the bars just clear the front
// tire; pedal plates ride under the soles (world-animation.js moves them).

export function buildBike(bike) {
  const R = WHEEL_RADIUS.bike;
  const rearZ = -0.4,
    frontZ = 0.42;
  const A = [0, R, rearZ],
    F = [0, R, frontZ],
    H = [0, 0.2, 0.12],
    S = [0, 0.25, -0.04],
    T = [0, 0.5, 0.31],
    B = [0, 0.47, 0.21];
  const tube = (a, b, r, k = 0.03, paint = "frame") => ({
    name: "tube",
    fn: roundCone(...a, ...b, r),
    k,
    paint,
  });
  const frameSpec = {
    key: "bike/frame/v2",
    h: 0.025,
    bounds: [-0.3, 0.05, -0.62, 0.3, 0.75, 0.62],
    fallback: "frame",
    order: ["grip", "seat", "metal"],
    parts: [
      tube(A, H, 0.036),
      tube(A, S, 0.03),
      tube(H, S, 0.036),
      tube(T, H, 0.042),
      tube(S, T, 0.032),
      tube(F, T, 0.032),
      tube(T, B, 0.03, 0.03, "metal"),
      tube([-0.16, 0.47, 0.21], [0.16, 0.47, 0.21], 0.026, 0.02, "metal"),
      tube([-0.17, 0.47, 0.21], [-0.2, 0.47, 0.21], 0.042, 0.01, "grip"),
      tube([0.17, 0.47, 0.21], [0.2, 0.47, 0.21], 0.042, 0.01, "grip"),
      {
        name: "saddle",
        fn: ellipsoid(0, 0.285, -0.02, 0.1, 0.04, 0.15),
        k: 0.03,
        paint: "seat",
      },
      tube(S, [0, 0.27, -0.03], 0.022, 0.02, "metal"),
      tube(A, [0, 0.46, rearZ], 0.024, 0.02, "metal"),
      {
        name: "chainring",
        fn: cylinder("x", 0.055, H[1], H[2], 0.085, 0.012, 0.01),
        k: 0.01,
        paint: "metal",
      },
      {
        name: "crank hub",
        fn: cylinder("x", 0, H[1], H[2], 0.04, 0.07, 0.02),
        k: 0.01,
        paint: "metal",
      },
    ],
  };
  const frame = sculptGroup(
    frameSpec,
    {
      frame: [PAL.teal, "paint"],
      metal: [PAL.silver, "metal"],
      grip: [PAL.gold, "soft"],
      seat: [PAL.navy, "soft"],
    },
    {
      name: "Bike frame",
      names: {
        frame: "bike frame",
        metal: "bike fittings",
        grip: "bike grips",
        seat: "bike saddle",
      },
    },
  );
  bike.add(frame);

  const basketSpec = {
    key: "bike/basket/v1",
    h: 0.025,
    bounds: [-0.26, 0.4, -0.7, 0.26, 0.8, -0.12],
    fallback: "wood",
    order: ["band"],
    parts: [
      {
        name: "basket",
        fn: rbox(0, 0.57, -0.42, 0.2, 0.11, 0.19, 0.05),
        k: 0.02,
        paint: "wood",
      },
    ],
    carve: [{ fn: rbox(0, 0.66, -0.42, 0.155, 0.07, 0.145, 0.03), k: 0.02 }],
    decals: [
      {
        id: "band",
        region: "band",
        g: (x, y, z) => Math.abs(y - 0.55) - 0.022,
      },
    ],
  };
  const basket = sculptGroup(
    basketSpec,
    { wood: [PAL.wood, "soft"], band: [PAL.cream, "soft"] },
    {
      name: "Pickle cargo basket",
      names: { wood: "pickle cargo basket", band: "basket band" },
    },
  );
  bike.add(basket);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 14, 10),
    lampMaterial(),
  );
  lamp.name = "Bicycle headlamp lens";
  lamp.position.set(0, 0.53, 0.35);
  lamp.scale.set(1, 1, 0.8);
  bike.add(lamp);

  // A toy wheel: tire ring, a thin painted disc with five round cut-outs, and
  // a hub. The disc keeps the old "bicycle spoke" name so the roll animation
  // still finds the wheel group.
  const wheelSpec = {
    key: "bike/wheel/v3",
    h: 0.022,
    bounds: [-0.08, -0.25, -0.25, 0.08, 0.25, 0.25],
    fallback: "tire",
    order: ["hub", "rim", "spoke"],
    parts: [
      {
        name: "tire",
        fn: ring("x", 0, 0, 0, R - 0.085, R, 0.055, 0.04),
        k: 0.01,
        paint: "tire",
      },
      {
        name: "disc",
        fn: cylinder("x", 0, 0, 0, R - 0.06, 0.02, 0.01),
        k: 0.015,
        paint: "spoke",
      },
      {
        name: "hub",
        fn: cylinder("x", 0, 0, 0, 0.06, 0.04, 0.02),
        k: 0.015,
        paint: "hub",
      },
    ],
    carve: [0, 1, 2, 3, 4].map((i) => ({
      fn: cylinder(
        "x",
        0,
        0.095 * Math.sin((i * 2 * Math.PI) / 5),
        0.095 * Math.cos((i * 2 * Math.PI) / 5),
        0.036,
        0.06,
        0,
      ),
      k: 0.01,
    })),
    decals: [
      {
        id: "whitewall",
        region: "rim",
        g: (x, y, z) =>
          Math.max(
            Math.abs(x) - 0.04,
            Math.abs(Math.hypot(y, z) - (R - 0.045)) - 0.016,
          ),
      },
    ],
  };
  const bikeWheels = [];
  for (const z of [rearZ, frontZ]) {
    const wheel = new THREE.Group();
    wheel.name = "bike wheel";
    wheel.position.set(0, R, z);
    bike.add(wheel);
    bikeWheels.push(wheel);
    sculptInto(
      wheel,
      wheelSpec,
      {
        tire: [PAL.navy, "rubber"],
        rim: [PAL.cream, "soft"],
        spoke: [PAL.cream, "paint"],
        hub: [PAL.teal, "paint"],
      },
      {
        names: {
          tire: "bike tire",
          rim: "bike whitewall",
          spoke: "bicycle spoke",
          hub: "bike hub",
        },
      },
    );
  }

  // Pedal plates: positions are driven each frame from the rider's soles.
  const pedals = ["left", "right"].map((side) => {
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(0.1, 0.028, 0.1, 2, 0.012),
      plainMaterial(PAL.navy, "soft"),
    );
    plate.name = `Pedal plate ${side}`;
    plate.castShadow = true;
    plate.position.set(side === "left" ? -0.075 : 0.075, 0.17, 0.12);
    bike.add(plate);
    return plate;
  });
  return { bikeWheels, pedals };
}

// ---------------------------------------------------------------------------
// Helicopter: an egg-shaped gold pod with an open tub for the pilot under a
// big glass bubble, a stubby tail and fat two-bar rotors.

export function buildHelicopter(heli) {
  const [, y0, z0] = SEAT.helicopter.position;
  const floor = y0 + 0.043;
  const podSpec = {
    key: "heli/pod/v1",
    h: 0.04,
    bounds: [-0.55, 0.15, -1.4, 0.55, 1.2, 1.0],
    fallback: "gold",
    order: ["navy", "teal"],
    parts: [
      {
        name: "belly",
        fn: ellipsoid(0, 0.55, -0.05, 0.44, 0.27, 0.82),
        k: 0.06,
        paint: "gold",
      },
      {
        name: "nose",
        fn: ellipsoid(0, 0.55, 0.42, 0.38, 0.25, 0.4),
        k: 0.06,
        paint: "gold",
      },
      {
        name: "engine",
        fn: ellipsoid(0, 0.82, -0.38, 0.28, 0.2, 0.45),
        k: 0.08,
        paint: "teal",
      },
      {
        name: "tail boom",
        fn: roundCone(0, 0.7, -0.6, 0, 0.84, -1.28, 0.17, 0.075),
        k: 0.06,
        paint: "teal",
      },
      {
        name: "fin",
        fn: rbox(0, 1.03, -1.28, 0.035, 0.22, 0.15, 0.03),
        k: 0.03,
        paint: "teal",
      },
      {
        name: "stabilizer",
        fn: rbox(0, 0.86, -1.15, 0.34, 0.025, 0.1, 0.02),
        k: 0.02,
        paint: "gold",
      },
      {
        name: "mast",
        fn: roundCone(0, 0.85, -0.12, 0, 1.3, -0.12, 0.065),
        k: 0.04,
        paint: "navy",
      },
    ],
    carve: [{ fn: ellipsoid(0, 0.73, z0, 0.31, 0.34, 0.37), k: 0.04 }],
    decals: [
      {
        id: "belt",
        region: "navy",
        g: (x, y, z) => Math.max(Math.abs(y - 0.47) - 0.025, z - 0.5, -0.5 - z),
      },
    ],
  };
  const hullMeshes = sculptInto(
    heli,
    podSpec,
    {
      gold: [PAL.gold, "paint"],
      teal: [PAL.teal, "paint"],
      navy: [PAL.navy, "soft"],
    },
    {
      names: {
        gold: "Helicopter enamel fuselage",
        teal: "helicopter tail and engine",
        navy: "helicopter belt",
      },
    },
  );
  // Index contract: [0] body color (crew recolor), [1] canopy (glass).
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 18),
    new THREE.MeshPhysicalMaterial({
      color: "#9fe0dc",
      roughness: 0.1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  canopy.name = "Helicopter cockpit canopy";
  canopy.userData.unlitGlass = true;
  canopy.scale.set(0.4, 0.4, 0.5);
  canopy.position.set(0, 0.84, z0 + 0.02);
  heli.add(canopy);
  heli.children.splice(heli.children.indexOf(canopy), 1);
  heli.children.splice(1, 0, canopy);

  const seatSpec = {
    key: "heli/seat/v1",
    h: 0.025,
    bounds: [-0.25, floor - 0.02, -0.1, 0.25, 0.9, 0.5],
    fallback: "seat",
    order: ["stick"],
    parts: [
      {
        name: "base",
        fn: rbox(0, floor + 0.06, z0 - 0.1, 0.17, 0.06, 0.15, 0.04),
        k: 0.02,
        paint: "seat",
      },
      {
        name: "back",
        fn: rbox(0, floor + 0.28, z0 - 0.24, 0.17, 0.22, 0.04, 0.05),
        k: 0.02,
        paint: "seat",
      },
      {
        name: "stick",
        fn: roundCone(0, floor, z0 + 0.2, 0, floor + 0.2, z0 + 0.17, 0.028),
        k: 0.02,
        paint: "stick",
      },
      {
        name: "knob",
        fn: ellipsoid(0, floor + 0.23, z0 + 0.165, 0.05, 0.04, 0.05),
        k: 0.02,
        paint: "stick",
      },
    ],
  };
  sculptInto(
    heli,
    seatSpec,
    { seat: [PAL.navy, "soft"], stick: [PAL.coral, "paint"] },
    { names: { seat: "helicopter seat", stick: "cyclic stick" } },
  );

  const skidSpec = {
    key: "heli/skids/v1",
    h: 0.03,
    bounds: [-0.55, 0.05, -0.75, 0.55, 0.6, 0.85],
    fallback: "skid",
    parts: [
      {
        name: "skid",
        fn: mirrorX(roundCone(0.4, 0.14, -0.55, 0.4, 0.14, 0.6, 0.038)),
        k: 0.02,
        paint: "skid",
      },
      {
        name: "toe",
        fn: mirrorX(roundCone(0.4, 0.14, 0.6, 0.4, 0.24, 0.72, 0.038, 0.034)),
        k: 0.02,
        paint: "skid",
      },
      {
        name: "front strut",
        fn: mirrorX(roundCone(0.4, 0.15, 0.3, 0.3, 0.36, 0.3, 0.032)),
        k: 0.02,
        paint: "skid",
      },
      {
        name: "rear strut",
        fn: mirrorX(roundCone(0.4, 0.15, -0.3, 0.3, 0.36, -0.3, 0.032)),
        k: 0.02,
        paint: "skid",
      },
    ],
  };
  sculptInto(
    heli,
    skidSpec,
    { skid: [PAL.navy, "soft"] },
    { names: { skid: "landing skids" } },
  );

  const rotor = new THREE.Group();
  rotor.name = "main rotor";
  rotor.position.set(0, 1.32, -0.12);
  heli.add(rotor);
  const bladeSpec = {
    key: "heli/blades/v1",
    h: 0.03,
    bounds: [-1.5, -0.08, -0.15, 1.5, 0.12, 0.15],
    fallback: "blade",
    order: ["tip", "cap"],
    parts: [
      {
        name: "blade",
        fn: rbox(0, 0, 0, 1.4, 0.022, 0.075, 0.02),
        k: 0.01,
        paint: "blade",
      },
      {
        name: "cap",
        fn: ellipsoid(0, 0.02, 0, 0.1, 0.06, 0.1),
        k: 0.02,
        paint: "cap",
      },
    ],
    decals: [{ id: "tip", region: "tip", g: (x) => 1.12 - Math.abs(x) }],
  };
  for (const angle of [0, Math.PI / 2]) {
    const pair = new THREE.Group();
    pair.rotation.y = angle;
    sculptInto(
      pair,
      bladeSpec,
      {
        blade: [PAL.navy, "soft"],
        tip: [PAL.gold, "soft"],
        cap: [PAL.gold, "paint"],
      },
      { names: { blade: "main rotor", tip: "rotor tip", cap: "rotor hub" } },
    );
    rotor.add(pair);
  }
  const tailRotor = new THREE.Group();
  tailRotor.name = "tail rotor";
  tailRotor.position.set(0.1, 0.98, -1.3);
  heli.add(tailRotor);
  for (const angle of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(
      new RoundedBoxGeometry(0.035, 0.56, 0.07, 2, 0.015),
      plainMaterial(PAL.cream, "soft"),
    );
    bar.name = "tail rotor";
    bar.rotation.x = angle;
    bar.castShadow = true;
    tailRotor.add(bar);
  }
  return { rotor, tailRotor, canopy, hullMeshes };
}

// ---------------------------------------------------------------------------
// Sailboat: a fat coral dinghy with a cream gunwale, a stubby mast and a
// billowing sail. The captain stands on the cockpit floor.

const BOAT_LIFT = 0.22;
export function buildBoat(root) {
  // The rig rides 0.22 above the boat origin so the cockpit floor sits at the
  // old deck height (0.5) and the water keeps the same line on the hull.
  const boat = new THREE.Group();
  boat.name = "boat rig";
  boat.position.y = BOAT_LIFT;
  root.add(boat);
  const y0 = SEAT.sailboat.position[1] - BOAT_LIFT;
  const mastZ = 0.3;
  const hullSpec = {
    key: "boat/hull/v2",
    h: 0.04,
    bounds: [-0.6, 0.0, -0.85, 0.6, 0.7, 0.95],
    fallback: "coral",
    order: ["cream"],
    parts: [
      {
        name: "bowl",
        fn: ellipsoid(0, 0.3, 0, 0.46, 0.25, 0.74),
        k: 0.06,
        paint: "coral",
      },
      {
        name: "stern",
        fn: rbox(0, 0.3, -0.5, 0.41, 0.2, 0.2, 0.1),
        k: 0.06,
        paint: "coral",
      },
      {
        name: "stem",
        fn: roundCone(0, 0.36, 0.55, 0, 0.5, 0.82, 0.08, 0.05),
        k: 0.05,
        paint: "coral",
      },
    ],
    carve: [{ fn: rbox(0, 0.56, -0.12, 0.34, 0.28, 0.62, 0.12), k: 0.05 }],
    decals: [{ id: "gunwale", region: "cream", g: (x, y) => 0.4 - y }],
  };
  const hull = sculptGroup(
    hullSpec,
    { coral: [PAL.coral, "paint"], cream: [PAL.cream, "paint"] },
    { name: "Boat hull", names: { coral: "boat hull", cream: "boat gunwale" } },
  );
  boat.add(hull);

  const fitSpec = {
    key: "boat/fittings/v2",
    h: 0.03,
    bounds: [-0.4, 0.2, -0.4, 0.4, 1.7, 0.45],
    fallback: "wood",
    parts: [
      {
        name: "mast",
        fn: roundCone(0, y0, mastZ, 0, 1.45, mastZ, 0.04, 0.032),
        k: 0.02,
        paint: "wood",
      },
      {
        name: "boom",
        fn: roundCone(0, 0.62, mastZ - 0.02, 0, 0.62, -0.2, 0.026),
        k: 0.02,
        paint: "wood",
      },
      {
        name: "mast step",
        fn: rbox(0, y0 + 0.03, mastZ, 0.09, 0.03, 0.09, 0.02),
        k: 0.02,
        paint: "wood",
      },
    ],
  };
  sculptInto(
    boat,
    fitSpec,
    { wood: [PAL.woodDark, "soft"] },
    { names: { wood: "mast and boom" } },
  );

  // Sail: a rounded triangle with real thickness, billowed away from the wind.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-0.48, 0);
  shape.quadraticCurveTo(-0.24, 0.46, 0, 0.8);
  shape.lineTo(0, 0);
  const sailGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 14,
  });
  sailGeometry.translate(0, 0, -0.015);
  sailGeometry.rotateY(-Math.PI / 2); // luff on the mast, foot running aft (-z)
  {
    const p = sailGeometry.attributes.position;
    const c = new Float32Array(p.count * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const bill = Math.sin((p.getY(i) / 0.8) * Math.PI) * 0.08;
      const along = Math.min(1, Math.abs(p.getZ(i)) / 0.48);
      p.setX(i, p.getX(i) + bill * along);
      const stripe = p.getY(i) > 0.28 && p.getY(i) < 0.44;
      tint
        .set(stripe ? PAL.coral : PAL.cream)
        .multiplyScalar(0.92 + 0.08 * (p.getY(i) / 0.8));
      tint.toArray(c, i * 3);
    }
    sailGeometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
    sailGeometry.computeVertexNormals();
  }
  const sail = new THREE.Mesh(
    sailGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      side: THREE.DoubleSide,
    }),
  );
  sail.name = "sail";
  sail.position.set(0, 0.64, mastZ - 0.02);
  sail.castShadow = true;
  boat.add(sail);

  const pennant = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.24, 3)
      .rotateZ(-Math.PI / 2)
      .translate(-0.12, 0, 0)
      .rotateY(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.6 }),
  );
  pennant.name = "boat pennant";
  pennant.position.set(0, 1.45, mastZ);
  boat.add(pennant);

  const tiller = new THREE.Group();
  tiller.name = "tiller";
  tiller.position.set(0.2, 0.5, -0.66);
  const bar = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.028, 0.3, 4, 8),
    plainMaterial(PAL.woodDark, "soft"),
  );
  bar.rotation.x = Math.PI / 2;
  bar.position.z = 0.15;
  bar.castShadow = true;
  tiller.add(bar);
  boat.add(tiller);

  const lifebuoy = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.035, 10, 20),
    new THREE.MeshStandardMaterial({ color: PAL.cream, roughness: 0.5 }),
  );
  lifebuoy.name = "boat life ring";
  lifebuoy.position.set(0.44, 0.4, -0.1);
  lifebuoy.rotation.y = Math.PI / 2;
  lifebuoy.castShadow = true;
  boat.add(lifebuoy);
  return { sail, pennant, tiller, rig: boat };
}

// ---------------------------------------------------------------------------
// Rocket skates: fat painted boots with roller wheels and rear turbines.

export function buildRocketSkates(root) {
  const bootSpec = {
    key: "skates/boots/v2",
    h: 0.022,
    bounds: [-0.25, 0.0, -0.45, 0.25, 0.3, 0.32],
    fallback: "boot",
    order: ["wheel", "turbine"],
    parts: [
      {
        name: "boot",
        fn: mirrorX(rbox(0.085, 0.11, 0.01, 0.08, 0.055, 0.15, 0.05)),
        k: 0.02,
        paint: "boot",
      },
      {
        name: "toe",
        fn: mirrorX(ellipsoid(0.085, 0.12, 0.14, 0.075, 0.055, 0.09)),
        k: 0.03,
        paint: "boot",
      },
      {
        name: "wheel front",
        fn: mirrorX(cylinder("x", 0.085, 0.06, 0.1, 0.06, 0.045, 0.02)),
        k: 0.01,
        paint: "wheel",
      },
      {
        name: "wheel back",
        fn: mirrorX(cylinder("x", 0.085, 0.06, -0.09, 0.06, 0.045, 0.02)),
        k: 0.01,
        paint: "wheel",
      },
      {
        name: "turbine",
        fn: mirrorX(
          roundCone(0.085, 0.13, -0.13, 0.085, 0.13, -0.34, 0.065, 0.085),
        ),
        k: 0.02,
        paint: "turbine",
      },
    ],
  };
  const exhaust = [];
  sculptInto(
    root,
    bootSpec,
    {
      boot: [PAL.gold, "paint"],
      wheel: [PAL.navy, "rubber"],
      turbine: [PAL.teal, "paint"],
    },
    {
      names: {
        boot: "Rocket skate titanium boot",
        wheel: "Rocket skate wheel",
        turbine: "Rocket skate turbine",
      },
    },
  );
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.5, 10),
      new THREE.MeshBasicMaterial({
        color: "#87e5f6",
        transparent: true,
        opacity: 0.8,
      }),
    );
    flame.name = "Rocket skate exhaust";
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(side * 0.085, 0.13, -0.58);
    root.add(flame);
    exhaust.push(flame);
  }
  return { exhaust };
}

// ---------------------------------------------------------------------------
// Jetpack and portal live in the courier's own units (the groups are scaled by
// the courier scale), so they are authored directly against the figurine.

export function buildJetpack(jetpack) {
  const spec = {
    key: "jetpack/body/v1",
    h: 0.022,
    bounds: [-0.42, 0.2, -0.8, 0.42, 1.1, -0.15],
    fallback: "tank",
    order: ["cap", "band", "nozzle"],
    parts: [
      {
        name: "tank",
        fn: mirrorX(roundCone(0.2, 0.54, -0.53, 0.2, 1.0, -0.53, 0.14)),
        k: 0.03,
        paint: "tank",
      },
      {
        name: "cap",
        fn: mirrorX(ellipsoid(0.2, 1.03, -0.53, 0.12, 0.08, 0.12)),
        k: 0.03,
        paint: "cap",
      },
      {
        name: "nozzle",
        fn: mirrorX(roundCone(0.2, 0.42, -0.53, 0.2, 0.55, -0.53, 0.09, 0.13)),
        k: 0.02,
        paint: "nozzle",
      },
      {
        name: "bridge",
        fn: rbox(0, 0.82, -0.43, 0.24, 0.07, 0.07, 0.04),
        k: 0.03,
        paint: "band",
      },
      {
        name: "bridge low",
        fn: rbox(0, 0.62, -0.43, 0.24, 0.06, 0.07, 0.04),
        k: 0.03,
        paint: "band",
      },
    ],
    decals: [
      { id: "stripe", region: "band", g: (x, y) => Math.abs(y - 0.76) - 0.04 },
    ],
  };
  sculptInto(
    jetpack,
    spec,
    {
      tank: [PAL.sky, "gloss"],
      cap: [PAL.gold, "paint"],
      nozzle: [PAL.navy, "soft"],
      band: [PAL.coral, "paint"],
    },
    {
      names: {
        tank: "Jetpack turbine",
        cap: "Jetpack cap",
        nozzle: "Jetpack nozzle",
        band: "Jetpack band",
      },
    },
  );
  const flames = [];
  for (const side of [-1, 1]) {
    // A glowing charge lens on each tank; the night lighting picks it up.
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 8),
      new THREE.MeshStandardMaterial({
        color: "#8fe3d2",
        emissive: "#76f1db",
        emissiveIntensity: 0.4,
        roughness: 0.3,
      }),
    );
    lens.name = "Jetpack charge indicator";
    lens.userData.glowColor = "#76f1db";
    lens.userData.glowIntensity = 1.2;
    lens.position.set(side * 0.335, 0.76, -0.53);
    lens.scale.set(0.6, 1.4, 1);
    jetpack.add(lens);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.62, 10),
      new THREE.MeshBasicMaterial({
        color: "#79edff",
        transparent: true,
        opacity: 0.8,
      }),
    );
    flame.name = "Jetpack exhaust";
    flame.rotation.z = Math.PI;
    flame.position.set(side * 0.2, 0.1, -0.53);
    jetpack.add(flame);
    flames.push(flame);
  }
  return { flames };
}

export function buildPortal(teleporter) {
  // A flat rounded disc does not need a sculpt: one lathe profile.
  const profile = [
    [0, 0],
    [0.8, 0],
    [0.86, 0.03],
    [0.88, 0.09],
    [0.85, 0.17],
    [0.78, 0.19],
    [0, 0.19],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const pad = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 40),
    plainMaterial("#635576", "paint"),
  );
  pad.name = "Teleport landing disc";
  pad.castShadow = pad.receiveShadow = true;
  teleporter.add(pad);
  const glyph = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: "#77e8d9",
      emissive: "#3fc9b8",
      emissiveIntensity: 0.5,
      roughness: 0.3,
    }),
  );
  glyph.name = "Portal glyph";
  glyph.position.y = 0.195;
  teleporter.add(glyph);
  const postSpec = {
    key: "portal/posts/v1",
    h: 0.025,
    bounds: [-1.0, 0.0, -0.2, 1.0, 0.7, 0.2],
    fallback: "post",
    order: ["orb"],
    parts: [
      {
        name: "post",
        fn: mirrorX(roundCone(0.9, 0.12, 0, 0.9, 0.5, 0, 0.085, 0.07)),
        k: 0.03,
        paint: "post",
      },
      {
        name: "orb",
        fn: mirrorX(ellipsoid(0.9, 0.6, 0, 0.12, 0.12, 0.12)),
        k: 0.03,
        paint: "orb",
      },
    ],
  };
  sculptInto(
    teleporter,
    postSpec,
    { post: [PAL.gold, "paint"], orb: ["#77e8d9", "gloss"] },
    { names: { post: "Portal posts", orb: "Portal orbs" } },
  );
  const rings = [];
  for (const [radius, tube, color] of [
    [0.92, 0.07, "#bfa3ff"],
    [0.72, 0.055, "#77e8d9"],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 10, 44),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    );
    ring.position.y = 1;
    teleporter.add(ring);
    rings.push(ring);
  }
  return { rings };
}

/**
 * Slide each pedal plate under the matching sole. The pedaling pose is a
 * shallow arc, so the plates follow the live skeleton instead of a crank
 * circle the legs cannot reach.
 */
const _foot = new THREE.Vector3();
export function placePedals(root) {
  root.updateWorldMatrix(true, true);
  for (const side of ["left", "right"]) {
    const plate = root.getObjectByName(`Pedal plate ${side}`);
    const knee = root.getObjectByName(`${side} leg`)?.getObjectByName("knee");
    if (!plate || !knee) continue;
    knee.localToWorld(_foot.set(0, -0.236, 0.06));
    root.worldToLocal(_foot);
    plate.position.set(_foot.x, _foot.y - 0.016, _foot.z);
  }
}
