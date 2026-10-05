import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { optimizeWorld } from "../src/optimize-world.js";
import {
  createWorldLighting,
  LOCAL_LIGHT_LIMIT,
  nightStrength,
} from "../src/world-lighting.js";

test("night practicals illuminate optimized scenery and switch off cleanly in daytime", () => {
  const w = buildWorld(),
    scene = new THREE.Scene();
  scene.add(w.world);
  const lighting = createWorldLighting(scene, w);
  optimizeWorld(w);
  const target = new THREE.Vector3(4, 0, 1);
  for (let frame = 0; frame < 120; frame++)
    lighting.update({ daylight: 0.13 }, frame / 30, 1 / 30, target);
  assert.equal(lighting.localLights.length, LOCAL_LIGHT_LIMIT);
  assert.ok(lighting.sources.length >= 30);
  assert.ok(lighting.localLights.every((light) => light.intensity > 6));
  assert.ok(
    [...lighting.luminous].every(
      ({ material }) => material.emissiveIntensity > 1,
    ),
  );
  assert.equal(w.streetLights.length, 0, "legacy square pools are removed");
  scene.traverse((object) => {
    if (object.geometry?.attributes?.position)
      assert.ok(
        object.geometry.attributes.position.array.every(Number.isFinite),
        object.name,
      );
  });
  const before = lighting.localLights.map((light) =>
    light.position.toArray().join(),
  );
  target.set(32, 0, 36);
  lighting.update({ daylight: 0.13 }, 8, 1, target);
  assert.notDeepEqual(
    lighting.localLights.map((light) => light.position.toArray().join()),
    before,
    "light budget follows the viewed district",
  );
  for (let frame = 0; frame < 120; frame++)
    lighting.update({ daylight: 1 }, frame / 30, 1 / 30, target);
  assert.ok(lighting.localLights.every((light) => light.intensity < 0.001));
  assert.ok(
    [...lighting.luminous].every(
      ({ material }) => material.emissiveIntensity === 0,
    ),
  );
});

test("night transition is bounded and continuous and reduced motion freezes the lighthouse", () => {
  let previous = 1;
  for (let light = 0; light <= 1.01; light += 0.01) {
    const amount = nightStrength(light);
    assert.ok(amount >= 0 && amount <= 1 && amount <= previous);
    assert.ok(previous - amount < 0.04);
    previous = amount;
  }
  const w = buildWorld(),
    lighting = createWorldLighting(new THREE.Scene(), w);
  const beam = lighting.root.getObjectByName("Lighthouse rotating sea beam");
  lighting.update(
    { daylight: 0.13 },
    2,
    1 / 30,
    new THREE.Vector3(),
    null,
    true,
  );
  const pose = beam.quaternion.clone();
  lighting.update(
    { daylight: 0.13 },
    17,
    1 / 30,
    new THREE.Vector3(),
    null,
    true,
  );
  assert.ok(beam.quaternion.equals(pose));
  lighting.update(
    { daylight: 0.13 },
    17,
    1 / 30,
    new THREE.Vector3(),
    null,
    false,
  );
  assert.ok(!beam.quaternion.equals(pose));
});

test("hidden vehicles cannot leave detached nighttime glow points", () => {
  const w = buildWorld();
  const lighting = createWorldLighting(new THREE.Scene(), w);
  const source = lighting.sources.findIndex(
    (entry) => entry.object?.name === "Jetpack charge indicator",
  );
  assert.ok(source >= 0);
  const glows = lighting.root.getObjectByName(
    "Soft lantern and navigation halos",
  );
  w.jetpack.visible = false;
  lighting.update({ daylight: 0.13 }, 0, 1 / 30, new THREE.Vector3());
  assert.equal(glows.geometry.attributes.glowSize.getX(source), 0);
  w.jetpack.visible = true;
  w.jetpack.position.set(7, 3, -4);
  lighting.update({ daylight: 0.13 }, 1, 1 / 30, new THREE.Vector3());
  assert.ok(glows.geometry.attributes.glowSize.getX(source) > 0);
  assert.ok(
    lighting.sources[source].position.distanceTo(new THREE.Vector3(7, 3, -4)) <
      2,
  );
});
