import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { createCombatWorld } from "../src/world-combat.js";
import { optimizeWorld } from "../src/optimize-world.js";
import { fresh, command, step } from "../shared/engine.js";

test("sculpted zombies retain painted articulated parts through scenery batching, render combat and fall on defeat", () => {
  const w = buildWorld(),
    combat = createCombatWorld(w);
  const root = w.world.getObjectByName("Zombie encounters");
  const g = root.children[0];
  const coat = g.getObjectByName("coat");
  assert.ok(coat.geometry.attributes.position.count > 100);
  assert.equal(g.userData.townJoints.elbows.length, 2);
  const hand = g.getObjectByName("hand");
  assert.equal(hand.material.color.getHexString(), "9cae72");
  optimizeWorld(w);
  assert.equal(coat.parent, g);
  const s = fresh();
  s.status = "running";
  command(s, "spawn_zombie");
  s.zombies[0].position = [s.brandon.position[0], s.brandon.position[1] + 0.8];
  step(s);
  step(s);
  step(s);
  const motion = {
    position: new THREE.Vector3(
      ...[s.brandon.position[0], 0.43, s.brandon.position[1]],
    ),
  };
  combat.update(s, motion, 1, false);
  assert.ok(g.visible);
  assert.ok(w.brandon.visible);
  assert.equal(w.driver.visible, false);
  assert.ok(w.body.getObjectByName("right arm").rotation.x < 0);
  assert.ok(
    g.userData.limbs
      .filter((o) => o.name === "arm")
      .every((o) => o.rotation.x < -0.9),
  );
  while (s.zombies[0]?.hp > 0) step(s);
  step(s);
  // Play the swing, the contact and the topple a frame at a time.
  for (let t = 2; t < 5; t += 0.05) combat.update(s, motion, t, false);
  // Toppled like a board onto its side, not rotated backwards.
  assert.ok(Math.abs(g.rotation.z) > 1.4);
  assert.ok(Math.abs(g.rotation.x) < 0.01);
  combat.update(s, motion, 5.1, true);
  assert.ok(Math.abs(g.rotation.z) > 1.4);
});

test("every weapon is built into Brandon's right hand and fires visible particle effects", () => {
  const w = buildWorld(),
    combat = createCombatWorld(w);
  const forearm = w.body
    .getObjectByName("right arm")
    .children.find((o) => o.isBone);
  for (const id of ["machete", "gun", "spray", "particle_gun"]) {
    const prop = w.body.getObjectByName(`Defense ${id}`);
    assert.equal(prop?.parent, forearm, `${id} is held by the right hand`);
    assert.ok(prop.getObjectByName("muzzle"), `${id} has a muzzle`);
  }
  for (const [weapon, minimum] of [
    ["gun", 10],
    ["spray", 100],
    ["particle_gun", 40],
  ]) {
    const s = fresh();
    s.status = "running";
    s.money = 5000;
    for (const id of ["machete", "gun", "spray", "particle_gun"]) {
      command(s, "buy_weapon", id);
      if (id === weapon) break;
    }
    command(s, "spawn_zombie");
    s.zombies[0].hp = s.zombies[0].maxHp = 60;
    s.zombies[0].position = [
      s.brandon.position[0] + 0.8,
      s.brandon.position[1],
    ];
    const motion = {
      position: new THREE.Vector3(
        s.brandon.position[0],
        0.43,
        s.brandon.position[1],
      ),
    };
    let peak = 0,
      time = 0;
    for (let tick = 0; tick < 12; tick++) {
      step(s);
      for (let f = 0; f < 25; f++) {
        time += 0.016;
        combat.update(s, motion, time, false);
        peak = Math.max(peak, combat.fxCount());
      }
    }
    assert.ok(peak >= minimum, `${weapon} simulated ${peak} particles`);
    // Reduced motion suppresses the simulation entirely.
    combat.update(s, motion, time + 1, true);
    assert.equal(combat.fxCount(), 0);
  }
});
