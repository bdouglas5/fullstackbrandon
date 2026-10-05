import * as THREE from "three";

/**
 * One set of world-wide shading uniforms shared by every painted surface.
 * Weather, wind, tide and sky light are written here once per frame; all
 * materials read them, so rain soaking the island or a gust crossing the
 * trees costs no extra draw calls and no per-object work on the CPU.
 */
export const surfaceUniforms = {
  uSurfTime: { value: 0 },
  uWetness: { value: 0 }, // how soaked surfaces are; dries slowly after rain
  uRain: { value: 0 }, // current rainfall, drives ripples on puddles
  uWindDir: { value: new THREE.Vector2(0.86, -0.5) },
  uWindStrength: { value: 0.3 },
  uGust: { value: 0 },
  uSeaLevel: { value: -0.7 },
  uRimColor: { value: new THREE.Color("#d8ecff") },
  uRimStrength: { value: 0.22 },
};

const NOISE = /* glsl */ `
float surfHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float surfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = surfHash(i), b = surfHash(i + vec2(1.0, 0.0));
  float c = surfHash(i + vec2(0.0, 1.0)), d = surfHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// Wind: a steady lean, a slow sway and gusts that roll across the islands.
const WIND = /* glsl */ `
vec3 windOffset(vec3 world, float sway, float flutter) {
  float t = uSurfTime;
  float along = dot(world.xz, uWindDir);
  float gustWave = 0.5 + 0.5 * sin(along * 0.35 - t * 1.7);
  float gust = uGust * gustWave * gustWave;
  float phase = world.x * 0.53 + world.z * 0.71;
  float strength = uWindStrength * (0.55 + 0.45 * sin(t * 0.7 + phase * 0.3)) + gust;
  float bend = sway * sway;
  vec2 lean = uWindDir * strength * 0.16 * (0.6 + 0.4 * sin(t * 1.9 + phase)) * bend;
  vec2 cross = vec2(-uWindDir.y, uWindDir.x) * sin(t * 1.3 + phase * 1.7) * 0.25 * strength * bend;
  vec3 offset = vec3(lean.x + cross.x, -0.25 * length(lean) * bend, lean.y + cross.y);
  // Leaves and blades flutter at a higher, irregular frequency.
  float f = sin(t * 7.3 + world.x * 5.1 + world.y * 4.3) * sin(t * 5.1 + world.z * 6.7);
  offset += vec3(f, f * 0.4, -f) * flutter * (0.25 + strength) * 0.018;
  return offset;
}
`;

function vertexPatch(shader, { sway }) {
  shader.vertexShader =
    `uniform float uSurfTime; uniform vec2 uWindDir; uniform float uWindStrength;
     uniform float uGust;
     varying vec3 vSurfWorld; varying vec3 vSurfNormal;
     ${sway ? "attribute float aSway; attribute float aFlutter;" : ""}
     ${sway ? WIND : ""}\n` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <project_vertex>",
    `vec4 surfWorld = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      surfWorld = batchingMatrix * surfWorld;
    #endif
    #ifdef USE_INSTANCING
      surfWorld = instanceMatrix * surfWorld;
    #endif
    surfWorld = modelMatrix * surfWorld;
    ${
      sway
        ? `vec3 surfWind = windOffset(surfWorld.xyz, aSway, aFlutter);
    surfWorld.xyz += surfWind;
    // Back into object space (static batches are already world space).
    transformed += (inverse(modelMatrix) * vec4(surfWind, 0.0)).xyz;`
        : ""
    }
    vSurfWorld = surfWorld.xyz;
    vec3 surfN = objectNormal;
    #ifdef USE_INSTANCING
      surfN = mat3(instanceMatrix) * surfN;
    #endif
    vSurfNormal = normalize(mat3(modelMatrix) * surfN);
    #include <project_vertex>`,
  );
}

