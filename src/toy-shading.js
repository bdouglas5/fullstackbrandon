import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * Diorama shading: the soft contact darkness a tabletop miniature gets from a
 * studio light, without screen-space AO. The static island is captured once
 * from above as a height field; one small pass turns it into
 *   R  occlusion of the top surface (lawn beside a wall, roof beside a chimney)
 *   G  height of the ground beneath (walls darken where they meet it)
 *   B  edge lip (+ raised edges catch light, - the step at their foot)
 *   A  softened top height (ground under eaves and canopies reads covered)
 * Painted materials read it with one texture lookup. The bake reruns only
 * when the set of still, visible scenery changes (construction, purchases).
 */

const BAKE = { minX: -30, minZ: -34, size: 72, resolution: 1024 };
const H_MIN = -2,
  H_RANGE = 10;
const TOP_LAYER = 29,
  GROUND_LAYER = 30;
const ACTORS = 24;

export const toyUniforms = {
  uToyAO: { value: null },
  uToyBake: {
    value: new THREE.Vector4(BAKE.minX, BAKE.minZ, 1 / BAKE.size, 0),
  },
  uToyAOStrength: { value: 1 },
  // Occluded paint shifts cool, like a shadow side mixed with a little blue.
  uToyAOTint: { value: new THREE.Color(0.78, 0.84, 0.96) },
  uToyShadeTint: { value: new THREE.Color(0.88, 0.97, 1.12) },
  uToyRimColor: { value: new THREE.Color("#fff4d6") },
  // Soft pools under moving figurines and vehicles (x, feet y, z, radius).
  uToyActors: {
    value: Array.from({ length: ACTORS }, () => new THREE.Vector4()),
  },
};

const heightMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uBake: { value: new THREE.Vector3(BAKE.minX, BAKE.minZ, BAKE.size) },
    },
    // Projected straight down onto the bake square; higher wins the depth test.
    vertexShader: /* glsl */ `
      uniform vec3 uBake;
      varying float vH;
      void main() {
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vH = wp.y;
        float h = clamp((wp.y - ${H_MIN.toFixed(1)}) / ${H_RANGE.toFixed(1)}, 0.0, 1.0);
        gl_Position = vec4((wp.xz - uBake.xy) / uBake.z * 2.0 - 1.0, 1.0 - 2.0 * h, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vH;
      void main() {
        gl_FragColor = vec4(clamp((vH - ${H_MIN.toFixed(1)}) / ${H_RANGE.toFixed(1)}, 0.0, 1.0), 0.0, 0.0, 1.0);
      }`,
  });

const occlusionMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tTop: { value: null },
      tGround: { value: null },
      uSize: { value: BAKE.size },
    },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D tTop, tGround;
      uniform float uSize;
      varying vec2 vUv;
      float top(vec2 o) { return texture2D(tTop, vUv + o / uSize).r * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)}; }
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        float h0 = top(vec2(0.0));
        float g0 = texture2D(tGround, vUv).r * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
        // Local slope by minmod, so beaches and ramps do not occlude
        // themselves while kerbs and walls still count as steps.
        float e = 0.09;
        float gx0 = h0 - top(vec2(-e, 0.0)), gx1 = top(vec2(e, 0.0)) - h0;
        float gz0 = h0 - top(vec2(0.0, -e)), gz1 = top(vec2(0.0, e)) - h0;
        vec2 slope = vec2(
          gx0 * gx1 > 0.0 ? (abs(gx0) < abs(gx1) ? gx0 : gx1) : 0.0,
          gz0 * gz1 > 0.0 ? (abs(gz0) < abs(gz1) ? gz0 : gz1) : 0.0) / e;
        // Height-field occlusion: the sine of each neighbour's elevation above
        // this surface. A tight contact ring and a broad soft one; the spiral
        // turns per texel and the blur pass removes the grain.
        float spin = hash(vUv * 1024.0) * 6.2831853;
        float near = 0.0, far = 0.0, nearTotal = 0.0, farTotal = 0.0;
        for (int i = 0; i < 48; i++) {
          float fi = float(i) + 0.5;
          float r = 0.04 + 2.2 * pow(fi / 48.0, 1.5);
          float a = fi * 2.3999632 + spin;
          vec2 o = vec2(cos(a), sin(a)) * r;
          float rise = top(o) - h0 - dot(slope, o) - 0.045;
          float t = max(rise, 0.0) / r;
          float s = t * inversesqrt(1.0 + t * t);
          float wn = 1.0 - smoothstep(0.12, 0.5, r);
          near += wn * s;
          nearTotal += wn;
          far += s;
          farTotal += 1.0;
        }
        float ao = (1.0 - 0.55 * near / nearTotal) * pow(1.0 - far / farTotal, 2.0);
        // Edge lip: raised rims catch light, the step at their foot darkens.
        float convex = 0.0, concave = 0.0, soft = h0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982 + 0.39;
          vec2 d = vec2(cos(a), sin(a));
          float drop = h0 + dot(slope, d * 0.12) - top(d * 0.12);
          convex += smoothstep(0.012, 0.05, drop);
          float rise = -drop;
          concave += smoothstep(0.012, 0.05, rise) * (1.0 - smoothstep(0.3, 0.5, rise));
          soft += top(d * 0.2);
        }
        gl_FragColor = vec4(
          ao,
          clamp((g0 - ${H_MIN.toFixed(1)}) / ${H_RANGE.toFixed(1)}, 0.0, 1.0),
          0.5 + 0.5 * (convex - concave) / 8.0,
          clamp((soft / 9.0 - ${H_MIN.toFixed(1)}) / ${H_RANGE.toFixed(1)}, 0.0, 1.0));
      }`,
  });

// Separable blur. Occlusion (R) is edge-aware, so a bright roof never bleeds
// onto the dark ground beside its wall; covered height (A) blurs freely to
// soften canopy outlines. Ground (G) and edge lip (B) stay crisp.
const blurMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tSource: { value: null },
      tTop: { value: null },
      uStep: { value: new THREE.Vector2() },
    },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D tSource, tTop;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        vec4 center = texture2D(tSource, vUv);
        float h0 = texture2D(tTop, vUv).r * ${H_RANGE.toFixed(1)};
        float ao = 0.0, aoTotal = 0.0, cover = 0.0, coverTotal = 0.0;
        for (int i = -5; i <= 5; i++) {
          vec2 uv = vUv + uStep * float(i);
          vec4 c = texture2D(tSource, uv);
          float w = exp(-float(i * i) / 10.0);
          float dh = texture2D(tTop, uv).r * ${H_RANGE.toFixed(1)} - h0;
          float same = w * exp(-dh * dh * 400.0);
          ao += c.r * same;
          aoTotal += same;
          cover += c.a * w;
          coverTotal += w;
        }
        gl_FragColor = vec4(ao / aoTotal, center.g, center.b, cover / coverTotal);
      }`,
  });

// Painted-miniature detail, evaluated after the world-surface patch so it can
// reuse its world position, normal and noise helpers.
const FRAGMENT_COMMON = /* glsl */ `
  uniform sampler2D uToyAO;
  uniform vec4 uToyBake;
  uniform float uToyAOStrength;
  uniform vec3 uToyAOTint, uToyShadeTint, uToyRimColor;
  uniform vec4 uToyActors[${ACTORS}];
`;

