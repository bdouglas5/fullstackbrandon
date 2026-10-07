import * as THREE from "three";
import { recolorFigurine } from "./figurine.js";
import { dressFigurine } from "./figurine-dress.js";
import { BUILDERS } from "./cast.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FARM, ISLANDS, HOME_GARAGE } from "../shared/islands.js";
import { setFarmExpanded, FARM_SHORE } from "./world-water.js";
import {
  buildPickleIsland,
  animateIsland,
  quaySlot,
  QUAY_SLOTS,
  GROUND,
} from "./world-pickle-island.js";
import { animateCharacter } from "./world-animation.js";
import { buildRocketSkates } from "./toy-vehicles.js";
import { SEAT } from "./toy-scale.js";
import {
  buildFreighter,
  createFogFade,
  poseCrane,
  crateSlot,
  CRATE_SLOTS,
} from "./world-freighter.js";
import { resolveTrafficPositions, transportRadius } from "../shared/traffic.js";

// Where the freighter ties up (centre, approach drift, pier side).
const HARBOR_SHIP_BERTH = { x: -7.95, z: 17.5, dx: -6, mirror: 1, yaw: 0 };
// At the island it lies along the quay at the back (south shore), its crane
// side to the island, its hull clear of the sea wall.
const FARM_BERTH = {
  x: FARM.x + 1.8,
  z: FARM.z + 9.25,
  dx: 6,
  mirror: 1,
  yaw: Math.PI / 2,
};
const UNLOAD_TICKS = 36;
const FOG_IN_SECONDS = 7;
const FOG_OUT_SECONDS = 6;
const clamp = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};
const materials = new Map();
function mat(color) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
    );
  return materials.get(color);
}
function box(parent, name, position, size, color) {
  const bevel = Math.min(0.04, ...size.map((v) => v / 4));
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(...size, 1, bevel),
    mat(color),
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function group(parent, name, position = [0, 0, 0]) {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(...position);
  node.userData.dynamic = true;
  parent.add(node);
  return node;
}
function cylinder(parent, name, position, radius, height, color) {
  const node = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    mat(color),
  );
  node.name = name;
  node.position.set(...position);
  node.castShadow = true;
  parent.add(node);
  return node;
}
function label(parent, words, position, width = 2.5) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff3d7";
  ctx.fillRect(0, 0, 768, 160);
  ctx.fillStyle = "#245657";
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(words, 384, 80, 736);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4.8),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
  sign.name = words;
  sign.position.set(...position);
  parent.add(sign);
}
function rocketRig(parent, body, name) {
  const root = group(parent, name);
  root.visible = false;
  const pilot = body.clone(true);
  pilot.scale.setScalar(0.52);
  pilot.position.set(...SEAT.rocket_skates.position);
  root.add(pilot);
  // Sculpted boots, wheels and turbines sized to the figurine's feet.
  const { exhaust } = buildRocketSkates(root);
  return { root, pilot, exhaust, wheels: [] };
}
export function extendWorldRealism(w) {
  w.cafe.userData.dynamic = true;
  const officeBuild = group(
    w.world,
    "Brandon pickle office construction",
    [4, 0.43, -0.25],
  );
  officeBuild.visible = false;
  for (const x of [-1.25, 1.25])
    for (const z of [-1, 1])
      box(
        officeBuild,
        "Office scaffolding upright",
        [x, 1, z],
        [0.06, 2, 0.06],
        "#b3bca8",
      );
  for (const side of [-1, 1])
    box(
      officeBuild,
      "Office scaffold platform",
      [0, 1.3, side],
      [2.7, 0.09, 0.4],
      "#b58a5b",
    );
  label(officeBuild, "FUTURE PICKLE OFFICE", [0, 1.75, 1.25], 2.5);
  const skates = rocketRig(w.world, w.body, "Brandon rocket skates");
  w.rocketSkates = skates.root;
  w.skater = skates.pilot;
  w.skateExhaust = skates.exhaust;
  w.driver.name = "Brandon van driver";
  w.chassis.name = "Van suspension chassis";
  w.wheels.forEach((wheel, i) => {
    wheel.name = `Van wheel ${i}`;
    wheel.userData.restPosition = wheel.position.toArray();
  });
  const originalCrew = w.createCrew;
  w.createCrew = (member) => {
    const rig = originalCrew(member);
    const van = w.van.clone(true);
    van.name = `${member.name} delivery van`;
    van.userData.dynamic = true;
    van.visible = false;
    van.getObjectByName("Brandon van driver")?.removeFromParent();
    const chassis = van.getObjectByName("Van suspension chassis");
    const driver = rig.body.clone(true);
    driver.position.copy(w.driver.position);
    driver.scale.copy(w.driver.scale);
    chassis.add(driver);
    w.world.add(van);
    const skates = rocketRig(w.world, rig.body, `${member.name} rocket skates`);
    Object.assign(rig, {
      van,
      driver,
      chassis,
      wheels: [0, 1, 2, 3].map((i) => van.getObjectByName(`Van wheel ${i}`)),
      rocketSkates: skates.root,
      skater: skates.pilot,
      skateExhaust: skates.exhaust,
    });
    return rig;
  };
  w.repairRig = group(w.world, "Roadside tire service");
  w.repairRig.visible = false;
  const jack = group(w.repairRig, "Hydraulic jack");
  box(
    jack,
    "Jack floor plate",
    [-0.56, 0.05, -0.55],
    [0.34, 0.08, 0.34],
    "#ca7757",
  );
  const piston = cylinder(
    jack,
    "Jack lifting piston",
    [-0.56, 0.19, -0.55],
    0.055,
    0.3,
    "#9caeb0",
  );
  box(
    jack,
    "Jack lifting saddle",
    [-0.56, 0.35, -0.55],
    [0.22, 0.07, 0.2],
    "#374f58",
  );
  const pump = group(w.repairRig, "Tire pump", [-1.1, 0, 0.04]);
  box(pump, "Pump base", [0, 0.04, 0], [0.26, 0.08, 0.15], "#314853");
  cylinder(pump, "Pump barrel", [0, 0.23, 0], 0.045, 0.35, "#c0c6b7");
  const handle = box(
    pump,
    "Pump handle",
    [0, 0.48, 0],
    [0.3, 0.04, 0.04],
    "#e4b96d",
  );
  const hose = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.012, 5, 16, Math.PI),
    mat("#293e4b"),
  );
  hose.rotation.z = Math.PI / 2;
  hose.position.set(0.19, 0.21, 0);
  pump.add(hose);
  const wrench = box(
    w.repairRig,
    "Wheel wrench",
    [-0.94, 0.34, -0.53],
    [0.04, 0.25, 0.045],
    "#bdc8c8",
  );
  const patch = box(
    w.repairRig,
    "Rubber tire patch",
    [-0.94, 0.15, -0.81],
    [0.14, 0.035, 0.1],
    "#213d41",
  );
  w.repairParts = { jack, piston, pump, handle, wrench, patch };
  // All construction objects retain transforms and visibility through batching.
  const estate = group(w.world, "Brandon private pickle island", [
    FARM.x,
    0,
    FARM.z,
  ]);
  estate.visible = false;
  // Pickle Cay is one plan: see world-pickle-island.js.
  const orchard = w.world.children.filter(
    (o) =>
      o !== estate &&
      Math.abs(o.position.x - FARM.x) < 3.4 &&
      Math.abs(o.position.z - FARM.z) < 3.6,
  );
  // The orchard cay's own beach slope steps aside with it.
  const oldBeach =
    w.world.getObjectByName("Tidal beaches")?.children[FARM_SHORE];
  if (oldBeach) orchard.push(oldBeach);
  // Kept out of the static batches so the old orchard can step aside.
  for (const o of orchard) o.userData.dynamic = true;
  const island = buildPickleIsland(estate, w);
  const {
    land,
    works: { shop, walls, roof, factory, vats, jars },
    garden: { garden, crops, greenhouse },
    bridge: causeway,
    pallets: portStock,
  } = island;
  const contractor = group(estate, "Cay Construction crew", [
    -0.1,
    GROUND,
    2.4,
  ]);
  const builders = [];
  for (let i = 0; i < 2; i++) {
    const person = w.body.clone(true);
    person.name = "Contractor with safety helmet";
    person.position.set(i * 1.2, 0, 0);
    dressFigurine(person, {
      ...BUILDERS[i],
      color: "#edbc55",
      trim: "#fff3d0",
    });
    person.scale.multiplyScalar(0.52);
    contractor.add(person);
    builders.push(person);
  }
  const crane = group(contractor, "Island construction crane", [2, 0, 0.7]);
  box(crane, "Crane tower", [0, 1.75, 0], [0.3, 3.5, 0.3], "#e3b451");
  const jib = box(
    crane,
    "Crane rotating jib",
    [-1, 3.5, 0],
    [3.8, 0.2, 0.2],
    "#ecc35b",
  );
  const hook = cylinder(
    crane,
    "Crane lifting cable",
    [-2.6, 2.45, 0],
    0.015,
    2,
    "#596869",
  );
  for (let i = 0; i < 5; i++)
    box(
      contractor,
      "Contractor lumber",
      [-0.4, 0.1 + i * 0.09, 1.1],
      [1.2, 0.08, 0.24],
      "#b99166",
    );
  label(contractor, "CAY CONSTRUCTION", [0, 1.55, 0.2], 2.6);
  // Crates the freighter's crane sets on the quay's receiving pallets.
  const quayCrates = Array.from({ length: QUAY_SLOTS }, (_, i) => {
    const crate = box(
      w.world,
      "Island quay crate",
      [0, 0, 0],
      [0.4, 0.34, 0.4],
      "#c38d55",
    );
    box(crate, "Quay crate strap", [0, 0, 0], [0.42, 0.06, 0.42], "#efe5cb");
    box(crate, "Quay crate strap", [0, 0, 0], [0.06, 0.36, 0.42], "#efe5cb");
    crate.visible = false;
    return crate;
  });
  const importShip = group(w.world, "Supplier shipment vessel");
  importShip.rotation.order = "YXZ";
  const freighter = buildFreighter(importShip);
  const { jib: cargoJib, cable: cargoCable, crate: cargoBox } = freighter;
  const shipFade = createFogFade(importShip);
  // The developer is an actual island business Brandon can visit and negotiate with.
  const developer = group(w.world, "Cay Development Company", [
    ISLANDS.copper.x - 2,
    0.43,
    ISLANDS.copper.z - 1.55,
  ]);
  box(
    developer,
    "Island developer office",
    [0, 0.65, 0],
    [1.7, 1.3, 1.2],
    "#e6d2af",
  );
  box(
    developer,
    "Developer office teal canopy",
    [0, 1.38, 0],
    [1.9, 0.16, 1.4],
    "#386f73",
  );
  label(developer, "CAY DEVELOPMENT CO.", [0, 1.15, 0.62], 1.7);
  box(
    developer,
    "Island negotiation table",
    [0, 0.42, 1],
    [0.65, 0.07, 0.4],
    "#a4815e",
  );
  const broker = w.body.clone(true);
  broker.name = "Cay Development island broker";
  broker.scale.setScalar(0.4);
  broker.position.set(-0.5, 0, 0.75);
  developer.add(broker);
  const home = group(
    w.world,
    "Brandon home and weekend garden",
    [7, 0.43, -5.8],
  );
  box(
    home,
    "Brandon home cream walls",
    [0, 0.78, 0],
    [2.1, 1.56, 2.1],
    "#efdab8",
  );
  box(home, "Brandon home roof", [0, 1.66, 0], [2.4, 0.2, 2.4], "#567e73");
  box(
    home,
    "Brandon home front door",
    [0.45, 0.5, 1.07],
    [0.46, 1, 0.055],
    "#397573",
  );
  box(
    home,
    "Brandon home window",
    [-0.4, 0.9, 1.075],
    [0.65, 0.55, 0.04],
    "#e1bd78",
  );
  label(home, "BRANDON'S HOME", [0, 1.4, 1.1], 1.9);
  const garage = group(home, "Original garage pickle business", [
    HOME_GARAGE.position[0] - 7,
    0,
    HOME_GARAGE.position[1] + 5.8,
  ]);
  box(
    garage,
    "Garage stone foundation",
    [0, 0.025, 0],
    [1.75, 0.07, 1.8],
    "#cdbf9f",
  );
  box(
    garage,
    "Garage loading apron",
    [0, 0.025, 1.35],
    [1.55, 0.07, 1.15],
    "#dac9a7",
  );
  for (const side of [-1, 1])
    box(
      garage,
      "Garage cream side wall",
      [side * 0.72, 0.65, 0],
      [0.1, 1.3, 1.5],
      "#efdab8",
    );
  box(
    garage,
    "Raised garage roller door",
    [0, 1.23, 0.76],
    [1.25, 0.18, 0.09],
    "#c0af8e",
  );
  const garageStock = [];
  for (let i = 0; i < 12; i++) {
    const parcel = group(garage, "Garage stored pickle case", [
      -0.48 + (i % 2) * 0.42,
      0.16 + Math.floor(i / 4) * 0.3,
      -0.48 + Math.floor((i % 4) / 2) * 0.35,
    ]);
    box(
      parcel,
      "Garage cardboard case",
      [0, 0, 0],
      [0.36, 0.28, 0.3],
      "#cb9660",
    );
    box(
      parcel,
      "Garage shipping tape",
      [0, 0.145, 0],
      [0.065, 0.015, 0.3],
      "#fff0cd",
    );
    garageStock.push(parcel);
  }
  box(garage, "Garage back wall", [0, 0.65, -0.7], [1.35, 1.3, 0.1], "#dfd0ac");
  box(garage, "Garage roof", [0, 1.4, 0], [1.55, 0.16, 1.65], "#59877b");
  for (const side of [-1, 1])
    box(
      garage,
      "Garage open door frame",
      [side * 0.62, 0.65, 0.73],
      [0.09, 1.3, 0.1],
      "#c0af8e",
    );
  box(
    garage,
    "Garage pickle packing bench",
    [0, 0.52, 0],
    [1.05, 0.08, 0.45],
    "#ab8456",
  );
  for (let i = 0; i < 4; i++)
    cylinder(
      garage,
      "Garage wholesale pickle jar",
      [-0.35 + i * 0.23, 0.7, 0],
      0.075,
      0.28,
      "#92a978",
    );
  label(garage, "BRANDON’S GARAGE", [0, 1.5, 0.83], 1.6);
  const backyard = group(home, "Weekend barbecue patio", [0, 0, -2]);
  box(
    backyard,
    "Backyard patio pavers",
    [0, 0.015, 0],
    [2.7, 0.03, 1.8],
    "#c1b799",
  );
  box(
    backyard,
    "Employee picnic table",
    [-0.45, 0.48, 0],
    [1.25, 0.09, 0.55],
    "#bb9666",
  );
  for (const side of [-1, 1])
    box(
      backyard,
      "Picnic table bench",
      [-0.45, 0.26, side * 0.48],
      [1.3, 0.075, 0.18],
      "#a6825d",
    );
  const grill = group(backyard, "Weekend charcoal barbecue", [0.94, 0, 0.1]);
  cylinder(grill, "Round barbecue bowl", [0, 0.47, 0], 0.28, 0.22, "#3d5558");
  const grillLid = cylinder(
    grill,
    "Barbecue open lid",
    [0, 0.8, -0.21],
    0.28,
    0.08,
    "#517572",
  );
  grillLid.rotation.x = 1.1;
  for (const side of [-1, 1])
    box(
      grill,
      "Grill legs",
      [side * 0.15, 0.22, 0],
      [0.04, 0.42, 0.04],
      "#81948f",
    );
  const embers = box(
    grill,
    "Glowing barbecue coals",
    [0, 0.57, 0],
    [0.31, 0.03, 0.27],
    "#e7a365",
  );
  const plates = [];
  for (let i = 0; i < 3; i++)
    plates.push(
      cylinder(
        backyard,
        "Team barbecue lunch plate",
        [-0.85 + i * 0.38, 0.56, 0],
        0.11,
        0.015,
        "#f8edce",
      ),
    );
  w.realism = {
    estate,
    land,
    causeway,
    shop,
    walls,
    roof,
    factory,
    vats,
    jars,
    garden,
    crops,
    greenhouse,
    contractor,
    builders,
    jib,
    hook,
    portStock,
    island,
    orchard,
    harborYard: { key: "crateRow", crates: w.crates || [], slot: crateSlot },
    quayYard: {
      key: "quayRow",
      crates: quayCrates,
      slot: (i) => {
        const p = quaySlot(i);
        return [FARM.x + p[0], p[1], FARM.z + p[2]];
      },
    },
    importShip,
    freighter,
    shipFade,
    shipState: { fade: null, dockTick: null },
    cargoJib,
    cargoCable,
    cargoBox,
    developer,
    broker,
    home,
    garage,
    garageStock,
    officeBuild,
    backyard,
    grill,
    embers,
    plates,
  };
  return w;
}

