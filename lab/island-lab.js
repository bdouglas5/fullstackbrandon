// Island-expansion lab: the real world scene with the private island forced
// to its finished state, and a camera set from the URL.
//   /lab/island.html?at=4,0.5,25&from=14,9,36&ship=farm|harbor|none&tick=21500
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { createOcean } from "../src/world-water.js";
import { optimizeWorld } from "../src/optimize-world.js";
import { applyWorldSurfaces } from "../src/world-surface.js";
import { createToyEnvironment } from "../src/toy-kit.js";
import { updateBusinessWorld } from "../src/world-realism.js";
import { fresh, step, begin, baseline } from "../shared/engine.js";

const q = new URLSearchParams(location.search);
const vec = (key, fallback) => q.get(key)?.split(",").map(Number) ?? fallback;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = createToyEnvironment(renderer);
scene.fog = new THREE.Fog("#95c8d0", 110, 220);
scene.background = new THREE.Color("#95c8d0");
const camera = new THREE.PerspectiveCamera(
  Number(q.get("fov") || 36),
  innerWidth / innerHeight,
  0.1,
  240,
);
camera.position.set(...vec("from", [14, 9, 36]));
camera.lookAt(...vec("at", [4, 0.5, 25]));
scene.add(new THREE.HemisphereLight("#fff5de", "#5f8a96", 0.6));
const sun = new THREE.DirectionalLight("#fff3d1", 3.7);
sun.position.set(-8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -22,
  right: 22,
  top: 22,
  bottom: -22,
});
sun.shadow.normalBias = 0.035;
sun.target.position.set(...vec("at", [4, 0.5, 25]));
sun.position.add(sun.target.position);
scene.add(sun, sun.target);
const water = createOcean();
scene.add(water.mesh);
const w = buildWorld();
optimizeWorld(w);
scene.add(w.world);
applyWorldSurfaces(scene, { sand: new Set(), sway: new Set() });

const s = fresh(42);
s.status = "running";
const ticks = Number(q.get("tick") || 21500);
for (let i = 0; i < ticks; i++) {
  if (!s.brandon.action && !s.retirement.ready) begin(s, baseline(s));
  step(s);
}
const ship = q.get("ship") || "farm";
s.operations ||= {};
s.operations.shipments =
  ship === "none"
    ? []
    : [
        {
          status: "port",
          portNode: ship === "farm" ? "farm_port" : "harbor_dock",
          arrivesAt: s.tick - (q.get("motion") ? 1 : 100),
          kind: "stock",
          cases: 8,
        },
      ];
s.harbor = 8;
if (q.get("active"))
  s.production = { fermenting: [{ cases: 5 }], packing: [{ cases: 2 }] };
if (q.get("stage"))
  s.construction = {
    stage: q.get("stage"),
    progress: Number(q.get("progress") || 0.5),
  };
const t = Number(q.get("t") || 3);
const motion = q.get("motion") === "1";
function frame(at = t) {
  updateBusinessWorld(w, s, at, 0.1, !motion);
  water.update?.({ time: at });
  renderer.render(scene, camera);
}
// With motion=1 the lab plays the shipment in: ?play=seconds jumps ahead.
for (let i = 0; i < 4; i++) frame(t + i * 0.016);
const play = Number(q.get("play") || 0);
for (let at = 0; at <= play; at += 0.1) frame(t + 8 + at);
window.__lab = { w, s, camera, renderer, frame, THREE };
renderer.domElement.dataset.ready = "true";
