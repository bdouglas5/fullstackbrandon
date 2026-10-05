import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { NODES } from "../shared/engine.js";
import { ISLANDS, FARM, REEF } from "../shared/islands.js";

// Helicopters land and turn here; roofs within reach stay low and flat.
const PADS = [
  NODES.helipad,
  FARM.landing,
  REEF.landing,
  ...Object.values(ISLANDS).map((island) => island.landing),
];
const ROTOR_REACH = 2.9;

/**
 * Architectural finishing pass. Flat slab roofs become chunky hip and gable
 * roofs, and the large painted surfaces get a surface style the world shader
 * draws procedurally: shingle rows, lap siding, paving stones and mown lawn.
 * Styles are per-material, so this adds detail without adding geometry.
 */

const ROOFS = {
  "harbor roof": { kind: "gable", pitch: 0.55 },
  "district roof": { kind: "hip", pitch: 0.7 },
  "club roof": { kind: "hip", pitch: 0.42 },
  "orchard roof": { kind: "gable", pitch: 0.55 },
  "market roof": { kind: "hip", pitch: 0.5 },
  "Brandon home roof": { kind: "hip", pitch: 0.44, chimney: true },
  "Garage roof": { kind: "gable", pitch: 0.42 },
  "Developer office teal canopy": { kind: "hip", pitch: 0.5 },
};
const STYLES = [
  [
    /^(shop roof slope|café roof|Brandon pitched roof|Hip roof|Gable roof slope)/,
    "shingle",
  ],
  [
    /^(café walls|workshop walls|harbor store|shop walls|market hall|beach club|district shop|orchard stand|Brandon home cream walls|Island developer office|Copperport apartment|Factory (rear|side) wall)$/,
    "siding",
  ],
  [
    /^(Continuous town roads|.* continuous streets|Port to pickle shop lane)/,
    "paving",
  ],
  [
    /^(Main island continuous grass|.* lawn|Orchard Cay grass|Island garden lawn)$/,
    "lawn",
  ],
];