const CRATE_CYCLE_SECONDS = 8;
const CRATE_FADE_SECONDS = 2.6;
// A cargo yard is where the freighter's crane sets its crates down: a pier row
// at the harbor, the receiving pallets on the quay at Pickle Cay. The crates
// are the very ones the crane carries over: one at a time, into a row. When
// Brandon takes stock they fade away from the end of the row.
function updateCargoYard(
  r,
  yard,
  s,
  { harborShip, desired, solid, berth, time, dt, reducedMotion, driveCrane },
) {
  const crates = yard.crates;
  const row = (r[yard.key] ||= {
    settled: 0,
    fresh: false,
    wasPort: undefined,
    cycleStart: 0,
    alpha: null,
    own: null,
  });
  if (!row.own) {
    row.own = crates.map((crate) => {
      const parts = [crate, ...crate.children].filter((o) => o.isMesh);
      for (const part of parts) part.material = part.material.clone();
      return parts;
    });
    row.alpha = crates.map(() => null);
  }
  // A shipment that has only just come in is unloaded by the crane.
  if (harborShip && row.wasPort !== true && s.tick - harborShip.arrivesAt < 4)
    row.fresh = !reducedMotion;
  if (!harborShip) row.fresh = false;
  row.wasPort = !!harborShip;
  let carrying = null;
  if (row.fresh && row.settled < desired) {
    if (solid) {
      if (!row.cycling) {
        row.cycling = true;
        row.cycleStart = time;
      }
      const u = (time - row.cycleStart) / CRATE_CYCLE_SECONDS;
      const ship = r.importShip,
        slot = yard.slot(row.settled);
      // Crane-local: relative to the ship, through its heading and mirroring.
      const dx = slot[0] - ship.position.x,
        dz = slot[2] - ship.position.z,
        cos = Math.cos(berth.yaw),
        sin = Math.sin(berth.yaw),
        local = {
          x: (dx * cos - dz * sin) * berth.mirror,
          z: dx * sin + dz * cos,
        };
      r.importShip.updateMatrixWorld(true);
      const pose = poseCrane(r.freighter, Math.min(u, 0.999), true, local);
      if (pose.held || pose.placed) {
        const hook = new THREE.Vector3(pose.reach, -pose.drop - 0.25, 0);
        r.freighter.jib.localToWorld(hook);
        carrying = { index: row.settled, hook, placed: pose.placed };
      }
      if (u >= 1) {
        row.settled++;
        row.cycling = false;
      }
    } else if (driveCrane) poseCrane(r.freighter, 0, false);
  } else {
    row.cycling = false;
    if (row.fresh) row.fresh = false;
    row.settled = desired;
    if (driveCrane) poseCrane(r.freighter, reducedMotion ? 0.5 : 0, false);
  }
  crates.forEach((crate, i) => {
    const onPier = i < row.settled,
      target = onPier || (carrying && carrying.index === i) ? 1 : 0;
    const step = reducedMotion ? 1 : dt / CRATE_FADE_SECONDS;
    if (row.alpha[i] === null) row.alpha[i] = target;
    else if (carrying && carrying.index === i && !carrying.placed)
      row.alpha[i] = 1;
    else row.alpha[i] += Math.max(-step, Math.min(step, target - row.alpha[i]));
    if (carrying && carrying.index === i && !carrying.placed)
      crate.position.set(carrying.hook.x, carrying.hook.y, carrying.hook.z);
    else crate.position.set(...yard.slot(i));
    const a = row.alpha[i];
    crate.visible = a > 0.01;
    for (const part of row.own[i]) {
      part.material.transparent = a < 0.995;
      part.material.opacity = a;
    }
  });
}

