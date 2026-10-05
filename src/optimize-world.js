import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
// Keep the authored scene editable. Only the runtime copy batches static meshes.
// Dynamic characters, stock, barriers, boats and clouds retain independent transforms.
export function optimizeWorld(w) {
  const dynamic = new Set([
    w.brandon,
    w.helicopter,
    w.bike,
    w.van,
    w.roadCones,
    ...w.pedestrians,
    w.barriers,
    w.boat,
    ...w.customers,
    ...w.crates,
    ...w.clouds,
  ]);
  const groups = new Map();
  w.world.updateMatrixWorld(true);
  w.world.traverse((object) => {
    if (!object.isMesh || Array.isArray(object.material)) return;
    for (let p = object; p; p = p.parent)
      if (dynamic.has(p) || p.userData.dynamic) return;
    // Roads have no UVs, while shoreline geometry sharing their sand material
    // does. Three can only merge geometries with matching attribute layouts.
    // Keep separate batches instead of abandoning the entire material group.
    const schema = JSON.stringify([
      object.castShadow,
      object.receiveShadow,
      Object.entries(object.geometry.attributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, attribute]) => [
          name,
          attribute.itemSize,
          attribute.normalized,
          attribute.array.constructor.name,
        ]),
    ]);
    if (!groups.has(object.material)) groups.set(object.material, new Map());
    const layouts = groups.get(object.material);
    if (!layouts.has(schema)) layouts.set(schema, []);
    layouts.get(schema).push(object);
  });
  for (const [material, layouts] of groups) {
    for (const objects of layouts.values()) {
      const geometries = objects.map((object) => {
        const g = object.geometry.clone();
        // Preserve shared vertices; merging must use a consistent index layout.
        if (!g.index)
          g.setIndex(
            Array.from({ length: g.attributes.position.count }, (_, i) => i),
          );
        g.applyMatrix4(object.matrixWorld);
        return g;
      });
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!geometry) continue;
      const merged = new THREE.Mesh(geometry, material);
      merged.name = "Static scenery batch";
      merged.castShadow = objects[0].castShadow;
      merged.receiveShadow = objects[0].receiveShadow;
      objects.forEach((object) => object.removeFromParent());
      w.world.add(merged);
    }
  }
}

// Townspeople share geometry and materials while each retains its own skeleton.
// Draw the body parts with instancing, then upload only their moving transforms.
export function instanceCitizens(w) {
  const batches = new Map();
  const roots = [...w.customers, ...w.pedestrians, ...w.clouds];
  for (const root of roots)
    root.traverse((o) => {
      if (!o.isMesh) return;
      // Identical primitives (cloud puffs, eyes) batch by shape; sculpted
      // parts have no parameters, so their identity distinguishes them.
      const shape = o.geometry.parameters
        ? JSON.stringify([o.geometry.type, o.geometry.parameters])
        : o.geometry.uuid;
      const key = `${shape}/${o.material.uuid}`;
      if (!batches.has(key))
        batches.set(key, {
          geometry: o.geometry,
          material: o.material,
          sources: [],
        });
      batches.get(key).sources.push(o);
      o.visible = false;
    });
  const tint = new THREE.Color();
  for (const b of batches.values()) {
    b.mesh = new THREE.InstancedMesh(b.geometry, b.material, b.sources.length);
    // Parts that share a shape and a white material carry their own tint, so
    // a crowd of different outfits is still one draw call per shape.
    if (b.sources.some((source) => source.userData.tint)) {
      b.sources.forEach((source, i) =>
        b.mesh.setColorAt(i, tint.set(source.userData.tint || "#ffffff")),
      );
      b.mesh.instanceColor.needsUpdate = true;
    }
    b.mesh.name = "Instanced island neighbors";
    b.mesh.userData.dynamic = true;
    b.mesh.castShadow = b.mesh.receiveShadow = true;
    b.mesh.frustumCulled = false;
    b.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.world.add(b.mesh);
  }
  return () => {
    for (const root of roots) root.updateMatrixWorld(true);
    for (const b of batches.values()) {
      b.sources.forEach((source, i) =>
        b.mesh.setMatrixAt(i, source.matrixWorld),
      );
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  };
}
