import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { patchSurfaceMaterial } from "../src/world-surface.js";
import { patchToyMaterial, toyKind } from "../src/toy-shading.js";

// Compile a material's hooks against three's real physical shader source.
function compiled(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader, null);
  return shader;
}

test("toy shading layers onto the world-surface patch for every ground kind", () => {
  const lawn = new THREE.MeshStandardMaterial();
  lawn.userData.surfaceStyle = "lawn";
  const paving = new THREE.MeshStandardMaterial();
  paving.userData.surfaceStyle = "paving";
  const sand = new THREE.MeshStandardMaterial();
  const leaf = new THREE.MeshStandardMaterial();
  const wall = new THREE.MeshStandardMaterial();
  patchSurfaceMaterial(lawn);
  patchSurfaceMaterial(paving);
  patchSurfaceMaterial(sand, { sand: true });
  patchSurfaceMaterial(leaf);
  patchSurfaceMaterial(wall);
  const foliage = new Set([leaf]);
  assert.deepEqual(
    [lawn, paving, sand, leaf, wall].map((m) => toyKind(m, foliage)),
    ["lawn", "paving", "ground", "foliage", "prop"],
  );
  for (const material of [lawn, paving, sand, leaf, wall]) {
    const key = material.customProgramCacheKey();
    assert.equal(patchToyMaterial(material, toyKind(material, foliage)), true);
    assert.equal(patchToyMaterial(material, "prop"), false, "patched once");
    assert.notEqual(material.customProgramCacheKey(), key);
    const shader = compiled(material);
    // Each injection point must still exist in this three.js release.
    for (const marker of [
      "float toyOcclusion", // sampled after alphamap_fragment
      "toyTilt * toyUp", // normal detail after normal_fragment_maps
      "reflectedLight.indirectDiffuse *= toyShade", // after aomap_fragment
    ])
      assert.ok(shader.fragmentShader.includes(marker), marker);
    assert.ok(shader.uniforms.uToyAO && shader.uniforms.uToyActors);
    assert.ok(shader.fragmentShader.includes("vSurfWorld"));
  }
  assert.ok(compiled(lawn).fragmentShader.startsWith("#define TOY_GROUND\n#define TOY_LAWN"));
  assert.ok(compiled(paving).fragmentShader.includes("#define TOY_PAVING"));
});

test("materials without the world-surface patch are left untouched", () => {
  const plain = new THREE.MeshStandardMaterial();
  patchToyMaterial(plain, "prop");
  const shader = compiled(plain);
  assert.ok(!shader.fragmentShader.includes("toyOcclusion"));
});
