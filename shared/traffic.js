// Physical footprints, a right-hand lane and swept collision tests are shared by
// the server and renderer. A fast actor cannot jump through a slower actor.
export const transportRadius = (mode = "foot") =>
  ({
    foot: 0.24,
    bike: 0.4,
    van: 0.93,
    rocket_skates: 0.31,
    helicopter: 1.5,
    sailboat: 0.75,
    jetpack: 0.29,
    teleporter: 0.4,
  })[mode] || 0.24;
export const actorMode = (actor) =>
  actor.voyage?.onShore
    ? "foot"
    : actor.voyage?.mode || actor.mountedMode || actor.vehicle || "foot";
export function groundPosition(actor) {
  if (actor.voyage?.onShore) return actor.voyage.courierPosition;
  if (actor.voyage) return null;
  return actor.position;
}
export function sweptDistance(a, b, p) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length),
      )
    : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
}
export function trafficMotionAllowed(
  actor,
  position,
  others,
  { mode = actorMode(actor), margin = 0.055 } = {},
) {
  const start = groundPosition(actor) || position;
  for (const other of others) {
    if (other.id === actor.id) continue;
    const p = groundPosition(other);
    if (!p) continue;
    const safe =
      transportRadius(mode) + transportRadius(actorMode(other)) + margin;
    const initial = Math.hypot(start[0] - p[0], start[1] - p[1]);
    const final = Math.hypot(position[0] - p[0], position[1] - p[1]);
    // A legacy overlapping spawn may move outward, never deeper into overlap.
    if (initial < safe && final > initial + 0.0001) continue;
    if (sweptDistance(start, position, p) < safe)
      return { allowed: false, yieldingTo: other.id };
  }
  return { allowed: true, yieldingTo: null };
}

function junctionReservation(state, actor, node, acquire = true) {
  const reservations = (state.trafficJunctions ||= {});
  const actors = [state.brandon, ...(state.crew || [])].filter(Boolean);
  for (const [key, id] of Object.entries(reservations)) {
    const owner = actors.find((a) => a.id === id);
    if (
      !owner ||
      owner.voyage ||
      (!owner.move && owner.yieldingTo) ||
      (owner.move && owner.move.from !== key && owner.move.to !== key) ||
      (owner.move?.from === key &&
        owner.move.progress >= Math.min(2.25, owner.move.distance * 0.45)) ||
      (!owner.move &&
        actorMode(owner) === "foot" &&
        (!owner.action || owner.target === owner.node))
    )
      delete reservations[key];
  }
  // Dismounted couriers share a crossing using swept foot collision checks.
  // Car-style reservations can deadlock pedestrians arriving from several edges.
  if (actorMode(actor) === "foot") {
    if (reservations[node] === actor.id) delete reservations[node];
    return { allowed: true, yieldingTo: null };
  }
  const owner = reservations[node],
    holder = actors.find((a) => a.id === owner);
  if (owner && owner !== actor.id) {
    const alreadyAhead =
      actor.move &&
      holder?.move &&
      actor.move.from === holder.move.from &&
      actor.move.to === holder.move.to &&
      actor.move.progress > holder.move.progress;
    const leavingOccupiedNode =
      !actor.move && actor.node === node && holder?.move?.to === node;
    if (alreadyAhead || leavingOccupiedNode)
      return { allowed: true, yieldingTo: null };
    return { allowed: false, yieldingTo: owner };
  }
  if (actor.move?.to === node) {
    const remaining = actor.move.distance - actor.move.progress;
    const ahead = actors
      .filter(
        (a) =>
          a.id !== actor.id &&
          a.move?.to === node &&
          a.move.distance - a.move.progress < remaining - 0.001,
      )
      .sort(
        (a, b) =>
          a.move.distance -
          a.move.progress -
          (b.move.distance - b.move.progress),
      );
    if (ahead.length) {
      if (owner === actor.id) delete reservations[node];
      return { allowed: false, yieldingTo: ahead[0].id };
    }
  }
  if (acquire) reservations[node] = actor.id;
  return { allowed: true, yieldingTo: null };
}

