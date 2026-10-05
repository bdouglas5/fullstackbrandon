import { ACTIONS, NODES, route } from "../shared/engine.js";
import * as THREE from "three";
import {
  roadForecast,
  roundNavigation,
  destinationApproach,
} from "./navigation-path.js";
import { animateCharacter, animateWalker } from "./world-animation.js";
import { LiveClock, PLAYOUT } from "./live-clock.js";
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unique = (points) =>
  points.filter((p, i) => !i || distance(p, points[i - 1]) > 0.001);
function nearestPathPosition(point, path) {
  let best = { distance: Infinity, along: 0 },
    total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      d = distance(a, b),
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = d
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (d * d),
          ),
        )
      : 0;
    const off = distance(point, [a[0] + dx * t, a[1] + dz * t]);
    if (off < best.distance) best = { distance: off, along: total + d * t };
    total += d;
  }
  return best;
}
// Movement follows graph edges and water waypoints, never a straight interpolation across a building/island.
export function movementPoints(before, actor, current, state) {
  const destination = actor.voyage?.position || actor.position || [4, 2];
  if (!before || !current || distance(current, destination) < 0.002)
    return [destination];
  const v = actor.voyage,
    old = before.voyage;
  if (!v && !old && actor.navigationTrail?.length) {
    const trail = [before.position, ...actor.navigationTrail];
    const cursor = nearestPathPosition(current, trail).along;
    let along = 0;
    return unique([
      current,
      ...trail.filter((p, i) => {
        if (i) along += distance(trail[i - 1], p);
        return along > cursor + 0.00001;
      }),
      destination,
    ]);
  }
  if (
    v &&
    old &&
    v.mode === "sailboat" &&
    old.mode === "sailboat" &&
    v.waypoints?.length > 1
  ) {
    if (
      Array.isArray(v.stages) &&
      Array.isArray(old.stages) &&
      v.island === old.island &&
      v.elapsed >= old.elapsed
    ) {
      // Authoritative stage indexes disambiguate the outbound and return copies
      // of a sea route. Nearest-point lookup across the whole round trip cannot.
      const poseIndex = (trip) =>
        Math.max(
          0,
          trip.stageIndex - (trip.stageWork === 0 && trip.elapsed > 0 ? 1 : 0),
        );
      const oldIndex = poseIndex(old);
      let endIndex = Math.min(poseIndex(v), v.stages.length - 1);
      while (endIndex >= 0 && v.stages[endIndex].onShore) endIndex--;
      let startIndex = -1,
        closest = Infinity;
      // Include the preceding segment because interpolation may still be easing
      // into a corner when the server advances to the next stage.
      for (
        let i = Math.max(0, oldIndex - 1);
        i <= Math.min(endIndex, oldIndex + 1);
        i++
      ) {
        const segment = v.stages[i];
        if (segment.onShore) continue;
        const d = nearestPathPosition(current, [
          segment.from,
          segment.to,
        ]).distance;
        if (d <= closest) {
          closest = d;
          startIndex = i;
        }
      }
      if (startIndex < 0) {
        for (let i = Math.max(0, oldIndex); i <= endIndex; i++)
          if (!v.stages[i].onShore) {
            startIndex = i;
            break;
          }
      }
      if (startIndex >= 0 && endIndex >= startIndex) {
        const middle = v.stages
          .slice(startIndex, endIndex)
          .filter((segment) => !segment.onShore)
          .map((segment) => segment.to);
        return unique([current, ...middle, destination]);
      }
      return unique([current, destination]);
    }
    const path = v.waypoints;
    const from = nearestPathPosition(current, path),
      to = nearestPathPosition(destination, path);
    if (from.distance < 1 && to.distance < 1) {
      let travelled = 0;
      const middle = [];
      for (let i = 1; i < path.length; i++) {
        travelled += distance(path[i - 1], path[i]);
        if (
          travelled > Math.min(from.along, to.along) + 0.01 &&
          travelled < Math.max(from.along, to.along) - 0.01
        )
          middle.push(path[i]);
      }
      return unique([
        current,
        ...(from.along > to.along ? middle.reverse() : middle),
        destination,
      ]);
    }
  }
  if (v || old) return unique([current, destination]);
  const from = before.move?.to || before.node,
    to = actor.move?.from || actor.node;
  if (!NODES[from] || !NODES[to]) return unique([current, destination]);
  if (
    before.move &&
    actor.move &&
    before.move.from === actor.move.from &&
    before.move.to === actor.move.to
  )
    return unique([current, destination]);
  if (from === to) return unique([current, destination]);
  let nodes = route(from, to, state.bridgeClosed, state.traffic);
  if (!nodes.length) nodes = route(from, to, false, false);
  return unique([current, ...nodes.map((n) => NODES[n]), destination]);
}
const distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const unique3 = (points) =>
  points.filter((p, i) => !i || distance3(p, points[i - 1]) > 1e-9);

