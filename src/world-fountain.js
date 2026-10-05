import * as THREE from "three";
import { surfaceUniforms } from "./world-surface.js";
import { stillWaterMaterial } from "./world-water.js";

/**
 * The town fountain: a two-tier carved basin with a little pickle finial.
 * All water motion is evaluated on the GPU from the shared clock and wind:
 * a spout, an overflow curtain, four arcing rim jets and their splashes.
 */

const lathe = (points, segments = 40) =>
  new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );

function stone(geometry, seed = 1) {
  // Painted stone: lighter on top edges, a little mottling.
  const p = geometry.attributes.position,
    n = geometry.attributes.normal;
  const c = new Float32Array(p.count * 3),
    base = new THREE.Color("#e2d3b3"),
    shade = new THREE.Color("#b9a684"),
    t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const mottle =
      Math.sin(p.getX(i) * 13 + seed) * Math.sin(p.getZ(i) * 11 - seed) * 0.05;
    t.copy(shade).lerp(
      base,
      THREE.MathUtils.clamp(0.55 + n.getY(i) * 0.45 + mottle, 0, 1),
    );
    t.toArray(c, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geometry;
}

// Jet definitions: origin, initial velocity, lifetime, particle count.
function jets() {
  const list = [
    // Central spout from the finial, falling back into the upper bowl.
    {
      origin: [0, 1.2, 0],
      velocity: [0, 2.2, 0],
      spread: 0.35,
      life: 0.57,
      count: 150,
    },
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const dir = [Math.cos(a), Math.sin(a)];
    list.push({
      origin: [dir[0] * 1.02, 0.36, dir[1] * 1.02],
      velocity: [-dir[0] * 0.8, 2.0, -dir[1] * 0.8],
      spread: 0.05,
      life: 0.44,
      count: 80,
    });
  }
  return list;
}

export function createFountain(x, y, z) {
  const fountain = new THREE.Group();
  fountain.name = "Pickle fountain";
  fountain.position.set(x, y, z);
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.62,
  });
  const add = (name, geometry, material, dynamic = false) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    m.castShadow = m.receiveShadow = !dynamic;
    if (dynamic) m.userData.dynamic = true;
    fountain.add(m);
    return m;
  };
  // Lower basin: a thick rounded rim around a shallow pool.
  add(
    "Fountain carved basin",
    stone(
      lathe([
        [0, 0.02],
        [1.22, 0.0],
        [1.27, 0.06],
        [1.25, 0.24],
        [1.29, 0.3],
        [1.25, 0.36],
        [1.15, 0.37],
        [1.08, 0.33],
        [1.04, 0.16],
        [0, 0.14],
      ]),
      2,
    ),
    stoneMaterial,
  );
  // Pedestal with moldings, then the upper bowl.
  add(
    "Fountain pedestal",
    stone(
      lathe(
        [
          [0, 0.14],
          [0.26, 0.14],
          [0.27, 0.2],
          [0.17, 0.26],
          [0.14, 0.5],
          [0.16, 0.66],
          [0.21, 0.7],
          [0.5, 0.82],
          [0.53, 0.88],
          [0.49, 0.9],
          [0.44, 0.86],
          [0, 0.84],
        ],
        32,
      ),
      5,
    ),
    stoneMaterial,
  );
  // A little pickle finial: the town's emblem, glazed green.
  const pickle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.16, 6, 14),
    new THREE.MeshStandardMaterial({ color: "#5e9a4e", roughness: 0.32 }),
  );
  pickle.name = "Glazed pickle finial";
  pickle.position.set(0, 1.03, 0);
  pickle.rotation.z = 0.12;
  pickle.castShadow = true;
  fountain.add(pickle);
  for (let i = 0; i < 7; i++) {
    const bump = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      pickle.material,
    );
    bump.name = "Pickle bump";
    const a = i * 2.4;
    bump.position.set(
      Math.cos(a) * 0.07,
      0.97 + (i % 4) * 0.05,
      Math.sin(a) * 0.07,
    );
    fountain.add(bump);
  }
  // Water surfaces.
  const water = stillWaterMaterial("#56b9c4");
  const lower = add(
    "Fountain pool water",
    new THREE.CircleGeometry(1.06, 48).rotateX(-Math.PI / 2),
    water,
    true,
  );
  lower.position.y = 0.29;
  lower.receiveShadow = true;
  const upper = add(
    "Fountain bowl water",
    new THREE.CircleGeometry(0.46, 32).rotateX(-Math.PI / 2),
    water,
    true,
  );
  upper.position.y = 0.86;
  // Overflow curtain: a translucent flared sheet with streaks running down.
  const curtain = add(
    "Fountain overflow curtain",
    lathe(
      [
        [0.52, 0.88],
        [0.55, 0.8],
        [0.58, 0.6],
        [0.6, 0.29],
      ],
      48,
    ),
    new THREE.ShaderMaterial({
      uniforms: { uTime: surfaceUniforms.uSurfTime },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        void main() {
          float streak = sin(vUv.x * 160.0 + sin(vUv.x * 23.0) * 4.0) * 0.5 + 0.5;
          float flow = fract(vUv.y * 3.0 + uTime * 1.6 + streak * 0.4);
          float a = (0.16 + streak * 0.2 + smoothstep(0.7, 1.0, flow) * 0.25) * smoothstep(0.0, 0.15, vUv.y);
          gl_FragColor = vec4(mix(vec3(0.55, 0.8, 0.86), vec3(0.95, 1.0, 1.0), streak * flow), a);
        }`,
    }),
    true,
  );
  curtain.renderOrder = 2;
  // Droplets.
  const list = jets();
  const total = list.reduce((n, j) => n + j.count, 0);
  const origin = new Float32Array(total * 3),
    velocity = new Float32Array(total * 3),
    seed = new Float32Array(total * 2);
  let i = 0;
  for (const jet of list)
    for (let k = 0; k < jet.count; k++, i++) {
      origin.set(jet.origin, i * 3);
      const r = Math.sin(i * 12.9898) * 43758.5453;
      const u = r - Math.floor(r);
      const v =
        Math.sin(i * 78.233) * 12345.678 -
        Math.floor(Math.sin(i * 78.233) * 12345.678);
      const a = u * Math.PI * 2;
      velocity.set(
        [
          jet.velocity[0] + Math.cos(a) * jet.spread * v,
          jet.velocity[1] * (0.92 + v * 0.12),
          jet.velocity[2] + Math.sin(a) * jet.spread * v,
        ],
        i * 3,
      );
      seed.set([k / jet.count + u * 0.02, jet.life], i * 2);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(origin, 3));
  geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocity, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 2));
  const dropUniforms = {
    uTime: surfaceUniforms.uSurfTime,
    uWind: surfaceUniforms.uWindDir,
    uWindStrength: surfaceUniforms.uWindStrength,
    uScale: { value: 700 },
    uLight: { value: new THREE.Color("#ffffff") },
  };
  const drops = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: dropUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aVelocity; attribute vec2 aSeed;
        uniform float uTime, uWindStrength, uScale; uniform vec2 uWind;
        varying float vAge;
        void main() {
          float life = aSeed.y;
          float age = fract(uTime / life + aSeed.x);
          float t = age * life;
          vec3 p = position + aVelocity * t + vec3(0.0, -4.9, 0.0) * t * t;
          p.xz += uWind * uWindStrength * 0.35 * t * t;
          vAge = age;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(0.045 * uScale / max(1.0, -mv.z), 1.0, 9.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; varying float vAge;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.4, 1.0, r)) * (1.0 - smoothstep(0.85, 1.0, vAge)) * 0.85;
          if (a < 0.02) discard;
          gl_FragColor = vec4(mix(vec3(0.72, 0.9, 0.95), uLight, 0.5), a);
        }`,
    }),
  );
  drops.name = "Fountain droplets";
  drops.userData.dynamic = true;
  drops.frustumCulled = false;
  fountain.add(drops);
  fountain.userData.fountain = { drops: dropUniforms, water };
  return fountain;
}
