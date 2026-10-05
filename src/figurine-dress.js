import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  smin,
  smax,
  ellipsoid,
  roundCone,
  torus,
  polygonize,
  relax,
  gradient,
  figurineGeometry,
} from "./figurine.js";

/**
 * Dress a figurine as a particular colleague.
 *
 * The courier is one sculpted body; crew and contractors are the same body in
 * their own skin, hair and headwear. Headwear is sculpted here with the same
 * clay toolkit (a soft shell on the skull with baked contact shading), so a
 * beanie or hard hat looks made by the same hand as the cap it replaces.
 * Call it once on a body before it is cloned for vehicles and seats.
 */

// The skull in the courier's local space (see figurine.js).
const SKULL = ellipsoid(0, 1.165, 0, 0.3, 0.282, 0.276);
// A rim that rises in front and dips behind, clear of the eyes and ears.
const rimY = (z, base) => base + 0.3 * z;

const cache = new Map();

/** Sculpt a headwear shell: the field is a clay dome cut by a tilted rim. */
function shell(key, build) {
  if (cache.has(key)) return cache.get(key);
  const field = build();
  const h = 0.016;
  const mesh = polygonize(field, [-0.5, 0.98, -0.5, 0.5, 1.7, 0.5], h);
  relax(field, mesh.positions, h);
  const P = mesh.positions;
  const count = P.length / 3;
  const normals = new Float32Array(count * 3),
    colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x = P[i * 3],
      y = P[i * 3 + 1],
      z = P[i * 3 + 2];
    const n = gradient(field, x, y, z);
    normals.set(n, i * 3);
    // Contact shading against the head beneath: darker where it hugs the skull.
    let occ = 0;
    for (let s = 1; s <= 4; s++) {
      const step = s * 0.02;
      occ +=
        (step - SKULL(x + n[0] * step, y + n[1] * step, z + n[2] * step)) /
        (1 << s);
    }
    const ao = THREE.MathUtils.clamp(1 - occ * 1.6, 0.55, 1);
    colors.fill(ao, i * 3, i * 3 + 3);
  }
  const index = [];
  for (const t of mesh.triangles) index.push(t[0], t[1], t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}

const SHELLS = {
  // A knit cap pulled down over the crown, rim lifted clear of the eyes.
  beanie: () =>
    shell("beanie", () => {
      const dome = ellipsoid(0, 1.2, -0.02, 0.338, 0.322, 0.334);
      return (x, y, z) => smax(dome(x, y, z), -(y - rimY(z, 1.13)) * 0.9, 0.03);
    }),
  // A tied bandana: a snug dome with a flatter crown.
  bandana: () =>
    shell("bandana", () => {
      const dome = ellipsoid(0, 1.2, -0.02, 0.33, 0.3, 0.326);
      return (x, y, z) =>
        smax(dome(x, y, z), -(y - rimY(z, 1.15)) * 0.9, 0.025);
    }),
  // A hard hat: tall dome, full brim, a longer bill at the front and a ridge.
  hardhat: () =>
    shell("hardhat", () => {
      const dome = ellipsoid(0, 1.22, -0.01, 0.34, 0.3, 0.34);
      const rim = (x, y, z) =>
        smax(dome(x, y, z), -(y - rimY(z, 1.2)) * 0.9, 0.02);
      // A chunky rolled brim, sheared so it rises at the front (the face stays
      // clear) and dips behind, a little longer at the front like a real bill.
      const plate = ellipsoid(0, 1.2, 0.06, 0.385, 0.038, 0.4);
      const roll = torus(0, 1.2, 0.02, 0, 1, 0, 0.372, 0.04);
      const brim = (x, y, z) => {
        const level = y - 0.27 * z;
        return smin(plate(x, level, z), roll(x, level, z), 0.03);
      };
      // A ridge that follows the dome's curve instead of standing off it.
      const spine = [
        [-0.25, 1.4],
        [-0.13, 1.485],
        [0, 1.515],
        [0.13, 1.485],
        [0.25, 1.4],
      ];
      const ridges = spine
        .slice(1)
        .map(([z, y], i) =>
          roundCone(0, spine[i][1], spine[i][0], 0, y, z, 0.046, 0.046),
        );
      return (x, y, z) => {
        let d = Math.min(rim(x, y, z), brim(x, y, z));
        for (const r of ridges) d = smin(d, r(x, y, z) + 0.004, 0.04);
        return d;
      };
    }),
};