// The scene and the route overlay share these heights, including the gangway.
function roadHeight(point, actor) {
  if (actor.shoreVoyage?.mode === "sailboat") {
    const fromDock = distance(point, actor.shoreVoyage.dock);
    return THREE.MathUtils.lerp(-0.15, 0.43, Math.min(1, fromDock / 1.1));
  }
  return 0.43;
}
function voyagePoint(voyage, point, height) {
  return [point[0], voyage.mode === "sailboat" ? -0.63 : height, point[1]];
}
function actorPoint(actor) {
  const v = actor.voyage;
  const p = v?.position || actor.position || [4, 2];
  return v
    ? voyagePoint(v, p, v.altitude ?? 0.43)
    : [p[0], roadHeight(p, actor), p[1]];
}
const poseStageIndex = (voyage) =>
  Math.max(
    0,
    voyage.stageIndex - (voyage.stageWork === 0 && voyage.elapsed > 0 ? 1 : 0),
  );

function initialHeading(actor) {
  const v = actor.voyage;
  if (v?.stages) {
    const index = Math.min(poseStageIndex(v), v.stages.length - 1);
    // An aircraft taking off faces the next flight leg; while landing it keeps
    // the heading of the leg it just flew. Shore walks never steer the craft.
    for (const direction of [1, -1]) {
      for (let i = index; i >= 0 && i < v.stages.length; i += direction) {
        const stage = v.stages[i];
        if (stage.onShore) {
          if (v.onShore && direction < 0) continue;
          break;
        }
        if (distance(stage.from, stage.to) > 0.00001)
          return Math.atan2(
            stage.to[0] - stage.from[0],
            stage.to[1] - stage.from[1],
          );
      }
    }
  }
  if (NODES[actor.move?.from] && NODES[actor.move?.to]) {
    const from = NODES[actor.move.from],
      to = NODES[actor.move.to];
    return Math.atan2(to[0] - from[0], to[1] - from[1]);
  }
  return 0;
}

// Interpolate through the actual 3D stage corners. A sparse flight update must
// still reach cruise height before crossing the island and descend at its pad.
export function movementTrajectory(before, actor, current, state) {
  const destination = actorPoint(actor);
  if (!before || !current) return [destination];
  const v = actor.voyage,
    old = before.voyage;
  if (
    v?.stages &&
    old?.stages &&
    v.mode === old.mode &&
    v.island === old.island &&
    v.elapsed >= old.elapsed &&
    !v.onShore &&
    !old.onShore
  ) {
    const end = Math.min(poseStageIndex(v), v.stages.length - 1);
    const oldIndex = poseStageIndex(old);
    let start = oldIndex,
      closest = Infinity;
    const point = new THREE.Vector3(...current);
    for (
      let i = Math.max(0, oldIndex - 1);
      i <= Math.min(end, oldIndex + 1);
      i++
    ) {
      const stage = v.stages[i];
      if (stage.onShore) continue;
      const line = new THREE.Line3(
        new THREE.Vector3(...voyagePoint(v, stage.from, stage.fromAltitude)),
        new THREE.Vector3(...voyagePoint(v, stage.to, stage.toAltitude)),
      );
      const off = line
        .closestPointToPoint(point, true, new THREE.Vector3())
        .distanceTo(point);
      if (off <= closest) {
        closest = off;
        start = i;
      }
    }
    return unique3([
      current,
      ...v.stages
        .slice(start, end)
        .filter((stage) => !stage.onShore)
        .map((stage) => voyagePoint(v, stage.to, stage.toAltitude)),
      destination,
    ]);
  }
  if (v || old) return unique3([current, destination]);
  return unique3(
    movementPoints(before, actor, [current[0], current[2]], state).map(
      (point, i) =>
        i === 0 ? current : [point[0], roadHeight(point, actor), point[1]],
    ),
  );
}

