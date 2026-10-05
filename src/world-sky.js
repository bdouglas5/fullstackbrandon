import * as THREE from "three";

/**
 * Time of day for the little planet: the sun arcs over the islands, the sky
 * dome changes from dawn rose to noon blue to a sunset glow, and the moon and
 * stars take over at night. Everything is derived from the simulation clock,
 * so lighting never disagrees with the business day.
 */

const D2R = Math.PI / 180;
// Sky keys by sun elevation (degrees): zenith, horizon, sun tint.
const KEYS = [
  [-18, "#060f24", "#13213d", "#8fa7ff"],
  [-9, "#152548", "#3a3f6b", "#9c8ccf"],
  [-3, "#2b3d72", "#c8798a", "#ff7a5c"],
  [2, "#4b6aa6", "#ff9a68", "#ff8646"],
  [8, "#678fc6", "#ffb985", "#ffa258"],
  [16, "#6c9fd2", "#ffd3a2", "#ffbf7e"],
  [30, "#62a3d8", "#f3e1c0", "#ffe0b0"],
  [48, "#56a0d9", "#d3e7ea", "#fff1d8"],
  [70, "#4f9bd6", "#c6e3ea", "#fff6e6"],
];
const keyColors = KEYS.map(([e, z, h, s]) => [
  e,
  new THREE.Color(z),
  new THREE.Color(h),
  new THREE.Color(s),
]);
const OVERCAST_DAY = new THREE.Color("#8d9ca5"),
  OVERCAST_NIGHT = new THREE.Color("#18212c"),
  FOG_DAY = new THREE.Color("#c9d3d2");

export function skyAt(elevation, target = {}) {
  const k = keyColors;
  let i = 0;
  while (i < k.length - 2 && elevation > k[i + 1][0]) i++;
  const t = THREE.MathUtils.smoothstep(elevation, k[i][0], k[i + 1][0]);
  (target.zenith ||= new THREE.Color()).lerpColors(k[i][1], k[i + 1][1], t);
  (target.horizon ||= new THREE.Color()).lerpColors(k[i][2], k[i + 1][2], t);
  (target.sun ||= new THREE.Color()).lerpColors(k[i][3], k[i + 1][3], t);
  return target;
}

/** Sun direction for an hour of the day. Rises east-ish, sets behind town. */
export function sunDirection(hour, target = new THREE.Vector3()) {
  // Daylight between 06:00 and 19:00 maps to 0..1 along the arc.
  const t = (hour - 6) / 13;
  const azimuth = THREE.MathUtils.lerp(78, -150, t) * D2R;
  const elevation =
    Math.sin(Math.PI * THREE.MathUtils.clamp(t, -0.15, 1.15)) * 62;
  const e = elevation * D2R;
  target.set(
    Math.sin(azimuth) * Math.cos(e),
    Math.sin(e),
    Math.cos(azimuth) * Math.cos(e),
  );
  return { direction: target.normalize(), elevation };
}

