// Fast single-item lab: builds only the requested sculpted props (no island),
// seats a courier in each, and stands a reference courier alongside.
//
//   /lab/toy.html?items=van&view=three&dist=5
import * as THREE from "three";
import { createToyEnvironment } from "../src/toy-kit.js";
import { createFigurine } from "../src/figurine.js";
import { animateCharacter } from "../src/world-animation.js";
import { sculptStats } from "../src/sculpt.js";
import * as V from "../src/toy-vehicles.js";
import { buildGadget, GADGET_IDS } from "../src/toy-props.js";
import { SEAT, CHAR_SCALE } from "../src/toy-scale.js";

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#9cc7cf");
scene.environment = createToyEnvironment(renderer);
scene.environmentIntensity = 0.6;
scene.add(new THREE.HemisphereLight("#fff5de", "#5f8a96", 0.6));
const sun = new THREE.DirectionalLight("#fff3d1", 3.6);
sun.position.set(-4, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: "#e7cf9d", roughness: 0.8 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const motion = { walkCycle: Number(params.get("phase") || 0.6), speed: 3, moving: true };
const pose = (body, flags) => {
  for (let f = 0; f < 90; f++)
    animateCharacter(body, motion, { time: 0.5, dt: 1 / 60, ...flags });
};
const rider = (parent, seat, flags, scale = CHAR_SCALE) => {
  const { body } = createFigurine(null, {});
  body.scale.setScalar(scale);
  body.position.set(...seat);
  parent.add(body);
  pose(body, flags);
  return body;
};

const timings = {};
const timed = (name, fn) => {
  const t = performance.now();
  const r = fn();
  timings[name] = Math.round(performance.now() - t);
  return r;
};

const makers = {
  van: () => {
    const van = new THREE.Group();
    van.name = "van";
    const chassis = new THREE.Group();
    van.add(chassis);
    timed("van", () => V.buildVan(van, chassis));
    rider(chassis, SEAT.van.position, { seated: true });
    return van;
  },
  brandon: () => {
    const g = new THREE.Group();
    rider(g, [0, 0, 0], {});
    return g;
  },
};
Object.assign(makers, {
  bike: () => {
    const bike = new THREE.Group();
    timed("bike", () => V.buildBike(bike));
    rider(bike, SEAT.bike.position, { cycling: true });
    V.placePedals(bike);
    return bike;
  },
  bike0: () => {
    const bike = new THREE.Group();
    V.buildBike(bike);
    return bike;
  },
  heli: () => {
    const heli = new THREE.Group();
    timed("heli", () => V.buildHelicopter(heli));
    rider(heli, SEAT.helicopter.position, { seated: true });
    return heli;
  },
  boat: () => {
    const boat = new THREE.Group();
    timed("boat", () => V.buildBoat(boat));
    rider(boat, SEAT.sailboat.position, {});
    return boat;
  },
  skates: () => {
    const root = new THREE.Group();
    timed("skates", () => V.buildRocketSkates(root));
    rider(root, SEAT.rocket_skates.position, { flying: true });
    return root;
  },
  jet: () => {
    const g = new THREE.Group();
    g.scale.setScalar(CHAR_SCALE);
    timed("jet", () => V.buildJetpack(g));
    rider(g, [0, 0, 0], { flying: true, carrying: true }, 1);
    return g;
  },
  portal: () => {
    const g = new THREE.Group();
    g.scale.setScalar(CHAR_SCALE);
    timed("portal", () => V.buildPortal(g));
    rider(g, [0, 0, 0], {}, 1);
    return g;
  },
});

for (const id of GADGET_IDS)
  makers[id] = () => {
    const g = new THREE.Group();
    g.name = id;
    g.scale.setScalar(Number(params.get("gscale") || CHAR_SCALE));
    timed(id, () => buildGadget(id, g));
    return g;
  };
const wanted = (params.get("items") || "van").split(",").flatMap((k) => (k === "gadgets" ? GADGET_IDS : [k]));
const objects = [];
for (const key of wanted) if (makers[key]) objects.push(makers[key]());
const gap = Number(params.get("gap") || 2.6);
const start = (-(objects.length - 1) * gap) / 2;
objects.forEach((o, i) => {
  o.position.x += start + i * gap;
  o.rotation.y = THREE.MathUtils.degToRad(Number(params.get("turn") || 0));
  scene.add(o);
});
if (params.get("ref") !== "0") {
  const g = new THREE.Group();
  rider(g, [0, 0, 0], {});
  g.position.set(start - gap * 0.9, 0, 0);
  scene.add(g);
}

const camera = new THREE.PerspectiveCamera(Number(params.get("fov") || 28), innerWidth / innerHeight, 0.1, 200);
const dist = Number(params.get("dist") || 5);
const views = { front: 0, three: 38, side: 90, back: 180, top: 0, game: 36.87, rear3: 150 };
const view = params.get("view") || "three";
const az = THREE.MathUtils.degToRad(views[view] ?? 38);
const e =
  view === "top"
    ? Math.PI / 2 - 0.001
    : view === "game"
      ? THREE.MathUtils.degToRad(31)
      : THREE.MathUtils.degToRad(Number(params.get("elev") || 18));
const target = new THREE.Vector3(Number(params.get("tx") || 0), Number(params.get("ty") || 0.5), Number(params.get("tz") || 0));
camera.position.set(
  target.x + Math.sin(az) * Math.cos(e) * dist,
  target.y + Math.sin(e) * dist,
  target.z + Math.cos(az) * Math.cos(e) * dist,
);
camera.lookAt(target);
sun.target.position.copy(target);
const s = Math.max(4, objects.length * gap * 0.6);
Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
renderer.render(scene, camera);
let tris = 0;
scene.traverse((o) => {
  if (o.isMesh && o.geometry && !o.isSkinnedMesh) {
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
});
document.body.dataset.stats = JSON.stringify({ timings, props: sculptStats(), sceneTriangles: Math.round(tris) });
document.body.dataset.ready = "1";
window.__lab = { scene, camera, renderer, objects };
