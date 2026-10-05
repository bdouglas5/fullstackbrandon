import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(1024, 1024);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e9efdf");
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight("#fff9ec", "#b4c5aa", 2));
const sun = new THREE.DirectionalLight("#fff6e7", 3.5);
sun.position.set(-3, 5, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.normalBias = 0.01;
scene.add(sun);
const fill = new THREE.DirectionalLight("#e7f0ff", 1.5);
fill.position.set(4, 2, 1);
scene.add(fill);
const model = (
  await new GLTFLoader().loadAsync("./models/fullstack-brandon.glb")
).scene;
model.updateMatrixWorld(true);
let bounds = new THREE.Box3().setFromObject(model);
const height = bounds.max.y - bounds.min.y;
model.scale.setScalar(2.2 / height);
model.updateMatrixWorld(true);
bounds = new THREE.Box3().setFromObject(model);
model.position.set(
  -(bounds.min.x + bounds.max.x) / 2 - 0.24,
  -bounds.min.y,
  -(bounds.min.z + bounds.max.z) / 2,
);
model.rotation.y = -0.1;
model.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
});
scene.add(model);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: "#e9efdf", roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// A small pickle prop beside the source model, in the same painted-toy finish.
const pickle = new THREE.Group();
const pickleMaterial = new THREE.MeshStandardMaterial({
  color: "#80a440",
  roughness: 0.58,
});
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.16, 0.46, 12, 32),
  pickleMaterial,
);
pickle.add(body);
for (let i = 0; i < 36; i++) {
  const a = i * 2.39996,
    y = ((i % 9) - 4) * 0.055;
  const bump = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 6),
    pickleMaterial,
  );
  bump.position.set(Math.cos(a) * 0.156, y, Math.sin(a) * 0.156);
  pickle.add(bump);
}
pickle.position.set(0.65, 0.42, 0.12);
pickle.rotation.z = -0.13;
pickle.traverse((o) => {
  if (o.isMesh) o.castShadow = true;
});
scene.add(pickle);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0.15, 2.0, 5.4);
camera.lookAt(0, 1.14, 0);
renderer.render(scene, camera);
document.body.dataset.ready = "1";
