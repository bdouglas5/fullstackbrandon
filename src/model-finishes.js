import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Finishing parts stay with their articulated parent. Small fixed details share
// materials and geometry, then batch locally so crew copies remain inexpensive.
export function finishModels(w) {
  const materials = new Map();
  const geometry = new Map();
  // Painted-miniature response: everything keeps a soft sheen; metal stays
  // distinct without turning into a mirror.
  const finishes = {
    enamel: { roughness: 0.32, metalness: 0.05 },
    metal: { roughness: 0.34, metalness: 0.55 },
    cloth: { roughness: 0.7, metalness: 0 },
    rubber: { roughness: 0.62, metalness: 0 },
    glass: { roughness: 0.14, metalness: 0.1 },
    wood: { roughness: 0.55, metalness: 0 },
  };
  const mat = (color, finish = "enamel") => {
    const key = `${color}/${finish}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({ color, ...finishes[finish] }),
      );
    return materials.get(key);
  };
  const mesh = (g, name, geo, color, x, y, z, finish) => {
    const m = new THREE.Mesh(geo, mat(color, finish));
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const box = (g, name, x, y, z, a, b, c, color, finish = "enamel") => {
    const key = [a, b, c].join();
    if (!geometry.has(key))
      geometry.set(
        key,
        new RoundedBoxGeometry(
          a,
          b,
          c,
          1,
          Math.min(0.018, a / 4, b / 4, c / 4),
        ),
      );
    return mesh(g, name, geometry.get(key), color, x, y, z, finish);
  };
  const ball = (g, name, x, y, z, r, color, finish) => {
    const key = `ball/${r}`;
    if (!geometry.has(key))
      geometry.set(key, new THREE.IcosahedronGeometry(r, 1));
    return mesh(g, name, geometry.get(key), color, x, y, z, finish);
  };
  const tube = (g, name, a, b, radius, color, finish = "metal") => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b);
    const delta = to.clone().sub(from);
    const key = `tube/${radius}/${delta.length().toFixed(5)}`;
    if (!geometry.has(key))
      geometry.set(
        key,
        new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
      );
    const m = mesh(
      g,
      name,
      geometry.get(key),
      color,
      ...from.add(to).multiplyScalar(0.5).toArray(),
      finish,
    );
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return m;
  };
  const group = (parent, name) => {
    const g = new THREE.Group();
    g.name = name;
    parent.add(g);
    return g;
  };
  const batch = (g) => {
    const bins = new Map();
    for (const m of [...g.children]) {
      if (!m.isMesh || m.userData.glowColor) continue;
      if (!bins.has(m.material)) bins.set(m.material, []);
      bins.get(m.material).push(m);
    }
    for (const [material, meshes] of bins) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map((m) => {
        m.updateMatrix();
        const part = m.geometry.index
          ? m.geometry.toNonIndexed()
          : m.geometry.clone();
        // Authored sail geometry has no UVs; fixed details always do.
        return part.applyMatrix4(m.matrix);
      });
      const merged = new THREE.Mesh(mergeGeometries(pieces), material);
      merged.name = meshes
        .map((m) => m.name)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(" · ");
      merged.castShadow = merged.receiveShadow = true;
      g.add(merged);
      meshes.forEach((m) => m.removeFromParent());
      pieces.forEach((p) => p.dispose());
    }
  };
  const glow = (m, color, intensity = 1) => {
    m.userData.glowColor = color;
    m.userData.glowIntensity = intensity;
    return m;
  };
  const sway = (object, axis, amplitude, speed, phase = 0) => {
    object.userData.dynamic = true;
    w.secondaryMotion.push({
      object,
      axis,
      base: object.rotation[axis],
      amplitude,
      speed,
      phase,
    });
  };
  const refined = new Map();
  const applyFinish = (m, finish) => {
    const key = `${m.material.uuid}/${finish}`;
    if (!refined.has(key)) {
      const material = m.material.clone();
      Object.assign(material, finishes[finish]);
      refined.set(key, material);
    }
    m.material = refined.get(key);
  };
  w.world.traverse((m) => {
    if (!m.isMesh || !m.material.isMeshStandardMaterial) return;
    const name = m.name.toLowerCase();
    if (
      /glass|glazing|recessed glass|shop window|upper window|apartment window|pool water/.test(
        name,
      )
    )
      applyFinish(m, "glass");
    else if (
      /brass|stainless|fastener|latch|roof rack|spanner|door handle|skid|rotor|turbine|winch|rail post/.test(
        name,
      )
    )
      applyFinish(m, "metal");
    else if (
      /lower body|cargo shell|bonnet|cab roof|boat hull|tail boom|tail fin|tail plane|solar cells/.test(
        name,
      )
    )
      applyFinish(m, "enamel");
    else if (
      /overshirt|sleeve|cap$|trousers|cushion|towel|parasol|awning/.test(name)
    )
      applyFinish(m, "cloth");
    else if (/plank|teak|barrel|boardwalk|bench/.test(name))
      applyFinish(m, "wood");
    if (/headlight|rear light|status light|charging display/.test(name))
      glow(
        m,
        /rear/.test(name)
          ? "#ff7958"
          : /status|display/.test(name)
            ? "#a9efd0"
            : "#ffe3ad",
      );
  });

  const dressCourier = (body) => {
    // Figurine couriers are built complete, with their own head rig and cuffs.
    if (body.userData.toyRig) return;
    const head = group(body, "head rig");
    head.position.y = 0.96;
    // Preserve every face part's authored position around the neck pivot.
    for (const part of [...body.children]) {
      if (part === head || part.position.y < 0.96 || !part.isMesh) continue;
      head.add(part);
      part.position.y -= head.position.y;
    }
    const face = group(head, "Tailored cap and face details");
    for (const side of [-1, 1]) {
      const ear = ball(
        face,
        "Ear",
        side * 0.26,
        0.16,
        0,
        0.06,
        "#e8b18b",
        "cloth",
      );
      ear.scale.set(0.6, 1, 0.75);
    }
    box(
      face,
      "Cap embroidered badge",
      0,
      0.445,
      0.23,
      0.13,
      0.07,
      0.018,
      "#f5d490",
      "cloth",
    );
    box(
      face,
      "Cap badge stitch",
      0,
      0.445,
      0.243,
      0.022,
      0.05,
      0.008,
      "#337879",
      "cloth",
    );
    const clothes = group(body, "Courier tailoring");
    for (const side of [-1, 1]) {
      tube(
        clothes,
        "Backpack woven shoulder strap",
        [side * 0.17, 0.86, 0.12],
        [side * 0.15, 0.45, 0.15],
        0.022,
        "#d9b877",
        "cloth",
      );
      box(
        clothes,
        "Overshirt pocket",
        side * 0.14,
        0.7,
        0.158,
        0.105,
        0.105,
        0.012,
        "#39868a",
        "cloth",
      );
    }
    for (const y of [0.57, 0.68, 0.78])
      ball(clothes, "Shirt button", 0.092, y, 0.168, 0.011, "#d9ccb0", "metal");
    box(
      clothes,
      "Satchel leather pocket",
      0,
      0.64,
      -0.356,
      0.27,
      0.18,
      0.02,
      "#d8a54e",
      "cloth",
    );
    tube(
      clothes,
      "Satchel stitched zip",
      [-0.13, 0.75, -0.37],
      [0.13, 0.75, -0.37],
      0.009,
      "#fff0c1",
      "cloth",
    );
    box(
      clothes,
      "Satchel brass clasp",
      0,
      0.66,
      -0.375,
      0.045,
      0.065,
      0.012,
      "#e5d197",
      "metal",
    );
    for (const side of ["left", "right"]) {
      const arm = body.getObjectByName(`${side} arm`);
      if (!arm) continue;
      const sleeve = arm.getObjectByName("sleeve");
      sleeve.scale.y = 0.64;
      sleeve.position.y = -0.085;
      const elbow = group(arm, "elbow");
      elbow.position.y = -0.16;
      const hand = arm.children.find((m) => m.isMesh && m !== sleeve);
      if (hand) {
        elbow.add(hand);
        hand.position.y -= elbow.position.y;
      }
      const lower = box(
        elbow,
        "sleeve",
        0,
        -0.065,
        0,
        0.178,
        0.14,
        0.215,
        "#216f75",
        "cloth",
      );
      lower.material = sleeve.material;
      box(
        elbow,
        "Rolled linen cuff",
        0,
        -0.13,
        0,
        0.185,
        0.05,
        0.224,
        "#7aa29c",
        "cloth",
      );
      const knee = body.getObjectByName(`${side} leg`)?.getObjectByName("knee");
      if (knee) {
        const shoe = group(knee, "Sneaker tailoring");
        box(
          shoe,
          "Sneaker rubber sole",
          0,
          -0.209,
          0.055,
          0.216,
          0.027,
          0.335,
          "#dbc9a5",
          "rubber",
        );
        for (const z of [0.06, 0.105])
          box(
            shoe,
            "Sneaker laces",
            0,
            -0.081,
            z,
            0.105,
            0.012,
            0.012,
            "#d4c8b0",
            "cloth",
          );
        batch(shoe);
      }
    }
    const parcel = body.getObjectByName("carried parcel");
    if (parcel) {
      box(
        parcel,
        "Shipping label",
        0.1,
        0.02,
        0.185,
        0.14,
        0.15,
        0.012,
        "#fff0cd",
        "cloth",
      );
      box(
        parcel,
        "Jar-case lid seam",
        0,
        0.204,
        0,
        0.46,
        0.008,
        0.013,
        "#8e6746",
        "wood",
      );
    }
    batch(face);
    batch(clothes);
  };
  for (const body of [
    w.body,
    w.rider,
    w.driver,
    w.pilot,
    w.jetPilot,
    w.portalPilot,
  ])
    dressCourier(body);

  const aircraft = group(w.helicopter, "Aircraft coachwork");
  w.helicopter.children[0].name = "Helicopter enamel fuselage";
  applyFinish(w.helicopter.children[0], "enamel");
  w.helicopter.children[1].name = "Helicopter cockpit canopy";
  w.helicopter.children[1].userData.unlitGlass = true;
  applyFinish(w.helicopter.children[1], "glass");
  for (const side of [-1, 1]) {
    tube(
      aircraft,
      "Cockpit canopy frame",
      [side * 0.3, 0.8, 0.74],
      [side * 0.24, 1.2, 0.68],
      0.019,
      "#fff0d6",
    );
    tube(
      aircraft,
      "Cockpit door seam",
      [side * 0.434, 0.72, 0.08],
      [side * 0.434, 1.11, 0.08],
      0.008,
      "#d09c48",
    );
    box(
      aircraft,
      "Cockpit polished door handle",
      side * 0.455,
      0.95,
      0.14,
      0.018,
      0.025,
      0.14,
      "#dce4d9",
      "metal",
    );
    for (let j = 0; j < 4; j++)
      box(
        aircraft,
        "Engine intake vent",
        side * 0.325,
        1.18,
        -0.23 - j * 0.07,
        0.018,
        0.1,
        0.032,
        "#426363",
        "metal",
      );
    glow(
      ball(
        w.helicopter,
        "Aircraft navigation lens",
        side * 0.55,
        1.045,
        -1.5,
        0.045,
        side < 0 ? "#ed795f" : "#84d8b0",
      ),
      side < 0 ? "#ff7654" : "#83efb5",
      1.4,
    );
  }
  box(
    aircraft,
    "Cockpit instrument console",
    0,
    0.75,
    0.62,
    0.31,
    0.13,
    0.12,
    "#294a53",
    "rubber",
  );
  glow(
    box(
      w.helicopter,
      "Cockpit instrument display",
      0,
      0.825,
      0.62,
      0.19,
      0.01,
      0.075,
      "#87d8bb",
    ),
    "#89eac4",
    0.55,
  );
  const hub = ball(
    w.rotor,
    "Rotor alloy hub",
    0,
    0.025,
    0,
    0.09,
    "#aabbb2",
    "metal",
  );
  hub.scale.y = 0.65;
  for (const angle of [0, Math.PI / 2])
    for (const side of [-1, 1]) {
      const tip = box(
        w.rotor,
        "Rotor safety tip",
        Math.cos(angle) * side * 1.55,
        0.003,
        Math.sin(angle) * side * 1.55,
        0.14,
        0.03,
        0.123,
        "#f8d486",
      );
      tip.rotation.y = -angle;
    }
  batch(aircraft);

  const van = group(w.chassis, "Van coachwork");
  for (const side of [-1, 1]) {
    box(
      van,
      "Cargo door vertical seam",
      side * 0.456,
      1.01,
      -0.64,
      0.014,
      0.4,
      0.01,
      "#b8c4b8",
      "metal",
    );
    box(
      van,
      "Cargo door latch",
      side * 0.463,
      1.05,
      -0.58,
      0.026,
      0.038,
      0.13,
      "#667e7a",
      "metal",
    );
    box(
      van,
      "Mirror silver inlay",
      side * 0.52,
      1.03,
      0.731,
      0.092,
      0.072,
      0.011,
      "#bed2cd",
      "glass",
    );
    tube(
      van,
      "Front windscreen wiper",
      [side * 0.21, 0.876, 0.784],
      [side * 0.12, 1.075, 0.787],
      0.01,
      "#354b51",
      "rubber",
    );
    glow(
      box(
        w.chassis,
        "Amber side repeater",
        side * 0.463,
        0.73,
        0.51,
        0.016,
        0.045,
        0.077,
        "#ffc277",
      ),
      "#ffbf6f",
      0.5,
    );
  }
  for (const y of [0.568, 0.608, 0.648])
    box(
      van,
      "Radiator chrome blade",
      0,
      y,
      0.875,
      0.24,
      0.012,
      0.012,
      "#9badab",
      "metal",
    );
  box(
    van,
    "Rear number plate",
    0,
    0.48,
    -0.951,
    0.26,
    0.084,
    0.016,
    "#e8dfbd",
    "metal",
  );
  batch(van);

  const bicycle = group(w.bike, "Bicycle touring fittings");
  for (const side of [-1, 1]) {
    tube(
      bicycle,
      "Leather handle grip",
      [side * 0.17, 1, 0.4],
      [side * 0.25, 1, 0.4],
      0.033,
      "#ae8060",
      "wood",
    );
    tube(
      bicycle,
      "Cargo basket binding",
      [side * 0.255, 0.57, -0.81],
      [side * 0.255, 0.87, -0.81],
      0.012,
      "#e8cc92",
    );
    for (let j = 0; j < 4; j++)
      box(
        bicycle,
        "Basket woven slat",
        side * 0.253,
        0.6 + j * 0.075,
        -0.62,
        0.012,
        0.017,
        0.38,
        "#dab58a",
        "wood",
      );
  }
  const bell = ball(
    bicycle,
    "Polished bicycle bell",
    0.11,
    1.045,
    0.4,
    0.035,
    "#e5c887",
    "metal",
  );
  bell.scale.y = 0.7;
  glow(
    ball(w.bike, "Bicycle headlamp lens", 0, 0.89, 0.48, 0.049, "#ffe2a7"),
    "#ffdf9e",
    1.25,
  );
  glow(
    box(
      w.bike,
      "Bicycle rear reflector",
      0,
      0.63,
      -0.83,
      0.09,
      0.06,
      0.024,
      "#ef8870",
    ),
    "#ff735a",
    0.6,
  );
  for (const wheel of w.bikeWheels) {
    const rim = mesh(
      wheel,
      "Brushed bicycle rim",
      new THREE.TorusGeometry(0.268, 0.011, 6, 24),
      "#d9d4b8",
      0,
      0,
      0,
      "metal",
    );
    rim.rotation.y = Math.PI / 2;
    box(
      wheel,
      "Wheel amber reflector",
      0.012,
      0.15,
      0,
      0.025,
      0.078,
      0.03,
      "#efbc64",
    );
  }
  batch(bicycle);

  // A curved, stitched triangular sail catches changing light as it breathes.
  const oldSail = w.boat.children.find(
    (m) => m.isMesh && m.geometry.type === "BufferGeometry",
  );
  oldSail?.removeFromParent();
  const sail = group(w.boat, "sail");
  sail.position.set(0, 0.55, 0);
  const positions = [],
    uvs = [],
    indices = [],
    steps = 8;
  const point = (u, v) => [
    0.06 + u * 0.79,
    v * 1.5,
    Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.21,
  ];
  const rows = [];
  for (let row = 0; row <= steps; row++) {
    rows[row] = [];
    for (let col = 0; col <= steps - row; col++) {
      rows[row][col] = positions.length / 3;
      positions.push(...point(col / steps, row / steps));
      uvs.push(col / steps, row / steps);
    }
  }
  for (let row = 0; row < steps; row++)
    for (let col = 0; col < steps - row; col++) {
      indices.push(rows[row][col], rows[row][col + 1], rows[row + 1][col]);
      if (col < steps - row - 1)
        indices.push(
          rows[row][col + 1],
          rows[row + 1][col + 1],
          rows[row + 1][col],
        );
    }
  const sailGeometry = new THREE.BufferGeometry();
  sailGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  sailGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  sailGeometry.setIndex(indices);
  sailGeometry.computeVertexNormals();
  const cloth = mesh(
    sail,
    "Ivory billowed sailcloth",
    sailGeometry,
    "#ffefd4",
    0,
    0,
    0,
    "cloth",
  );
  cloth.material = cloth.material.clone();
  cloth.material.side = THREE.DoubleSide;
  const seams = group(sail, "Sail stitched panels");
  tube(
    seams,
    "Sail foot bolt rope",
    point(0, 0),
    point(1, 0),
    0.014,
    "#d6b785",
    "cloth",
  );
  tube(
    seams,
    "Sail luff bolt rope",
    point(0, 0),
    point(0, 1),
    0.012,
    "#d6b785",
    "cloth",
  );
  for (const v of [0.24, 0.49, 0.73])
    for (let i = 0; i < 5; i++) {
      const a = point((i / 5) * (1 - v), v),
        b = point(((i + 1) / 5) * (1 - v), v);
      a[2] += 0.004;
      b[2] += 0.004;
      tube(seams, "Sail panel stitching", a, b, 0.004, "#d4bd94", "cloth");
    }
  batch(seams);
  const tiller = w.boat.getObjectByName("Tiller");
  if (tiller) tiller.name = "tiller";
  const pennant = mesh(
    w.boat,
    "boat pennant",
    new THREE.ConeGeometry(0.1, 0.38, 3),
    "#58998e",
    0.15,
    2.16,
    0,
    "cloth",
  );
  pennant.rotation.z = -Math.PI / 2;
  pennant.scale.z = 0.18;

  // Distinct metal and ceramic engine parts give the small jetpack scale.
  const pack = group(w.jetpack, "Jetpack machined fittings");
  for (const side of [-1, 1]) {
    for (const y of [0.54, 0.93])
      mesh(
        pack,
        "Turbine retaining ring",
        new THREE.TorusGeometry(0.143, 0.018, 6, 16),
        "#cbd8cd",
        side * 0.25,
        y,
        -0.25,
        "metal",
      ).rotation.x = Math.PI / 2;
    glow(
      box(
        w.jetpack,
        "Jetpack charge indicator",
        side * 0.25,
        0.76,
        -0.395,
        0.055,
        0.22,
        0.018,
        "#8fe3d2",
      ),
      "#76f1db",
      1.2,
    );
    tube(
      pack,
      "Jetpack delivery harness",
      [side * 0.23, 0.9, -0.18],
      [side * 0.16, 0.56, 0.12],
      0.024,
      "#405d63",
      "rubber",
    );
  }
  batch(pack);

  // Articulated breeze details use one small batched crown per palm.
  const palms = [],
    pennants = [];
  w.world.traverse((o) => {
    if (o.name === "Wind-shaped coconut palm") palms.push(o);
    if (o.name === "Festival bunting") pennants.push(o);
  });
  pennants.forEach((p, i) => {
    p.scale.z = 0.15;
    sway(p, "x", 0.17, 2.2, i * 0.62);
  });
  // Bracket and blade signs stay above the shop threshold, clear of roads.
  for (const [i, shop] of [...w.businesses.values()].entries()) {
    const fitting = group(shop, "Shop brass hanging-sign bracket");
    tube(
      fitting,
      "Sign brass wall arm",
      [0.88, 1.43, 0.88],
      [0.88, 1.43, 1.3],
      0.018,
      "#c4a36b",
    );
    const hinge = group(shop, "Hanging shop-sign hinge");
    hinge.position.set(0.88, 1.43, 1.22);
    const board = box(
      hinge,
      "Enamel shop blade sign",
      0,
      -0.14,
      0,
      0.28,
      0.24,
      0.035,
      "#2a7478",
    );
    box(
      hinge,
      "Blade sign inset badge",
      0,
      -0.14,
      0.021,
      0.19,
      0.15,
      0.009,
      "#f5dcab",
    );
    ball(
      hinge,
      "Blade sign pickle emblem",
      0,
      -0.14,
      0.034,
      0.05,
      "#669976",
    ).scale.set(0.5, 1, 0.3);
    board.castShadow = true;
    sway(hinge, "x", 0.045, 1.35, i * 1.1);
    batch(hinge);
  }
  return w;
}