export function refineBuildings(w) {
  const styled = new Map();
  const styleMaterial = (material, style) => {
    const key = `${material.uuid}/${style}`;
    if (!styled.has(key)) {
      const clone = material.clone();
      clone.userData = { ...clone.userData, surfaceStyle: style };
      styled.set(key, clone);
    }
    return styled.get(key);
  };
  const plain = new Map();
  const paint = (color, roughness = 0.6) => {
    const key = `${color}/${roughness}`;
    if (!plain.has(key))
      plain.set(
        key,
        new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
      );
    return plain.get(key);
  };
  const chimneys = [];
  const replacements = [];
  const at = new THREE.Vector3();
  w.world.updateMatrixWorld(true);
  w.world.traverse((mesh) => {
    if (!mesh.isMesh || !ROOFS[mesh.name] || !mesh.geometry.parameters) return;
    mesh.getWorldPosition(at);
    if (PADS.some(([x, z]) => Math.hypot(at.x - x, at.z - z) < ROTOR_REACH))
      return;
    replacements.push(mesh);
  });
  for (const slab of replacements) {
    const { width, height, depth } = slab.geometry.parameters;
    const spec = ROOFS[slab.name];
    const color = "#" + slab.material.color.getHexString();
    const roof = new THREE.Group();
    roof.name = `${slab.name} (pitched)`;
    roof.position.copy(slab.position);
    roof.position.y -= height / 2;
    roof.rotation.copy(slab.rotation);
    slab.parent.add(roof);
    slab.removeFromParent();
    const eaveColor = new THREE.Color(color).multiplyScalar(0.72).getStyle();
    // A crisp eave band carries the roof's weight visually.
    const eave = new THREE.Mesh(
      new RoundedBoxGeometry(width + 0.04, 0.08, depth + 0.04, 2, 0.03),
      paint(eaveColor, 0.55),
    );
    eave.name = "Roof eave band";
    eave.position.y = 0.04;
    eave.castShadow = eave.receiveShadow = true;
    roof.add(eave);
    const rise = (Math.min(width, depth) / 2) * Math.tan(spec.pitch);
    const slopeMaterial = styleMaterial(paint(color, 0.55), "shingle");
    if (spec.kind === "hip") {
      // A square frustum scaled to the footprint: four planar hips.
      const g = new THREE.CylinderGeometry(0.16, Math.SQRT1_2 * 2, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      g.translate(0, 0.5, 0);
      g.scale(width / 2 + 0.06, rise, depth / 2 + 0.06);
      const hip = new THREE.Mesh(g.toNonIndexed(), slopeMaterial);
      hip.geometry.computeVertexNormals();
      hip.name = "Hip roof";
      hip.position.y = 0.08;
      hip.castShadow = hip.receiveShadow = true;
      roof.add(hip);
      const cap = new THREE.Mesh(
        new RoundedBoxGeometry(
          Math.max(0.12, (width + 0.12) * 0.08 * 2),
          0.07,
          Math.max(0.12, (depth + 0.12) * 0.08 * 2),
          2,
          0.03,
        ),
        paint(eaveColor, 0.5),
      );
      cap.name = "Roof finial cap";
      cap.position.y = 0.08 + rise + 0.02;
      roof.add(cap);
    } else {
      // Gable: two thick slabs meeting at a rounded ridge, plaster ends.
      const along = width >= depth;
      const run = (along ? depth : width) / 2 + 0.08;
      const length = (along ? width : depth) + 0.14;
      for (const side of [-1, 1]) {
        const slope = new THREE.Mesh(
          new RoundedBoxGeometry(
            along ? length : run / Math.cos(spec.pitch) + 0.06,
            0.09,
            along ? run / Math.cos(spec.pitch) + 0.06 : length,
            2,
            0.035,
          ),
          slopeMaterial,
        );
        slope.name = "Gable roof slope";
        slope.position.set(
          along ? 0 : (side * run) / 2,
          0.08 + rise / 2 + 0.03,
          along ? (side * run) / 2 : 0,
        );
        if (along) slope.rotation.x = side * spec.pitch;
        else slope.rotation.z = -side * spec.pitch;
        slope.castShadow = slope.receiveShadow = true;
        roof.add(slope);
      }
      const shape = new THREE.Shape();
      const half = (along ? depth : width) / 2;
      shape.moveTo(-half, 0);
      shape.lineTo(half, 0);
      shape.lineTo(0, rise);
      shape.closePath();
      for (const side of [-1, 1]) {
        const gable = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          paint("#f4e6cc", 0.7),
        );
        gable.name = "Gable end";
        gable.material.side = THREE.DoubleSide;
        if (along) {
          gable.rotation.y = Math.PI / 2;
          gable.position.set((side * width) / 2, 0.08, 0);
        } else gable.position.set(0, 0.08, (side * depth) / 2);
        roof.add(gable);
      }
      const ridge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, length + 0.02, 12),
        paint(eaveColor, 0.5),
      );
      ridge.name = "Roof ridge cap";
      ridge.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
      ridge.position.y = 0.08 + rise + 0.07;
      ridge.castShadow = true;
      roof.add(ridge);
    }
    if (spec.chimney) {
      const stack = new THREE.Mesh(
        new RoundedBoxGeometry(0.22, 0.6, 0.22, 2, 0.04),
        paint("#c98f6b", 0.7),
      );
      stack.name = "Brick chimney";
      stack.position.set(width * 0.22, 0.25 + rise * 0.7, -depth * 0.18);
      stack.castShadow = true;
      roof.add(stack);
      const cap = new THREE.Mesh(
        new RoundedBoxGeometry(0.29, 0.07, 0.29, 1, 0.025),
        paint("#8d6a55", 0.6),
      );
      cap.name = "Chimney cap";
      cap.position.y = 0.32;
      stack.add(cap);
      chimneys.push(cap);
    }
  }
  // Surface styles and smoke anchors.
  w.world.traverse((mesh) => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (/^(shop chimney cap|Roof chimney)$/.test(mesh.name))
      chimneys.push(mesh);
    if (mesh.material.userData.surfaceStyle) return;
    for (const [pattern, style] of STYLES)
      if (pattern.test(mesh.name)) {
        mesh.material = styleMaterial(mesh.material, style);
        break;
      }
  });
  w.world.updateMatrixWorld(true);
  w.chimneys = chimneys.map((mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    return {
      position: new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.max.y + 0.02,
        (box.min.z + box.max.z) / 2,
      ),
      // Dynamic groups (the home) may hide; smoke follows their visibility.
      object: mesh,
    };
  });
  return w;
}