export function updateBusinessWorld(w, s, time, dt, reducedMotion = false) {
  const r = w.realism,
    construction = s.construction || {},
    stage = construction.stage || "unowned",
    progress = clamp(construction.progress || 0);
  const officeStage = s.office?.stage || "garage";
  w.cafe.visible = officeStage === "complete";
  const garageCases =
    s.operations?.origin === "home" || !s.operations?.origin
      ? s.cafe || 0
      : s.operations?.oldOrigin === "home"
        ? s.operations.oldWarehouse || 0
        : 0;
  r.garageStock.forEach((parcel, i) => {
    parcel.visible = i < garageCases;
  });
  r.officeBuild.visible = officeStage === "building";
  r.estate.visible = stage !== "unowned";
  const completed = stage === "complete";
  // The sea, the beach and the old orchard follow the construction stages:
  // the island rises out of the orchard cay once reclamation starts.
  const landUp = ["reclamation", "foundation", "building", "complete"].includes(
    stage,
  );
  const groundReady = completed || ["foundation", "building"].includes(stage);
  const rise = stage === "reclamation" ? smooth(progress) : 1;
  setFarmExpanded(landUp);
  for (const piece of r.orchard) piece.visible = !landUp;
  r.land.visible = landUp;
  r.land.scale.y = completed ? 1 : 0.15 + rise * 0.85;
  r.causeway.visible = landUp;
  r.causeway.scale.z = completed || groundReady ? 1 : Math.max(0.05, rise);
  const { gate, lane, quay } = r.island;
  gate.visible = lane.visible = quay.visible = groundReady;
  r.shop.visible = groundReady;
  r.walls.visible = completed || stage === "building";
  r.roof.visible = completed || (stage === "building" && progress > 0.83);
  r.walls.scale.y = completed ? 1 : Math.max(0.07, progress);
  r.factory.visible = completed;
  r.island.works.yard.visible = completed;
  r.garden.visible = completed;
  r.island.grounds.visible = completed;
  r.contractor.visible =
    !completed && stage !== "unowned" && stage !== "purchased";
  for (const [i, person] of r.builders.entries())
    animateCharacter(
      person,
      { walkCycle: time * 3 + i },
      {
        working: true,
        task: person.userData.task || "build",
        time: time + i * 1.3,
        dt,
        reducedMotion,
      },
    );
  r.jib.rotation.y = reducedMotion ? 0 : Math.sin(time * 0.23) * 0.25;
  r.hook.position.y = 2.45 + (reducedMotion ? 0 : Math.sin(time * 0.7) * 0.3);
  const growing = (s.production?.growing || []).length > 0,
    packing = (s.production?.packing || []).length > 0,
    fermenting = (s.production?.fermenting || []).length > 0;
  r.crops.forEach(
    (crop, i) =>
      (crop.scale.y = growing ? 0.5 + (Math.sin(i) * 0.5 + 0.5) * 0.5 : 0.6),
  );
  r.jars.forEach((jar, i) => {
    jar.position.x =
      packing && !reducedMotion
        ? ((time * 0.35 + i * 0.38) % 2.6) - 1.3
        : -1.2 + i * 0.38;
  });
  r.vats.forEach((vat) => {
    vat.material = mat(fermenting ? "#b5b67d" : "#9cad9e");
  });
  const shipments = s.operations?.shipments || [],
    atSea = shipments.find(
      (x) => x.status === "at_sea" && s.tick >= (x.departsAt ?? x.orderedAt),
    ),
    atPort = shipments.find((x) => x.status === "port"),
    departing = [...shipments]
      .reverse()
      .find(
        (x) => x.status === "unloaded" && s.tick - (x.pickedAt ?? -100) < 30,
      );
  r.portStock.visible = completed;
  const shipment = atPort || atSea || departing;
  const ship = r.shipState,
    farm = shipment?.portNode === "farm_port",
    berth = farm ? FARM_BERTH : HARBOR_SHIP_BERTH;
  // The freighter never sails across the map: it condenses out of the sea fog
  // beside the pier, and dissolves back into it once its cargo is collected.
  let target = 0;
  if (atPort) target = 1;
  else if (atSea)
    target =
      0.12 +
      0.3 *
        clamp(
          (s.tick - (atSea.departsAt ?? atSea.orderedAt)) /
            Math.max(1, atSea.arrivesAt - (atSea.departsAt ?? atSea.orderedAt)),
        );
  if (ship.fade === null)
    ship.fade =
      reducedMotion || !atPort || s.tick - atPort.arrivesAt >= 4 ? target : 0;
  else if (reducedMotion) ship.fade = target;
  else {
    const step = dt / (target > ship.fade ? FOG_IN_SECONDS : FOG_OUT_SECONDS);
    ship.fade += Math.max(-step, Math.min(step, target - ship.fade));
  }
  const fade = clamp(ship.fade);
  r.importShip.visible = fade > 0.01 || target > 0;
  r.shipFade(fade);
  if (shipment) {
    const bob = reducedMotion ? 0 : Math.sin(time * 0.8 + 1.3);
    // A slow drift in from the haze as it fades up.
    r.importShip.position.set(
      berth.x + berth.dx * 0.12 * (1 - fade),
      -0.63 + bob * 0.02,
      berth.z + 2.5 * (1 - fade),
    );
    r.importShip.rotation.set(
      reducedMotion ? 0 : Math.sin(time * 0.6) * 0.004,
      berth.yaw,
      reducedMotion ? 0 : bob * 0.006,
    );
    // The pier side of the hull faces the pier (mirrored at the island port).
    r.importShip.scale.x = berth.mirror;
  }
  if (!atPort) ship.dockTick = null;
  const solid = fade > 0.99;
  const harborShip = atPort && !farm && atPort.kind !== "resources";
  const quayShip = atPort && farm;
  const quayCases =
    (s.operations?.islandPort || 0) + (s.operations?.resourcesPort || 0);
  updateCargoYard(r, r.harborYard, s, {
    harborShip: harborShip ? atPort : null,
    desired: Math.min(CRATE_SLOTS, Math.ceil((s.harbor || 0) / 2)),
    solid,
    berth,
    time,
    dt,
    reducedMotion,
    driveCrane: !quayShip,
  });
  updateCargoYard(r, r.quayYard, s, {
    harborShip: quayShip ? atPort : null,
    desired: completed ? Math.min(QUAY_SLOTS, Math.ceil(quayCases / 2)) : 0,
    solid,
    berth,
    time,
    dt,
    reducedMotion,
    driveCrane: !!quayShip,
  });
  animateIsland(r.island, {
    time,
    active: completed && (packing || fermenting),
    reducedMotion,
  });
  r.embers.visible =
    s.social?.phase === "barbecue" || s.social?.phase === "bbq";
  r.plates.forEach((plate) => (plate.visible = r.embers.visible));
  animateCharacter(
    r.broker,
    { walkCycle: 0 },
    {
      working: s.brandon?.action === "negotiate_island",
      time,
      dt,
      reducedMotion,
    },
  );
  return {
    constructionStage: stage,
    factoryActive: completed && (packing || fermenting),
    shipmentStage: atSea ? "at_sea" : atPort ? "port" : "none",
  };
}

