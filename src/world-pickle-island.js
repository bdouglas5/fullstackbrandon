import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FARM, FARM_ISLAND } from "../shared/islands.js";
import { shoreSkirt } from "./world-water.js";

/**
 * Pickle Cay, the private island Cay Construction builds for Brandon.
 *
 * One plan, drawn once. Every part answers to the island's four routes:
 *
 *   north  the harbor bridge lands on a timber gate pier; a welcome arch marks
 *          the way on to the island
 *   centre a paved lane runs south, past the pickle works and the walled
 *          garden, down to the quay
 *   west   the pickle works: a sawtooth-roofed production hall with its
 *          fermentation tanks behind and a loading dock on the lane
 *   east   the walled kitchen garden and its glasshouse
 *   south  the quay, where the supplier freighter ties up alongside and its
 *          crane sets the crates down on the receiving pallets
 *
 * Coordinates are local to the estate group (the island's orchard centre,
 * `FARM`): +x east, +z south, ground level y = 0.43.
 */
export const GROUND = 0.43;
const SAND = "#ecd3a0";
const C = {
  cream: "#fff2d8",
  walls: "#d79672",
  wallsDark: "#f3e3c3",
  teal: "#216f75",
  tealRoof: "#2f7874",
  coral: "#ed8970",
  gold: "#f8cb68",
  navy: "#263e4e",
  wood: "#967054",
  woodDark: "#7a5a42",
  plank: "#c9976d",
  stone: "#cfc7b2",
  stoneDark: "#a99f8c",
  brick: "#c0644a",
  rock: "#a98563",
  rockDark: "#8f6d51",
  grass: "#86bd5e",
  leaf: "#497c61",
  steel: "#9cad9e",
  pipe: "#c0c6b7",
  soil: "#6b4e3a",
};

// ---------------------------------------------------------------- toolkit --
const materials = new Map();
export function mat(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...options }),
    );
  return materials.get(key);
}
const geometries = new Map();
function cached(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}
function place(mesh, parent, name, position, options = {}) {
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function box(parent, name, position, size, color, options = {}) {
  const bevel =
    options.bevel ?? Math.min(0.03, size[0] / 4, size[1] / 4, size[2] / 4);
  const geometry = cached(
    `box/${size.join()}/${bevel}`,
    () => new RoundedBoxGeometry(...size, 1, bevel),
  );
  return place(
    new THREE.Mesh(geometry, options.material || mat(color)),
    parent,
    name,
    position,
    options,
  );
}
export function cyl(
  parent,
  name,
  position,
  rTop,
  rBottom,
  height,
  color,
  options = {},
) {
  const segments = options.segments ?? 14;
  const geometry = cached(
    `cyl/${rTop}/${rBottom}/${height}/${segments}`,
    () => new THREE.CylinderGeometry(rTop, rBottom, height, segments),
  );
  return place(
    new THREE.Mesh(geometry, options.material || mat(color)),
    parent,
    name,
    position,
    options,
  );
}
export function ball(parent, name, position, radius, color, options = {}) {
  const geometry = cached("ball", () => new THREE.SphereGeometry(1, 14, 10));
  const mesh = place(
    new THREE.Mesh(geometry, options.material || mat(color)),
    parent,
    name,
    position,
    options,
  );
  const [sx, sy, sz] = options.scale || [1, 1, 1];
  mesh.scale.set(radius * sx, radius * sy, radius * sz);
  return mesh;
}
export function cone(parent, name, position, radius, height, color, options) {
  return cyl(parent, name, position, 0, radius, height, color, options);
}
export function group(parent, name, position = [0, 0, 0]) {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(...position);
  node.userData.dynamic = true;
  parent.add(node);
  return node;
}
/** Many copies of one shape as a single draw: pickets, planks, flowers. */
function instances(parent, name, geometry, items, options = {}) {
  const mesh = new THREE.InstancedMesh(
    geometry,
    options.material || mat("#ffffff"),
    items.length,
  );
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3(),
    color = new THREE.Color();
  items.forEach((item, i) => {
    e.set(0, item.rotY || 0, item.rotZ || 0);
    q.setFromEuler(e);
    const scale = item.scale ?? 1;
    if (Array.isArray(scale)) s.set(...scale);
    else s.setScalar(scale);
    p.set(...item.at);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (item.color) mesh.setColorAt(i, color.set(item.color));
  });
  mesh.name = name;
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}
const unitBox = () =>
  cached("unit/box", () => new RoundedBoxGeometry(1, 1, 1, 1, 0.12));
const unitBall = () =>
  cached("unit/ball", () => new THREE.SphereGeometry(1, 10, 7));
const unitCone = () =>
  cached("unit/cone", () => new THREE.ConeGeometry(1, 1, 8));

const glassMaterial = new THREE.MeshStandardMaterial({
  color: "#b4dcd3",
  transparent: true,
  opacity: 0.26,
  roughness: 0.08,
  depthWrite: false,
});
const frameMaterial = mat("#eef3e6");

export function signLabel(parent, words, position, width, rotationY = 0) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff3d7";
  ctx.fillRect(0, 0, 768, 160);
  ctx.strokeStyle = "#245657";
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 748, 140);
  ctx.fillStyle = "#245657";
  ctx.font = "bold 50px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(words, 384, 82, 700);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4.8),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
  sign.name = words;
  sign.position.set(...position);
  sign.rotation.y = rotationY;
  parent.add(sign);
  return sign;
}

function lamp(parent, x, z, height = 1.45) {
  const post = group(parent, "Island lamp post", [x, GROUND, z]);
  cyl(post, "Lamp post base", [0, 0.09, 0], 0.1, 0.13, 0.18, C.navy);
  cyl(post, "Lamp post", [0, height / 2, 0], 0.035, 0.05, height, C.navy);
  box(
    post,
    "Lamp post arm",
    [0.06, height - 0.02, 0],
    [0.2, 0.04, 0.04],
    C.navy,
  );
  box(post, "Lamp cap", [0.12, height + 0.2, 0], [0.22, 0.05, 0.22], C.navy);
  const glass = box(
    post,
    "Island warm lantern",
    [0.12, height + 0.08, 0],
    [0.16, 0.2, 0.16],
    C.gold,
    { material: mat(C.gold, { emissive: "#000000" }) },
  );
  glass.castShadow = false;
  return post;
}

// ------------------------------------------------------------------- land --
function roundedShape(cx, cz, hx, hz, r) {
  const s = new THREE.Shape(),
    x0 = cx - hx,
    x1 = cx + hx,
    z0 = cz - hz,
    z1 = cz + hz;
  s.moveTo(x0 + r, z0);
  s.lineTo(x1 - r, z0);
  s.absarc(x1 - r, z0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, z1 - r);
  s.absarc(x1 - r, z1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, z1);
  s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, z0 + r);
  s.absarc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function slab(parent, name, color, inset, top, bottom, bevel = 0) {
  const { hx, hz, r } = LOCAL_SHORE;
  const shape = roundedShape(
    0,
    LOCAL_SHORE.z,
    hx - inset - bevel,
    hz - inset - bevel,
    Math.max(0.2, r - inset - bevel),
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: top - bottom - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
  });
  // The shape's y becomes world z; the extrusion runs down from the top.
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.translate(0, top - geometry.boundingBox.max.y, 0);
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
// The island is a rounded rectangle, exactly like the sea sees it.
const LOCAL_SHORE = Object.freeze({
  ...FARM_ISLAND,
  x: 0,
  z: FARM_ISLAND.z - FARM.z,
});
export const ISLAND_BOUNDS = Object.freeze({
  west: LOCAL_SHORE.x - LOCAL_SHORE.hx,
  east: LOCAL_SHORE.x + LOCAL_SHORE.hx,
  north: LOCAL_SHORE.z - LOCAL_SHORE.hz,
  south: LOCAL_SHORE.z + LOCAL_SHORE.hz,
});
const QUAY = ISLAND_BOUNDS.south;

function buildLand(estate, world) {
  const land = group(estate, "Contractor reclaimed island");
  slab(land, "Pickle Cay bedrock", C.rockDark, 0.25, 0.0, -1.55);
  slab(land, "Pickle Cay sandstone ledge", C.rock, 0.1, -0.5, -0.95);
  slab(land, "Pickle Cay sandstone", C.rock, 0.12, 0.14, -0.55);
  slab(land, "Reclaimed island beach", SAND, 0, 0.18, 0.02);
  slab(land, "Island garden lawn", C.grass, 0.78, GROUND, 0.17, 0.07);
  const sandMaterial = world?.materials?.get(SAND) || mat(SAND);
  const skirt = shoreSkirt(
    { ...LOCAL_SHORE, top: 0.18 },
    sandMaterial,
    // The south shore is the quay: no beach where the ship lies alongside.
    (nx, nz) => nz < 0.42,
  );
  skirt.name = "Pickle Cay tidal beach";
  land.add(skirt);
  // Sea wall along the quay: dressed stone from the seabed to the coping.
  const wallHalf = LOCAL_SHORE.hx - LOCAL_SHORE.r + 0.05;
  box(
    land,
    "Quay sea wall",
    [0, -0.55, QUAY - 0.12],
    [wallHalf * 2, 2.0, 0.34],
    C.stone,
    { bevel: 0.05 },
  );
  box(
    land,
    "Quay coping stone",
    [0, 0.485, QUAY - 0.14],
    [wallHalf * 2 + 0.1, 0.1, 0.5],
    "#e5ddc8",
    { bevel: 0.04 },
  );
  for (let i = -3; i <= 3; i++)
    box(
      land,
      "Quay wall course line",
      [i * 1.2, -0.1, QUAY + 0.06],
      [0.03, 1.1, 0.02],
      C.stoneDark,
      { cast: false, bevel: 0.005 },
    );
  // Boulders where the sandstone breaks through the beach.
  for (const [x, z, s, r] of [
    [-5.5, 0.2, 0.55, 0.3],
    [-5.45, 1.0, 0.36, 1.1],
    [-4.3, -2.95, 0.42, 2.0],
    [5.55, -0.4, 0.5, 0.7],
    [5.5, 3.2, 0.34, 1.9],
    [-5.35, 4.6, 0.46, 2.6],
  ])
    ball(land, "Shore boulder", [x, 0.02, z], s, C.rock, {
      scale: [1.15, 0.65, 0.9],
      rotation: [0, r, 0],
    });
  return land;
}

