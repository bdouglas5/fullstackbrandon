import * as THREE from "three";
import { MAIN_ISLAND, HOME_BUSINESSES } from "../shared/islands.js";
import { EDGES, NODES } from "../shared/engine.js";
import { seeded } from "./toy-kit.js";

const GRASS_TOP = 0.345;
const ISLAND = { width: 30.9, depth: 22.9, radius: 5.6 };

// Signed distance to the rounded grass outline; negative is on the island.
function islandDistance(x, z) {
  const qx = Math.abs(x - MAIN_ISLAND.x) - (ISLAND.width / 2 - ISLAND.radius),
    qz = Math.abs(z - MAIN_ISLAND.z) - (ISLAND.depth / 2 - ISLAND.radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) +
    Math.min(Math.max(qx, qz), 0) -
    ISLAND.radius
  );
}
// Evenly spaced points just inside the grass outline: four straight edges
// joined by quarter arcs around the rounded corners.
function shoreline(step, inset = 0.42) {
  const a = ISLAND.width / 2 - ISLAND.radius,
    b = ISLAND.depth / 2 - ISLAND.radius,
    r = ISLAND.radius - inset;
  const edge = (x0, z0, x1, z1) => (t) => [
    x0 + (x1 - x0) * t,
    z0 + (z1 - z0) * t,
  ];
  const arc = (cx, cz, from) => (t) => [
    cx + Math.cos(from + (t * Math.PI) / 2) * r,
    cz + Math.sin(from + (t * Math.PI) / 2) * r,
  ];
  const segments = [
    [edge(a + r, -b, a + r, b), 2 * b],
    [arc(a, b, 0), (Math.PI / 2) * r],
    [edge(a, b + r, -a, b + r), 2 * a],
    [arc(-a, b, Math.PI / 2), (Math.PI / 2) * r],
    [edge(-a - r, b, -a - r, -b), 2 * b],
    [arc(-a, -b, Math.PI), (Math.PI / 2) * r],
    [edge(-a, -b - r, a, -b - r), 2 * a],
    [arc(a, -b, Math.PI * 1.5), (Math.PI / 2) * r],
  ];
  const points = [];
  for (const [at, length] of segments)
    for (let d = 0; d < length; d += step) {
      const [x, z] = at(d / length);
      points.push([MAIN_ISLAND.x + x, MAIN_ISLAND.z + z]);
    }
  return points;
}

/**
 * Plants and stones gather where a person would put them: against
 * foundations, around trunks, along path edges and at the shore, with open
 * lawn left between groups. Placement reads the finished scenery, so dressing
 * never lands on roads, doorsteps, parking spots, pads or other props.
 */
