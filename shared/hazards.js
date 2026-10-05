// Visitor-triggered obstacles: the harbor creature's toll and oil spills.
// Everything lives in the authoritative simulation so saves, replay and
// controller comparisons agree. One tick is one simulated minute.
export const CREATURE = {
  holdMin: 90,
  holdMax: 120,
  toll: 6,
  // The tentacles let go slowly: the vessel stays put while they sink.
  releaseTicks: 4,
  grabAt: 0.4,
};
export const OIL = {
  radius: 0.85,
  lifetime: 1440,
  max: 6,
  snap: 1.6,
  // Spin for five ticks, then sit dazed for three.
  spinTicks: 5,
  slipTicks: 8,
  cleanTicks: 8,
  approach: 3.6,
};
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function normalizeHazards(s) {
  s.hazards ||= {};
  const h = s.hazards;
  h.creature ||= { enabled: false, nextId: 1, grabs: 0, paid: 0, pickles: 0 };
  h.spills ||= [];
  h.nextSpill ||= 1;
  h.slips ||= 0;
  h.cleaned ||= 0;
  return h;
}
export const liveSpills = (s) =>
  (s.hazards?.spills || []).filter((x) => !x.cleanedAt);

// ---------------------------------------------------------------------------
// Harbor creature.

function holdLength(s, salt) {
  const span = CREATURE.holdMax - CREATURE.holdMin + 1;
  return (
    CREATURE.holdMin +
    ((Math.abs(s.seed || 0) * 31 + s.tick * 17 + salt * 13) % span)
  );
}
function newHold(s, kind, position) {
  const c = s.hazards.creature,
    id = c.nextId++;
  c.grabs++;
  return {
    id,
    kind,
    at: s.tick,
    until: s.tick + holdLength(s, id),
    position: [...position],
    status: "holding",
    paid: false,
    releasedAt: null,
  };
}
const releasing = (hold, tick) => {
  if (hold.status === "holding" && tick >= hold.until) {
    hold.status = "releasing";
    hold.releasedAt = tick;
  }
  return (
    hold.status === "releasing" &&
    tick - hold.releasedAt >= CREATURE.releaseTicks
  );
};
export function creatureHolds(s) {
  const out = [];
  const v = s.brandon?.voyage;
  if (v?.held)
    out.push({ target: "brandon", hold: v.held, label: "Brandon's boat" });
  for (const x of s.operations?.shipments || [])
    if (x.held)
      out.push({ target: x.id, hold: x.held, label: "The cargo boat" });
  return out;
}

/** Called while Brandon sails. Returns true while the tentacles hold the boat. */
export function voyageHold(s, b, event) {
  const v = b.voyage,
    c = normalizeHazards(s).creature;
  if (v.held) {
    if (releasing(v.held, s.tick)) {
      v.held = null;
      return false;
    }
    return true;
  }
  const stage = v.stages?.[v.stageIndex];
  if (
    !c.enabled ||
    b.id !== "brandon" ||
    v.mode !== "sailboat" ||
    v.grabbed ||
    !stage ||
    stage.onShore ||
    stage.ticks < 8 ||
    v.stageWork / stage.ticks < CREATURE.grabAt
  )
    return false;
  v.grabbed = true;
  v.held = newHold(s, "boat", v.vehiclePosition || v.position);
  event(
    s,
    "disruption",
    "Purple tentacles rise from the harbor and wrap Brandon's boat. Wait for the creature to let go, or pay its toll in pickles.",
  );
  return true;
}

