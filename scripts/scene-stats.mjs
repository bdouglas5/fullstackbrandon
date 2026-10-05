import { buildWorld } from "../src/world.js";
const t0 = performance.now();
const w = buildWorld();
const ms = performance.now() - t0;
let tris = 0, meshes = 0;
const byName = new Map();
w.world.traverse((o) => {
  if (!o.isMesh || !o.geometry) return;
  meshes++;
  const g = o.geometry;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  tris += n;
  const key = o.name || "(unnamed)";
  byName.set(key, (byName.get(key) || 0) + n);
});
console.log({ buildMs: Math.round(ms), meshes, triangles: Math.round(tris), dressing: w.dressing.counts, obstacles: w.dressing.obstacles });
console.log([...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${k}: ${Math.round(v)}`).join("\n"));