// Hair that shows beneath or behind the headwear.
function puffGeometry() {
  if (cache.has("puff")) return cache.get("puff");
  // A ring of soft curls round the back and sides, below the headwear's rim.
  const balls = [
    [0.255, 1.13, -0.05, 0.085],
    [-0.255, 1.13, -0.05, 0.085],
    [0.22, 1.12, -0.18, 0.1],
    [-0.22, 1.12, -0.18, 0.1],
    [0.1, 1.1, -0.29, 0.105],
    [-0.1, 1.1, -0.29, 0.105],
    [0.0, 1.17, -0.3, 0.1],
  ].map(([x, y, z, r]) =>
    new THREE.SphereGeometry(r, 12, 9).translate(x, y, z),
  );
  const g = mergeGeometries(balls);
  balls.forEach((b) => b.dispose());
  cache.set("puff", g);
  return g;
}

/** A hung chain of capsules: each link pivots from the top of the one before. */
function chain(parent, name, material, links, origin) {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(...origin);
  parent.add(root);
  let hold = root;
  const pivots = [];
  for (const [r, length] of links) {
    const pivot = new THREE.Group();
    pivot.name = `${name} link`;
    hold.add(pivot);
    const link = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, length, 3, 8),
      material,
    );
    link.position.y = -length / 2 - r * 0.6;
    link.castShadow = link.receiveShadow = true;
    pivot.add(link);
    pivots.push(pivot);
    const next = new THREE.Group();
    next.position.y = -length - r * 1.2;
    pivot.add(next);
    hold = next;
  }
  root.userData.links = pivots.length;
  return root;
}

const tinted = (color, roughness = 0.62) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    vertexColors: true,
  });