// ----------------------------------------------------------------- bridge --
// The harbor bridge: a timber trestle from the pier to the island's gate pier,
// following the road's line. It is built outward from the harbor end.
const BRIDGE_START = { x: -2.4, z: 15.42 };
const BRIDGE_END = { x: 3.43, z: 20.62 };
export const BRIDGE = Object.freeze({
  start: BRIDGE_START,
  length: Math.hypot(
    BRIDGE_END.x - BRIDGE_START.x,
    BRIDGE_END.z - BRIDGE_START.z,
  ),
  yaw: Math.atan2(BRIDGE_END.x - BRIDGE_START.x, BRIDGE_END.z - BRIDGE_START.z),
});

function buildBridge(world) {
  const bridge = group(world, "Contractor island causeway");
  bridge.position.set(BRIDGE.start.x, 0, BRIDGE.start.z);
  bridge.rotation.y = BRIDGE.yaw;
  const L = BRIDGE.length;
  const half = 1.1;
  // Deck boards, each a slightly different honey brown.
  const boards = [];
  const tones = ["#c9976d", "#bf8d63", "#d0a077", "#c29268"];
  for (let i = 0; i < Math.floor(L / 0.2); i++)
    boards.push({
      at: [0, 0.395, 0.1 + i * 0.2],
      scale: [2.3, 0.07, 0.185],
      color: tones[(i * 7) % tones.length],
    });
  instances(bridge, "Island bridge deck boards", unitBox(), boards);
  for (const side of [-1, 1]) {
    box(
      bridge,
      "Bridge stringer",
      [side * 0.85, 0.27, L / 2],
      [0.16, 0.2, L],
      C.woodDark,
    );
    box(
      bridge,
      "Bridge kerb board",
      [side * 1.1, 0.48, L / 2],
      [0.07, 0.14, L],
      C.wood,
      {
        bevel: 0.02,
      },
    );
  }
  // Rails: cream posts, a top rail and a lower rail, as on the town bridges.
  for (const side of [-1, 1]) {
    for (let z = 0.2; z < L; z += 0.8)
      box(
        bridge,
        "Bridge railing post",
        [side * half, 0.76, z],
        [0.09, 0.66, 0.09],
        C.cream,
        {
          bevel: 0.015,
        },
      );
    box(
      bridge,
      "Bridge handrail",
      [side * half, 1.08, L / 2],
      [0.11, 0.08, L],
      C.cream,
      {
        bevel: 0.02,
      },
    );
    box(
      bridge,
      "Bridge lower rail",
      [side * half, 0.76, L / 2],
      [0.05, 0.05, L],
      C.cream,
      {
        bevel: 0.01,
      },
    );
  }
  for (const side of [-1, 1])
    for (const z of [0.06, L - 0.06]) {
      box(
        bridge,
        "Bridge newel post",
        [side * half, 0.86, z],
        [0.15, 0.86, 0.15],
        C.cream,
        { bevel: 0.03 },
      );
      box(
        bridge,
        "Bridge newel cap",
        [side * half, 1.33, z],
        [0.21, 0.07, 0.21],
        C.teal,
        { bevel: 0.02 },
      );
    }
  // Pile bents in the water with diagonal bracing between them.
  const bents = [0.7, 2.5, 4.3, 6.1, 7.6].filter((z) => z < L - 0.2);
  for (const z of bents) {
    box(bridge, "Bridge pile cap", [0, 0.1, z], [2.4, 0.14, 0.26], C.woodDark);
    for (const side of [-1, 1])
      cyl(
        bridge,
        "Bridge timber pile",
        [side * 0.95, -0.65, z],
        0.1,
        0.12,
        1.5,
        C.wood,
        {
          segments: 10,
        },
      );
  }
  for (let i = 0; i < bents.length - 1; i++)
    for (const side of [-1, 1]) {
      const a = bents[i],
        b = bents[i + 1],
        dz = b - a,
        dy = 1.0,
        len = Math.hypot(dz, dy);
      const brace = box(
        bridge,
        "Bridge pile brace",
        [side * 0.95, -0.35, (a + b) / 2],
        [0.06, 0.07, len],
        C.wood,
        {
          rotation: [(i % 2 ? -1 : 1) * Math.atan2(dy, dz), 0, 0],
          bevel: 0.01,
        },
      );
      brace.castShadow = false;
    }
  // Two lamps, one each side, staggered along the span.
  lamp(bridge, 1.0, 2.5, 1.0).position.y = 0.4;
  lamp(bridge, -1.0, 5.5, 1.0).position.y = 0.4;
  return bridge;
}

// -------------------------------------------------------------- gate pier --
function buildGate(estate) {
  const gate = group(estate, "Pickle Cay gate pier and arch");
  // Pier: timber deck on piles; the bridge lands on its north-west edge.
  const deck = group(gate, "Gate pier deck", [0, 0, -3.5]);
  const boards = [];
  for (let i = 0; i < 15; i++)
    boards.push({
      at: [-1.4 + i * 0.2, 0.415, 0],
      scale: [0.185, 0.07, 1.9],
      color: ["#c9976d", "#bf8d63", "#d0a077"][i % 3],
    });
  instances(deck, "Gate pier deck boards", unitBox(), boards);
  box(deck, "Gate pier beam", [0, 0.3, -0.7], [3.0, 0.14, 0.2], C.woodDark);
  box(deck, "Gate pier beam", [0, 0.3, 0.7], [3.0, 0.14, 0.2], C.woodDark);
  for (const x of [-1.3, 0, 1.3])
    for (const z of [-0.78, 0.78])
      cyl(
        deck,
        "Gate pier timber pile",
        [x, -0.55, z],
        0.1,
        0.12,
        1.7,
        C.wood,
        {
          segments: 10,
        },
      );
  // Mooring: bollards and a life-ring post for the visiting sailboat.
  for (const [x, z] of [
    [1.3, -0.7],
    [1.3, 0.55],
  ]) {
    cyl(deck, "Pier bollard", [x, 0.55, z], 0.08, 0.1, 0.22, C.navy);
    cyl(deck, "Pier bollard cap", [x, 0.69, z], 0.115, 0.115, 0.05, C.navy);
  }
  cyl(deck, "Life ring post", [-1.32, 0.78, 0.7], 0.035, 0.035, 0.7, C.cream);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.045, 8, 18),
    mat(C.coral),
  );
  ring.name = "Life ring";
  ring.position.set(-1.32, 0.98, 0.64);
  deck.add(ring);
  lamp(deck, -1.3, -0.7, 1.35).position.y = 0;
  // Welcome arch where the pier meets the island.
  const arch = group(gate, "Welcome arch", [0, GROUND, -2.1]);
  for (const side of [-1, 1]) {
    box(
      arch,
      "Arch post",
      [side * 1.2, 1.0, 0],
      [0.24, 2.0, 0.24],
      C.woodDark,
      { bevel: 0.04 },
    );
    box(
      arch,
      "Arch post base",
      [side * 1.2, 0.1, 0],
      [0.4, 0.2, 0.4],
      C.stone,
      { bevel: 0.04 },
    );
    box(
      arch,
      "Arch post cap",
      [side * 1.2, 2.06, 0],
      [0.34, 0.1, 0.34],
      C.teal,
      { bevel: 0.03 },
    );
    // Planter at the foot, in bloom.
    box(
      arch,
      "Arch planter",
      [side * 1.2, 0.17, 0.5],
      [0.5, 0.3, 0.36],
      C.wood,
      { bevel: 0.03 },
    );
    box(
      arch,
      "Arch planter soil",
      [side * 1.2, 0.33, 0.5],
      [0.42, 0.04, 0.3],
      C.soil,
      { bevel: 0.01 },
    );
    const blooms = [];
    for (let i = 0; i < 9; i++)
      blooms.push({
        at: [
          side * 1.2 - 0.17 + (i % 3) * 0.17,
          0.42 + (i % 2) * 0.03,
          0.4 + Math.floor(i / 3) * 0.1,
        ],
        scale: 0.065,
        color: ["#ed8970", "#f8cb68", "#fff2d8", "#c88fb7"][
          (i + (side > 0 ? 1 : 0)) % 4
        ],
      });
    instances(arch, "Arch planter blooms", unitBall(), blooms, { cast: false });
  }
  box(arch, "Arch beam", [0, 2.12, 0], [2.64, 0.14, 0.2], C.woodDark, {
    bevel: 0.03,
  });
  for (const side of [-1, 1]) {
    const brace = box(
      arch,
      "Arch brace",
      [side * 0.93, 1.9, 0],
      [0.5, 0.07, 0.1],
      C.woodDark,
      {
        rotation: [0, 0, side * 0.7],
        bevel: 0.015,
      },
    );
    brace.castShadow = false;
  }
  for (const faceZ of [-0.13, 0.13])
    signLabel(
      arch,
      "PICKLE CAY",
      [0, 1.8, faceZ],
      1.5,
      faceZ < 0 ? Math.PI : 0,
    );
  for (const side of [-1, 1])
    cyl(arch, "Sign chain", [side * 0.62, 1.97, 0], 0.01, 0.01, 0.2, "#596869");
  const lantern = ball(
    arch,
    "Island warm lantern",
    [0, 1.98, 0.3],
    0.07,
    C.gold,
    {
      material: mat(C.gold, { emissive: "#000000" }),
    },
  );
  lantern.castShadow = false;
  return gate;
}

