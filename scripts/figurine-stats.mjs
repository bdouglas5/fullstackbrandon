import { figurineGeometry, createFigurine, FIGURINE_DETAIL } from "../src/figurine.js";
for (const [name, h] of Object.entries(FIGURINE_DETAIL)) {
  const t0 = performance.now();
  const g = figurineGeometry(h);
  console.log(name, "build ms", Math.round(performance.now() - t0), "verts", g.vertices, "tris", g.triangles);
}
const { body } = createFigurine();
const c = body.clone(true);
let sk = 0; c.traverse(o => { if (o.isSkinnedMesh) { sk++; if (!o.skeleton.bones.every(b => { let p = b; while (p && p !== c) p = p.parent; return p === c; })) throw new Error("clone bound to original bones"); } });
console.log("clone skinned meshes rebound:", sk);