// Start at the rendered pose, keep all interpolation corners, then append the
// remaining authoritative road/sea/flight leg. This also works for a followed
// employee, or their walking route while their craft waits at the destination.
export function routeTrajectory(actor, state, motion) {
  const v = actor.voyage;
  if (!v && motion?.navigator) return motion.remainingTrajectory();
  const points = motion ? motion.remainingTrajectory() : [actorPoint(actor)];
  if (actor.vehicleApproach)
    return unique3([
      ...points,
      ...actor.vehicleApproach.points.map((p) => [p[0], 0.43, p[1]]),
    ]);
  if (actor.buildingVisit)
    return unique3([
      ...points,
      ...(actor.buildingVisit.points || []).map((p) => [p[0], 0.43, p[1]]),
    ]);
  if (actor.homeRoutine?.phase === "sleeping") return unique3(points);
  if (actor.homeRoutine?.phase === "entering")
    return unique3([...points, [7.45, 0.43, -4.85]]);
  if (v?.stages) {
    for (const stage of v.stages.slice(v.stageIndex)) {
      if (!!stage.onShore !== !!v.onShore) break;
      points.push(
        v.onShore
          ? [stage.to[0], roadHeight(stage.to, { shoreVoyage: v }), stage.to[1]]
          : voyagePoint(v, stage.to, stage.toAltitude),
      );
    }
  } else if (!v) {
    for (const p of actor.avoidance?.points || [])
      points.push([p[0], roadHeight(p, actor), p[1]]);
    const destination = actor.target || ACTIONS[actor.action]?.target;
    const from = actor.move?.to || actor.node;
    if (destination && NODES[from] && NODES[destination]) {
      const nodes = route(from, destination, state.bridgeClosed, state.traffic);
      for (const node of nodes) {
        const p = NODES[node];
        points.push([p[0], roadHeight(p, { ...actor, node }), p[1]]);
      }
    }
  }
  return unique3([...points, ...(!v ? destinationApproach(actor, state) : [])]);
}

// Playout timeline. The server is authoritative and sends one frame per tick.
// Rather than guessing ahead (which stalls when a guess is wrong and snaps when
// a frame disagrees), every frame becomes a segment on a simulated-time
// timeline and the renderer plays that timeline back a short, adaptive delay
// behind the newest frame. Positions are therefore always interpolated between
// two known authoritative poses: speed changes (mounting, docking, 8x pace),
// network jitter and late frames only change *when* a segment is played, never
// whether the motion is continuous.
const EPS_TICK = 1e-6;

