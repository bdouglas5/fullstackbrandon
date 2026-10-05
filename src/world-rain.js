import * as THREE from "three";
import { surfaceUniforms } from "./world-surface.js";
import { SHORES } from "./world-water.js";

// Screen-space ribbons need more opacity than the old line particles.
export const RAIN_OPACITY_GAIN = 1.8;

/**
 * Rain, drawn the way a handcrafted miniature would draw it.
 *
 *  - Streaks: long, soft, slightly chunky diagonal strokes. They are camera
 *    facing ribbons with a width in screen pixels, so they stay readable from
 *    the overview camera instead of collapsing into 1px noise.
 *  - Squalls: a few tall, drifting veils of heavier rain over the sea, which
 *    give the weather a visible front and the horizon some depth.
 *  - Splashes: bold double rings where drops hit water; only a tiny pit
 *    where they hit land (rings on grass look like stamps).
 *
 * Everything moves on the GPU from the shared clock and wind.
 */

// A world-anchored tile of particles that wraps around the viewed district:
// particles never follow the camera, but density stays where people look.
const WRAP = /* glsl */ `
vec2 wrapTile(vec2 seed, vec2 center, float size) {
  return center + (fract(seed - center / size) - 0.5) * size;
}
`;

const SHORE_GLSL = /* glsl */ `
uniform vec4 uShores[${SHORES.length}];
uniform float uRadii[${SHORES.length}];
float shoreDistance(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${SHORES.length}; i++) {
    vec2 q = abs(p - uShores[i].xy) - uShores[i].zw + uRadii[i];
    d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadii[i]);
  }
  return d;
}
`;

const shoreUniforms = () => ({
  uShores: {
    value: SHORES.map((s) => new THREE.Vector4(s.x, s.z, s.hx, s.hz)),
  },
  uRadii: { value: SHORES.map((s) => s.r) },
});

const HASH = /* glsl */ `
float rHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float rNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1, 0)), f.x),
             mix(rHash(i + vec2(0, 1)), rHash(i + vec2(1, 1)), f.x), f.y);
}
`;