const FRAGMENT_SAMPLE = /* glsl */ `
  vec3 toyTilt = vec3(0.0); // world-space normal detail, applied below
  vec2 toyUV = (vSurfWorld.xz - uToyBake.xy) * uToyBake.z;
  float toyInside = uToyBake.w * step(0.0, toyUV.x) * step(toyUV.x, 1.0) * step(0.0, toyUV.y) * step(toyUV.y, 1.0);
  vec4 toyMap = texture2D(uToyAO, toyUV);
  float toyGround = toyMap.g * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
  float toyTop = toyMap.a * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
  float toyUp = smoothstep(0.55, 0.9, vSurfNormal.y);
  float toyEdge = (toyMap.b * 2.0 - 1.0) * toyInside * toyUp;
  #ifdef TOY_GROUND
    // Ground under eaves, benches and canopies is covered from the sky.
    float toyCovered = smoothstep(0.12, 0.7, toyTop - vSurfWorld.y);
    float toyOcclusion = min(toyMap.r, 1.0 - 0.35 * toyCovered);
  #else
    float toyIsTop = 1.0 - smoothstep(0.06, 0.2, abs(toyTop - vSurfWorld.y));
    float toyContact = 1.0 - smoothstep(0.0, 0.22, vSurfWorld.y - toyGround);
    float toyOcclusion = mix(1.0, toyMap.r, toyUp * toyIsTop)
      * (1.0 - 0.32 * toyContact * (1.0 - toyUp));
  #endif
  // Figurines and vehicles are not in the bake; each carries a soft pool.
  float toyFeet = 1.0;
  for (int i = 0; i < ${ACTORS}; i++) {
    vec4 actor = uToyActors[i];
    if (actor.w <= 0.0) continue;
    vec2 d = vSurfWorld.xz - actor.xz;
    float lift = abs(vSurfWorld.y - actor.y);
    toyFeet *= 1.0 - 0.55 * exp(-dot(d, d) / (actor.w * actor.w)) * (1.0 - smoothstep(0.15, 2.5, lift));
  }
  toyOcclusion *= mix(1.0, toyFeet, toyUp);
  toyOcclusion = mix(1.0, toyOcclusion, toyInside * uToyAOStrength);
  diffuseColor.rgb *= 1.0 + 0.3 * max(toyEdge, 0.0) - 0.22 * max(-toyEdge, 0.0);
  #ifdef TOY_LAWN
  {
    vec2 lp = vSurfWorld.xz;
    // Broad drifts: sunny yellow-green meadow and cooler blue-green dips.
    float drift = surfNoise(lp * 0.23) * 0.6 + surfNoise(lp * 0.61 + 7.0) * 0.4;
    vec3 hue = mix(vec3(0.8, 0.95, 0.96), vec3(1.08, 1.04, 0.74), smoothstep(0.28, 0.72, drift));
    diffuseColor.rgb *= mix(vec3(1.0), hue, 0.6);
    // Sponge-painted clumps: two offset grids of soft round dabs, each its
    // own shade, so the lawn reads as tufted paint rather than flat colour.
    // Fades out before the dabs get small enough to shimmer.
    float clump = 0.0;
    vec2 warped = lp + (vec2(surfNoise(lp * 2.3), surfNoise(lp * 2.3 + 5.2)) - 0.5) * 0.14;
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 0.08 : 0.05;
      vec2 q = (layer == 0 ? warped : mat2(0.8, -0.6, 0.6, 0.8) * warped + 3.1) / scale;
      vec2 qc = floor(q), qf = fract(q);
      float d1 = 8.0, cid = 0.0;
      vec2 toCenter = vec2(0.0);
      for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          float id = surfHash(qc + g + float(layer) * 41.0);
          vec2 d = g + vec2(id, surfHash(qc + g + 19.7)) * 0.7 + 0.15 - qf;
          float dd = dot(d, d);
          if (dd < d1) { d1 = dd; cid = id; toCenter = d; }
        }
      float dab = 1.0 - smoothstep(0.08, 0.5, d1);
      clump += (dab * (0.55 + 0.9 * cid) - 0.45) * (layer == 0 ? 0.6 : 0.4);
      // Each dab is a low dome, so the sun picks out the clumps.
      if (layer == 0)
        toyTilt.xz -= normalize(toCenter + 1e-4) * smoothstep(0.02, 0.3, d1) * (1.0 - smoothstep(0.3, 0.6, d1)) * 0.3 * smoothstep(0.25, 0.7, cid);
    }
    vec2 q0 = lp / 0.05;
    float lawnFade = 1.0 - smoothstep(0.18, 0.45, max(fwidth(q0.x), fwidth(q0.y)));
    diffuseColor.rgb *= 1.0 + clump * 0.3 * lawnFade;
    toyTilt *= lawnFade;
  }
  #endif
`;

const FRAGMENT_NORMAL = /* glsl */ `
  #ifdef TOY_PAVING
  {
    // Pillowed pavers: every stone's rim rolls off, so low sun rakes them.
    // Same running-bond grid as the paving colour pattern.
    vec2 size = vec2(0.34, 0.21);
    vec2 p = vSurfWorld.xz / size;
    p.x += floor(p.y) * 0.5;
    vec2 f = fract(p);
    float bevel = 0.05;
    vec2 lo = 1.0 - smoothstep(0.0, bevel, f * size);
    vec2 hi = 1.0 - smoothstep(0.0, bevel, (1.0 - f) * size);
    vec2 crown = (f - 0.5) * 0.18;
    float fade = 1.0 - smoothstep(0.12, 0.4, max(fwidth(p.x), fwidth(p.y)));
    toyTilt.xz += (hi - lo + crown) * 0.5 * fade;
  }
  #endif
  if (dot(toyTilt, toyTilt) > 0.0)
    normal = normalize(normal + (viewMatrix * vec4(toyTilt * toyUp * toyInside, 0.0)).xyz);
`;

const FRAGMENT_LIGHT = /* glsl */ `
  // Occluded paint goes deeper rather than greyer: darken, keep the chroma
  // (a raised power of the albedo, renormalised), and lean slightly cool.
  vec3 toyRich = pow(max(diffuseColor.rgb, vec3(0.01)), vec3(0.6 * (1.0 - toyOcclusion)));
  toyRich /= max(dot(toyRich, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  vec3 toyShade = toyOcclusion * mix(vec3(1.0), toyRich, 0.8) * mix(uToyAOTint, vec3(1.0), toyOcclusion);
  reflectedLight.indirectDiffuse *= toyShade * uToyShadeTint;
  reflectedLight.directDiffuse *= mix(vec3(1.0), toyShade, 0.6);
  reflectedLight.indirectSpecular *= toyOcclusion;
`;