function localDetour(actor, goal, actors, from, to, mode) {
  const points = [[...actor.position], [...goal]],
    radius = transportRadius(mode);
  const limit = Math.max(
    1.75,
    sweptDistance(from, to, actor.position) + 0.1,
    sweptDistance(from, to, goal) + 0.1,
  );
  for (const other of actors) {
    if (other.id === actor.id) continue;
    const p = groundPosition(other);
    if (!p) continue;
    const safe =
      (radius + transportRadius(actorMode(other)) + 0.085) /
      Math.cos(Math.PI / 12);
    for (let n = 0; n < 12; n++) {
      const angle = (n * Math.PI) / 6,
        candidate = [
          p[0] + Math.cos(angle) * safe,
          p[1] + Math.sin(angle) * safe,
        ];
      if (sweptDistance(from, to, candidate) <= limit) points.push(candidate);
    }
  }
  const costs = points.map(() => Infinity),
    previous = points.map(() => -1),
    visited = new Set();
  costs[0] = 0;
  for (let pass = 0; pass < points.length; pass++) {
    let current = -1;
    for (let i = 0; i < points.length; i++)
      if (!visited.has(i) && (current < 0 || costs[i] < costs[current]))
        current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === 1) break;
    visited.add(current);
    for (let i = 1; i < points.length; i++) {
      if (visited.has(i) || i === current) continue;
      if (
        !trafficMotionAllowed(
          { ...actor, position: points[current] },
          points[i],
          actors,
          { mode },
        ).allowed
      )
        continue;
      const next =
        costs[current] +
        Math.hypot(
          points[i][0] - points[current][0],
          points[i][1] - points[current][1],
        );
      if (next < costs[i]) {
        costs[i] = next;
        previous[i] = current;
      }
    }
  }
  if (previous[1] < 0) return null;
  const path = [];
  let next = 1;
  while (next > 0) {
    path.unshift(points[next]);
    next = previous[next];
  }
  const smooth = [];
  for (let i = 0; i < path.length - 1; i++) {
    const before = i ? path[i - 1] : actor.position,
      corner = path[i],
      after = path[i + 1];
    const incoming = Math.hypot(...corner.map((v, axis) => v - before[axis]));
    const outgoing = Math.hypot(...after.map((v, axis) => v - corner[axis]));
    const trim = Math.min(0.18, incoming * 0.3, outgoing * 0.3);
    const entry = corner.map(
      (v, axis) => v + ((before[axis] - v) * trim) / incoming,
    );
    const exit = corner.map(
      (v, axis) => v + ((after[axis] - v) * trim) / outgoing,
    );
    const curve = [entry];
    for (let n = 1; n <= 5; n++) {
      const t = n / 5;
      curve.push(
        entry.map(
          (v, axis) =>
            (1 - t) ** 2 * v +
            2 * (1 - t) * t * corner[axis] +
            t * t * exit[axis],
        ),
      );
    }
    if (
      curve.every(
        (p, n) =>
          trafficMotionAllowed(
            {
              ...actor,
              position: n ? curve[n - 1] : smooth.at(-1) || actor.position,
            },
            p,
            actors,
            { mode },
          ).allowed,
      )
    )
      smooth.push(...curve);
    else smooth.push(corner);
  }
  smooth.push(path.at(-1));
  if (actor.id === "brandon")
    actor.avoidance = { goal: [...goal], points: smooth };
  const p = actor.id === "brandon" ? smooth[0] : path[0],
    distance = Math.hypot(p[0] - actor.position[0], p[1] - actor.position[1]),
    step = Math.min(0.24, distance);
  if (distance < 0.00001) return null;
  const position = [
    actor.position[0] + ((p[0] - actor.position[0]) * step) / distance,
    actor.position[1] + ((p[1] - actor.position[1]) * step) / distance,
  ];
  return trafficMotionAllowed(actor, position, actors, { mode }).allowed
    ? position
    : null;
}

