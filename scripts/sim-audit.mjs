// Engine-level continuity audit: no rendering, just authoritative frames.
// Flags positions/vehicles that move discontinuously between ticks.
import { fresh, command, begin, step, baseline } from "../shared/engine.js";
const ticks = Number(process.argv[2] || 12000), seed = Number(process.argv[3] || 42);
const s = fresh(seed); command(s, "start");
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
let prev = null; const out = {}; const samples = {};
const note = (k, info) => { out[k] = (out[k] || 0) + 1; (samples[k] ||= []).length < 4 && samples[k].push(info); };
for (let i = 0; i < ticks && s.status === "running"; i++) {
  if (!s.brandon.action) begin(s, baseline(s), { controller: "rules" });
  step(s);
  const b = s.brandon;
  const now = { pos: [...b.position], mode: b.mountedMode || "foot", loc: JSON.parse(JSON.stringify(s.vehicleLocations || {})), tr: !!b.transition, v: b.voyage?.mode };
  if (prev && !b.voyage && !prev.v) {
    const step_ = d(prev.pos, now.pos);
    const cruise = { foot: 1.1, bike: 1.15, van: 1.7, rocket_skates: 2.4 }[now.mode] ?? 1.2; // per-tick speed a mode can legitimately cover
    if (step_ > cruise * 1.25) note("PERSON_TELEPORT", { tick: s.tick, step: step_.toFixed(2), action: b.action, mode: now.mode, node: b.node });
    for (const k of Object.keys(now.loc)) {
      const a = prev.loc[k]?.position, c = now.loc[k]?.position;
      // A parked vehicle may only change place while it is being ridden/docked.
      if (a && c && d(a, c) > 0.3) {
        const ridden = prev.mode === k || now.mode === k || b.transition;
        note(ridden ? "VEHICLE_PARK_UPDATE" : "VEHICLE_TELEPORT", { tick: s.tick, vehicle: k, jump: d(a, c).toFixed(2), from: a.map(x => +x.toFixed(1)), to: c.map(x => +x.toFixed(1)), action: b.action, mode: now.mode });
      }
    }
    // Boarding must start next to the vehicle being boarded.
    if (b.transition && !prev.tr && b.transition.to !== "foot") {
      const p = now.loc[b.transition.to]?.position;
      if (p && d(p, now.pos) > 0.8) note("MOUNT_AWAY_FROM_VEHICLE", { tick: s.tick, to: b.transition.to, away: d(p, now.pos).toFixed(2), action: b.action, node: b.node });
    }
  }
  prev = now;
}
console.log(`ticks ${s.tick}`, out); for (const [k, v] of Object.entries(samples)) console.log(k, JSON.stringify(v));
