import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createFigurine } from "./figurine.js";
import { townsBody, townsHead, bakePiece, TOWN } from "./townsfolk.js";
import { townLook } from "./cast.js";
import { bakeSway } from "./world-surface.js";

// Painted-miniature finishes. Under the soft sky environment these read as
// vinyl, enamel and plaster figurines instead of flat CG color.
export const FINISHES = {
  gloss: { roughness: 0.34, metalness: 0 },
  paint: { roughness: 0.5, metalness: 0 },
  skin: { roughness: 0.56, metalness: 0 },
  cloth: { roughness: 0.7, metalness: 0 },
  foliage: { roughness: 0.58, metalness: 0 },
  stone: { roughness: 0.68, metalness: 0 },
};

// Deterministic so every replay and reload shows the same hand-placed world.
export function seeded(seed) {
  let s = Math.floor(seed * 9973) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Vertical paint gradient with a little mottling, the way a miniature painter
// darkens the underside and dry-brushes the top.
function paint(geometry, stops, yMin, yMax, mottle = 0, seed = 1) {
  const p = geometry.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color(),
    tones = stops.map(([t, hex]) => [t, new THREE.Color(hex)]);
  for (let i = 0; i < p.count; i++) {
    const t = smooth(yMin, yMax, p.getY(i));
    let k = 0;
    while (k < tones.length - 2 && t > tones[k + 1][0]) k++;
    const [t0, c0] = tones[k],
      [t1, c1] = tones[k + 1];
    c.lerpColors(c0, c1, THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1));
    const n =
      Math.sin(p.getX(i) * 11.3 + seed) *
      Math.sin(p.getZ(i) * 9.7 - seed * 2) *
      Math.sin(p.getY(i) * 7.9 + seed * 3);
    c.multiplyScalar(1 + n * mottle);
    c.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Smooth-shaded lumpy sphere: one welded mesh, so hand-sculpted bumps keep
// soft normals instead of the faceted look of a raw icosahedron.
function lump(radius, detail, seed, amount = 0.07, squash = [1, 1, 1]) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position,
    v = new THREE.Vector3();
  const r = seeded(seed),
    a = [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k =
      1 +
      amount *
        (Math.sin(v.x * 3.1 + a[0]) *
          Math.sin(v.y * 2.7 + a[1]) *
          Math.sin(v.z * 3.3 + a[2]) +
          0.45 * Math.sin((v.x + v.z) * 5.3 + a[3]));
    p.setXYZ(
      i,
      v.x * radius * k * squash[0],
      v.y * radius * k * squash[1],
      v.z * radius * k * squash[2],
    );
  }
  g.computeVertexNormals();
  return g;
}
const bare = (g) => {
  g.deleteAttribute("uv");
  return g.index ? g : mergeVertices(g);
};

export function createToyKit() {
  const materials = new Map(),
    geometries = new Map();
  const material = (color, finish = "paint", painted = false) => {
    const key = `${color}/${finish}/${painted}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          vertexColors: painted,
          ...FINISHES[finish],
        }),
      );
    return materials.get(key);
  };
  const cached = (key, make) => {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  };
  const sphere = (r, w = 24, h = 16, ...rest) =>
    cached(
      `sphere/${r}/${w}/${h}/${rest}`,
      () => new THREE.SphereGeometry(r, w, h, ...rest),
    );
  const capsule = (r, length, cap = 4, radial = 12) =>
    cached(
      `capsule/${r}/${length}/${cap}/${radial}`,
      () => new THREE.CapsuleGeometry(r, length, cap, radial),
    );
  const rounded = (w, h, d, r, segments = 2) =>
    cached(
      `rounded/${w}/${h}/${d}/${r}/${segments}`,
      () => new RoundedBoxGeometry(w, h, d, segments, r),
    );
  const part = (parent, name, geometry, mat, x = 0, y = 0, z = 0, scale) => {
    const m = new THREE.Mesh(geometry, mat);
    m.name = name;
    m.position.set(x, y, z);
    if (scale) m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const group = (parent, name, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  // Shared painted materials let every tree, bush and flower batch together.
  const foliage = material("#ffffff", "foliage", true);
  const bark = material("#ffffff", "paint", true);
  const stone = material("#ffffff", "stone", true);

  /**
   * Figurine courier: one sculpted, skinned body (see figurine.js). Joint
   * names are the animation contract used by vehicles, crew copies and tests.
   */
  function courier(look = {}) {
    return createFigurine(null, look);
  }

  /**
   * Townsperson: two sculpted pieces (body, and a head on a neck pivot) with
   * jointed limbs. `look` is a cast id ("maya"), a pedestrian index, or a
   * spec from src/cast.js. Everything shares cached geometry and materials, so
   * instanceCitizens() still draws the whole crowd in a few calls.
   */
  const lighten = (hex, t) =>
    `#${new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), t).getHexString()}`;
  // Citizens share a few white materials; each part carries its own tint and
  // instanceCitizens() applies it per instance, so color never splits a batch.
  const citizenMaterial = (finish, painted = false) =>
    material("#ffffff", finish, painted);
  const tinted = (
    parent,
    name,
    geometry,
    finish,
    color,
    x = 0,
    y = 0,
    z = 0,
    scale,
  ) => {
    const m = part(
      parent,
      name,
      geometry,
      citizenMaterial(finish),
      x,
      y,
      z,
      scale,
    );
    m.userData.tint = color;
    return m;
  };
  const smallBall = (r) => sphere(r, 10, 8);
  function townsperson(g, input) {
    const spec = townLook(input);
    const o = spec.outfit,
      hairColor = spec.hair?.color || "#4a3a30";
    const bodyRegions = townsBody(spec),
      headBuilt = townsHead(spec);
    const tint = {
      skin: spec.skin,
      hair: hairColor,
      hat: spec.hat?.color || "#ffffff",
      trimHat: spec.hat?.trim || lighten(spec.hat?.color || "#ffffff", 0.55),
      cloth: o.color,
      pants: o.lower || "#2a4253",
      trim: o.trim || lighten(o.color, 0.5),
    };
    // Two painted pieces per person: the body, and a head on a neck pivot.
    const bodyKey = JSON.stringify([o.type, spec.build, !!o.collar]);
    const headKey = JSON.stringify([
      spec.head,
      spec.hair?.style,
      spec.hat?.style,
      !!spec.beard,
    ]);
    part(
      g,
      "coat",
      bakePiece(bodyRegions, tint, bodyKey),
      citizenMaterial("cloth", true),
    );
    const head = group(g, "head", 0, TOWN.neckY, 0);
    const headBase = bakePiece(headBuilt.regions, tint, headKey);
    const headMesh = part(
      head,
      "head",
      headBase,
      citizenMaterial("skin", true),
    );
    // Glasses, moustaches, freckles, flowers and headsets never move relative
    // to the head, so they are built here and baked into the head piece below.
    const statics = group(head, "static head details");

    // Face: tall painted eyes with a catchlight, small brows, a mouth that can act.
    const tintedMesh = (geometry, finish, color) => {
      const m = new THREE.Mesh(geometry, citizenMaterial(finish));
      m.userData.tint = color;
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    const aim = (obj, [x, y, z, n], inset = 0) => {
      obj.position.set(x - n[0] * inset, y - n[1] * inset, z - n[2] * inset);
      obj.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...n),
      );
      return obj;
    };
    for (const spot of headBuilt.face.eyes) {
      const eye = aim(
        tintedMesh(sphere(0.034, 10, 8), "gloss", "#1d2830"),
        spot,
        0.007,
      );
      eye.name = "Eye";
      eye.scale.set(0.8, 1.2, 0.5);
      eye.castShadow = false;
      head.add(eye);
    }
    const browGeometry = cached("town/brow", () =>
      new THREE.CapsuleGeometry(0.0065, 0.026, 2, 6).rotateZ(Math.PI / 2),
    );
    headBuilt.face.brows.forEach((spot, i) => {
      const side = i ? 1 : -1;
      const rig = aim(group(head, "Brow rig"), spot, 0.002);
      const brow = tinted(rig, "Brow", browGeometry, "paint", hairColor);
      brow.rotation.z = -side * 0.12;
      brow.userData.side = side;
      brow.castShadow = false;
    });
    const mouthRig = aim(group(head, "Mouth rig"), headBuilt.face.mouth, 0.002);
    const smile = tinted(
      mouthRig,
      "smile",
      cached(
        "town/smile",
        () => new THREE.TorusGeometry(0.017, 0.0055, 5, 10, Math.PI),
      ),
      "paint",
      "#7c3a30",
    );
    smile.rotation.z = Math.PI;
    smile.castShadow = false;
    const mouthOpen = tinted(
      mouthRig,
      "Mouth open",
      sphere(0.017, 8, 6),
      "paint",
      "#5c2622",
      0,
      -0.004,
      -0.002,
    );
    mouthOpen.scale.set(1, 0.75, 0.3); // the open shape; animation collapses it to nothing when shut
    mouthOpen.castShadow = false;
    // Optional cheeky details, each a few shared shapes.
    const face = spec.face || {};
    if (face.mustache) {
      for (const side of [-1, 1]) {
        const lip = aim(
          tintedMesh(sphere(0.026, 8, 6), "paint", hairColor),
          headBuilt.face.nose,
          -0.012,
        );
        lip.position.x += side * 0.024;
        lip.position.y -= 0.027;
        lip.scale.set(1.1, 0.5, 0.6);
        lip.rotation.z = -side * 0.35;
        lip.name = "mustache";
        statics.add(lip);
      }
    }
    if (face.freckles) {
      const dark = `#${new THREE.Color(spec.skin).multiplyScalar(0.78).getHexString()}`;
      for (const side of [-1, 1])
        for (const [dx, dy] of [
          [0.0, 0.0],
          [0.015, -0.006],
          [-0.013, -0.008],
          [0.004, 0.012],
        ]) {
          const f = aim(
            tintedMesh(smallBall(0.0048), "skin", dark),
            headBuilt.face.eyes[side < 0 ? 0 : 1],
            0.0,
          );
          f.position.x += dx - side * 0.004;
          f.position.y += dy - 0.044;
          f.position.z -= 0.003;
          f.name = "freckle";
          f.castShadow = false;
          statics.add(f);
        }
    }
    if (face.glasses) {
      const ring = cached(
        "town/glasses",
        () => new THREE.TorusGeometry(0.04, 0.0058, 6, 14),
      );
      for (const spot of headBuilt.face.eyes) {
        const lens = aim(tintedMesh(ring, "gloss", face.glasses), spot, -0.014);
        lens.name = "glasses";
        statics.add(lens);
      }
      const bridge = tinted(
        statics,
        "glasses",
        cached("town/bridge", () =>
          new THREE.CapsuleGeometry(0.004, 0.03, 2, 5).rotateZ(Math.PI / 2),
        ),
        "gloss",
        face.glasses,
      );
      aim(bridge, [
        0,
        headBuilt.face.eyes[0][1] + 0.006,
        headBuilt.face.eyes[0][2] + 0.01,
        [0, 0, 1],
      ]);
      for (const side of [-1, 1])
        tinted(
          statics,
          "glasses",
          cached("town/temple", () =>
            new THREE.CapsuleGeometry(0.003, 0.11, 2, 5).rotateX(Math.PI / 2),
          ),
          "gloss",
          face.glasses,
          side * 0.1,
          headBuilt.face.eyes[0][1] + 0.002,
          -0.004,
        );
    }

    // Legs and arms are hip and shoulder pivots with a knee or elbow below.
    const lowerColor = o.type === "dress" ? spec.skin : o.lower || "#2a4253";
    const lowerFinish = o.type === "dress" ? "skin" : "cloth";
    const limbs = [];
    const joints = { head, mouthRig, mouthOpen, knees: [], elbows: [] };
    for (const x of [-TOWN.hipX, TOWN.hipX]) {
      const leg = group(g, "leg", x, TOWN.hipY, 0);
      tinted(
        leg,
        "thigh",
        capsule(0.044, 0.078, 2, 8),
        lowerFinish,
        lowerColor,
        0,
        -0.039,
      );
      const knee = group(leg, "knee", 0, -TOWN.kneeDrop, 0);
      tinted(
        knee,
        "shin",
        capsule(0.041, 0.05, 2, 8),
        lowerFinish,
        lowerColor,
        0,
        -0.025,
      );
      tinted(
        knee,
        "shoe",
        sphere(0.068, 10, 8),
        "gloss",
        o.shoe || "#fbf0dc",
        0,
        -0.084,
        0.022,
        [0.92, 0.62, 1.32],
      );
      limbs.push(leg);
      joints.knees.push(knee);
    }
    for (const side of [-1, 1]) {
      const arm = group(g, "arm", side * TOWN.shoulderX, TOWN.shoulderY, 0);
      tinted(
        arm,
        "sleeve",
        capsule(0.046, 0.046, 2, 8),
        "cloth",
        o.color,
        0,
        -0.065,
      );
      const elbow = group(arm, "elbow", 0, -TOWN.elbowDrop, 0);
      tinted(
        elbow,
        "forearm",
        capsule(0.044, 0.05, 2, 8),
        "cloth",
        o.color,
        0,
        -0.025,
      );
      tinted(
        elbow,
        "hand",
        sphere(0.05, 10, 8),
        "skin",
        spec.skin,
        0,
        -0.098,
        0.004,
      );
      limbs.push(arm);
      joints.elbows.push(elbow);
    }
    g.userData.limbs = limbs;
    g.userData.base = g.position.clone();
    g.userData.townLook = spec.id || null;
    g.userData.persona = spec.persona || "warm";
    g.userData.townJoints = joints;
    g.userData.gear = { hat: !!spec.hat, glasses: !!face.glasses };
    if (spec.height && spec.height !== 1) g.scale.setScalar(spec.height);
    for (const name of spec.acc || [])
      accessory(name, spec, g, statics, limbs, joints, headBuilt);
    // Bake the static head details into the head piece: one draw call, not twenty.
    g.updateMatrixWorld(true);
    const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
    const extras = [];
    statics.traverse((o) => {
      if (!o.isMesh) return;
      const geometry = o.geometry.clone();
      geometry.deleteAttribute("uv");
      geometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(toHead, o.matrixWorld),
      );
      const c = new THREE.Color(o.userData.tint || "#ffffff");
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3)
        [colors[i], colors[i + 1], colors[i + 2]] = [c.r, c.g, c.b];
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      extras.push(geometry);
    });
    if (extras.length) {
      headMesh.geometry = mergeGeometries([headBase, ...extras], false);
      extras.forEach((e) => e.dispose());
    }
    statics.removeFromParent();
    return g;
  }

  // Accessories: a few rigid, shared shapes riding on the right joint.
  function accessory(name, spec, g, head, limbs, joints, built) {
    const trim = spec.outfit.trim || lighten(spec.outfit.color, 0.5);
    const T = (parent, label, geometry, color, finish, x, y, z, scale) =>
      tinted(parent, label, geometry, finish, color, x, y, z, scale);
    if (name === "tote") {
      const bag = T(
        joints.elbows[1],
        "tote bag",
        rounded(0.11, 0.12, 0.05, 0.02),
        "#e7d3a2",
        "cloth",
        0.012,
        -0.17,
        0.0,
      );
      T(
        bag,
        "tote handle",
        cached(
          "town/handle",
          () => new THREE.TorusGeometry(0.035, 0.005, 5, 10, Math.PI),
        ),
        "#8a5a32",
        "paint",
        0,
        0.06,
        0,
      );
      T(
        bag,
        "tote stripe",
        rounded(0.112, 0.018, 0.052, 0.008),
        spec.outfit.color,
        "cloth",
        0,
        0.02,
        0,
      );
    } else if (name === "satchel") {
      const bag = T(
        g,
        "satchel",
        rounded(0.1, 0.085, 0.045, 0.018),
        "#b37a4b",
        "cloth",
        0.155,
        0.24,
        0.02,
      );
      T(
        g,
        "satchel strap",
        cached(
          "town/strap",
          () => new THREE.CapsuleGeometry(0.008, 0.37, 2, 5),
        ),
        "#8a5a32",
        "cloth",
        0.02,
        0.38,
        0.1,
      ).rotation.z = -0.58;
      bag.rotation.z = -0.05;
    } else if (name === "camera") {
      const cam = T(
        g,
        "camera",
        rounded(0.075, 0.05, 0.04, 0.012),
        "#2f3a3a",
        "gloss",
        0,
        0.395,
        0.125,
      );
      T(
        cam,
        "camera lens",
        cached("town/lens", () =>
          new THREE.CylinderGeometry(0.016, 0.016, 0.018, 10).rotateX(
            Math.PI / 2,
          ),
        ),
        "#9fb7bd",
        "gloss",
        0,
        0,
        0.026,
      );
    } else if (name === "tag") {
      T(
        g,
        "name tag",
        rounded(0.04, 0.028, 0.01, 0.006),
        "#fffaf0",
        "paint",
        0.07,
        0.4,
        0.118,
      );
    } else if (name === "scarf") {
      const color = spec.scarf || trim;
      T(
        g,
        "scarf",
        cached("town/scarf", () =>
          new THREE.TorusGeometry(0.068, 0.027, 8, 16).rotateX(Math.PI / 2),
        ),
        color,
        "cloth",
        0,
        0.488,
        0.004,
      );
      const tail = group(g, "scarf tail", 0.045, 0.478, 0.092);
      T(
        tail,
        "scarf tail",
        capsule(0.022, 0.08, 2, 8),
        color,
        "cloth",
        0,
        -0.05,
        0.0,
      ).rotation.z = 0.05;
      g.userData.scarfTail = tail;
    } else if (name === "flower") {
      const f = group(head, "flower", 0.115, 0.285, 0.1);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        T(
          f,
          "petal",
          sphere(0.022, 8, 6),
          "#fff3df",
          "paint",
          Math.cos(a) * 0.027,
          Math.sin(a) * 0.027,
          0,
        ).castShadow = false;
      }
      T(
        f,
        "flower heart",
        sphere(0.018, 8, 6),
        "#f2b84b",
        "paint",
        0,
        0,
        0.01,
      ).castShadow = false;
    } else if (name === "sprig") {
      const s = group(g, "sprig", 0.05, 0.4, 0.13);
      for (const [x, r] of [
        [-0.012, 0.5],
        [0.012, -0.5],
        [0, 0],
      ])
        T(
          s,
          "leaf",
          sphere(0.02, 8, 6),
          "#6fa05a",
          "paint",
          x,
          0.012,
          0,
          [0.5, 1.3, 0.35],
        ).rotation.z = r;
    } else if (name === "headset") {
      T(
        head,
        "headset band",
        cached(
          "town/band",
          () => new THREE.TorusGeometry(0.168, 0.0075, 6, 20, Math.PI),
        ),
        "#2f3a3a",
        "gloss",
        0,
        0.158,
        0,
      );
      for (const side of [-1, 1])
        T(
          head,
          "headset cup",
          sphere(0.032, 8, 6),
          "#2f3a3a",
          "gloss",
          side * 0.172,
          0.155,
          0,
          [0.5, 1, 1],
        );
      T(
        head,
        "headset mic",
        cached("town/mic", () =>
          new THREE.CapsuleGeometry(0.004, 0.07, 2, 5).rotateZ(0.8),
        ),
        "#2f3a3a",
        "gloss",
        0.14,
        0.095,
        0.06,
      );
    } else if (name === "cane") {
      const cane = group(joints.elbows[1], "cane", 0.0, -0.1, 0.03);
      T(
        cane,
        "cane shaft",
        cached(
          "town/cane",
          () => new THREE.CylinderGeometry(0.009, 0.009, 0.3, 6),
        ),
        "#6b4a30",
        "paint",
        0,
        -0.1,
        0,
      );
      T(
        cane,
        "cane crook",
        cached(
          "town/crook",
          () => new THREE.TorusGeometry(0.026, 0.009, 5, 8, Math.PI * 1.3),
        ),
        "#6b4a30",
        "paint",
        0.026,
        0.05,
        0,
      ).rotation.z = 0.5;
      g.userData.holds = "cane";
    }
  }

  // Three hand-tuned canopy silhouettes; footprints stay within the old trees.
  const CANOPIES = [
    [
      [0, 1.3, 0, 0.62, 0.86],
      [0.34, 1.52, 0.18, 0.4],
      [-0.3, 1.55, -0.12, 0.42],
      [0.04, 1.76, -0.06, 0.38],
      [-0.14, 1.2, 0.36, 0.32],
      [0.36, 1.14, -0.24, 0.3],
    ],
    [
      [0, 1.24, 0, 0.56, 0.9],
      [0.1, 1.6, 0.06, 0.44],
      [-0.08, 1.88, -0.04, 0.3],
      [0.3, 1.36, -0.22, 0.32],
      [-0.31, 1.42, 0.16, 0.33],
    ],
    [
      [0.2, 1.26, 0.05, 0.5, 0.88],
      [-0.22, 1.28, -0.05, 0.5, 0.88],
      [0, 1.52, 0.02, 0.48],
      [0.06, 1.2, 0.36, 0.33],
      [-0.06, 1.18, -0.36, 0.33],
      [0.32, 1.5, -0.2, 0.3],
    ],
  ];
  const TINTS = [
    ["#245a3f", "#3f8c4c", "#86bf58"],
    ["#28584a", "#43875a", "#8fbd63"],
  ];
  function canopy(shape, tint) {
    return cached(`canopy/${shape}/${tint}`, () => {
      const lobes = CANOPIES[shape].map(([x, y, z, r, squash = 1], k) =>
        lump(r, 2, shape * 10 + k + 1, 0.08, [1, squash, 1]).translate(x, y, z),
      );
      const g = mergeGeometries(lobes);
      lobes.forEach((l) => l.dispose());
      const [low, mid, high] = TINTS[tint];
      paint(
        g,
        [
          [0, low],
          [0.55, mid],
          [1, high],
        ],
        0.72,
        2.12,
        0.07,
        shape + tint,
      );
      return bakeSway(g, 0, 2.2, 1);
    });
  }
  const trunk = () =>
    cached("tree/trunk", () =>
      paint(
        bare(
          new THREE.LatheGeometry(
            [
              [0.19, 0],
              [0.13, 0.07],
              [0.1, 0.22],
              [0.086, 0.6],
              [0.092, 0.88],
              [0.12, 1.02],
              [0, 1.06],
            ].map(([r, y]) => new THREE.Vector2(r, y)),
            10,
          ),
        ),
        [
          [0, "#5f3f2c"],
          [1, "#9a6b47"],
        ],
        0,
        0.9,
        0.05,
        3,
      ),
    );
  const swayingTrunk = () =>
    cached("tree/trunk/sway", () => bakeSway(trunk().clone(), 0, 2.2, 0));
  /** Puffy painted tree; seed picks one of six silhouette and tint pairs. */
  function tree(g, seed) {
    part(g, "Tree trunk", swayingTrunk(), bark);
    part(g, "Puffy tree canopy", canopy(seed % 3, (seed >> 2) % 2), foliage);
  }

  // Ground dressing: large shape, medium shape, tiny accent.
  function bush(seed) {
    return cached(`bush/${seed % 4}`, () => {
      const r = seeded((seed % 4) + 7);
      const lobes = [];
      const count = 3 + (seed % 2);
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + r();
        const radius = 0.15 + r() * 0.07;
        lobes.push(
          lump(radius, 2, seed * 3 + k, 0.08, [1, 0.86, 1]).translate(
            Math.cos(a) * 0.11,
            radius * 0.8,
            Math.sin(a) * 0.11,
          ),
        );
      }
      lobes.push(
        lump(0.17, 2, seed + 40, 0.07, [1, 0.9, 1]).translate(0, 0.2, 0),
      );
      const g = mergeGeometries(lobes);
      lobes.forEach((l) => l.dispose());
      paint(
        g,
        [
          [0, "#2f6a45"],
          [0.6, "#56a050"],
          [1, "#a2d06a"],
        ],
        0,
        0.36,
        0.05,
        seed,
      );
      return bakeSway(g, 0.05, 1.4, 0.7);
    });
  }
  function tuft(seed) {
    return cached(`tuft/${seed % 3}`, () => {
      const r = seeded((seed % 3) + 21),
        blades = [];
      for (let k = 0; k < 7; k++) {
        const height = 0.17 + r() * 0.11;
        const blade = bare(new THREE.ConeGeometry(0.032, height, 4));
        blade.translate(0, height / 2, 0);
        blade.rotateZ((r() - 0.5) * 1.0);
        blade.rotateY((k / 7) * Math.PI * 2 + r());
        blade.translate((r() - 0.5) * 0.07, 0, (r() - 0.5) * 0.07);
        blades.push(blade);
      }
      const g = mergeGeometries(blades);
      blades.forEach((b) => b.dispose());
      paint(
        g,
        [
          [0, "#2f6a3a"],
          [1, "#a5d16a"],
        ],
        0,
        0.26,
        0,
        seed,
      );
      return bakeSway(g, 0, 0.55, 1);
    });
  }
  const PETALS = ["#fff7e8", "#f6d35b", "#f2a0b4", "#a9b8f2", "#f39a73"];
  function flowers(seed) {
    return cached(`flowers/${seed % 6}`, () => {
      const r = seeded((seed % 6) + 31),
        parts = [];
      const hue = PETALS[seed % PETALS.length];
      const add = (geometry, color) => {
        const c = new THREE.Color(color);
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let k = 0; k < colors.length; k += 3) c.toArray(colors, k);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        parts.push(geometry);
      };
      for (let k = 0; k < 3; k++) {
        const leaf = bare(new THREE.SphereGeometry(0.085, 6, 4));
        leaf.scale(1, 0.35, 0.55);
        leaf.rotateY(r() * Math.PI);
        leaf.translate((r() - 0.5) * 0.22, 0.025, (r() - 0.5) * 0.22);
        add(leaf, "#4f9150");
      }
      const heads = 6 + (seed % 4);
      for (let k = 0; k < heads; k++) {
        const x = (r() - 0.5) * 0.36,
          z = (r() - 0.5) * 0.36,
          y = 0.08 + r() * 0.08;
        const stem = bare(
          new THREE.CylinderGeometry(0.007, 0.009, y, 4, 1, true),
        );
        stem.translate(x, y / 2, z);
        add(stem, "#4f9150");
        const bloom = bare(new THREE.SphereGeometry(0.05, 8, 4));
        bloom.scale(1, 0.45, 1);
        add(bloom, k % 4 === 3 ? "#fff7e8" : hue);
        // A painted golden eye on the top pole of each bloom.
        const pos = bloom.attributes.position,
          col = bloom.attributes.color,
          eye = new THREE.Color("#f1b93f");
        for (let v = 0; v < pos.count; v++)
          if (pos.getY(v) > 0.0215) col.setXYZ(v, eye.r, eye.g, eye.b);
        bloom.translate(x, y, z);
      }
      const g = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      return bakeSway(g, 0, 0.5, 1);
    });
  }
  function rock(seed) {
    return cached(`rock/${seed % 4}`, () =>
      paint(
        lump(0.2, 2, (seed % 4) + 51, 0.16, [1.15, 0.62, 0.95]).translate(
          0,
          0.05,
          0,
        ),
        [
          [0, "#8a8c86"],
          [1, "#d7d2c2"],
        ],
        -0.1,
        0.17,
        0.07,
        seed,
      ),
    );
  }
  // Coconut palm: a leaning ringed trunk and arching, serrated fronds that
  // droop at the tips. One painted mesh per palm, swaying in the wind.
  const palmLeaf = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    side: THREE.DoubleSide,
    ...FINISHES.foliage,
  });
  function palm(g, seed = 0) {
    const geometry = cached(`palm/${seed % 3}`, () => {
      const r = seeded((seed % 3) + 61);
      const pieces = [];
      const color = (geometry, fn) => {
        const p = geometry.attributes.position;
        const c = new Float32Array(p.count * 3),
          tint = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          fn(i, tint);
          tint.toArray(c, i * 3);
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
        return geometry;
      };
      const lean = 0.32 + r() * 0.12,
        height = 2.28;
      const spine = (t) => new THREE.Vector3(lean * t * t, height * t, 0);
      // Trunk: rings with a slight bulge per segment, darker at each joint.
      const rings = 16,
        sides = 9,
        trunk = [],
        index = [],
        sway = [];
      for (let k = 0; k <= rings; k++) {
        const t = k / rings;
        const c = spine(t);
        const radius =
          (0.115 - t * 0.04) *
          (1 + 0.1 * Math.abs(Math.sin(t * rings * Math.PI)));
        for (let j = 0; j < sides; j++) {
          const a = (j / sides) * Math.PI * 2;
          trunk.push(
            c.x + Math.cos(a) * radius,
            c.y,
            c.z + Math.sin(a) * radius,
          );
          sway.push(t * 0.7);
        }
      }
      for (let k = 0; k < rings; k++)
        for (let j = 0; j < sides; j++) {
          const a = k * sides + j,
            b = k * sides + ((j + 1) % sides),
            c = (k + 1) * sides + ((j + 1) % sides),
            d = (k + 1) * sides + j;
          index.push(a, d, b, b, d, c);
        }
      let t0 = new THREE.BufferGeometry();
      t0.setAttribute("position", new THREE.Float32BufferAttribute(trunk, 3));
      t0.setIndex(index);
      t0 = t0.toNonIndexed();
      t0.computeVertexNormals();
      color(t0, (i, tint) => {
        const y = t0.attributes.position.getY(i) / height;
        const ring = Math.abs(Math.sin(y * rings * Math.PI));
        tint.set("#8e6a49").lerp(new THREE.Color("#c39d6c"), ring * 0.8);
      });
      bakeSway(t0, 0, height / 0.7, 0);
      pieces.push(t0);
      const top = spine(1).add(new THREE.Vector3(0.02, 0.04, 0));
      const fronds = 8;
      for (let f = 0; f < fronds; f++) {
        const angle = (f / fronds) * Math.PI * 2 + r() * 0.4;
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const length = 1.05 + r() * 0.35,
          rise = 0.32 + r() * 0.12,
          droop = 0.8 + r() * 0.3;
        const steps = 12,
          positions = [],
          idx = [],
          along = [];
        for (let k = 0; k <= steps; k++) {
          const s = k / steps;
          const rib = top
            .clone()
            .addScaledVector(dir, s * length)
            .add(new THREE.Vector3(0, (rise * s - droop * s * s) * length, 0));
          // Serrated leaflets: width pulses along the rib, folded into a V.
          const width =
            0.26 *
            Math.sin(Math.PI * Math.min(1, s * 1.15)) *
            (0.7 + 0.3 * Math.abs(Math.sin(s * Math.PI * 9)));
          for (const sgn of [-1, 1]) {
            const edge = rib
              .clone()
              .addScaledVector(side, sgn * width)
              .add(new THREE.Vector3(0, -width * 0.42, 0));
            positions.push(edge.x, edge.y, edge.z);
            along.push(s, 1);
          }
          positions.push(rib.x, rib.y + 0.012, rib.z);
          along.push(s, 0);
        }
        for (let k = 0; k < steps; k++) {
          const a = k * 3,
            b = (k + 1) * 3;
          idx.push(a, b, a + 2, b, b + 2, a + 2);
          idx.push(a + 2, b + 2, a + 1, b + 2, b + 1, a + 1);
        }
        let leaf = new THREE.BufferGeometry();
        leaf.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        leaf.setIndex(idx);
        leaf.computeVertexNormals();
        const swayValues = new Float32Array(along.length / 2),
          flutter = new Float32Array(along.length / 2);
        for (let i = 0; i < swayValues.length; i++) {
          swayValues[i] = 0.75 + along[i * 2] * 0.35;
          flutter[i] = along[i * 2] * (0.6 + along[i * 2 + 1] * 0.6);
        }
        leaf.setAttribute("aSway", new THREE.BufferAttribute(swayValues, 1));
        leaf.setAttribute("aFlutter", new THREE.BufferAttribute(flutter, 1));
        color(leaf, (i, tint) => {
          const s = along[i * 2],
            edge = along[i * 2 + 1];
          tint
            .set("#2f6b42")
            .lerp(new THREE.Color("#7fbc58"), s * 0.75 + edge * 0.2)
            .multiplyScalar(0.92 + r() * 0.12);
        });
        leaf = leaf.toNonIndexed();
        pieces.push(leaf);
      }
      for (let k = 0; k < 3; k++) {
        const nut = new THREE.SphereGeometry(0.075, 10, 8).toNonIndexed();
        nut.deleteAttribute("uv");
        nut.translate(
          top.x + Math.cos(k * 2.1) * 0.09,
          top.y - 0.1,
          top.z + Math.sin(k * 2.1) * 0.09,
        );
        color(nut, (i, tint) => tint.set("#6e4b32"));
        bakeSway(nut, 0, 1, 0);
        nut.attributes.aSway.array.fill(0.75);
        pieces.push(nut);
      }
      for (const p of pieces) {
        p.deleteAttribute("uv");
        if (!p.attributes.normal) p.computeVertexNormals();
      }
      return mergeGeometries(
        pieces.map((p) => (p.index ? p.toNonIndexed() : p)),
      );
    });
    const m = part(g, "Coconut palm", geometry, palmLeaf);
    m.castShadow = true;
    return m;
  }

  const dressing = {
    bush: (parent, x, y, z, size, seed, turn = 0) => {
      const m = part(parent, "Hand-placed bush", bush(seed), foliage, x, y, z);
      m.scale.setScalar(size);
      m.rotation.y = turn;
      return m;
    },
    tuft: (parent, x, y, z, size, seed, turn = 0) => {
      const m = part(parent, "Grass tuft", tuft(seed), foliage, x, y, z);
      m.scale.setScalar(size);
      m.rotation.y = turn;
      m.castShadow = false;
      return m;
    },
    flowers: (parent, x, y, z, size, seed, turn = 0) => {
      const m = part(parent, "Flower patch", flowers(seed), foliage, x, y, z);
      m.scale.setScalar(size);
      m.rotation.y = turn;
      m.castShadow = false;
      return m;
    },
    rock: (parent, x, y, z, size, seed, turn = 0) => {
      const m = part(parent, "Rounded stone", rock(seed), stone, x, y, z);
      m.scale.setScalar(size);
      m.rotation.y = turn;
      return m;
    },
  };
  return {
    material,
    rounded,
    sphere,
    capsule,
    part,
    group,
    courier,
    townsperson,
    tree,
    palm,
    palmLeaf,
    dressing,
    foliage,
    bark,
    stone,
  };
}