export function rainStreaks(random) {
  const count = 6500;
  const seeds = new Float32Array(count * 4 * 4),
    corners = new Float32Array(count * 4 * 2),
    index = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const s = [random(), random(), random(), 0.8 + random() * 0.45];
    for (let v = 0; v < 4; v++) {
      seeds.set(s, (i * 4 + v) * 4);
      // x: 0 at the head of the streak, 1 at the tail. y: side of the ribbon.
      corners.set([v >> 1, v & 1 ? 1 : -1], (i * 4 + v) * 2);
    }
    index.set(
      [0, 1, 2, 2, 1, 3].map((n) => n + i * 4),
      i * 6,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3),
  );
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const uniforms = {
    uTime: { value: 0 },
    // Distance fallen, integrated on the CPU so a change in storm strength
    // changes speed smoothly instead of rewinding every drop.
    uFall: { value: 0 },
    uCenter: { value: new THREE.Vector2(4, 1) },
    uOpacity: { value: 0 },
    uWind: surfaceUniforms.uWindDir,
    uStorm: { value: 0 },
    uColor: { value: new THREE.Color("#d6e8f2") },
    uTile: { value: 34 },
    uLength: { value: 0.5 },
    uRes: { value: new THREE.Vector2(1440, 1000) },
    uWidth: { value: 1.7 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uFall, uStorm, uTile, uLength, uWidth;
      uniform vec2 uCenter, uWind, uRes;
      varying vec2 vUv; varying float vAlpha;
      ${WRAP}
      void main() {
        float top = 15.0;
        vec2 xz = wrapTile(aSeed.xy, uCenter, uTile);
        float fall = fract(aSeed.z + uFall * aSeed.w / top);
        float y = top - fall * top + 0.1;
        // Wind leans the whole sheet over; the head leads, the tail trails.
        float slant = 0.16 + uStorm * 0.42;
        vec2 drift = uWind * slant;
        vec3 head = vec3(xz.x + drift.x * (y - 0.4), y, xz.y + drift.y * (y - 0.4));
        float len = uLength * (0.75 + aSeed.x * 0.5) * (1.0 + uStorm * 0.5);
        vec3 tail = head + vec3(drift.x * len, len, drift.y * len);
        vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.0);
        vec4 ct = projectionMatrix * viewMatrix * vec4(tail, 1.0);
        float w = mix(ch.w, ct.w, aCorner.x);
        if (ch.w < 0.6 || ct.w < 0.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vUv = aCorner; return; }
        vec2 nh = ch.xy / ch.w, nt = ct.xy / ct.w;
        vec2 dp = (nt - nh) * 0.5 * uRes;
        float L = length(dp);
        vec2 dir = L > 1e-3 ? dp / L : vec2(0.0, 1.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        vec4 c = mix(ch, ct, aCorner.x);
        // Nearer streaks are a little bolder, which sells the depth.
        float bold = mix(1.35, 0.8, smoothstep(6.0, 70.0, w));
        vec2 ndc = c.xy / c.w + nrm * aCorner.y * uWidth * bold * 0.5 * 2.0 / uRes;
        gl_Position = vec4(ndc * c.w, c.z, c.w);
        vUv = aCorner;
        // Streaks are born and die softly, and thin out into the distance.
        float life = smoothstep(0.0, 0.07, fall) * (1.0 - smoothstep(0.9, 1.0, fall));
        float strength = mix(0.5, 1.0, fract(aSeed.x * 91.7 + aSeed.y * 37.3));
        vAlpha = life * strength * (1.0 - smoothstep(70.0, 150.0, w)) * smoothstep(1.5, 5.0, w);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor;
      varying vec2 vUv; varying float vAlpha;
      void main() {
        // Bright, rounded head fading to a soft tail; feathered across.
        float along = pow(clamp(1.0 - vUv.x, 0.0, 1.0), 0.85);
        float across = 1.0 - smoothstep(0.25, 1.0, abs(vUv.y));
        float a = uOpacity * vAlpha * along * across;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const rain = new THREE.Mesh(geometry, material);
  rain.name = "Environmental rain";
  rain.visible = false;
  rain.frustumCulled = false;
  rain.userData.noSurface = true;
  return { rain, uniforms };
}

/** Tall veils of heavier rain that drift across the sea with the wind. */
export function squallCurtains(random) {
  const count = 14;
  const seeds = new Float32Array(count * 4 * 4),
    corners = new Float32Array(count * 4 * 2),
    index = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const s = [random(), random(), 0.6 + random() * 0.8, random()];
    for (let v = 0; v < 4; v++) {
      seeds.set(s, (i * 4 + v) * 4);
      corners.set([v & 1 ? 1 : -1, v >> 1], (i * 4 + v) * 2);
    }
    index.set(
      [0, 1, 2, 2, 1, 3].map((n) => n + i * 4),
      i * 6,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3),
  );
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uStorm: { value: 0 },
    uWind: surfaceUniforms.uWindDir,
    uColor: { value: new THREE.Color("#a9bcc6") },
    uPlanet: { value: new THREE.Vector2(5, 2) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uStorm; uniform vec2 uWind, uPlanet;
      varying vec2 vUv; varying vec3 vWorld; varying float vSeed; varying float vSize;
      ${WRAP}
      void main() {
        // Each veil rides the wind around a 150-unit ring and wraps.
        float ring = 150.0;
        float speed = (0.9 + aSeed.w * 0.9 + uStorm * 1.4);
        vec2 seed = aSeed.xy + uWind * uTime * speed / ring;
        vec2 xz = wrapTile(seed, uPlanet, ring);
        float halfW = 9.0 + aSeed.z * 9.0;
        float height = 9.0 + aSeed.z * 5.0;
        vec3 center = vec3(xz.x, -1.2, xz.y);
        vec3 toCam = cameraPosition - center;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4));
        vec3 p = center + right * aCorner.x * halfW + vec3(0.0, aCorner.y * height, 0.0);
        vWorld = p;
        vUv = vec2(aCorner.x, aCorner.y);
        vSeed = aSeed.x * 31.7 + aSeed.y * 17.1;
        vSize = halfW;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAmount, uStorm; uniform vec3 uColor; uniform vec2 uWind;
      varying vec2 vUv; varying vec3 vWorld; varying float vSeed; varying float vSize;
      ${HASH}
      void main() {
        vec2 side = vec2(-uWind.y, uWind.x);
        float across = dot(vWorld.xz, side);
        // Falling rain: stretched noise, fast along the drops, fine across.
        float fall = rNoise(vec2(across * 2.6 + vSeed, vWorld.y * 0.28 + uTime * 3.4));
        float fine = rNoise(vec2(across * 6.1 + vSeed * 3.0, vWorld.y * 0.5 + uTime * 5.1));
        float sheet = mix(0.35, 1.0, fall) * mix(0.7, 1.0, fine);
        // The veil's own body: a slow, soft mask so it has ragged edges.
        float body = smoothstep(0.18, 0.7, rNoise(vec2(across * 0.07 + vSeed, uTime * 0.03 + vSeed)));
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x));
        float base = smoothstep(-0.05, 0.25, vWorld.y + 0.7);
        float top = 1.0 - smoothstep(0.55, 1.0, vUv.y);
        float camDist = length(vWorld - cameraPosition);
        // Veils fade in front of the camera so they never wall off the view.
        float nearFade = smoothstep(14.0, 34.0, camDist);
        float a = uAmount * sheet * body * edge * base * top * nearFade * (0.34 + uStorm * 0.2);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Squall veils";
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.noSurface = true;
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}

/** Drop impacts: bold double rings on water, a tiny bright pit on land. */
export function splashRings(random) {
  const count = 1500;
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++)
    seeds.set([random(), random(), random(), 0.7 + random() * 0.6], i * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uAmount: { value: 0 },
    uSea: surfaceUniforms.uSeaLevel,
    uScale: { value: 600 },
    uTile: { value: 22 },
    ...shoreUniforms(),
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uSea, uScale, uTile; uniform vec2 uCenter;
      varying float vLife; varying float vLand;
      ${WRAP}
      ${SHORE_GLSL}
      void main() {
        float phase = uTime * aSeed.w * 1.4 + aSeed.z;
        float cycle = fract(phase);
        float n = floor(phase);
        // Each splash jumps to a new spot every cycle.
        vec2 jitter = vec2(fract(sin(n * 12.9 + aSeed.x * 78.2) * 437.5),
                           fract(sin(n * 7.3 + aSeed.y * 39.1) * 913.1));
        vec2 xz = wrapTile(aSeed.xy + jitter * 0.07, uCenter, uTile);
        float land = step(shoreDistance(xz), -0.4);
        // Only some drops are drawn on land; they are tiny, so keep few.
        float keep = mix(1.0, step(0.55, fract(aSeed.x * 53.1 + n * 0.37)), land);
        float y = mix(uSea + 0.02, 0.445, land);
        vLife = cycle;
        vLand = land;
        vec4 mv = viewMatrix * vec4(xz.x, y + 0.01, xz.y, 1.0);
        gl_Position = keep > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
        float grow = mix(0.1 + cycle * 0.34, 0.05 + cycle * 0.05, land);
        gl_PointSize = clamp(grow * uScale / max(1.0, -mv.z), 1.0, 46.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; varying float vLife; varying float vLand;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        c.y *= 2.3; // seen from above-and-aside, rings are flattened
        float r = length(c) * 2.0;
        float fade = (1.0 - vLife) * (1.0 - vLife);
        // Water: a bold leading ring and a thinner one trailing behind it.
        float lead = r - (0.35 + vLife * 0.62);
        float ring1 = exp(-lead * lead * 190.0);
        float lag = r - (0.12 + vLife * 0.5);
        float ring2 = exp(-lag * lag * 300.0) * 0.55;
        float water = (ring1 + ring2) * fade;
        // Land: a quick bright pit, then nothing.
        float pit = (1.0 - smoothstep(0.0, 0.5, r)) * (1.0 - smoothstep(0.0, 0.3, vLife));
        float a = mix(water * 0.75, pit * 0.7, vLand) * uAmount;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.93, 0.97, 1.0), a);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Rain splashes";
  points.frustumCulled = false;
  points.visible = false;
  return { points, uniforms };
}
