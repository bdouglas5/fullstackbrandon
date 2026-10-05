// Contact sheet of the exported product GLBs, lit like ProductArt.
// ?ids=bike,van,...&yaw=-0.6&dir=/models
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const q = new URLSearchParams(location.search);
const ids = (q.get("ids") || "bike,van,rocket_skates,sailboat,helicopter,jetpack,teleporter").split(",");
const yaw = +(q.get("yaw") ?? -0.6);
const path = (id) => `/models/${id === "sailboat" ? id : ["bike","van","rocket_skates","helicopter","jetpack","teleporter"].includes(id) ? `brandon-${id}` : `gadget-${id}`}.glb`;
const cols = Math.min(4, ids.length), rows = Math.ceil(ids.length / cols);
const cw = 420, ch = 330;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(cols * cw, rows * ch);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setScissorTest(true);
renderer.setClearColor("#eef3ee");
document.body.append(renderer.domElement);
const loader = new GLTFLoader();
const cells = [];
for (const [i, id] of ids.entries()) {
  const gltf = await loader.loadAsync(path(id));
  const scene = new THREE.Scene(), pivot = new THREE.Group();
  scene.add(pivot, new THREE.HemisphereLight("#fff4dc", "#7a9a93", 3));
  const sun = new THREE.DirectionalLight("#fff6df", 3); sun.position.set(-3, 5, 4); scene.add(sun);
  const fill = new THREE.DirectionalLight("#bed8e9", 1.5); fill.position.set(3, 2, -3); scene.add(fill);
  const model = q.get("naive") ? gltf.scene.clone(true) : cloneSkinned(gltf.scene); model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  model.position.sub(c);
  const k = 1.8 / Math.max(s.x, s.y, s.z);
  model.scale.multiplyScalar(k); model.position.multiplyScalar(k);
  pivot.add(model); pivot.rotation.y = yaw; pivot.rotation.x = 0.12;
  const cam = new THREE.PerspectiveCamera(32, cw / ch, 0.01, 100);
  cam.position.set(2.5, 1.9, 3.4); cam.lookAt(0, 0, 0);
  cells.push({ scene, cam, x: (i % cols) * cw, y: (rows - 1 - Math.floor(i / cols)) * ch });
}
for (const c of cells) {
  renderer.setViewport(c.x, c.y, cw, ch); renderer.setScissor(c.x, c.y, cw, ch);
  renderer.render(c.scene, c.cam);
}
document.body.dataset.ready = "1";
