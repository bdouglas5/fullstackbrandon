import * as THREE from "three";
import { BEACH, beachHours, loungerFeet } from "../shared/beach.js";

// The weekend cove: static beach furniture plus the choreography that sends
// Brandon and the neighbours down to the sand on weekend days.

const COLORS = {
  coral: "#e58f70",
  teal: "#5f9b91",
  cream: "#f6ecd3",
  sky: "#8fc6d1",
  gold: "#e6bd64",
  wood: "#b98d5b",
  driftwood: "#d9c29a",
  navy: "#2f4e6b",
  rose: "#d98b9b",
};
const TOP = BEACH.top;
const FADE = 0.35;
const LIE_TILT = 0.42;
// Body origin sits at the feet; this lifts them onto the lounger cushion.
const LOUNGER_HEIGHT = 0.27;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createBeachWorld(w) {
  const root = new THREE.Group();
  root.name = "Weekend beach cove";
  w.world.add(root);
  const materials = new Map();
  const mat = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
      );
    return materials.get(color);
  };
  const part = (parent, geometry, color, [x, y, z], rotation) => {
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x, y, z);
    if (rotation) m.rotation.set(...rotation);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (parent, size, color, position, rotation) =>
    part(parent, new THREE.BoxGeometry(...size), color, position, rotation);
  const cyl = (parent, r0, r1, h, color, position, sides = 10) =>
    part(parent, new THREE.CylinderGeometry(r0, r1, h, sides), color, position);
  const place = (name, x, z, yaw = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, TOP, z);
    g.rotation.y = yaw;
    root.add(g);
    return g;
  };

  // Planks lead from the road end to the sand so Brandon's walk has a path.
  const boardwalk = place("Beach boardwalk", -10.7, BEACH.door[1]);
  for (let i = 0; i < 9; i++)
    box(
      boardwalk,
      [0.17, 0.035, 0.74],
      i % 2 ? COLORS.wood : COLORS.driftwood,
      [-1.3 + i * 0.3 + 0.16, 0.012, 0],
    );
  for (const side of [-0.38, 0.38])
    box(boardwalk, [2.75, 0.03, 0.05], COLORS.wood, [0.05, 0.0, side]);

  // Loungers lie along x with the head to the east, facing the sea.
  const lounger = (name, x, z, towel) => {
    const g = place(name, x, z);
    box(g, [1.18, 0.05, 0.44], COLORS.cream, [0, 0.2, 0]);
    box(g, [1.0, 0.018, 0.4], towel, [-0.05, 0.235, 0]);
    box(g, [0.52, 0.05, 0.44], COLORS.cream, [0.47, 0.3, 0], [0, 0, 0.5]);
    box(g, [0.46, 0.018, 0.4], towel, [0.47, 0.335, 0], [0, 0, 0.5]);
    for (const dx of [-0.5, 0.2])
      for (const dz of [-0.17, 0.17])
        cyl(g, 0.025, 0.025, 0.18, COLORS.wood, [dx, 0.09, dz], 6);
    return g;
  };
  const towels = [COLORS.coral, COLORS.teal, COLORS.gold, COLORS.rose];
  lounger("Brandon's lounge chair", ...BEACH.brandon.lounger, COLORS.sky);
  BEACH.loungers.forEach(([x, z], i) =>
    lounger("Beach lounge chair", x, z, towels[i % towels.length]),
  );

  // Striped umbrellas shade the loungers.
  const umbrella = (x, z, color) => {
    const g = place("Beach umbrella", x, z);
    cyl(g, 0.025, 0.025, 1.55, COLORS.cream, [0, 0.77, 0], 6);
    const canopy = part(
      g,
      new THREE.ConeGeometry(0.85, 0.34, 12),
      color,
      [0, 1.5, 0],
    );
    canopy.scale.y = 0.85;
    part(g, new THREE.SphereGeometry(0.05, 8, 6), COLORS.cream, [0, 1.7, 0]);
    // A lighter band so the canopy reads as striped at toy scale.
    part(
      g,
      new THREE.TorusGeometry(0.58, 0.035, 5, 18),
      COLORS.cream,
      [0, 1.38, 0],
      [Math.PI / 2, 0, 0],
    );
  };
  umbrella(
    BEACH.brandon.lounger[0] + 0.85,
    BEACH.brandon.lounger[1] - 0.5,
    COLORS.coral,
  );
  umbrella(-12.1, -6.5, COLORS.teal);
  umbrella(-12.1, -2.3, COLORS.gold);

  // Cabanas: four posts, a pyramid roof and a daybed to flop onto.
  for (const [x, z] of BEACH.cabanas) {
    const g = place("Beach cabana", x, z);
    for (const dx of [-0.8, 0.8])
      for (const dz of [-0.8, 0.8])
        cyl(g, 0.045, 0.045, 1.5, COLORS.cream, [dx, 0.75, dz], 6);
    const roof = part(
      g,
      new THREE.ConeGeometry(1.35, 0.62, 4),
      COLORS.coral,
      [0, 1.8, 0],
      [0, Math.PI / 4, 0],
    );
    roof.name = "Cabana roof";
    box(g, [1.8, 0.1, 1.8], COLORS.cream, [0, 1.47, 0]);
    box(g, [1.2, 0.18, 0.8], COLORS.cream, [0, 0.22, -0.1]);
    box(g, [1.12, 0.1, 0.72], COLORS.sky, [0, 0.36, -0.1]);
    box(g, [0.5, 0.35, 0.05], COLORS.teal, [-0.45, 0.62, -0.5], [0.2, 0, 0]);
    cyl(g, 0.11, 0.11, 0.3, COLORS.wood, [0.65, 0.15, 0.5], 8);
  }

  // Small props: cooler, surfboards, beach ball, sandcastle, tiki torches.
  const cooler = place("Beach cooler", -11.35, -6.5, 0.4);
  box(cooler, [0.42, 0.26, 0.28], COLORS.teal, [0, 0.13, 0]);
  box(cooler, [0.44, 0.05, 0.3], COLORS.cream, [0, 0.28, 0]);
  const boards = place("Surfboard rack", -15.3, -2.8);
  for (const [i, color] of [COLORS.coral, COLORS.gold, COLORS.sky].entries()) {
    const board = part(
      boards,
      new THREE.CapsuleGeometry(0.1, 0.9, 4, 10),
      color,
      [0, 0.55, i * 0.28],
      [0, 0, 0.12],
    );
    board.scale.z = 0.35;
  }
  const ball = place("Beach ball", -13.7, -5.6);
  part(
    ball,
    new THREE.SphereGeometry(0.15, 14, 10),
    COLORS.coral,
    [0, 0.15, 0],
  );
  part(
    ball,
    new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI),
    COLORS.cream,
    [0, 0.15, 0],
  );
  const castle = place("Sandcastle", -14.9, -6.3);
  cyl(castle, 0.26, 0.32, 0.22, COLORS.driftwood, [0, 0.11, 0], 8);
  cyl(castle, 0.1, 0.12, 0.22, COLORS.driftwood, [0, 0.33, 0], 8);
  for (const dz of [-0.4, 0.4])
    cyl(castle, 0.07, 0.09, 0.2, COLORS.driftwood, [0.2, 0.1, dz], 8);
  for (const [x, z] of [
    [-11.2, -8.4],
    [-11.2, -0.2],
    [-15.2, -4.4],
  ]) {
    const torch = place("Tiki torch", x, z);
    cyl(torch, 0.03, 0.04, 1.0, COLORS.wood, [0, 0.5, 0], 6);
    cyl(torch, 0.07, 0.05, 0.14, COLORS.navy, [0, 1.06, 0], 8);
    part(
      torch,
      new THREE.SphereGeometry(0.075, 8, 6),
      COLORS.gold,
      [0, 1.17, 0],
    );
  }

  // --- Dynamic: Brandon's drowsy "z z z" drifting up from the lounger.
  const dynamic = new THREE.Group();
  dynamic.name = "Beach Zzz";
  dynamic.userData.dynamic = true;
  w.world.add(dynamic);
  const zeds = [];
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const g = canvas.getContext("2d");
    if (g) {
      g.font = "bold 46px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 6;
      g.strokeStyle = "rgba(47,78,107,0.9)";
      g.strokeText("z", 32, 34);
      g.fillStyle = "#ffffff";
      g.fillText("z", 32, 34);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      for (let i = 0; i < 3; i++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
          }),
        );
        sprite.visible = false;
        dynamic.add(sprite);
        zeds.push(sprite);
      }
    }
  }

  let lie = 0;
  const feet = loungerFeet(0);
  return {
    root,
    // Brandon lies back, feet to the sea. Returns the current lie weight.
    lounge(brandon, motion, active, dt, time, reducedMotion) {
      const goal = active ? 1 : 0;
      lie = reducedMotion
        ? goal
        : THREE.MathUtils.damp(lie, goal, 3.2, Math.min(dt, 0.1));
      if (Math.abs(lie - goal) < 0.002) lie = goal;
      brandon.rotation.order = "YXZ";
      brandon.rotation.x = -(Math.PI / 2 - LIE_TILT) * lie;
      if (lie > 0) {
        const ease = lie * lie * (3 - 2 * lie);
        brandon.position.x += (feet[0] - brandon.position.x) * ease;
        brandon.position.z += (feet[1] - brandon.position.z) * ease;
        brandon.position.y +=
          (TOP + LOUNGER_HEIGHT - brandon.position.y) * ease;
        brandon.rotation.y += (BEACH.seaFacing - brandon.rotation.y) * ease;
      }
      zeds.forEach((sprite, i) => {
        const u = reducedMotion ? 0.5 : (time * 0.28 + i / zeds.length) % 1;
        sprite.visible = lie > 0.95;
        sprite.position.set(
          feet[0] + 0.85 + u * 0.35,
          TOP + 0.75 + u * 0.75,
          feet[1] + Math.sin(u * 5 + i) * 0.08,
        );
        sprite.scale.setScalar(0.16 + u * 0.14);
        sprite.material.opacity = Math.sin(Math.PI * u) * 0.95;
      });
      return lie;
    },
  };
}

