import * as THREE from "three";
import { personaFor } from "./cast.js";

/**
 * Character motion vocabulary, shared by the hero, crew, contractors,
 * shopkeepers and pedestrians.
 *
 * Everything here is a pure function of time, a seed and the character's
 * state, so a given character always moves the same way and nothing ever
 * jitters. Layers add into one pose accumulator ("ex"), and each rig type
 * (the skinned courier, the rigid townsperson) applies it to its own joints.
 * Under reduced motion every layer collapses to the authored rest pose.
 *
 * Joint convention (courier and townsfolk alike): a limb hangs along -y, a
 * negative x rotation swings it forward and up, and `arms[0]` / `legs[0]` are
 * the character's right side (the node named "left arm" at -x).
 * For arms, z is *inward* when multiplied by `side` (+1 for arms[0]).
 */

export const clamp = THREE.MathUtils.clamp;
export const TAU = Math.PI * 2;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic hash in [0,1) for a seed and an integer. */
export function hash01(seed, n) {
  let h = Math.imul(
    (Math.floor(seed * 9973) ^ Math.imul(n | 0, 374761393)) | 0,
    668265263,
  );
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic Catmull-Rom through evenly spaced samples: a smooth loop track. */
export function loop(u, v) {
  const n = v.length;
  const x = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(x),
    f = x - i;
  const p0 = v[(i + n - 1) % n],
    p1 = v[i % n],
    p2 = v[(i + 1) % n],
    p3 = v[(i + 2) % n];
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

/** One-shot Catmull-Rom through evenly spaced samples, ends held. */
export function span(u, v) {
  const n = v.length - 1;
  const x = clamp(u, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(x)),
    f = x - i;
  const p0 = v[Math.max(0, i - 1)],
    p1 = v[i],
    p2 = v[i + 1],
    p3 = v[Math.min(n, i + 2)];
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

/** Frame-rate independent critically damped chase. */
export const chase = (value, target, rate, dt) =>
  THREE.MathUtils.damp(value, target, rate, dt);

// ---------------------------------------------------------------------------
// The pose accumulator.

export function makePose() {
  return {
    y: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    hips: { x: 0, y: 0, z: 0, px: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
    legs: [
      { x: 0, y: 0, z: 0, k: 0 },
      { x: 0, y: 0, z: 0, k: 0 },
    ],
    arms: [
      { x: 0, y: 0, z: 0, e: 0 },
      { x: 0, y: 0, z: 0, e: 0 },
    ],
    // `lock` fades a gesture's grip on the arm away from the base pose.
    armLock: [0, 0],
    face: { smile: 0, open: 0, squint: 0, wide: 0, brow: 0, browTilt: 0 },
  };
}

// ---------------------------------------------------------------------------
// Fidgets: small scheduled gestures that make an idle character feel like a
// person thinking. Each is `(u, ctx, ex, k)` with u in [0,1]; `k` is the
// envelope (0 to 1) that eases the gesture in and out.

export const inward = (i) => (i ? -1 : 1);
const reach = (ex, i, x, z, e, k) => {
  const a = ex.arms[i];
  a.x += x * k;
  a.z += inward(i) * z * k;
  a.e += e * k;
  ex.armLock[i] = Math.max(ex.armLock[i], k);
};

export const FIDGETS = {
  // Rub the back of the neck, a little sheepishly. (A chibi's arms reach the
  // neck and chin, not the cap, so this is the honest version of a hat tug.)
  neck: {
    dur: 2.5,
    pose(u, c, ex, k) {
      const up = sstep(0, 0.27, u) * (1 - sstep(0.78, 1, u));
      const rub = Math.sin(clamp((u - 0.32) / 0.4, 0, 1) * TAU * 2) * 0.07 * up;
      reach(ex, 0, -2.2 * up + rub, 0.46 * up, -1.55 * up, k);
      ex.head.x += 0.1 * up * k;
      ex.head.z += 0.07 * up * k;
      ex.face.brow += 0.4 * up * k;
      ex.face.squint += 0.4 * up * k;
    },
  },
  // Settle a shoulder strap with one hand.
  strap: {
    dur: 2.1,
    pose(u, c, ex, k) {
      const up = sstep(0, 0.3, u) * (1 - sstep(0.75, 1, u));
      const pull = Math.sin(clamp((u - 0.4) / 0.3, 0, 1) * TAU) * 0.06 * up;
      reach(ex, 0, -0.8 * up + pull, 0.42 * up, -1.95 * up, k);
      ex.head.x += 0.16 * up * k;
      ex.chest.z += 0.03 * up * k;
    },
  },
  // Both arms up and back, a big breath, and a sigh.
  stretch: {
    dur: 3.3,
    pose(u, c, ex, k) {
      const up = sstep(0.04, 0.34, u) * (1 - sstep(0.62, 0.9, u));
      const sigh = sstep(0.62, 0.74, u) * (1 - sstep(0.74, 1, u));
      for (const i of [0, 1])
        reach(ex, i, -2.85 * up, -0.22 * up, -0.14 * up, k);
      ex.chest.x += (-0.2 * up + 0.07 * sigh) * k;
      ex.head.x += (-0.28 * up + 0.12 * sigh) * k;
      ex.y += 0.012 * up * k;
      ex.face.open += 0.7 * sstep(0.45, 0.6, u) * (1 - sstep(0.6, 0.75, u)) * k;
      ex.face.squint += 0.5 * up * k;
    },
  },
  // Look to one side, hold, scan, and come back.
  glance: {
    dur: 2.7,
    pose(u, c, ex, k) {
      const side = hash01(c.seed, c.slot + 7) > 0.5 ? 1 : -1;
      const out = sstep(0, 0.22, u) * (1 - sstep(0.72, 0.96, u));
      const scan = Math.sin(u * TAU * 1.5) * 0.09 * out;
      ex.head.y += side * (0.68 * out + scan) * k;
      ex.head.x += -0.04 * out * k;
      ex.chest.y += side * 0.17 * out * k;
      ex.yaw += side * 0.12 * out * k;
      ex.face.brow += 0.35 * out * k;
    },
  },
  // Look down at the parcel in hand.
  parcel: {
    dur: 2.3,
    needs: "carrying",
    pose(u, c, ex, k) {
      const d = sstep(0, 0.25, u) * (1 - sstep(0.72, 1, u));
      ex.head.x += 0.34 * d * k;
      ex.chest.x += 0.05 * d * k;
      ex.face.brow -= 0.15 * d * k;
      ex.arms[0].e += -0.12 * d * k;
      ex.arms[1].e += -0.12 * d * k;
    },
  },
  // A slow roll of the shoulders.
  shoulders: {
    dur: 1.9,
    pose(u, c, ex, k) {
      const w = Math.sin(u * TAU * 1.5);
      ex.arms[0].z += inward(0) * -0.1 * w * k;
      ex.arms[1].z += inward(1) * 0.1 * w * k;
      ex.arms[0].x += 0.12 * Math.max(0, w) * k;
      ex.arms[1].x += 0.12 * Math.max(0, -w) * k;
      ex.chest.z += 0.035 * w * k;
      ex.head.z += -0.03 * w * k;
    },
  },
  // Tap a foot to a beat nobody else can hear.
  tap: {
    dur: 2.5,
    pose(u, c, ex, k) {
      const beat = Math.max(0, Math.sin(u * TAU * 4));
      ex.legs[1].x += (-0.07 + 0.2 * beat) * k;
      ex.legs[1].k += 0.1 * beat * k;
      ex.head.x += 0.035 * Math.sin(u * TAU * 4 - 0.6) * k;
      ex.chest.z += 0.012 * Math.sin(u * TAU * 2) * k;
      ex.face.brow += 0.1 * k;
    },
  },
  // Check a wrist (or a phone) held across the chest, then look up again.
  check: {
    dur: 2.9,
    pose(u, c, ex, k) {
      const up = sstep(0, 0.22, u) * (1 - sstep(0.78, 1, u));
      const down = 1 - sstep(0.55, 0.72, u);
      reach(ex, 1, -0.4 * up, 0.55 * up, -1.8 * up, k);
      ex.head.x += (0.38 * down - 0.08 * (1 - down)) * up * k;
      ex.face.brow += (-0.2 * down + 0.3 * (1 - down)) * up * k;
    },
  },
  // Smooth the apron or skirt with both hands.
  tidy: {
    dur: 2.3,
    pose(u, c, ex, k) {
      const d = sstep(0, 0.2, u) * (1 - sstep(0.8, 1, u));
      const stroke = Math.sin(u * TAU * 2.5) * 0.17;
      for (const i of [0, 1])
        reach(ex, i, (-0.5 + stroke) * d, 0.16 * d, -0.95 * d, k);
      ex.head.x += 0.15 * d * k;
      ex.chest.x += 0.03 * d * k;
    },
  },
  // Clasp hands in front, a little proud of the day's work.
  hands: {
    dur: 3.1,
    pose(u, c, ex, k) {
      const d = sstep(0, 0.22, u) * (1 - sstep(0.78, 1, u));
      for (const i of [0, 1]) reach(ex, i, -0.72 * d, 0.36 * d, -1.4 * d, k);
      ex.chest.z += Math.sin(u * TAU) * 0.02 * d * k;
      ex.face.brow += 0.15 * d * k;
    },
  },
  // Pat the belly after a good laugh.
  belly: {
    dur: 2.5,
    pose(u, c, ex, k) {
      const d = sstep(0, 0.2, u) * (1 - sstep(0.8, 1, u));
      const pat =
        Math.max(0, Math.sin(clamp((u - 0.25) / 0.5, 0, 1) * TAU * 1.5)) * 0.12;
      reach(ex, 0, -0.6 * d, 0.3 * d, (-1.5 + pat) * d, k);
      ex.chest.x += -0.04 * d * k;
      ex.head.x += -0.1 * d * k;
      ex.face.open += 0.55 * sstep(0.2, 0.3, u) * (1 - sstep(0.7, 0.85, u)) * k;
      ex.face.squint += 0.6 * d * k;
    },
  },
  // Two bright little hops.
  bounce: {
    dur: 1.7,
    pose(u, c, ex, k) {
      const hop =
        Math.abs(Math.sin(u * Math.PI * 2)) *
        (1 - sstep(0.7, 1, u)) *
        sstep(0, 0.08, u);
      ex.y += 0.045 * hop * k;
      for (const i of [0, 1])
        reach(ex, i, -0.35 * hop, -0.08 * hop, -0.3 * hop, k);
      ex.legs[0].k += 0.2 * (1 - hop) * k * 0.4;
      ex.legs[1].k += 0.2 * (1 - hop) * k * 0.4;
      ex.face.squint += 0.45 * hop * k;
      ex.face.smile += 0.3 * k;
    },
  },
  // A friendly wave at nobody in particular.
  wave: {
    dur: 2.3,
    pose(u, c, ex, k) {
      const up = sstep(0, 0.2, u) * (1 - sstep(0.8, 1, u));
      const flap = Math.sin(clamp((u - 0.2) / 0.6, 0, 1) * TAU * 3);
      reach(ex, 0, -2.65 * up, -0.2 * up, (-0.55 + flap * 0.42) * up, k);
      ex.head.z += 0.08 * up * k;
      ex.face.smile += 0.35 * up * k;
      ex.face.open += 0.3 * up * k;
    },
  },
  // Nudge the glasses back up.
  glasses: {
    dur: 1.9,
    pose(u, c, ex, k) {
      const up = sstep(0, 0.28, u) * (1 - sstep(0.7, 1, u));
      const nudge = Math.sin(clamp((u - 0.35) / 0.25, 0, 1) * Math.PI) * 0.08;
      reach(ex, 0, -2.0 * up + nudge, 0.2 * up, -2.1 * up, k);
      ex.face.brow += 0.3 * up * k;
      ex.head.x += 0.04 * up * k;
    },
  },
  // A slow, dreamy sway.
  sway: {
    dur: 3.6,
    pose(u, c, ex, k) {
      const s = Math.sin(u * TAU);
      ex.hips.px += 0.035 * s * k;
      ex.hips.z += 0.04 * s * k;
      ex.chest.z += -0.035 * s * k;
      ex.head.z += 0.04 * s * k;
    },
  },
};

// Gestures that need a free arm are not chosen while a parcel is in hand.
for (const id of [
  "neck",
  "strap",
  "stretch",
  "check",
  "tidy",
  "hands",
  "belly",
  "wave",
  "glasses",
  "bounce",
])
  FIDGETS[id].arms = true;
FIDGETS.glasses.needs = "glasses";

/** Pick a gesture for this moment, or null. Stateless: same time, same gesture. */
export function scheduledFidget(time, seed, persona, menu) {
  // Everyone starts settled: no gesture in the first couple of seconds.
  if (time < 2.5) return null;
  const energy = persona.energy;
  const L = 7.2 / Math.max(0.55, energy);
  const t = time + seed * L;
  const slot = Math.floor(t / L);
  const local = t - slot * L;
  // Not every slot holds a gesture: stillness is part of the performance.
  if (hash01(seed, slot * 5 + 2) > 0.5 + 0.28 * energy) return null;
  let total = 0;
  for (const id in menu) total += menu[id];
  let pick = hash01(seed, slot * 5 + 1) * total,
    id = null;
  for (const key in menu) {
    pick -= menu[key];
    if (pick <= 0) {
      id = key;
      break;
    }
  }
  id ||= Object.keys(menu)[0];
  const def = FIDGETS[id];
  if (!def) return null;
  const start =
    0.7 + hash01(seed, slot * 5 + 3) * Math.max(0, L - def.dur - 1.4);
  const u = (local - start) / def.dur;
  if (u < 0 || u > 1) return null;
  return { id, def, u, k: sstep(0, 0.14, u) * (1 - sstep(0.82, 1, u)), slot };
}

// ---------------------------------------------------------------------------
// Idle life: weight moves from foot to foot; breath; a drifting gaze.

/** Smooth load shift between legs, in [-1,1]. Holds, then eases across. */
export function weightShift(time, seed, energy) {
  const L = 5.4 / Math.max(0.5, energy);
  const t = time / L + seed * 17;
  const k = Math.floor(t),
    f = t - k;
  const side = (n) => (hash01(seed, n + 40) > 0.5 ? 1 : -1);
  return THREE.MathUtils.lerp(side(k), side(k + 1), sstep(0.78, 1, f));
}

/** Deliberate contrapposto: hips over the loaded leg, shoulders answering. */
export function idleLayer(ex, c) {
  const s = weightShift(c.time, c.seed, c.persona.energy) * c.idle;
  const load = (i) => 0.5 + 0.5 * (i ? s : -s); // 1 on the loaded leg
  ex.hips.z += s * 0.042;
  ex.hips.px += s * 0.02;
  ex.chest.z += -s * 0.03;
  ex.head.z += -s * 0.02;
  for (const i of [0, 1]) {
    const free = 1 - load(i);
    // The unloaded leg softens at the knee and turns out a touch; the hip angle
    // stays untouched so a step always starts from a straight leg.
    ex.legs[i].k += 0.1 * free * c.idle;
    ex.legs[i].y += (i ? 1 : -1) * 0.08 * free * c.idle;
  }
  ex.arms[0].z += inward(0) * -0.02 * s * c.idle;
  ex.arms[1].z += inward(1) * 0.02 * s * c.idle;
}

// ---------------------------------------------------------------------------
// Tasks: what the hands are doing while the character works. Each has its own
// rhythm; `u` loops over `period` seconds and the pose is written into `ex`
// at weight `w`.

export const TASKS = {
  // Sorting and packing: alternating hands, eyes on the work (the original).
  pack: { period: 2 },
  // Serving a customer: draw back, offer, hold, tip the cap, relax.
  handoff: {
    period: 3.6,
    pose(u, c, ex, w) {
      const draw = loop(u, [0, 0.35, 0.1, 0.0, 0, 0, 0, 0]);
      const offer = sstep(0.1, 0.34, u) * (1 - sstep(0.6, 0.74, u));
      // Thanks: a hand to the heart and a small nod.
      const tip = sstep(0.62, 0.74, u) * (1 - sstep(0.88, 0.98, u));
      const arms = [
        -0.84 - 0.55 * offer + 0.12 * draw + 0.5 * tip,
        -0.84 - 0.55 * offer + 0.12 * draw,
      ];
      const elbows = [-0.34 + 0.22 * offer - 1.5 * tip, -0.34 + 0.22 * offer];
      for (const i of [0, 1]) {
        ex.arms[i].x += arms[i] * w;
        ex.arms[i].z +=
          inward(i) * (-0.11 + 0.1 * offer + (i ? 0 : 0.5 * tip)) * w;
        ex.arms[i].e += elbows[i] * w;
        ex.armLock[i] = Math.max(ex.armLock[i], w);
      }
      ex.pitch += (0.07 * offer - 0.025 * draw) * w;
      ex.head.x += (-0.06 * offer + 0.2 * tip) * w;
      ex.face.smile += (0.5 * offer + 0.4 * tip) * w;
      ex.face.open += 0.35 * offer * w;
      ex.face.brow += 0.3 * offer * w;
    },
  },
  // Gathering stock: crouch, reach, hug it close, and rise.
  gather: {
    period: 3.8,
    pose(u, c, ex, w) {
      const down = loop(u, [0, 0.6, 1, 1, 0.5, 0, 0, 0]);
      const reachOut = sstep(0.28, 0.46, u) * (1 - sstep(0.52, 0.66, u));
      const hug = sstep(0.55, 0.72, u);
      for (const i of [0, 1]) {
        ex.legs[i].x += -1.12 * down * w;
        ex.legs[i].k += 2.0 * down * w;
        ex.arms[i].x += (-0.62 * down - 0.4 * reachOut - 0.2 * hug) * w;
        ex.arms[i].e += (-0.25 * reachOut - 0.34 * hug) * w;
        ex.arms[i].z += inward(i) * (0.04 + 0.1 * hug) * w;
        ex.armLock[i] = Math.max(ex.armLock[i], w);
      }
      ex.pitch += 0.38 * down * w;
      ex.y += -0.155 * down * w;
      ex.chest.x += 0.1 * down * w;
      ex.head.x += -0.22 * down * w;
      ex.face.brow -= 0.15 * down * w;
    },
  },
  // Hammering: wind up, strike, rebound; the off hand steadies the work.
  build: {
    period: 1.15,
    pose(u, c, ex, w) {
      // 0 rest, 1 wound up overhead, -0.2 follow-through below the strike.
      const swing = loop(u, [0.1, 0.5, 1, 0.9, -0.15, 0.1]);
      ex.arms[0].x += (-0.9 - 1.55 * swing) * w;
      ex.arms[0].e += (-0.2 - 0.5 * Math.max(0, swing)) * w;
      ex.arms[0].z += inward(0) * 0.12 * w;
      ex.arms[1].x += -1.05 * w;
      ex.arms[1].e += -0.95 * w;
      ex.arms[1].z += inward(1) * 0.22 * w;
      ex.armLock[0] = ex.armLock[1] = Math.max(ex.armLock[0], w);
      ex.pitch += (0.08 - 0.07 * swing) * w;
      ex.chest.x += (0.05 - 0.07 * swing) * w;
      ex.head.x += (0.12 - 0.05 * swing) * w;
      ex.y += -0.012 * Math.max(0, -swing + 0.2) * w;
      for (const i of [0, 1]) {
        ex.legs[i].z += (i ? 1 : -1) * 0.1 * w;
        ex.legs[i].k += 0.14 * w;
      }
      ex.face.brow -= 0.3 * w;
    },
  },
  // Surveying with a clipboard: read, mark, look up, nod.
  measure: {
    period: 4.2,
    pose(u, c, ex, w) {
      const read = 1 - sstep(0.55, 0.7, u) * (1 - sstep(0.85, 0.96, u));
      const mark = Math.sin(u * TAU * 4) * 0.05 * read;
      // The board is held across the chest, facing the reader; the other hand marks it.
      ex.arms[1].x += -0.5 * w;
      ex.arms[1].e += -1.8 * w;
      ex.arms[1].z += inward(1) * 0.5 * w;
      ex.arms[0].x += (-0.42 + mark) * w;
      ex.arms[0].e += -1.55 * w;
      ex.arms[0].z += inward(0) * 0.46 * w;
      ex.armLock[0] = ex.armLock[1] = Math.max(ex.armLock[0], w);
      ex.head.x += (0.32 * read - 0.1 * (1 - read)) * w;
      ex.head.y += 0.28 * (1 - read) * w;
      ex.chest.y += 0.08 * (1 - read) * w;
      ex.face.brow += (0.35 * (1 - read) - 0.1 * read) * w;
    },
  },
  // Plugging in: reach, wiggle it home, hand on hip while it charges.
  plug: {
    period: 4.2,
    pose(u, c, ex, w) {
      const reachIn = sstep(0.04, 0.22, u) * (1 - sstep(0.5, 0.64, u));
      const wiggle =
        Math.sin(clamp((u - 0.22) / 0.2, 0, 1) * TAU * 3) * 0.05 * reachIn;
      const hip = sstep(0.55, 0.7, u);
      ex.arms[0].x += (-1.28 * reachIn - 0.35 * hip + wiggle) * w;
      ex.arms[0].e += (-0.22 * reachIn - 1.9 * hip) * w;
      ex.arms[0].z += inward(0) * (0.08 * reachIn - 0.46 * hip) * w;
      ex.arms[1].x += -0.2 * hip * w;
      ex.arms[1].z += inward(1) * -0.4 * hip * w;
      ex.arms[1].e += -1.9 * hip * w;
      ex.armLock[0] = ex.armLock[1] = Math.max(ex.armLock[0], w);
      ex.pitch += 0.09 * reachIn * w;
      ex.head.x += (0.18 * reachIn - 0.05 * hip) * w;
      ex.head.y += 0.22 * hip * w;
      ex.face.brow += 0.15 * hip * w;
    },
  },
  // Talking it through: open hands, nods, a smile that comes and goes.
  talk: {
    period: 3.9,
    pose(u, c, ex, w) {
      const beat = loop(u, [0, 0.8, 0.25, 1, 0.1, 0.6, 0, 0.3]);
      const beat2 = loop(u + 0.3, [0, 0.5, 1, 0.2, 0.7, 0, 0.9, 0.3]);
      ex.arms[0].x += (-0.78 - 0.34 * beat) * w;
      ex.arms[0].e += (-1.05 - 0.2 * beat) * w;
      ex.arms[0].z += inward(0) * (-0.14 + 0.2 * beat) * w;
      ex.arms[1].x += (-0.74 - 0.26 * beat2) * w;
      ex.arms[1].e += (-1.0 - 0.16 * beat2) * w;
      ex.arms[1].z += inward(1) * (-0.14 + 0.16 * beat2) * w;
      ex.armLock[0] = ex.armLock[1] = Math.max(ex.armLock[0], w);
      ex.head.x += (0.05 - 0.1 * beat) * w;
      ex.head.z += 0.07 * Math.sin(u * TAU) * w;
      ex.chest.y += 0.06 * Math.sin(u * TAU * 2) * w;
      // Syllables: the mouth opens and shuts between them.
      ex.face.open += 0.6 * Math.max(0, Math.sin(u * TAU * 5.3)) ** 0.8 * w;
      ex.face.brow += 0.25 * beat * w;
    },
  },
  // Taking a breather: hands on hips, deep breaths, a long look around.
  rest: {
    period: 7,
    pose(u, c, ex, w) {
      const breath = Math.sin(u * TAU * 2);
      for (const i of [0, 1]) {
        ex.arms[i].x += -0.18 * w;
        ex.arms[i].z += inward(i) * -0.42 * w;
        ex.arms[i].e += -1.95 * w;
        ex.armLock[i] = Math.max(ex.armLock[i], w);
      }
      ex.chest.x += (-0.04 + 0.025 * breath) * w;
      ex.head.y += Math.sin(u * TAU) * 0.55 * w;
      ex.head.x += (-0.06 + 0.04 * Math.sin(u * TAU * 0.5 + 1)) * w;
      ex.face.smile += 0.2 * w;
      ex.face.squint += 0.2 * w;
    },
  },
};

// ---------------------------------------------------------------------------
// Face: expressions are blends of a few controls, driven by what the
// character is doing, never random. Values: smile 0..1.2, open 0..1, squint
// 0..1 (happy eyes), wide 0..1, brow -1..1 (down..up), browTilt -1..1.

export function faceLayer(ex, c) {
  const f = ex.face;
  f.smile +=
    c.persona.smile +
    0.1 * c.walk -
    0.12 * c.carry -
    0.08 * c.work * (1 - c.handoff);
  f.brow += -0.12 * c.work * (1 - c.handoff) - 0.1 * c.carry;
  return f;
}

// ---------------------------------------------------------------------------
// Secondary motion: damped springs that lag the body, for packs, charms,
// ponytails, scarves and bandana tails.

export class Swing {
  constructor() {
    this.x = this.z = this.vx = this.vz = 0;
  }
  /** Drive with inertial forcing (fx, fz); rest at (tx, tz). */
  step(fx, fz, tx, tz, omega, zeta, dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx +=
        (fx - 2 * zeta * omega * this.vx - omega * omega * (this.x - tx)) * h;
      this.vz +=
        (fz - 2 * zeta * omega * this.vz - omega * omega * (this.z - tz)) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
    }
    this.x = clamp(this.x, -1.1, 1.1);
    this.z = clamp(this.z, -1.1, 1.1);
  }
  reset() {
    this.x = this.z = this.vx = this.vz = 0;
  }
}

export { personaFor };