// -------------------------------------------------------------- lane/quay --
function buildLane(estate) {
  const lane = group(estate, "Pickle Cay lane and quay");
  const top = GROUND + 0.04;
  const paving = (name, size, position, color = "#e6cf9f") =>
    box(lane, name, position, size, color, { bevel: 0.015, cast: false });
  paving("Port to pickle shop lane", [1.7, 0.05, 8.7], [0, top - 0.01, 2.0]);
  paving(
    "Port to pickle shop lane quay apron",
    [8.2, 0.05, 1.9],
    [0, top - 0.01, QUAY - 1.08],
  );
  paving(
    "Port to pickle shop lane lay-by",
    [1.6, 0.05, 1.8],
    [1.6, top - 0.012, 4.15],
  );
  paving(
    "Port to pickle shop lane gate landing",
    [2.3, 0.05, 0.7],
    [0, top - 0.011, -2.4],
  );
  for (const side of [-1, 1]) {
    box(
      lane,
      "Lane kerb",
      [side * 0.88, top + 0.01, 2.0],
      [0.07, 0.06, 8.7],
      C.cream,
      {
        bevel: 0.012,
        cast: false,
      },
    );
  }
  // Lamps stand on the garden side of the lane; the hall side keeps the wall.
  for (const z of [-1.4, 1.6, 4.6]) lamp(lane, 0.98, z, 1.35);
  return lane;
}

function buildQuay(estate) {
  const quay = group(estate, "Pickle Cay quay");
  const edge = QUAY - 0.1;
  // Safety line and fenders where the freighter comes alongside.
  box(
    quay,
    "Quay safety line",
    [0, GROUND + 0.07, edge - 0.55],
    [7.6, 0.012, 0.07],
    C.gold,
    {
      cast: false,
      bevel: 0.004,
    },
  );
  for (let i = -3; i <= 3; i += 1.5)
    cyl(
      quay,
      "Quay fender",
      [i * 1.0, 0.2, QUAY + 0.14],
      0.09,
      0.09,
      0.55,
      C.navy,
      {
        segments: 10,
      },
    );
  for (const x of [-3.4, -0.6, 3.3]) {
    cyl(
      quay,
      "Quay bollard",
      [x, GROUND + 0.16, edge - 0.14],
      0.1,
      0.12,
      0.3,
      C.navy,
    );
    cyl(
      quay,
      "Quay bollard cap",
      [x, GROUND + 0.33, edge - 0.14],
      0.14,
      0.14,
      0.06,
      C.navy,
    );
  }
  lamp(quay, -3.7, QUAY - 1.0, 1.4);
  lamp(quay, 3.7, QUAY - 1.0, 1.4);
  // The freighter's crane sets crates on these pallets, in a marked bay.
  const pallets = group(quay, "Island port shipment pallets");
  const bay = { z: QUAY - 0.65 };
  box(
    pallets,
    "Receiving bay marking",
    [QUAY_ROW, GROUND + 0.06, bay.z],
    [2.9, 0.012, 0.66],
    "#f6e6c8",
    {
      cast: false,
      bevel: 0.004,
    },
  );
  for (let i = 0; i < 6; i++)
    box(
      pallets,
      "Imported supplies pallet",
      [...quaySlot(i).slice(0, 1), GROUND + 0.1, bay.z],
      [0.4, 0.07, 0.4],
      "#b08a58",
      { bevel: 0.015 },
    );
  signLabel(
    quay,
    "RECEIVING",
    [QUAY_ROW + 1.85, GROUND + 0.62, bay.z - 0.48],
    0.9,
  );
  const post = quay.children.at(-1);
  if (post) post.rotation.y = Math.PI;
  box(
    quay,
    "Receiving sign post",
    [QUAY_ROW + 1.85, GROUND + 0.3, bay.z - 0.5],
    [0.05, 0.6, 0.05],
    C.woodDark,
    {
      bevel: 0.01,
    },
  );
  return { quay, pallets };
}

/** Where crate `i` rests on the receiving pallets: [x, y, z], estate-local. */
export function quaySlot(i) {
  return [QUAY_ROW - 1.1 + 0.44 * i, GROUND + 0.3, QUAY - 0.65];
}
export const QUAY_SLOTS = 6;
// The row sits under the freighter's crane, which stands forward of amidships.
const QUAY_ROW = -0.9;

// ------------------------------------------------------------------ works --
const HALL = { x: -3.15, w: 3.7, d: 3.8, h: 1.95 };
export const HALL_CENTER = Object.freeze([HALL.x, 0]);