const plain = (color, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

/**
 * @param {THREE.Object3D} body  a courier body from createFigurine (or a clone)
 * @param {object} look  skin, hair {color, style}, headwear, glasses, color,
 *                       scale, build, persona, id
 */
export function dressFigurine(body, look = {}) {
  const headRoot = body.getObjectByName("Sculpted face details");
  const head = body.getObjectByName("head rig");
  const paintMesh = (name, color) =>
    body.traverse((o) => {
      if (o.name !== name || !o.material) return;
      o.material = o.material.clone();
      o.material.color.set(color);
    });
  if (look.skin) paintMesh("Brandon skin", look.skin);
  if (look.hair?.color) {
    paintMesh("Hair", look.hair.color);
    body.traverse(
      (o) =>
        o.name === "Brow" &&
        o.material &&
        ((o.material = o.material.clone()),
        o.material.color.set(look.hair.color)),
    );
  }
  const uniform = look.color || "#db936a";
  paintMesh("teal overshirt", uniform);

  // Headwear replaces the sculpted courier cap, brim and its pickle emblem.
  const headwear = look.headwear || "cap";
  if (headwear === "cap") {
    paintMesh("cap", uniform);
    paintMesh("cap brim", uniform);
  } else {
    for (const name of [
      "cap",
      "Cap embroidered badge",
      "cap brim",
      "Cap pickle emblem",
    ])
      body.getObjectByName(name)?.removeFromParent();
    const geometry = SHELLS[headwear]?.();
    if (geometry && headRoot) {
      const color = headwear === "hardhat" ? "#f2c230" : uniform;
      const hat = new THREE.Mesh(
        geometry,
        tinted(color, headwear === "hardhat" ? 0.4 : 0.78),
      );
      hat.name =
        headwear === "hardhat"
          ? "Hard hat"
          : headwear === "beanie"
            ? "Knit beanie"
            : "Tied bandana";
      hat.castShadow = hat.receiveShadow = true;
      headRoot.add(hat);
      if (headwear === "beanie") {
        const cuff = new THREE.Mesh(
          new THREE.TorusGeometry(0.335, 0.034, 10, 40),
          plain(look.trim || "#f4ecd8", 0.85),
        );
        cuff.name = "Beanie cuff";
        cuff.rotation.x = Math.PI / 2 - Math.atan(0.3);
        cuff.position.set(0, rimY(0, 1.13) + 0.012, -0.02);
        cuff.castShadow = true;
        headRoot.add(cuff);
        const pom = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 14, 10),
          plain(look.trim || "#f4ecd8", 0.9),
        );
        pom.name = "Beanie pom";
        pom.position.set(0, 1.5, -0.02);
        pom.castShadow = true;
        headRoot.add(pom);
      }
      if (headwear === "bandana") {
        // A folded band across the brow, and a knot at the back whose tails swing.
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.33, 0.03, 10, 40),
          plain(look.trim || "#fff3d0", 0.85),
        );
        band.name = "Bandana band";
        band.rotation.x = Math.PI / 2 - Math.atan(0.3);
        band.position.set(0, rimY(0, 1.15) + 0.012, -0.02);
        band.castShadow = true;
        headRoot.add(band);
        const tails = chain(
          headRoot,
          "Bandana tail",
          plain(uniform, 0.8),
          [
            [0.04, 0.07],
            [0.034, 0.06],
          ],
          [0, 1.2, -0.345],
        );
        tails.userData.tail = true;
      }
    }
  }
  // Hair beyond the cap.
  const hairMaterial = plain(look.hair?.color || "#2b1e1f", 0.55);
  if (look.hair?.style === "ponytail" && headRoot)
    chain(
      headRoot,
      "Ponytail",
      hairMaterial,
      [
        [0.07, 0.08],
        [0.062, 0.1],
        [0.05, 0.1],
      ],
      [0, 1.16, -0.27],
    );
  if (look.hair?.style === "puff" && headRoot) {
    const puff = new THREE.Mesh(puffGeometry(), hairMaterial);
    puff.name = "Hair puff";
    puff.castShadow = puff.receiveShadow = true;
    headRoot.add(puff);
  }
  if (look.glasses && headRoot) {
    const eyes = figurineGeometry().face.eyes;
    const m = plain(look.glasses, 0.3);
    const ring = new THREE.TorusGeometry(0.072, 0.0095, 8, 24);
    for (const [x, y, z, n] of eyes) {
      const lens = new THREE.Mesh(ring, m);
      lens.name = "glasses";
      lens.position.set(x + n[0] * 0.03, y + n[1] * 0.03, z + n[2] * 0.03);
      lens.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...n),
      );
      headRoot.add(lens);
    }
    const bridge = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.008, 0.06, 2, 6).rotateZ(Math.PI / 2),
      m,
    );
    bridge.name = "glasses";
    bridge.position.set(0, eyes[0][1] + 0.01, eyes[0][2] + 0.045);
    headRoot.add(bridge);
    for (const side of [-1, 1]) {
      const temple = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.006, 0.2, 2, 6).rotateX(Math.PI / 2),
        m,
      );
      temple.name = "glasses";
      temple.position.set(side * 0.215, eyes[0][1] + 0.0, 0.13);
      temple.rotation.y = side * -0.12;
      headRoot.add(temple);
    }
  }
  // Stature and build. A seated clone resets its own scale later.
  const s = look.scale || 1,
    b = look.build || 1;
  body.scale.set(s * b, s, s);
  body.userData.persona = look.persona || "courier";
  body.userData.castId = look.id || null;
  body.userData.headwear = headwear;
  if (look.task) body.userData.task = look.task;
  return body;
}