export class ActorMotion {
  // Pass a shared LiveClock so every actor and the scene use one playout time;
  // without one the actor plays its own frames back on a private clock.
  constructor({ clock = null } = {}) {
    this.live = clock || new LiveClock();
    this.ownsClock = !clock;
    this.actor = null;
    this.key = "";
    this.points = [];
    this.trajectory = [];
    this.segment = 0;
    this.age = 1;
    this.duration = 0.38;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.distance = 0;
    this.walkCycle = 0;
    this.moving = false;
    this.reversing = false;
    this.speed = 0;
    this.acceleration = 0;
    this.turnRate = 0;
    this.verticalSpeed = 0;
    this.travelled = 0;
    // Rendering clock and the measured spacing of authoritative updates.
    this.clock = 0;
    this.lastKeyAt = null;
    // Characters turn on an eased facing; vehicle noses use `heading`.
    this.facing = 0;
    this.stillFor = 0;
    this.navigator = false;
    this.cruiseSpeed = 1.2;
    this.pathTravel = 0;
    // Timeline state (simulated ticks).
    this.queue = [];
    this.playTick = 0;
    this.latestTick = 0;
    this.seenTick = 0;
    this.lag = 0;
    this.tailPoint = null;
    // Arc-length coordinate along the whole queued path.
    this.tailS = 0;
    this.followS = 0;
    this.followV = 0;
  }
  get interval() {
    return this.live.interval;
  }
  get tickRate() {
    return this.live.tickRate;
  }
  update(actor, state, dt, reducedMotion = false) {
    const v = actor.voyage;
    const position = v?.position || actor.position || [4, 2];
    const key = JSON.stringify([
      state.tick,
      position,
      actor.action,
      v?.mode,
      v?.phase,
    ]);
    dt = Math.max(0, dt);
    this.clock += dt;
    const live = this.live;
    if (key !== this.key) {
      const initial = !this.actor;
      const tick = state.tick ?? 0;
      const physical = actorPoint(actor);
      // A private clock sees every distinct frame; a shared clock is fed by
      // whoever owns it, once per frame for the whole scene.
      if (this.ownsClock && (initial || tick !== live.latest)) live.push(state);
      // Time ran backwards (replay scrub, restart): snap, never glide.
      const rewound = !initial && tick < this.seenTick - EPS_TICK;
      if (initial || rewound) {
        this.queue = [];
        this.tailPoint = physical;
        this.tailS = this.followS = this.followV = 0;
        this.latestTick = tick;
        this.position.fromArray(physical);
        this.trajectory = [physical];
        this.points = [[physical[0], physical[2]]];
        this.distance = 0;
        if (initial) this.heading = this.facing = initialHeading(actor);
      } else {
        const start = this.tailPoint;
        const raw = movementTrajectory(this.actor, actor, start, state);
        // Road corners are rounded so a vehicle's nose swings through them
        // instead of snapping; segment ends stay exactly on authoritative poses.
        const trajectory =
          !v && actor.move && raw.length > 2
            ? roundNavigation(raw, actor.avoidance ? 0.025 : 0.22)
            : raw;
        const t0 = this.latestTick;
        const t1 = Math.max(tick, t0 + PLAYOUT.sameTickSpan);
        const length = trajectory.reduce(
          (sum, p, i, all) => sum + (i ? distance3(all[i - 1], p) : 0),
          0,
        );
        if (v?.mode === "teleporter" && length > 1) {
          // A teleporter hop is a cut, not a slide across the island.
          this.tailS = this.followS = this.followV = 0;
          this.queue = [
            { t0, t1, points: [trajectory.at(-1)], length: 0, s0: 0, s1: 0 },
          ];
          this.position.fromArray(trajectory.at(-1));
        } else {
          this.queue.push({
            t0,
            t1,
            points: trajectory,
            length,
            s0: this.tailS,
            s1: this.tailS + length,
          });
          this.tailS += length;
        }
        this.tailPoint = trajectory.at(-1);
        this.latestTick = t1;
        // The newest leg the server sent, kept as received.
        this.trajectory = trajectory;
        this.points = trajectory.map((q) => [q[0], q[2]]);
        this.distance = length;
      }
      // Road beyond the newest authoritative pose, for the route overlay only:
      // it is never walked until the server confirms it with a frame.
      this.forecast =
        state.status === "running" &&
        !v &&
        actor.move &&
        !actor.shoreVoyage &&
        !actor.homeRoutine &&
        !actor.buildingVisit &&
        !actor.vehicleApproach &&
        NODES[actor.node]
          ? roadForecast(actor, state)
          : [];
      this.seenTick = tick;
      this.lastKeyAt = this.clock;
      this.actor = structuredClone(actor);
      this.key = key;
    }
    if (this.ownsClock)
      live.advance(dt, state.status === "running", reducedMotion);
    // The pose is drawn at the clock's displayed time; the spring below is
    // what makes it trail the playout by exactly `trailTicks`.
    this.playTick = live.playTick;
    this.lag = live.lag;
    // Where on the path the playout clock is, as an arc length.
    let play = this.tailS;
    for (const seg of this.queue)
      if (seg.t1 > this.playTick) {
        const span = Math.max(seg.t1 - seg.t0, EPS_TICK);
        play =
          seg.s0 +
          THREE.MathUtils.clamp((this.playTick - seg.t0) / span, 0, 1) *
            seg.length;
        break;
      }
    // Spring the displayed pose toward it (sub-stepped, so frame time can
    // never destabilise it), never past the playout and never backwards.
    if (reducedMotion) {
      this.followS = play;
      this.followV = 0;
    } else if (dt > 0) {
      const w = PLAYOUT.follow,
        n = Math.max(1, Math.ceil(dt / 0.012)),
        h = dt / n;
      for (let i = 0; i < n; i++) {
        this.followV +=
          (w * w * (play - this.followS) - 2 * w * this.followV) * h;
        this.followS += this.followV * h;
      }
      if (this.followV < 0) this.followV = 0;
      if (this.followS > play) {
        this.followS = play;
        this.followV = 0;
      }
    }
    const old = this.position.clone();
    const oldHeading = this.heading;
    while (this.queue.length > 1 && this.queue[0].s1 < this.followS - 1e-9)
      this.queue.shift();
    let p = this.tailPoint || actorPoint(actor);
    this.segment = 0;
    const head = this.queue[0];
    if (head) {
      let travel = Math.max(0, this.followS - head.s0);
      p = head.points[0];
      this.segment = head.points.length - 1;
      for (let i = 1; i < head.points.length; i++) {
        const next = head.points[i],
          len = distance3(p, next);
        if (travel <= len) {
          const k = len ? travel / len : 1;
          p = p.map((value, axis) => value + (next[axis] - value) * k);
          this.segment = i;
          break;
        }
        travel -= len;
        p = next;
      }
    }
    this.position.fromArray(p);
    this.shownTick = this.tickAtPose();
    // The drawn route: from the pose on screen, through every queued corner,
    // then on along the road the server will send next.
    this.route = unique3([
      this.position.toArray(),
      ...(head ? head.points.slice(this.segment) : []),
      ...this.queue.slice(1).flatMap((s) => s.points),
      ...this.forecast,
    ]);
    this.segment = 1;
    this.navigator = !!(actor.move && !v);
    this.age = this.duration = 1;
    const dx = this.position.x - old.x,
      dz = this.position.z - old.z;
    const step = Math.hypot(dx, dz);
    // A late update can leave a few still frames; hold the stride briefly so
    // the walk cycle does not stutter between ticks.
    this.stillFor = step > 0.0005 ? 0 : this.stillFor + dt;
    this.moving =
      state.status === "running" &&
      (step > 0.0005 || (this.stillFor < 0.12 && this.speed > 0.4));
    if (step > 0.00000001) {
      // Every model's nose is local +Z. Match the actual displacement so a
      // turnaround or a fresh route can never translate tail-first.
      this.heading = Math.atan2(dx, dz);
    }
    // People turn on an eased facing: quick, but never a one-frame snap.
    const facingError = Math.atan2(
      Math.sin(this.heading - this.facing),
      Math.cos(this.heading - this.facing),
    );
    this.facing = reducedMotion
      ? this.heading
      : this.facing + facingError * (1 - Math.exp(-Math.max(0, dt) * 13));
    if (this.moving) {
      this.walkCycle += step * 12;
      this.travelled += step;
    }
    // Secondary animation reads measured motion, never feeds back into the
    // authoritative route. Bounded rates keep sparse updates and U-turns calm.
    if (dt > 0) {
      const previousSpeed = this.speed;
      const animating = state.status === "running" && !reducedMotion;
      const rate = (value, limit) =>
        THREE.MathUtils.clamp(value / dt, -limit, limit);
      this.speed = THREE.MathUtils.damp(
        this.speed,
        animating ? Math.min(step / dt, 16) : 0,
        9,
        dt,
      );
      this.acceleration = THREE.MathUtils.damp(
        this.acceleration,
        animating ? rate(this.speed - previousSpeed, 12) : 0,
        7,
        dt,
      );
      this.verticalSpeed = THREE.MathUtils.damp(
        this.verticalSpeed,
        animating ? rate(this.position.y - old.y, 10) : 0,
        7,
        dt,
      );
      const angle = Math.atan2(
        Math.sin(this.heading - oldHeading),
        Math.cos(this.heading - oldHeading),
      );
      this.turnRate = THREE.MathUtils.damp(
        this.turnRate,
        animating && this.moving ? rate(angle, 5) : 0,
        8,
        dt,
      );
      if (reducedMotion)
        this.speed = this.acceleration = this.verticalSpeed = this.turnRate = 0;
    }
    this.step = step;
    return this;
  }
  // The pose is a spring behind the playout, so "when" is answered by where the
  // actor is on the path, not by the clock: discrete state (mounted, parked,
  // transition) switches exactly as the figure reaches the point where the
  // server made that change, never while it is still short of it.
  tickAtPose() {
    const arrived = 0.03;
    let tick = this.queue[0]?.t0 ?? this.latestTick;
    for (const seg of this.queue) {
      if (seg.s1 <= this.followS + arrived) tick = seg.t1;
      else {
        if (seg.length > 0 && this.followS > seg.s0)
          tick =
            seg.t0 + ((this.followS - seg.s0) / seg.length) * (seg.t1 - seg.t0);
        else tick = Math.max(tick, seg.t0);
        break;
      }
    }
    return Math.min(tick, this.playTick, this.latestTick);
  }
  remainingTrajectory() {
    return unique3(this.route);
  }
}
export const articulate = animateCharacter;