export function dressWorld(w, kit, roadRectangles) {
  const root = new THREE.Group();
  root.name = "Hand-placed ground dressing";
  const moving = new Set(
    [
      w.brandon,
      w.van,
      w.bike,
      w.helicopter,
      w.boat,
      w.jetpack,
      w.teleporter,
      w.rocketSkates,
      w.roadCones,
      w.barriers,
      w.workEffect,
      w.repairRig,
      ...w.customers,
      ...w.pedestrians,
      ...w.clouds,
    ].filter(Boolean),
  );
  w.world.updateMatrixWorld(true);
  const obstacles = [];
  const box = new THREE.Box3();
  w.world.traverse((object) => {
    if (!object.isMesh) return;
    for (let p = object; p; p = p.parent) if (moving.has(p)) return;
    box.setFromObject(object);
    // Only parts that stand on the ground block planting; canopies, roofs
    // and bench seats overhang it.
    if (
      box.max.y < GRASS_TOP + 0.08 ||
      box.min.y > GRASS_TOP + 0.3 ||
      box.max.x - box.min.x > 8 ||
      box.max.z - box.min.z > 8
    )
      return;
    obstacles.push([box.min.x, box.max.x, box.min.z, box.max.z]);
  });
  // Paved and working areas that sit flush with the lawn.
  const keepOut = [
    [12.4, 16.6, -8.4, -1.2], // aviation apron
    [-0.75, 0.75, -6.1, 6.1], // canal
    [4.2, 6.9, 3.6, 6.1], // van parking
    [4.8, 6.3, 2.6, 3.8], // bike parking
    [-4.9, -3.1, 9.6, 14.5], // harbor pier approach
  ];
  const roads = roadRectangles.map((r) => [r.minX, r.maxX, r.minZ, r.maxZ]);
  const hits = (list, x, z, radius) =>
    list.some(
      ([minX, maxX, minZ, maxZ]) =>
        x + radius > minX &&
        x - radius < maxX &&
        z + radius > minZ &&
        z - radius < maxZ,
    );
  const placed = [];
  const free = (x, z, radius, roadGap = 0.12, edge = radius + 0.2) =>
    Math.hypot(x + 10.55, z + 4.3) > 1.65 + radius &&
    islandDistance(x, z) < -edge &&
    !hits(roads, x, z, radius + roadGap) &&
    !hits(keepOut, x, z, radius) &&
    !hits(obstacles, x, z, radius + 0.04) &&
    placed.every(
      ([px, pz, pr]) => Math.hypot(px - x, pz - z) > (pr + radius) * 0.8,
    );
  // Loaded vans extend past junction centers. Check actual plant bounds,
  // not the smaller decorative spacing radius, against their swept footprint.
  const vanPaths = EDGES.map(([a, b]) => {
    const start = NODES[a],
      end = NODES[b];
    const dx = end[0] - start[0],
      dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    const rx = Math.abs(dx / length) * 0.97 + Math.abs(dz / length) * 0.59;
    const rz = Math.abs(dz / length) * 0.97 + Math.abs(dx / length) * 0.59;
    return [
      Math.min(start[0], end[0]) - rx,
      Math.max(start[0], end[0]) + rx,
      Math.min(start[1], end[1]) - rz,
      Math.max(start[1], end[1]) + rz,
    ];
  });
  const plantBounds = new THREE.Box3();
  const random = seeded(4711);
  let seed = 0;
  const put = (kind, x, z, size, radius, roadGap, y = GRASS_TOP, edge) => {
    if (!free(x, z, radius * size, roadGap, edge)) return false;
    const plant = kit.dressing[kind](
      root,
      x,
      y,
      z,
      size,
      seed++,
      random() * Math.PI * 2,
    );
    if (kind === "bush") {
      plant.updateMatrixWorld(true);
      plantBounds.setFromObject(plant);
      if (
        vanPaths.some(
          ([minX, maxX, minZ, maxZ]) =>
            plantBounds.max.x > minX &&
            plantBounds.min.x < maxX &&
            plantBounds.max.z > minZ &&
            plantBounds.min.z < maxZ,
        )
      ) {
        plant.removeFromParent();
        return false;
      }
    }
    placed.push([x, z, radius * size]);
    return true;
  };
  const counts = { foundation: 0, tree: 0, verge: 0, shore: 0, lawn: 0 };
  const tally = (key, ok) => ok && counts[key]++;

  // Foundation planting: bushes in the back corners, flowers along the sides.
  for (const business of Object.values(HOME_BUSINESSES)) {
    const [bx, bz] = business.building,
      f = business.facing;
    const at = (x, z) => [
      bx + x * Math.cos(f) + z * Math.sin(f),
      bz - x * Math.sin(f) + z * Math.cos(f),
    ];
    for (const side of [-1, 1]) {
      const plan = [
        ["bush", side * 1.7, -0.62, 1.15, 0.22, 0.45],
        ["bush", side * 1.62, -1.12, 0.85, 0.22, 0.45],
        ["flowers", side * 1.6, -0.05, 1, 0.16, 0.12],
        ["tuft", side * 1.58, 0.45, 1.1, 0.1, 0.12],
        ["bush", side * 0.95, -1.18, 0.95, 0.22, 0.45],
        ["flowers", side * 0.35, -1.12, 0.9, 0.16, 0.12],
      ];
      for (const [kind, x, z, size, radius, gap] of plan)
        tally("foundation", put(kind, ...at(x, z), size, radius, gap));
    }
  }
  // Under trees: a few tufts and the odd flower patch or stone at the trunk.
  for (const [tx, tz] of w.treeSpots || []) {
    const count = 1 + Math.floor(random() * 3);
    for (let k = 0; k < count; k++) {
      const a = random() * Math.PI * 2,
        d = 0.32 + random() * 0.22,
        roll = random();
      const kind = roll < 0.6 ? "tuft" : roll < 0.85 ? "flowers" : "rock";
      tally(
        "tree",
        put(
          kind,
          tx + Math.cos(a) * d,
          tz + Math.sin(a) * d,
          0.8 + random() * 0.4,
          kind === "rock" ? 0.2 : 0.12,
          0.12,
        ),
      );
    }
  }
  // Path verges: irregular runs of flowers and tufts with gaps between them.
  for (const r of roadRectangles) {
    const horizontal = r.maxX - r.minX > r.maxZ - r.minZ;
    const length = horizontal ? r.maxX - r.minX : r.maxZ - r.minZ;
    for (const side of [-1, 1]) {
      for (
        let t = 0.5 + random();
        t < length - 0.5;
        t += 0.55 + random() * 1.1
      ) {
        if (random() < 0.3) continue;
        const out = 0.26 + random() * 0.18;
        const x = horizontal
          ? r.minX + t
          : side < 0
            ? r.minX - out
            : r.maxX + out;
        const z = horizontal
          ? side < 0
            ? r.minZ - out
            : r.maxZ + out
          : r.minZ + t;
        const kind = random() < 0.55 ? "flowers" : "tuft";
        tally(
          "verge",
          put(
            kind,
            x,
            z,
            0.85 + random() * 0.3,
            kind === "flowers" ? 0.22 : 0.14,
            0.1,
          ),
        );
      }
    }
  }
  // Shoreline groups: stones half on the beach rim, tufts behind them.
  const shore = shoreline(0.75, 0.5);
  for (let i = 0; i < shore.length; i += 3 + Math.floor(random() * 3)) {
    if (random() < 0.3) continue;
    const [x, z] = shore[i];
    const inward = [MAIN_ISLAND.x - x, MAIN_ISLAND.z - z],
      length = Math.hypot(...inward);
    const nx = inward[0] / length,
      nz = inward[1] / length;
    if (
      tally(
        "shore",
        put(
          "rock",
          x,
          z,
          0.8 + random() * 0.6,
          0.2,
          0.2,
          GRASS_TOP - 0.06,
          0.1,
        ),
      )
    ) {
      if (random() < 0.6)
        put(
          "rock",
          x + nz * 0.32,
          z - nx * 0.32,
          0.5 + random() * 0.3,
          0.2,
          0.2,
          GRASS_TOP - 0.05,
          0.1,
        );
      for (let k = 0; k < 2; k++)
        put(
          "tuft",
          x + nx * (0.35 + k * 0.2) + (random() - 0.5) * 0.4,
          z + nz * (0.35 + k * 0.2) + (random() - 0.5) * 0.4,
          1,
          0.1,
          0.12,
        );
    }
  }
  // Open lawn: small vignettes, one larger piece with a few satellites, and
  // plenty of empty grass left between them.
  const satellites = (x, z, kinds) => {
    for (const kind of kinds) {
      const a = random() * Math.PI * 2,
        d = 0.32 + random() * 0.3;
      put(
        kind,
        x + Math.cos(a) * d,
        z + Math.sin(a) * d,
        0.7 + random() * 0.4,
        kind === "flowers" ? 0.22 : kind === "rock" ? 0.2 : 0.14,
        0.4,
      );
    }
  };
  for (let gx = -12; gx < 20; gx += 2.1)
    for (let gz = -11.5; gz < 11.5; gz += 2.1) {
      const x = gx + random() * 1.6,
        z = gz + random() * 1.6,
        roll = random();
      if (roll > 0.62 || !free(x, z, 0.35, 0.45)) continue;
      if (roll < 0.22) {
        if (tally("lawn", put("bush", x, z, 1.05 + random() * 0.4, 0.24, 0.6)))
          satellites(x, z, [
            "tuft",
            "tuft",
            random() < 0.5 ? "flowers" : "rock",
          ]);
      } else if (roll < 0.36) {
        if (
          tally("lawn", put("flowers", x, z, 1.1 + random() * 0.3, 0.22, 0.45))
        )
          satellites(x, z, ["tuft", "flowers"]);
      } else if (roll < 0.44) {
        if (tally("lawn", put("rock", x, z, 1 + random() * 0.5, 0.2, 0.45)))
          satellites(x, z, ["tuft", "tuft"]);
      } else {
        tally("lawn", put("tuft", x, z, 1 + random() * 0.3, 0.14, 0.45));
        satellites(x, z, ["tuft"]);
      }
    }
  w.world.add(root);
  w.dressing = { root, counts, obstacles: obstacles.length };
  return w;
}
