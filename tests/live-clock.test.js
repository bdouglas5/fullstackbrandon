import test from "node:test";
import assert from "node:assert/strict";
import { LiveClock } from "../src/live-clock.js";
import { ActorMotion } from "../src/world-motion.js";
import {
  fresh,
  command,
  begin,
  step,
  baseline,
  clone,
} from "../shared/engine.js";

const FRAME = 1 / 60;
// Deterministic pseudo-random network delay.
function rng(seed = 11) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Straight-line walker the server reports once per tick.
function walker(tick, x) {
  const s = fresh(1);
  s.status = "running";
  s.tick = tick;
  s.brandon.position = [x, 2];
  s.brandon.move = { from: "home", to: "workshop", distance: 99, progress: x };
  return s;
}
function playback({ speed, jitter, seconds = 30 }) {
  const live = new LiveClock();
  const motion = new ActorMotion({ clock: live });
  const rand = rng();
  const queue = [];
  let tick = 0,
    nextAt = 0,
    last = null,
    lastDue = 0,
    pushed = null,
    snap = walker(0, 0);
  const speeds = [];
  for (let wall = 0; wall < seconds; wall += FRAME) {
    while (wall >= nextAt) {
      tick++;
      const due = Math.max(lastDue, wall + rand() * jitter);
      lastDue = due;
      queue.push({ due, state: walker(tick, tick * 0.48) });
      nextAt += 0.4 / speed;
    }
    while (queue.length && queue[0].due <= wall) snap = queue.shift().state;
    if (snap !== pushed) {
      live.push(snap);
      pushed = snap;
    }
    live.advance(FRAME, true);
    motion.update(snap.brandon, snap, FRAME);
    const x = motion.position.x;
    if (last !== null && wall > 4) speeds.push((x - last) / FRAME);
    last = x;
  }
  return speeds;
}

for (const speed of [1, 2, 4, 8]) {
  test(`${speed}x playback keeps constant cruise speed through ${speed > 1 ? "fast" : "normal"} delivery with network jitter`, () => {
    const speeds = playback({ speed, jitter: 0.12 });
    const cruise = (0.48 * speed) / 0.4;
    assert.ok(
      speeds.every((v) => v >= 0),
      "never moves backwards",
    );
    const stopped = speeds.filter((v) => v < cruise * 0.5).length;
    assert.ok(
      stopped / speeds.length < 0.01,
      `stopped ${stopped}/${speeds.length}`,
    );
    // No frame may differ from the previous by more than a small fraction of cruise.
    let worst = 0;
    for (let i = 1; i < speeds.length; i++)
      worst = Math.max(worst, Math.abs(speeds[i] - speeds[i - 1]));
    assert.ok(
      worst < cruise * 0.35,
      `speed jumped by ${worst} at cruise ${cruise}`,
    );
  });
}

test("a late frame slows the figure smoothly instead of stopping and snapping", () => {
  const live = new LiveClock();
  const motion = new ActorMotion({ clock: live });
  let snap = walker(0, 0);
  live.push(snap);
  motion.update(snap.brandon, snap, FRAME);
  const speeds = [];
  let last = motion.position.x,
    tick = 0,
    nextAt = 0.4;
  for (let wall = 0; wall < 20; wall += FRAME) {
    // Frame 25 is delayed by 700 ms.
    if (wall >= nextAt && !(tick === 24 && wall < 10 + 0.7)) {
      tick++;
      snap = walker(tick, tick * 0.48);
      live.push(snap);
      nextAt += 0.4;
    }
    live.advance(FRAME, true);
    motion.update(snap.brandon, snap, FRAME);
    speeds.push((motion.position.x - last) / FRAME);
    last = motion.position.x;
  }
  let worst = 0;
  for (let i = 1; i < speeds.length; i++)
    worst = Math.max(worst, Math.abs(speeds[i] - speeds[i - 1]));
  assert.ok(worst < 0.25, `frame-to-frame speed change ${worst}`);
});

test("vehicles never pop between ridden and parked, with jittery delivery", () => {
  const s = fresh(42);
  command(s, "start");
  const live = new LiveClock();
  const motion = new ActorMotion({ clock: live });
  const rand = rng(3);
  const pending = [];
  let snap = clone(s),
    pushed = null,
    lastDue = 0,
    nextAt = 0;
  const previous = {};
  let pops = 0,
    frames = 0;
  const popped = [];
  for (let wall = 0; wall < 1800; wall += FRAME) {
    while (wall >= nextAt) {
      if (!s.brandon.action) begin(s, baseline(s), { controller: "rules" });
      step(s);
      const due = Math.max(lastDue, wall + rand() * 0.1);
      lastDue = due;
      pending.push({ due, state: clone(s) });
      nextAt += 0.4;
    }
    while (pending.length && pending[0].due <= wall)
      snap = pending.shift().state;
    if (snap !== pushed) {
      live.push(snap);
      pushed = snap;
    }
    live.advance(FRAME, true);
    motion.update(snap.brandon, snap, FRAME);
    const shown = live.at(motion.shownTick, snap);
    const mounted = shown.brandon.mountedMode ?? shown.vehicle;
    for (const kind of ["bike", "van"]) {
      if (!shown.vehicles.includes(kind)) continue;
      const parked = (shown.brandon.move?.docking && kind === shown.vehicle
        ? shown.brandon.roadVehiclePosition
        : null) ||
        shown.vehicleLocations?.[kind]?.position ||
        (kind === "van" ? shown.parkedVan?.position : null) ||
        previous[kind] || [5.5, 3.15];
      const at =
        mounted === kind ? [motion.position.x, motion.position.z] : parked;
      if (previous[kind] && frames > 600) {
        const d = Math.hypot(
          at[0] - previous[kind][0],
          at[1] - previous[kind][1],
        );
        if (d > 0.9) {
          pops++;
          popped.push(`${kind}@${wall.toFixed(1)}s ${d.toFixed(2)}`);
        }
      }
      previous[kind] = at;
    }
    frames++;
  }
  assert.equal(pops, 0, `vehicle popped: ${popped.slice(0, 5).join(", ")}`);
});

test("a restart rewinds the clock and snaps instead of gliding", () => {
  const live = new LiveClock();
  const motion = new ActorMotion({ clock: live });
  for (let t = 0; t < 50; t++) {
    const s = walker(t, t * 0.48);
    live.push(s);
    live.advance(0.4, true);
    motion.update(s.brandon, s, 0.4);
  }
  const fresh0 = walker(0, 0);
  live.push(fresh0);
  motion.update(fresh0.brandon, fresh0, FRAME);
  assert.ok(
    Math.abs(motion.position.x) < 1e-6,
    "snapped to the new run's start",
  );
  assert.equal(live.latest, 0);
});
