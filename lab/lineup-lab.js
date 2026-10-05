// Turntable lineup for vehicles, riders and props at true world scale, next to a
// reference courier. Lab only: the page builds the real world and lifts the
// finished models out of it, so what shows here is exactly what ships.
//
//   /lab/lineup.html?items=van,bike&view=three&dist=5&ground=1
//   items: brandon,van,bike,skates,heli,boat,jet,portal,gadgets,<gadget id>...
//   view : front | side | back | three | top | game (follow-camera direction)
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { createToyEnvironment } from "../src/toy-kit.js";
import { animateCharacter, animateVehicle } from "../src/world-animation.js";

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

const w = buildWorld();
const motion = { walkCycle: 0.6, speed: 3, moving: true, step: 0 };
const pose = (body, flags) => {
  for (let f = 0; f < 90; f++)
    animateCharacter(body, motion, { time: 0.5, dt: 1 / 60, ...flags });
};

// Boat captain is added by the renderer, not the world builder.
const sailor = w.body.clone(true);
sailor.name = "Brandon sailboat captain";
sailor.scale.setScalar(0.52);
sailor.position.set(-0.17, 0.5, 0.35);
w.boat.add(sailor);

const lineup = {
  brandon: [w.brandon, () => pose(w.body, { walking: false })],
  van: [w.van, () => pose(w.driver, { seated: true })],
  bike: [w.bike, () => pose(w.rider, { cycling: true })],
  skates: [w.rocketSkates, () => pose(w.skater, { flying: true })],
  heli: [w.helicopter, () => pose(w.pilot, { seated: true })],
  boat: [w.boat, () => pose(sailor, {})],
  jet: [w.jetpack, () => pose(w.jetPilot, { flying: true, carrying: true })],
  portal: [w.teleporter, () => pose(w.portalPilot, {})],
};
const ids = Object.keys(w.gadgetModels);
const wanted = (params.get("items") || "brandon,van,bike,skates,heli,boat,jet,portal").split(",");
const objects = [];
for (const key of wanted) {
  if (key === "gadgets") {
    ids.forEach((id) => objects.push([w.gadgetModels[id], null, id]));
  } else if (lineup[key]) objects.push([...lineup[key], key]);
  else if (w.gadgetModels[key]) objects.push([w.gadgetModels[key], null, key]);
}
const gap = Number(params.get("gap") || 2.6);
const rowStart = (-(objects.length - 1) * gap) / 2;
const tmp = new THREE.Box3();
objects.forEach(([object, setup], i) => {
  object.removeFromParent();
  scene.add(object);
  object.visible = true;
  object.position.set(rowStart + i * gap, 0, 0);
  object.rotation.set(0, THREE.MathUtils.degToRad(Number(params.get("turn") || 0)), 0);
  if (object.userData.dynamic && object === w.teleporter) object.position.y = 0;
  if (w.gadgetModels && Object.values(w.gadgetModels).includes(object))
    object.scale.setScalar(Number(params.get("gscale") || 1));
  object.traverse((o) => (o.visible = o.userData.hiddenInLab ? false : o.visible));
  setup?.();
  // Show the vehicle's own pilot even when the renderer would hide it.
  for (const p of [w.driver, w.rider, w.skater, w.pilot, w.jetPilot, w.portalPilot, sailor])
    p.visible = true;
  tmp.setFromObject(object);
});
// Reference courier standing next to the row so scale is always comparable.
if (params.get("ref") !== "0") {
  const ref = w.body.clone(true);
  const holder = new THREE.Group();
  holder.scale.setScalar(0.52);
  holder.position.set(rowStart - gap * 0.9, 0, 0);
  holder.add(ref);
  scene.add(holder);
  pose(ref, {});
}
// A one-unit ruler (floor tiles) keeps the scale honest.
const tiles = new THREE.GridHelper(40, 40, "#c9b27c", "#d8c28f");
tiles.position.y = 0.002;
if (params.get("grid") === "1") scene.add(tiles);

const camera = new THREE.PerspectiveCamera(Number(params.get("fov") || 28), innerWidth / innerHeight, 0.1, 200);
const dist = Number(params.get("dist") || 7);
const elev = THREE.MathUtils.degToRad(Number(params.get("elev") || 18));
const views = { front: 0, three: 38, side: 90, back: 180, top: 0, game: 36.87 };
const view = params.get("view") || "three";
const az = THREE.MathUtils.degToRad(views[view] ?? 38);
const target = new THREE.Vector3(Number(params.get("tx") || 0), Number(params.get("ty") || 0.45), 0);
const e = view === "top" ? Math.PI / 2 - 0.001 : view === "game" ? THREE.MathUtils.degToRad(31) : elev;
camera.position.set(
  target.x + Math.sin(az) * Math.cos(e) * dist,
  target.y + Math.sin(e) * dist,
  target.z + Math.cos(az) * Math.cos(e) * dist,
);
camera.lookAt(target);
sun.target.position.copy(target);
const s = Math.max(4, objects.length * gap * 0.6);
Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });

// Spin wheels/rotors slightly so mid-motion reads in stills.
for (const [object, , key] of objects) {
  if (key === "heli") animateVehicle(object, { speed: 0 }, { kind: "helicopter", active: true, rotor: w.rotor, tailRotor: w.tailRotor });
}
renderer.render(scene, camera);
document.body.dataset.ready = "1";
window.__lab = { w, scene, camera, renderer, objects };