// Ambient walkers use the same street centerlines as deliveries. Lane offsets
// and predictive yielding are visual only and cannot block the simulation.
export function pedestrianPose(path, travel, lane = 0.46) {
  const lengths = path.slice(1).map((p, i) => distance(path[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = ((travel % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const a = path[i],
        b = path[i + 1],
        f = remaining / lengths[i],
        dx = (b[0] - a[0]) / lengths[i],
        dz = (b[1] - a[1]) / lengths[i];
      // Fade the sidewalk offset at junctions, avoiding sideways corner jumps.
      const edge = Math.min(
        1,
        remaining / 0.65,
        (lengths[i] - remaining) / 0.65,
      );
      return {
        x: a[0] + (b[0] - a[0]) * f + dz * lane * edge,
        z: a[1] + (b[1] - a[1]) * f - dx * lane * edge,
        heading: Math.atan2(dx, dz),
        normal: [dz, -dx],
        laneOffset: lane * edge,
      };
    }
    remaining -= lengths[i];
  }
}
export function updatePedestrian(p, time, dt, couriers, reducedMotion) {
  const d = p.userData;
  const travel = d.walkOffset + (reducedMotion ? 0 : time * d.walkSpeed);
  const pose = pedestrianPose(d.walkPath, travel);
  let near = false,
    nearest = null,
    nearestDistance = Infinity;
  for (const courier of couriers) {
    const away = Math.hypot(courier.x - pose.x, courier.z - pose.z);
    if (away < 1.65) near = true;
    if (away < nearestDistance) {
      nearestDistance = away;
      nearest = courier;
    }
  }
  d.yield = THREE.MathUtils.damp(
    d.yield || 0,
    near ? 1.3 - pose.laneOffset : 0,
    7,
    dt,
  );
  const x = pose.x + pose.normal[0] * d.yield,
    z = pose.z + pose.normal[1] * d.yield;
  p.position.set(x, 0.44, z);
  // Measured turning feeds the stride; a passing courier draws a glance and,
  // from the friendly ones, a wave.
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const turn =
    d.lastHeading === undefined || !(dt > 0)
      ? 0
      : THREE.MathUtils.clamp(wrap(pose.heading - d.lastHeading) / dt, -3, 3);
  d.lastHeading = pose.heading;
  let look = null,
    greeting = false;
  if (nearest && nearestDistance < 3.6) {
    const yaw = wrap(Math.atan2(nearest.x - x, nearest.z - z) - pose.heading);
    if (Math.abs(yaw) < 2.4) {
      look = {
        yaw,
        weight: THREE.MathUtils.smoothstep(3.6 - nearestDistance, 0, 1.4),
      };
      greeting = nearestDistance < 2.3 && Math.abs(yaw) < 1.4;
    }
  }
  const out = animateWalker(p, {
    travel,
    time,
    dt,
    speed: d.walkSpeed,
    turn,
    greeting,
    look,
    reducedMotion,
    baseY: 0.44,
  });
  p.rotation.y = pose.heading + out.yaw;
  return near;
}