// Procedural painted detail, evaluated in world space. Each pattern fades
// out as its cells shrink below a few pixels, so distant views never shimmer.
const STYLE = {
  shingle: /* glsl */ `
    {
      float upward = smoothstep(0.25, 0.45, vSurfNormal.y);
      float row = vSurfWorld.y / 0.085;
      float rowId = floor(row);
      float u = (vSurfWorld.x * 0.7 + vSurfWorld.z * 0.7) / 0.17 + rowId * 0.5;
      float fade = 1.0 - smoothstep(0.25, 0.6, fwidth(row));
      float lip = smoothstep(0.0, 0.16, fract(row));
      float gap = smoothstep(0.0, 0.06, fract(u)) * smoothstep(1.0, 0.94, fract(u));
      float tile = surfHash(vec2(floor(u), rowId));
      float pattern = mix(0.72, 1.0, lip * gap) * (0.92 + tile * 0.14);
      diffuseColor.rgb *= mix(1.0, pattern, upward * fade);
    }`,
  siding: /* glsl */ `
    {
      float wall = 1.0 - smoothstep(0.3, 0.6, abs(vSurfNormal.y));
      float board = vSurfWorld.y / 0.105;
      float fade = 1.0 - smoothstep(0.25, 0.6, fwidth(board));
      float lap = 0.9 + 0.1 * smoothstep(0.0, 0.3, fract(board));
      float grain = 0.97 + 0.03 * surfNoise(vec2((vSurfWorld.x + vSurfWorld.z) * 3.0, floor(board)));
      diffuseColor.rgb *= mix(1.0, lap * grain, wall * fade);
    }`,
  paving: /* glsl */ `
    {
      vec2 p = vSurfWorld.xz / vec2(0.34, 0.21);
      p.x += floor(p.y) * 0.5;
      vec2 cell = floor(p), f = fract(p);
      float fade = 1.0 - smoothstep(0.18, 0.45, max(fwidth(p.x), fwidth(p.y)));
      float edge = min(min(f.x, 1.0 - f.x) * 0.34, min(f.y, 1.0 - f.y) * 0.21);
      float grout = smoothstep(0.006, 0.022, edge);
      float stone = surfHash(cell);
      float pattern = mix(0.8, 1.0, grout) * (0.93 + stone * 0.12);
      diffuseColor.rgb *= mix(1.0, pattern, fade);
      diffuseColor.rgb *= 0.96 + 0.08 * surfNoise(vSurfWorld.xz * 0.35);
    }`,
  lawn: /* glsl */ `
    {
      float patches = surfNoise(vSurfWorld.xz * 0.22) * 0.65 + surfNoise(vSurfWorld.xz * 0.9) * 0.35;
      diffuseColor.rgb *= 0.88 + patches * 0.22;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.05, 0.7), smoothstep(0.62, 0.85, patches) * 0.35);
      vec2 blade = vSurfWorld.xz * 26.0;
      float fade = 1.0 - smoothstep(0.3, 0.8, max(fwidth(blade.x), fwidth(blade.y)));
      diffuseColor.rgb *= 1.0 - 0.06 * fade * step(0.72, surfHash(floor(blade)));
    }`,
};

function fragmentPatch(shader, { sand, rim, puddles, style }) {
  shader.fragmentShader =
    `uniform float uSurfTime; uniform float uWetness; uniform float uRain;
     uniform float uSeaLevel; uniform vec3 uRimColor; uniform float uRimStrength;
     varying vec3 vSurfWorld; varying vec3 vSurfNormal;
     ${NOISE}
     // Raindrop rings: every cell hosts a drop at its own time; the ring
     // expands and fades. Two offset layers keep the pattern from tiling.
     vec3 surfRipples(vec2 p, float t) {
       vec3 g = vec3(0.0);
       for (int k = 0; k < 2; k++) {
         vec2 q = p * (2.6 + float(k) * 1.1) + float(k) * 3.7;
         vec2 cell = floor(q);
         vec2 f = fract(q) - 0.5;
         float h = surfHash(cell + float(k) * 17.0);
         vec2 c = vec2(surfHash(cell + 3.1), surfHash(cell + 5.7)) * 0.36 - 0.18;
         float ph = fract(t * (1.1 + h * 0.7) + h);
         vec2 d = f - c;
         float r = length(d) + 1e-4;
         float x = (r - ph * 0.42) * 30.0;
         float ring = exp(-x * x) * (1.0 - ph) * step(h, uRain * 1.15);
         g.xy += (d / r) * ring * -x * 0.9;
         g.z += ring;
       }
       return g;
     }\n` + shader.fragmentShader;
  if (STYLE[style])
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      ${STYLE[style]}`,
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <roughnessmap_fragment>",
    `#include <roughnessmap_fragment>
    float surfUp = smoothstep(0.55, 0.95, vSurfNormal.y);
    float surfWet = uWetness * mix(0.55, 1.0, surfUp);
    ${
      puddles && style !== "lawn"
        ? `float surfPuddle = smoothstep(0.5, 0.64, surfNoise(vSurfWorld.xz * 0.55) * 0.75 + surfNoise(vSurfWorld.xz * 1.9) * 0.25)
        * smoothstep(0.93, 0.99, vSurfNormal.y) * smoothstep(0.25, 0.9, uWetness);`
        : "float surfPuddle = 0.0;"
    }
    ${sand ? "" : "float surfSheen = 0.0;"}
    ${
      sand
        ? `// Each wave soaks the sand a little higher and then lets go: a dark,
    // glossy band that breathes up and down the beach with the surf.
    float surfSwN = surfNoise(vSurfWorld.xz * 0.28);
    float surfSurge = 0.5 + 0.5 * sin(uSurfTime * 0.9 + surfSwN * 6.2831 + 1.3);
    float surfReach = uSeaLevel + 0.06 + 0.12 * surfSurge;
    float surfTide = smoothstep(surfReach + 0.12, surfReach - 0.02, vSurfWorld.y);
    surfWet = max(surfWet, surfTide * 0.9);
    // A thin bright sheen right at the water's reach, as it slides back.
    float surfSheen = (1.0 - smoothstep(0.0, 0.09, abs(vSurfWorld.y - surfReach + 0.03))) * (1.0 - surfSurge * 0.5);`
        : ""
    }
    diffuseColor.rgb *= 1.0 - 0.42 * surfWet - 0.18 * surfPuddle;
    roughnessFactor = mix(roughnessFactor, 0.2, surfWet * 0.8);
    roughnessFactor = mix(roughnessFactor, 0.035, surfPuddle);
    roughnessFactor = mix(roughnessFactor, 0.06, surfSheen);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12 + 0.03, surfSheen * 0.6);`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <normal_fragment_maps>",
    `#include <normal_fragment_maps>
    float surfRing = 0.0;
    if (uRain > 0.01) {
      vec3 surfR = surfRipples(vSurfWorld.xz, uSurfTime);
      vec2 surfG = surfR.xy * surfUp * (0.35 + surfPuddle * 0.65);
      normal = normalize(normal + (viewMatrix * vec4(surfG.x, 0.0, surfG.y, 0.0)).xyz * uRain);
      // Rings are only visible where water actually stands.
      surfRing = surfR.z * surfUp * surfPuddle * uRain;
    }`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>
    // Standing water mirrors the sky at a glancing angle, and each drop
    // leaves a bright ring on it.
    float surfGlance = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);
    totalEmissiveRadiance += uRimColor * (surfPuddle * surfGlance * 0.7 + surfRing * 0.32);
    ${
      rim
        ? `// Soft sky-colored rim, like a figurine under a studio softbox.
    float surfRim = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += uRimColor * diffuseColor.rgb * pow(surfRim, 2.6) * uRimStrength;`
        : ""
    }`,
  );
}

