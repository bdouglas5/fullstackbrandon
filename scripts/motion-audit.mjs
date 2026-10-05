// Headless smoothness audit: real engine + real ActorMotion, 60 fps frames,
// snapshots delivered on a wall-clock cadence. Reports stalls and jumps.
import { fresh, command, begin, step, baseline, clone } from "../shared/engine.js";
import { ActorMotion } from "../src/world-motion.js";
import { LiveClock } from "../src/live-clock.js";

const speed = Number(process.argv[2] || 1);
const dbg = process.env.DBG ? process.env.DBG.split(",").map(Number) : null;
const seconds = Number(process.argv[3] || 240);
const batch = process.argv[4] === "batch"; // legacy: publish only last of N steps
const jitter = Number(process.argv[5] || 0); // seconds of random network delay
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const inflight = []; let lastDue = 0;
const TICK = 0.4, FRAME = 1 / 60;
const s = fresh(42);
command(s, "start");
s.speed = speed;
const live = new LiveClock();
const motion = new ActorMotion({ clock: live });
let pushed = null;
const events = [];
const stepOnce = () => {
  if (!s.brandon.action) begin(s, baseline(s), { controller: "rules" });
  step(s);
};
let wall = 0, nextStep = 0, snap = clone(s);
// Per-channel history for velocity-discontinuity detection (units/s).
const ch = {}; const veh = {};
function watch(name, x, z, ctx) {
  const c = (ch[name] ||= { x, z, v: null, still: 0, stillStart: 0 });
  const d = Math.hypot(x - c.x, z - c.z), v = d / FRAME;
  const expected = speed * 1.6; // world units/s a courier can plausibly cover
  if (d > 0.35 * Math.max(1, speed / 2)) events.push({ t: wall.toFixed(2), tick: snap.tick, kind: "TELEPORT", ch: name, d: d.toFixed(2), ...ctx });
  else if (c.v !== null && Math.abs(v - c.v) > Math.max(1.2, expected * 0.9) ) events.push({ t: wall.toFixed(2), tick: snap.tick, kind: "VJUMP", ch: name, from: c.v.toFixed(2), to: v.toFixed(2), ...ctx });
  if (ctx.moving && d < 1e-5) { if (!c.still) c.stillStart = wall; c.still++; }
  else { if (c.still * FRAME > 0.25) events.push({ t: c.stillStart.toFixed(2), tick: snap.tick, kind: "STALL", ch: name, ms: Math.round(c.still * FRAME * 1000), ...ctx }); c.still = 0; }
  c.x = x; c.z = z; c.v = v;
}
for (; wall < seconds; wall += FRAME) {
  const per = TICK / speed;
  const emit = () => { const due = Math.max(lastDue, wall + rnd() * jitter); lastDue = due; inflight.push({ due, snap: clone(s) }); };
  if (batch) {
    if (wall >= nextStep) { for (let i = 0; i < speed; i++) stepOnce(); emit(); nextStep += TICK; }
  } else while (wall >= nextStep) { stepOnce(); emit(); nextStep += per; }
  while (inflight.length && inflight[0].due <= wall) snap = inflight.shift().snap;
  if (snap !== pushed) { live.push(snap); pushed = snap; }
  live.advance(FRAME, snap.status === "running");
  motion.update(snap.brandon, snap, FRAME);
  const shown = live.at(motion.shownTick, snap);
  const b = shown.brandon;
  const p = motion.position;
  const mode = (b.mountedMode || "foot") + (b.transition ? "*" : "") + (b.vehicleApproach ? "~" : "") + (b.buildingVisit ? "B" : "");
  const ctx = { mode, action: b.action, moving: !!b.move && !b.buildingVisit };
  if (dbg && wall >= dbg[0] && wall <= dbg[1] && true) console.log(wall.toFixed(2), "latest", snap.tick, "play", live.playTick.toFixed(2), "shownTick", motion.shownTick.toFixed(2), "pos", p.x.toFixed(2), p.z.toFixed(2), "mode", mode, "veh", shown.vehicle, "vl", JSON.stringify(shown.vehicleLocations?.bike?.position), "move", b.move?`${b.move.from}>${b.move.to}${b.move.docking?"D":""}`:"-", "act", b.action);
  watch("brandon", p.x, p.z, ctx);
  // Vehicle meshes, as Island.jsx places them: ridden = motion pose, else parked.
  const transport = b.mountedMode ?? shown.vehicle;
  for (const kind of ["bike", "van"]) {
    if (!shown.vehicles.includes(kind)) continue;
    const parked = (b.move?.docking && kind === shown.vehicle ? b.roadVehiclePosition : null) || shown.vehicleLocations?.[kind]?.position || (kind === "van" ? shown.parkedVan?.position : null) || [5.5, 3.15];
    // Mirror Island.jsx park(): ease into the parked spot, snap only for big jumps.
    const vs = (veh[kind] ||= { x: parked[0], z: parked[1] });
    if (transport === kind) { vs.x = p.x; vs.z = p.z; }
    else if (Math.hypot(parked[0] - vs.x, parked[1] - vs.z) > 4) { vs.x = parked[0]; vs.z = parked[1]; }
    else { const k = 1 - Math.exp(-FRAME / 0.14); vs.x += (parked[0] - vs.x) * k; vs.z += (parked[1] - vs.z) * k; }
    const pos = [vs.x, vs.z];
    watch(kind, pos[0], pos[1], { ...ctx, moving: ctx.moving && transport === kind });
  }
}
const by = {};
for (const e of events) { const k = `${e.kind}:${e.ch}`; by[k] = (by[k] || 0) + 1; }
console.log(`speed ${speed}x ${batch ? "BATCH" : "STREAM"}: ${events.length} events over ${seconds}s (sim tick ${s.tick})`, by);
const seen = new Set();
for (const e of events) { const k = `${e.kind}${e.ch}${e.mode}${e.action}`; if (seen.has(k) || seen.size > 24) continue; seen.add(k); console.log(JSON.stringify(e)); }
