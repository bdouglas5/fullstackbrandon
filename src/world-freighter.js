import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// The supplier freighter: a real container ship (about three times the size of
// the old barge) with a pointed bow, bridge house, funnel, stacked containers
// and a deck crane that swings crates onto the harbor pier.
//
// Local frame: bow points -Z, the pier side is +X, y = 0 is the waterline
// reference used by the scene (the group sits at y = -0.63). The crane hook
// reaches HOOK_X from the mast, so with the ship berthed 0.45 off the pier it
// lands over the crate stack on the pier.
export const FREIGHTER = Object.freeze({
  length: 9.6,
  beam: 3.4,
  deck: 1.2,
  craneAt: [1.5, -2.7],
  hookReach: 1.45,
  mastHeight: 2.4,
  // Hook travel (cable length below the boom) for each stage of the cycle.
  carryDrop: 0.25,
  shipDrop: 1.38,
  pierDrop: 2.15,
});

const materials = new Map();
const mat = (color) => {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
    );
  return materials.get(color);
};
const geometries = new Map();
function slab(w, h, d) {
  const key = [w, h, d].join();
  if (!geometries.has(key))
    geometries.set(
      key,
      new RoundedBoxGeometry(w, h, d, 1, Math.min(0.05, w / 4, h / 4, d / 4)),
    );
  return geometries.get(key);
}
function box(parent, name, position, size, color) {
  const mesh = new THREE.Mesh(slab(...size), mat(color));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, name, position, rTop, rBottom, height, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, height, 14),
    mat(color),
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Plan-view hull outline (x across, y = world z), bow at -z.
function hullShape(inset = 0) {
  const half = FREIGHTER.beam / 2 - inset,
    stern = FREIGHTER.length / 2 - inset,
    bow = -(FREIGHTER.length / 2) + inset * 1.5,
    shoulder = -1.5 + inset;
  const shape = new THREE.Shape();
  shape.moveTo(-half + 0.25, stern);
  shape.lineTo(half - 0.25, stern);
  shape.quadraticCurveTo(half, stern, half, stern - 0.25);
  shape.lineTo(half, shoulder);
  shape.quadraticCurveTo(half - 0.1, bow + 1.3, 0.12, bow);
  shape.lineTo(-0.12, bow);
  shape.quadraticCurveTo(-half + 0.1, bow + 1.3, -half, shoulder);
  shape.lineTo(-half, stern - 0.25);
  shape.quadraticCurveTo(-half, stern, -half + 0.25, stern);
  return shape;
}
function hullPiece(parent, name, inset, bottom, top, color, bevel = 0.07) {
  const geometry = new THREE.ExtrudeGeometry(hullShape(inset), {
    depth: top - bottom,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  // Shape y becomes +z; the extrusion runs downward from `top`.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, top, 0);
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const CONTAINER_COLORS = [
  "#c9553f",
  "#e3b451",
  "#92a77c",
  "#cf9367",
  "#5f8f9b",
  "#e7e0cb",
  "#7d6f9c",
];

/** Build the ship into `root` (a group) and return the parts that animate. */
export function buildFreighter(root) {
  const deck = FREIGHTER.deck;
  // Hull: brick-red underbody, teal topsides, cream rail, plank deck.
  hullPiece(root, "Supplier cargo hull underbody", 0.04, -0.45, 0.5, "#b4503f");
  hullPiece(root, "Supplier cargo hull", 0, 0.45, deck - 0.1, "#3f6b75");
  hullPiece(root, "Supplier hull rail", 0, deck - 0.1, deck, "#efe5cb", 0.03);
  hullPiece(
    root,
    "Supplier deck planking",
    0.17,
    deck,
    deck + 0.04,
    "#b79468",
    0.01,
  );
  // Accommodation block aft with wheelhouse, funnel and radar.
  box(
    root,
    "Supplier bridge deck house",
    [0, deck + 0.45, 3.85],
    [2.5, 0.9, 1.5],
    "#efe5cb",
  );
  box(
    root,
    "Supplier bridge upper house",
    [0, deck + 1.3, 3.95],
    [2.1, 0.8, 1.1],
    "#f4ecd6",
  );
  box(
    root,
    "Supplier wheelhouse windows",
    [0, deck + 1.38, 3.39],
    [1.75, 0.3, 0.04],
    "#6f9aa6",
  );
  box(
    root,
    "Supplier wheelhouse wings",
    [0, deck + 1.18, 3.62],
    [2.7, 0.06, 0.4],
    "#d8c9a6",
  );
  box(
    root,
    "Supplier bridge roof",
    [0, deck + 1.74, 3.95],
    [2.3, 0.1, 1.3],
    "#263e4e",
  );
  for (const x of [-0.8, 0, 0.8])
    box(
      root,
      "Supplier house window",
      [x, deck + 0.55, 3.09],
      [0.42, 0.28, 0.04],
      "#6f9aa6",
    );
  cylinder(
    root,
    "Supplier funnel",
    [0, deck + 2.2, 4.25],
    0.26,
    0.34,
    0.8,
    "#c9553f",
  );
  cylinder(
    root,
    "Supplier funnel band",
    [0, deck + 2.3, 4.25],
    0.3,
    0.35,
    0.18,
    "#efe5cb",
  );
  cylinder(
    root,
    "Supplier funnel cap",
    [0, deck + 2.62, 4.25],
    0.27,
    0.27,
    0.06,
    "#263e4e",
  );
  cylinder(
    root,
    "Supplier radar mast",
    [0, deck + 2.1, 3.55],
    0.03,
    0.04,
    0.7,
    "#d8c9a6",
  );
  box(
    root,
    "Supplier radar bar",
    [0, deck + 2.5, 3.55],
    [0.7, 0.05, 0.08],
    "#263e4e",
  );
  // Bow mooring winch and a flag mast.
  cylinder(
    root,
    "Supplier mooring winch",
    [0, deck + 0.14, -3.9],
    0.22,
    0.22,
    0.24,
    "#e3b451",
  );
  cylinder(
    root,
    "Supplier ensign pole",
    [0, deck + 0.55, -4.25],
    0.025,
    0.03,
    0.9,
    "#d8c9a6",
  );
  box(
    root,
    "Supplier ensign",
    [0.22, deck + 0.85, -4.25],
    [0.4, 0.22, 0.02],
    "#ed8970",
  );

  // Container stacks in two bays.
  let k = 0;
  const bays = [
    { z: -0.55, heights: [2, 2, 2] },
    { z: 1.55, heights: [2, 3, 2] },
  ];
  for (const bay of bays)
    bay.heights.forEach((stack, col) => {
      for (let level = 0; level < stack; level++)
        box(
          root,
          "Shipment sealed container",
          [(col - 1) * 0.94, deck + 0.04 + 0.25 + level * 0.5, bay.z],
          [0.88, 0.48, 1.8],
          CONTAINER_COLORS[k++ % CONTAINER_COLORS.length],
        );
    });

  // The pile the crane pulls crates from, forward of the bays.
  const [craneX, craneZ] = FREIGHTER.craneAt;
  const pileX = craneX - FREIGHTER.hookReach;
  for (const [i, dx] of [-0.5, 0, 0.5].entries())
    box(
      root,
      "Supplier deck crate",
      [pileX + dx, deck + 0.29, craneZ],
      [0.46, 0.46, 0.46],
      i === 1 ? "#92a77c" : "#c79761",
    );

  // Deck crane with its slewing jib.
  const crane = new THREE.Group();
  crane.name = "Supplier unloading crane";
  crane.position.set(craneX, deck, craneZ);
  root.add(crane);
  box(crane, "Cargo crane plinth", [0, 0.1, 0], [0.7, 0.2, 0.7], "#d8c9a6");
  box(
    crane,
    "Cargo crane mast",
    [0, 1.2, 0],
    [0.28, FREIGHTER.mastHeight, 0.28],
    "#e3b451",
  );
  box(crane, "Cargo crane cab", [0.1, 1.9, 0.2], [0.34, 0.36, 0.3], "#efe5cb");
  const jib = new THREE.Group();
  jib.name = "Cargo crane slewing arm";
  jib.position.set(0, FREIGHTER.mastHeight, 0);
  crane.add(jib);
  const reach = FREIGHTER.hookReach;
  box(jib, "Cargo crane boom", [1.1, 0, 0], [2.9, 0.14, 0.14], "#ecc35b");
  box(
    jib,
    "Cargo crane counterweight",
    [-0.55, -0.05, 0],
    [0.34, 0.3, 0.3],
    "#596869",
  );
  const cable = cylinder(
    jib,
    "Cargo hoist cable",
    [reach, -0.5, 0],
    0.016,
    0.016,
    1,
    "#596869",
  );
  const crate = box(
    jib,
    "Hoisted pickle crate",
    [reach, -1, 0],
    [0.5, 0.5, 0.5],
    "#c38d55",
  );
  box(crate, "Hoisted crate strap", [0, 0, 0], [0.52, 0.08, 0.52], "#efe5cb");
  box(crate, "Hoisted crate strap", [0, 0, 0], [0.08, 0.52, 0.52], "#efe5cb");
  return { crane, jib, cable, crate };
}

const clamp = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Where crate `i` rests on the pier: one row along the pier, west edge. */
export const CRATE_SLOTS = 6;
export const crateSlot = (i) => [-5.55, 0.57, 12.9 + 0.44 * i];

/**
 * Pose the crane for a point `u` (0..1) in one unload cycle: pick a crate from
 * the deck pile, swing it over `slot` (crane-local {x, z} of where it lands),
 * set it down, then swing back. The hook rides along the boom, so any slot in
 * reach works. Returns the hook state: whether a crate hangs from it and
 * whether that crate has been set down.
 */
export function poseCrane(parts, u, working, slot = null) {
  const { carryDrop, shipDrop, pierDrop, hookReach, craneAt } = FREIGHTER;
  const target = slot
    ? {
        r: Math.hypot(slot.x - craneAt[0], slot.z - craneAt[1]),
        theta: Math.atan2(-(slot.z - craneAt[1]), slot.x - craneAt[0]),
      }
    : { r: hookReach, theta: 0 };
  // Always swing the short way round from the deck pile (theta = PI).
  const pile = { r: hookReach, theta: Math.PI };
  let theta = pile.theta,
    reach = pile.r,
    drop = carryDrop,
    held = false,
    placed = false;
  const swing = (t) => {
    theta = lerp(pile.theta, target.theta, t);
    reach = lerp(pile.r, target.r, t);
  };
  if (working) {
    if (u < 0.12) {
      drop = lerp(carryDrop, shipDrop, smooth(u / 0.12));
      held = u > 0.08;
    } else if (u < 0.22) {
      drop = lerp(shipDrop, carryDrop, smooth((u - 0.12) / 0.1));
      held = true;
    } else if (u < 0.52) {
      swing(smooth((u - 0.22) / 0.3));
      held = true;
    } else if (u < 0.66) {
      swing(1);
      drop = lerp(carryDrop, pierDrop, smooth((u - 0.52) / 0.14));
      held = true;
    } else if (u < 0.74) {
      swing(1);
      drop = pierDrop;
      placed = true;
    } else if (u < 0.84) {
      swing(1);
      drop = lerp(pierDrop, carryDrop, smooth((u - 0.74) / 0.1));
      placed = true;
    } else {
      swing(1 - smooth((u - 0.84) / 0.16));
      placed = true;
    }
  }
  parts.jib.rotation.y = theta;
  parts.cable.position.set(reach, -drop / 2, 0);
  parts.cable.scale.y = Math.max(0.01, drop);
  parts.crate.position.set(reach, -drop - 0.25, 0);
  parts.crate.visible = held && !slot;
  return { held, placed, reach, drop };
}

/**
 * Give the ship its own materials so it can dissolve into the sea fog. The
 * returned function takes 0 (gone in the haze) to 1 (solid and in colour).
 */
export function createFogFade(root) {
  const own = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!own.has(o.material))
      own.set(o.material, {
        material: o.material.clone(),
        base: o.material.color.clone(),
      });
    o.material = own.get(o.material).material;
  });
  const fog = new THREE.Color("#cfe4ea");
  return (f) => {
    for (const { material, base } of own.values()) {
      material.transparent = f < 0.995;
      material.opacity = f;
      material.depthWrite = f > 0.6;
      material.color.copy(base).lerp(fog, (1 - f) * 0.6);
    }
  };
}