/**
 * Give a standard material the world-surface response. Existing
 * onBeforeCompile hooks (ocean, special glass) run first and are preserved.
 */
// Material clones copy userData but not shader hooks, so track by identity.
const patched = new WeakSet();
export function patchSurfaceMaterial(material, options = {}) {
  if (!material?.isMeshStandardMaterial || patched.has(material))
    return material;
  patched.add(material);
  const flags = {
    sway: !!options.sway,
    sand: !!options.sand,
    rim: !!options.rim,
    puddles: options.puddles !== false,
    style: options.style || material.userData.surfaceStyle || "",
  };
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.call(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, surfaceUniforms);
    vertexPatch(shader, flags);
    fragmentPatch(shader, flags);
  };
  const key = `surface-v4:${flags.sway ? "s" : ""}${flags.sand ? "b" : ""}${flags.rim ? "r" : ""}${flags.puddles ? "p" : ""}:${flags.style}`;
  material.customProgramCacheKey = () => `${previousKey}|${key}`;
  material.userData.surfacePatched = flags;
  material.needsUpdate = true;
  return material;
}

/** Patch every lit material under a root. Safe to call repeatedly. */
export function applyWorldSurfaces(
  root,
  { sand = new Set(), sway = new Set() } = {},
) {
  let count = 0;
  root.traverse((object) => {
    if (!object.isMesh || object.userData.noSurface) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!material?.isMeshStandardMaterial || patched.has(material)) continue;
      if (material.userData.noSurface) continue;
      if (material.transparent && material.opacity < 0.6) continue;
      patchSurfaceMaterial(material, {
        sand: sand.has(material),
        sway:
          sway.has(material) &&
          !!object.geometry?.attributes?.aSway &&
          !!object.geometry?.attributes?.aFlutter,
        rim: object.isSkinnedMesh || object.userData.rim,
        puddles: !object.isSkinnedMesh,
      });
      count++;
    }
  });
  return count;
}

/** Bake per-vertex wind weights: 0 at the anchored base, 1 at the tip. */
export function bakeSway(geometry, base, top, flutter = 1) {
  const p = geometry.attributes.position;
  const sway = new Float32Array(p.count),
    leaf = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - base) / (top - base), 0, 1);
    sway[i] = t;
    leaf[i] = t * flutter;
  }
  geometry.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));
  geometry.setAttribute("aFlutter", new THREE.BufferAttribute(leaf, 1));
  return geometry;
}
