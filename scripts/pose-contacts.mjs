// Where do hips, knees, soles and hands land in each riding pose? Printed in
// the courier's local units (feet at y=0) and in world units (x 0.52).
import * as THREE from "three";
import { createFigurine } from "../src/figurine.js";
import { animateCharacter } from "../src/world-animation.js";

const S = 0.52;
const r = (v) => v.toArray().map((n) => +n.toFixed(3));
const poses = {
  stand: [{}, 0],
  seated: [{ seated: true }, 0],
  cycle0: [{ cycling: true }, 0],
  cycle_q: [{ cycling: true }, Math.PI / 2],
  cycle_h: [{ cycling: true }, Math.PI],
  cycle_3q: [{ cycling: true }, (3 * Math.PI) / 2],
  fly: [{ flying: true }, 0],
  flyCarry: [{ flying: true, carrying: true }, 0],
  walk: [{ walking: true }, 0.8],
};
for (const [name, [flags, phase]] of Object.entries(poses)) {
  const { body } = createFigurine(null, {});
  const motion = { walkCycle: phase, speed: 3, moving: true };
  for (let f = 0; f < 120; f++)
    animateCharacter(body, motion, {
      time: 0.25,
      dt: 1 / 60,
      reducedMotion: false,
      ...flags,
      ...(name.startsWith("cycle") ? {} : {}),
    });
  body.updateMatrixWorld(true);
  const g = (n) => body.getObjectByName(n);
  const tmp = new THREE.Vector3();
  const at = (obj, lx, ly, lz) => obj.localToWorld(tmp.set(lx, ly, lz)).clone();
  const out = {};
  for (const side of ["left", "right"]) {
    const leg = g(`${side} leg`);
    const knee = leg.getObjectByName("knee");
    const arm = g(`${side} arm`);
    const elbow = arm.getObjectByName("elbow");
    out[`${side} hip`] = r(at(leg, 0, 0, 0));
    out[`${side} knee`] = r(at(knee, 0, 0, 0));
    out[`${side} sole`] = r(at(knee, 0, -0.236, 0.04));
    out[`${side} toe`] = r(at(knee, 0, -0.236, 0.2));
    out[`${side} hand`] = r(at(elbow, 0, -0.165, 0.0));
  }
  out.chest = r(at(g("chest"), 0, 0, 0));
  out.head = r(at(g("head rig"), 0, 0.2, 0));
  out.bodyRot = [body.rotation.x, body.rotation.y, body.rotation.z].map(
    (n) => +n.toFixed(3),
  );
  out.bodyY = +body.position.y.toFixed(3);
  console.log(name, JSON.stringify(out));
}
