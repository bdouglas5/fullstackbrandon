// Optional visitor-spawned encounters. All timing and purchases live in the
// authoritative simulation so saves, replay and controller comparisons agree.
export const WEAPONS = {
  fists: {
    name: "Bare fists",
    price: 0,
    damage: 1,
    interval: 4,
    targets: 1,
    description: "Punch one zombie at a time.",
  },
  machete: {
    name: "Machete",
    price: 40,
    damage: 3,
    interval: 3,
    targets: 1,
    prerequisite: "fists",
    description: "Faster close-range strikes against one zombie.",
  },
  gun: {
    name: "Gun",
    price: 90,
    damage: 6,
    interval: 2,
    targets: 1,
    prerequisite: "machete",
    description: "A painted miniature pistol. One zombie per shot.",
  },
  spray: {
    name: "Zombie spray",
    price: 170,
    damage: 6,
    interval: 2,
    targets: 3,
    prerequisite: "gun",
    description:
      "Upgrade the gun with a green particle spray that clears up to three zombies.",
  },
  particle_gun: {
    name: "Particle gun",
    price: 280,
    damage: 6,
    interval: 1,
    targets: 5,
    prerequisite: "spray",
    description:
      "The final upgrade: disintegrates up to five zombies into glowing particles.",
  },
};
export const MAX_ZOMBIES = 5;
// Central streets and the shaded garden edge, all on navigable dry ground.
export const ZOMBIE_SPAWNS = [
  { node: "ne", position: [1.5, -3.4] },
  { node: "east", position: [1.5, 2] },
  { node: "workshop", position: [4, -3.4] },
  { node: "nw", position: [-1.5, -3.4] },
  { node: "garden", position: [-4, -3.4] },
];
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const zombieSpeed = 0.11;
function approachZombies(s, live, nodes, findRoute) {
  const b = s.brandon;
  const target =
    b.combat?.position ||
    (!b.voyage
      ? b.homeRoutine?.phase === "sleeping"
        ? nodes.home || b.position
        : b.position
      : null);
  for (const z of live) {
    // A struck zombie reels for a tick before it shambles forward again.
    if (z.staggerUntil > s.tick) continue;
    if (!z.position) {
      const spawn =
        ZOMBIE_SPAWNS[(Number(z.id.slice(1)) - 1) % ZOMBIE_SPAWNS.length];
      z.position = [...spawn.position];
      z.node = spawn.node;
    }
    if (!target) continue;
    if (gap(z.position, target) <= 0.78) continue;
    let goal = target;
    if (findRoute && gap(z.position, target) > 1.8) {
      if (!z.move) {
        const nearest = Object.keys(nodes)
          .filter((n) => nodes[n][1] < 12)
          .sort((a, c) => gap(nodes[a], target) - gap(nodes[c], target))[0];
        const path = findRoute(z.node, nearest, s.bridgeClosed, s.traffic);
        if (path.length > 1) z.move = { to: path[1] };
      }
      if (z.move) goal = nodes[z.move.to];
    }
    const distance = gap(z.position, goal);
    if (!distance) continue;
    const amount = Math.min(
      zombieSpeed,
      distance,
      Math.max(0, gap(z.position, target) - 0.78),
    );
    const old = z.position;
    z.position = old.map((v, i) => v + ((goal[i] - v) * amount) / distance);
    z.heading = Math.atan2(z.position[0] - old[0], z.position[1] - old[1]);
    if (z.move && gap(z.position, goal) < 0.001) {
      z.node = z.move.to;
      z.move = null;
    }
  }
}
export function normalizeCombat(s) {
  s.defense ||= {
    weapon: "fists",
    owned: ["fists"],
    defeated: 0,
    nextId: 1,
  };
  s.zombies ||= [];
  return s.defense;
}
export function weaponStats(s) {
  return WEAPONS[normalizeCombat(s).weapon];
}
export function combatCommand(s, type, id, event) {
  const d = normalizeCombat(s);
  if (type === "spawn_zombie") {
    if (s.zombies.filter((z) => z.hp > 0).length >= MAX_ZOMBIES)
      throw new Error("Only five live zombies can be spawned at once.");
    s.zombies.push({
      id: `z${d.nextId++}`,
      hp: 6,
      maxHp: 6,
      position: [
        ...ZOMBIE_SPAWNS[(d.nextId - 2) % ZOMBIE_SPAWNS.length].position,
      ],
      node: ZOMBIE_SPAWNS[(d.nextId - 2) % ZOMBIE_SPAWNS.length].node,
      spawnedAt: s.tick,
    });
    event(
      s,
      "disruption",
      "A zombie emerges from the island’s central streets and slowly follows Brandon.",
    );
    return;
  }
  if (!WEAPONS[id] || (id === "fists" && type !== "equip_weapon"))
    throw new Error("Choose a purchasable weapon.");
  if (s.brandon.combat)
    throw new Error("Finish the encounter before changing equipment.");
  if (type === "equip_weapon") {
    if (!d.owned.includes(id)) throw new Error("Buy this weapon first.");
    d.weapon = id;
    event(s, "combat", `Equipped ${WEAPONS[id].name.toLowerCase()}.`);
    return;
  }
  if (d.owned.includes(id)) throw new Error("This weapon is already owned.");
  if (!d.owned.includes(WEAPONS[id].prerequisite))
    throw new Error(
      `Get ${WEAPONS[WEAPONS[id].prerequisite].name.toLowerCase()} first.`,
    );
  const cost = WEAPONS[id].price;
  if (s.money < cost) throw new Error(`Save ${cost} coins for this purchase.`);
  s.money -= cost;
  s.spent += cost;
  d.owned.push(id);
  d.weapon = id;
  event(
    s,
    "combat",
    `Purchased ${WEAPONS[id].name.toLowerCase()} for ${cost} coins.`,
  );
}
export function combatStep(s, event, nodes = {}, findRoute = null) {
  const d = normalizeCombat(s),
    b = s.brandon;
  s.zombies = s.zombies.filter((z) => z.hp > 0 || s.tick - z.diedAt < 5);
  let live = s.zombies.filter((z) => z.hp > 0);
  approachZombies(s, live, nodes, findRoute);
  const ground = b.voyage?.onShore
    ? b.voyage.courierPosition
    : !b.voyage
      ? b.position
      : null;
  const nearby = ground && live.some((z) => gap(z.position, ground) < 1.8);
  // Never dismount into the sea or interrupt a landing/boarding transition.
  if (
    !b.combat &&
    nearby &&
    b.homeRoutine?.phase !== "sleeping" &&
    (!b.voyage || (b.voyage.onShore && b.voyage.courierPosition)) &&
    !b.transition &&
    !b.slip &&
    !b.buildingVisit &&
    !b.vehicleApproach
  ) {
    const parked = [...(b.voyage?.courierPosition || b.position)];
    const from = nodes[b.move?.from],
      to = nodes[b.move?.to];
    const heading =
      from && to ? Math.atan2(to[0] - from[0], to[1] - from[1]) : 0;
    const vehicle = b.voyage?.onShore ? "foot" : b.mountedMode || s.vehicle;
    let nx = Math.cos(heading),
      nz = -Math.sin(heading);
    // Step onto the visible sidewalk side, never into the parked chassis.
    if (nz < -0.001 || (Math.abs(nz) < 0.001 && nx < 0)) {
      nx = -nx;
      nz = -nz;
    }
    const offset =
      vehicle === "foot"
        ? 0
        : vehicle === "van"
          ? 1.15
          : vehicle === "helicopter"
            ? 1.4
            : 0.65;
    b.combat = {
      parkedPosition: parked,
      phase: "dismount",
      elapsed: 0,
      strikes: 0,
      position: [parked[0] + nx * offset, parked[1] + nz * offset],
      heading: vehicle === "foot" ? heading : Math.atan2(nx, nz),
      vehicle,
    };
    event(
      s,
      "combat",
      `Brandon stops his trip to fight with ${WEAPONS[d.weapon].name.toLowerCase()}.`,
    );
  }
  const c = b.combat;
  if (!c) return false;
  const closest = live
    .slice()
    .sort(
      (a, b) => gap(a.position, c.position) - gap(b.position, c.position),
    )[0];
  if (closest)
    c.heading = Math.atan2(
      closest.position[0] - c.position[0],
      closest.position[1] - c.position[1],
    );
  c.elapsed++;
  if (c.phase === "dismount" && c.elapsed >= 3) {
    c.phase = "attack";
    c.elapsed = 0;
  } else if (c.phase === "attack") {
    const weapon = weaponStats(s);
    if (c.elapsed % weapon.interval === 0) {
      c.strikes++;
      c.lastStrikeAt = s.tick;
      const melee = ["fists", "machete"].includes(d.weapon);
      // Every third melee blow is a heavy finisher that hits harder in feel
      // (knockback, longer stagger) but not in damage, so balance is unchanged.
      c.finisher = melee && c.strikes % 3 === 0;
      c.weapon = d.weapon;
      for (const z of live
        .filter((z) => gap(z.position, c.position) <= (melee ? 1.05 : 2.5))
        .slice(0, weapon.targets)) {
        const away = gap(z.position, c.position) || 1;
        z.hitDir = [
          (z.position[0] - c.position[0]) / away,
          (z.position[1] - c.position[1]) / away,
        ];
        z.hitBy = d.weapon;
        z.hitHeavy = c.finisher;
        z.hits = (z.hits || 0) + 1;
        z.hp = Math.max(0, z.hp - weapon.damage);
        z.hitAt = s.tick;
        // Knockback and stagger: contact-range blows stay inside melee reach.
        const push = (melee ? 0.1 : 0.16) * (c.finisher ? 1.8 : 1);
        z.position = [
          z.position[0] + z.hitDir[0] * push,
          z.position[1] + z.hitDir[1] * push,
        ];
        z.staggerUntil = s.tick + (c.finisher ? 2 : 1);
        if (!z.hp) {
          z.diedAt = s.tick;
          z.defeatedBy = d.weapon;
          d.defeated++;
        }
      }
    }
    if (!live.some((z) => z.hp > 0 && gap(z.position, c.position) < 2.5)) {
      c.phase = "remount";
      c.elapsed = 0;
    }
  } else if (c.phase === "remount") {
    if (live.some((z) => gap(z.position, c.position) < 1.8)) {
      c.phase = "attack";
      c.elapsed = 0;
    } else if (c.elapsed >= 3) {
      b.combat = null;
      event(
        s,
        "combat",
        "The path is clear. Brandon resumes his delivery with the same cargo and transport.",
      );
    }
  }
  return true;
}