export function repairPose(actor, flatTire = false) {
  const repair = actor.repair;
  if (!repair && actor.action !== "patch")
    return {
      active: false,
      phase: flatTire ? "flat" : "ready",
      progress: 0,
      lift: 0,
      removed: 0,
      inflation: flatTire ? 0.38 : 1,
    };
  const phases = ["inspect", "jack", "remove", "patch", "replace", "lower"];
  const global = repair?.totalProgress ?? (actor.work || 0) / 18;
  const index = repair?.phase
    ? Math.max(0, phases.indexOf(repair.phase))
    : Math.min(5, Math.floor(clamp(global) * 6));
  const progress =
    repair?.progress !== undefined
      ? repair.progress * 6 - index
      : global * 6 - index;
  const phase = phases[index];
  return {
    active: true,
    phase,
    progress: clamp(progress),
    lift:
      index < 1
        ? 0
        : index === 1
          ? smooth(progress)
          : index === 5
            ? 1 - smooth(progress)
            : 1,
    removed:
      index === 2
        ? smooth(progress)
        : index === 3
          ? 1
          : index === 4
            ? 1 - smooth(progress)
            : 0,
    inflation:
      index < 3 ? 0.38 : index === 3 ? 0.38 + smooth(progress) * 0.62 : 1,
  };
}
export function animateTireRepair(
  w,
  actor,
  flatTire,
  motion,
  time,
  dt,
  reducedMotion = false,
) {
  const pose = repairPose(actor, flatTire),
    wheel = w.wheels[0];
  w.repairRig.visible = pose.active;
  if (!pose.active) {
    wheel.position.fromArray(wheel.userData.restPosition);
    wheel.scale.set(1, pose.inflation, 1);
    return pose;
  }
  w.repairRig.position.copy(w.van.position);
  w.repairRig.rotation.y = w.van.rotation.y;
  w.driver.visible = false;
  w.brandon.visible = true;
  const lateral =
    pose.phase === "inspect"
      ? smooth(pose.progress)
      : pose.phase === "lower"
        ? 1 - smooth(pose.progress)
        : 1;
  const offset = new THREE.Vector3(
    -1.04 * lateral,
    0,
    -0.53 * lateral,
  ).applyAxisAngle(new THREE.Vector3(0, 1, 0), w.van.rotation.y);
  w.brandon.position.copy(w.van.position).add(offset);
  w.brandon.rotation.y = w.van.rotation.y + Math.PI / 2;
  animateCharacter(w.body, motion, {
    working: lateral > 0.8,
    walking: lateral < 0.8,
    time,
    dt,
    reducedMotion,
  });
  w.body.position.y = -lateral * 0.3;
  w.body.rotation.x = -0.32 * lateral;
  w.chassis.position.y += pose.lift * 0.16;
  w.chassis.rotation.z *= 1 - pose.lift;
  wheel.rotation.x = 0;
  wheel.scale.set(1, pose.inflation, 1);
  wheel.position.fromArray(wheel.userData.restPosition);
  wheel.position.x -= pose.removed * 0.47;
  w.repairParts.piston.scale.y = 0.4 + pose.lift * 0.6;
  w.repairParts.jack.visible = pose.phase !== "inspect";
  w.repairParts.pump.visible = pose.phase === "patch";
  w.repairParts.patch.visible = pose.phase === "patch";
  w.repairParts.wrench.visible = ["remove", "replace"].includes(pose.phase);
  w.repairParts.wrench.rotation.x = reducedMotion
    ? 0
    : Math.sin(time * 7) * 0.6;
  w.repairParts.handle.position.y =
    0.48 + (reducedMotion ? 0 : Math.sin(time * 8) * 0.12);
  return pose;
}

