import * as THREE from "three";
import { createToyKit, createToyEnvironment } from "../src/toy-kit.js";
import { animateCharacter } from "../src/world-animation.js";
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
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
sun.shadow.normalBias = 0.02;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: "#e7cf9d", roughness: 0.8 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const kit = createToyKit();
const views = (params.get("views") || "0,45,90,180").split(",").map(Number);
const pose = params.get("pose") || "idle";
const phase = Number(params.get("phase") || 0);
const figures = views.map((deg, i) => {
  const { body } = kit.courier();
  body.position.x = (i - (views.length - 1) / 2) * 1.25;
  body.rotation.y = THREE.MathUtils.degToRad(deg);
  body.userData.characterRestRotation = [0, body.rotation.y, 0];
  scene.add(body);
  return body;
});
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 100);
const dist = Number(params.get("dist") || 6.2);
const elev = Number(params.get("elev") || 0.25);
camera.position.set(0, 0.7 + dist * Math.sin(elev), dist * Math.cos(elev));
camera.lookAt(0, 0.7, 0);
for (let f = 0; f < 90; f++)
  figures.forEach((b) =>
    animateCharacter(b, { walkCycle: phase, moving: pose === "walk", speed: 2 }, {
      walking: pose === "walk", carrying: pose === "carry" || params.has("carry"), working: pose === "work",
      cycling: pose === "cycle", seated: pose === "seat", time: 0.5, dt: 1 / 60,
    }),
  );
renderer.render(scene, camera);
document.body.dataset.ready = "1";
