import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  command,
  step,
  begin,
  baseline,
  NODES,
  route,
} from "../shared/engine.js";
import { combatStep, ZOMBIE_SPAWNS, zombieSpeed } from "../shared/combat.js";
import { createRouteOverlay } from "../src/route-overlay.js";

test("zombies spawn on central dry streets, approach slowly and only trigger combat nearby", () => {
  const s = fresh();
  s.brandon.position = [...NODES.home];
  command(s, "spawn_zombie");
  const z = s.zombies[0];
  assert.deepEqual(z.position, ZOMBIE_SPAWNS[0].position);
  const start = [...z.position];
  assert.equal(
    combatStep(s, () => {}, NODES, route),
    false,
  );
  assert.ok(
    Math.hypot(...z.position.map((v, i) => v - start[i])) <= zombieSpeed + 1e-8,
  );
  for (let i = 0; i < 200 && !s.brandon.combat; i++)
    combatStep(s, () => {}, NODES, route);
  assert.ok(s.brandon.combat);
  assert.ok(
    Math.hypot(...z.position.map((v, i) => v - s.brandon.position[i])) < 1.8,
  );
});

test("distant zombies cannot be damaged by melee while another is in contact", () => {
  const s = fresh();
  command(s, "spawn_zombie");
  command(s, "spawn_zombie");
  s.zombies[0].position = [s.brandon.position[0], s.brandon.position[1] + 0.8];
  for (let i = 0; i < 7; i++) combatStep(s, () => {}, NODES, route);
  assert.equal(s.zombies[0].hp, 5);
  assert.equal(s.zombies[1].hp, 6);
});

test("rest parks transport, enters the house, charges overnight and walks outside for work", () => {
  const s = fresh();
  s.status = "running";
  s.tick = 600;
  step(s);
  s.vehicles.push("van");
  s.vehicle = "van";
  s.battery = 20;
  s.brandon.mountedMode = "van";
  assert.ok(begin(s, "rest"));
  for (let i = 0; i < 80 && s.brandon.action; i++) step(s);
  assert.equal(s.brandon.homeRoutine.phase, "sleeping");
  assert.equal(s.vehicle, "van");
  assert.equal(s.brandon.mountedMode, "foot");
  assert.equal(s.vehicleLocations.van.node, "home");
  assert.deepEqual(s.brandon.position, [7.45, -4.85]);
  const charge = s.battery;
  for (let i = 0; i < 10; i++) step(s);
  assert.ok(s.battery > charge);
  s.tick = 1440;
  step(s);
  assert.ok(begin(s, baseline(s)));
  assert.equal(s.brandon.homeRoutine.phase, "exiting");
  const inside = [...s.brandon.position];
  step(s);
  assert.notDeepEqual(s.brandon.position, inside);
  assert.notDeepEqual(s.brandon.position, NODES.home);
  for (let i = 0; i < 7; i++) step(s);
  assert.equal(s.brandon.homeRoutine, null);
  assert.deepEqual(s.brandon.position, NODES.home);
});

test("route geometry follows the supplied navigation immediately while dashes flow", () => {
  const overlay = createRouteOverlay();
  const a = [
    [0, 0.43, 0],
    [2, 0.43, 0],
    [4, 0.43, 0],
  ];
  const b = [
    [0, 0.43, 0],
    [2, 0.43, 1],
    [4, 0.43, 0],
  ];
  overlay.update(a, 1 / 60);
  const offset = overlay.line.material.dashOffset;
  overlay.update(b, 1 / 60);
  const attr = overlay.line.geometry.attributes.instanceEnd;
  assert.equal(attr.getZ(0), 1);
  assert.equal(attr.getZ(1), 0);
  assert.ok(overlay.line.material.dashOffset < offset);
  const paused = overlay.line.material.dashOffset;
  overlay.update(b, 1 / 60, false);
  assert.equal(overlay.line.material.dashOffset, paused);
  assert.equal(overlay.line.geometry.attributes.instanceStart.getX(0), 0);
  overlay.line.geometry.dispose();
  overlay.line.material.dispose();
});