// A single standing body traverses the door/saddle before the seated pilot
// takes over. The authoritative transition holds road movement while it plays.
export function transportTransitionPose(transition) {
  if (!transition) return null;
  const p = clamp(transition.progress || 0),
    from = transition.from || "foot",
    to = transition.to || "foot";
  const exit = from !== "foot",
    enter = to !== "foot";
  const phase = p < 0.35 ? "dismount" : p < 0.7 ? "approach" : "board";
  // The figure steps aside, then settles back onto the pose it will walk or
  // ride from, so the end of the transition is continuous in place and facing.
  const settle = 1 - smooth((p - 0.8) / 0.2);
  const offset =
    exit && p < 0.35
      ? smooth(p / 0.35)
      : enter && p > 0.7
        ? 1 - smooth((p - 0.7) / 0.3)
        : enter
          ? smooth(p / 0.2)
          : 1;
  // Facing: quarter turn toward the step, flipping smoothly between phases.
  const flip = smooth((p - 0.62) / 0.16);
  const yawOffset =
    (Math.PI / 2 + (-Math.PI / 2 - Math.PI / 2) * flip) *
    smooth(p / 0.12) *
    settle;
  return {
    from,
    to,
    phase,
    progress: p,
    offset: 0.86 * offset * (exit ? settle : 1),
    yawOffset,
    walking: p > 0.2 && p < 0.8,
    standing: true,
  };
}
const transitionMotion = new WeakMap();
const transitionLeftover = new WeakMap();
export function applyTransportTransition(
  rig,
  actor,
  motion,
  {
    time = 0,
    dt = 1 / 30,
    reducedMotion = false,
    cargoCount = actor.carry || 0,
    active = true,
  } = {},
) {
  const transition = actor.transition;
  if (!transition) {
    transitionMotion.delete(rig);
    // The server may finish the transition before the figure has: bleed off
    // whatever sideways offset is left instead of snapping it away.
    const left = transitionLeftover.get(rig);
    if (left) {
      const k = Math.exp(-Math.min(dt, 0.1) / 0.1);
      left[0] *= k;
      left[1] *= k;
      const root = rig.group || rig.brandon;
      root.position.x += left[0];
      root.position.z += left[1];
      if (Math.hypot(left[0], left[1]) < 0.002) transitionLeftover.delete(rig);
    }
    return null;
  }
  transitionLeftover.delete(rig);
  const key = `${transition.startedAt}:${transition.from}:${transition.to}`;
  let visual = transitionMotion.get(rig);
  const increment = 1 / (transition.duration || 4);
  if (!visual || visual.key !== key) {
    visual = {
      key,
      progress: active && !reducedMotion ? 0 : transition.progress,
    };
    transitionMotion.set(rig, visual);
  }
  if (reducedMotion) visual.progress = transition.progress;
  else if (active)
    visual.progress = Math.min(
      Math.min(1, transition.progress + increment),
      Math.max(visual.progress, transition.progress - increment) +
        dt / ((motion.interval || 0.4) * (transition.duration || 4)),
    );
  const pose = transportTransitionPose({
    ...transition,
    progress: visual.progress,
  });
  const bodyRoot = rig.group || rig.brandon,
    body = rig.body;
  bodyRoot.visible = true;
  for (const pilot of [
    rig.rider,
    rig.driver,
    rig.pilot,
    rig.jetPilot,
    rig.portalPilot,
    rig.skater,
    rig.sailor,
  ])
    if (pilot) pilot.visible = false;
  const heading = motion.heading;
  const side = [
    -Math.cos(heading) * pose.offset,
    Math.sin(heading) * pose.offset,
  ];
  bodyRoot.position.copy(motion.position);
  bodyRoot.position.x += side[0];
  bodyRoot.position.z += side[1];
  transitionLeftover.set(rig, [side[0], side[1]]);
  bodyRoot.rotation.y = heading + pose.yawOffset;
  animateCharacter(
    body,
    { ...motion, walkCycle: time * 7 },
    {
      walking: pose.walking,
      working: !pose.walking,
      cargoCount,
      time,
      dt,
      reducedMotion,
    },
  );
  const target = {
    bike: rig.bicycle || rig.bike,
    van: rig.van,
    rocket_skates: rig.rocketSkates,
    helicopter: rig.helicopter,
    sailboat: rig.boat,
    jetpack: rig.jetpack,
    teleporter: rig.teleporter,
  }[pose.to === "foot" ? pose.from : pose.to];
  if (target) {
    target.visible = true;
    target.position.copy(motion.position);
    target.rotation.y = heading;
  }
  return pose;
}
export function separateRenderedActors(entries) {
  const corrected = resolveTrafficPositions(
    entries.map((e) => ({
      id: e.id,
      mode: e.mode,
      position: [e.position.x, e.position.z],
      altitude: e.position.y,
      radius: e.radius ?? transportRadius(e.mode),
    })),
  );
  const diagnostics = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i],
      p = corrected[i].position,
      dx = p[0] - e.position.x,
      dz = p[1] - e.position.z;
    for (const object of e.objects.filter((o) => o?.visible)) {
      object.position.x += dx;
      object.position.z += dz;
    }
    e.position.x = p[0];
    e.position.z = p[1];
    diagnostics.push({
      id: e.id,
      mode: e.mode,
      position: [p[0], e.position.y, p[1]],
      radius: e.radius ?? transportRadius(e.mode),
    });
  }
  return diagnostics;
}