// The server's movement and the drawn route use exactly the same lane and
// approach coordinates. Fade lane offsets at junctions instead of side-stepping.
export function roadLanePoint(
  actor,
  proposed,
  nodes,
  index = 0,
  mode = actorMode(actor),
) {
  const move = actor.move,
    from = nodes[move?.from],
    to = nodes[move?.to];
  if (!from || !to)
    return { position: [...proposed], docking: false, vehiclePosition: null };
  const dx = to[0] - from[0],
    dz = to[1] - from[1],
    length = Math.hypot(dx, dz);
  if (!length)
    return { position: [...proposed], docking: false, vehiclePosition: null };
  const along = Math.max(
    0,
    Math.min(
      length,
      ((proposed[0] - from[0]) * dx + (proposed[1] - from[1]) * dz) / length,
    ),
  );
  const ease = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  const lane =
    (mode === "van" ? 0 : mode === "bike" ? 0.47 : 0.52) *
    ease(Math.min(along, length - along) / 1.2);
  let position = [
    proposed[0] + (dz / length) * lane,
    proposed[1] - (dx / length) * lane,
  ];
  const remaining = length - along;
  const docking = actor.target === move.to && remaining < 1.5;
  if (docking) {
    const bay = serviceBay(to, index),
      blend = ease(1 - remaining / 1.5);
    position = position.map((v, i) => v + (bay[i] - to[i]) * blend);
  }
  return {
    position,
    docking,
    vehiclePosition: docking
      ? [to[0] - (dx / length) * 1.5, to[1] - (dz / length) * 1.5]
      : null,
  };
}

