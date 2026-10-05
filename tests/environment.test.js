import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createAtmosphere } from "../src/world-atmosphere.js";
import { RAIN_OPACITY_GAIN } from "../src/world-rain.js";
import { cloudLayout } from "../src/world-environment.js";

function makeAtmosphere() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog("white", 80, 220);
  const world = { lightMaterials: [], streetLights: [], headlights: [] };
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  const sun = new THREE.DirectionalLight();
  const atmosphere = createAtmosphere(
    scene,
    world,
    ocean,
    sun,
    new THREE.HemisphereLight(),
  );
  return {
    scene,
    atmosphere,
    ocean,
    sun,
    rain: scene.getObjectByName("Environmental rain"),
  };
}

test("rain belongs to the world when couriers or camera focus change", () => {
  const { atmosphere, rain } = makeAtmosphere();
  const clock = () => rain.material.uniforms.uTime.value;
  const state = { storm: true };
  atmosphere.update(state, 8, 1 / 30, new THREE.Vector3(4, 0, 2), false);
  const falling = clock();
  // Drops are placed on the GPU on a world-anchored tile around the viewed
  // district: moving the focus moves the tile, never the mesh or the drops.
  atmosphere.update(state, 8, 0, new THREE.Vector3(25, 9, -18), false);
  assert.deepEqual(rain.position.toArray(), [0, 0, 0]);
  assert.equal(clock(), falling, "no time passes, no drop moves");
  assert.deepEqual(rain.material.uniforms.uCenter.value.toArray(), [25, -18]);
  atmosphere.update(state, 9, 1 / 30, new THREE.Vector3(25, 9, -18), false);
  assert.notEqual(clock(), falling);
  atmosphere.update(state, 1, 1 / 30, new THREE.Vector3(), true);
  const still = clock();
  atmosphere.update(state, 20, 1 / 30, new THREE.Vector3(), true);
  assert.equal(clock(), still, "reduced motion holds the rain in place");
});

test("rain fades in and keeps falling while fading out with gradual lighting", () => {
  const { atmosphere, rain, ocean, sun } = makeAtmosphere();
  let time = 0;
  const advance = (state, dt = 1 / 60) =>
    atmosphere.update(state, (time += dt), dt, new THREE.Vector3(), false);
  assert.equal(rain.visible, false);
  advance({ storm: false });
  const clearSun = sun.intensity;
  advance({ storm: true });
  assert.ok(rain.material.opacity > 0 && rain.material.opacity < 0.02);
  // Rain dims the sun strongly overall, but only gradually frame to frame.
  assert.ok(sun.intensity < clearSun && sun.intensity > clearSun * 0.98);
  for (let i = 0; i < 360; i++) advance({ storm: true });
  const heavyRain = rain.material.opacity;
  const wetRoughness = ocean.material.roughness;
  assert.ok(heavyRain > 0.54);
  assert.equal(
    rain.material.uniforms.uOpacity.value,
    heavyRain * RAIN_OPACITY_GAIN,
  );
  const beforeClearing = rain.material.uniforms.uTime.value;
  const clearing = advance({ storm: false });
  assert.equal(rain.visible, true);
  assert.ok(
    rain.material.opacity < heavyRain &&
      rain.material.opacity > heavyRain * 0.97,
  );
  assert.ok(clearing.stormIntensity > 0.9);
  assert.ok(
    ocean.material.roughness > wetRoughness && ocean.material.roughness < 0.4,
  );
  assert.ok(
    rain.material.uniforms.uTime.value > beforeClearing,
    "the rain keeps falling as it fades",
  );
  // Surfaces stay wet for a while after the rain has gone.
  for (let i = 0; i < 600; i++) advance({ storm: false });
  assert.equal(rain.visible, false);
  assert.ok(rain.material.opacity < 0.001);
  assert.ok(clearing.wetness > 0.5);
});

test("weather transitions have the same duration at different frame rates", () => {
  const atFrameRate = (fps) => {
    const { atmosphere, rain } = makeAtmosphere();
    let weather;
    for (let i = 0; i < fps * 3; i++)
      weather = atmosphere.update(
        { storm: true },
        i / fps,
        1 / fps,
        new THREE.Vector3(),
        false,
      );
    return { rain: rain.material.opacity, storm: weather.stormIntensity };
  };
  const slow = atFrameRate(30),
    fast = atFrameRate(120);
  assert.ok(Math.abs(slow.rain - fast.rain) < 1e-12);
  assert.ok(Math.abs(slow.storm - fast.storm) < 1e-12);
});

test("cloud field varies in spacing, height and silhouette while remaining stable", () => {
  const clouds = cloudLayout();
  assert.deepEqual(cloudLayout(), clouds);
  assert.equal(new Set(clouds.map((c) => c.x)).size, clouds.length);
  assert.equal(new Set(clouds.map((c) => c.z)).size, clouds.length);
  assert.ok(new Set(clouds.map((c) => c.puffs.length)).size >= 4);
  assert.ok(
    Math.max(...clouds.map((c) => c.y)) - Math.min(...clouds.map((c) => c.y)) >
      5,
  );
  assert.ok(clouds.some((c) => c.x < -25) && clouds.some((c) => c.x > 35));
});

test("lightning bolts flash only in storms and respect reduced motion", () => {
  const { atmosphere, scene } = makeAtmosphere();
  const bolt = scene.getObjectByName("Distant lightning");
  const storm = {
    storm: true,
    world: { weather: "storm", hour: 12, light: 1 },
  };
  for (let i = 0; i < 300; i++)
    atmosphere.update(storm, i / 60, 1 / 60, new THREE.Vector3(), false);
  // Slot 2 produces the first double flash.
  const flash = atmosphere.update(
    storm,
    14.75,
    1 / 60,
    new THREE.Vector3(),
    false,
  );
  assert.ok(flash.flash > 0);
  assert.equal(bolt.visible, true);
  assert.equal(bolt.geometry.attributes.position.count, 8);
  atmosphere.update(storm, 14.75, 1 / 60, new THREE.Vector3(), true);
  assert.equal(bolt.visible, false);
  const clear = {
    storm: false,
    world: { weather: "clear", hour: 12, light: 1 },
  };
  atmosphere.update(clear, 14.75, 1 / 60, new THREE.Vector3(), false);
  assert.equal(bolt.visible, false);
});
