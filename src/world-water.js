import * as THREE from "three";
import {
  MAIN_ISLAND,
  FARM,
  FARM_ISLAND,
  REEF,
  ISLANDS,
} from "../shared/islands.js";
import { BEACH } from "../shared/beach.js";
import { surfaceUniforms } from "./world-surface.js";

export const SEA_LEVEL = -0.7;
// The ocean is flat around the archipelago and falls away beyond it, so the
// horizon curves like the edge of a very small planet.
export const PLANET = { x: 5, z: 2, flat: 46, curve: 0.012 };

/** Sand outlines (center, half size, corner radius, top) for every island. */
export const SHORES = [
  { x: MAIN_ISLAND.x, z: MAIN_ISLAND.z, hx: 16, hz: 12, r: 6, top: 0.18 },
  // The weekend cove: a sand lobe reaching out to sea from the west shore.
  { ...BEACH.cove, top: 0.18 },
  { x: FARM.x, z: FARM.z, hx: 2.75, hz: 2.55, r: 0.8, top: 0.155 },
  { x: REEF.x, z: REEF.z, hx: 2.7, hz: 2.6, r: 0.8, top: 0.17 },
  ...Object.values(ISLANDS).map((i) => ({
    x: i.x,
    z: i.z,
    hx: 3.75,
    hz: 3.6,
    r: 0.9,
    top: 0.18,
  })),
];
// The sea and the rain read these shared arrays, so a shore can change shape
// while the game runs: Pickle Cay grows from its orchard into the private
// island once Cay Construction has finished it.
export const SHORE_VECTORS = SHORES.map(
  (s) => new THREE.Vector4(s.x, s.z, s.hx, s.hz),
);
export const SHORE_RADII = SHORES.map((s) => s.r);
export const FARM_SHORE = SHORES.findIndex(
  (s) => s.x === FARM.x && s.z === FARM.z,
);
export function setFarmExpanded(expanded) {
  const shore = expanded ? FARM_ISLAND : SHORES[FARM_SHORE];
  SHORE_VECTORS[FARM_SHORE].set(shore.x, shore.z, shore.hx, shore.hz);
  SHORE_RADII[FARM_SHORE] = shore.r;
}
// Beach profile outward from the old sand edge: a rounded lip, a short bank,
// a gentle beach where the tide comes and goes, then the underwater shelf.
const PROFILE = [
  [0, 0],
  [0.06, -0.035],
  [0.3, -0.62],
  [0.98, -0.94],
  [1.3, -1.33],
];
export const WATERLINE = 0.83; // offset of the mean waterline from the edge

function outline(shore, step = 0.18) {
  const { hx, hz, r } = shore;
  const a = hx - r,
    b = hz - r;
  const points = [];
  const push = (x, z, nx, nz) =>
    points.push([shore.x + x, shore.z + z, nx, nz]);
  const edge = (x0, z0, x1, z1, nx, nz) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i < n; i++)
      push(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, nx, nz);
  };
  const arc = (cx, cz, from) => {
    const n = Math.max(3, Math.round(((Math.PI / 2) * r) / step));
    for (let i = 0; i < n; i++) {
      const t = from + (i / n) * (Math.PI / 2);
      push(
        cx + Math.cos(t) * r,
        cz + Math.sin(t) * r,
        Math.cos(t),
        Math.sin(t),
      );
    }
  };
  edge(a + r, -b, a + r, b, 1, 0);
  arc(a, b, 0);
  edge(a, b + r, -a, b + r, 0, 1);
  arc(-a, b, Math.PI / 2);
  edge(-a - r, b, -a - r, -b, -1, 0);
  arc(-a, -b, Math.PI);
  edge(-a, -b - r, a, -b - r, 0, -1);
  arc(a, -b, Math.PI * 1.5);
  return points;
}

/** Sloped sand skirts so every island meets the sea on a real beach. */
export function beachSkirts(material) {
  const group = new THREE.Group();
  group.name = "Tidal beaches";
  for (const shore of SHORES) group.add(shoreSkirt(shore, material));
  return group;
}

