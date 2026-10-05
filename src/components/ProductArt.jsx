import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

// One offscreen WebGL renderer for the whole catalog, copied to small 2D
// canvases. Opening ten cards does not allocate ten browser GPU contexts.
const views = new Set(),
  cache = new Map();
let renderer,
  frame,
  lastFrame = 0;
const loader = new GLTFLoader();
const vehicles = new Set([
  "bike",
  "van",
  "rocket_skates",
  "helicopter",
  "jetpack",
  "teleporter",
]);
const modelPath = (id) =>
  `/models/${id === "sailboat" ? id : vehicles.has(id) ? `brandon-${id}` : `gadget-${id}`}.glb`;
function animate(now) {
  frame = requestAnimationFrame(animate);
  if (document.hidden || now - lastFrame < 1000 / 18) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  for (const view of views) {
    const bounds = view.canvas.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > window.innerHeight || !view.model)
      continue;
    if (!view.dragging && !view.reduced) view.pivot.rotation.y += dt * 0.3;
    const w = Math.min(440, Math.round(bounds.width * 1.25)),
      h = Math.min(290, Math.round(bounds.height * 1.25));
    if (!w || !h) continue;
    if (view.canvas.width !== w || view.canvas.height !== h) {
      view.canvas.width = w;
      view.canvas.height = h;
    }
    renderer.setSize(w, h, false);
    view.camera.aspect = w / h;
    view.camera.updateProjectionMatrix();
    renderer.render(view.scene, view.camera);
    view.context.clearRect(0, 0, w, h);
    view.context.drawImage(renderer.domElement, 0, 0, w, h);
  }
}
function startRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  frame = requestAnimationFrame(animate);
}
function clearRenderer() {
  if (views.size) return;
  cancelAnimationFrame(frame);
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
  for (const request of cache.values())
    request
      .then((gltf) => {
        const geometries = new Set(),
          materials = new Set();
        gltf.scene.traverse((o) => {
          if (o.geometry) geometries.add(o.geometry);
          if (o.material) materials.add(o.material);
        });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
      })
      .catch(() => {});
  cache.clear();
}
export default function ProductArt({ id, label }) {
  const canvas = useRef(),
    viewRef = useRef();
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let canceled = false;
    setStatus("loading");
    try {
      startRenderer();
    } catch {
      setStatus("unavailable");
      return;
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100),
      pivot = new THREE.Group();
    scene.add(pivot, new THREE.HemisphereLight("#fff4dc", "#7a9a93", 3));
    const sun = new THREE.DirectionalLight("#fff6df", 3);
    sun.position.set(-3, 5, 4);
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#bed8e9", 1.5);
    fill.position.set(3, 2, -3);
    scene.add(fill);
    const view = {
      scene,
      camera,
      pivot,
      canvas: canvas.current,
      context: canvas.current.getContext("2d"),
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    views.add(view);
    viewRef.current = view;
    if (!cache.has(id)) cache.set(id, loader.loadAsync(modelPath(id)));
    cache
      .get(id)
      .then((gltf) => {
        if (canceled) return;
        // Skinned riders must be cloned with their own skeleton; a plain clone
        // leaves the meshes bound to the cached original's bones.
        const model = cloneSkinned(gltf.scene);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model),
          center = box.getCenter(new THREE.Vector3()),
          size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        const scale = 1.8 / Math.max(size.x, size.y, size.z);
        model.scale.multiplyScalar(scale);
        model.position.multiplyScalar(scale);
        pivot.add(model);
        pivot.rotation.y = -0.6;
        pivot.rotation.x = 0.12;
        camera.position.set(2.5, 1.9, 3.4);
        camera.lookAt(0, 0, 0);
        view.model = model;
        setStatus("ready");
      })
      .catch(() => {
        if (!canceled) setStatus("unavailable");
      });
    return () => {
      canceled = true;
      views.delete(view);
      viewRef.current = null;
      clearRenderer();
    };
  }, [id]);
  return (
    <div
      className="product-art product-model"
      data-model={id}
      data-model-status={status}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${label} interactive 3D model`}
        tabIndex={0}
        onPointerDown={(e) => {
          const v = viewRef.current;
          if (!v) return;
          v.dragging = true;
          v.pointer = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const v = viewRef.current;
          if (!v?.dragging) return;
          v.pivot.rotation.y += (e.clientX - v.pointer) * 0.012;
          v.pointer = e.clientX;
        }}
        onPointerUp={() => {
          if (viewRef.current) viewRef.current.dragging = false;
        }}
        onPointerCancel={() => {
          if (viewRef.current) viewRef.current.dragging = false;
        }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            if (viewRef.current)
              viewRef.current.pivot.rotation.y +=
                e.key === "ArrowLeft" ? -0.25 : 0.25;
          }
        }}
      />
      <span className="model-hint">
        {status === "loading"
          ? "Unpacking the model…"
          : status === "unavailable"
            ? "3D preview unavailable"
            : "3D · drag to rotate"}
      </span>
    </div>
  );
}
