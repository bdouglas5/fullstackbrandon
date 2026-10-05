import * as THREE from "three";
import { LIGHTHOUSE } from "../shared/islands.js";

// All visible lamps glow; only the six nearest practicals shade the scenery.
// Keeping a fixed light count avoids shader recompilation as the camera travels.
export const LOCAL_LIGHT_LIMIT = 6;

export function nightStrength(daylight) {
  return 1 - THREE.MathUtils.smoothstep(daylight, 0.18, 0.72);
}

export function createWorldLighting(scene, w) {
  const sources = [],
    materials = new Map(),
    luminous = new Set();
  const p = new THREE.Vector3();
  w.world.updateMatrixWorld(true);
  const dynamicRoots = new Set([
    w.van,
    w.bike,
    w.helicopter,
    w.boat,
    w.jetpack,
    w.teleporter,
  ]);
  const insideVehicle = (object) => {
    for (let parent = object; parent; parent = parent.parent)
      if (dynamicRoots.has(parent)) return true;
    return false;
  };
  const followsObject = (object) => {
    for (let parent = object; parent; parent = parent.parent)
      if (
        dynamicRoots.has(parent) ||
        parent.userData.dynamic ||
        !parent.visible
      )
        return true;
    return false;
  };
  w.world.traverse((object) => {
    if (!object.isMesh || !object.material?.emissive) return;
    const name = object.name.toLowerCase();
    const vehicle = insideVehicle(object);
    const window =
      !vehicle &&
      /window|recessed glass|glazing/.test(name) &&
      !/frame|shutter|sill|mullion|pillar/.test(name);
    const lamp = /warm lantern|lantern glass|concert lantern|festoon lamp/.test(
      name,
    );
    const accent = object.userData.glowColor;
    const headlight = name === "headlight" || name === "rear light";
    if (!window && !lamp && !accent && !headlight) return;
    const color =
      accent ||
      (name === "rear light" ? "#ff6552" : window ? "#ffd2a0" : "#ffda8c");
    const strength = window
      ? 1.45
      : accent
        ? 2.4 * (object.userData.glowIntensity ?? 1)
        : 3.4;
    const key = `${object.material.uuid}:${color}:${strength}`;
    if (!materials.has(key)) {
      const material = object.material.clone();
      material.emissive.set(color);
      material.emissiveIntensity = 0;
      material.roughness = window ? 0.28 : 0.36;
      materials.set(key, material);
      luminous.add({ material, strength });
    }
    object.material = materials.get(key);
    if (lamp || headlight || accent) {
      object.getWorldPosition(p);
      // Static geometry will be merged; retain its world-space light anchor.
      sources.push({
        position: p.clone(),
        object: followsObject(object) ? object : null,
        color: new THREE.Color(color),
        ground: lamp,
        radius: lamp ? 1.55 : 0.42,
        strength: lamp ? 0.9 : 0.5,
        lamp,
      });
    }
  });
  // Replace the old square, opaque-edged lamp decals with radial falloff.
  for (const halo of w.streetLights) {
    halo.removeFromParent();
    halo.geometry.dispose();
    halo.material.dispose();
  }
  w.streetLights.length = 0;
  // Atmosphere used to manage these materials before the authored kits existed.
  w.lightMaterials.length = 0;

  const root = new THREE.Group();
  root.name = "Nighttime practical lighting";
  root.userData.dynamic = true;
  scene.add(root);
  const night = { value: 0 },
    time = { value: 0 };
  const positions = new Float32Array(sources.length * 3);
  const colors = new Float32Array(sources.length * 3);
  const sizes = new Float32Array(sources.length);
  sources.forEach((source, i) => {
    source.position.toArray(positions, i * 3);
    source.color.toArray(colors, i * 3);
    sizes[i] = source.lamp ? 0.76 : 0.36;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("glowSize", new THREE.BufferAttribute(sizes, 1));
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { night, pixelScale: { value: 800 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader: `attribute float glowSize; uniform float pixelScale;
      varying vec3 tint; varying float enabled; void main(){ tint=color; enabled=step(.001,glowSize);
      vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p;
      gl_PointSize=clamp(glowSize*pixelScale/max(1.,-p.z),2.,96.); }`,
    fragmentShader: `uniform float night; varying vec3 tint; varying float enabled;
      void main(){float r=length(gl_PointCoord-.5)*2.;
      float glow=exp(-r*r*5.)*(1.-smoothstep(.65,1.,r));
      gl_FragColor=vec4(tint*1.5,glow*night*.5*enabled);}`,
  });
  const glows = new THREE.Points(geometry, glowMaterial);
  glows.name = "Soft lantern and navigation halos";
  glows.frustumCulled = false;
  root.add(glows);

  const poolMaterial = new THREE.ShaderMaterial({
    uniforms: { night },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float night; varying vec2 vUv;
      void main(){float r=length(vUv-.5)*2.;
      float falloff=exp(-r*r*3.8)*(1.-smoothstep(.6,1.,r));
      gl_FragColor=vec4(1.,.58,.22,falloff*night*.23);}`,
  });
  const groundSources = sources.filter((source) => source.ground);
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    poolMaterial,
    groundSources.length,
  );
  pools.name = "Warm pools on paths";
  const transform = new THREE.Object3D();
  groundSources.forEach((source, i) => {
    transform.position.set(source.position.x, 0.448, source.position.z);
    transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.scale.set(source.radius * 2, source.radius * 2, 1);
    transform.updateMatrix();
    pools.setMatrixAt(i, transform.matrix);
  });
  pools.instanceMatrix.needsUpdate = true;
  root.add(pools);

  const localLights = Array.from({ length: LOCAL_LIGHT_LIMIT }, () => {
    const light = new THREE.PointLight("#ffd39a", 0, 6.5, 2);
    light.name = "Pooled warm practical";
    root.add(light);
    return light;
  });
  const headlight = new THREE.SpotLight("#ffe3ac", 0, 12, 0.5, 0.65, 1.5);
  headlight.name = "Delivery van dipped headlights";
  root.add(headlight, headlight.target);
  const headlightOrigin = new THREE.Vector3(0, 0.62, 0.9);
  const headlightAim = new THREE.Vector3(0, 0.1, 7);
  const lighthouse = new THREE.Group();
  lighthouse.name = "Lighthouse rotating sea beam";
  lighthouse.position.set(LIGHTHOUSE.x, LIGHTHOUSE.lampY, LIGHTHOUSE.z);
  root.add(lighthouse);
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { night },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float night; varying vec2 vUv;
      void main(){float edge=pow(max(0.,sin(vUv.x*3.14159)),2.);
      // Cone UV interpolation can undershoot zero on Metal. Fractional pow
      // must stay in-domain or a NaN can poison the entire bloom mip chain.
      gl_FragColor=vec4(.65,.82,1.,edge*pow(clamp(vUv.y,0.,1.),1.6)*night*.075);}`,
  });
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.3, 12, 24, 1, true),
    beamMaterial,
  );
  beam.rotation.x = -Math.PI / 2;
  beam.position.z = 6;
  lighthouse.add(beam);
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: "#fff1c5",
    emissive: "#ffdaa0",
    emissiveIntensity: 0,
  });
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 8),
    beaconMaterial,
  );
  lighthouse.add(beacon);
  luminous.add({ material: beaconMaterial, strength: 4 });

  const lightAssignments = new Array(LOCAL_LIGHT_LIMIT).fill(null);
  let rankAge = 1;
  return {
    sources,
    localLights,
    luminous,
    root,
    update(
      { daylight, rainIntensity = 0 },
      elapsed,
      dt,
      target,
      renderer,
      reducedMotion = false,
    ) {
      const strength = nightStrength(daylight);
      night.value = strength;
      time.value = reducedMotion ? 0 : elapsed;
      for (const { material, strength: maximum } of luminous)
        material.emissiveIntensity = maximum * strength + rainIntensity * 0.1;
      glows.visible = pools.visible = lighthouse.visible = strength > 0.001;
      lighthouse.rotation.y = reducedMotion ? 0 : elapsed * 0.15;
      glowMaterial.uniforms.pixelScale.value = renderer
        ? renderer.domElement.height * 0.9
        : 800;
      sources.forEach((source, i) => {
        if (!source.object) return;
        source.object.updateWorldMatrix(true, false);
        source.object.getWorldPosition(source.position);
        let visible = true;
        for (let o = source.object; o; o = o.parent) visible &&= o.visible;
        source.position.toArray(positions, i * 3);
        sizes[i] = visible ? 0.36 : 0;
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.glowSize.needsUpdate = true;
      rankAge += dt;
      if (rankAge > 0.6) {
        rankAge = 0;
        const nearest = groundSources
          .slice()
          .sort(
            (a, b) =>
              a.position.distanceToSquared(target) -
              b.position.distanceToSquared(target),
          )
          .slice(0, LOCAL_LIGHT_LIMIT);
        for (let i = 0; i < LOCAL_LIGHT_LIMIT; i++) {
          if (!nearest.includes(lightAssignments[i])) {
            lightAssignments[i] = null;
            localLights[i].intensity = 0;
          }
        }
        for (const source of nearest)
          if (!lightAssignments.includes(source)) {
            const index = lightAssignments.indexOf(null);
            if (index < 0) break;
            lightAssignments[index] = source;
            localLights[index].position.copy(source.position);
            localLights[index].color.copy(source.color);
          }
      }
      localLights.forEach((light, i) => {
        light.intensity = THREE.MathUtils.damp(
          light.intensity,
          lightAssignments[i] ? strength * 7 : 0,
          4,
          dt,
        );
      });
      w.van.updateWorldMatrix(true, false);
      headlight.position.copy(headlightOrigin).applyMatrix4(w.van.matrixWorld);
      headlight.target.position
        .copy(headlightAim)
        .applyMatrix4(w.van.matrixWorld);
      headlight.intensity = w.van.visible ? strength * 11 : 0;
      return {
        strength,
        sourceCount: sources.length,
        localLightCount: localLights.length,
      };
    },
  };
}
