import * as THREE from "three";

const CAPACITY = 180;
const styles = {
  foot: { color: "#c5ad86", size: 0.1, alpha: 0.14, life: 0.48, density: 3.2 },
  bike: { color: "#c5ad86", size: 0.13, alpha: 0.12, life: 0.6, density: 3.6 },
  van: { color: "#c5ad86", size: 0.19, alpha: 0.13, life: 0.65, density: 4.5 },
  rocket_skates: {
    color: "#89e2ef",
    size: 0.075,
    alpha: 0.3,
    life: 0.4,
    density: 9,
  },
  sailboat: {
    color: "#dce8d8",
    size: 0.15,
    alpha: 0.38,
    life: 1.3,
    density: 8,
  },
  jetpack: {
    color: "#96d9cf",
    size: 0.095,
    alpha: 0.27,
    life: 0.4,
    density: 11,
  },
  helicopter: {
    color: "#c5b99a",
    size: 0.34,
    alpha: 0.065,
    life: 0.7,
    density: 12,
  },
};
for (const style of Object.values(styles))
  style.linear = new THREE.Color(style.color);

// The simulation owns position and heading. This pool only observes travelled
// distance, leaving tiny, short-lived surface cues behind the actual vehicle.
export function createVehicleEffects(scene) {
  const position = new Float32Array(CAPACITY * 3);
  const colors = new Float32Array(CAPACITY * 3);
  const sizes = new Float32Array(CAPACITY);
  const opacity = new Float32Array(CAPACITY);
  const geometry = new THREE.BufferGeometry();
  for (const [name, data, itemSize] of [
    ["position", position, 3],
    ["particleColor", colors, 3],
    ["particleSize", sizes, 1],
    ["particleOpacity", opacity, 1],
  ])
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(data, itemSize).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      viewportHeight: { value: 720 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute vec3 particleColor;
      attribute float particleSize;
      attribute float particleOpacity;
      uniform float viewportHeight;
      varying vec3 vParticleColor;
      varying float vParticleOpacity;
      #include <fog_pars_vertex>
      void main() {
        vParticleColor = particleColor;
        vParticleOpacity = particleOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float distanceScale = projectionMatrix[2][3] == -1.0 ? max(0.1, -mvPosition.z) : 1.0;
        gl_PointSize = clamp(particleSize * viewportHeight * projectionMatrix[1][1] * 0.5 / distanceScale, 1.0, 42.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 vParticleColor;
      varying float vParticleOpacity;
      #include <fog_pars_fragment>
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float softness = 1.0 - smoothstep(0.05, 1.0, radius);
        float alpha = vParticleOpacity * softness * softness;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(vParticleColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Travel dust, foam and rotor wash";
  points.visible = false;
  points.frustumCulled = false;
  points.userData.dynamic = true;
  const viewport = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(viewport);
    material.uniforms.viewportHeight.value = viewport.y;
  };
  scene.add(points);
  const particles = Array.from({ length: CAPACITY }, () => ({ life: 0 }));
  const emitters = new Map();
  let cursor = 0,
    serial = 0,
    count = 0,
    disposed = false;
  const random = () => {
    const value = Math.sin(++serial * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const clear = () => {
    for (const particle of particles) particle.life = 0;
    opacity.fill(0);
    geometry.attributes.particleOpacity.needsUpdate = true;
    emitters.clear();
    points.visible = false;
    count = 0;
  };
  function emit(id, kind, motion, dt, options = {}) {
    if (disposed) return;
    const { active = false, time = 0, reducedMotion = false } = options;
    if (reducedMotion) {
      clear();
      return;
    }
    const p = motion?.position;
    if (!p || ![p.x, p.y, p.z, dt, time].every(Number.isFinite)) {
      emitters.delete(id);
      return;
    }
    const previous = emitters.get(id);
    const next = { x: p.x, y: p.y, z: p.z, time, kind, debt: 0 };
    emitters.set(id, next);
    const style = styles[kind];
    if (!active || !style || dt <= 0 || !previous || previous.kind !== kind)
      return;
    const dx = p.x - previous.x,
      dy = p.y - previous.y,
      dz = p.z - previous.z;
    const planar = Math.hypot(dx, dz),
      distance = Math.hypot(dx, dy, dz);
    const airborne = kind === "helicopter" || kind === "jetpack";
    // Ignore restored saves, teleports, stationary/paused poses, and stale
    // emitters. Vertical take-off/landing counts as physical travel too.
    if (
      distance < 0.0005 ||
      distance > 4 ||
      time - previous.time > 0.3 ||
      (!motion.moving && !(airborne && Math.abs(dy) > 0.0005))
    )
      return;
    if (kind === "helicopter" && (p.y > 1.9 || p.y < 0.35)) return;
    const travelled = airborne ? distance : planar;
    next.debt = Math.min(5, previous.debt + travelled * style.density);
    const amount = Math.floor(next.debt);
    next.debt -= amount;
    const heading = Number.isFinite(motion.heading)
      ? motion.heading
      : Math.atan2(dx, dz);
    const forwardX = Math.sin(heading),
      forwardZ = Math.cos(heading);
    for (let i = 0; i < amount; i++) {
      const particle = particles[cursor];
      const index = cursor * 3;
      const along = (i + 1) / (amount + 1);
      const side = serial % 2 ? -1 : 1;
      let x = previous.x + dx * along,
        y = p.y + 0.035,
        z = previous.z + dz * along;
      let vx = (random() - 0.5) * 0.09,
        vy = 0.055,
        vz = (random() - 0.5) * 0.09;
      let size = style.size,
        alpha = style.alpha;
      if (kind === "sailboat") {
        x += -forwardX * 0.78 + forwardZ * side * 0.28;
        z += -forwardZ * 0.78 - forwardX * side * 0.28;
        y = p.y - 0.005;
        vx = forwardZ * side * 0.19 - forwardX * 0.12;
        vz = -forwardX * side * 0.19 - forwardZ * 0.12;
        vy = 0;
      } else if (kind === "jetpack") {
        x += -forwardX * 0.13 + forwardZ * side * 0.13;
        z += -forwardZ * 0.13 - forwardX * side * 0.13;
        y = p.y + 0.07;
        vx -= forwardX * 0.12;
        vz -= forwardZ * 0.12;
        vy = -0.65;
      } else if (kind === "helicopter") {
        const angle = random() * Math.PI * 2;
        const radius = 0.55 + random() * 0.35;
        x += Math.cos(angle) * radius;
        z += Math.sin(angle) * radius;
        y = 0.48;
        vx = Math.cos(angle) * 0.85;
        vz = Math.sin(angle) * 0.85;
        vy = 0.02;
        alpha *= 1 - THREE.MathUtils.clamp((p.y - 0.45) / 1.6, 0, 0.9);
      } else {
        const rear = kind === "van" ? 0.66 : kind === "bike" ? 0.6 : 0.05;
        const track =
          kind === "van" ? side * 0.4 : kind === "foot" ? side * 0.065 : 0;
        x += -forwardX * rear + forwardZ * track;
        z += -forwardZ * rear - forwardX * track;
        vx -= forwardX * 0.045;
        vz -= forwardZ * 0.045;
      }
      particle.life = particle.duration = style.life * (0.85 + random() * 0.3);
      particle.vx = vx;
      particle.vy = vy;
      particle.vz = vz;
      particle.size = size * (0.8 + random() * 0.4);
      particle.alpha = alpha;
      position[index] = x;
      position[index + 1] = y;
      position[index + 2] = z;
      style.linear.toArray(colors, index);
      sizes[cursor] = particle.size;
      opacity[cursor] = 0;
      cursor = (cursor + 1) % CAPACITY;
    }
  }
  function update(time, dt, reducedMotion = false) {
    if (disposed) return;
    if (reducedMotion) {
      clear();
      return;
    }
    if (![time, dt].every(Number.isFinite) || dt < 0) return;
    // Long frame gaps expire particles instead of preserving a frozen trail.
    const elapsed = Math.min(dt, 2);
    count = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const particle = particles[i];
      if (particle.life <= 0) continue;
      particle.life = Math.max(0, particle.life - elapsed);
      if (!particle.life) {
        opacity[i] = 0;
        continue;
      }
      const progress = 1 - particle.life / particle.duration;
      position[i * 3] += particle.vx * elapsed;
      position[i * 3 + 1] += particle.vy * elapsed;
      position[i * 3 + 2] += particle.vz * elapsed;
      sizes[i] = particle.size * (1 + progress * 1.4);
      opacity[i] =
        particle.alpha * Math.min(1, progress * 9) * (1 - progress) ** 1.7;
      count++;
    }
    for (const [id, emitter] of emitters)
      if (time - emitter.time > 2) emitters.delete(id);
    for (const attribute of Object.values(geometry.attributes))
      attribute.needsUpdate = true;
    points.visible = count > 0;
    return count;
  }
  return {
    emit,
    update,
    points,
    get count() {
      return count;
    },
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
