import * as THREE from "three";
import { createFigurine } from "../src/figurine.js";

const t0 = performance.now();
const { body } = createFigurine(null, {});
console.log("build ms", Math.round(performance.now() - t0));
body.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(body);
const r = (n) => +n.toFixed(3);
console.log(
  "bbox min",
  box.min.toArray().map(r),
  "max",
  box.max.toArray().map(r),
);
const regions = {};
body.traverse((o) => {
  if (o.isMesh && o.geometry) {
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    regions[o.name] = {
      min: b.min.toArray().map(r),
      max: b.max.toArray().map(r),
    };
  }
});
console.log(JSON.stringify(regions));
const bones = {};
body.traverse((o) => {
  if (o.isBone) {
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    bones[o.name + (bones[o.name] ? "#2" : "")] = v.toArray().map(r);
  }
});
console.log(JSON.stringify(bones));