function buildWorks(estate, world) {
  const shop = group(estate, "Owned pickle shop and factory", [
    HALL.x,
    GROUND,
    0,
  ]);
  const hx = HALL.w / 2,
    hz = HALL.d / 2,
    H = HALL.h;
  box(
    shop,
    "Factory foundation",
    [0, 0.04, 0],
    [HALL.w + 0.3, 0.1, HALL.d + 0.3],
    "#b9b3a2",
    {
      bevel: 0.03,
    },
  );

  // ---- walls (grow from the ground during construction)
  const walls = group(shop, "Factory shell");
  const wall = (name, size, at, color = C.walls) =>
    box(walls, name, at, size, color, { bevel: 0.02 });
  wall("Factory rear wall", [HALL.w, H, 0.14], [0, H / 2, -hz + 0.07]);
  wall("Factory side wall", [0.14, H, HALL.d - 0.28], [-hx + 0.07, H / 2, 0]);
  // South wall: piers either side of the long viewing window.
  wall("Factory rear wall", [0.95, H, 0.14], [-hx + 0.475, H / 2, hz - 0.07]);
  wall("Factory rear wall", [0.25, H, 0.14], [hx - 0.125, H / 2, hz - 0.07]);
  wall(
    "Factory rear wall",
    [2.5, H - 1.5, 0.14],
    [0.35, 1.5 + (H - 1.5) / 2, hz - 0.07],
  );
  signLabel(
    walls,
    "BRANDON'S PICKLE WORKS",
    [0.35, 1.5 + (H - 1.5) / 2, hz + 0.005],
    2.0,
  );
  wall("Factory plinth", [2.5, 0.5, 0.16], [0.35, 0.25, hz - 0.07], C.tealRoof);
  // East wall (the lane side): door, showroom window, dock door.
  const east = hx - 0.07;
  wall("Factory side wall", [0.14, H, 0.65], [east, H / 2, -hz + 0.325 + 0.0]);
  wall(
    "Factory side wall",
    [0.14, H - 1.2, 0.9],
    [east, 1.2 + (H - 1.2) / 2, -0.8],
  );
  wall("Factory side wall", [0.14, H, 0.2], [east, H / 2, -0.25]);
  wall("Factory side wall", [0.14, 0.5, 0.95], [east, 0.25, 0.325]);
  wall(
    "Factory side wall",
    [0.14, H - 1.4, 0.95],
    [east, 1.4 + (H - 1.4) / 2, 0.325],
  );
  wall("Factory side wall", [0.14, H, 0.12], [east, H / 2, 0.86]);
  wall(
    "Factory side wall",
    [0.14, H - 1.35, 0.95],
    [east, 1.35 + (H - 1.35) / 2, 1.4],
  );
  wall("Factory side wall", [0.14, H, 0.1], [east, H / 2, 1.85]);
  wall(
    "Factory plinth",
    [0.18, 0.4, HALL.d],
    [east + 0.01, 0.2, 0],
    C.tealRoof,
  );
  wall(
    "Factory plinth",
    [0.18, 0.4, HALL.d - 0.28],
    [-hx + 0.07, 0.2, 0],
    C.tealRoof,
  );
  wall("Factory plinth", [HALL.w, 0.4, 0.18], [0, 0.2, -hz + 0.07], C.tealRoof);
  // Corner pilasters in a deeper cream.
  for (const [x, z] of [
    [-hx + 0.08, -hz + 0.08],
    [hx - 0.08, -hz + 0.08],
    [-hx + 0.08, hz - 0.08],
    [hx - 0.08, hz - 0.08],
  ])
    wall("Factory pilaster", [0.2, H, 0.2], [x, H / 2, z], C.wallsDark);
  box(
    walls,
    "Factory eave band",
    [0, H + 0.03, 0],
    [HALL.w + 0.14, 0.1, HALL.d + 0.14],
    C.cream,
    {
      bevel: 0.03,
    },
  );
  // Windows (frame + glass), set into the walls.
  const pane = (name, size, at, parent = walls) => {
    const glass = box(parent, name, at, size, "#a2d5cb", {
      material: glassMaterial,
      cast: false,
      bevel: 0.005,
    });
    return glass;
  };
  const frame = (name, size, at, parent = walls) =>
    box(parent, name, at, size, "#eef3e6", {
      material: frameMaterial,
      bevel: 0.01,
      cast: false,
    });
  // South viewing window onto the packing line.
  pane("Factory viewing window", [2.5, 0.95, 0.04], [0.35, 1.0, hz - 0.07]);
  for (let i = 0; i <= 5; i++)
    frame(
      "Factory window mullion",
      [0.04, 0.95, 0.07],
      [-0.9 + i * 0.5, 1.0, hz - 0.05],
    );
  frame("Factory window frame", [2.56, 0.05, 0.08], [0.35, 0.52, hz - 0.05]);
  frame("Factory window frame", [2.56, 0.05, 0.08], [0.35, 1.48, hz - 0.05]);
  // High windows in the north and west walls, framed proud of the brick.
  const framedWindow = (name, alongX, at) => {
    const [x, y, z] = at;
    const w = alongX ? 0.66 : 0.03,
      d = alongX ? 0.03 : 0.66;
    pane(name, [w, 0.46, d], [x, y, z]);
    for (const s of [-1, 1]) {
      frame(
        "Factory window frame",
        alongX ? [0.8, 0.06, 0.06] : [0.06, 0.06, 0.8],
        [x, y + s * 0.26, z],
      );
      frame(
        "Factory window frame",
        alongX ? [0.06, 0.58, 0.06] : [0.06, 0.58, 0.06],
        alongX ? [x + s * 0.37, y, z] : [x, y, z + s * 0.37],
      );
    }
    frame(
      "Factory window mullion",
      alongX ? [0.035, 0.46, 0.05] : [0.05, 0.46, 0.035],
      [x, y, z],
    );
    box(
      walls,
      "Factory window sill",
      alongX ? [x, y - 0.3, z - 0.04] : [x - 0.04, y - 0.3, z],
      alongX ? [0.86, 0.04, 0.12] : [0.12, 0.04, 0.86],
      "#f3e3c3",
      { bevel: 0.01, cast: false },
    );
  };
  for (const x of [-1.0, 0.1, 1.2])
    framedWindow("Factory clerestory window", true, [x, 1.25, -hz - 0.0]);
  for (const z of [-0.9, 0.5])
    framedWindow("Factory side window", false, [-hx - 0.0, 1.25, z]);
  // Showroom: door, display window and the awning over both.
  const door = box(
    walls,
    "Pickle works door",
    [east + 0.02, 0.6, -0.8],
    [0.06, 1.18, 0.62],
    C.teal,
    {
      bevel: 0.015,
    },
  );
  door.userData.keep = true;
  pane(
    "Pickle works door glass",
    [0.04, 0.55, 0.38],
    [east + 0.06, 0.78, -0.8],
  );
  box(
    walls,
    "Pickle works door handle",
    [east + 0.07, 0.6, -0.62],
    [0.03, 0.03, 0.08],
    C.gold,
    {
      cast: false,
      bevel: 0.008,
    },
  );
  pane(
    "Showroom display window",
    [0.04, 0.88, 0.92],
    [east + 0.02, 0.94, 0.325],
  );
  frame("Showroom window frame", [0.07, 0.05, 1.0], [east + 0.03, 1.4, 0.325]);
  frame("Showroom window frame", [0.07, 0.05, 1.0], [east + 0.03, 0.5, 0.325]);
  frame(
    "Showroom window mullion",
    [0.07, 0.88, 0.04],
    [east + 0.03, 0.94, 0.325],
  );
  box(
    walls,
    "Showroom window sill",
    [east + 0.1, 0.48, 0.325],
    [0.22, 0.05, 1.04],
    C.cream,
    {
      bevel: 0.01,
    },
  );
  // Striped awning over the door and display window.
  for (let i = 0; i < 9; i++) {
    const z = -1.25 + i * 0.255;
    box(
      walls,
      "Showroom awning",
      [east + 0.3, 1.3 - 0.0, z + 0.125],
      [0.5, 0.04, 0.255],
      i % 2 ? C.cream : C.coral,
      { rotation: [0, 0, 0.32], bevel: 0.01 },
    );
  }
  box(
    walls,
    "Awning valance",
    [east + 0.5, 1.2, 0.0],
    [0.03, 0.12, 2.3],
    C.coral,
    {
      bevel: 0.01,
      cast: false,
    },
  );
  signLabel(
    walls,
    "BRANDON'S PICKLE WORKS",
    [east + 0.085, 1.52, -0.8],
    1.5,
    Math.PI / 2,
  );
  // Loading dock: roll-up door, raised platform, bumpers.
  const rollup = group(walls, "Dock roll-up door", [east + 0.03, 0, 1.4]);
  box(rollup, "Dock door panel", [0, 0.67, 0], [0.04, 1.34, 0.9], "#cdd6cf", {
    bevel: 0.01,
  });
  for (let i = 0; i < 7; i++)
    box(
      rollup,
      "Dock door slat",
      [0.025, 0.2 + i * 0.18, 0],
      [0.012, 0.025, 0.9],
      "#a9b5ae",
      {
        cast: false,
        bevel: 0.004,
      },
    );
  box(
    walls,
    "Loading dock platform",
    [east + 0.32, 0.17, 1.4],
    [0.5, 0.3, 1.1],
    "#c3bca9",
    {
      bevel: 0.03,
    },
  );
  for (const z of [1.0, 1.8])
    box(walls, "Dock bumper", [east + 0.6, 0.2, z], [0.06, 0.2, 0.1], C.navy, {
      bevel: 0.015,
    });

  // ---- sawtooth roof: solid slopes face north, glazing faces south
  const roof = group(shop, "Factory roof");
  const eaves = H + 0.12;
  const toothW = (HALL.d + 0.3) / 3,
    rise = 0.52,
    length = HALL.w + 0.3;
  const toothShape = new THREE.Shape();
  toothShape.moveTo(0, 0);
  toothShape.lineTo(toothW, rise);
  toothShape.lineTo(toothW, 0);
  toothShape.closePath();
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.ExtrudeGeometry(toothShape, {
      depth: length,
      bevelEnabled: false,
    });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(length / 2, 0, 0);
    const tooth = new THREE.Mesh(geometry, mat(C.tealRoof));
    tooth.name = "Gable roof slope sawtooth";
    tooth.position.set(0, eaves, -HALL.d / 2 - 0.15 + i * toothW);
    tooth.castShadow = tooth.receiveShadow = true;
    roof.add(tooth);
    const zFace = -HALL.d / 2 - 0.15 + (i + 1) * toothW;
    pane(
      "Factory sawtooth glazing",
      [length - 0.2, rise - 0.08, 0.035],
      [0, eaves + rise / 2, zFace + 0.02],
      roof,
    );
    for (let m = 0; m <= 6; m++)
      frame(
        "Factory glazing mullion",
        [0.035, rise - 0.06, 0.06],
        [
          -length / 2 + 0.1 + (m * (length - 0.2)) / 6,
          eaves + rise / 2,
          zFace + 0.03,
        ],
        roof,
      );
    box(
      roof,
      "Factory ridge flashing",
      [0, eaves + rise + 0.015, zFace - 0.02],
      [length, 0.04, 0.08],
      C.cream,
      {
        bevel: 0.01,
        cast: false,
      },
    );
  }
  // Roof furniture: ventilators, a skylight hatch and the tall chimney.
  for (const [x, z] of [
    [-0.6, 0.6],
    [0.9, 1.1],
  ]) {
    cyl(roof, "Roof ventilator", [x, eaves + 0.22, z], 0.1, 0.1, 0.14, C.pipe);
    cyl(
      roof,
      "Roof ventilator hood",
      [x, eaves + 0.37, z],
      0.02,
      0.17,
      0.12,
      C.stoneDark,
    );
  }
  const stack = group(roof, "Brick chimney", [-1.25, 0, -1.1]);
  cyl(stack, "Chimney base", [0, 0.9, 0], 0.27, 0.3, 1.8, C.brick, {
    segments: 12,
  });
  cyl(stack, "Chimney shaft", [0, 2.5, 0], 0.2, 0.26, 1.6, C.brick, {
    segments: 12,
  });
  for (const [y, c] of [
    [3.1, C.cream],
    [3.28, C.teal],
  ])
    cyl(stack, "Chimney band", [0, y, 0], 0.215, 0.215, 0.12, c, {
      segments: 12,
    });
  cyl(stack, "Chimney cap", [0, 3.4, 0], 0.27, 0.22, 0.1, "#5e6c68", {
    segments: 12,
  });
  const roofPads = [stack];

  // ---- the production floor and tank farm (visible once complete)
  const factory = group(shop, "Pickle fermentation and packing line");
  // Interior: floor, packing line seen through the south window.
  box(
    factory,
    "Factory interior floor",
    [0, 0.1, 0],
    [HALL.w - 0.3, 0.02, HALL.d - 0.3],
    "#d6cbb2",
    {
      bevel: 0.005,
      cast: false,
    },
  );
  box(
    factory,
    "Packing conveyor",
    [0, 0.53, 1.2],
    [3.0, 0.12, 0.5],
    "#526966",
    { bevel: 0.03 },
  );
  for (const x of [-1.3, -0.5, 0.5, 1.3])
    box(factory, "Conveyor leg", [x, 0.3, 1.2], [0.07, 0.42, 0.4], "#7d908a", {
      bevel: 0.01,
    });
  for (let i = -1; i <= 1; i += 2)
    box(
      factory,
      "Conveyor rail",
      [0, 0.64, 1.2 + i * 0.22],
      [3.0, 0.04, 0.03],
      "#d8e2ce",
      {
        cast: false,
        bevel: 0.005,
      },
    );
  const jars = [];
  for (let i = 0; i < 7; i++) {
    const jar = cyl(
      factory,
      "Fresh packed pickle jar",
      [-1.2 + i * 0.38, 0.77, 1.2],
      0.105,
      0.105,
      0.3,
      "#8ca36c",
    );
    cyl(jar, "Gold jar lid", [0, 0.17, 0], 0.11, 0.11, 0.045, C.gold);
    jars.push(jar);
  }
  // Filling machine straddling the line, with its hopper.
  box(
    factory,
    "Filling machine frame",
    [-0.55, 1.0, 1.2],
    [0.1, 0.9, 0.7],
    "#dde3d4",
    { bevel: 0.02 },
  );
  box(
    factory,
    "Filling machine frame",
    [0.15, 1.0, 1.2],
    [0.1, 0.9, 0.7],
    "#dde3d4",
    { bevel: 0.02 },
  );
  box(
    factory,
    "Filling machine head",
    [-0.2, 1.38, 1.2],
    [0.9, 0.2, 0.62],
    C.teal,
    { bevel: 0.03 },
  );
  cone(factory, "Filling hopper", [-0.2, 1.62, 1.2], 0.3, 0.3, "#cfd8cd");
  factory.children.at(-1).rotation.x = Math.PI;
  cyl(factory, "Filling nozzle", [-0.2, 1.17, 1.2], 0.03, 0.04, 0.24, C.steel);
  // Storage racks of jars and crates along the north wall.
  for (let i = 0; i < 3; i++)
    box(
      factory,
      "Factory storage rack",
      [-1.45 + i * 1.0, 0.6, -1.55],
      [0.9, 1.0, 0.28],
      "#a58057",
      {
        bevel: 0.02,
      },
    );
  for (let i = 0; i < 9; i++)
    cyl(
      factory,
      "Stored pickle jar",
      [-1.8 + (i % 3) * 0.28 + Math.floor(i / 3) * 1.0, 1.28, -1.55],
      0.07,
      0.07,
      0.2,
      "#8ca36c",
    );
  // Pendant lamps.
  for (const x of [-0.9, 0.3, 1.2]) {
    cyl(factory, "Pendant cord", [x, 1.62, 0.6], 0.008, 0.008, 0.3, "#596869", {
      segments: 5,
    });
    cyl(factory, "Pendant shade", [x, 1.44, 0.6], 0.07, 0.17, 0.12, C.coral);
  }
  // Fermentation tank farm behind the hall, plumbed to the packing line.
  const vats = [];
  for (let i = 0; i < 3; i++) {
    const tank = group(factory, "Fermentation tank", [
      -1.2,
      0.0,
      2.55 + i * 0.95,
    ]);
    cyl(tank, "Tank plinth", [0, 0.08, 0], 0.5, 0.52, 0.16, "#b9b3a2");
    const vat = cyl(
      tank,
      "Fermentation vat",
      [0, 0.91, 0],
      0.42,
      0.42,
      1.5,
      C.steel,
      { segments: 20 },
    );
    ball(tank, "Fermentation tank dome", [0, 1.66, 0], 0.42, "#b5bdb0", {
      scale: [1, 0.42, 1],
    });
    cyl(tank, "Sanitary lid", [0, 1.88, 0], 0.13, 0.13, 0.05, "#cfd5c8");
    cyl(tank, "Tank airlock", [0.2, 1.84, 0.1], 0.04, 0.04, 0.12, "#d8ecee");
    for (const y of [0.45, 0.95, 1.4])
      cyl(tank, "Tank hoop", [0, y, 0], 0.435, 0.435, 0.04, "#7d908a", {
        segments: 20,
      });
    // Ladder with a safety hoop and a pressure gauge.
    for (const side of [-1, 1])
      box(
        tank,
        "Tank ladder rail",
        [0.43, 0.9, side * 0.09],
        [0.03, 1.5, 0.03],
        "#d8e2ce",
        { bevel: 0.006 },
      );
    for (let r = 0; r < 7; r++)
      box(
        tank,
        "Tank ladder rung",
        [0.43, 0.2 + r * 0.22, 0],
        [0.03, 0.025, 0.18],
        "#d8e2ce",
        {
          bevel: 0.004,
          cast: false,
        },
      );
    cyl(tank, "Tank gauge", [-0.05, 0.75, 0.42], 0.07, 0.07, 0.04, "#f6e6c8", {
      rotation: [Math.PI / 2, 0, 0],
    });
    cyl(
      tank,
      "Tank draw-off valve",
      [0.0, 0.3, 0.45],
      0.03,
      0.03,
      0.14,
      C.coral,
      { rotation: [Math.PI / 2, 0, 0] },
    );
    vats.push(vat);
  }
  // Header pipe along the tanks and a run into the hall.
  cyl(
    factory,
    "Brine header pipe",
    [-0.72, 0.28, 3.5],
    0.045,
    0.045,
    2.1,
    C.pipe,
    {
      rotation: [Math.PI / 2, 0, 0],
      segments: 10,
    },
  );
  for (let i = 0; i < 3; i++)
    cyl(
      factory,
      "Brine branch pipe",
      [-0.97, 0.28, 2.55 + i * 0.95],
      0.04,
      0.04,
      0.5,
      C.pipe,
      {
        rotation: [0, 0, Math.PI / 2],
        segments: 10,
      },
    );
  cyl(
    factory,
    "Brine riser pipe",
    [-0.72, 1.1, 2.45],
    0.045,
    0.045,
    1.7,
    C.pipe,
    { segments: 10 },
  );
  cyl(
    factory,
    "Brine feed pipe",
    [-0.72, 1.62, 2.18],
    0.045,
    0.045,
    0.6,
    C.pipe,
    {
      rotation: [Math.PI / 2, 0, 0],
      segments: 10,
    },
  );
  // Steam from the stack while the line is running.
  const steam = group(roof, "Factory chimney steam", [-1.25, 3.55, -1.1]);
  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const puff = ball(steam, "Chimney steam puff", [0, 0, 0], 0.18, "#ffffff", {
      material: new THREE.MeshStandardMaterial({
        color: "#fbfdf8",
        transparent: true,
        opacity: 0.6,
        roughness: 1,
        depthWrite: false,
      }),
      cast: false,
    });
    puffs.push(puff);
  }
  // ---- the loading yard on the lane side of the hall
  const yard = group(shop, "Factory loading yard");
  const dockX = hx + 0.5;
  box(
    yard,
    "Dock pallet",
    [dockX - 0.1, 0.36, 1.2],
    [0.4, 0.06, 0.4],
    "#b08a58",
    { bevel: 0.015 },
  );
  for (let i = 0; i < 4; i++)
    box(
      yard,
      "Pickle case",
      [
        dockX - 0.1,
        0.5 + (i % 2) * 0.0 + Math.floor(i / 2) * 0.22,
        1.12 + (i % 2) * 0.18,
      ],
      [0.34, 0.2, 0.3],
      "#cb9660",
      {
        bevel: 0.015,
      },
    );
  // Brine barrels beside the dock.
  for (let i = 0; i < 4; i++) {
    const barrel = cyl(
      yard,
      "Brine barrel",
      [
        hx + 0.35 + (i % 2) * 0.32,
        0.33,
        1.78 + Math.floor(i / 2) * 0.0 - (i > 1 ? 0.0 : 0),
      ],
      0.15,
      0.15,
      0.36,
      "#a5784d",
      { segments: 12 },
    );
    barrel.position.z = 1.78 - (i > 1 ? 0.3 : 0);
    barrel.position.x = hx + 0.4 + (i % 2) * 0.34;
    for (const y of [-0.1, 0.1])
      cyl(barrel, "Barrel hoop", [0, y, 0], 0.158, 0.158, 0.03, "#5d6a66", {
        segments: 12,
      });
  }
  return {
    shop,
    walls,
    roof,
    factory,
    jars,
    vats,
    steam,
    puffs,
    yard,
    roofPads,
    door,
  };
}