/** Once per tick: grab the cargo boat mid-crossing and keep held ships frozen. */
export function creatureStep(s, event) {
  const c = normalizeHazards(s).creature;
  for (const x of s.operations?.shipments || []) {
    if (x.held) {
      if (releasing(x.held, s.tick)) {
        x.held = null;
        event(s, "shipment", "The creature let go. The cargo boat sails on.");
        continue;
      }
      // Shifting both ends keeps the vessel exactly where the tentacles are.
      if (x.held.status === "holding" || x.held.status === "releasing") {
        x.arrivesAt++;
        if (x.departsAt != null) x.departsAt++;
      }
      continue;
    }
    if (!c.enabled || x.status !== "at_sea" || x.grabbed) continue;
    const from = x.departsAt ?? x.orderedAt,
      span = Math.max(1, x.arrivesAt - from),
      p = (s.tick - from) / span;
    if (p < CREATURE.grabAt || span < 8) continue;
    x.grabbed = true;
    x.held = newHold(s, "cargo", [0, 0]);
    event(
      s,
      "disruption",
      "Tentacles grab the pickle cargo boat. The shipment is stuck until the creature lets go or is paid.",
    );
  }
}

export function pickleStock(s) {
  return (
    (s.cafe || 0) +
    (s.operations?.oldWarehouse || 0) +
    (s.harbor || 0) +
    (s.carry || 0)
  );
}
export function payToll(s, target, event) {
  const c = normalizeHazards(s).creature;
  const found = creatureHolds(s).find(
    (x) => x.target === (target || "brandon") && x.hold.status === "holding",
  );
  if (!found) throw new Error("Nothing is being held right now.");
  if (pickleStock(s) < CREATURE.toll)
    throw new Error(`The creature wants ${CREATURE.toll} pickle cases.`);
  let owed = CREATURE.toll;
  for (const key of ["cafe", "oldWarehouse", "harbor", "carry"]) {
    const holder = key === "oldWarehouse" ? s.operations : s;
    const n = Math.min(owed, holder[key] || 0);
    holder[key] -= n;
    owed -= n;
  }
  c.pickles += CREATURE.toll;
  c.paid++;
  found.hold.paid = true;
  found.hold.until = s.tick;
  event(
    s,
    "disruption",
    `Paid the creature ${CREATURE.toll} pickle cases. It lets go.`,
  );
}
export function setCreature(s, enabled, event) {
  const c = normalizeHazards(s).creature;
  c.enabled = !!enabled;
  if (!c.enabled)
    for (const { hold } of creatureHolds(s))
      if (hold.status === "holding") hold.until = s.tick;
  event(
    s,
    "disruption",
    c.enabled
      ? "Something stirs beneath the harbor. Boats crossing the water may be grabbed."
      : "The harbor creature sinks back to sleep.",
  );
}

// ---------------------------------------------------------------------------
// Oil spills.