// Is it beach time for the neighbours? Weekend days, mid-morning to sunset.
export function residentsAtBeach(state) {
  return !!state.schedule?.isWeekend && beachHours(state.world?.hour ?? 12);
}

// Shrink out of sight, jump to the other place, and grow back, so the
// neighbours never slide through buildings on their way to the sand.
// Returns where the person currently is: true when on the beach.
export function beachShuffle(person, wantBeach, dt, reducedMotion) {
  const d = (person.userData.beach ||= {
    at: false,
    fade: 1,
    base: person.scale.x || 1,
  });
  if (reducedMotion) {
    d.at = wantBeach;
    d.fade = 1;
  } else if (wantBeach !== d.at) {
    d.fade -= Math.min(dt, 0.1) / FADE;
    if (d.fade <= 0) {
      d.at = wantBeach;
      d.fade = 0;
    }
  } else d.fade = clamp01(d.fade + Math.min(dt, 0.1) / FADE);
  const scale = d.base * Math.max(0.001, d.fade * d.fade * (3 - 2 * d.fade));
  person.scale.setScalar(scale);
  return d.at;
}

// Who lies on a lounger and who chats on their feet.
export function residentSlot(k) {
  if (k % 2 === 0) {
    const lounger = Math.floor(k / 2);
    if (lounger < BEACH.loungers.length)
      return { kind: "lie", index: lounger + 1 };
  }
  return { kind: "stand", index: k % BEACH.stands.length };
}

// Lay a person on lounger `index` (1-based; 0 is Brandon's), face up.
export function lieOnLounger(person, index) {
  const [x, z] = loungerFeet(index);
  person.rotation.order = "YXZ";
  person.position.set(x, TOP + LOUNGER_HEIGHT, z);
  person.rotation.x = -(Math.PI / 2 - LIE_TILT);
  person.rotation.y = BEACH.seaFacing;
}

export function standOnSand(person, index, lookAt = BEACH.seaFacing) {
  const [x, z] = BEACH.stands[index];
  person.rotation.order = "YXZ";
  person.rotation.x = 0;
  person.position.set(x, TOP + 0.03, z);
  person.rotation.y = lookAt;
}
