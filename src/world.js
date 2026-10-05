import {
  ISLANDS,
  MAIN_ISLAND,
  FARM,
  REEF,
  HOME_BUSINESSES,
  CHARGING_STATION_POSITION,
  HARBOR_BERTH,
  LIGHTHOUSE,
} from "../shared/islands.js";
import { roundedIslandGeometry, roadSurfaceGeometry } from "./world-layout.js";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EDGES, NODES, PEOPLE } from "../shared/engine.js";
import { polishWorld } from "./world-polish.js";
import { enrichWorld } from "./world-details.js";
import { extendWorldRealism } from "./world-realism.js";
import { cloudLayout } from "./world-environment.js";
import { createToyKit, paintedGroundTexture } from "./toy-kit.js";
import { personaFor } from "./cast.js";
import { dressWorld } from "./world-dressing.js";
import { beachSkirts } from "./world-water.js";
import { createFountain } from "./world-fountain.js";
import { refineBuildings } from "./world-buildings.js";
import { crateSlot, CRATE_SLOTS } from "./world-freighter.js";
import { applyToyTransport } from "./toy-transport.js";
const C = {
  grass: "#86bd5e",
  grassLight: "#97c96c",
  sand: "#ecd3a0",
  earth: "#b88b64",
  wood: "#967054",
  cream: "#fff2d8",
  teal: "#216f75",
  coral: "#ed8970",
  roof: "#bb5e50",
  navy: "#263e4e",
  gold: "#f8cb68",
  leaf: "#497c61",
  water: "#77b8c9",
};
export function buildWorld() {
  const world = new THREE.Group();
  world.name = "Fullstack Brandon — original procedural island";
  const kit = createToyKit();
  const treeSpots = [];
  const mats = new Map();
  const mat = (c) => {
    if (!mats.has(c))
      mats.set(
        c,
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 }),
      );
    return mats.get(c);
  };
  const geometryCache = new Map();
  function box(parent, name, x, y, z, w, h, d, color, r = 0.06) {
    const key = [w, h, d, r].join();
    if (!geometryCache.has(key))
      geometryCache.set(
        key,
        r
          ? new RoundedBoxGeometry(
              w,
              h,
              d,
              r >= 0.05 && Math.min(w, h, d) >= 0.15 ? 2 : 1,
              Math.min(r, w / 3, h / 3, d / 3),
            )
          : new THREE.BoxGeometry(w, h, d),
      );
    const m = new THREE.Mesh(geometryCache.get(key), mat(color));
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, x, y, z, r, color, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), mat(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function cylinder(parent, x, y, z, rt, rb, h, color, n = 12) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, n),
      mat(color),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sign(parent, text, x, y, z, w = 1.5) {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = C.navy;
    // Long names shrink to fit the board instead of clipping at its edges.
    let size = 58;
    ctx.font = `bold ${size}px sans-serif`;
    while (size > 28 && ctx.measureText(text).width > 456)
      ctx.font = `bold ${(size -= 2)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 70);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
    );
    m.position.set(x, y, z);
    parent.add(m);
  }
  // One generous, rounded main island with room for a real business district.
  for (const layer of [
    {
      name: "Main island sandstone foundation",
      width: 31.5,
      depth: 23.5,
      radius: 5.8,
      y: -1.3,
      height: 1,
      color: C.earth,
    },
    {
      name: "Main island rounded shoreline",
      width: 32,
      depth: 24,
      radius: 6,
      y: -0.3,
      height: 0.48,
      color: C.sand,
    },
    {
      name: "Main island continuous grass",
      width: 30.9,
      depth: 22.9,
      radius: 5.6,
      y: 0.18,
      height: 0.165,
      color: C.grass,
    },
  ]) {
    const land = new THREE.Mesh(
      roundedIslandGeometry(
        layer.width,
        layer.depth,
        layer.radius,
        layer.height,
      ),
      mat(layer.color),
    );
    land.name = layer.name;
    land.position.set(MAIN_ISLAND.x, layer.y, MAIN_ISLAND.z);
    land.castShadow = land.receiveShadow = true;
    world.add(land);
  }
  const roadRectangles = [];
  for (const [a, b, kind] of EDGES) {
    if (
      kind === "bridge" ||
      kind === "causeway" ||
      a.startsWith("farm_") ||
      (a === "nw" && b === "ne")
    )
      continue;
    const p = NODES[a],
      q = b === "harbor_dock" ? [NODES[b][0], 11.2] : NODES[b];
    const horizontal = Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]);
    roadRectangles.push({
      minX: Math.min(p[0], q[0]) - (horizontal ? 0 : 0.825),
      maxX: Math.max(p[0], q[0]) + (horizontal ? 0 : 0.825),
      minZ: Math.min(p[1], q[1]) - (horizontal ? 0.825 : 0),
      maxZ: Math.max(p[1], q[1]) + (horizontal ? 0.825 : 0),
    });
  }
  const roads = new THREE.Mesh(
    roadSurfaceGeometry(roadRectangles),
    mat(C.sand),
  );
  roads.name = "Continuous town roads — no overlapping intersections";
  // Painted variation tiles every four units across lawns, beaches and paths.
  for (const [color, seed, strokes] of [
    [C.grass, 3, true],
    [C.grassLight, 5, true],
    [C.sand, 8, false],
  ]) {
    const map = paintedGroundTexture(seed, strokes);
    if (!map) continue;
    map.repeat.set(0.25, 0.25);
    mat(color).map = map;
  }
  roads.receiveShadow = true;
  world.add(roads);
  // Every island meets the sea on a sloped beach that the tide washes over.
  world.add(beachSkirts(mat(C.sand)));
  function bridge(z, name) {
    const g = new THREE.Group();
    g.name = name;
    world.add(g);
    g.position.set(0, 0.3, z);
    box(g, "bridge deck", 0, 0, 0, 3.3, 0.17, 1.7, C.wood, 0.04);
    for (let x = -1.5; x <= 1.5; x += 0.25)
      box(g, "deck plank", x, 0.1, 0, 0.2, 0.06, 1.66, "#c9976d", 0.01);
    for (const side of [-0.94, 0.94]) {
      box(g, "handrail", 0, 0.61, side, 1.0, 0.11, 0.11, C.cream, 0.02);
      for (const x of [-0.45, 0, 0.45])
        box(g, "railing post", x, 0.33, side, 0.11, 0.68, 0.11, C.cream, 0.015);
    }
    return g;
  }
  const mainBridge = bridge(2, "main bridge");
  bridge(-3.4, "northern scenic crossing");
  const barriers = new THREE.Group();
  world.add(barriers);
  barriers.visible = false;
  for (const x of [-1.35, 1.35]) {
    box(
      barriers,
      "closed bridge barrier",
      x,
      0.96,
      2,
      0.13,
      0.18,
      1.2,
      C.coral,
    );
    for (const z of [1.5, 2.5])
      box(barriers, "barrier leg", x, 0.62, z, 0.14, 0.6, 0.14, C.navy);
  }
  // Café: striped awning, pitched roof, espresso sign, patio furniture.
  const cafe = new THREE.Group();
  cafe.position.set(4, 0.35, -0.25);
  world.add(cafe);
  cafe.name = "Brine & Co. pickle packing room";
  box(cafe, "café walls", 0, 0.76, 0, 2.05, 1.5, 1.65, C.cream, 0.12);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.22, 0);
  roofShape.lineTo(0, 0.72);
  roofShape.lineTo(1.22, 0);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 1.95,
    bevelEnabled: false,
  });
  roofGeo.translate(0, 0, -0.975);
  const roof = new THREE.Mesh(roofGeo, mat(C.roof));
  roof.name = "café roof";
  roof.position.y = 1.5;
  roof.castShadow = true;
  cafe.add(roof);
  // Front faces toward the main route.
  box(cafe, "front door", 0.43, 0.51, -0.84, 0.52, 1, 0.04, C.teal, 0.02);
  box(
    cafe,
    "café window",
    -0.5,
    0.84,
    -0.85,
    0.68,
    0.64,
    0.04,
    "#476777",
    0.03,
  );
  box(
    cafe,
    "window mullion",
    -0.5,
    0.84,
    -0.88,
    0.045,
    0.64,
    0.03,
    C.cream,
    0.01,
  );
  for (let i = 0; i < 8; i++) {
    const awning = box(
      cafe,
      "striped café awning",
      -0.87 + i * 0.25,
      1.18,
      -1.06,
      0.25,
      0.1,
      0.75,
      i % 2 ? C.cream : C.coral,
      0.01,
    );
    awning.rotation.x = -0.2;
    box(
      cafe,
      "awning scallop",
      -0.87 + i * 0.25,
      1.06,
      -1.43,
      0.25,
      0.2,
      0.07,
      i % 2 ? C.cream : C.coral,
      0.045,
    );
  }
  box(cafe, "café sign", 0, 1.53, -0.94, 1.52, 0.36, 0.1, C.cream);
  sign(cafe, "BRINE & CO.", 0, 1.53, -1.001, 1.4);
  cafe.rotation.y = Math.PI;
  for (const x of [9.3, 11.5]) {
    cylinder(world, x, 0.71, 9.7, 0.38, 0.38, 0.09, C.cream);
    cylinder(world, x, 0.52, 9.7, 0.055, 0.07, 0.45, C.wood);
    for (const dx of [-0.52, 0.52]) {
      cylinder(world, x + dx, 0.53, 9.7, 0.17, 0.17, 0.12, C.coral);
      cylinder(world, x + dx, 0.43, 9.7, 0.04, 0.05, 0.18, C.wood);
    }
  }
  // Workshop: sea-green metal roof and a tiny rooftop solar array.
  const workshop = new THREE.Group();
  workshop.position.set(4, 0.35, -5.55);
  world.add(workshop);
  workshop.name = "Brandon workshop";
  box(workshop, "workshop walls", 0, 0.62, 0, 2.15, 1.2, 1.55, "#dbc1a0", 0.08);
  box(workshop, "workshop roof", 0, 1.29, 0, 2.5, 0.2, 1.9, C.teal, 0.07);
  for (let i = -5; i <= 5; i++)
    box(
      workshop,
      "standing seam",
      i * 0.2,
      1.42,
      0,
      0.035,
      0.08,
      1.9,
      "#31858a",
      0.01,
    );
  box(workshop, "workshop door", 0.45, 0.52, 0.8, 0.62, 1, 0.035, C.navy, 0.01);
  box(
    workshop,
    "workshop window",
    -0.5,
    0.74,
    0.8,
    0.6,
    0.45,
    0.035,
    "#709fa9",
    0.01,
  );
  sign(workshop, "BRINE WORKS", 0, 1.04, 0.85, 1.2);
  for (const x of [-0.5, 0.2]) {
    const p = box(
      workshop,
      "solar panel",
      x,
      1.53,
      0,
      0.6,
      0.05,
      1,
      "#355166",
      0.02,
    );
    p.rotation.x = 0.12;
  }
  box(workshop, "wood pile", -1.5, 0.2, 0.25, 0.45, 0.35, 0.9, C.wood, 0.03);
  // Harbor warehouse and a dock.
  const harbor = new THREE.Group();
  harbor.position.set(-5.55, 0.35, 0.05);
  harbor.scale.set(0.62, 1, 0.82);
  world.add(harbor);
  harbor.name = "Harbor supplies";
  box(harbor, "harbor store", 0, 0.6, 0, 1.9, 1.2, 1.6, "#77a5a0", 0.1);
  box(harbor, "harbor roof", 0, 1.25, 0, 2.3, 0.23, 1.9, C.cream, 0.09);
  box(harbor, "store door", 0, 0.5, -0.82, 0.75, 1, 0.04, C.navy, 0.015);
  sign(harbor, "BRINE DEPOT", 0, 1.02, -0.86, 1.35);
  harbor.rotation.y = Math.PI;
  const crates = [];
  for (let i = 0; i < CRATE_SLOTS; i++) {
    const g = box(
      world,
      "supply crate",
      ...crateSlot(i),
      0.42,
      0.42,
      0.42,
      "#c38d55",
      0.025,
    );
    crates.push(g);
    box(g, "crate strap", 0, 0, 0, 0.44, 0.07, 0.44, C.cream, 0.01);
  }
  box(world, "harbor pier", -4, 0.3, 13.3, 3.6, 0.2, 4.2, C.wood, 0.06);
  for (let i = -7; i <= 7; i++)
    box(
      world,
      "pier plank",
      -4 + i * 0.24,
      0.4,
      13.3,
      0.15,
      0.05,
      4.2,
      "#c79971",
      0.01,
    );
  for (const x of [-5.7, -2.3])
    for (const z of [11.3, 13.1, 15.3])
      cylinder(world, x, 0.18, z, 0.08, 0.08, 1, C.cream);
  const boat = new THREE.Group();
  boat.position.set(HARBOR_BERTH[0], -0.63, HARBOR_BERTH[1]);
  world.add(boat);
  box(boat, "boat hull", 0, 0.14, 0, 0.83, 0.44, 1.9, C.coral, 0.3);
  box(boat, "boat interior", 0, 0.39, 0, 0.58, 0.06, 1.25, C.cream, 0.1);
  cylinder(boat, 0, 1.25, 0, 0.035, 0.035, 1.8, C.wood);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0.06, 0.55, 0, 0.06, 2.05, 0, 0.85, 0.55, 0],
      3,
    ),
  );
  sailGeo.computeVertexNormals();
  boat.add(
    new THREE.Mesh(
      sailGeo,
      new THREE.MeshStandardMaterial({
        color: C.cream,
        side: THREE.DoubleSide,
      }),
    ),
  );
  // Harbor lighthouse: a tall striped tower on a rocky islet off the west
  // quay, looking out to sea. Its lamp height is shared with the night beam.
  const lighthouse = new THREE.Group();
  lighthouse.name = "Harbor lighthouse";
  lighthouse.position.set(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
  world.add(lighthouse);
  for (const [x, z, r, sy, color] of [
    [0, 0, 1.55, 0.42, "#a29a8a"],
    [-1.1, 0.7, 0.8, 0.5, "#8f8a7d"],
    [0.95, 0.9, 0.7, 0.55, "#b1a999"],
    [0.6, -1.15, 0.62, 0.5, "#8f8a7d"],
    [-0.9, -0.95, 0.5, 0.6, "#b1a999"],
  ])
    sphere(lighthouse, x, -0.35 + sy * 0.15, z, r, color, 1, sy, 1);
  cylinder(lighthouse, 0, 0.42, 0, 1.0, 1.15, 0.28, "#d8c9a6", 16);
  const towerBase = 0.55,
    towerHeight = 3.7;
  cylinder(
    lighthouse,
    0,
    towerBase + towerHeight / 2,
    0,
    0.42,
    0.72,
    towerHeight,
    C.cream,
    20,
  );
  const towerRadius = (y) => 0.72 - 0.3 * (y / towerHeight);
  for (const [y0, y1] of [
    [0.9, 1.5],
    [2.3, 2.9],
  ])
    cylinder(
      lighthouse,
      0,
      towerBase + (y0 + y1) / 2,
      0,
      towerRadius(y1) + 0.02,
      towerRadius(y0) + 0.02,
      y1 - y0,
      C.coral,
      20,
    );
  box(
    lighthouse,
    "lighthouse door",
    0,
    1.05,
    0.69,
    0.4,
    0.8,
    0.05,
    C.teal,
    0.02,
  );
  for (const [y, z] of [
    [2.3, 0.59],
    [3.2, -0.52],
  ])
    box(
      lighthouse,
      "lighthouse window",
      0,
      y,
      z,
      0.18,
      0.3,
      0.05,
      C.navy,
      0.02,
    );
  const gallery = towerBase + towerHeight;
  cylinder(lighthouse, 0, gallery + 0.05, 0, 0.86, 0.62, 0.16, C.navy, 20);
  cylinder(lighthouse, 0, gallery + 0.2, 0, 0.8, 0.8, 0.06, C.cream, 20);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cylinder(
      lighthouse,
      Math.cos(a) * 0.77,
      gallery + 0.4,
      Math.sin(a) * 0.77,
      0.02,
      0.02,
      0.34,
      C.navy,
      6,
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    cylinder(
      lighthouse,
      Math.cos(a) * 0.36,
      gallery + 0.52,
      Math.sin(a) * 0.36,
      0.035,
      0.035,
      0.6,
      C.gold,
      6,
    );
  }
  sphere(lighthouse, 0, LIGHTHOUSE.lampY, 0, 0.27, C.gold);
  cylinder(lighthouse, 0, gallery + 0.93, 0, 0.1, 0.52, 0.34, C.coral, 20);
  sphere(lighthouse, 0, gallery + 1.16, 0, 0.08, C.gold);
  function tree(x, z, size = 1) {
    if (Math.hypot(x + 10.55, z + 4.3) < 1.8) return;
    const g = new THREE.Group();
    g.name = "Puffy island tree";
    g.position.set(x, 0.35, z);
    g.scale.setScalar(size * (0.73 + (Math.sin(x * 41 + z * 13) + 1) * 0.07));
    g.rotation.y = x * 3.71 + z;
    world.add(g);
    kit.tree(g, Math.abs(Math.round(x * 7 + z * 13)));
    treeSpots.push([x, z]);
  }
  for (const [x, z, s] of [
    [-10.2, -1.5, 1],
    [-10.2, -2.8, 0.85],
    [-2.6, -5.4, 1],
    [2, -5.5, 1.0],
    [5.6, -1, 0.9],
    [5.8, 0.2, 0.65],
    [-5.7, 4.8, 0.7],
    [1.65, 4.65, 0.85],
    [-2.8, 0.2, 0.7],
  ])
    tree(x, z, s);
  // Quiet civic garden and planted outer streets give the larger town breathing room.
  for (const [x, z, size] of [
    [-10.1, 3.4, 1.05],
    [-10, 0.2, 0.9],
    [-10.1, -7.4, 0.9],
    [-2, 9.1, 1.15],
    [2, 9.5, 0.95],
    [0, -10.2, 0.9],
    [10, -10.1, 1],
    [18, -0.5, 1.1],
    [18, 7.8, 1],
    [17.4, -7.5, 0.85],
  ])
    tree(x, z, size);
  // The town fountain: carved basins and GPU-animated water.
  world.add(createFountain(0, 0.345, 8));
  for (const x of [-1.8, 1.8]) {
    box(
      world,
      "Garden bench seat",
      x,
      0.65,
      7.2,
      0.75,
      0.09,
      0.3,
      C.wood,
      0.025,
    );
    box(
      world,
      "Garden bench back",
      x,
      0.84,
      7.03,
      0.75,
      0.32,
      0.07,
      C.wood,
      0.02,
    );
    for (const dx of [-0.26, 0.26])
      box(
        world,
        "Garden bench leg",
        x + dx,
        0.49,
        7.2,
        0.06,
        0.3,
        0.25,
        C.navy,
        0.01,
      );
  }
  const customers = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const g = new THREE.Group();
    const person = PEOPLE[i];
    const position = person.position || [
      5.4 + (i % 2) * 0.35,
      2.0 + Math.floor(i / 2) * 0.4,
    ];
    const business = HOME_BUSINESSES[person.id];
    const doorstep = business
      ? [
          business.position[0] - Math.sin(business.facing) * 1.02,
          business.position[1] - Math.cos(business.facing) * 1.02,
        ]
      : position;
    g.position.set(doorstep[0], 0.39, doorstep[1]);
    if (business) g.rotation.y = business.facing;
    g.name = `${person.name} — ${person.role}`;
    g.userData.personId = person.id || person.name;
    g.userData.customer = person;
    world.add(g);
    customers.push(g);
  }
  // Thick toy-like gable: two rounded slabs, cream gable ends, ridge cap and a
  // chimney on the rear slope. Eaves stay within the old roof footprint.
  function gableRoof(parent, y, color, glazed) {
    const roof = new THREE.Group();
    roof.name = "shop pitched roof";
    roof.position.y = y;
    parent.add(roof);
    const pitch = 0.5,
      run = 0.965,
      thick = 0.15,
      rise = run * Math.tan(pitch);
    for (const side of [-1, 1]) {
      const slope = box(
        roof,
        glazed ? "greenhouse roof glazing" : "shop roof slope",
        0,
        rise / 2 + thick / 2,
        (side * run) / 2,
        2.92,
        thick,
        run / Math.cos(pitch) + 0.1,
        glazed ? "#abc9be" : color,
        0.06,
      );
      slope.rotation.x = side * pitch;
      const shape = new THREE.Shape();
      shape.moveTo(-0.825, 0);
      shape.lineTo(0.825, 0);
      shape.lineTo(0, 0.825 * Math.tan(pitch));
      shape.closePath();
      const gable = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.06,
          bevelEnabled: true,
          bevelThickness: 0.015,
          bevelSize: 0.015,
          bevelSegments: 2,
        }).rotateY(Math.PI / 2),
        mat(C.cream),
      );
      gable.name = "shop gable end";
      gable.position.set(side * 1.25 - 0.03, 0, 0);
      gable.castShadow = gable.receiveShadow = true;
      roof.add(gable);
    }
    const ridge = cylinder(
      roof,
      0,
      rise + thick,
      0,
      0.07,
      0.07,
      3.02,
      color,
      16,
    );
    ridge.name = "shop roof ridge cap";
    ridge.rotation.z = Math.PI / 2;
    ridge.material = mat(
      new THREE.Color(color).multiplyScalar(0.82).getStyle(),
    );
    if (!glazed) {
      box(
        roof,
        "shop chimney",
        0.82,
        rise * 0.62,
        -0.42,
        0.24,
        0.62,
        0.24,
        "#d8b996",
        0.04,
      );
      box(
        roof,
        "shop chimney cap",
        0.82,
        rise * 0.62 + 0.33,
        -0.42,
        0.32,
        0.07,
        0.32,
        "#9c7b63",
        0.025,
      );
    }
    return roof;
  }
  const businesses = [];
  for (const [id, business] of Object.entries(HOME_BUSINESSES)) {
    const g = new THREE.Group();
    g.name = PEOPLE.find((p) => p.id === id)?.role || business.sign;
    g.userData.businessId = id;
    g.position.set(business.building[0], 0.345, business.building[1]);
    g.rotation.y = business.facing;
    world.add(g);
    businesses.push(g);
    const height = id === "wynn" ? 2.35 : id === "maya" ? 1.55 : 1.7;
    box(g, "shop foundation", 0, 0.05, 0, 2.84, 0.1, 1.82, "#cdbf9f", 0.045);
    box(
      g,
      "shop walls",
      0,
      height / 2 + 0.05,
      0,
      2.6,
      height,
      1.65,
      C.cream,
      0.08,
    );
    box(
      g,
      "shop eave band",
      0,
      height + 0.04,
      0,
      2.7,
      0.1,
      1.74,
      business.color,
      0.04,
    );
    gableRoof(g, height + 0.09, business.color, id === "maya");
    box(g, "shop door", 0.58, 0.6, 0.839, 0.52, 1.1, 0.026, C.teal, 0.018);
    box(
      g,
      "shop display window",
      -0.5,
      0.87,
      0.843,
      1.2,
      0.73,
      0.035,
      "#729ea5",
      0.03,
    );
    // Finished side and rear elevations keep each shop readable while orbiting.
    for (const x of [-0.67, 0.67]) {
      box(
        g,
        "rear shop window",
        x,
        0.99,
        -0.846,
        0.64,
        0.7,
        0.03,
        "#729ea5",
        0.025,
      );
      box(
        g,
        "rear window mullion",
        x,
        0.99,
        -0.868,
        0.035,
        0.7,
        0.02,
        C.cream,
        0.004,
      );
      box(
        g,
        "rear window sill",
        x,
        0.63,
        -0.875,
        0.76,
        0.065,
        0.1,
        business.color,
        0.012,
      );
      for (const dx of [-0.39, 0.39])
        box(
          g,
          "painted window shutter",
          x + dx,
          0.99,
          -0.852,
          0.1,
          0.72,
          0.04,
          business.color,
          0.008,
        );
    }
    for (const side of [-1, 1]) {
      box(
        g,
        "side shop window",
        side * 1.315,
        1.03,
        -0.04,
        0.03,
        0.64,
        0.82,
        "#729ea5",
        0.02,
      );
      box(
        g,
        "side window frame",
        side * 1.336,
        1.03,
        -0.04,
        0.018,
        0.66,
        0.04,
        C.cream,
        0.003,
      );
      box(
        g,
        "side window sill",
        side * 1.34,
        0.69,
        -0.04,
        0.11,
        0.06,
        0.93,
        business.color,
        0.012,
      );
    }
    for (const x of [-0.86, -0.48, -0.1]) {
      box(g, "window frame", x, 0.87, 0.87, 0.035, 0.74, 0.03, C.cream, 0.005);
      cylinder(g, x, 0.65, 0.91, 0.065, 0.06, 0.15, C.gold, 8);
    }
    for (let i = 0; i < 10; i++)
      box(
        g,
        "shop striped awning",
        -1.17 + i * 0.26,
        Math.min(1.3, height - 0.33),
        0.97,
        0.25,
        0.09,
        0.36,
        i % 2 ? C.cream : business.color,
        0.012,
      );
    box(
      g,
      "business sign backing",
      0,
      height + 0.03,
      0.995,
      2.32,
      0.3,
      0.06,
      C.cream,
      0.025,
    );
    sign(g, business.sign, 0, height + 0.03, 1.031, 2.18);
    box(
      g,
      "delivery doorstep",
      0,
      0.05,
      1.05,
      2.65,
      0.1,
      0.43,
      "#d8c6a7",
      0.02,
    );
    for (const x of [-1.14, 1.14]) {
      cylinder(g, x, 0.22, 1, 0.13, 0.1, 0.3, business.color, 8);
      sphere(g, x, 0.48, 1, 0.17, id === "bea" ? C.coral : C.leaf);
    }
    if (id === "wynn")
      for (const x of [-0.78, 0, 0.78])
        box(
          g,
          "inn upper window",
          x,
          1.99,
          0.85,
          0.42,
          0.5,
          0.025,
          C.teal,
          0.02,
        );
  }
  // Fullstack Brandon: a figurine courier. Joint pivots match every seat and pose.
  const brandon = new THREE.Group();
  brandon.name = "Fullstack Brandon";
  world.add(brandon);
  brandon.scale.setScalar(0.52);
  brandon.userData.selectable = true;
  const { body, head, legs, arms, parcel } = kit.courier();
  brandon.add(body);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.43, 0.5, 40),
    new THREE.MeshBasicMaterial({
      color: "#e3ff98",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  brandon.add(ring);
  // Eastbank is now part of the continuous main island.
  for (const z of [2, -3.4]) {
    box(world, "Eastbank causeway", 7, 0.22, z, 2.4, 0.32, 1.3, C.cream);
    for (const dz of [-0.7, 0.7])
      box(world, "causeway curb", 7, 0.48, z + dz, 2.4, 0.12, 0.1, C.cream);
  }
  const market = new THREE.Group();
  market.position.set(11.7, 0.35, 0.05);
  market.scale.set(0.56, 1, 0.78);
  world.add(market);
  box(market, "market hall", 0, 0.65, 0, 2.6, 1.3, 1.6, C.cream, 0.12);
  box(market, "market roof", 0, 1.4, 0, 2.9, 0.28, 1.9, C.teal, 0.14);
  for (let i = 0; i < 10; i++)
    box(
      market,
      "market awning",
      -1.15 + i * 0.25,
      1.1,
      1,
      0.25,
      0.1,
      0.8,
      i % 2 ? C.cream : C.gold,
      0.015,
    );
  sign(market, "PICKLE MARKET", 0, 1.45, 1, 2.3);
  for (let i = 0; i < 3; i++) {
    box(
      market,
      "produce box",
      -0.8 + i * 0.8,
      0.26,
      1.05,
      0.65,
      0.4,
      0.45,
      C.wood,
      0.04,
    );
    for (let j = 0; j < 4; j++)
      sphere(
        market,
        -0.98 + i * 0.8 + (j % 2) * 0.25,
        0.5,
        1 + Math.floor(j / 2) * 0.17,
        0.105,
        [C.coral, C.gold, C.leaf][i],
      );
  }
  const station = new THREE.Group();
  station.position.set(
    CHARGING_STATION_POSITION[0],
    0.35,
    CHARGING_STATION_POSITION[1],
  );
  station.name = "Electric vehicle charging station";
  world.add(station);
  box(station, "station plinth", 0, 0.08, 0, 2.8, 0.16, 1.7, C.cream);
  for (const x of [-1, 1])
    cylinder(station, x, 0.9, 0, 0.06, 0.08, 1.8, C.teal);
  box(station, "solar canopy", 0, 1.85, 0, 3.2, 0.16, 1.3, C.navy);
  for (let i = 0; i < 6; i++)
    box(
      station,
      "solar cells",
      -1.25 + i * 0.5,
      1.95,
      0,
      0.43,
      0.03,
      1.2,
      "#486d88",
      0.015,
    );
  box(station, "charging pedestal", 0, 0.55, 0.25, 0.48, 1.1, 0.4, C.teal);
  box(station, "charging display", 0, 0.8, 0.46, 0.3, 0.25, 0.02, "#b6f7b3");
  sign(station, "RECHARGE", 0, 1.56, 0.75, 1.75);
  const cable = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.025, 6, 16),
    mat(C.navy),
  );
  cable.position.set(0.34, 0.56, 0.43);
  station.add(cable);
  for (const [x, z] of [
    [12, -5.3],
    [12, 4.5],
    [8.2, 4.6],
    [8, -1],
  ])
    tree(x, z, 0.9);
  // Promenade: benches, street lamps, planters and a pocket park.
  for (const x of [16.7, 18.1]) {
    box(world, "park bench", x, 0.68, 4.5, 0.95, 0.12, 0.35, C.wood);
    box(world, "bench back", x, 0.92, 4.7, 0.95, 0.35, 0.09, C.wood);
    for (const dx of [-0.35, 0.35])
      box(world, "bench feet", x + dx, 0.5, 4.5, 0.08, 0.4, 0.3, C.navy);
  }
  for (const [x, z] of [
    [-2.5, 3.1],
    [2.7, 3.2],
    [7.8, 2.8],
    [11.1, -2.4],
    [8, -4.35],
  ]) {
    cylinder(world, x, 1.15, z, 0.035, 0.05, 1.6, C.navy);
    box(world, "lantern cap", x, 2, z, 0.32, 0.1, 0.32, C.teal);
    box(world, "lantern glass", x, 1.84, z, 0.2, 0.25, 0.2, C.gold);
    cylinder(world, x, 0.43, z, 0.13, 0.18, 0.18, C.navy);
  }
  const roadCones = new THREE.Group();
  world.add(roadCones);
  for (const z of [1.55, 2, 2.45]) {
    box(roadCones, "cone foot", 7, 0.45, z, 0.3, 0.08, 0.3, C.navy);
    cylinder(roadCones, 7, 0.67, z, 0.025, 0.12, 0.4, C.coral);
    cylinder(roadCones, 7, 0.7, z, 0.066, 0.085, 0.08, C.cream);
  }
  // Articulated delivery van. Forward is +Z; wheel axles are local X.
  const van = new THREE.Group();
  van.name = "Fullstack Brandon electric delivery van";
  world.add(van);
  const chassis = new THREE.Group();
  van.add(chassis);
  box(chassis, "lower body", 0, 0.53, 0, 0.91, 0.5, 1.68, C.teal, 0.15);
  box(chassis, "cargo shell", 0, 1.02, -0.34, 0.9, 0.64, 1.03, C.cream, 0.14);
  box(chassis, "front bonnet", 0, 0.69, 0.68, 0.89, 0.2, 0.32, C.teal, 0.09);
  box(chassis, "cab roof", 0, 1.34, 0.42, 0.94, 0.13, 0.76, C.cream, 0.08);
  for (const x of [-0.42, 0.42]) {
    box(
      chassis,
      "window pillar",
      x,
      1.05,
      0.75,
      0.065,
      0.5,
      0.055,
      C.cream,
      0.01,
    );
    box(
      chassis,
      "rear cab pillar",
      x,
      1.07,
      0.09,
      0.065,
      0.47,
      0.07,
      C.cream,
      0.01,
    );
    box(
      chassis,
      "wing mirror",
      x * 1.23,
      1.02,
      0.64,
      0.15,
      0.12,
      0.16,
      C.navy,
      0.035,
    );
    box(
      chassis,
      "door handle",
      x * 1.1,
      0.79,
      0.18,
      0.025,
      0.035,
      0.16,
      C.navy,
      0.01,
    );
  }
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: "#aee9e6",
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.43),
    glassMaterial,
  );
  glass.position.set(0, 1.07, 0.775);
  chassis.add(glass);
  box(chassis, "front bumper", 0, 0.42, 0.88, 1, 0.13, 0.15, C.cream, 0.06);
  box(chassis, "rear bumper", 0, 0.42, -0.88, 1, 0.12, 0.13, C.navy, 0.04);
  box(chassis, "front grille", 0, 0.6, 0.856, 0.32, 0.14, 0.025, C.navy, 0.02);
  sign(chassis, "B.", 0, 0.81, 0.86, 0.25);
  const headlights = [];
  for (const x of [-0.31, 0.31]) {
    const lamp = box(
      chassis,
      "headlight",
      x,
      0.66,
      0.86,
      0.19,
      0.13,
      0.04,
      C.gold,
      0.04,
    );
    lamp.material = new THREE.MeshStandardMaterial({
      color: "#fff3c0",
      emissive: "#ffcd68",
      emissiveIntensity: 0.5,
    });
    headlights.push(lamp);
    box(
      chassis,
      "rear light",
      x,
      0.68,
      -0.85,
      0.12,
      0.16,
      0.045,
      C.coral,
      0.03,
    );
  }
  for (const side of [-1, 1]) {
    const badge = new THREE.Group();
    badge.position.set(side * 0.457, 1.03, -0.35);
    badge.rotation.y = (side * Math.PI) / 2;
    chassis.add(badge);
    sign(badge, "B. PICKLES", 0, 0, 0.005, 0.82);
    box(
      chassis,
      "side stripe",
      side * 0.461,
      0.8,
      -0.35,
      0.012,
      0.09,
      0.82,
      C.gold,
      0.005,
    );
  }
  const wheels = [];
  for (const x of [-0.47, 0.47])
    for (const z of [-0.55, 0.57]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.28, z);
      chassis.add(wheel);
      wheels.push(wheel);
      const tire = cylinder(wheel, 0, 0, 0, 0.23, 0.23, 0.15, "#253b42", 20);
      tire.rotation.z = Math.PI / 2;
      const hub = cylinder(
        wheel,
        x > 0 ? 0.09 : -0.09,
        0,
        0,
        0.12,
        0.12,
        0.018,
        C.cream,
        16,
      );
      hub.rotation.z = Math.PI / 2;
      box(
        wheel,
        "hub spoke",
        x > 0 ? 0.105 : -0.105,
        0,
        0,
        0.012,
        0.19,
        0.035,
        C.teal,
        0.005,
      );
    }
  for (const x of [-0.3, 0.3])
    box(chassis, "roof rack", x, 1.43, -0.32, 0.05, 0.1, 0.85, C.navy, 0.01);
  const vanCargo = [];
  for (let i = 0; i < 3; i++) {
    const crate = box(
      chassis,
      "roof parcel",
      -0.24 + i * 0.24,
      1.62,
      -0.35,
      0.22,
      0.3,
      0.45,
      "#c69b69",
      0.035,
    );
    box(crate, "parcel band", 0, 0, 0, 0.045, 0.31, 0.46, C.cream, 0.008);
    vanCargo.push(crate);
  }
  // Driver is a miniature copy of the same identifiable character.
  const driver = body.clone(true);
  driver.position.set(-0.17, 0.47, 0.36);
  driver.scale.setScalar(0.52);
  chassis.add(driver);
  box(
    chassis,
    "driver seat",
    -0.17,
    0.7,
    0.21,
    0.28,
    0.42,
    0.12,
    C.navy,
    0.045,
  );
  const steering = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.017, 6, 16),
    mat(C.navy),
  );
  steering.position.set(-0.17, 0.86, 0.63);
  steering.rotation.x = -0.5;
  chassis.add(steering);
  const vanRing = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1.01, 48),
    ring.material.clone(),
  );
  vanRing.rotation.x = -Math.PI / 2;
  vanRing.position.y = 0.015;
  van.add(vanRing);
  // Townspeople share the figurine language with separate arms and legs.
  const person = (g, look) => kit.townsperson(g, look);
  // Shopkeepers are authored characters (src/cast.js); walkers are archetypes.
  customers.forEach((c, i) => person(c, PEOPLE[i].id));
  const pedestrians = [];
  for (let i = 0; i < 13; i++) {
    const g = new THREE.Group();
    g.position.set(0, 0.43, 0);
    world.add(g);
    person(g, i + 1);
    const homeLoops = [
      [
        [-4, 2],
        [-1.5, 2],
        [-1.5, -3.4],
        [-4, -3.4],
        [-4, 2],
      ],
      [
        [1.5, 2],
        [4, 2],
        [10, 2],
        [10, -3.4],
        [4, -3.4],
        [1.5, -3.4],
        [1.5, 2],
      ],
    ];
    const island = Object.values(ISLANDS)[i - 8];
    g.userData.walkPath = island
      ? [
          [island.x - 2.3, island.z],
          [island.x + 2.3, island.z],
          [island.x - 2.3, island.z],
        ]
      : homeLoops[i % 2];
    g.userData.walkOffset = i * 3.83;
    // Each walker strolls at their own persona's pace.
    g.userData.walkSpeed =
      (0.24 + (i % 4) * 0.035) * (personaFor(g.userData.persona).pace || 1);
    pedestrians.push(g);
  }

  const orchardStart = world.children.length;
  // Orchard Cay is deliberately offshore: its stock can only be reached by sailboat.
  box(
    world,
    "Orchard Cay foundation",
    4,
    -0.65,
    13,
    5.1,
    1.1,
    4.8,
    C.earth,
    0.8,
  );
  box(world, "Orchard Cay sand", 4, -0.12, 13, 5.5, 0.55, 5.1, C.sand, 0.8);
  box(
    world,
    "Orchard Cay grass",
    4,
    0.17,
    13,
    4.9,
    0.32,
    4.5,
    C.grassLight,
    0.7,
  );
  box(world, "orchard landing pier", 4, 0.2, 10.65, 1.2, 0.2, 0.9, C.wood);
  for (const x of [3.5, 4.5])
    for (const z of [10.25, 11])
      cylinder(world, x, 0.32, z, 0.06, 0.07, 0.3, C.cream);
  for (const [x, z] of [
    [2.8, 12],
    [3, 14.2],
    [5.1, 14.5],
  ]) {
    tree(x, z, 0.75);
    for (let i = 0; i < 3; i++)
      sphere(
        world,
        x + Math.sin(i * 2) * 0.4,
        1.45,
        z + Math.cos(i * 2) * 0.4,
        0.09,
        C.coral,
      );
  }
  const orchardHut = new THREE.Group();
  orchardHut.position.set(1.7, 0.35, 13.5);
  world.add(orchardHut);
  box(orchardHut, "orchard stand", 0, 0.4, 0, 1.2, 0.8, 0.8, C.cream);
  box(orchardHut, "orchard roof", 0, 0.91, 0, 1.5, 0.2, 1.15, C.coral, 0.08);
  sign(orchardHut, "PICKLE CAY", 0, 0.7, 0.43, 1.1);
  for (const object of world.children.slice(orchardStart)) {
    object.position.x += FARM.x - 4;
    object.position.z += FARM.z - 13;
  }
  const helicopter = new THREE.Group();
  helicopter.name = "Brandon pickle cargo helicopter";
  world.add(helicopter);
  sphere(helicopter, 0, 0.9, 0, 0.65, C.gold, 0.72, 0.8, 1.25);
  sphere(helicopter, 0, 1, 0.52, 0.45, "#44787d", 0.86, 0.8, 0.8);
  box(helicopter, "tail boom", 0, 0.96, -1.12, 0.16, 0.18, 1.4, C.teal, 0.06);
  box(helicopter, "tail fin", 0, 1.24, -1.75, 0.1, 0.6, 0.4, C.teal, 0.04);
  box(helicopter, "tail plane", 0, 1, -1.5, 1.1, 0.07, 0.25, C.cream, 0.04);
  for (const x of [-0.48, 0.48]) {
    box(helicopter, "landing skid", x, 0.25, 0, 0.08, 0.1, 1.8, C.navy, 0.04);
    for (const z of [-0.4, 0.4])
      box(
        helicopter,
        "skid strut",
        x * 0.8,
        0.48,
        z,
        0.07,
        0.5,
        0.07,
        C.navy,
        0.02,
      );
  }
  cylinder(helicopter, 0, 1.6, 0, 0.04, 0.04, 0.5, C.navy);
  const rotor = new THREE.Group();
  rotor.position.y = 1.8;
  helicopter.add(rotor);
  for (const angle of [0, Math.PI / 2]) {
    const blade = box(
      rotor,
      "main rotor",
      0,
      0,
      0,
      3.3,
      0.025,
      0.12,
      C.navy,
      0.015,
    );
    blade.rotation.y = angle;
  }
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.15, 1.27, -1.75);
  helicopter.add(tailRotor);
  for (const angle of [0, Math.PI / 2]) {
    const blade = box(
      tailRotor,
      "tail rotor",
      0,
      0,
      0,
      0.025,
      0.65,
      0.055,
      C.cream,
      0.01,
    );
    blade.rotation.x = angle;
  }
  sign(helicopter, "B. BRINE AIR", 0, 0.68, 0.77, 0.62);
  const pilot = body.clone(true);
  pilot.scale.setScalar(0.52);
  pilot.position.set(0, 0.62, 0.47);
  helicopter.add(pilot);
  // A dedicated aviation pier keeps rotors, road traffic and the packing room apart.
  box(world, "aviation apron", 14.5, 0.2, -4.8, 4, 0.3, 7, C.cream, 0.1);
  box(
    world,
    "airfield causeway",
    13.6,
    0.22,
    -3.4,
    2.4,
    0.32,
    1.7,
    C.wood,
    0.04,
  );
  for (const x of [12.8, 16.2])
    for (const z of [-7.9, -1.7])
      cylinder(world, x, -0.25, z, 0.08, 0.08, 1.25, C.wood);
  cylinder(world, 14.5, 0.42, -3.4, 1.6, 1.6, 0.06, C.navy, 40);
  box(
    world,
    "helipad H left",
    14.14,
    0.465,
    -3.4,
    0.1,
    0.03,
    0.85,
    C.cream,
    0.01,
  );
  box(
    world,
    "helipad H right",
    14.86,
    0.465,
    -3.4,
    0.1,
    0.03,
    0.85,
    C.cream,
    0.01,
  );
  box(
    world,
    "helipad H cross",
    14.5,
    0.465,
    -3.4,
    0.8,
    0.03,
    0.1,
    C.cream,
    0.01,
  );
  const bike = new THREE.Group();
  bike.name = "Folding pickle delivery bicycle";
  world.add(bike);
  const bikeWheels = [];
  for (const z of [-0.48, 0.48]) {
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.33, z);
    bike.add(wheel);
    bikeWheels.push(wheel);
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.035, 8, 24),
      mat(C.navy),
    );
    tire.rotation.y = Math.PI / 2;
    wheel.add(tire);
    for (let i = 0; i < 6; i++) {
      const spoke = box(
        wheel,
        "bicycle spoke",
        0,
        0,
        0,
        0.014,
        0.55,
        0.015,
        C.cream,
        0,
      );
      spoke.rotation.x = (i * Math.PI) / 3;
    }
  }
  function tube(parent, a, b, color, r = 0.035) {
    const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, v.length(), 8),
      mat(color),
    );
    m.position.copy(
      new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5),
    );
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    parent.add(m);
    return m;
  }
  for (const [a, b] of [
    [
      [0, 0.33, -0.48],
      [0, 0.72, -0.18],
    ],
    [
      [0, 0.72, -0.18],
      [0, 0.33, 0],
    ],
    [
      [0, 0.33, 0],
      [0, 0.33, -0.48],
    ],
    [
      [0, 0.72, -0.18],
      [0, 0.78, 0.4],
    ],
    [
      [0, 0.78, 0.4],
      [0, 0.33, 0],
    ],
    [
      [0, 0.78, 0.4],
      [0, 0.33, 0.48],
    ],
  ])
    tube(bike, a, b, C.teal);
  box(bike, "bike saddle", 0, 0.8, -0.18, 0.22, 0.07, 0.26, C.navy, 0.04);
  tube(bike, [0, 0.78, 0.4], [0, 0.99, 0.4], C.navy);
  tube(bike, [-0.24, 1, 0.4], [0.24, 1, 0.4], C.navy, 0.025);
  box(
    bike,
    "pickle cargo basket",
    0,
    0.72,
    -0.62,
    0.5,
    0.32,
    0.4,
    C.wood,
    0.04,
  );
  const rider = body.clone(true);
  rider.position.set(0, 0.65, -0.13);
  rider.scale.setScalar(0.52);
  bike.add(rider);
  // Product details: recognisable pickle jars, barrel storage and rooftop brand icon.
  function pickleJar(parent, x, y, z, size = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(size);
    parent.add(g);
    cylinder(g, 0, 0.2, 0, 0.13, 0.13, 0.38, "#b5cba3", 16);
    cylinder(g, 0, 0.41, 0, 0.14, 0.14, 0.055, C.gold, 16);
    box(g, "jar label", 0, 0.2, 0.132, 0.2, 0.13, 0.012, C.cream, 0.01);
    sphere(g, 0, 0.22, 0.137, 0.05, C.leaf, 0.45, 1, 0.3);
    return g;
  }
  for (let i = 0; i < 5; i++) pickleJar(cafe, -0.8 + i * 0.4, 0.4, -1.45, 0.65);
  const bigPickle = sphere(cafe, 0, 2.4, 0, 0.55, C.leaf, 0.55, 1.3, 0.55);
  bigPickle.rotation.z = 0.2;
  for (let i = 0; i < 8; i++)
    sphere(
      bigPickle,
      Math.sin(i * 2) * 0.25,
      (i % 4) * 0.2 - 0.3,
      Math.cos(i * 2) * 0.25,
      0.05,
      "#9cbc63",
    );
  for (const [x, z] of [
    [-5, 3.8],
    [-5, 4.5],
    [9, 3.5],
  ]) {
    cylinder(world, x, 0.72, z, 0.27, 0.27, 0.7, C.wood, 16);
    for (const y of [0.48, 0.9])
      cylinder(world, x, y, z, 0.28, 0.28, 0.06, C.navy, 16);
  }
  const reefStart = world.children.length;
  box(world, "Reef Island rock", 13, -0.6, 12.5, 5, 1.2, 4.8, C.earth, 0.7);
  box(world, "Reef Island beach", 13, -0.08, 12.5, 5.4, 0.5, 5.2, C.sand, 0.8);
  box(world, "Reef Island lawn", 13, 0.17, 12.5, 4.8, 0.28, 4.5, C.grass, 0.6);
  const beachClub = new THREE.Group();
  beachClub.position.set(13, 0.35, 11.3);
  world.add(beachClub);
  box(beachClub, "beach club", 0, 0.7, 0, 2.6, 1.4, 1.7, C.cream, 0.1);
  box(beachClub, "club roof", 0, 1.5, 0, 3, 0.2, 2.1, C.coral, 0.08);
  sign(beachClub, "REEF BEACH CLUB", 0, 1.2, 1, 2.4);
  box(world, "reef pier", 13, 0.2, 15.1, 1.2, 0.15, 1.05, C.wood);
  for (const [x, z] of [
    [11.4, 12],
    [15, 11.6],
  ])
    tree(x, z, 0.9);

  for (const object of world.children.slice(reefStart)) {
    object.position.x += REEF.x - 13;
    object.position.z += REEF.z - 12.5;
  }

  for (const [id, island] of Object.entries(ISLANDS)) {
    const { x, z, color } = island;
    box(world, `${island.name} rock`, x, -0.7, z, 7, 1.4, 6.7, C.earth, 0.8);
    box(world, `${island.name} beach`, x, -0.12, z, 7.5, 0.6, 7.2, C.sand, 0.9);
    box(
      world,
      `${island.name} lawn`,
      x,
      0.18,
      z,
      6.9,
      0.32,
      6.6,
      id === "ridge" ? "#8da177" : C.grassLight,
      0.8,
    );
    const street = new THREE.Mesh(
      roadSurfaceGeometry(
        [
          { minX: x - 2.75, maxX: x + 2.75, minZ: z - 0.525, maxZ: z + 0.525 },
          { minX: x - 0.5, maxX: x + 0.5, minZ: z, maxZ: z + 3 },
        ],
        0.42,
      ),
      mat(C.sand),
    );
    street.name = `${island.name} continuous streets`;
    street.receiveShadow = true;
    world.add(street);
    for (let j = 0; j < (id === "sunset" || id === "copper" ? 0 : 3); j++) {
      const g = new THREE.Group();
      g.position.set(x - 2 + j * 2, 0.35, z - 1.35);
      world.add(g);
      const h = 0.8 + (j % 2) * 0.6;
      box(g, "district shop", 0, h / 2, 0, 1.45, h, 1.4, C.cream, 0.08);
      box(g, "district roof", 0, h + 0.1, 0, 1.7, 0.2, 1.65, color, 0.06);
      for (const dx of [-0.35, 0.35])
        box(g, "shop window", dx, h * 0.6, 0.71, 0.3, 0.35, 0.03, C.teal, 0.01);
      box(g, "shop door", 0, 0.3, 0.72, 0.3, 0.6, 0.04, C.navy, 0.02);
      if (j === 1) sign(g, island.name.toUpperCase(), 0, h + 0.4, 0.8, 1.8);
    }
    box(world, "island jetty", x, 0.2, z + 3.15, 1.1, 0.2, 1.05, C.wood);
    for (const dx of [-0.6, 0.6])
      for (const dz of [2.8, 3.6])
        cylinder(world, x + dx, 0.38, z + dz, 0.065, 0.065, 0.7, C.cream);
    for (const [dx, dz] of [
      [-2.7, 2],
      [-2.8, -2.6],
      [2.5, -2.7],
    ])
      tree(x + dx, z + dz, id === "ridge" ? 1.3 : 0.85);
    cylinder(world, x + 2, 0.41, z + 1.3, 0.72, 0.72, 0.06, C.navy, 24);
    for (let j = 0; j < 6; j++)
      sphere(world, x - 2.5 + j, 0.44, z + 2.7, 0.07, j % 2 ? C.gold : C.coral);
  }

  const clouds = [];
  for (const cloud of cloudLayout()) {
    const g = new THREE.Group();
    g.name = "Drifting cloud";
    g.position.set(cloud.x, cloud.y, cloud.z);
    g.scale.setScalar(cloud.size);
    g.rotation.y = cloud.rotation;
    g.userData.baseX = g.position.x;
    g.userData.baseZ = g.position.z;
    g.userData.phase = cloud.phase;
    g.userData.speed = cloud.speed;
    for (const puff of cloud.puffs)
      sphere(g, puff.x, puff.y, puff.z, 1, "#f4f5e9", ...puff.scale);
    const cloudMaterials = new Map();
    g.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (!cloudMaterials.has(mesh.material)) {
        const material = mesh.material.clone();
        material.transparent = true;
        material.depthWrite = false;
        cloudMaterials.set(mesh.material, material);
      }
      mesh.material = cloudMaterials.get(mesh.material);
    });
    world.add(g);
    clouds.push(g);
  }
  const finished = extendWorldRealism(
    polishWorld(
      enrichWorld({
        kit,
        treeSpots,
        workshop,
        cafe,
        world,
        helicopter,
        rotor,
        tailRotor,
        bike,
        bikeWheels,
        van,
        chassis,
        wheels,
        vanCargo,
        headlights,
        vanRing,
        roadCones,
        pedestrians,
        brandon,
        body,
        head,
        legs,
        arms,
        parcel,
        ring,
        mainBridge,
        barriers,
        customers,
        businesses,
        roads,
        crates,
        boat,
        clouds,
        materials: mats,
        rider,
        driver,
        pilot,
      }),
    ),
  );
  // Vehicles, gadgets and cargo are re-sculpted to the figurine's proportions.
  return applyToyTransport(
    refineBuildings(dressWorld(finished, kit, roadRectangles)),
  );
}