// ----------------------------------------------------------------- garden --
const GARDEN_AT = [3.5, 0.6];
function buildGarden(estate, world) {
  const garden = group(estate, "Back garden and greenhouse", [
    GARDEN_AT[0],
    GROUND,
    GARDEN_AT[1],
  ]);
  const crops = [];

  // Paths: gravel in a cross, a ring around the fountain.
  const gravel = "#e7d6ae";
  const pathBox = (size, at) =>
    box(garden, "Garden gravel path", at, size, gravel, {
      bevel: 0.01,
      cast: false,
    });
  pathBox([0.42, 0.03, 2.5], [0, 0.015, 1.2]);
  pathBox([2.9, 0.03, 0.36], [0, 0.015, 1.2]);
  box(
    garden,
    "Garden greenhouse path",
    [0, 0.015, -0.2],
    [0.55, 0.03, 0.5],
    gravel,
    { bevel: 0.01, cast: false },
  );
  // Fountain: stone basin, tiered bowl and spout at the crossing.
  const fountain = group(garden, "Garden fountain", [0, 0, 1.2]);
  cyl(fountain, "Fountain basin", [0, 0.1, 0], 0.4, 0.43, 0.2, C.stone, {
    segments: 20,
  });
  cyl(fountain, "Fountain basin rim", [0, 0.21, 0], 0.4, 0.4, 0.03, "#e5ddc8", {
    segments: 20,
  });
  cyl(fountain, "Fountain water", [0, 0.2, 0], 0.34, 0.34, 0.02, "#7cc7c9", {
    segments: 20,
    material: new THREE.MeshStandardMaterial({
      color: "#7cc7c9",
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    }),
  });
  cyl(fountain, "Fountain column", [0, 0.38, 0], 0.05, 0.07, 0.34, C.stone);
  cyl(fountain, "Fountain bowl", [0, 0.56, 0], 0.18, 0.08, 0.1, C.stone, {
    segments: 16,
  });
  ball(fountain, "Fountain finial", [0, 0.68, 0], 0.05, "#a9dde0");

  // Raised beds with cucumber trellises.
  const bedSpots = [
    [-0.85, 0.45],
    [0.85, 0.45],
    [-0.85, 1.95],
    [0.85, 1.95],
  ];
  const bedW = 1.05,
    bedD = 0.9;
  bedSpots.forEach(([bx, bz], b) => {
    const bed = group(garden, "Cucumber raised growing bed", [bx, 0, bz]);
    box(
      bed,
      "Raised bed soil",
      [0, 0.13, 0],
      [bedW - 0.06, 0.2, bedD - 0.06],
      C.soil,
      { bevel: 0.02 },
    );
    for (const side of [-1, 1]) {
      box(
        bed,
        "Raised bed board",
        [side * (bedW / 2 - 0.03), 0.13, 0],
        [0.06, 0.26, bedD],
        "#b48a5c",
        { bevel: 0.015 },
      );
      box(
        bed,
        "Raised bed board",
        [0, 0.13, side * (bedD / 2 - 0.03)],
        [bedW, 0.26, 0.06],
        "#a37b50",
        { bevel: 0.015 },
      );
    }
    for (const side of [-1, 1])
      for (const sz of [-1, 1])
        box(
          bed,
          "Raised bed post",
          [side * (bedW / 2 - 0.03), 0.17, sz * (bedD / 2 - 0.03)],
          [0.08, 0.34, 0.08],
          "#8f6a46",
          { bevel: 0.015 },
        );
    // Teepee trellises, each carrying a vine.
    for (let p = 0; p < 2; p++) {
      const t = group(bed, "Cucumber trellis", [-0.22 + p * 0.44, 0.23, 0]);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        const pole = cyl(
          t,
          "Trellis pole",
          [Math.cos(a) * 0.1, 0.4, Math.sin(a) * 0.1],
          0.012,
          0.014,
          0.82,
          "#c9a56e",
          { segments: 5 },
        );
        pole.rotation.set(Math.sin(a) * 0.13, 0, -Math.cos(a) * 0.13);
        pole.castShadow = false;
      }
      const vine = group(t, "Growing cucumber vine", [0, 0, 0]);
      cone(vine, "Cucumber vine foliage", [0, 0.38, 0], 0.17, 0.74, "#557e50", {
        segments: 9,
      });
      for (let k = 0; k < 4; k++) {
        const a = k * 2.1 + p;
        ball(
          vine,
          "Cucumber vine leaf",
          [Math.cos(a) * 0.12, 0.2 + k * 0.17, Math.sin(a) * 0.12],
          0.08,
          k % 2 ? "#6a9a5c" : "#4d7a49",
          {
            scale: [1, 0.55, 1],
          },
        );
      }
      for (let k = 0; k < 2; k++) {
        const a = k * 3.1 + p * 1.3;
        cyl(
          vine,
          "Hanging cucumber",
          [Math.cos(a) * 0.14, 0.26 + k * 0.2, Math.sin(a) * 0.14],
          0.032,
          0.026,
          0.14,
          "#5f8f3d",
          { segments: 8 },
        );
      }
      vine.userData.bedIndex = b;
      crops.push(vine);
    }
    // Herb edging at the foot of each bed.
    const herbs = [];
    for (let i = 0; i < 5; i++)
      herbs.push({
        at: [
          bx - 0.4 + i * 0.2,
          0.06,
          bz + (bz < 1 ? -bedD / 2 - 0.09 : bedD / 2 + 0.09),
        ],
        scale: [0.075, 0.07, 0.075],
        color: ["#7ba75b", "#8fb86a", "#6a9a5c", "#9cc277", "#7ba75b"][i],
      });
    instances(garden, "Garden herb tuft", unitBall(), herbs, { cast: false });
  });

  // Flower borders: lavender, marigold, zinnia and daisy along the fence.
  const flowerColors = [
    "#b29ad1",
    "#f8cb68",
    "#ed8970",
    "#fff2d8",
    "#d87ca2",
    "#f4a659",
  ];
  const blooms = [],
    stems = [];
  const bloomAt = (x, z, i, h = 0.2) => {
    const color = flowerColors[i % flowerColors.length];
    stems.push({
      at: [x, h / 2, z],
      scale: [0.015, h, 0.015],
      color: "#5c8f4d",
    });
    blooms.push({
      at: [x, h + 0.02, z],
      scale: 0.052 + (i % 3) * 0.012,
      color,
    });
  };
  for (let i = 0; i < 14; i++)
    bloomAt(-1.38, -0.2 + i * 0.18, i, 0.16 + (i % 3) * 0.05);
  for (let i = 0; i < 10; i++)
    bloomAt(-1.2 + i * 0.3, 2.42, i + 2, 0.14 + (i % 2) * 0.06);
  for (let i = 0; i < 9; i++)
    bloomAt(1.38, 0.15 + i * 0.25, i + 1, 0.2 + (i % 3) * 0.04);
  instances(garden, "Garden flower blooms", unitBall(), blooms, {
    cast: false,
  });
  instances(garden, "Garden flower stems", unitBox(), stems, { cast: false });
  // Sunflowers against the east hedge.
  for (let i = 0; i < 3; i++) {
    const sun = group(garden, "Garden sunflower", [1.32, 0, 0.55 + i * 0.7]);
    cyl(sun, "Sunflower stem", [0, 0.4, 0], 0.014, 0.02, 0.8, "#5c8f4d", {
      segments: 6,
    });
    cyl(sun, "Sunflower head", [0.04, 0.82, 0], 0.11, 0.11, 0.03, C.gold, {
      segments: 14,
      rotation: [0, 0, Math.PI / 2 - 0.25],
    });
    cyl(
      sun,
      "Sunflower seed disc",
      [0.065, 0.82, 0],
      0.055,
      0.055,
      0.03,
      "#6b4e3a",
      {
        segments: 10,
        rotation: [0, 0, Math.PI / 2 - 0.25],
      },
    );
  }

  // Picket fence along the lane, with a gate onto the cross path.
  const pickets = [];
  for (let i = 0; i < 17; i++) {
    const z = -0.05 + i * 0.145;
    if (Math.abs(z - 1.2) < 0.26) continue;
    pickets.push({
      at: [-1.5, 0.22, z],
      scale: [0.07, 0.42, 0.028],
      color: "#fff2d8",
    });
  }
  instances(garden, "Garden picket fence", unitBox(), pickets);
  for (const y of [0.12, 0.32])
    box(
      garden,
      "Garden fence rail",
      [-1.5, y, 1.2],
      [0.03, 0.04, 2.55],
      "#efdab8",
      { bevel: 0.008 },
    );
  for (const z of [-0.1, 0.9, 1.5, 2.5])
    box(
      garden,
      "Garden fence post",
      [-1.5, 0.27, z],
      [0.1, 0.54, 0.1],
      "#fff2d8",
      { bevel: 0.02 },
    );
  // Gate posts with an arbour carrying climbing roses.
  for (const z of [0.92, 1.48])
    box(garden, "Arbour post", [-1.5, 0.75, z], [0.07, 1.5, 0.07], "#fff2d8", {
      bevel: 0.015,
    });
  box(garden, "Arbour beam", [-1.5, 1.52, 1.2], [0.1, 0.07, 0.7], "#fff2d8", {
    bevel: 0.015,
  });
  for (const z of [1.0, 1.4])
    box(
      garden,
      "Arbour rafter",
      [-1.5, 1.58, z],
      [0.2, 0.03, 0.04],
      "#fff2d8",
      { bevel: 0.008 },
    );
  const roses = [];
  for (let i = 0; i < 12; i++)
    roses.push({
      at: [
        -1.5 + Math.sin(i * 2.1) * 0.05,
        1.15 + (i % 6) * 0.07 + (i > 5 ? 0.0 : 0),
        0.95 + (i % 2) * 0.5 + Math.sin(i) * 0.04,
      ],
      scale: 0.05,
      color: i % 3 ? "#ed8970" : "#f6b6a4",
    });
  const leafPatches = [];
  for (const z of [0.93, 1.47])
    for (let i = 0; i < 6; i++)
      leafPatches.push({
        at: [-1.5 + (i % 2 ? 0.045 : -0.045), 0.42 + i * 0.2, z],
        scale: [0.085, 0.1, 0.085],
        color: i % 2 ? "#5c8f4d" : "#4c7f45",
      });
  for (let i = 0; i < 6; i++)
    leafPatches.push({
      at: [-1.5, 1.58, 0.95 + i * 0.1],
      scale: [0.09, 0.07, 0.07],
      color: i % 2 ? "#5c8f4d" : "#4c7f45",
    });
  instances(garden, "Arbour leaves", unitBall(), leafPatches, { cast: false });
  instances(garden, "Arbour roses", unitBall(), roses, { cast: false });
  // Boxwood hedge along the south and east, topiary at the corners.
  box(garden, "Garden hedge", [0, 0.25, 2.62], [3.0, 0.5, 0.28], "#4c8a4a", {
    bevel: 0.1,
  });
  box(garden, "Garden hedge", [1.57, 0.25, 1.0], [0.28, 0.5, 3.0], "#4c8a4a", {
    bevel: 0.1,
  });
  for (const [x, z] of [
    [-1.5, 2.62],
    [1.57, 2.62],
  ])
    ball(garden, "Garden topiary", [x, 0.62, z], 0.2, "#5c9a52");

  // The glasshouse.
  const greenhouse = group(garden, "Glass cucumber greenhouse", [0, 0, -1.4]);
  const gw = 2.8,
    gd = 1.95,
    eaveY = 1.15,
    ridgeY = 1.8;
  box(
    greenhouse,
    "Greenhouse brick plinth",
    [0, 0.17, 0],
    [gw + 0.1, 0.34, gd + 0.1],
    "#cfc7b2",
    { bevel: 0.03 },
  );
  for (const sz of [-1, 1])
    box(
      greenhouse,
      "Greenhouse plinth cap",
      [0, 0.36, sz * (gd / 2 + 0.01)],
      [gw + 0.16, 0.05, 0.1],
      "#e5ddc8",
      { bevel: 0.01 },
    );
  const gl = (name, size, at, rot) => {
    const g = box(greenhouse, name, at, size, "#b7d7bf", {
      material: glassMaterial,
      cast: false,
      bevel: 0.004,
    });
    if (rot) g.rotation.set(...rot);
    return g;
  };
  const gf = (name, size, at, rot) => {
    const f = box(greenhouse, name, at, size, "#eef3e6", {
      material: frameMaterial,
      bevel: 0.01,
      cast: false,
    });
    if (rot) f.rotation.set(...rot);
    return f;
  };
  const wallH = eaveY - 0.36;
  const wallY = 0.36 + wallH / 2;
  gl("Greenhouse glass wall", [gw, wallH, 0.025], [0, wallY, -gd / 2]);
  // South wall in two halves around the door.
  gl(
    "Greenhouse glass wall",
    [(gw - 0.8) / 2, wallH, 0.025],
    [-(gw / 2) + (gw - 0.8) / 4, wallY, gd / 2],
  );
  gl(
    "Greenhouse glass wall",
    [(gw - 0.8) / 2, wallH, 0.025],
    [gw / 2 - (gw - 0.8) / 4, wallY, gd / 2],
  );
  for (const sx of [-1, 1])
    gl("Greenhouse glass wall", [0.025, wallH, gd], [(sx * gw) / 2, wallY, 0]);
  // Frame: corner posts and a post every 0.7 on the long sides.
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4])
    for (const sz of [-1, 1]) {
      if (sz > 0 && Math.abs(x) < 0.45) continue;
      gf(
        "Greenhouse aluminum frame",
        [0.05, wallH, 0.05],
        [x, wallY, (sz * gd) / 2],
      );
    }
  for (const sx of [-1, 1])
    for (const z of [-gd / 2, 0, gd / 2])
      gf(
        "Greenhouse aluminum frame",
        [0.05, wallH, 0.05],
        [(sx * gw) / 2, wallY, z],
      );
  for (const y of [0.36, eaveY])
    for (const sz of [-1, 1])
      gf("Greenhouse frame rail", [gw, 0.05, 0.05], [0, y, (sz * gd) / 2]);
  for (const sx of [-1, 1])
    gf("Greenhouse frame rail", [0.05, 0.05, gd], [(sx * gw) / 2, eaveY, 0]);
  // Door: a framed pane, ajar.
  const door = group(greenhouse, "Greenhouse door", [-0.4, 0, gd / 2]);
  door.rotation.y = -0.9;
  box(
    door,
    "Greenhouse door glass",
    [0.4, 0.4 + wallH / 2 - 0.04, 0],
    [0.76, wallH - 0.06, 0.02],
    "#b7d7bf",
    {
      material: glassMaterial,
      cast: false,
      bevel: 0.003,
    },
  );
  for (const x of [0.02, 0.78])
    box(
      door,
      "Greenhouse door frame",
      [x - 0.4 + 0.4 - 0.0, 0.4 + wallH / 2 - 0.04, 0],
      [0.04, wallH, 0.04],
      "#eef3e6",
      { material: frameMaterial, bevel: 0.008 },
    );
  for (const y of [0.4, eaveY - 0.04])
    box(
      door,
      "Greenhouse door frame",
      [0.4, y, 0],
      [0.8, 0.04, 0.04],
      "#eef3e6",
      { material: frameMaterial, bevel: 0.008 },
    );
  // Gabled roof: two glass slopes, rafters, ridge and finials.
  const pitch = Math.atan2(ridgeY - eaveY, gd / 2);
  const slope = Math.hypot(gd / 2, ridgeY - eaveY);
  for (const sz of [-1, 1]) {
    gl(
      "Greenhouse glass roof",
      [gw + 0.1, 0.03, slope],
      [0, (eaveY + ridgeY) / 2 + 0.02, (sz * gd) / 4],
      [-sz * pitch, 0, 0],
    );
    for (const x of [-1.4, -0.7, 0, 0.7, 1.4])
      gf(
        "Greenhouse rafter",
        [0.04, 0.04, slope],
        [x, (eaveY + ridgeY) / 2 + 0.04, (sz * gd) / 4],
        [-sz * pitch, 0, 0],
      );
  }
  gf("Greenhouse ridge rail", [gw + 0.2, 0.07, 0.07], [0, ridgeY + 0.04, 0]);
  for (const sx of [-1, 1]) {
    // Gable ends glazed to the ridge.
    const tri = new THREE.Shape();
    tri.moveTo(-gd / 2, 0);
    tri.lineTo(gd / 2, 0);
    tri.lineTo(0, ridgeY - eaveY);
    tri.closePath();
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), glassMaterial);
    gable.name = "Greenhouse glass gable";
    gable.rotation.y = (sx * Math.PI) / 2;
    gable.position.set((sx * gw) / 2, eaveY, 0);
    greenhouse.add(gable);
    ball(
      greenhouse,
      "Greenhouse finial",
      [sx * (gw / 2 + 0.1), ridgeY + 0.1, 0],
      0.045,
      C.gold,
    );
  }
  // Inside: potting bench, seed trays, trellised vines and hanging baskets.
  box(
    greenhouse,
    "Greenhouse potting bench",
    [0, 0.7, -0.7],
    [2.3, 0.07, 0.42],
    "#b48a5c",
    { bevel: 0.015 },
  );
  for (const x of [-1.05, 1.05])
    box(
      greenhouse,
      "Potting bench leg",
      [x, 0.5, -0.7],
      [0.06, 0.4, 0.4],
      "#8f6a46",
      { bevel: 0.01 },
    );
  const pots = [];
  for (let i = 0; i < 9; i++)
    pots.push({
      at: [-0.95 + i * 0.24, 0.8, -0.72],
      scale: [0.075, 0.075, 0.075],
      color: i % 2 ? "#d98b66" : "#c7704f",
    });
  instances(greenhouse, "Greenhouse clay pots", unitBall(), pots);
  const seedlings = [];
  for (let i = 0; i < 9; i++)
    seedlings.push({
      at: [-0.95 + i * 0.24, 0.9, -0.72],
      scale: [0.07, 0.07, 0.07],
      color: "#79ac5d",
    });
  instances(greenhouse, "Greenhouse seedlings", unitBall(), seedlings, {
    cast: false,
  });
  for (const x of [-0.55, 0.55]) {
    const row = group(greenhouse, "Greenhouse vine row", [x, 0.36, 0.25]);
    box(
      row,
      "Greenhouse growing trough",
      [0, 0.08, 0],
      [0.5, 0.16, 0.95],
      "#a37b50",
      { bevel: 0.02 },
    );
    box(
      row,
      "Greenhouse trough soil",
      [0, 0.15, 0],
      [0.42, 0.03, 0.86],
      C.soil,
      { bevel: 0.01 },
    );
    for (let k = 0; k < 3; k++) {
      const vine = group(row, "Growing cucumber vine", [
        0,
        0.16,
        -0.3 + k * 0.3,
      ]);
      cyl(
        vine,
        "Greenhouse trellis post",
        [0, 0.5, 0],
        0.014,
        0.014,
        1.0,
        "#c9a56e",
        { segments: 5, cast: false },
      );
      cone(vine, "Cucumber vine foliage", [0, 0.45, 0], 0.17, 0.9, "#557e50", {
        segments: 9,
      });
      for (let q = 0; q < 5; q++) {
        const a = q * 2.3 + k;
        ball(
          vine,
          "Cucumber vine leaf",
          [Math.cos(a) * 0.11, 0.2 + q * 0.17, Math.sin(a) * 0.11],
          0.075,
          q % 2 ? "#6a9a5c" : "#4d7a49",
          {
            scale: [1, 0.55, 1],
          },
        );
      }
      cyl(
        vine,
        "Hanging cucumber",
        [0.13, 0.4, 0.04],
        0.032,
        0.026,
        0.14,
        "#5f8f3d",
        { segments: 8 },
      );
      crops.push(vine);
    }
    for (const sz of [-1, 1])
      cyl(
        row,
        "Trellis string",
        [0, 0.9, sz * 0.3],
        0.005,
        0.005,
        1.0,
        "#e9e2cf",
        { segments: 4, cast: false },
      );
  }
  for (const [x, z] of [
    [-0.9, -0.2],
    [0.9, -0.2],
    [0, 0.3],
  ]) {
    cyl(greenhouse, "Basket chain", [x, 1.5, z], 0.006, 0.006, 0.5, "#596869", {
      segments: 4,
      cast: false,
    });
    cyl(greenhouse, "Hanging basket", [x, 1.22, z], 0.12, 0.07, 0.1, "#a37b50");
    ball(greenhouse, "Hanging basket plant", [x, 1.28, z], 0.13, "#6aa05a", {
      scale: [1, 0.7, 1],
    });
  }
  // Garden furniture and tools around the glasshouse.
  const bench = group(garden, "Garden bench", [1.0, 0, -0.18]);
  box(bench, "Garden bench seat", [0, 0.28, 0], [0.8, 0.05, 0.26], C.wood, {
    bevel: 0.015,
  });
  box(bench, "Garden bench back", [0, 0.5, -0.12], [0.8, 0.28, 0.04], C.wood, {
    bevel: 0.015,
  });
  for (const x of [-0.34, 0.34])
    box(bench, "Garden bench leg", [x, 0.14, 0], [0.05, 0.28, 0.22], C.navy, {
      bevel: 0.01,
    });
  const barrel = group(garden, "Rain barrel", [-1.2, 0, -2.5]);
  cyl(barrel, "Rain barrel body", [0, 0.28, 0], 0.17, 0.17, 0.5, "#8f6a46", {
    segments: 12,
  });
  for (const y of [0.12, 0.44])
    cyl(barrel, "Barrel hoop", [0, y, 0], 0.18, 0.18, 0.03, "#5d6a66", {
      segments: 12,
    });
  // Wheelbarrow and watering can.
  const wheelbarrow = group(garden, "Garden wheelbarrow", [1.25, 0, -2.45]);
  box(
    wheelbarrow,
    "Wheelbarrow tray",
    [0, 0.25, 0],
    [0.4, 0.14, 0.26],
    C.coral,
    { rotation: [0, 0, -0.1], bevel: 0.03 },
  );
  cyl(
    wheelbarrow,
    "Wheelbarrow wheel",
    [0.26, 0.1, 0],
    0.1,
    0.1,
    0.05,
    C.navy,
    { rotation: [Math.PI / 2, 0, 0], segments: 12 },
  );
  for (const sz of [-1, 1])
    box(
      wheelbarrow,
      "Wheelbarrow handle",
      [-0.32, 0.26, sz * 0.1],
      [0.3, 0.025, 0.025],
      C.woodDark,
      { rotation: [0, 0, 0.18], bevel: 0.006 },
    );
  const can = group(garden, "Watering can", [-0.55, 0, 2.25]);
  cyl(can, "Watering can body", [0, 0.09, 0], 0.07, 0.07, 0.16, "#7cb0a6");
  cyl(
    can,
    "Watering can spout",
    [0.11, 0.15, 0],
    0.012,
    0.02,
    0.18,
    "#7cb0a6",
    { rotation: [0, 0, -0.9], segments: 6 },
  );
  // A scarecrow in the north-east bed, in teal and a straw hat.
  const scare = group(garden, "Garden scarecrow", [1.18, 0.24, 1.95]);
  cyl(scare, "Scarecrow pole", [0, 0.38, 0], 0.018, 0.018, 0.76, C.woodDark, {
    segments: 6,
  });
  box(scare, "Scarecrow shirt", [0, 0.52, 0], [0.2, 0.22, 0.1], C.teal, {
    bevel: 0.03,
  });
  box(scare, "Scarecrow arms", [0, 0.58, 0], [0.5, 0.04, 0.04], C.woodDark, {
    bevel: 0.01,
  });
  ball(scare, "Scarecrow head", [0, 0.76, 0], 0.07, "#e6cf9f");
  cyl(scare, "Scarecrow hat brim", [0, 0.82, 0], 0.13, 0.13, 0.015, "#e3b451", {
    segments: 14,
  });
  cyl(scare, "Scarecrow hat crown", [0, 0.87, 0], 0.06, 0.07, 0.09, "#e3b451", {
    segments: 12,
  });
  // Beehive on a stand at the north-east corner.
  const hive = group(garden, "Garden beehive", [1.25, 0, -0.55]);
  for (const x of [-0.1, 0.1])
    box(hive, "Hive stand leg", [x, 0.1, 0], [0.04, 0.2, 0.3], C.woodDark, {
      bevel: 0.01,
    });
  for (let i = 0; i < 3; i++)
    box(
      hive,
      "Hive box",
      [0, 0.26 + i * 0.15, 0],
      [0.3, 0.14, 0.34],
      i % 2 ? "#f6e6c8" : "#fff2d8",
      { bevel: 0.015 },
    );
  box(hive, "Hive roof", [0, 0.52, 0], [0.36, 0.05, 0.4], C.teal, {
    bevel: 0.015,
  });
  // Two orchard trees: the cay's old apple grove, kept in the garden corner.
  const trees = [];
  for (const [x, z, s] of [
    [-1.1, -2.55, 0.55],
    [1.0, 2.2, 0.0],
  ]) {
    if (!s) continue;
    const t = group(garden, "Garden apple tree", [x, 0, z]);
    t.scale.setScalar(s);
    world?.kit?.tree?.(t, 5);
    trees.push(t);
  }
  // Butterflies working the flower borders.
  const butterflies = [];
  const wing = new THREE.PlaneGeometry(0.1, 0.07);
  wing.translate(0.05, 0, 0);
  for (let i = 0; i < 4; i++) {
    const b = group(garden, "Garden butterfly", [0, 0.6, 1]);
    const color = ["#f8cb68", "#fff2d8", "#ed8970", "#9ec8e8"][i];
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const left = new THREE.Mesh(wing, m);
    const right = new THREE.Mesh(wing, m);
    right.scale.x = -1;
    for (const w of [left, right]) {
      w.rotation.x = -Math.PI / 2;
      b.add(w);
    }
    b.userData.wings = [left, right];
    b.userData.seed = i * 1.7;
    butterflies.push(b);
  }
  return { garden, crops, greenhouse, butterflies, fountain };
}