/** One island's sloped beach. `keep(nx, nz)` can leave stretches bare (quays). */
export function shoreSkirt(shore, material, keep = () => true) {
  {
    const ring = outline(shore).filter(([, , nx, nz]) => keep(nx, nz));
    const positions = [],
      uvs = [],
      index = [];
    for (const [x, z, nx, nz] of ring)
      for (const [out, dy] of PROFILE) {
        // Small irregularity so the waterline is not a ruler-straight line.
        const wobble = out > 0.1 ? Math.sin(x * 1.7 + z * 2.3) * 0.05 * out : 0;
        const px = x + nx * (out + wobble),
          pz = z + nz * (out + wobble);
        positions.push(px, shore.top + dy, pz);
        uvs.push(px, pz);
      }
    const rows = PROFILE.length,
      n = ring.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Skip the span between two kept stretches (a gap in the shore).
      if (
        ring[i] &&
        ring[j] &&
        Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]) > 0.5
      )
        continue;
      for (let k = 0; k < rows - 1; k++) {
        const a = i * rows + k,
          b = j * rows + k,
          c = j * rows + k + 1,
          d = i * rows + k + 1;
        index.push(a, b, d, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Tidal beach slope";
    mesh.receiveShadow = true;
    return mesh;
  }
}

function oceanGeometry() {
  // Polar grid: dense near the islands, sparse toward the curved horizon.
  const rings = [0];
  let r = 0,
    dr = 0.9;
  while (r < 230) {
    r += dr;
    rings.push(r);
    if (r > 40) dr *= 1.06;
  }
  const segments = 320;
  const positions = [0, 0, 0],
    index = [];
  for (let k = 1; k < rings.length; k++)
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rings[k], 0, Math.sin(a) * rings[k]);
    }
  for (let s = 0; s < segments; s++)
    index.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let k = 1; k < rings.length - 1; k++)
    for (let s = 0; s < segments; s++) {
      const a = 1 + (k - 1) * segments + s,
        b = 1 + (k - 1) * segments + ((s + 1) % segments),
        c = 1 + k * segments + ((s + 1) % segments),
        d = 1 + k * segments + s;
      index.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 240);
  return g;
}