const FRAGMENT_RIM = /* glsl */ `
  #ifdef TOY_FOLIAGE
  {
    // Canopies read as polished toy foliage: a warm sheen on their silhouette.
    float toyRim = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += uToyRimColor * diffuseColor.rgb * pow(toyRim, 2.5) * 0.45 * toyOcclusion;
  }
  #endif
`;

const patched = new WeakSet();
export function patchToyMaterial(material, kind) {
  if (patched.has(material)) return false;
  patched.add(material);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.call(material);
  const defines =
    {
      lawn: "#define TOY_GROUND\n#define TOY_LAWN\n",
      ground: "#define TOY_GROUND\n",
      paving: "#define TOY_GROUND\n#define TOY_PAVING\n",
      foliage: "#define TOY_FOLIAGE\n",
    }[kind] || "";
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    // Relies on the world-surface varyings; leave anything else untouched.
    if (!shader.fragmentShader.includes("varying vec3 vSurfWorld")) return;
    Object.assign(shader.uniforms, toyUniforms);
    shader.fragmentShader = (defines + FRAGMENT_COMMON + shader.fragmentShader)
      .replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>\n${FRAGMENT_SAMPLE}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${FRAGMENT_RIM}`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>\n${FRAGMENT_LIGHT}`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|toy-v2:${kind}`;
  material.needsUpdate = true;
  return true;
}

export function toyKind(material, foliage = new Set()) {
  const flags = material.userData.surfacePatched;
  if (flags.style === "lawn") return "lawn";
  if (flags.style === "paving") return "paving";
  if (flags.sand) return "ground";
  if (foliage.has(material)) return "foliage";
  return "prop";
}

/**
 * Bake the diorama height field and give every surface-patched material the
 * toy shading. Call patch() after applyWorldSurfaces and refresh() about once
 * a second; both are cheap when nothing has changed.
 */
export function createToyShading(
  renderer,
  scene,
  w,
  { foliage = new Set() } = {},
) {
  const gl = renderer.getContext();
  const floatable =
    renderer.capabilities.isWebGL2 &&
    (renderer.extensions.has("EXT_color_buffer_float") ||
      renderer.extensions.has("EXT_color_buffer_half_float"));
  const size = BAKE.resolution;
  const heightTarget = () =>
    new THREE.WebGLRenderTarget(size, size, {
      type: floatable ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
  const topTarget = heightTarget(),
    groundTarget = heightTarget();
  const occlusionTargetLike = () =>
    new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  const occlusionTarget = occlusionTargetLike();
  const half = BAKE.size / 2;
  const camera = new THREE.OrthographicCamera(
    -half,
    half,
    half,
    -half,
    0.1,
    400,
  );
  camera.position.set(BAKE.minX + half, 200, BAKE.minZ + half);
  camera.lookAt(BAKE.minX + half, 0, BAKE.minZ + half);
  camera.updateMatrixWorld();
  const heights = heightMaterial();
  const occlusion = occlusionMaterial();
  occlusion.uniforms.tTop.value = topTarget.texture;
  occlusion.uniforms.tGround.value = groundTarget.texture;
  const quad = new FullScreenQuad(occlusion);
  const blur = blurMaterial();
  const blurQuad = new FullScreenQuad(blur);
  blur.uniforms.tTop.value = topTarget.texture;
  const scratchTarget = occlusionTargetLike();
  toyUniforms.uToyAO.value = occlusionTarget.texture;

  // Scenery is "still" until its world matrix is seen to change; anything that
  // moves (boats, vehicles, swinging signs) is left out of the bake for good.
  const lastMatrix = new WeakMap();
  const movers = new WeakSet();
  let baked = new Set(),
    bakes = 0;
  const groundMaterial = (m) => {
    const flags = m.userData.surfacePatched;
    return (
      flags &&
      (flags.style === "lawn" || flags.style === "paving" || flags.sand)
    );
  };
  const candidates = () => {
    const still = new Set();
    w.world.traverseVisible((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
      const m = o.material;
      if (!m || Array.isArray(m) || m.transparent || !m.isMeshStandardMaterial)
        return;
      if (m.userData.noSurface) return;
      const previous = lastMatrix.get(o);
      const e = o.matrixWorld.elements;
      if (previous) {
        for (let i = 0; i < 16; i++)
          if (Math.abs(previous[i] - e[i]) > 1e-4) movers.add(o);
        previous.set(e);
      } else lastMatrix.set(o, Float32Array.from(e));
      if (!movers.has(o)) still.add(o);
    });
    return still;
  };
  const bake = (still) => {
    for (const o of baked)
      (o.layers.disable(TOP_LAYER), o.layers.disable(GROUND_LAYER));
    for (const o of still) {
      o.layers.enable(TOP_LAYER);
      if (groundMaterial(o.material)) o.layers.enable(GROUND_LAYER);
    }
    baked = still;
    const started = performance.now();
    const state = {
      target: renderer.getRenderTarget(),
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.autoUpdate,
      background: scene.background,
      override: scene.overrideMaterial,
      clear: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
    };
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    scene.background = null;
    scene.overrideMaterial = heights;
    for (const [layer, target] of [
      [TOP_LAYER, topTarget],
      [GROUND_LAYER, groundTarget],
    ]) {
      camera.layers.set(layer);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
    }
    scene.overrideMaterial = state.override;
    scene.background = state.background;
    renderer.setRenderTarget(occlusionTarget);
    quad.render(renderer);
    for (const [source, target, x, y] of [
      [occlusionTarget, scratchTarget, 1, 0],
      [scratchTarget, occlusionTarget, 0, 1],
    ]) {
      blur.uniforms.tSource.value = source.texture;
      blur.uniforms.uStep.value.set((x * 1.5) / size, (y * 1.5) / size);
      renderer.setRenderTarget(target);
      blurQuad.render(renderer);
    }
    renderer.setRenderTarget(state.target);
    renderer.setClearColor(state.clear, state.alpha);
    renderer.autoClear = state.autoClear;
    renderer.shadowMap.autoUpdate = state.shadows;
    toyUniforms.uToyBake.value.w = 1;
    bakes++;
    renderer.domElement.dataset.toyBakeMs = (
      performance.now() - started
    ).toFixed(1);
    renderer.domElement.dataset.toyBakes = String(bakes);
    renderer.domElement.dataset.toyBakeMeshes = String(still.size);
  };
  const changed = (still) => {
    if (still.size !== baked.size) return true;
    for (const o of still) if (!baked.has(o)) return true;
    return false;
  };
  // Pools follow whatever figurines and vehicles are visible, nearest first.
  const extents = new WeakMap();
  const box = new THREE.Box3(),
    sizeOf = new THREE.Vector3(),
    at = new THREE.Vector3();
  const radiusOf = (root) => {
    if (!extents.has(root)) {
      box.setFromObject(root).getSize(sizeOf);
      extents.set(
        root,
        THREE.MathUtils.clamp(Math.max(sizeOf.x, sizeOf.z) * 0.42, 0.16, 1.1),
      );
    }
    return extents.get(root);
  };
  const shown = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const actorRoots = () => {
    const roots = [w.brandon, w.bike, w.van, w.helicopter, w.rocketSkates];
    roots.push(...(w.customers || []), ...(w.pedestrians || []));
    for (const rig of w.crewActors?.values() || [])
      roots.push(
        rig.group,
        rig.bicycle,
        rig.van,
        rig.rocketSkates,
        rig.helicopter,
        rig.jetpack,
      );
    return roots.filter(Boolean);
  };
  const pool = [];
  let patchedCount = 0;
  return {
    uniforms: toyUniforms,
    patch(root = scene) {
      root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (
            m?.userData?.surfacePatched &&
            patchToyMaterial(m, toyKind(m, foliage))
          )
            patchedCount++;
      });
      renderer.domElement.dataset.toyMaterials = String(patchedCount);
    },
    /** Once per frame: soft contact pools for the nearest visible actors. */
    update(focus) {
      pool.length = 0;
      for (const root of actorRoots()) {
        if (!shown(root)) continue;
        root.getWorldPosition(at);
        pool.push([
          at.x,
          at.y,
          at.z,
          radiusOf(root),
          (at.x - focus.x) ** 2 + (at.z - focus.z) ** 2,
        ]);
      }
      pool.sort((a, b) => a[4] - b[4]);
      toyUniforms.uToyActors.value.forEach((v, i) =>
        pool[i]
          ? v.set(pool[i][0], pool[i][1], pool[i][2], pool[i][3])
          : v.set(0, 0, 0, 0),
      );
    },
    refresh() {
      if (gl.isContextLost()) return;
      const still = candidates();
      if (changed(still)) bake(still);
    },
    dispose() {
      topTarget.dispose();
      groundTarget.dispose();
      occlusionTarget.dispose();
      scratchTarget.dispose();
      heights.dispose();
      occlusion.dispose();
      blur.dispose();
    },
  };
}