/** Nearest point on any road edge, as a world position. */
export function snapToRoad(point, nodes, edges) {
  let best = null;
  for (const [a, b] of edges) {
    const A = nodes[a],
      B = nodes[b];
    if (!A || !B) continue;
    const dx = B[0] - A[0],
      dz = B[1] - A[1],
      len2 = dx * dx + dz * dz || 1;
    const t = Math.max(
      0,
      Math.min(1, ((point[0] - A[0]) * dx + (point[1] - A[1]) * dz) / len2),
    );
    const at = [A[0] + dx * t, A[1] + dz * t],
      d = gap(point, at);
    if (!best || d < best.distance)
      best = { distance: d, position: at, edge: [a, b] };
  }
  return best;
}
// Deterministic from the seed and tick so replays reproduce the same spot.
function randomRoadSpot(s, nodes, edges) {
  const roads = edges
    .map(([a, b]) => ({ a: nodes[a], b: nodes[b] }))
    .filter((r) => r.a && r.b && gap(r.a, r.b) >= 3);
  const total = roads.reduce((n, r) => n + gap(r.a, r.b), 0);
  const base =
    Math.abs(s.seed || 0) * 131 +
    s.tick * 17 +
    (s.hazards?.nextSpill || 1) * 977;
  for (let i = 0; i < 40; i++) {
    const rand = (k) => {
      const v = Math.sin((base + i * 53 + k * 7919) * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    let pick = rand(1) * total,
      road = roads[0];
    for (const r of roads) {
      pick -= gap(r.a, r.b);
      if (pick <= 0) {
        road = r;
        break;
      }
    }
    const t = 0.15 + rand(2) * 0.7;
    const spot = {
      x: road.a[0] + (road.b[0] - road.a[0]) * t,
      z: road.a[1] + (road.b[1] - road.a[1]) * t,
    };
    if (
      !liveSpills(s).some(
        (o) => gap([o.x, o.z], [spot.x, spot.z]) < OIL.radius * 2,
      )
    )
      return spot;
  }
  throw new Error("The roads are already covered in oil.");
}
export function placeSpill(s, value, nodes, edges, event) {
  const h = normalizeHazards(s);
  if (liveSpills(s).length >= OIL.max)
    throw new Error(`Only ${OIL.max} oil spills can be on the road at once.`);
  // No spot given: the oil turns up somewhere random on the street.
  if (value == null) value = randomRoadSpot(s, nodes, edges);
  const x = Number(value?.x),
    z = Number(value?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z))
    throw new Error("Choose a spot on the road.");
  const hit = snapToRoad([x, z], nodes, edges);
  if (!hit || hit.distance > OIL.snap)
    throw new Error("Oil spills have to be placed on a road.");
  if (liveSpills(s).some((o) => gap([o.x, o.z], hit.position) < OIL.radius))
    throw new Error("There is already oil there.");
  h.spills.push({
    id: `oil${h.nextSpill++}`,
    x: Number(hit.position[0].toFixed(3)),
    z: Number(hit.position[1].toFixed(3)),
    edge: hit.edge,
    placedAt: s.tick,
    expiresAt: s.tick + OIL.lifetime,
    cleaning: 0,
    cleanedAt: null,
  });
  event(s, "disruption", "An oil spill spreads across the road.");
}

/** Spills dry up after a full day if nobody cleans them. */
export function spillStep(s) {
  const h = normalizeHazards(s);
  h.spills = h.spills.filter(
    (o) =>
      (!o.cleanedAt || s.tick - o.cleanedAt < 6) && s.tick < o.expiresAt + 6,
  );
  for (const o of h.spills)
    if (!o.cleanedAt && s.tick >= o.expiresAt) o.cleanedAt = s.tick;
}

/** Advances a spin-out in progress. True while the actor must stay put. */
export function slipHold(b) {
  if (!b.slip) return false;
  b.slip.elapsed++;
  if (b.slip.elapsed < OIL.slipTicks) return true;
  b.slip = null;
  return false;
}
// First point where the sweep a -> c enters the circle around o, or null.
function segmentHit(a, c, o) {
  const dx = c[0] - a[0],
    dz = c[1] - a[1],
    fx = a[0] - o[0],
    fz = a[1] - o[1];
  const C = fx * fx + fz * fz - OIL.radius ** 2;
  if (C <= 0) return [...a];
  const A = dx * dx + dz * dz,
    B = 2 * (fx * dx + fz * dz),
    disc = B * B - 4 * A * C;
  if (!A || disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? [a[0] + dx * t, a[1] + dz * t] : null;
}
/**
 * After an actor moves from `from` to `to`, start a spin-out if the sweep
 * crossed fresh oil. Returns the point where the slip begins, or null.
 * Equipped rocket skates spin with Brandon, just like other road transport.
 */
export function slipCheck(s, b, mode, from, to, event) {
  const spills = liveSpills(s);
  if (!spills.length) {
    b.slipFree = null;
    return null;
  }
  // A vehicle that finishes its spin still sits in the oil: it only counts
  // as clear (and able to slip again) once it has driven out.
  const free = b.slipFree;
  if (
    free &&
    !spills.some((o) => o.id === free && gap([o.x, o.z], to) < OIL.radius)
  )
    b.slipFree = null;
  for (const o of spills) {
    if (o.id === free || o.cleaning > 0) continue;
    const at = segmentHit(from, to, [o.x, o.z]);
    if (!at) continue;
    b.slipFree = o.id;
    b.slipCount = (b.slipCount || 0) + 1;
    b.slip = {
      spill: o.id,
      elapsed: 0,
      spin: b.slipCount % 2 ? 1 : -1,
      mode,
    };
    s.hazards.slips++;
    if (b.id === "brandon")
      event(s, "disruption", "Brandon hits the oil and spins out.");
    return at;
  }
  return null;
}

/**
 * Brandon's spill kit: stop short of the oil, step off, scrub it away and
 * carry on. Reuses the encounter pose (`combat`) so he dismounts and
 * remounts exactly as he does for zombies. Returns true while it runs.
 */
export function cleanupStep(s, event, nodes) {
  const b = s.brandon,
    h = normalizeHazards(s);
  const c = b.combat;
  if (c && c.kind !== "cleanup") return false;
  if (c) {
    const spill = h.spills.find((o) => o.id === c.spillId);
    c.elapsed++;
    const pro = s.tools.spill_kit === 2,
      need = pro ? OIL.cleanTicks / 2 : OIL.cleanTicks;
    if (c.phase === "dismount" && c.elapsed >= 3) {
      c.phase = "clean";
      c.elapsed = 0;
    } else if (c.phase === "clean") {
      if (spill) spill.cleaning = Math.min(1, c.elapsed / need);
      if (c.elapsed >= need) {
        if (spill) spill.cleanedAt = s.tick;
        h.cleaned++;
        c.phase = "remount";
        c.elapsed = 0;
      }
    } else if (c.phase === "remount" && c.elapsed >= 3) {
      b.combat = null;
      event(
        s,
        "disruption",
        "The road is clean again. Brandon packs up the spill kit and continues.",
      );
    }
    return true;
  }
  if (
    !s.tools.spill_kit ||
    b.voyage ||
    b.transition ||
    b.slip ||
    b.buildingVisit ||
    b.vehicleApproach ||
    !b.move ||
    b.homeRoutine?.phase === "sleeping" ||
    (s.zombies || []).some((z) => z.hp > 0)
  )
    return false;
  const spill = liveSpills(s)
    .filter((o) => !o.cleaning)
    .sort(
      (x, y) => gap([x.x, x.z], b.position) - gap([y.x, y.z], b.position),
    )[0];
  if (!spill || gap([spill.x, spill.z], b.position) > OIL.approach)
    return false;
  const parked = [...b.position];
  const from = nodes[b.move?.from],
    to = nodes[b.move?.to];
  const heading = from && to ? Math.atan2(to[0] - from[0], to[1] - from[1]) : 0;
  const vehicle = b.mountedMode || s.vehicle;
  let nx = Math.cos(heading),
    nz = -Math.sin(heading);
  if (nz < -0.001 || (Math.abs(nz) < 0.001 && nx < 0)) {
    nx = -nx;
    nz = -nz;
  }
  // He steps off, then walks up to just short of the puddle's edge.
  const reach = gap([spill.x, spill.z], parked);
  const hx = (spill.x - parked[0]) / (reach || 1),
    hz = (spill.z - parked[1]) / (reach || 1);
  const standoff = OIL.radius + 0.3;
  const walk = Math.max(0, reach - standoff);
  const stand = [
    parked[0] + hx * walk + nx * 0.3,
    parked[1] + hz * walk + nz * 0.3,
  ];
  b.combat = {
    kind: "cleanup",
    spillId: spill.id,
    parkedPosition: parked,
    phase: "dismount",
    elapsed: 0,
    strikes: 0,
    position: stand,
    heading: Math.atan2(spill.x - stand[0], spill.z - stand[1]),
    vehicle: !vehicle ? "foot" : vehicle,
  };
  event(
    s,
    "disruption",
    "Brandon spots oil ahead and stops with the spill kit.",
  );
  return true;
}