// ----------------------------------------------------------------- grounds --
// The lawns between the buildings: the helipad, the lay-by, the old orchard's
// apple trees, palms where the beach begins, and places to sit.
export const HELIPAD = Object.freeze([3.8, 5.2]);
function buildGrounds(estate, world) {
  const grounds = group(estate, "Pickle Cay grounds");
  const top = GROUND + 0.04;
  // Helipad: a round paved pad with its H, ring and corner lights.
  const pad = group(grounds, "Island helipad", [HELIPAD[0], top, HELIPAD[1]]);
  cyl(
    pad,
    "Port to pickle shop lane helipad",
    [0, 0, 0],
    0.98,
    1.0,
    0.05,
    "#d9cfb6",
    {
      segments: 28,
      cast: false,
    },
  );
  cyl(pad, "Helipad ring", [0, 0.03, 0], 0.88, 0.88, 0.012, "#fff2d8", {
    segments: 28,
    cast: false,
  });
  cyl(pad, "Helipad ring", [0, 0.036, 0], 0.8, 0.8, 0.012, "#d9cfb6", {
    segments: 28,
    cast: false,
  });
  for (const x of [-0.2, 0.2])
    box(pad, "Helipad H", [x, 0.045, 0], [0.07, 0.012, 0.5], C.coral, {
      cast: false,
      bevel: 0.003,
    });
  box(pad, "Helipad H", [0, 0.045, 0], [0.4, 0.012, 0.07], C.coral, {
    cast: false,
    bevel: 0.003,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cyl(
      pad,
      "Helipad light",
      [Math.cos(a) * 0.93, 0.04, Math.sin(a) * 0.93],
      0.03,
      0.03,
      0.04,
      C.gold,
      {
        segments: 8,
        cast: false,
      },
    );
  }
  // Lay-by bays beside the lane, painted for two vans.
  for (const z of [3.5, 4.15, 4.8])
    box(
      grounds,
      "Lay-by bay line",
      [1.6, top + 0.02, z],
      [1.5, 0.012, 0.035],
      "#fff2d8",
      {
        cast: false,
        bevel: 0.003,
      },
    );
  // Trees: the apple grove, and palms at the beach's edge.
  const tree = (x, z, size, seed) => {
    const t = group(grounds, "Island apple tree", [x, GROUND - 0.08, z]);
    t.scale.setScalar(size);
    t.rotation.y = seed * 1.7;
    world?.kit?.tree?.(t, seed);
    return t;
  };
  tree(-3.3, 5.3, 0.62, 3);
  tree(-2.35, 5.65, 0.52, 4);
  tree(-4.35, 5.05, 0.5, 8);
  tree(-4.55, -1.85, 0.5, 11);
  const palm = (x, z, size, seed) => {
    const t = group(grounds, "Island coconut palm", [x, 0.1, z]);
    t.scale.setScalar(size);
    t.rotation.y = seed;
    world?.kit?.palm?.(t, Math.round(seed * 7));
  };
  palm(5.2, 0.9, 0.8, 1.4);
  palm(-4.9, 3.9, 0.8, 2.6);
  palm(4.75, -2.0, 0.75, 0.6);
  // A picnic table and benches under the apple trees by the quay lane.
  const picnic = group(grounds, "Island picnic table", [-2.85, GROUND, 4.55]);
  box(picnic, "Picnic table top", [0, 0.34, 0], [0.9, 0.05, 0.4], C.wood, {
    bevel: 0.015,
  });
  for (const sz of [-1, 1]) {
    box(
      picnic,
      "Picnic bench",
      [0, 0.2, sz * 0.36],
      [0.9, 0.04, 0.16],
      "#a6825d",
      { bevel: 0.012 },
    );
    for (const sx of [-1, 1])
      box(
        picnic,
        "Picnic leg",
        [sx * 0.34, 0.17, sz * 0.2],
        [0.04, 0.34, 0.04],
        C.woodDark,
        { bevel: 0.008 },
      );
  }
  box(picnic, "Picnic cloth", [0, 0.37, 0], [0.5, 0.01, 0.34], C.coral, {
    cast: false,
    bevel: 0.003,
  });
  cyl(picnic, "Picnic jar", [0.1, 0.45, 0], 0.045, 0.045, 0.12, "#8ca36c");
  // Shrub clumps with blooms soften the building corners.
  const shrubs = [],
    blooms = [];
  const clump = (x, z, n, spread = 0.28) => {
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + x * 3;
      const r = (i % 3) * 0.1 + 0.05;
      shrubs.push({
        at: [
          x + Math.cos(a) * spread * (r * 3),
          GROUND + 0.1,
          z + Math.sin(a) * spread * (r * 3),
        ],
        scale: [0.17 - (i % 2) * 0.03, 0.14, 0.17 - (i % 2) * 0.03],
        color: ["#5c9a52", "#4c8a4a", "#6aa05a"][i % 3],
      });
      if (i % 2 === 0)
        blooms.push({
          at: [
            x + Math.cos(a + 1) * spread * 0.75,
            GROUND + 0.26,
            z + Math.sin(a + 1) * spread * 0.75,
          ],
          scale: 0.05,
          color: ["#ed8970", "#f8cb68", "#fff2d8", "#d87ca2"][
            ((i / 2) % 4) | 0
          ],
        });
    }
  };
  clump(-1.2, -2.3, 5);
  clump(1.45, -2.3, 5);
  clump(-4.6, 2.35, 4);
  clump(-1.35, 5.8, 5);
  clump(0.5, 6.55, 4);
  instances(grounds, "Island shrubs", unitBall(), shrubs);
  instances(grounds, "Island shrub blooms", unitBall(), blooms, {
    cast: false,
  });
  return grounds;
}

