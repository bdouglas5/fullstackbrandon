import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// A small CPU particle simulation drawn as soft sprites. Each particle has a
// velocity, drag, gravity (negative rises) and an optional ground bounce, and
// fades and resizes over its life. Additive systems carry sparks and glow;
// normal-blend systems carry mist and smoke.
const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.001, -mv.z);
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;
const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
    #include <colorspace_fragment>
  }
`;

// Deterministic jitter keeps the effects identical from run to run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tmpA = new THREE.Color(),
  tmpB = new THREE.Color();

export class ParticleSystem {
  constructor(max, { additive = true, seed = 1 } = {}) {
    this.max = max;
    this.count = 0;
    this.rand = rng(seed);
    const f = (n) => new Float32Array(max * n);
    this.p = f(3);
    this.v = f(3);
    this.age = f(1);
    this.life = f(1);
    this.s0 = f(1);
    this.s1 = f(1);
    this.alpha = f(1);
    this.c0 = f(3);
    this.c1 = f(3);
    this.drag = f(1);
    this.grav = f(1);
    this.bounce = f(1);
    this.outPos = f(3);
    this.outColor = f(3);
    this.outAlpha = f(1);
    this.outSize = f(1);
    const geometry = new THREE.BufferGeometry();
    const attr = (name, array, n) =>
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(array, n).setUsage(THREE.DynamicDrawUsage),
      );
    attr("position", this.outPos, 3);
    attr("aColor", this.outColor, 3);
    attr("aAlpha", this.outAlpha, 1);
    attr("aSize", this.outSize, 1);
    geometry.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 600 } };
    this.object = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.onBeforeRender = (renderer, _scene, camera) => {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      this.uniforms.uScale.value =
        size.y * 0.5 * (camera.projectionMatrix?.elements?.[5] || 1.7);
    };
  }
  /**
   * Emit `n` particles. Ranges are [min, max]; `dir` is a unit vector and
   * `cone` its half-angle spread. `radius` scatters the start position.
   */
  emit(n, o) {
    const r = this.rand;
    const {
      at = [0, 0, 0],
      radius = 0,
      dir = [0, 1, 0],
      cone = Math.PI,
      speed = [1, 1],
      life = [0.5, 0.5],
      size = [0.05, 0.02],
      alpha = 1,
      colors = ["#ffffff", "#ffffff"],
      drag = 0,
      gravity = 0,
      bounce = 0,
      box = null,
    } = o;
    tmpA.set(colors[0]);
    tmpB.set(colors[1]);
    // Orthonormal basis around dir for the cone spread.
    const d = new THREE.Vector3(...dir).normalize();
    const t =
      Math.abs(d.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, t).normalize();
    const w = new THREE.Vector3().crossVectors(d, u);
    for (let k = 0; k < n; k++) {
      if (this.count >= this.max) return;
      const i = this.count++;
      const ang = r() * Math.PI * 2;
      const tilt = Math.acos(1 - r() * (1 - Math.cos(cone)));
      const sx = Math.sin(tilt) * Math.cos(ang),
        sy = Math.sin(tilt) * Math.sin(ang),
        sz = Math.cos(tilt);
      const spd = speed[0] + (speed[1] - speed[0]) * r();
      this.v[i * 3] = (u.x * sx + w.x * sy + d.x * sz) * spd;
      this.v[i * 3 + 1] = (u.y * sx + w.y * sy + d.y * sz) * spd;
      this.v[i * 3 + 2] = (u.z * sx + w.z * sy + d.z * sz) * spd;
      const jitter = () => (r() - 0.5) * 2;
      this.p[i * 3] = at[0] + (box ? jitter() * box[0] : jitter() * radius);
      this.p[i * 3 + 1] = at[1] + (box ? jitter() * box[1] : jitter() * radius);
      this.p[i * 3 + 2] = at[2] + (box ? jitter() * box[2] : jitter() * radius);
      this.age[i] = 0;
      this.life[i] = life[0] + (life[1] - life[0]) * r();
      this.s0[i] = size[0];
      this.s1[i] = size[1];
      this.alpha[i] = alpha;
      this.c0.set([tmpA.r, tmpA.g, tmpA.b], i * 3);
      this.c1.set([tmpB.r, tmpB.g, tmpB.b], i * 3);
      this.drag[i] = drag;
      this.grav[i] = gravity;
      this.bounce[i] = bounce;
    }
  }
  clear() {
    this.count = 0;
    this.object.visible = false;
    this.object.geometry.setDrawRange(0, 0);
  }
  step(dt) {
    let i = 0;
    while (i < this.count) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // Swap-remove the last particle into this slot.
        const last = --this.count;
        if (i !== last) {
          for (const a of [this.p, this.v, this.c0, this.c1])
            for (let c = 0; c < 3; c++) a[i * 3 + c] = a[last * 3 + c];
          for (const a of [
            this.age,
            this.life,
            this.s0,
            this.s1,
            this.alpha,
            this.drag,
            this.grav,
            this.bounce,
          ])
            a[i] = a[last];
        }
        continue;
      }
      const damp = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= damp;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * damp - this.grav[i] * dt;
      this.v[i * 3 + 2] *= damp;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < 0.02 && this.bounce[i] > 0) {
        this.p[i * 3 + 1] = 0.02;
        this.v[i * 3 + 1] *= -this.bounce[i];
        this.v[i * 3] *= 0.6;
        this.v[i * 3 + 2] *= 0.6;
      }
      i++;
    }
    for (let k = 0; k < this.count; k++) {
      const t = this.age[k] / this.life[k];
      this.outPos.set(this.p.subarray(k * 3, k * 3 + 3), k * 3);
      for (let c = 0; c < 3; c++)
        this.outColor[k * 3 + c] =
          this.c0[k * 3 + c] + (this.c1[k * 3 + c] - this.c0[k * 3 + c]) * t;
      // Quick fade-in, long fade-out.
      this.outAlpha[k] = this.alpha[k] * Math.min(1, t * 12) * (1 - t) ** 1.4;
      this.outSize[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * t;
    }
    const g = this.object.geometry;
    g.setDrawRange(0, this.count);
    for (const name of ["position", "aColor", "aAlpha", "aSize"])
      g.attributes[name].needsUpdate = true;
    this.object.visible = this.count > 0;
  }
}

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const glow = (color, intensity = 1.4) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
  });

function add(parent, mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
function grip(group, color, accent) {
  add(
    group,
    new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.1, 3, 8), mat(color)),
    0,
    -0.015,
    -0.02,
    -0.25,
  );
  if (accent)
    add(
      group,
      new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 6, 14), accent),
      0,
      0.02,
      -0.034,
      Math.PI / 2 - 0.25,
    );
}
function guard(group, color) {
  add(
    group,
    new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 6, 14), mat(color)),
    0,
    0.005,
    0.075,
    0,
    Math.PI / 2,
  );
}

/**
 * Hand-held models. Each prop's local +Z points along the forearm and +Y is up
 * when the arm is raised to aim, with the palm at the origin. userData:
 *   muzzle — Object3D at the business end (flash, bolt and spray start here)
 *   core / rings / orb — glowing parts the animation can pulse
 */
export function buildWeaponProps() {
  const props = new Map();
  const make = (id) => {
    const g = new THREE.Group();
    g.name = `Defense ${id}`;
    g.rotation.x = Math.PI / 2;
    g.position.set(0, -0.165, 0);
    // Toy proportions: chunky props read from the miniature's camera distance.
    g.scale.setScalar(1.3);
    g.visible = false;
    props.set(id, g);
    return g;
  };
  const muzzle = (g, x, y, z) => {
    const m = new THREE.Object3D();
    m.name = "muzzle";
    m.position.set(x, y, z);
    g.add(m);
    g.userData.muzzle = m;
    return m;
  };

  // Machete: curved clay blade with a leather grip and brass guard.
  {
    const g = make("machete");
    add(
      g,
      new THREE.Mesh(
        new THREE.CapsuleGeometry(0.026, 0.1, 3, 8),
        mat("#6b4a33"),
      ),
      0,
      0,
      0.01,
      Math.PI / 2,
    );
    add(
      g,
      new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), mat("#c89b4a")),
      0,
      0,
      -0.06,
    );
    add(g, new RoundedBoxMesh(0.04, 0.1, 0.03, "#c89b4a"), 0, 0, 0.085);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.034);
    shape.lineTo(0.36, 0.04);
    shape.quadraticCurveTo(0.47, 0.03, 0.46, -0.01);
    shape.quadraticCurveTo(0.3, -0.05, 0, -0.04);
    shape.closePath();
    const blade = new THREE.ExtrudeGeometry(shape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 1,
    });
    blade.translate(0, 0, -0.008);
    blade.rotateY(-Math.PI / 2);
    add(
      g,
      new THREE.Mesh(
        blade,
        new THREE.MeshStandardMaterial({
          color: "#d3dcd6",
          roughness: 0.3,
          metalness: 0.35,
        }),
      ),
      0,
      0,
      0.1,
    );
    muzzle(g, 0, 0, 0.5);
  }

  // Toy pistol: dark slide, orange safety tip.
  {
    const g = make("gun");
    add(g, new RoundedBoxMesh(0.075, 0.085, 0.34, "#586d73"), 0, 0.06, 0.13);
    add(g, new RoundedBoxMesh(0.05, 0.03, 0.3, "#3e5055"), 0, 0.115, 0.13);
    add(
      g,
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10),
        mat("#ff9f3d"),
      ),
      0,
      0.06,
      0.31,
      Math.PI / 2,
    );
    grip(g, "#8a5b3a");
    guard(g, "#3e5055");
    muzzle(g, 0, 0.06, 0.35);
  }

  // Zombie spray: green tank slung under a nozzle, with a pressure gauge.
  {
    const g = make("spray");
    add(g, new RoundedBoxMesh(0.085, 0.09, 0.26, "#7fb562"), 0, 0.06, 0.1);
    add(
      g,
      new THREE.Mesh(
        new THREE.CapsuleGeometry(0.068, 0.14, 4, 10),
        mat("#bdd681"),
      ),
      0,
      -0.075,
      0.15,
    );
    add(
      g,
      new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.014, 6, 16),
        mat("#4f7a3b"),
      ),
      0,
      -0.075,
      0.15,
      Math.PI / 2,
    );
    add(
      g,
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8),
        mat("#4f7a3b"),
      ),
      0,
      0.14,
      0.04,
    );
    add(
      g,
      new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), mat("#f2f7d4")),
      0,
      0.17,
      0.04,
    );
    add(
      g,
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.022, 0.1, 12),
        mat("#4f7a3b"),
      ),
      0,
      0.06,
      0.3,
      Math.PI / 2,
    );
    grip(g, "#8a5b3a");
    guard(g, "#4f7a3b");
    muzzle(g, 0, 0.06, 0.37);
  }

  // Particle gun: white shell, glowing cyan core, rings and charge orb.
  {
    const g = make("particle_gun");
    add(g, new RoundedBoxMesh(0.1, 0.11, 0.36, "#e9f2f3"), 0, 0.06, 0.11);
    const core = add(
      g,
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.26, 10),
        glow("#7fe8f2"),
      ),
      0,
      0.125,
      0.12,
      Math.PI / 2,
    );
    const rings = [0.2, 0.27, 0.34].map((z) =>
      add(
        g,
        new THREE.Mesh(
          new THREE.TorusGeometry(0.066, 0.012, 8, 20),
          glow("#7fe8f2", 1.1),
        ),
        0,
        0.06,
        z,
      ),
    );
    add(
      g,
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 0.12, 12),
        mat("#425b63"),
      ),
      0,
      0.06,
      0.34,
      Math.PI / 2,
    );
    const orb = add(
      g,
      new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 10),
        glow("#baf8ff", 1.8),
      ),
      0,
      0.06,
      0.41,
    );
    add(
      g,
      new THREE.Mesh(
        new THREE.CapsuleGeometry(0.032, 0.07, 3, 8),
        glow("#7fe8f2", 0.7),
      ),
      0,
      0.07,
      -0.1,
      Math.PI / 2,
    );
    grip(g, "#425b63", glow("#7fe8f2", 0.9));
    guard(g, "#425b63");
    g.userData.core = core;
    g.userData.rings = rings;
    g.userData.orb = orb;
    muzzle(g, 0, 0.06, 0.45);
  }
  return props;
}

// Rounded box mesh with the kit's usual soft toy edges.
class RoundedBoxMesh extends THREE.Mesh {
  constructor(x, y, z, color) {
    super(
      new RoundedBoxGeometry(x, y, z, 2, Math.min(x, y, z) * 0.35),
      mat(color),
    );
  }
}