export function createSky(scene) {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBelow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunDisk: { value: 1 },
    uSunGlow: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.7, -0.6).normalize() },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uOvercast: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(170, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w * 0.99999;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uHorizon, uBelow, uSunDir, uSunColor, uMoonDir;
        uniform float uSunDisk, uSunGlow, uNight, uTime, uOvercast;
        varying vec3 vDir;
        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.6));
          // Below the horizon the planet's rim glows into a deeper sea haze.
          col = mix(col, uBelow, smoothstep(0.0, -0.4, h));
          float s = max(dot(d, uSunDir), 0.0);
          float clear = 1.0 - uOvercast * 0.85;
          col += uSunColor * (pow(s, 5.0) * 0.3 + pow(s, 40.0) * 0.55) * uSunGlow * clear;
          col += uSunColor * 2.6 * smoothstep(0.9991, 0.9996, s) * uSunDisk * clear;
          float m = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.95, 0.96, 1.0) * 2.4 * smoothstep(0.99915, 0.99945, m) * uNight * clear;
          col += vec3(0.45, 0.55, 0.85) * pow(m, 60.0) * 0.35 * uNight * clear;
          if (uNight > 0.01 && h > 0.0) {
            vec3 q = floor(d * 260.0);
            float star = hash(q);
            float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + star * 3.0) + star * 40.0);
            col += vec3(1.0, 0.97, 0.9) * step(0.9972, star) * twinkle * uNight * clear
              * smoothstep(0.02, 0.25, h) * 1.4;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.name = "Time-of-day sky dome";
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.userData.noSurface = true;
  scene.add(dome);

  const palette = {},
    sunDir = new THREE.Vector3(),
    lightDir = new THREE.Vector3(),
    moonLight = new THREE.Vector3(-0.35, 0.82, -0.45).normalize();
  const state = {
    hour: null,
    sunDirection: new THREE.Vector3(0, 1, 0),
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightColor: new THREE.Color(),
    lightIntensity: 3.6,
    elevation: 45,
    horizon: new THREE.Color(),
    zenith: new THREE.Color(),
    golden: 0,
  };
  return {
    dome,
    uniforms,
    state,
    update({ hour = 12, overcast = 0, foggy = 0, time = 0, dt = 0, camera }) {
      // Ease the clock so a jump in playback never pops the light.
      if (state.hour === null) state.hour = hour;
      let delta = hour - state.hour;
      if (delta > 12) delta -= 24;
      if (delta < -12) delta += 24;
      state.hour =
        (state.hour + delta * (1 - Math.exp(-Math.max(0, dt) * 2.5)) + 24) % 24;
      const { elevation } = sunDirection(state.hour, sunDir);
      skyAt(elevation, palette);
      const night = 1 - THREE.MathUtils.smoothstep(elevation, -10, 2);
      // Overcast skies flatten toward grey; fog washes the horizon out.
      const grey = night > 0.5 ? OVERCAST_NIGHT : OVERCAST_DAY;
      palette.zenith.lerp(grey, overcast * 0.85);
      palette.horizon.lerp(grey, overcast * 0.7);
      palette.horizon.lerp(
        night > 0.5 ? OVERCAST_NIGHT : FOG_DAY,
        foggy * 0.75,
      );
      palette.zenith.lerp(palette.horizon, foggy * 0.5);
      uniforms.uZenith.value.copy(palette.zenith);
      uniforms.uHorizon.value.copy(palette.horizon);
      uniforms.uBelow.value
        .copy(palette.horizon)
        .lerp(palette.zenith, 0.35)
        .multiplyScalar(0.82);
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunColor.value.copy(palette.sun);
      uniforms.uSunDisk.value = THREE.MathUtils.smoothstep(elevation, -3, 1);
      uniforms.uSunGlow.value =
        THREE.MathUtils.smoothstep(elevation, -12, 0) *
        (1.15 - THREE.MathUtils.smoothstep(elevation, 10, 50) * 0.55);
      uniforms.uNight.value = night;
      uniforms.uTime.value = time;
      uniforms.uOvercast.value = overcast;
      if (camera) dome.position.copy(camera.position);
      // The key light follows the sun by day and the moon by night; it never
      // drops below a low angle so shadows stay long but bounded.
      const dayKey = THREE.MathUtils.smoothstep(elevation, -4, 3);
      lightDir.copy(sunDir);
      lightDir.y = Math.max(lightDir.y, Math.sin(9 * D2R));
      lightDir
        .normalize()
        .lerp(moonLight, 1 - dayKey)
        .normalize();
      state.lightDirection.copy(lightDir);
      state.sunDirection.copy(sunDir);
      state.elevation = elevation;
      state.night = night;
      state.golden =
        (1 - THREE.MathUtils.smoothstep(elevation, 10, 40)) *
        THREE.MathUtils.smoothstep(elevation, -4, 2);
      state.lightColor
        .copy(palette.sun)
        .lerp(new THREE.Color("#a9c2ff"), 1 - dayKey);
      state.lightIntensity =
        dayKey * (1.2 + 2.6 * THREE.MathUtils.smoothstep(elevation, 0, 30)) +
        (1 - dayKey) * 0.45;
      state.horizon.copy(palette.horizon);
      state.zenith.copy(palette.zenith);
      return state;
    },
  };
}