// ---------------------------------------------------------------- compose --
export function buildPickleIsland(estate, world) {
  const land = buildLand(estate, world);
  const gate = buildGate(estate);
  const lane = buildLane(estate);
  const { quay, pallets } = buildQuay(estate);
  const works = buildWorks(estate, world);
  const garden = buildGarden(estate, world);
  const grounds = buildGrounds(estate, world);
  const bridge = buildBridge(world.world);
  return { land, gate, lane, quay, pallets, works, garden, grounds, bridge };
}

// -------------------------------------------------------------- animation --
export function animateIsland(
  parts,
  { time, active, reducedMotion, wind = 1 },
) {
  const { works, garden } = parts;
  // Steam rises and thins while the line runs.
  works.puffs.forEach((puff, i) => {
    const phase = reducedMotion ? i / 5 : (time * 0.18 + i / 5) % 1;
    const on = active ? 1 : 0;
    puff.visible = on > 0;
    puff.position.set(phase * 0.5 * wind, phase * 1.5, Math.sin(i * 2) * 0.05);
    puff.scale.setScalar(0.1 + phase * 0.26);
    puff.material.opacity = (1 - phase) * 0.55;
  });
  garden.butterflies.forEach((b, i) => {
    if (reducedMotion) {
      b.position.set(Math.sin(i * 2) * 1.0, 0.5 + i * 0.12, 0.6 + i * 0.5);
      return;
    }
    const t = time * 0.35 + b.userData.seed;
    b.position.set(
      Math.sin(t * 1.1) * 1.1 + Math.sin(t * 2.3) * 0.15,
      0.45 + Math.sin(t * 1.7) * 0.12 + 0.12 * i * 0.3,
      0.9 + Math.cos(t * 0.8) * 1.0,
    );
    b.rotation.y = -t * 1.1 + Math.PI / 2;
    const flap = Math.sin(time * 18 + i) * 0.75;
    b.userData.wings[0].rotation.z = flap;
    b.userData.wings[1].rotation.z = -flap;
  });
}
