import * as THREE from "three";
import { environmentRandom } from "./world-environment.js";
import { surfaceUniforms } from "./world-surface.js";
import { createSky } from "./world-sky.js";
import {
  rainStreaks,
  squallCurtains,
  splashRings,
  RAIN_OPACITY_GAIN,
} from "./world-rain.js";

/**
 * Weather and air for the little planet. Everything that moves in the air is
 * animated on the GPU from a handful of shared uniforms: rain and splashes,
 * mist, sun shafts, dust, blown leaves and gulls. The CPU only eases the
 * weather state and writes those uniforms once per frame.
 */

// A world-anchored tile of particles that wraps around the viewed district:
// particles never follow the camera, but density stays where people look.
const WRAP = /* glsl */ `
vec2 wrapTile(vec2 seed, vec2 center, float size) {
  return center + (fract(seed - center / size) - 0.5) * size;
}
`;

// Ground mist: soft camera-facing puffs hugging the water and low streets.
function mistSystem(random) {
  const count = 160;
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++)
    seeds.set([random(), random(), random(), random()], i * 4);
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
    uColor: { value: new THREE.Color("#e9eef0") },
    uWind: surfaceUniforms.uWindDir,
    uScale: { value: 600 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uScale; uniform vec2 uCenter, uWind;
      varying float vSeed;
      ${WRAP}
      void main() {
        vec2 xz = wrapTile(aSeed.xy + uWind * uTime * 0.004 * (0.6 + aSeed.w), uCenter, 46.0);
        float y = -0.45 + aSeed.z * 1.6 + sin(uTime * 0.2 + aSeed.w * 6.0) * 0.12;
        vSeed = aSeed.w;
        vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((1.8 + aSeed.w * 1.8) * uScale / max(1.0, -mv.z), 2.0, 420.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount, uTime; uniform vec3 uColor; varying float vSeed;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float puff = exp(-r * r * 3.2) * (1.0 - smoothstep(0.75, 1.0, r));
        float wisp = 0.75 + 0.25 * sin(c.x * 9.0 + uTime * 0.3 + vSeed * 20.0) * sin(c.y * 7.0 - uTime * 0.25);
        float a = puff * wisp * uAmount * 0.16;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Rolling ground mist";
  points.frustumCulled = false;
  points.renderOrder = 5;
  points.visible = false;
  return { points, uniforms };
}

// Sun shafts: tall additive sheets aligned with the light, turned toward the
// camera around their own axis, strongest in the golden hours.
function shaftSystem(random) {
  const count = 14;
  const positions = [],
    uvs = [],
    seeds = [],
    index = [];
  for (let i = 0; i < count; i++) {
    const seed = [random(), random(), 0.6 + random() * 1.3, random()];
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      positions.push(0, 0, 0);
      uvs.push(u, v);
      seeds.push(...seed);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 4));
  geometry.setIndex(index);
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uLight: { value: new THREE.Vector3(0, 1, 0) },
    uColor: { value: new THREE.Color("#ffd9a0") },
    uAmount: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime; uniform vec2 uCenter; uniform vec3 uLight;
      varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed.w;
        vec2 base = uCenter + (aSeed.xy - 0.5) * vec2(30.0, 24.0);
        base += vec2(sin(uTime * 0.03 + aSeed.w * 9.0), cos(uTime * 0.025 + aSeed.w * 7.0)) * 1.5;
        vec3 root = vec3(base.x, 0.3, base.y);
        vec3 axis = normalize(uLight);
        vec3 toCam = normalize(cameraPosition - root);
        vec3 side = normalize(cross(axis, toCam));
        float len = 9.0 + aSeed.w * 4.0;
        vec3 p = root + axis * uv.y * len + side * (uv.x - 0.5) * aSeed.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAmount; uniform vec3 uColor;
      varying vec2 vUv; varying float vSeed;
      void main() {
        float across = exp(-pow((vUv.x - 0.5) * 3.2, 2.0));
        float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float shimmer = 0.6 + 0.4 * sin(uTime * 0.35 + vSeed * 31.0 + vUv.y * 3.0);
        float a = across * along * shimmer * uAmount;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Sun shafts";
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.visible = false;
  return { mesh, uniforms };
}

// Floating specks: sunlit dust and pollen by day, blown leaves in gusts.
function driftSystem(random) {
  const count = 520;
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++)
    seeds.set([random(), random(), random(), random()], i * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uDust: { value: 0 },
    uLeaves: { value: 0 },
    uWind: surfaceUniforms.uWindDir,
    uWindStrength: surfaceUniforms.uWindStrength,
    uLight: { value: new THREE.Color("#ffe2b0") },
    uScale: { value: 600 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uWindStrength, uScale; uniform vec2 uCenter, uWind;
      varying float vLeaf; varying float vSpin; varying float vSeed;
      ${WRAP}
      void main() {
        vLeaf = step(0.82, aSeed.w);
        vSeed = aSeed.z;
        float speed = mix(0.08, 1.8 + uWindStrength * 2.5, vLeaf);
        vec2 xz = wrapTile(aSeed.xy + uWind * uTime * speed * 0.035, uCenter, 26.0);
        float y = 0.55 + aSeed.z * mix(3.5, 2.2, vLeaf)
          + sin(uTime * (0.5 + aSeed.w) + aSeed.x * 20.0) * mix(0.25, 0.5, vLeaf);
        xz += vec2(sin(uTime * 0.7 + aSeed.y * 30.0), cos(uTime * 0.6 + aSeed.x * 25.0)) * 0.3;
        vSpin = uTime * (2.0 + aSeed.y * 3.0) + aSeed.x * 6.28;
        vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(mix(0.016, 0.05, vLeaf) * uScale / max(1.0, -mv.z), 1.0, 26.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDust, uLeaves, uTime; uniform vec3 uLight;
      varying float vLeaf; varying float vSpin; varying float vSeed;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (vLeaf > 0.5) {
          // A tumbling leaf: a rotated almond shape that flips edge-on.
          float s = sin(vSpin), k = cos(vSpin);
          vec2 q = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
          q.x /= max(0.15, abs(sin(vSpin * 0.7)));
          float leaf = 1.0 - smoothstep(0.2, 0.26, length(q * vec2(1.0, 2.1)));
          if (leaf * uLeaves < 0.05) discard;
          vec3 tint = mix(vec3(0.42, 0.62, 0.25), vec3(0.85, 0.66, 0.25), vSeed);
          gl_FragColor = vec4(tint, leaf * uLeaves);
        } else {
          float r = length(c) * 2.0;
          float speck = exp(-r * r * 4.0);
          float twinkle = 0.5 + 0.5 * sin(uTime * 2.3 + vSeed * 40.0);
          float a = speck * uDust * twinkle;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uLight, a);
        }
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Sunlit dust and blown leaves";
  points.frustumCulled = false;
  points.visible = false;
  return { points, uniforms };
}

// Gulls wheel over the water in loose circles, flapping and gliding.
function gullSystem(random) {
  const count = 14;
  const wing = new THREE.BufferGeometry();
  // A soft "M": body point plus two wing panels, flapped in the shader.
  wing.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0.12, -0.42, 0.02, -0.04, 0, 0, -0.08, 0, 0, 0.12, 0, 0, -0.08,
        0.42, 0.02, -0.04,
      ],
      3,
    ),
  );
  wing.setAttribute(
    "aWing",
    new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 1], 1),
  );
  const geometry = new THREE.InstancedBufferGeometry().copy(wing);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++)
    seeds.set([random(), random(), random(), random()], i * 4);
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#fbfaf4") },
    uShade: { value: new THREE.Color("#8a96a0") },
    uLight: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; attribute float aWing;
      uniform float uTime;
      varying float vWing;
      void main() {
        vec2 centers[4] = vec2[](vec2(-4.0, 16.0), vec2(22.0, 22.0), vec2(-18.0, -8.0), vec2(16.0, -16.0));
        vec2 c = centers[int(aSeed.x * 3.99)];
        float radius = 4.0 + aSeed.y * 7.0;
        float speed = (0.18 + aSeed.z * 0.12) * (aSeed.w > 0.5 ? 1.0 : -1.0);
        float a = uTime * speed + aSeed.w * 6.28;
        vec3 pos = vec3(c.x + cos(a) * radius, 3.5 + aSeed.z * 3.0 + sin(uTime * 0.4 + aSeed.x * 9.0) * 0.6, c.y + sin(a) * radius);
        vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a)) * sign(speed));
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
        // Flap in bursts, then glide with wings slightly raised.
        float burst = smoothstep(0.2, 0.8, sin(uTime * 0.6 + aSeed.y * 12.0));
        float flap = sin(uTime * 9.0 + aSeed.x * 20.0) * 0.32 * burst + 0.08;
        vec3 local = position * 0.9;
        local.y += aWing * flap * 0.9 * abs(position.x) / 0.42;
        vWing = aWing;
        vec3 world = pos + right * local.x + vec3(0.0, local.y, 0.0) + fwd * local.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uShade; uniform float uLight; varying float vWing;
      void main() {
        vec3 c = mix(uColor, uShade, vWing * 0.35);
        gl_FragColor = vec4(c * uLight, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Wheeling gulls";
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// Chimney smoke: soft puffs that rise, swell and lean downwind.
function smokeSystem(chimneys) {
  const per = 20;
  const count = Math.max(1, chimneys.length * per);
  const base = new Float32Array(count * 3),
    seeds = new Float32Array(count * 2);
  chimneys.forEach((c, i) => {
    for (let k = 0; k < per; k++) {
      c.position.toArray(base, (i * per + k) * 3);
      seeds.set([k / per, i * 0.37], (i * per + k) * 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 2));
  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0.5 },
    uColor: { value: new THREE.Color("#eeeae4") },
    uWind: surfaceUniforms.uWindDir,
    uWindStrength: surfaceUniforms.uWindStrength,
    uScale: { value: 600 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime, uWindStrength, uScale; uniform vec2 uWind;
      varying float vAge; varying float vSeed;
      void main() {
        float age = fract(uTime * 0.11 + aSeed.x + aSeed.y);
        vec3 p = position;
        p.y += age * (1.5 - uWindStrength * 0.6);
        p.xz += uWind * (0.15 + uWindStrength * 1.8) * age * age * 1.6;
        p.x += sin(uTime * 0.8 + age * 6.0 + aSeed.y * 9.0) * 0.08 * age;
        p.z += cos(uTime * 0.7 + age * 5.0 + aSeed.y * 7.0) * 0.08 * age;
        vAge = age;
        vSeed = aSeed.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.13 + age * 0.46) * uScale / max(1.0, -mv.z), 1.0, 220.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount, uTime; uniform vec3 uColor;
      varying float vAge; varying float vSeed;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float puff = exp(-r * r * 2.6) * (1.0 - smoothstep(0.8, 1.0, r));
        float life = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge));
        float a = puff * life * uAmount * 0.75;
        if (a < 0.006) discard;
        gl_FragColor = vec4(uColor * (0.92 + 0.08 * sin(vSeed * 20.0)), a);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Chimney smoke";
  points.frustumCulled = false;
  points.userData.noSurface = true;
  return { points, uniforms };
}

export function createAtmosphere(
  scene,
  world,
  ocean,
  sun,
  ambient,
  extras = {},
) {
  const random = environmentRandom(52918);
  const sky = createSky(scene);
  const { rain, uniforms: rainUniforms } = rainStreaks(random);
  const splash = splashRings(random);
  const squall = squallCurtains(random);
  const mist = mistSystem(random);
  const shafts = shaftSystem(random);
  const drift = driftSystem(random);
  const gulls = gullSystem(random);
  const smoke = smokeSystem(world.chimneys || []);
  scene.add(
    rain,
    splash.points,
    squall.mesh,
    mist.points,
    shafts.mesh,
    drift.points,
    gulls.mesh,
    smoke.points,
  );
  const points = (count, color, size, spread, height) => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.sin(i * 13.2) * spread;
      pos[i * 3 + 1] = height + (Math.sin(i * 19) + 1) * height * 0.2;
      pos[i * 3 + 2] = Math.cos(i * 8.7) * spread;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    p.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `float halo = 1.0 - smoothstep(0.08, 0.5, length(gl_PointCoord - 0.5));
        diffuseColor.a *= halo;
        #include <opaque_fragment>`,
      );
    };
    p.material.customProgramCacheKey = () => "soft-atmosphere-points-v1";
    scene.add(p);
    return p;
  };
  const fireflies = points(140, "#e6efa0", 0.035, 22, 0.8);
  fireflies.name = "Fireflies";
  // Fireflies belong over the lawns of the main island, never the open sea.
  {
    const p = fireflies.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setXYZ(
        i,
        -10 + random() * 28,
        0.55 + random() * 0.8,
        -10 + random() * 20,
      );
    p.needsUpdate = true;
  }
  const cloudMaterial = world.materials?.get?.("#f4f5e9");
  const cloudBase = new THREE.Color("#f6f4ea");

  const boltGeometry = new THREE.BufferGeometry();
  const boltPositions = new Float32Array(8 * 3);
  boltGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(boltPositions, 3),
  );
  const bolt = new THREE.Line(
    boltGeometry,
    new THREE.LineBasicMaterial({
      color: "#ecf4ff",
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
  );
  bolt.name = "Distant lightning";
  bolt.frustumCulled = false;
  scene.add(bolt);
  let boltSlot = -1;
  const tmpColor = new THREE.Color(),
    groundTint = new THREE.Color(),
    hemiSky = new THREE.Color(),
    nightGround = new THREE.Color("#1f3048");
  const grade = { warmth: 0, saturation: 1, contrast: 1, exposure: 1 };
  let rainIntensity = 0,
    stormIntensity = 0,
    fogIntensity = 0,
    wetness = 0,
    daylight = null,
    skyHour = null,
    windAngle = null,
    windStrength = 0.3,
    flash = 0;
  return {
    sky,
    update(s, time, dt, subject, reducedMotion, camera = null, size = null) {
      const clock = s?.world || {
        light: 1,
        weather: s?.storm ? "storm" : "clear",
        phase: "day",
        hour: 12,
      };
      const targetDaylight = Math.max(
        0.12,
        clock.light ?? (clock.phase === "night" ? 0.15 : 1),
      );
      const step = Math.max(0, dt);
      const weather = s?.storm ? "storm" : clock.weather;
      const wet = weather === "rain" || weather === "storm",
        foggy = weather === "fog";
      // Ease the weather itself, not just the backdrop: the rain keeps falling
      // as it disappears, and light, water and wind all settle with it.
      rainIntensity = THREE.MathUtils.damp(
        rainIntensity,
        wet ? 1 : 0,
        0.85,
        step,
      );
      stormIntensity = THREE.MathUtils.damp(
        stormIntensity,
        weather === "storm" ? 1 : 0,
        0.65,
        step,
      );
      fogIntensity = THREE.MathUtils.damp(
        fogIntensity,
        foggy ? 1 : 0,
        0.7,
        step,
      );
      // Surfaces soak up quickly and dry slowly once the rain stops.
      wetness = THREE.MathUtils.damp(
        wetness,
        rainIntensity > 0.15 ? Math.min(1, rainIntensity * 1.1) : 0,
        rainIntensity > wetness ? 0.6 : 0.12,
        step,
      );
      daylight = THREE.MathUtils.damp(
        daylight ?? targetDaylight,
        targetDaylight,
        1.4,
        step,
      );
      const night = 1 - daylight;
      const targetHour = clock.hour ?? (clock.phase === "night" ? 23 : 12);
      if (skyHour === null || reducedMotion) skyHour = targetHour;
      else {
        const delta = ((targetHour - skyHour + 36) % 24) - 12;
        skyHour = (skyHour + delta * (1 - Math.exp(-step * 1.4)) + 24) % 24;
      }
      const hour = skyHour;

      // Wind: a slowly veering direction, stronger in rain, gusty in storms.
      const baseAngle =
        2.6 + Math.sin(time * 0.013) * 0.5 + (s?.world?.day || 0) * 0.9;
      windAngle =
        windAngle === null
          ? baseAngle
          : windAngle +
            Math.atan2(
              Math.sin(baseAngle - windAngle),
              Math.cos(baseAngle - windAngle),
            ) *
              (1 - Math.exp(-step * 0.3));
      windStrength = THREE.MathUtils.damp(
        windStrength,
        0.22 + rainIntensity * 0.3 + stormIntensity * 0.75,
        0.5,
        step,
      );
      const gust = reducedMotion
        ? 0
        : Math.max(0, Math.sin(time * 0.31) * Math.sin(time * 0.17 + 1.3)) *
          (0.25 + stormIntensity * 0.9);
      surfaceUniforms.uWindDir.value.set(
        Math.cos(windAngle),
        Math.sin(windAngle),
      );
      surfaceUniforms.uWindStrength.value = reducedMotion ? 0 : windStrength;
      surfaceUniforms.uGust.value = gust;
      surfaceUniforms.uSurfTime.value = reducedMotion ? 0 : time;
      surfaceUniforms.uWetness.value = wetness;
      surfaceUniforms.uRain.value = reducedMotion ? 0 : rainIntensity;

      // Sky and the key light.
      const overcast = Math.min(
        1,
        rainIntensity * 0.8 +
          stormIntensity * 0.3 +
          (weather === "cloudy" ? 0.65 : 0),
      );
      const light = sky.update({
        hour,
        overcast,
        foggy: fogIntensity,
        time: reducedMotion ? 0 : time,
        dt: step,
        camera,
      });
      // Lightning: brief double flickers far apart, storm only.
      if (!reducedMotion && weather === "storm" && stormIntensity > 0.5) {
        const slot = Math.floor(time / 7.3);
        const local = time - slot * 7.3;
        const fire = Math.sin(slot * 91.7) > 0.2;
        flash = fire
          ? Math.max(0, 1 - Math.abs(local - 0.15) / 0.07) +
            Math.max(0, 1 - Math.abs(local - 0.42) / 0.05) * 0.7
          : 0;
      } else flash = 0;
      const currentSlot = Math.floor(time / 7.3);
      if (flash > 0 && currentSlot !== boltSlot) {
        boltSlot = currentSlot;
        const randomBolt = environmentRandom(currentSlot + 9041);
        const x = -35 + randomBolt() * 80;
        for (let i = 0; i < 8; i++) {
          boltPositions[i * 3] =
            x + (i === 0 || i === 7 ? 0 : (randomBolt() - 0.5) * 3);
          boltPositions[i * 3 + 1] = 19 * (1 - i / 7);
          boltPositions[i * 3 + 2] = -32;
        }
        boltGeometry.attributes.position.needsUpdate = true;
      }
      bolt.visible = flash > 0;
      bolt.material.opacity = Math.min(1, flash);
      if (scene.background?.isColor) scene.background.copy(light.horizon);
      if (scene.fog) {
        scene.fog.color.copy(light.horizon).lerp(light.zenith, 0.15);
        scene.fog.near = 95 - fogIntensity * 62 - rainIntensity * 45;
        scene.fog.far = 230 - fogIntensity * 125 - rainIntensity * 80;
      }
      sky.uniforms.uZenith.value.addScalar(flash * 0.35);
      sky.uniforms.uHorizon.value.addScalar(flash * 0.25);
      sun.position.copy(light.lightDirection);
      sun.color.copy(light.lightColor);
      sun.intensity =
        light.lightIntensity *
          Math.max(
            0.12,
            1 -
              rainIntensity * 0.62 -
              stormIntensity * 0.22 -
              fogIntensity * 0.35,
          ) +
        flash * 2.5;
      // Overcast light is diffuse: shadows soften as the cloud thickens.
      if (sun.shadow)
        sun.shadow.intensity = 0.82 * (1 - overcast * 0.6 - fogIntensity * 0.3);
      // Fill light: sky above, warm bounce below; brighter under overcast.
      hemiSky
        .copy(light.zenith)
        .lerp(light.horizon, 0.45)
        .lerp(new THREE.Color("#ffffff"), 0.25);
      groundTint
        .set("#7c8f6a")
        .lerp(light.horizon, 0.35)
        .lerp(nightGround, night * 0.8);
      ambient.color.copy(hemiSky);
      ambient.groundColor.copy(groundTint);
      ambient.intensity =
        0.22 + daylight * 0.42 + overcast * 0.38 + flash * 1.2;
      scene.environmentIntensity = 0.04 + daylight * (0.52 + overcast * 0.12);
      surfaceUniforms.uRimColor.value
        .copy(light.horizon)
        .lerp(light.zenith, 0.3);
      surfaceUniforms.uRimStrength.value =
        0.12 + daylight * 0.16 + light.golden * 0.18;

      // Water.
      const tide =
        extras.water?.update({
          time: reducedMotion ? 0 : time,
          hour,
          storm: stormIntensity,
          sun: { direction: light.sunDirection, color: light.lightColor },
          sky: tmpColor.copy(light.horizon).lerp(light.zenith, 0.35),
          night: light.night,
          overcast,
          flash,
          lightningId: boltSlot,
        }) ?? 0;
      if (!extras.water && ocean?.material) {
        ocean.material.roughness = 0.42 - rainIntensity * 0.12;
      }

      // Rain, splashes and mist live around the viewed district.
      const center = subject || { x: 4, z: 1 };
      // Pixels per world unit at distance 1 for the 36° camera: particle
      // sizes below are in world units.
      const scale =
        (size ? size.height : 900) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera?.fov ?? 36) / 2));
      // How far the viewer is from what they are looking at decides how much
      // sky the rain must fill: wide at the overview, tight when zoomed in.
      const lookDistance = camera
        ? camera.position.distanceTo(
            new THREE.Vector3(center.x, center.y || 0, center.z),
          )
        : 30;
      const pixelHeight = size ? size.height : 900;
      // Opacity remains the public dial (tests and diagnostics read it); the
      // ribbons are drawn a little stronger than the old hairlines were.
      rain.material.opacity = rainIntensity * (0.34 + stormIntensity * 0.22);
      rain.visible = rain.material.opacity > 0.001;
      rainUniforms.uOpacity.value = rain.material.opacity * RAIN_OPACITY_GAIN;
      rainUniforms.uStorm.value = stormIntensity;
      if (!reducedMotion) {
        rainUniforms.uTime.value = time;
        // Always falls forward; a clock jump or storm change never reverses it.
        rainUniforms.uFall.value +=
          Math.min(step, 0.1) * (11 + stormIntensity * 6);
      }
      rainUniforms.uCenter.value.set(center.x, center.z);
      rainUniforms.uTile.value = THREE.MathUtils.clamp(
        lookDistance * 0.85,
        16,
        46,
      );
      rainUniforms.uLength.value = THREE.MathUtils.clamp(
        0.36 + lookDistance * 0.0075,
        0.4,
        0.78,
      );
      rainUniforms.uRes.value.set(
        pixelHeight * (camera?.aspect ?? 1.44),
        pixelHeight,
      );
      rainUniforms.uWidth.value = Math.max(1.3, pixelHeight / 560);
      rainUniforms.uColor.value
        .copy(light.horizon)
        .lerp(new THREE.Color("#ffffff"), 0.6);
      splash.points.visible = rain.visible && !reducedMotion;
      splash.uniforms.uAmount.value = rainIntensity;
      splash.uniforms.uTime.value = time;
      splash.uniforms.uCenter.value.set(center.x, center.z);
      splash.uniforms.uScale.value = scale;
      splash.uniforms.uTile.value = THREE.MathUtils.clamp(
        lookDistance * 0.5,
        14,
        34,
      );
      // Squall veils: heavier rain sheeting across the sea, strongest in storms.
      const squallAmount = reducedMotion
        ? 0
        : rainIntensity * (0.55 + stormIntensity * 0.45);
      squall.mesh.visible = squallAmount > 0.01;
      squall.uniforms.uAmount.value = squallAmount;
      squall.uniforms.uStorm.value = stormIntensity;
      squall.uniforms.uTime.value = time;
      squall.uniforms.uColor.value
        .copy(light.horizon)
        .lerp(light.zenith, 0.25)
        .multiplyScalar(0.8 + flash * 1.4);
      const morning =
        THREE.MathUtils.smoothstep(light.elevation, -6, 2) *
        (1 - THREE.MathUtils.smoothstep(light.elevation, 6, 18)) *
        (hour < 12 ? 1 : 0.35);
      const mistAmount = Math.min(
        1,
        fogIntensity + morning * 0.7 + rainIntensity * 0.35,
      );
      mist.points.visible = mistAmount > 0.01;
      mist.uniforms.uAmount.value = mistAmount;
      mist.uniforms.uTime.value = reducedMotion ? 0 : time;
      mist.uniforms.uCenter.value.set(center.x, center.z);
      mist.uniforms.uScale.value = scale;
      mist.uniforms.uColor.value
        .copy(light.horizon)
        .lerp(new THREE.Color("#ffffff"), 0.35 * daylight);
      // Shafts: golden hours and the bright spell just after rain.
      const afterRain = wetness * (1 - rainIntensity);
      const shaftAmount =
        (0.06 + light.golden * 0.7 + afterRain * 0.45 + mistAmount * 0.2) *
        (1 - overcast * 0.9) *
        (1 - light.night) *
        0.2;
      // Shafts are a close-up effect; from the overview they read as stripes.
      const viewDistance = camera
        ? camera.position.distanceTo(
            new THREE.Vector3(center.x, center.y || 0, center.z),
          )
        : 12;
      const nearShafts =
        shaftAmount * (1 - THREE.MathUtils.smoothstep(viewDistance, 22, 48));
      shafts.mesh.visible = nearShafts > 0.003;
      shafts.uniforms.uAmount.value = nearShafts;
      shafts.uniforms.uTime.value = reducedMotion ? 0 : time;
      shafts.uniforms.uCenter.value.set(center.x, center.z);
      shafts.uniforms.uLight.value
        .copy(light.sunDirection)
        .setY(Math.max(0.35, light.sunDirection.y));
      shafts.uniforms.uColor.value.copy(light.lightColor);
      drift.points.visible = !reducedMotion;
      drift.uniforms.uTime.value = time;
      drift.uniforms.uCenter.value.set(center.x, center.z);
      drift.uniforms.uDust.value =
        (0.25 + light.golden * 0.6) * daylight * (1 - overcast);
      drift.uniforms.uLeaves.value =
        THREE.MathUtils.clamp(windStrength * 1.2 + gust * 0.8 - 0.3, 0, 1) *
        daylight;
      drift.uniforms.uLight.value.copy(light.lightColor);
      drift.uniforms.uScale.value = scale;
      // Hearths are lit in the cool hours; smoke greys in rain, warms at dusk.
      smoke.points.visible = !reducedMotion && !!world.chimneys?.length;
      smoke.uniforms.uTime.value = time;
      smoke.uniforms.uScale.value = scale;
      smoke.uniforms.uAmount.value =
        0.55 + light.golden * 0.35 + light.night * 0.3 + rainIntensity * 0.15;
      // A soft blue-grey reads against both cream walls and blue water.
      smoke.uniforms.uColor.value
        .set("#a9b0b8")
        .lerp(light.lightColor, 0.2)
        .multiplyScalar(0.4 + daylight * 0.5);
      gulls.mesh.visible =
        !reducedMotion && stormIntensity < 0.6 && daylight > 0.3;
      gulls.uniforms.uTime.value = time;
      gulls.uniforms.uLight.value = 0.45 + daylight * 0.6;
      // Clouds pick up the sky: warm at sunrise and sunset, grey in rain.
      if (cloudMaterial) {
        cloudMaterial.color
          .copy(cloudBase)
          .lerp(light.lightColor, 0.25 + light.golden * 0.35)
          .lerp(new THREE.Color("#8d969c"), overcast * 0.6)
          .multiplyScalar(0.35 + daylight * 0.65);
        cloudMaterial.emissive
          ?.copy(light.horizon)
          .multiplyScalar(0.12 + flash * 0.5);
      }
      fireflies.material.opacity = night * (0.9 - rainIntensity * 0.65);
      fireflies.visible = fireflies.material.opacity > 0.01;
      if (!reducedMotion) fireflies.position.y = Math.sin(time * 0.4) * 0.13;
      world.lightMaterials.forEach(
        (m) => (m.emissiveIntensity = night * 1.6 + rainIntensity * 0.45),
      );
      world.streetLights.forEach((m) => (m.material.opacity = night * 0.055));
      world.headlights.forEach(
        (l) =>
          (l.material.emissiveIntensity =
            night * 2 + 0.25 + rainIntensity * 0.75),
      );
      // Color grade: warm golden hours, cool blue nights, muted rain.
      grade.warmth = light.golden * 0.6 - light.night * 0.55 - overcast * 0.25;
      grade.saturation =
        1.08 - light.golden * 0.02 - overcast * 0.32 - fogIntensity * 0.2;
      grade.contrast =
        1.06 + light.golden * 0.05 - overcast * 0.08 - fogIntensity * 0.1;
      grade.exposure = 1 + light.golden * 0.06 - overcast * 0.06 + flash * 0.6;
      return {
        grade,
        daylight,
        night: night > 0.5,
        weather,
        phase: clock.phase || "day",
        rainIntensity,
        stormIntensity,
        fogIntensity,
        wetness,
        tide,
        golden: light.golden,
        sunElevation: light.elevation,
        flash,
        lightningId: boltSlot,
      };
    },
  };
}
