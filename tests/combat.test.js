import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  command,
  step,
  begin,
  baseline,
  clone,
  inventoryTotal,
} from "../shared/engine.js";
import { WEAPONS, combatStep, weaponStats } from "../shared/combat.js";
function encounter(weapon = "fists", count = 5, vehicle = "foot") {
  const s = fresh();
  s.status = "running";
  if (vehicle !== "foot") {
    s.vehicles.push(vehicle);
    s.vehicle = vehicle;
  }
  if (weapon !== "fists") {
    s.money = 1000;
    for (const id of Object.keys(WEAPONS).slice(1)) {
      command(s, "buy_weapon", id);
      if (id === weapon) break;
    }
  }
  begin(s, baseline(s));
  s.brandon.mountedMode = vehicle;
  for (let i = 0; i < count; i++) command(s, "spawn_zombie");
  // Combat mechanics fixtures start at contact; spawn/pursuit has separate tests.
  const offset =
    vehicle === "foot"
      ? 0
      : vehicle === "van"
        ? 1.15
        : vehicle === "helicopter"
          ? 1.4
          : 0.65;
  s.zombies.forEach(
    (z) =>
      (z.position = [
        s.brandon.position[0] + offset + 0.1,
        s.brandon.position[1] + 0.78,
      ]),
  );
  return s;
}
function clear(s) {
  let n = 0;
  do {
    step(s);
    assert.ok(++n < 200);
  } while (s.brandon.combat || s.zombies.some((z) => z.hp > 0));
  return n;
}
test("spawn is capped at five and preserves the assigned trip and cargo", () => {
  const s = encounter();
  const before = clone(s.brandon),
    stock = inventoryTotal(s);
  assert.throws(() => command(s, "spawn_zombie"), /five/);
  clear(s);
  assert.equal(s.defense.defeated, 5);
  assert.equal(inventoryTotal(s), stock);
  assert.equal(s.brandon.action, before.action);
  assert.equal(s.brandon.orderId, before.orderId);
  assert.deepEqual(s.brandon.position, before.position);
  assert.equal(s.brandon.work, before.work);
  const position = [...s.brandon.position];
  step(s);
  assert.ok(
    s.brandon.move ||
      s.brandon.work ||
      s.brandon.position.some((p, i) => p !== position[i]),
  );
  command(s, "spawn_zombie");
  assert.equal(s.zombies.filter((z) => z.hp > 0).length, 1);
});
test("fists attack one at a time, all four weapon upgrades clear groups progressively faster", () => {
  const s = encounter();
  for (let i = 0; i < 7; i++) step(s);
  assert.deepEqual(
    s.zombies.map((z) => z.hp),
    [5, 6, 6, 6, 6],
  );
  const times = Object.keys(WEAPONS).map((id) => clear(encounter(id)));
  for (let i = 1; i < times.length; i++)
    assert.ok(times[i] < times[i - 1], times.join(", "));
});
test("every transport is retained across dismount, fight and remount", () => {
  for (const vehicle of [
    "foot",
    "bike",
    "van",
    "rocket_skates",
    "sailboat",
    "helicopter",
    "jetpack",
    "teleporter",
  ]) {
    const s = encounter("fists", 1, vehicle);
    step(s);
    assert.equal(s.brandon.combat.phase, "dismount");
    assert.equal(s.brandon.combat.vehicle, vehicle);
    assert.equal(begin(s, baseline(s)), false);
    clear(s);
    assert.equal(s.vehicle, vehicle);
    assert.equal(s.brandon.mountedMode, vehicle);
  }
});
test("four paid weapon tiers enforce prerequisites and cap at the particle gun", () => {
  const s = fresh();
  assert.throws(() => command(s, "buy_weapon", "machete"), /Save/);
  assert.throws(() => command(s, "buy_weapon", "unknown"), /weapon/);
  s.money = 1000;
  const spent = s.spent;
  assert.throws(() => command(s, "buy_weapon", "gun"), /machete first/);
  command(s, "buy_weapon", "machete");
  assert.equal(s.money, 960);
  assert.equal(s.spent, spent + 40);
  assert.throws(() => command(s, "buy_weapon", "machete"), /already/);
  assert.throws(() => command(s, "equip_weapon", "particle_gun"), /first/);
  for (const id of ["gun", "spray", "particle_gun"])
    command(s, "buy_weapon", id);
  assert.equal(s.money, 420);
  assert.equal(s.spent, spent + 580);
  assert.equal(weaponStats(s).targets, 5);
  assert.deepEqual(s.defense.owned, [
    "fists",
    "machete",
    "gun",
    "spray",
    "particle_gun",
  ]);
  assert.throws(() => command(s, "upgrade_weapon", "particle_gun"), /Unknown/);
  command(s, "equip_weapon", "fists");
  assert.equal(weaponStats(s).targets, 1);
});
test("voyages and transitions defer zombies until safe ground; paused combat does not advance", () => {
  const s = encounter("fists", 1);
  s.brandon.voyage = { position: [0, 12], mode: "sailboat" };
  assert.equal(
    combatStep(s, () => {}),
    false,
  );
  assert.ok(s.zombies[0].position);
  s.brandon.voyage = null;
  s.brandon.transition = { phase: "board" };
  assert.equal(
    combatStep(s, () => {}),
    false,
  );
  s.brandon.transition = null;
  step(s);
  s.status = "paused";
  const before = clone(s);
  step(s);
  assert.deepEqual(s, before);
  assert.throws(() => command(s, "buy_weapon", "machete"), /encounter/);
});
test("serialized encounters resume deterministically and clicks during remount join the fight", () => {
  const s = encounter("particle_gun", 1);
  while (s.brandon.combat?.phase !== "remount") step(s);
  command(s, "spawn_zombie");
  s.zombies.at(-1).position = [
    s.brandon.combat.position[0],
    s.brandon.combat.position[1] + 0.8,
  ];
  const restored = JSON.parse(JSON.stringify(s));
  clear(s);
  clear(restored);
  assert.deepEqual(restored, JSON.parse(JSON.stringify(s)));
  assert.equal(s.defense.defeated, 2);
});

test("zombies can interrupt island deliveries at the real onshore courier position", () => {
  const s = fresh();
  command(s, "spawn_zombie");
  s.brandon.voyage = {
    mode: "sailboat",
    onShore: true,
    courierPosition: [16, 21],
  };
  s.zombies[0].position = [16, 21.8];
  combatStep(s, () => {});
  assert.deepEqual(s.brandon.combat.position, [16, 21]);
  assert.ok(s.zombies[0].position[0] > 15);
});