export function createOcean() {
  const uniforms = {
    uTime: { value: 0 },
    uStorm: { value: 0 },
    uTide: { value: 0 },
    uWind: surfaceUniforms.uWindDir,
    uWindStrength: surfaceUniforms.uWindStrength,
    uRain: surfaceUniforms.uRain,
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color("#fff3d8") },
    uSky: { value: new THREE.Color("#cfe6ea") },
    uDeep: { value: new THREE.Color("#15628c") },
    uMid: { value: new THREE.Color("#2593b0") },
    uShallow: { value: new THREE.Color("#58d0c4") },
    uFoam: { value: new THREE.Color("#f4fbf6") },
    uNight: { value: 0 },
    uFlash: { value: 0 },
    uShores: { value: SHORE_VECTORS },
    uRadii: { value: SHORE_RADII },
    uPlanet: {
      value: new THREE.Vector4(PLANET.x, PLANET.z, PLANET.flat, PLANET.curve),
    },
  };
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.16,
    metalness: 0.0,
  });
  material.userData.noSurface = true;
  const count = SHORES.length;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const common = /* glsl */ `
      uniform float uTime, uStorm, uTide, uWindStrength, uRain, uNight;
      uniform vec2 uWind;
      uniform vec4 uPlanet;
      varying vec3 vWater;
      varying float vCrest;
    `;
    shader.vertexShader =
      common +
      /* glsl */ `
      // Gerstner swell: crests sharpen and travel downwind.
      vec3 gerstner(vec2 p, vec2 dir, float len, float amp, float speed, inout vec3 n) {
        float k = 6.2831853 / len;
        float f = k * (dot(dir, p) - speed * uTime);
        float c = cos(f), s = sin(f);
        n.x -= dir.x * k * amp * c;
        n.z -= dir.y * k * amp * c;
        return vec3(dir.x * amp * 0.6 * c, amp * s, dir.y * amp * 0.6 * c);
      }
      ` +
      shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          /* glsl */ `
        // The ocean mesh is only translated, so world and object axes agree.
        vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
        vec2 wind = normalize(uWind + vec2(1e-4));
        vec2 side = vec2(-wind.y, wind.x);
        float sea = 0.35 + uWindStrength * 0.5 + uStorm * 1.4;
        vec3 n = vec3(0.0, 1.0, 0.0);
        vec3 swell = gerstner(w.xz, wind, 9.0, 0.035 * sea, 1.6, n);
        swell += gerstner(w.xz, normalize(wind + side * 0.6), 5.3, 0.022 * sea, 1.25, n);
        swell += gerstner(w.xz, normalize(wind - side * 0.8), 3.1, 0.012 * sea, 0.95, n);
        swell += gerstner(w.xz, normalize(side - wind * 0.3), 13.0, 0.03 * sea, 2.1, n);
        // Edge of the world: beyond the archipelago the sea curves away.
        vec2 fromCenter = w.xz - uPlanet.xy;
        float r = length(fromCenter);
        float beyond = max(0.0, r - uPlanet.z);
        float drop = uPlanet.w * beyond * beyond;
        vec2 slope = fromCenter / max(r, 1e-3) * (2.0 * uPlanet.w * beyond);
        n.x += slope.x;
        n.z += slope.y;
        vec3 waveOffset = vec3(swell.x, swell.y + uTide - drop, swell.z);
        vWater = w + waveOffset;
        vCrest = swell.y / max(0.001, 0.05 * sea);
        vec3 objectNormal = normalize(n);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n        transformed += waveOffset;",
        );
    shader.fragmentShader =
      common +
      /* glsl */ `
      uniform vec3 uSunDir, uSunColor, uSky, uDeep, uMid, uShallow, uFoam;
      uniform vec4 uShores[${count}];
      uniform float uRadii[${count}];
      uniform float uFlash;
      float wHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float wNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x),
                   mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
      }
      vec2 wHash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }
      float shoreDistance(vec2 p) {
        float d = 1e5;
        for (int i = 0; i < ${count}; i++) {
          vec2 q = abs(p - uShores[i].xy) - uShores[i].zw + uRadii[i];
          d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadii[i]);
        }
        return d;
      }
      // Flat colour steps with soft seams: a resin-painted sea, not a gradient.
      float toon(float x, float steps) {
        float v = x * steps;
        return (floor(v) + smoothstep(0.2, 0.8, fract(v))) / steps;
      }
      // Distance to the nearest Voronoi cell border: the web of caustic light.
      float cellEdge(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p);
        float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++)
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * wHash2(i + g));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
        return sqrt(d2) - sqrt(d1);
      }
      float causticWeb(vec2 p, float t) {
        // Warp the lattice so cells bend like water, not like cracked glass.
        p += 0.32 * vec2(sin(p.y * 1.4 + t * 0.45), sin(p.x * 1.2 - t * 0.38));
        float a = cellEdge(p * 1.7 + vec2(t * 0.06, 0.0), t * 0.5);
        float b = cellEdge(p * 2.6 + vec2(7.3, -t * 0.05), t * 0.42 + 1.7);
        // A soft ribbon of light with a thin bright core, like real caustics.
        float coreA = 1.0 - smoothstep(0.0, 0.09, a), glowA = 1.0 - smoothstep(0.0, 0.3, a);
        float coreB = 1.0 - smoothstep(0.0, 0.07, b), glowB = 1.0 - smoothstep(0.0, 0.24, b);
        return clamp(max(coreA * 0.6 + glowA * 0.5, (coreB * 0.55 + glowB * 0.4) * 0.7), 0.0, 1.0);
      }
      // Raindrop rings: bold, expanding double rings. xy = surface slope,
      // z = ring brightness so they read even when the sea is flat grey.
      vec3 rainRings(vec2 p, float t) {
        vec3 g = vec3(0.0);
        for (int k = 0; k < 2; k++) {
          vec2 q = p * (1.0 + float(k) * 0.8) + float(k) * 5.3;
          vec2 cell = floor(q);
          vec2 f = fract(q) - 0.5;
          float h = wHash(cell + float(k) * 11.0);
          vec2 c = vec2(wHash(cell + 2.3), wHash(cell + 7.1)) * 0.4 - 0.2;
          float ph = fract(t * (0.75 + h * 0.5) + h);
          vec2 d = f - c;
          float r = length(d) + 1e-4;
          float on = step(h, uRain * 0.55);
          float x = (r - ph * 0.47) * 17.0;
          float ring = exp(-x * x) * (1.0 - ph) * on;
          float x2 = (r - ph * 0.3) * 19.0;
          float inner = exp(-x2 * x2) * (1.0 - ph) * (1.0 - ph) * on * 0.35;
          g.xy += (d / r) * (ring * -x + inner * -x2 * 0.7);
          g.z += ring + inner;
        }
        return g;
      }
      ` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
          float shore = shoreDistance(vWater.xz) - ${WATERLINE.toFixed(3)} + uTide * 1.3;
          float t = uTime;
          float wob = wNoise(vWater.xz * 0.9 + t * 0.15) - 0.5;
          // Depth: five flat colour steps from sand-glow shallows to open sea.
          // Contours wander a little so they look hand-painted, not measured.
          float depth01 = pow(clamp((shore + wob * 0.7) / 20.0, 0.0, 1.0), 0.62);
          depth01 += (wNoise(vWater.xz * 0.45 + vec2(t * 0.03, 0.0)) - 0.5) * 0.05;
          float banded = toon(clamp(depth01, 0.0, 1.0), 5.0);
          vec3 water = mix(uShallow, mix(uShallow, uMid, 0.6), smoothstep(0.0, 0.25, banded));
          water = mix(water, uMid, smoothstep(0.2, 0.5, banded));
          water = mix(water, mix(uMid, uDeep, 0.55), smoothstep(0.45, 0.75, banded));
          water = mix(water, uDeep, smoothstep(0.7, 1.0, banded));
          // A fine light seam where one colour step meets the next.
          float seam = 1.0 - smoothstep(0.0, 0.1, abs(fract(clamp(depth01, 0.0, 1.0) * 5.0) - 0.5) * 2.0 - 0.9);
          float shelf = 1.0 - smoothstep(0.0, 3.2, shore + wob * 0.35);
          water += vec3(0.03, 0.05, 0.045) * seam * (1.0 - smoothstep(0.1, 0.8, depth01)) * (1.0 - uNight);
          // Sunlit caustic web over the shallow shelf.
          float shelfWeb = 1.0 - smoothstep(0.7, 5.0, shore);
          if (shelfWeb > 0.01 && uNight < 0.95) {
            float web = causticWeb(vWater.xz, t);
            water += vec3(0.12, 0.2, 0.17) * web * shelfWeb * (1.0 - uNight) * (1.0 - uRain * 0.75) * (1.0 - uStorm * 0.5);
          }
          // Surf. A sheet of foam surges up the beach and slides back,
          // leaving lace behind; broken wave lines roll in behind it.
          float swashN = wNoise(vWater.xz * 0.28);
          float surge = 0.5 + 0.5 * sin(t * 0.9 + swashN * 6.2831 + 1.3);
          float lap = 0.08 + 0.3 * surge + uStorm * 0.18 + uRain * 0.05;
          float scallop = (wNoise(vWater.xz * 2.6 + vec2(0.0, t * 0.1)) - 0.5) * 0.2;
          float front = shore + scallop;
          float sheet = 1.0 - smoothstep(lap, lap + 0.1, front);
          float bubbles = smoothstep(0.5, 0.72, wNoise(vWater.xz * 7.5 + t * 0.2));
          float laceBand = (1.0 - smoothstep(0.0, 1.0, front - lap * 0.4)) * smoothstep(-0.1, 0.12, front);
          float lace = laceBand * bubbles * (0.45 + 0.55 * (1.0 - surge));
          float rowPhase = shore * 5.2 - t * 1.6 + wob * 2.6;
          float lines = smoothstep(0.8, 0.97, sin(rowPhase));
          lines *= smoothstep(0.36, 0.7, wNoise(vWater.xz * 2.4 + vec2(t * 0.2, -t * 0.15)));
          lines *= (1.0 - smoothstep(0.5, 2.6, shore)) * smoothstep(0.2, 0.55, shore);
          // Whitecaps on the crests, and in rough weather long wind streaks.
          float breakup = smoothstep(0.35, 0.7, wNoise(vWater.xz * 3.2 + vec2(t * 0.3, -t * 0.2)));
          float caps = smoothstep(0.55, 1.2, vCrest) * (0.15 + uStorm * 0.85) * breakup;
          vec2 wd = normalize(uWind + vec2(1e-4));
          vec2 ws = vec2(-wd.y, wd.x);
          float streakN = wNoise(vec2(dot(vWater.xz, wd) * 0.2 - t * 0.7, dot(vWater.xz, ws) * 1.5));
          float streaks = smoothstep(0.64, 0.84, streakN) * (uStorm * 0.9 + uRain * 0.22) * smoothstep(1.4, 5.0, shore);
          float foam = max(sheet, max(lace * 0.9, lines * 0.8));
          foam = max(foam, max(caps * smoothstep(0.5, 3.0, shore), streaks * 0.8));
          // Foam is bubbly, not flat white: faint blue-white cells.
          vec3 foamColor = mix(uFoam * vec3(0.84, 0.95, 0.98), uFoam, 0.45 + 0.55 * wNoise(vWater.xz * 11.0));
          diffuseColor.rgb = mix(water, foamColor, clamp(foam, 0.0, 1.0));
          float foamMask = foam;`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          // Moonlight spreads into a soft glitter path rather than hot spots.
          roughnessFactor = mix(0.07 + uStorm * 0.12 + uNight * 0.14, 0.6, foamMask);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          /* glsl */ `#include <normal_fragment_maps>
          // Wind ripples: two scrolling ripple fields; rain adds rings.
          vec2 rp = vWater.xz;
          vec2 g = vec2(0.0);
          g += vec2(cos(rp.x * 3.1 + rp.y * 1.7 - t * 2.4), cos(rp.y * 2.9 - rp.x * 1.3 - t * 2.0)) * 0.05;
          g += vec2(cos(rp.x * 7.3 - rp.y * 4.1 + t * 3.1), cos(rp.y * 6.7 + rp.x * 3.9 + t * 2.7)) * 0.025;
          g *= 0.6 + uWindStrength * 0.8 + uStorm;
          float ringFade = 1.0 - smoothstep(30.0, 90.0, length(vViewPosition));
          vec3 rr = vec3(0.0);
          if (uRain > 0.01) rr = rainRings(rp, t) * ringFade;
          g += rr.xy * 0.85 * uRain;
          g *= 1.0 - foamMask;
          normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          /* glsl */ `#include <emissivemap_fragment>
          // Sky reflection at grazing angles and a glitter path under the sun.
          vec3 V = normalize(vViewPosition);
          float fres = pow(1.0 - saturate(dot(normal, V)), 4.0);
          totalEmissiveRadiance += uSky * fres * 0.55 * (1.0 - foamMask);
          vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 R = reflect(-V, normal);
          float glint = pow(saturate(dot(R, sunView)), 900.0);
          float sparkle = smoothstep(0.55, 1.0, wNoise(vWater.xz * 9.0 + vec2(t * 1.7, -t * 1.3)));
          float sunUp = smoothstep(-0.02, 0.1, uSunDir.y);
          totalEmissiveRadiance += uSunColor * glint * (2.0 + sparkle * 9.0) * (1.0 - foamMask) * sunUp;
          // Painted twinkles: sparse little stars that blink on the lit sea.
          vec2 sp = vWater.xz * 2.0;
          vec2 sid = floor(sp);
          vec2 sd = fract(sp) - 0.5 - (vec2(wHash(sid + 1.7), wHash(sid + 4.3)) - 0.5) * 0.55;
          float sh = wHash(sid + 9.1);
          float blink = pow(max(0.0, sin(t * (1.1 + sh * 1.7) + sh * 50.0)), 16.0);
          float star = max(0.0, 1.0 - length(sd) * 7.5)
            + max(0.0, 1.0 - abs(sd.x) * 34.0 - abs(sd.y) * 3.0) * 0.55
            + max(0.0, 1.0 - abs(sd.y) * 34.0 - abs(sd.x) * 3.0) * 0.55;
          star *= step(0.7, sh) * blink;
          float viewFade = 1.0 - smoothstep(30.0, 85.0, length(vViewPosition));
          totalEmissiveRadiance += uSunColor * star * 2.6 * (1.0 - foamMask) * (1.0 - uNight) * (1.0 - uRain * 0.85) * sunUp * viewFade;
          // Rain rings catch the sky light; lightning lifts the whole sea.
          totalEmissiveRadiance += mix(uSky, vec3(1.0), 0.35) * rr.z * 0.13 * uRain * (1.0 - foamMask);
          totalEmissiveRadiance += vec3(0.55, 0.65, 0.9) * uFlash * (0.1 + fres * 0.6) * (1.0 - foamMask * 0.5);`,
        );
  };
  material.customProgramCacheKey = () => "little-planet-ocean-v3";
  const mesh = new THREE.Mesh(oceanGeometry(), material);
  mesh.name = "Little planet ocean";
  mesh.position.set(PLANET.x, SEA_LEVEL, PLANET.z);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.noSurface = true;
  mesh.userData.uniforms = uniforms;
  // Tides follow the island clock: two highs a day, a few centimetres.
  const palette = {
    deep: new THREE.Color("#15628c"),
    mid: new THREE.Color("#2593b0"),
    shallow: new THREE.Color("#58d0c4"),
    greyDeep: new THREE.Color("#244a6c"),
    greyMid: new THREE.Color("#3b7390"),
    greyShallow: new THREE.Color("#6aaeb6"),
  };
  const update = ({
    time,
    hour = 12,
    storm = 0,
    sun,
    sky,
    night = 0,
    overcast = 0,
    flash = 0,
  }) => {
    // Rain and storm turn the sea a heavier grey-green.
    uniforms.uDeep.value.lerpColors(
      palette.deep,
      palette.greyDeep,
      overcast * 0.85,
    );
    uniforms.uMid.value.lerpColors(
      palette.mid,
      palette.greyMid,
      overcast * 0.85,
    );
    uniforms.uShallow.value.lerpColors(
      palette.shallow,
      palette.greyShallow,
      overcast * 0.75,
    );
    uniforms.uTime.value = time;
    uniforms.uStorm.value = storm;
    uniforms.uTide.value = Math.sin(((hour - 3) / 12.4) * Math.PI * 2) * 0.05;
    surfaceUniforms.uSeaLevel.value = SEA_LEVEL + uniforms.uTide.value;
    if (sun) uniforms.uSunDir.value.copy(sun.direction);
    if (sun) uniforms.uSunColor.value.copy(sun.color);
    if (sky) uniforms.uSky.value.copy(sky);
    uniforms.uNight.value = night;
    uniforms.uFlash.value = flash;
    return uniforms.uTide.value;
  };
  return { mesh, uniforms, update, material };
}

/** Shared animated material for still water: the canal and the resort pool. */
export function stillWaterMaterial(color = "#4cb7c4") {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.08,
    metalness: 0,
  });
  material.userData.noSurface = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfTime = surfaceUniforms.uSurfTime;
    shader.uniforms.uRain = surfaceUniforms.uRain;
    shader.vertexShader =
      "varying vec3 vStill;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `vStill = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #include <project_vertex>`,
      );
    shader.fragmentShader =
      `uniform float uSurfTime; uniform float uRain; varying vec3 vStill;
      float sHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec2 stillRings(vec2 p, float t) {
        vec2 g = vec2(0.0);
        vec2 q = p * 3.0;
        vec2 cell = floor(q);
        vec2 f = fract(q) - 0.5;
        float h = sHash(cell);
        float ph = fract(t * (1.0 + h * 0.5) + h);
        vec2 d = f - (vec2(sHash(cell + 2.3), sHash(cell + 7.1)) * 0.3 - 0.15);
        float r = length(d) + 1e-4;
        float x = (r - ph * 0.42) * 28.0;
        return (d / r) * exp(-x * x) * (1.0 - ph) * -x * step(h, 0.25 + uRain);
      }\n` +
      shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        vec2 sg = vec2(cos(vStill.x * 5.0 + uSurfTime * 1.7), cos(vStill.z * 4.3 - uSurfTime * 1.4)) * 0.035;
        sg += stillRings(vStill.xz, uSurfTime) * (0.12 + uRain * 0.5);
        normal = normalize(normal + (viewMatrix * vec4(sg.x, 0.0, sg.y, 0.0)).xyz);`,
      );
  };
  material.customProgramCacheKey = () => "still-water-v1";
  return material;
}