/**
 * Tileable painted ground: soft darker and lighter dabs plus short strokes,
 * multiplied over the base color. Browser only; Node builds keep flat color.
 */
export function paintedGroundTexture(seed = 1, strokes = true) {
  if (typeof document === "undefined") return null;
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgb(242,242,242)";
  ctx.fillRect(0, 0, size, size);
  const r = seeded(seed);
  // Every mark is drawn at nine offsets, so the texture tiles seamlessly.
  const wrap = (draw) => {
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) draw(dx, dy);
  };
  for (let i = 0; i < 70; i++) {
    const x = r() * size,
      y = r() * size,
      radius = 18 + r() * 46,
      v = r() < 0.5 ? 222 : 255,
      a = 0.16 + r() * 0.2;
    wrap((dx, dy) => {
      const g = ctx.createRadialGradient(
        x + dx,
        y + dy,
        0,
        x + dx,
        y + dy,
        radius,
      );
      g.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
    });
  }
  if (strokes)
    for (let i = 0; i < 520; i++) {
      const x = r() * size,
        y = r() * size,
        length = 4 + r() * 6,
        angle = -1.2 + r() * 0.5,
        v = r() < 0.55 ? 214 : 255;
      wrap((dx, dy) => {
        ctx.strokeStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(
          x + dx + Math.cos(angle) * length,
          y + dy + Math.sin(angle) * length,
        );
        ctx.stroke();
      });
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Soft sky studio for figurine highlights: cool zenith, warm horizon, a broad
 * key softbox on the sun side. Rendered once into a prefiltered environment.
 */
export function createToyEnvironment(renderer) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDir; void main(){
        float h = vDir.y;
        vec3 zenith = vec3(0.42, 0.62, 0.86);
        vec3 horizon = vec3(1.0, 0.94, 0.82);
        vec3 ground = vec3(0.36, 0.42, 0.32);
        vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.75, h));
        gl_FragColor = vec4(mix(ground, sky, smoothstep(-0.25, 0.05, h)), 1.0); }`,
    }),
  );
  scene.add(dome);
  const softbox = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.96, 0.88).multiplyScalar(3.2),
      side: THREE.DoubleSide,
    }),
  );
  softbox.position.set(-9, 14, 11);
  softbox.lookAt(0, 0, 0);
  scene.add(softbox);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
  softbox.geometry.dispose();
  softbox.material.dispose();
  return texture;
}
