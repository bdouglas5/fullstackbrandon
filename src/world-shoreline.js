import * as THREE from "three";
import { SHORELINE, shorelineCollection } from "../shared/shoreline.js";

export function createShorelineWorld(w) {
  const root = new THREE.Group();
  root.name = "Shoreline plastic cleanup";
  root.userData.dynamic = true;
  w.world.add(root);
  const materials = new Map();
  const mat = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
      );
    return materials.get(color);
  };
  const mesh = (parent, geometry, color, position) => {
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(...position);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const beach = mesh(
    root,
    new THREE.CylinderGeometry(1.35, 1.35, 0.035, 32),
    "#e6cea0",
    [-10.65, 0.38, -4.3],
  );
  beach.scale.z = 1.15;
  const bottle = (parent, color) => {
    const group = new THREE.Group();
    parent.add(group);
    mesh(
      group,
      new THREE.CylinderGeometry(0.07, 0.085, 0.28, 8),
      color,
      [0, 0.14, 0],
    );
    mesh(
      group,
      new THREE.CylinderGeometry(0.032, 0.07, 0.065, 8),
      color,
      [0, 0.31, 0],
    );
    mesh(
      group,
      new THREE.CylinderGeometry(0.04, 0.04, 0.035, 8),
      "#f8efdb",
      [0, 0.36, 0],
    );
    mesh(
      group,
      new THREE.CylinderGeometry(0.074, 0.079, 0.07, 8),
      "#f6efdb",
      [0, 0.16, 0],
    );
    return group;
  };
  const colors = ["#73b6c2", "#edb070", "#88bda5", "#e9dcc1"];
  const pieces = [];
  for (let i = 0; i < 30; i++) {
    const piece = i % 3 !== 2 ? bottle(root, colors[i % 4]) : new THREE.Group();
    if (i % 3 === 2) {
      root.add(piece);
      mesh(
        piece,
        new THREE.BoxGeometry(0.22, 0.05, 0.14),
        colors[i % 4],
        [0, 0.025, 0],
      );
    }
    const angle = i * 2.39996,
      radius = 0.3 + (i % 7) * 0.12;
    piece.position.set(
      -10.85 + Math.cos(angle) * radius * 0.65,
      i % 3 !== 2 ? 0.48 : 0.405,
      -4.3 + Math.sin(angle) * radius,
    );
    piece.rotation.set(i % 3 !== 2 ? Math.PI / 2 : 0, angle, 0.15);
    piece.name =
      i % 3 !== 2 ? "Washed-up plastic bottle" : "Reclaimed plastic fragment";
    pieces.push(piece);
  }
  // A bag and one visible piece make the crouch → lift → collect motion readable.
  const bag = new THREE.Group();
  root.add(bag);
  mesh(
    bag,
    new THREE.SphereGeometry(0.18, 10, 8),
    "#72958b",
    [0, 0.15, 0],
  ).scale.set(1, 1.4, 0.8);
  mesh(
    bag,
    new THREE.TorusGeometry(0.085, 0.018, 6, 12),
    "#e4e5c4",
    [0, 0.37, 0],
  );
  const lifted = bottle(root, "#73b6c2");
  let clock = 0;
  return {
    root,
    pieces,
    bag,
    lifted,
    update(state, motion, dt, reducedMotion) {
      const collection = shorelineCollection(state);
      const near =
        collection.collecting &&
        Math.hypot(
          motion.position.x - SHORELINE.position[0],
          motion.position.z - SHORELINE.position[1],
        ) < 0.45;
      const animated = near && state.status === "running";
      clock = animated ? clock + dt : near ? clock : 0;
      const u = reducedMotion ? 0.7 : (clock % 3.8) / 3.8;
      const pickup = animated && u > 0.3 && u < 0.86;
      pieces.forEach((piece, i) => {
        piece.visible =
          i < collection.remaining &&
          !(pickup && i === collection.remaining - 1);
      });
      const returning =
        state.brandon?.buildingVisit?.shoreline &&
        state.brandon.buildingVisit.phase === "exiting";
      bag.visible = !!(near || returning);
      if (bag.visible)
        bag.position.set(
          motion.position.x + 0.33,
          0.43,
          motion.position.z + 0.12,
        );
      lifted.visible = pickup;
      if (pickup) {
        const lift = Math.min(1, Math.max(0, (u - 0.4) / 0.3));
        const local = new THREE.Vector3(0.05, 0, 0.35).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          motion.facing,
        );
        lifted.position.set(
          motion.position.x + local.x,
          0.43 + lift * 0.57,
          motion.position.z + local.z,
        );
        lifted.rotation.set(0.5 * (1 - lift), motion.facing, 0.15);
        lifted.scale.setScalar(
          u > 0.75 ? Math.max(0.05, (0.86 - u) / 0.11) : 1,
        );
      }
      return { ...collection, animated };
    },
  };
}
