import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { optimizeWorld } from "../src/optimize-world.js";

test("static batching retains roads and shorelines sharing a material with different UV layouts", () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: "#e9d1a4" });
  const shore = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), material);
  shore.position.set(4, 0, 2);
  const roadGeometry = new THREE.PlaneGeometry(1, 4);
  roadGeometry.deleteAttribute("uv");
  const road = new THREE.Mesh(roadGeometry, material);
  road.position.set(-2, 0.5, 3);
  const otherRoad = new THREE.Mesh(roadGeometry, material);
  otherRoad.position.set(-2, 0.5, 8);
  const moving = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  moving.userData.dynamic = true;
  root.add(shore, road, otherRoad, moving);
  const before = new THREE.Box3().setFromObject(root);
  const count = (object) => {
    let vertices = 0;
    object.traverse((child) => {
      if (child.isMesh)
        vertices +=
          child.geometry.index?.count ??
          child.geometry.attributes.position.count;
    });
    return vertices;
  };
  const vertices = count(root);
  const errors = [];
  const originalError = console.error;
  try {
    console.error = (...message) => errors.push(message.join(" "));
    optimizeWorld({
      world: root,
      pedestrians: [],
      customers: [],
      crates: [],
      clouds: [],
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(errors, []);
  assert.equal(
    root.children.length,
    3,
    "two static batches and one moving mesh",
  );
  assert.equal(
    count(root),
    vertices,
    "all authored triangles survive batching",
  );
  assert.ok(new THREE.Box3().setFromObject(root).equals(before));
  assert.equal(moving.parent, root);
  assert.equal(road.parent, null);
  assert.equal(shore.parent, null);
  assert.equal(otherRoad.parent, null);
  assert.equal(
    root.children.filter((mesh) => mesh.geometry.attributes.uv).length,
    2,
  );
});

test("batching preserves shared vertices and authored shadow flags", () => {
  const world = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const box = new THREE.Mesh(new THREE.BoxGeometry(), material);
  box.castShadow = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material);
  const originalVertices =
    box.geometry.attributes.position.count +
    floor.geometry.attributes.position.count;
  world.add(box, floor);
  optimizeWorld({
    world,
    pedestrians: [],
    customers: [],
    crates: [],
    clouds: [],
  });
  assert.equal(
    world.children.length,
    2,
    "the floor does not become a shadow caster",
  );
  assert.equal(world.children.filter((mesh) => mesh.castShadow).length, 1);
  assert.equal(
    world.children.reduce(
      (n, mesh) => n + mesh.geometry.attributes.position.count,
      0,
    ),
    originalVertices,
  );
  assert.ok(world.children.every((mesh) => mesh.geometry.index));
});