export function constrainRoadMotion(
  state,
  actor,
  proposedPosition,
  nodes = {},
) {
  const mode = actorMode(actor),
    move = actor.move;
  let position = [...proposedPosition],
    docking = false,
    vehiclePosition = null;
  const actors = [state.brandon, ...(state.crew || [])].filter(Boolean);
  const from = nodes[move?.from],
    to = nodes[move?.to];
  if (from && to) {
    const result = roadLanePoint(
      actor,
      proposedPosition,
      nodes,
      Math.max(
        0,
        actors.findIndex((a) => a.id === actor.id),
      ),
      mode,
    );
    position = result.position;
    docking = result.docking;
    vehiclePosition = result.vehiclePosition;
  }
  if (from && to) {
    const remaining = Math.hypot(
      proposedPosition[0] - to[0],
      proposedPosition[1] - to[1],
    );
    if (remaining < 2.3) {
      // Never hold the departure junction while requesting the next one.
      // On short edges that creates a circular wait even for separate lanes.
      if (state.trafficJunctions?.[move.from] === actor.id)
        delete state.trafficJunctions[move.from];
      const reservation = junctionReservation(state, actor, move.to);
      if (!reservation.allowed)
        return {
          ...reservation,
          position: [...actor.position],
          progressFactor: 0,
        };
    }
  }
  // Hold graph progress during the detour, including a gradual merge back.
  // Replan only when a moving obstacle actually invalidates the next segment.
  const plan = actor.avoidance;
  if (plan && from && to) {
    if (
      Math.hypot(plan.goal[0] - position[0], plan.goal[1] - position[1]) > 1.5
    )
      actor.avoidance = null;
    else {
      while (
        plan.points.length &&
        Math.hypot(...plan.points[0].map((v, i) => v - actor.position[i])) <
          0.025
      )
        plan.points.shift();
      let cursor = [...actor.position],
        budget = actor.navigationStep || 0.48;
      const trail = [];
      while (plan.points.length && budget > 0.00001) {
        const next = plan.points[0],
          distance = Math.hypot(...next.map((v, i) => v - cursor[i]));
        if (distance < 0.00001) {
          plan.points.shift();
          continue;
        }
        const amount = Math.min(budget, distance);
        const candidate = cursor.map(
          (v, i) => v + ((next[i] - v) * amount) / distance,
        );
        if (
          !trafficMotionAllowed(
            { ...actor, position: cursor },
            candidate,
            actors,
            { mode },
          ).allowed
        )
          break;
        cursor = candidate;
        trail.push([...cursor]);
        budget -= amount;
        if (amount >= distance - 0.00001) plan.points.shift();
        else break;
      }
      if (trail.length) {
        actor.navigationTrail = trail;
        return {
          allowed: true,
          yieldingTo: null,
          docking,
          vehiclePosition,
          progressFactor: 0,
          position: cursor,
        };
      }
      actor.avoidance = null;
    }
  }
  const result = trafficMotionAllowed(actor, position, actors, { mode });
  if (result.allowed)
    return { ...result, docking, vehiclePosition, progressFactor: 1, position };
  if (from && to) {
    const dx = to[0] - from[0],
      dz = to[1] - from[1],
      length = Math.hypot(dx, dz);
    const along = (p) =>
      ((p[0] - from[0]) * dx + (p[1] - from[1]) * dz) / length;
    // A safe detour may already have passed the requested waypoint. Catch up
    // the route cursor at the actual position; never snap back into traffic.
    if (
      (!docking ||
        (mode === "foot" && along(proposedPosition) < length - 0.001)) &&
      along(actor.position) >= along(proposedPosition) - 0.001 &&
      trafficMotionAllowed(actor, actor.position, actors, { mode }).allowed
    )
      return {
        allowed: true,
        yieldingTo: null,
        docking,
        vehiclePosition,
        progressFactor: 1,
        position: [...actor.position],
      };
  }
  // A courier leaving a service bay can obstruct a follower's merge. Take a
  // bounded, swept-safe step into the free part of the bay, then retry the
  // graph waypoint. Graph progress is held until the merge actually succeeds.
  const start = actor.position,
    goalDistance = Math.hypot(position[0] - start[0], position[1] - start[1]);
  const nearJunction =
    from &&
    to &&
    Math.min(
      Math.hypot(start[0] - from[0], start[1] - from[1]),
      Math.hypot(start[0] - to[0], start[1] - to[1]),
    ) < 3.5;
  if (nearJunction) {
    if (mode !== "van") {
      const detour = localDetour(actor, position, actors, from, to, mode);
      if (detour)
        return {
          allowed: true,
          yieldingTo: result.yieldingTo,
          docking,
          vehiclePosition,
          progressFactor: 0,
          position: detour,
        };
    }
    const goalAngle = Math.atan2(
      position[1] - start[1],
      position[0] - start[0],
    );
    const clearance = (p) =>
      Math.min(
        ...actors
          .filter((a) => a.id !== actor.id && groundPosition(a))
          .map((a) => {
            const q = groundPosition(a);
            return (
              Math.hypot(p[0] - q[0], p[1] - q[1]) -
              transportRadius(mode) -
              transportRadius(actorMode(a))
            );
          }),
      );
    const initialClearance = clearance(start);
    let best = null,
      bestScore = -Infinity;
    for (const offset of [
      0,
      Math.PI / 6,
      -Math.PI / 6,
      Math.PI / 3,
      -Math.PI / 3,
      Math.PI / 2,
      -Math.PI / 2,
      (2 * Math.PI) / 3,
      (-2 * Math.PI) / 3,
      Math.PI,
    ]) {
      const candidate = [
        start[0] + Math.cos(goalAngle + offset) * 0.24,
        start[1] + Math.sin(goalAngle + offset) * 0.24,
      ];
      const laneDistance = sweptDistance(from, to, candidate);
      if (laneDistance > Math.max(1.65, sweptDistance(from, to, start) - 0.01))
        continue;
      const northBound = Math.min(from[1], to[1]) - 0.72;
      if (
        Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]) &&
        candidate[1] < northBound &&
        candidate[1] < start[1]
      )
        continue;
      if (!trafficMotionAllowed(actor, candidate, actors, { mode }).allowed)
        continue;
      const free = clearance(candidate),
        gain =
          goalDistance -
          Math.hypot(position[0] - candidate[0], position[1] - candidate[1]);
      if (free < 0.04 && free < initialClearance - 0.01) continue;
      const score = Math.min(free, 0.12) * 0.3 + gain;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best)
      return {
        allowed: true,
        yieldingTo: result.yieldingTo,
        docking,
        vehiclePosition,
        progressFactor: 0,
        position: best,
      };
  }
  return {
    ...result,
    docking,
    vehiclePosition,
    progressFactor: 0,
    position: [...actor.position],
  };
}
// Used for rendered snapshots and legacy saves which place several people on
// exactly the same depot coordinate. Keep service bays deterministic by id.
export function resolveTrafficPositions(
  actors,
  { iterations = 20, margin = 0.07 } = {},
) {
  const result = actors.map((actor) => ({
    ...actor,
    position: [...actor.position],
  }));
  for (let pass = 0; pass < iterations; pass++) {
    let moved = false;
    for (let i = 0; i < result.length; i++)
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i],
          b = result[j];
        if (Math.abs((a.altitude || 0) - (b.altitude || 0)) > 1.6) continue;
        let dx = b.position[0] - a.position[0],
          dz = b.position[1] - a.position[1];
        const gap = Math.hypot(dx, dz),
          safe =
            (a.radius ?? transportRadius(a.mode)) +
            (b.radius ?? transportRadius(b.mode)) +
            margin;
        if (gap >= safe - 0.000001) continue;
        if (gap < 0.000001) {
          dx = 0;
          dz = a.id.localeCompare(b.id) < 0 ? 1 : -1;
        }
        const n = Math.hypot(dx, dz),
          displacement = (safe - gap) / 2 + 0.000001;
        const aShare = a.id === "brandon" ? 0 : b.id === "brandon" ? 2 : 1;
        const bShare = 2 - aShare;
        a.position[0] -= (dx / n) * displacement * aShare;
        a.position[1] -= (dz / n) * displacement * aShare;
        b.position[0] += (dx / n) * displacement * bShare;
        b.position[1] += (dz / n) * displacement * bShare;
        moved = true;
      }
    if (!moved) break;
  }
  return result;
}
// Narrow roads are single-track for wide vehicles. Reserve before entering,
// so meeting traffic waits at a junction rather than deadlocking mid-bridge.
export function roadEntryAllowed(
  state,
  actor,
  from,
  to,
  mode = actorMode(actor),
) {
  for (const other of [state.brandon, ...(state.crew || [])]) {
    if (!other || actor.id === other.id || !other.move) continue;
    const opposing = other.move.from === to && other.move.to === from;
    if (
      opposing &&
      (mode === "van" ||
        (!other.move.docking && other.vehicle === "van") ||
        actorMode(other) === "van")
    ) {
      if (state.trafficJunctions?.[from] === actor.id)
        delete state.trafficJunctions[from];
      return { allowed: false, yieldingTo: other.id };
    }
  }
  return junctionReservation(state, actor, from, mode === "van");
}

