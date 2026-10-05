import * as THREE from "three";
import { ISLANDS, REEF } from "../shared/islands.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { finishModels } from "./model-finishes.js";

// Authored district kits. A seeded scatter keeps every replay in the same world.
export function polishWorld(w) {
  w.secondaryMotion = [];
  const mats = new Map();
  const geometries = new Map();
  const mat = (color) => {
    if (!mats.has(color))
      mats.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
      );
    return mats.get(color);
  };
  const mesh = (parent, name, geometry, color, x, y, z) => {
    const m = new THREE.Mesh(geometry, mat(color));
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (g, name, x, y, z, a, b, c, color, radius = 0.025) => {
    const key = [a, b, c, radius].join();
    if (!geometries.has(key))
      geometries.set(
        key,
        new RoundedBoxGeometry(
          a,
          b,
          c,
          1,
          Math.min(radius, a / 3, b / 3, c / 3),
        ),
      );
    return mesh(g, name, geometries.get(key), color, x, y, z);
  };
  const tube = (g, name, a, b, radius, color) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      d = end.clone().sub(start);
    const m = mesh(
      g,
      name,
      new THREE.CylinderGeometry(radius, radius, d.length(), 6),
      color,
      ...start.add(end).multiplyScalar(0.5).toArray(),
    );
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const ball = (g, name, x, y, z, r, color) =>
    mesh(g, name, new THREE.IcosahedronGeometry(r, 2), color, x, y, z);
  const group = (name, x, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, 0, z);
    w.world.add(g);
    return g;
  };
  const random = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  w.wind = { time: { value: 0 }, strength: { value: 0.1 } };
  const leaf = mat("#63966a");
  leaf.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = w.wind.time;
    shader.uniforms.windStrength = w.wind.strength;
    shader.vertexShader =
      "uniform float windTime; uniform float windStrength;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float sway = sin(windTime * 1.6 + position.x * .8 + position.z * .5);
      transformed.x += sway * windStrength * smoothstep(1.0, 3.2, position.y);
      transformed.z += cos(windTime + position.x) * windStrength * .35 * smoothstep(1.0, 3.2, position.y);`,
    );
  };
  leaf.customProgramCacheKey = () => "island-leaf-wind-v1";
  for (const color of ["#497c61", "#68936b"]) {
    const treeMaterial = w.materials.get(color);
    if (treeMaterial) {
      treeMaterial.onBeforeCompile = leaf.onBeforeCompile;
      treeMaterial.customProgramCacheKey = leaf.customProgramCacheKey;
    }
  }
  const palm = (x, z, size = 1, seed = 0) => {
    const g = group("Wind-shaped coconut palm", x, z);
    g.scale.setScalar(size);
    g.rotation.y = seed;
    w.kit.palm(g, Math.round(seed * 7)).position.y = 0.34;
  };
  const umbrella = (g, x, z, color) => {
    tube(g, "Parasol pole", [x, 0.4, z], [x, 1.45, z], 0.025, "#b38a63");
    const canopy = mesh(
      g,
      "Scalloped parasol",
      new THREE.ConeGeometry(0.46, 0.22, 12),
      color,
      x,
      1.49,
      z,
    );
    canopy.rotation.y = 0.25;
    for (let k = 0; k < 6; k++)
      tube(
        g,
        "Parasol seam",
        [x, 1.61, z],
        [
          x + Math.cos((k * Math.PI) / 3) * 0.44,
          1.39,
          z + Math.sin((k * Math.PI) / 3) * 0.44,
        ],
        0.009,
        "#fff0d3",
      );
  };
  const lounger = (g, x, z, angle = 0) => {
    const l = new THREE.Group();
    l.position.set(x, 0.43, z);
    l.rotation.y = angle;
    g.add(l);
    box(l, "Teak lounger frame", 0, 0.12, 0, 0.36, 0.07, 0.8, "#b98962");
    box(l, "Striped lounger cushion", 0, 0.18, 0, 0.3, 0.05, 0.64, "#fff2d8");
    box(l, "Seafoam towel", 0, 0.215, 0.15, 0.31, 0.02, 0.21, "#7ba9a2");
    const back = box(
      l,
      "Reclining seat back",
      0,
      0.31,
      -0.33,
      0.34,
      0.07,
      0.4,
      "#f6e1b7",
    );
    back.rotation.x = 0.6;
    for (const xx of [-0.13, 0.13])
      for (const zz of [-0.26, 0.26])
        box(l, "Lounger leg", xx, 0.055, zz, 0.04, 0.13, 0.04, "#95745a");
  };
  const planter = (g, x, z, color = "#d68c6b") => {
    mesh(
      g,
      "Terracotta planter",
      new THREE.CylinderGeometry(0.16, 0.12, 0.25, 8),
      color,
      x,
      0.52,
      z,
    );
    for (let k = 0; k < 3; k++)
      ball(
        g,
        "Planter foliage",
        x + Math.sin(k * 2) * 0.08,
        0.72,
        z + Math.cos(k * 2) * 0.08,
        0.13,
        "#63966a",
      );
  };
  // Sunset Bay: a stepped hotel with inset glazing, deep balconies and a pool terrace.
  const resort = group(
    "Sunset Bay Grand Dill resort",
    ISLANDS.sunset.x,
    ISLANDS.sunset.z,
  );
  box(resort, "Resort podium", -0.3, 0.5, -1.6, 4.9, 0.3, 2.7, "#eadcc4", 0.12);
  for (let floor = 0; floor < 7; floor++) {
    const width = floor > 4 ? 2.8 : 3.7,
      height = 0.69 + floor * 0.64;
    box(
      resort,
      "Resort limestone floor",
      -0.5,
      height,
      -1.65,
      width,
      0.55,
      1.8,
      "#fff0d7",
      0.06,
    );
    box(
      resort,
      "Continuous balcony slab",
      -0.5,
      height - 0.18,
      -0.61,
      width + 0.25,
      0.07,
      0.48,
      "#e7caa2",
    );
    for (let j = 0; j < (floor > 4 ? 3 : 4); j++) {
      const x = -0.5 + (j - ((floor > 4 ? 3 : 4) - 1) / 2) * 0.82;
      box(
        resort,
        "Resort recessed glass",
        x,
        height,
        -0.732,
        0.59,
        0.4,
        0.028,
        "#527f87",
      );
      box(
        resort,
        "Balcony brass rail",
        x,
        height + 0.06,
        -0.39,
        0.68,
        0.035,
        0.035,
        "#bba37a",
      );
      for (const side of [-0.32, 0.32])
        box(
          resort,
          "Balcony rail post",
          x + side,
          height - 0.025,
          -0.39,
          0.022,
          0.2,
          0.025,
          "#bba37a",
        );
      if ((floor + j) % 3 === 0) {
        const pot = mesh(
          resort,
          "Balcony planter",
          new THREE.CylinderGeometry(0.07, 0.05, 0.1, 6),
          "#e6b8a2",
          x + 0.24,
          height - 0.05,
          -0.47,
        );
        ball(
          resort,
          "Balcony greenery",
          x + 0.24,
          height + 0.04,
          -0.47,
          0.08,
          "#63966a",
        );
      }
    }
  }
  box(
    resort,
    "Hotel rooftop pergola",
    -0.5,
    5.03,
    -1.65,
    3.2,
    0.1,
    2,
    "#437977",
  );
  for (let j = 0; j < 8; j++)
    box(
      resort,
      "Pergola slat",
      -1.9 + j * 0.4,
      5.18,
      -1.65,
      0.1,
      0.22,
      2.1,
      "#68968a",
    );
  resort.children.forEach((o) => {
    o.position.z -= 0.45;
    o.position.x -= 0.3;
  });
  box(
    resort,
    "Pool travertine surround",
    -1.75,
    0.405,
    1.4,
    2.55,
    0.09,
    1.4,
    "#fff1d6",
    0.18,
  );
  const pool = box(
    resort,
    "Turquoise pool water",
    -1.75,
    0.46,
    1.4,
    2.18,
    0.025,
    1.05,
    "#50b5bf",
    0.13,
  );
  pool.material = pool.material.clone();
  pool.material.roughness = 0.2;
  pool.material.metalness = 0.12;
  for (let j = 0; j < 6; j++)
    box(
      resort,
      "Pool tile lane",
      -2.6 + j * 0.34,
      0.477,
      1.4,
      0.015,
      0.008,
      0.96,
      "#a0e0d5",
    );
  for (const x of [-2.8, -1.7]) {
    lounger(resort, x, 2.65);
    umbrella(resort, x - 0.2, 2.55, "#e8ac86");
  }
  palm(ISLANDS.sunset.x - 3.2, ISLANDS.sunset.z - 2.9, 0.9, 0.8);
  palm(ISLANDS.sunset.x - 3.2, ISLANDS.sunset.z + 0.2, 1, 1.8);
  palm(ISLANDS.sunset.x + 3, ISLANDS.sunset.z - 2.85, 0.85, 3);
  // Reef Island Beach Club: boardwalk, bar, cabanas, pool toys and a beach garden.
  const club = group("Reef Beach Club terrace", REEF.x, REEF.z);
  box(club, "Club boardwalk", -0.75, 0.385, 0.7, 3.1, 0.08, 1.75, "#bc936e");
  for (let j = 0; j < 14; j++)
    box(
      club,
      "Boardwalk seam",
      -2.2 + j * 0.22,
      0.43,
      0.7,
      0.014,
      0.008,
      1.75,
      "#987658",
    );
  box(club, "Beach bar counter", -0.65, 0.83, -0.25, 1.8, 0.12, 0.4, "#507e7c");
  for (let j = 0; j < 4; j++) {
    tube(
      club,
      "Bar stool stem",
      [-1.3 + j * 0.45, 0.43, 0.15],
      [-1.3 + j * 0.45, 0.8, 0.15],
      0.035,
      "#d9bd85",
    );
    mesh(
      club,
      "Bar stool seat",
      new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10),
      "#e49375",
      -1.3 + j * 0.45,
      0.81,
      0.15,
    );
    mesh(
      club,
      "Lemonade glass",
      new THREE.CylinderGeometry(0.036, 0.03, 0.11, 8),
      "#ecd67d",
      -1.3 + j * 0.45,
      0.945,
      -0.22,
    );
  }
  for (const x of [-1.7, -1.05]) {
    lounger(club, x, 1.28);
    umbrella(club, x - 0.2, 1.45, "#8db6aa");
  }
  palm(REEF.x - 2.1, REEF.z - 1.5, 0.8, 1);
  palm(REEF.x + 2.1, REEF.z - 1.9, 0.8, 2);
  palm(REEF.x - 2.1, REEF.z + 1.6, 0.75, 3);
  for (const x of [-1.15, 1.15]) {
    tube(
      club,
      "Club pergola post",
      [x, 0.45, -0.65],
      [x, 2.3, -0.65],
      0.04,
      "#b89569",
    );
  }
  tube(
    club,
    "Club string lights",
    [-1.15, 2.3, -0.65],
    [1.15, 2.3, -0.65],
    0.012,
    "#657669",
  );
  for (let j = 0; j < 7; j++)
    ball(
      club,
      "Club festoon lamp",
      -1.05 + j * 0.35,
      2.24,
      -0.65,
      0.055,
      "#f4d38b",
    );
  // District-specific details sit outside the delivery corridors and aircraft pads.
  for (const [id, island] of Object.entries(ISLANDS)) {
    const g = group(`${island.name} streetscape`, island.x, island.z);
    if (id !== "sunset")
      for (let j = 0; j < 3; j++) {
        const x = -2 + j * 2;
        for (let k = 0; k < 6; k++)
          box(
            g,
            "Striped storefront valance",
            x - 0.6 + k * 0.24,
            1.04,
            -0.43,
            0.23,
            0.1,
            0.37,
            k % 2 ? "#fff2d8" : island.color,
          );
        planter(g, x - 0.63, -0.47);
        box(g, "Shop step", x, 0.42, -0.48, 0.65, 0.08, 0.23, "#d9c8a3");
        if (id !== "copper")
          box(
            g,
            "Roof chimney",
            x - 0.4,
            1.45 + (j % 2) * 0.6,
            -1.55,
            0.18,
            0.42,
            0.22,
            "#d8b996",
          );
      }
    for (let j = 0; j < 16; j++) {
      const x = -3.1 + random(j + island.x) * 6.2,
        z = -3.05 + random(j * 3 + island.z) * 0.25;
      const rock = ball(
        g,
        "Shoreline pebble",
        x,
        -0.03,
        z,
        0.13 + random(j + 2) * 0.13,
        ["#a4aaa0", "#cabaa0", "#d9c7aa"][j % 3],
      );
      rock.scale.y = 0.55;
    }
    if (id === "juniper") {
      for (let k = 0; k < 5; k++)
        tube(
          g,
          "Drying fishing net",
          [-3.55, 0.65 + k * 0.14, -1.3],
          [-3.55, 0.65 + k * 0.14, 0.65],
          0.009,
          "#d3c3a0",
        );
      for (let k = 0; k < 5; k++)
        tube(
          g,
          "Net weave",
          [-3.55, 0.65, -1.3 + k * 0.48],
          [-3.55, 1.21, -1.3 + k * 0.48],
          0.009,
          "#d3c3a0",
        );
      for (let k = 0; k < 3; k++)
        box(
          g,
          "Dockside barrel",
          -2.9,
          0.57,
          1.3 + k * 0.42,
          0.28,
          0.42,
          0.32,
          "#977d66",
        );
    }
    if (id === "festival") {
      for (let k = 0; k < 9; k++) {
        const pennant = mesh(
          g,
          "Festival bunting",
          new THREE.ConeGeometry(0.12, 0.24, 3),
          ["#e9a49a", "#e5c371", "#90b7a7"][k % 3],
          -2.8 + k * 0.7,
          2.6 + Math.abs(k - 4) * 0.04,
          -2.85,
        );
        pennant.rotation.z = Math.PI;
      }
      for (const x of [-2.1, 2.1]) {
        box(g, "Festival speaker", x, 0.98, -2.8, 0.34, 0.65, 0.38, "#485864");
        for (const y of [0.82, 1.14])
          ball(g, "Speaker cone", x, y, -2.59, 0.1, "#a3afa5");
      }
    }
    if (id === "ridge") {
      for (let k = 0; k < 4; k++) {
        const x = -3.1 + k * 1.7;
        tube(
          g,
          "Trail fence post",
          [x, 0.37, -3.05],
          [x, 0.92, -3.05],
          0.035,
          "#a48c65",
        );
        if (k < 3)
          tube(
            g,
            "Trail fence rail",
            [x, 0.76, -3.05],
            [x + 1.7, 0.76, -3.05],
            0.027,
            "#baa179",
          );
      }
    }
    if (id === "copper")
      for (let j = 0; j < 3; j++) {
        const x = -2 + j * 2;
        box(
          g,
          "Copper apartment roof cornice",
          x,
          2.53 + j * 0.4,
          -1.55,
          1.53,
          0.14,
          1.48,
          "#ebcfab",
        );
        box(
          g,
          "Roof water tank",
          x,
          2.92 + j * 0.4,
          -1.8,
          0.4,
          0.65,
          0.45,
          "#769797",
        );
      }
    if (["juniper", "festival"].includes(id))
      palm(island.x - 3.05, island.z + 2.25, 0.7, random(island.x) * 6);
  }
  // More varied planting in safe corners of the home island.
  palm(-5.75, 4.7, 0.8, 2.1);
  palm(5.8, 0.4, 0.68, 0.3);
  // Nautical detail remains attached to the animated boat.
  for (const x of [-0.33, 0.33]) {
    tube(
      w.boat,
      "Stainless lifeline",
      [x, 0.64, -0.7],
      [x, 0.64, 0.68],
      0.012,
      "#f2e5c5",
    );
    for (const z of [-0.7, 0.65])
      tube(
        w.boat,
        "Lifeline stanchion",
        [x, 0.35, z],
        [x, 0.64, z],
        0.014,
        "#e5dfc7",
      );
    tube(
      w.boat,
      "Mast rigging",
      [x, 0.47, -0.65],
      [0, 2.1, 0],
      0.007,
      "#cfbe96",
    );
  }
  for (let k = 0; k < 7; k++)
    box(
      w.boat,
      "Teak deck plank",
      -0.24 + k * 0.08,
      0.428,
      0,
      0.013,
      0.015,
      1.15,
      "#b89970",
    );
  const buoy = mesh(
    w.boat,
    "Life ring",
    new THREE.TorusGeometry(0.15, 0.044, 6, 16),
    "#f1d5a2",
    0.445,
    0.29,
    -0.35,
  );
  buoy.rotation.y = Math.PI / 2;
  box(
    w.boat,
    "Captain's cargo locker",
    0,
    0.55,
    -0.62,
    0.38,
    0.25,
    0.3,
    "#5a8f88",
  );
  tube(w.boat, "Tiller", [0, 0.49, -0.75], [0, 0.68, -0.27], 0.023, "#8f694d");
  // The packing room and workshop share one visual identity.
  const workshop = w.workshop;
  box(
    workshop,
    "Brine workshop brass nameplate",
    -0.4,
    0.95,
    0.805,
    0.72,
    0.11,
    0.026,
    "#e9c88d",
  );
  for (let k = 0; k < 6; k++)
    box(
      workshop,
      "Workshop roof standing seam",
      -0.94 + k * 0.38,
      1.405,
      0,
      0.025,
      0.025,
      1.7,
      "#527e79",
    );
  const effect = new THREE.Group();
  effect.name = "Workshop construction animation";
  effect.userData.dynamic = true;
  effect.position.copy(workshop.position);
  w.world.add(effect);
  w.buildEffect = effect;
  for (const x of [-1.3, 1.3])
    for (const z of [-0.85, 0.95]) {
      tube(effect, "Workshop scaffold", [x, 0, z], [x, 2, z], 0.025, "#dcbb75");
      for (const y of [0.5, 1.2, 1.85])
        tube(
          effect,
          "Scaffold platform",
          [x, y, -0.85],
          [x, y, 0.95],
          0.025,
          "#dcbb75",
        );
    }
  w.buildSparks = [];
  for (let i = 0; i < 14; i++) {
    const spark = ball(
      effect,
      "Construction sparkle",
      0,
      0,
      0,
      0.045,
      "#fff1b2",
    );
    w.buildSparks.push(spark);
  }
  effect.visible = false;
  // Product-sized details, shared by the scene installations and exported 3D catalog.
  for (const [id, g] of Object.entries(w.gadgetModels)) {
    const bolt = (x, y, z) =>
      mesh(
        g,
        "Brass fastener",
        new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6),
        "#e4c991",
        x,
        y,
        z,
      );
    if (id === "repair_kit") {
      for (const x of [-0.13, 0.13]) {
        box(
          g,
          "Toolbox brass latch",
          x,
          0.18,
          0.13,
          0.04,
          0.07,
          0.018,
          "#f1d491",
        );
        bolt(x, 0.246, 0.08);
      }
      tube(
        g,
        "Spanner shaft",
        [-0.14, 0.29, -0.035],
        [0.12, 0.29, 0.05],
        0.012,
        "#b6c4c3",
      );
      mesh(
        g,
        "Spanner jaw",
        new THREE.TorusGeometry(0.03, 0.012, 5, 8, Math.PI * 1.4),
        "#b6c4c3",
        0.12,
        0.29,
        0.05,
      ).rotation.x = Math.PI / 2;
      box(
        g,
        "Workshop toolbox label",
        0,
        0.12,
        0.135,
        0.14,
        0.065,
        0.008,
        "#fff0d0",
      );
    } else if (id === "cooler") {
      for (const x of [-0.24, 0.24])
        tube(
          g,
          "Cooler grab handle",
          [x, 0.13, -0.09],
          [x, 0.13, 0.09],
          0.018,
          "#4f7377",
        );
      box(g, "Cooler lock", 0, 0.27, 0.176, 0.055, 0.1, 0.025, "#789592");
      box(
        g,
        "Cooler insulated seam",
        0,
        0.29,
        0,
        0.446,
        0.016,
        0.35,
        "#4f7377",
      );
      box(g, "Snowflake label", 0, 0.13, 0.177, 0.12, 0.09, 0.01, "#eef5dc");
    } else if (id === "cargo_rack") {
      for (const y of [0.04, 0.26])
        for (const x of [-0.13, 0, 0.13])
          box(g, "Cargo rack slat", x, y, 0, 0.045, 0.014, 0.45, "#b9cbb1");
      for (const x of [-0.24, 0.24])
        for (const z of [-0.2, 0.2]) bolt(x, 0.405, z);
      box(
        g,
        "Rack strapped sample case",
        0,
        0.32,
        0,
        0.22,
        0.16,
        0.24,
        "#d2ac75",
      );
      box(g, "Canvas cargo strap", 0, 0.405, 0, 0.035, 0.012, 0.25, "#fff0d0");
    } else if (id === "solar_panel") {
      for (const x of [-0.26, 0.26])
        box(
          g,
          "Aluminum solar frame",
          x,
          0.1,
          0,
          0.025,
          0.075,
          0.42,
          "#adbdba",
        );
      for (const z of [-0.2, 0.2])
        box(g, "Solar edge trim", 0, 0.1, z, 0.52, 0.075, 0.02, "#adbdba");
      for (const z of [-0.1, 0, 0.1])
        box(g, "Cell conductor", 0, 0.12, z, 0.46, 0.005, 0.009, "#b8d0d6");
      tube(
        g,
        "Folding solar stand",
        [-0.2, 0.08, -0.15],
        [-0.2, -0.08, 0.12],
        0.018,
        "#586c73",
      );
      tube(
        g,
        "Folding solar stand",
        [0.2, 0.08, -0.15],
        [0.2, -0.08, 0.12],
        0.018,
        "#586c73",
      );
    } else if (id === "cargo_dolly") {
      for (const x of [-0.14, 0.14])
        tube(g, "Dolly side rail", [x, 0.08, 0], [x, 0.5, 0], 0.02, "#bd875b");
      tube(
        g,
        "Rubber dolly handle",
        [-0.14, 0.5, 0],
        [0.14, 0.5, 0],
        0.026,
        "#415c62",
      );
      for (const y of [0.17, 0.32])
        tube(
          g,
          "Dolly cross brace",
          [-0.14, y, 0],
          [0.14, y, 0],
          0.017,
          "#bd875b",
        );
      box(
        g,
        "Dolly delivery crate",
        0,
        0.19,
        0.15,
        0.24,
        0.24,
        0.23,
        "#b9cc92",
      );
      box(g, "Crate label", 0, 0.22, 0.27, 0.12, 0.08, 0.01, "#fff1cf");
    } else if (id === "navigation") {
      for (const x of [-0.09, -0.03, 0.03, 0.09])
        ball(g, "Route planner button", x, 0.045, 0.039, 0.015, "#d5cca1");
      tube(
        g,
        "Navigation antenna",
        [0.1, 0.23, 0],
        [0.1, 0.36, 0],
        0.012,
        "#425b63",
      );
      for (let j = 0; j < 4; j++)
        box(
          g,
          "Route on map",
          -0.06 + j * 0.04,
          0.12 + j * 0.015,
          0.042,
          0.04,
          0.008,
          0.008,
          "#569985",
        );
      ball(g, "Map destination pin", 0.07, 0.18, 0.047, 0.019, "#d18a6d");
    } else if (id === "scanner") {
      box(
        g,
        "Printer control screen",
        0,
        0.214,
        -0.02,
        0.18,
        0.012,
        0.08,
        "#6aab9c",
      );
      for (let j = 0; j < 6; j++)
        box(
          g,
          "Label barcode",
          -0.07 + j * 0.026,
          0.148,
          0.21,
          0.011,
          0.006,
          0.1,
          "#536365",
        );
      for (const x of [-0.12, 0.12])
        ball(g, "Printer status light", x, 0.213, 0.06, 0.013, "#a6c68a");
      box(
        g,
        "Printer output slot",
        0,
        0.135,
        0.153,
        0.25,
        0.045,
        0.018,
        "#385868",
      );
    } else if (id === "generator") {
      for (const x of [-0.24, 0.24])
        for (const z of [-0.18, 0.18])
          tube(
            g,
            "Generator safety cage",
            [x, 0.02, z],
            [x, 0.4, z],
            0.018,
            "#4e6264",
          );
      for (const x of [-0.24, 0.24])
        tube(
          g,
          "Generator carry rail",
          [x, 0.4, -0.18],
          [x, 0.4, 0.18],
          0.018,
          "#4e6264",
        );
      for (let j = 0; j < 5; j++)
        box(
          g,
          "Generator cooling grille",
          -0.15 + j * 0.07,
          0.2,
          0.174,
          0.02,
          0.2,
          0.012,
          "#4e6264",
        );
      mesh(
        g,
        "Generator dial",
        new THREE.CylinderGeometry(0.044, 0.044, 0.014, 12),
        "#f2e5c5",
        0,
        0.355,
        0,
      );
    } else if (id === "winch") {
      const drum = g.children.find((o) => o.name === "Cargo winch");
      if (drum) drum.rotation.z = Math.PI / 2;
      for (let j = 0; j < 7; j++) {
        const coil = mesh(
          g,
          "Winch cable coil",
          new THREE.TorusGeometry(0.147, 0.008, 4, 14),
          "#d6c9a5",
          -0.1 + j * 0.033,
          0.15,
          0,
        );
        coil.rotation.y = Math.PI / 2;
      }
      for (const x of [-0.17, 0.17])
        box(g, "Winch mount", x, 0.13, 0, 0.04, 0.27, 0.26, "#5d797e");
      const hook = mesh(
        g,
        "Cargo hook",
        new THREE.TorusGeometry(0.052, 0.014, 5, 12, Math.PI * 1.5),
        "#c6b482",
        0,
        -0.1,
        0.18,
      );
      hook.rotation.z = Math.PI;
    } else if (id === "rain_gear") {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        tube(
          g,
          "Umbrella stitched rib",
          [0, 0.38, 0],
          [Math.cos(a) * 0.29, 0.22, Math.sin(a) * 0.29],
          0.006,
          "#fff1b8",
        );
      }
      mesh(
        g,
        "Umbrella curved handle",
        new THREE.TorusGeometry(0.034, 0.01, 5, 12, Math.PI),
        "#557476",
        0.034,
        -0.006,
        0,
      ).rotation.z = Math.PI;
      box(
        g,
        "Folded waterproof satchel",
        0.25,
        0.07,
        0.12,
        0.14,
        0.14,
        0.12,
        "#8caf91",
      );
    }
  }
  return finishModels(w);
}