export function serviceBay(node, actorIndex = 0) {
  if (actorIndex === 0) return [...node];
  return [node[0] + actorIndex * 0.75 - 1.1, node[1] + 1.15];
}
export function yieldAtJunction(state, actor, from, to, nodes) {
  const a = nodes[from],
    b = nodes[to];
  if (!a || !b) return [...actor.position];
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz),
    p = actor.position;
  const founder = actor.id === "brandon";
  const index = Math.max(
    0,
    (state.crew || []).findIndex((c) => c.id === actor.id),
  );
  const turnouts = {
    harbor_dock: founder ? [-1.7, 14] : [-7.2, 12.5 + index * 2.2],
    farm_port: founder
      ? [8.5, 24.2]
      : [6.3 + (index % 2) * 2.2, 22.0 + Math.floor(index / 2) * 2.2],
    farm_shop: founder
      ? [8.5, 26.1]
      : [6.3 + (index % 2) * 2.2, 26.4 + Math.floor(index / 2) * 2.2],
    harbor: founder ? [-1.7, 3] : [-1.7, 4.5 + index * 2.2],
    cafe: founder ? [8.3, 4.4] : [6.3, 4.4 + index * 2.2],
  };
  const target = turnouts[from] || [
    a[0] + (dz / length) * 3,
    a[1] - (dx / length) * 3,
  ];
  let distance = Math.hypot(target[0] - p[0], target[1] - p[1]);
  if (distance < 0.025) {
    // A turnout can itself be occupied. Offer a second nearby pocket without
    // changing the logical road node or teleporting the waiting courier.
    target[0] += founder ? 0.9 : -0.9;
    target[1] += 0.7;
    distance = Math.hypot(target[0] - p[0], target[1] - p[1]);
  }
  const actors = [state.brandon, ...(state.crew || [])],
    angle = Math.atan2(target[1] - p[1], target[0] - p[0]),
    step = Math.min(0.22, distance);
  for (const turn of [
    0,
    Math.PI / 6,
    -Math.PI / 6,
    Math.PI / 3,
    -Math.PI / 3,
    Math.PI / 2,
    -Math.PI / 2,
    (2 * Math.PI) / 3,
    (-2 * Math.PI) / 3,
    Math.PI,
  ]) {
    const position = [
      p[0] + Math.cos(angle + turn) * step,
      p[1] + Math.sin(angle + turn) * step,
    ];
    if (trafficMotionAllowed(actor, position, actors).allowed) return position;
  }
  return [...p];
}
