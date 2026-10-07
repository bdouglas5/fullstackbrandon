import * as THREE from "three";
import { WHEEL_RADIUS } from "./toy-scale.js";
import { placePedals } from "./toy-vehicles.js";
import { personaFor } from "./cast.js";
import {
  clamp,
  TAU,
  sstep,
  hash01,
  inward,
  chase,
  makePose,
  FIDGETS,
  TASKS,
  scheduledFidget,
  idleLayer,
  faceLayer,
  Swing,
} from "./character-motion.js";

const characters = new WeakMap();
const vehicles = new WeakMap();
const townRigs = new WeakMap();

// Bind transforms are serializable so crew cloned from an already moving hero
// inherit the authored pose, rather than permanently inheriting that frame.
function restPose(object) {
  if (!object) return null;
  object.userData.animationRestPose ||= {
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray(),
  };
  return object.userData.animationRestPose;
}
const AXIS = { x: 0, y: 1, z: 2 };
const set = (node, axis, value) => {
  if (node) node.rotation[axis] = restPose(node).rotation[AXIS[axis]] + value;
};
const setPosition = (node, axis, value) => {
  if (node) node.position[axis] = restPose(node).position[AXIS[axis]] + value;
};
const setScale = (node, x, y = x, z = x) => {
  if (!node) return;
  const rest = restPose(node).scale;
  node.scale.set(rest[0] * x, rest[1] * y, rest[2] * z);
};

const stringSeed = (text) => {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h / 9973;
};
const easeOutBack = (t) => {
  const c1 = 1.9,
    c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const TASK_NAMES = Object.keys(TASKS);
const tau = TAU;

// The gestures this character can actually perform, from their persona and kit.
function fidgetMenu(persona, has) {
  const menu = {};
  for (const [id, weight] of Object.entries(persona.fidgets)) {
    const def = FIDGETS[id];
    if (!def) continue;
    if (def.needs === "headwear" && !has.headwear) continue;
    if (def.needs === "glasses" && !has.glasses) continue;
    menu[id] = weight;
  }
  if (!Object.keys(menu).length) menu.glance = 1;
  return menu;
}

function characterRig(body) {
  if (characters.has(body)) return characters.get(body);
  const find = (name) => body.getObjectByName(name);
  const eyes = [],
    brows = [],
    chains = [];
  body.traverse((o) => {
    if (o.name === "Eye") eyes.push(o);
    else if (o.name === "Brow") brows.push(o);
    else if (o.userData.links) {
      const links = [];
      o.traverse((n) => n.name === `${o.name} link` && links.push(n));
      chains.push({ root: o, links, swings: links.map(() => new Swing()) });
    }
  });
  const persona = personaFor(body.userData.persona);
  const seed = body.userData.castId
    ? stringSeed(body.userData.castId)
    : (() => {
        let h = 0;
        for (const c of body.uuid) h = (h * 31 + c.charCodeAt(0)) % 9973;
        return h / 9973;
      })();
  const has = {
    headwear: !!(
      find("cap") ||
      find("Knit beanie") ||
      find("Tied bandana") ||
      find("Hard hat")
    ),
    glasses: !!find("glasses"),
  };
  const rig = {
    legs: [find("left leg"), find("right leg")],
    arms: [find("left arm"), find("right arm")],
    hips: find("hips"),
    head: find("head rig"),
    chest: find("chest"),
    parcel: find("carried parcel"),
    pack: find("backpack"),
    charm: find("Pickle charm"),
    mouth: find("smile"),
    mouthOpen: find("Mouth open"),
    hammer: find("Hammer"),
    board: find("Clipboard"),
    eyes,
    brows,
    chains,
    persona,
    menu: fidgetMenu(persona, has),
    seed,
    ex: makePose(),
    // Smoothed blend weights and a springy forward lean.
    weights: { walk: 0, cycle: 0, seat: 0, fly: 0, carry: 0, work: 0 },
    targets: { walk: 0, cycle: 0, seat: 0, fly: 0, carry: 0, work: 0 },
    task: Object.fromEntries(TASK_NAMES.map((n) => [n, 0])),
    taskGoal: Object.fromEntries(TASK_NAMES.map((n) => [n, 0])),
    taskClock: Object.fromEntries(TASK_NAMES.map((n) => [n, 0])),
    lean: 0,
    leanVelocity: 0,
    dip: new Swing(),
    packSwing: new Swing(),
    charmSwing: new Swing(),
    history: { tilt: [0, 0], roll: [0, 0], headPitch: [0, 0], headYaw: [0, 0] },
    lookW: 0,
    lookYaw: 0,
    lookPitch: 0,
    armsFree: 1,
    facing: null,
    yawRate: 0,
    pivotPhase: 0,
    quietUntil: 0,
    // Mounted copies have their own seat height; standing copies inherit the
    // original zero height even when spawned partway through a walking bounce.
    y:
      body.scale.x < 0.9
        ? body.position.y
        : (body.userData.characterRestHeight ?? body.position.y),
    rotation: body.userData.characterRestRotation || [
      body.rotation.x,
      body.rotation.y,
      body.rotation.z,
    ],
  };
  body.userData.characterRestHeight ??= rig.y;
  body.userData.characterRestRotation ??= rig.rotation;
  for (const node of [
    ...rig.legs,
    ...rig.arms,
    rig.hips,
    rig.head,
    rig.parcel,
    rig.pack,
    rig.chest,
    rig.charm,
    rig.mouth,
    rig.mouthOpen,
    ...eyes,
    ...brows,
    ...chains.flatMap((c) => c.links),
  ])
    restPose(node);
  // Joint angles are absolute poses around an authored neutral axis. A seated
  // copy may already have bent legs, which must not become another bind offset.
  for (const joint of [
    ...rig.legs,
    ...rig.arms,
    rig.hips,
    rig.chest,
    ...rig.legs.map((leg) => leg?.getObjectByName("knee")),
    ...rig.arms.map((arm) => arm?.getObjectByName("elbow")),
  ]) {
    if (joint) restPose(joint).rotation = [0, 0, 0];
  }
  characters.set(body, rig);
  return rig;
}

/**
 * Animate local character joints only; the actor's route transform is untouched.
 *
 * Poses are layered rather than chased: each state (stand, walk, cycle,
 * seated, flying) defines an exact pose, cyclic motion is evaluated directly
 * from the gait phase, and only the blend weights between states are eased.
 * That keeps strides crisp while every change of state eases in and out. On
 * top of the base pose sit the character's persona (stride, bounce, sway),
 * weight shifts, scheduled gestures, the task the hands are on, an expressive
 * face, and damped springs for whatever hangs off them.
 *
 * Optional flags: `task` (pack | handoff | gather | build | measure | plug |
 * talk | rest), `look` ({yaw, pitch, weight} relative to the body), and
 * `fidget` ({id, u}) to direct a gesture by hand (used by the cast lab).
 */
export function animateCharacter(
  body,
  motion,
  {
    walking = false,
    working = false,
    carrying = false,
    cargoCount = null,
    cycling = false,
    seated = false,
    flying = false,
    skating = false,
    time = 0,
    dt = 1 / 30,
    reducedMotion = false,
    task = "pack",
    gatheringPlastic = false,
    look = null,
    fidget = null,
  } = {},
) {
  const rig = characterRig(body);
  if (rig.pack && rig.parcel) {
    cargoCount ??= carrying ? 1 : 0;
    carrying = false;
    if (["gather", "handoff", "pack"].includes(task) && !gatheringPlastic)
      working = false;
  }
  const step = clamp(Math.max(0, dt), 0, 1 / 15);
  const R = reducedMotion;
  const persona = rig.persona;
  const oscillate = (phase) => (R ? 0 : Math.sin(phase));
  const stride = walking && !R;
  const pedal = cycling && motion.moving !== false && !R;
  const work = working && !walking && !cycling && !seated && !flying;
  // Critically damped two-stage blend: S-shaped ease in and out.
  const w = rig.weights,
    goal = rig.targets;
  const want = {
    walk: stride ? 1 : 0,
    cycle: cycling ? 1 : 0,
    seat: seated && !cycling ? 1 : 0,
    fly: flying && !cycling && !seated ? 1 : 0,
    carry: carrying ? 1 : 0,
    work: work ? 1 : 0,
  };
  for (const key in want) {
    if (R) {
      goal[key] = w[key] = want[key];
      continue;
    }
    const rate = key === "carry" ? 12 : 14;
    goal[key] = chase(goal[key], want[key], rate, step);
    w[key] = chase(w[key], goal[key], rate, step);
    if (
      Math.abs(w[key] - want[key]) < 0.004 &&
      Math.abs(goal[key] - want[key]) < 0.004
    )
      w[key] = goal[key] = want[key];
  }
  // Each task has its own rhythm and its own clock, which restarts when the
  // task is picked up so every job begins with its own anticipation.
  const activeTask = TASKS[task] ? task : "pack";
  for (const name of TASK_NAMES) {
    const target = work && name === activeTask ? 1 : 0;
    if (R) {
      rig.taskGoal[name] = rig.task[name] = target;
      continue;
    }
    rig.taskGoal[name] = chase(rig.taskGoal[name], target, 9, step);
    rig.task[name] = chase(rig.task[name], rig.taskGoal[name], 9, step);
    if (
      Math.abs(rig.task[name] - target) < 0.004 &&
      Math.abs(rig.taskGoal[name] - target) < 0.004
    )
      rig.task[name] = rig.taskGoal[name] = target;
    rig.taskClock[name] =
      target || rig.task[name] > 0.01 ? rig.taskClock[name] + step : 0;
  }
  const mounted = Math.min(1, w.cycle + w.seat + w.fly);
  const walkW = w.walk * (1 - mounted);
  const standW = Math.max(0, 1 - walkW - w.cycle - w.seat - w.fly);
  const workW = w.work * standW;
  const idle = standW * (1 - workW);
  const ex = rig.ex;
  Object.assign(ex, { y: 0, pitch: 0, yaw: 0, roll: 0 });
  for (const part of [ex.hips, ex.chest, ex.head, ...ex.legs, ...ex.arms])
    for (const k in part) part[k] = 0;
  ex.armLock[0] = ex.armLock[1] = 0;
  Object.assign(ex.face, {
    smile: 0,
    open: 0,
    squint: 0,
    wide: 0,
    brow: 0,
    browTilt: 0,
  });

  // --- Gait: the leg swings back (positive) and forward; the knee folds while
  // the leg travels forward and is nearly straight when the heel lands. Stride
  // length and cadence are tied (a longer stride is a slower cadence), so feet
  // never slide, whoever is walking.
  const phase = motion.walkCycle || 0;
  const ph = phase / persona.stride;
  const speed = motion.speed || 0;
  const amp =
    (speed ? clamp(0.82 + speed * 0.06, 0.85, 1.08) : 1) * persona.stride;
  const breath = oscillate(time * 1.85 + rig.seed * 6);
  const turn = R ? 0 : clamp(motion.turnRate || 0, -3, 3);
  const reach = oscillate(time * 3.6);
  const pedalPhase = pedal ? phase : 0;

  // --- Turning on the spot: the feet step round instead of skating.
  let pivot = 0;
  if (!R && motion.facing !== undefined) {
    if (rig.facing === null) rig.facing = motion.facing;
    const rate = step > 0 ? wrapAngle(motion.facing - rig.facing) / step : 0;
    rig.facing = motion.facing;
    rig.yawRate = chase(rig.yawRate, clamp(rate, -9, 9), 9, step);
    pivot = sstep(0.45, 1.6, Math.abs(rig.yawRate)) * (1 - walkW) * standW;
    rig.pivotPhase += Math.abs(rig.yawRate) * step * 3.4;
  } else rig.yawRate = 0;

  // --- Life while standing: weight shifts, then a gesture now and then.
  if (!R)
    idleLayer(ex, { time, seed: rig.seed, persona, idle: idle * (1 - pivot) });
  // A gesture is only ever faded in or out: whether the arms are free, whether
  // a quiet spell is over, and how settled the character is are all smooth weights.
  rig.armsFree = R
    ? carrying
      ? 0
      : 1
    : chase(rig.armsFree, carrying ? 0 : 1, 9, step);
  let gesture = null;
  if (!R && fidget)
    gesture = {
      id: fidget.id,
      def: FIDGETS[fidget.id],
      u: fidget.u,
      k: fidget.k ?? 1,
      slot: 0,
    };
  else if (!R) gesture = scheduledFidget(time, rig.seed, persona, rig.menu);
  if (gesture) {
    const quiet = fidget ? 1 : sstep(0, 0.7, time - rig.quietUntil);
    const gate =
      (fidget ? 1 : idle * quiet) *
      (gesture.def.arms ? rig.armsFree : 1) *
      (gesture.def.needs === "carrying" ? w.carry : 1);
    if (gate > 0.001)
      gesture.def.pose(
        gesture.u,
        { seed: rig.seed, slot: gesture.slot },
        ex,
        gesture.k * gate,
      );
  }

  // --- Task poses (the packing rhythm below is the default task).
  for (const name of TASK_NAMES) {
    const def = TASKS[name];
    const share = workW * rig.task[name];
    if (!def.pose || share < 0.001) continue;
    def.pose(
      (rig.taskClock[name] / def.period) % 1,
      { seed: rig.seed },
      ex,
      share,
    );
  }
  const packShare = workW * rig.task.pack;

  // --- Look-at: the head leads, the shoulders and hips follow a little.
  const lookTarget = look && !R ? clamp(look.weight ?? 1, 0, 1) : 0;
  rig.lookW = R ? 0 : chase(rig.lookW, lookTarget, 5, step);
  rig.lookYaw = R
    ? 0
    : chase(rig.lookYaw, clamp(look?.yaw ?? rig.lookYaw, -1, 1), 6, step);
  rig.lookPitch = R
    ? 0
    : chase(rig.lookPitch, clamp(look?.pitch ?? 0, -0.5, 0.5), 6, step);
  const gaze = rig.lookW * (1 - mounted * 0.5);
  ex.head.y += rig.lookYaw * gaze * 0.85;
  ex.head.x += rig.lookPitch * gaze;
  ex.chest.y += rig.lookYaw * gaze * 0.2;
  ex.yaw += rig.lookYaw * gaze * 0.1;

  // --- Posture and pace belong to the person, not the pose.
  const posture = R ? 0 : (standW + walkW) * persona.slump;
  ex.chest.x += posture * 0.8;
  ex.head.x += posture * 0.6;

  // --- Stopping: the body settles into its knees, then recovers.
  if (R) rig.dip.reset();
  else {
    const braking =
      clamp(-(motion.acceleration || 0), 0, 10) * (walkW > 0.2 ? 1 : 0);
    rig.dip.step(braking * 0.55, 0, 0, 0, 15, 0.45, step);
  }
  const dip = clamp(rig.dip.x, -0.4, 0.5);

  rig.legs.forEach((leg, i) => {
    if (skating) {
      set(leg, "x", 0);
      set(leg, "y", 0);
      set(leg, "z", 0);
      set(leg?.getObjectByName("knee"), "x", 0);
      return;
    }
    const p = ph + i * Math.PI;
    // Cyclic terms always follow the phase; the walk weight fades them, so
    // stopping eases out from the pose the stride was in.
    const swing = R ? 0 : Math.sin(p);
    const fold = R ? 0 : Math.max(0, -Math.cos(p - 0.15)) ** 1.25;
    const pedalSwing = oscillate(pedalPhase + i * Math.PI);
    const e = ex.legs[i];
    // Feet step round in turn: one lifts and swings while the other plants.
    const pv = R ? 0 : Math.sin(rig.pivotPhase + i * Math.PI);
    const hip =
      walkW * swing * 0.66 * amp +
      w.cycle * (-0.96 + pedalSwing * 0.57) +
      w.seat * -1.03 +
      w.fly *
        (0.2 + breath * 0.015 + (i ? -0.06 : 0.06) * oscillate(time * 1.3)) +
      e.x +
      pivot * pv * 0.24 -
      dip * 0.15 * standW;
    set(leg, "x", hip);
    set(leg, "y", e.y);
    set(leg, "z", w.fly * (i ? -1 : 1) * 0.035 + e.z);
    const knee = leg?.getObjectByName("knee");
    set(
      knee,
      "x",
      walkW * (0.1 + fold * 0.86) * amp +
        w.cycle * (0.91 + pedalSwing * 0.42) +
        w.seat * 1.18 +
        w.fly * 0.27 +
        e.k +
        pivot * Math.max(0, pv) * 0.5 +
        dip * 0.55 * (walkW + standW),
    );
  });

  rig.arms.forEach((arm, i) => {
    const side = i ? -1 : 1;
    const p = ph + i * Math.PI;
    const swing = R ? 0 : Math.sin(p);
    const tool = oscillate(time * 3.6 + i * 0.9);
    const e = ex.arms[i];
    // Base arm pose from the lower-body state, then carry/work overlays.
    let x =
      walkW * -swing * 0.6 * amp * persona.arms +
      w.cycle * -1.03 +
      w.seat * -0.83 +
      w.fly * (-0.27 + breath * 0.02) +
      standW * breath * 0.025;
    let z =
      side *
      (walkW * 0.06 +
        w.fly * 0.2 +
        standW * (0.035 + breath * 0.013) +
        (w.cycle + w.seat) * 0.035);
    let elbow =
      walkW * (-0.18 - Math.max(0, swing) * 0.22) +
      (w.cycle + w.seat) * -0.2 +
      w.fly * -0.16 +
      standW * -0.055;
    x = THREE.MathUtils.lerp(x, -0.67 + tool * 0.26, packShare * (1 - w.carry));
    z = THREE.MathUtils.lerp(
      z,
      side * (0.1 + tool * 0.045),
      packShare * (1 - w.carry),
    );
    elbow = THREE.MathUtils.lerp(
      elbow,
      -0.26 - (tool + 1) * 0.16,
      packShare * (1 - w.carry),
    );
    // Holding the case: forearms wrap it, a little give with each step.
    const hold = w.carry * (1 - (w.cycle + w.seat) * 0.85);
    x = THREE.MathUtils.lerp(
      x,
      -0.84 +
        (work ? reach * 0.12 : stride ? -Math.sin(ph) * 0.03 : breath * 0.012),
      hold,
    );
    z = THREE.MathUtils.lerp(z, side * -0.11, hold);
    elbow = THREE.MathUtils.lerp(elbow, -0.34, hold);
    // Gestures and tasks take the arm over (lock) or ride on top of it.
    const lock = clamp(ex.armLock[i], 0, 1);
    set(arm, "x", x * (1 - lock) + e.x);
    set(arm, "z", z * (1 - lock) + e.z);
    set(arm, "y", e.y);
    set(arm?.getObjectByName("elbow"), "x", elbow * (1 - lock) + e.e);
  });

  // Weight: the body is highest as a leg passes under it and dips as the
  // heel lands; it rolls over the stance leg and the shoulders counter-twist.
  const passing = Math.cos(ph) ** 2;
  const bob =
    walkW * (passing * 0.034 * amp * persona.bounce - 0.012) +
    workW * reach * 0.009 * (1 - (rig.task.build + rig.task.gather) * 0.8) +
    standW * breath * 0.003 +
    w.fly * oscillate(time * 2.2) * 0.012 +
    ex.y -
    dip * 0.03 * standW;
  body.position.y = rig.y + (skating ? 0 : bob);
  // Forward lean is a spring: it overshoots a touch when starting and stopping.
  const accel = R ? 0 : clamp(motion.acceleration || 0, -10, 10);
  const leanTarget =
    walkW * (0.05 + clamp(speed * 0.008, 0, 0.05) + persona.lean) +
    w.cycle * 0.11 +
    workW *
      (0.045 + reach * 0.025) *
      (1 - (rig.task.build + rig.task.gather + rig.task.handoff) * 0.9) +
    w.fly * 0.06 +
    clamp(accel * 0.006, -0.05, 0.06) * walkW +
    ex.pitch;
  if (R) {
    rig.lean = leanTarget;
    rig.leanVelocity = 0;
  } else {
    const omega = 13 * persona.spring ** 0.5,
      zeta = 0.62;
    const n = Math.max(1, Math.ceil(step / (1 / 120)));
    const h = step / n;
    for (let k = 0; k < n; k++) {
      rig.leanVelocity +=
        (-2 * zeta * omega * rig.leanVelocity -
          omega * omega * (rig.lean - leanTarget)) *
        h;
      rig.lean += rig.leanVelocity * h;
    }
  }
  body.rotation.x = rig.rotation[0] + (skating ? 0 : rig.lean);
  body.rotation.z =
    rig.rotation[2] +
    walkW * (oscillate(ph) * 0.026 * persona.sway - turn * 0.012) +
    standW *
      oscillate(time * 0.72 + rig.seed * 4) *
      0.009 *
      (1 - Math.abs(ex.hips.z) * 8) +
    ex.roll;
  const twist = carrying ? 0 : oscillate(ph) * walkW;
  body.rotation.y =
    rig.rotation[1] -
    twist * 0.035 +
    workW * oscillate(time * 1.8) * 0.03 * rig.task.pack +
    ex.yaw;
  // Hips lead the legs; the chest counter-turns; the weight sits over a foot.
  set(
    rig.hips,
    "y",
    ex.hips.y - (R ? 0 : Math.sin(ph) * walkW * 0.07 * persona.hips),
  );
  set(
    rig.hips,
    "z",
    ex.hips.z + (R ? 0 : Math.sin(ph) * walkW * 0.022 * persona.sway),
  );
  set(rig.hips, "x", ex.hips.x);
  setPosition(rig.hips, "x", ex.hips.px);
  if (skating) {
    body.rotation.set(...rig.rotation);
    set(rig.hips, "x", 0);
    set(rig.hips, "y", 0);
    set(rig.hips, "z", 0);
    setPosition(rig.hips, "x", 0);
  }
  set(
    rig.chest,
    "y",
    (R ? 0 : oscillate(ph) * walkW * 0.11 * persona.hips) + ex.chest.y,
  );
  set(rig.chest, "x", walkW * 0.025 * amp + ex.chest.x + dip * 0.1 * standW);
  set(rig.chest, "z", ex.chest.z);
  if (rig.chest) {
    const rest = restPose(rig.chest);
    rig.chest.scale.y = rest.scale[1] * (1 + breath * 0.006);
    rig.chest.scale.z = rest.scale[2] * (1 + breath * 0.009);
  }

  // The head steadies against the shoulder twist, looks into turns, and
  // watches the work. Face and cap move as one unit.
  const quiet = standW * (1 - workW);
  const settleHead = (axis, value) => {
    if (!rig.head) return;
    const target = restPose(rig.head).rotation[AXIS[axis]] + value;
    rig.head.rotation[axis] = R
      ? target
      : chase(rig.head.rotation[axis], target, 10, step);
  };
  const workLook =
    workW * (0.12 + reach * 0.045) * (rig.task.pack + rig.task.build * 0.2);
  settleHead(
    "x",
    workLook +
      w.cycle * -0.08 +
      walkW * oscillate(ph * 2 - 0.6) * 0.02 * persona.head +
      quiet * breath * 0.018 +
      ex.head.x,
  );
  settleHead(
    "y",
    -twist * 0.09 +
      (walkW + w.cycle) * turn * 0.045 +
      quiet * oscillate(time * 0.37 + rig.seed * 9) * 0.04 +
      (1 - quiet - walkW - w.cycle) *
        oscillate(time * 0.8) *
        0.025 *
        rig.task.pack +
      ex.head.y,
  );
  settleHead(
    "z",
    quiet * oscillate(time * 0.51 + rig.seed * 3) * 0.02 -
      walkW * oscillate(ph) * 0.016 * persona.head +
      ex.head.z,
  );

  // --- Face: expressions are blends driven by what the character is doing.
  faceLayer(ex, {
    persona,
    walk: walkW,
    carry: w.carry,
    work: workW,
    handoff: rig.task.handoff,
  });
  const f = ex.face;
  const smile = clamp(f.smile, -0.2, 1.3);
  if (rig.mouth) {
    const open = clamp(f.open, 0, 1);
    setScale(
      rig.mouth,
      0.88 + smile * 0.2 - open * 0.15,
      0.35 + smile * 1.05 - open * 0.5,
      1,
    );
    if (rig.mouthOpen) {
      const m = sstep(0.03, 0.5, open);
      rig.mouthOpen.visible = m > 0.02;
      setScale(rig.mouthOpen, 0.5 + 0.5 * m, m * (0.5 + 0.9 * open), 1);
    }
  }
  rig.brows.forEach((brow) => {
    const side = brow.userData.side || 1;
    const lift = clamp(f.brow, -1, 1);
    setPosition(brow, "y", 0.014 * lift);
    set(brow, "z", -side * 0.28 * lift + (R ? 0 : f.browTilt * side * 0.2));
  });
  // Blinks: brief, irregular, never in reduced motion. Happy eyes squint.
  if (rig.eyes.length) {
    const cycle = 3.1 + rig.seed * 2.3;
    const local = (time + rig.seed * 17) % cycle;
    const double = rig.seed > 0.6 && local > 0.24 && local < 0.36;
    const closing = R
      ? 0
      : Math.max(
          1 - Math.abs(local - 0.07) / 0.07,
          double ? 1 - Math.abs(local - 0.3) / 0.06 : 0,
          0,
        );
    const squint = clamp(f.squint, 0, 1) * 0.5,
      wide = clamp(f.wide, 0, 1) * 0.15;
    for (const eye of rig.eyes) {
      const rest = restPose(eye);
      eye.scale.y =
        rest.scale[1] *
        (1 - sstep(0, 1, closing) * 0.86) *
        (1 - squint) *
        (1 + wide);
    }
  }

  // --- Follow-through: whatever hangs off the body lags it and settles.
  const hist = rig.history;
  const tilt = body.rotation.x + (rig.chest?.rotation.x || 0);
  const roll = body.rotation.z + (rig.hips?.rotation.z || 0);
  const headPitch = rig.head?.rotation.x || 0,
    headYaw = rig.head?.rotation.y || 0;
  const second = (now, [a, b]) =>
    step > 0 ? clamp((now - 2 * a + b) / (step * step), -260, 260) : 0;
  const aTilt = second(tilt, hist.tilt),
    aRoll = second(roll, hist.roll),
    aHeadX = second(headPitch, hist.headPitch),
    aHeadY = second(headYaw, hist.headYaw);
  hist.tilt = [tilt, hist.tilt[0]];
  hist.roll = [roll, hist.roll[0]];
  hist.headPitch = [headPitch, hist.headPitch[0]];
  hist.headYaw = [headYaw, hist.headYaw[0]];
  // Inertial forcing, chosen so a hard stop swings a charm about 0.3 rad, a
  // brisk turn about 0.2, and a pack a few degrees: visible, never silly.
  const centrifugal = speed * turn;
  if (R) {
    rig.packSwing.reset();
    rig.charmSwing.reset();
    for (const c of rig.chains) c.swings.forEach((sw) => sw.reset());
  } else {
    rig.packSwing.step(
      -aTilt * 0.2 + accel * 1.4,
      -aRoll * 0.2 - centrifugal * 1.0,
      0,
      0,
      16 * persona.spring ** 0.5,
      0.5,
      step,
    );
    rig.charmSwing.step(
      -aTilt * 0.4 + accel * 3.2,
      -aRoll * 0.4 - centrifugal * 3.6,
      0,
      0,
      11,
      0.2,
      step,
    );
    for (const c of rig.chains)
      c.links.forEach((link, k) => {
        const sw = c.swings[k];
        const prev = k ? c.swings[k - 1] : null;
        // The first link answers the head; each next link trails the one above.
        const fx = k ? 0 : -(aHeadX + aTilt) * 0.35 + accel * 3;
        const fz = k ? 0 : -(aHeadY * 0.35 + aRoll * 0.3) - centrifugal * 2.4;
        sw.step(
          fx,
          fz,
          prev ? prev.x * 0.6 : 0,
          prev ? prev.z * 0.6 : 0,
          (12 - k * 1.8) * persona.spring ** 0.4,
          0.28,
          step,
        );
      });
  }
  if (rig.pack) {
    // A touch of stride-locked bounce keeps the beat readable; the spring adds the lag.
    set(
      rig.pack,
      "x",
      oscillate(ph * 2 - 0.9) * 0.014 * walkW +
        clamp(rig.packSwing.x, -0.22, 0.22),
    );
    set(
      rig.pack,
      "z",
      -oscillate(ph - 0.5) * 0.014 * walkW +
        clamp(rig.packSwing.z, -0.22, 0.22),
    );
  }
  if (rig.charm) {
    // Plus a loose stride-locked sway, so it reads as alive on a steady walk too.
    set(
      rig.charm,
      "x",
      clamp(rig.charmSwing.x, -0.9, 0.9) +
        oscillate(ph * 2 - 0.9) * 0.07 * walkW,
    );
    set(
      rig.charm,
      "z",
      clamp(rig.charmSwing.z, -0.9, 0.9) + oscillate(ph - 0.6) * 0.11 * walkW,
    );
  }
  for (const c of rig.chains)
    c.links.forEach((link, k) => {
      const sw = c.swings[k];
      set(
        link,
        "x",
        clamp(sw.x, -0.7, 0.7) +
          (k ? 0 : 0.18 * (c.root.name === "Ponytail" ? 1 : 0.5)),
      );
      set(link, "z", clamp(sw.z, -0.7, 0.7));
    });
  // Cargo appears one case at a time, and disappears from the top down.
  if (rig.parcel && rig.pack) {
    rig.parcel.visible = false;
    rig.cargo ||= [];
    const count = Math.max(
      0,
      Math.min(40, Math.ceil(cargoCount ?? (carrying ? 1 : 0))),
    );
    while (rig.cargo.length < count) {
      const box = rig.parcel.clone(true);
      box.name = "Backpack cargo case";
      box.position.set(0, 0.31 + rig.cargo.length * 0.28, -0.02);
      box.rotation.set(0, 0, 0);
      box.scale.setScalar(0.78);
      box.visible = false;
      rig.pack.add(box);
      rig.cargo.push(box);
    }
    rig.cargoShown ??= 0;
    rig.cargoTimer = (rig.cargoTimer || 0) + dt;
    if (R) rig.cargoShown = count;
    else
      while (rig.cargoTimer >= 0.12) {
        rig.cargoTimer -= 0.12;
        rig.cargoShown += Math.sign(count - rig.cargoShown);
      }
    rig.cargo.forEach((box, i) => {
      box.visible = i < rig.cargoShown;
    });
    body.userData.cargoCases = rig.cargoShown;
  }
  // Work props appear in the hand only while their task is under way.
  for (const [prop, name] of [
    [rig.hammer, "build"],
    [rig.board, "measure"],
  ]) {
    if (!prop) continue;
    const share = R
      ? work && activeTask === name
        ? 1
        : 0
      : sstep(0.05, 0.7, workW * rig.task[name]);
    prop.visible = share > 0.01;
    prop.scale.setScalar(Math.max(share, 0.0001));
  }
  return rig;
}

/** Map an engine action id to the task the hands should be doing. */
export function taskForAction(action = "") {
  if (/^serve_|^deliver$/.test(action)) return "handoff";
  if (/^(collect|market|restock|salvage)$/.test(action)) return "gather";
  if (/^(charge)$/.test(action)) return "plug";
  if (/^(restore|repair|craft_|buy_|upgrade_|hire_)/.test(action))
    return "build";
  if (/^negotiate_/.test(action)) return "talk";
  if (/^(rest|wait|vacation_|beach_)/.test(action)) return "rest";
  return "pack";
}

/**
 * Suspension, banking and mechanical motion. Set the root's authoritative pose
 * first, then call this once per frame. It never writes root position or yaw.
 * `active` means occupied/in service; parked boats still gently rock at berth.
 */
export function animateVehicle(
  root,
  motion,
  {
    kind,
    active = true,
    time = 0,
    dt = 1 / 30,
    reducedMotion = false,
    chassis,
    wheels,
    rotor,
    tailRotor,
    exhaust = [],
    flatTire = false,
  } = {},
) {
  let rig = vehicles.get(root);
  if (!rig) {
    // Yaw is the route heading. Apply pitch/roll inside that yaw frame so the
    // projected nose continues to face precisely along the traveled segment.
    root.rotation.order = "YXZ";
    rig = {
      rotorSpeed: 0,
      sail: root.getObjectByName("sail"),
      pennant: root.getObjectByName("boat pennant"),
      tiller: root.getObjectByName("tiller"),
      wheels: [],
    };
    // Crew bicycles are deep clones, so discover their wheel groups by their
    // authored spokes instead of keeping references to the founder's wheels.
    root.traverse((node) => {
      if (
        node.isGroup &&
        node.children.some((part) => part.name === "bicycle spoke")
      )
        rig.wheels.push(node);
    });
    restPose(rig.sail);
    restPose(rig.pennant);
    restPose(rig.tiller);
    if (chassis) restPose(chassis);
    vehicles.set(root, rig);
  }
  const settle = (value, target, rate = 8) =>
    reducedMotion
      ? target
      : THREE.MathUtils.damp(value, target, rate, Math.max(0, dt));
  const wave = (phase) => (reducedMotion ? 0 : Math.sin(phase));
  const speed = active && !reducedMotion ? clamp(motion.speed || 0, 0, 12) : 0;
  const turn =
    active && !reducedMotion ? clamp(motion.turnRate || 0, -4, 4) : 0;
  const acceleration =
    active && !reducedMotion ? clamp(motion.acceleration || 0, -10, 10) : 0;
  const vertical =
    active && !reducedMotion ? clamp(motion.verticalSpeed || 0, -8, 8) : 0;
  const moving = active && !reducedMotion && motion.moving;
  const travel = motion.travelled || 0;
  let pitch = 0,
    roll = 0;
  if (kind === "bike") {
    roll = clamp(
      -turn * 0.032 + (moving ? wave(motion.walkCycle || 0) * 0.018 : 0),
      -0.13,
      0.13,
    );
    pitch = clamp(-acceleration * 0.0015, -0.014, 0.014);
    // Pedal plates ride under the rider's soles for the whole stroke.
    if ((active && !reducedMotion) || !rig.pedalsPlaced) {
      placePedals(root);
      rig.pedalsPlaced = true;
    }
  } else if (kind === "rocket_skates") {
    pitch = active ? clamp(speed * 0.014, 0, 0.13) : 0;
    roll = clamp(-turn * 0.035, -0.14, 0.14);
  } else if (kind === "sailboat") {
    const seaPhase =
      time * 1.45 + root.position.x * 0.06 + root.position.z * 0.08;
    pitch = wave(seaPhase) * 0.016;
    roll = wave(seaPhase * 0.83 + 0.5) * 0.028 - turn * 0.008;
    if (rig.sail)
      rig.sail.rotation.y = settle(
        rig.sail.rotation.y,
        restPose(rig.sail).rotation[1] +
          wave(time * 1.2) * 0.075 +
          clamp(turn * 0.025, -0.08, 0.08),
        4,
      );
    if (rig.pennant)
      rig.pennant.rotation.y = settle(
        rig.pennant.rotation.y,
        restPose(rig.pennant).rotation[1] +
          wave(time * 4.2) * 0.12 +
          wave(time * 6.1) * 0.045,
        12,
      );
    if (rig.tiller)
      rig.tiller.rotation.y = settle(
        rig.tiller.rotation.y,
        restPose(rig.tiller).rotation[1] + clamp(turn * 0.045, -0.14, 0.14),
        6,
      );
  } else if (kind === "helicopter") {
    const airborne = active
      ? THREE.MathUtils.smoothstep(root.position.y, 0.55, 1.6)
      : 0;
    pitch =
      airborne *
      clamp(
        speed * 0.009 - vertical * 0.009 + wave(time * 2.8) * 0.007,
        -0.075,
        0.11,
      );
    roll =
      airborne * clamp(-turn * 0.035 + wave(time * 2.1) * 0.009, -0.13, 0.13);
    rig.rotorSpeed = settle(
      rig.rotorSpeed,
      reducedMotion ? 0 : active ? 39 : 0,
      active ? 3.5 : 1.7,
    );
    if (rotor)
      rotor.rotation.y = (rotor.rotation.y + rig.rotorSpeed * dt) % tau;
    if (tailRotor)
      tailRotor.rotation.x =
        (tailRotor.rotation.x + rig.rotorSpeed * dt * 1.38) % tau;
  } else if (kind === "jetpack") {
    pitch =
      active && !reducedMotion
        ? clamp(
            speed * 0.012 - vertical * 0.007 + wave(time * 2.4) * 0.009,
            -0.05,
            0.16,
          )
        : 0;
    roll = clamp(
      -turn * 0.03 + (active ? wave(time * 2.1) * 0.008 : 0),
      -0.12,
      0.12,
    );
  }
  root.rotation.x = settle(root.rotation.x, pitch);
  root.rotation.z = settle(root.rotation.z, roll);
  if (chassis) {
    const rest = restPose(chassis);
    chassis.position.y = settle(
      chassis.position.y,
      rest.position[1] + (moving ? Math.abs(wave(travel * 8.5)) * 0.011 : 0),
      15,
    );
    chassis.rotation.x = settle(
      chassis.rotation.x,
      rest.rotation[0] +
        clamp(
          -acceleration * 0.002 + (moving ? wave(travel * 7.3) * 0.003 : 0),
          -0.028,
          0.028,
        ),
      10,
    );
    chassis.rotation.z = settle(
      chassis.rotation.z,
      rest.rotation[2] +
        (flatTire ? 0.045 : 0) +
        clamp(-turn * 0.007, -0.028, 0.028),
      10,
    );
  }
  const radius = kind === "van" ? WHEEL_RADIUS.van : WHEEL_RADIUS.bike;
  for (const wheel of wheels || rig.wheels) {
    if (active && !reducedMotion)
      wheel.rotation.x = (wheel.rotation.x + (motion.step || 0) / radius) % tau;
  }
  exhaust.forEach((flame, i) => {
    const intensity =
      active && !reducedMotion
        ? 0.9 +
          Math.min(speed * 0.012 + Math.abs(vertical) * 0.025, 0.25) +
          wave(time * 18 + i * 1.7) * 0.09
        : 1;
    flame.visible = kind === "rocket_skates" ? !!moving : true;
    flame.scale.y = settle(flame.scale.y, intensity, 20);
  });
  return {
    pitch: root.rotation.x,
    roll: root.rotation.z,
    rotorSpeed: rig.rotorSpeed,
  };
}

// ---------------------------------------------------------------------------
// Townsfolk: the same vocabulary on a rigid rig. A person is a body, a head on
// a neck pivot, and jointed limbs (see toy-kit.js `townsperson`).

function townRig(person) {
  let rig = townRigs.get(person);
  if (rig) return rig;
  const j = person.userData.townJoints || {};
  const all = (name) => {
    const out = [];
    person.traverse((o) => o.name === name && out.push(o));
    return out;
  };
  const limbs = person.userData.limbs || [];
  const persona = personaFor(person.userData.persona);
  const gear = person.userData.gear || {};
  rig = {
    legs: limbs.slice(0, 2),
    arms: limbs.slice(2, 4),
    knees: j.knees || [],
    elbows: j.elbows || [],
    head: j.head,
    mouth: all("smile")[0],
    mouthOpen: j.mouthOpen,
    brows: all("Brow"),
    eyes: all("Eye"),
    scarf: person.userData.scarfTail,
    holds: person.userData.holds || null,
    persona,
    menu: fidgetMenu(persona, {
      headwear: !!gear.hat,
      glasses: !!gear.glasses,
    }),
    seed: stringSeed(person.userData.townLook || person.uuid),
    ex: makePose(),
    weights: { walk: 0, wave: 0, receive: 0, greet: 0 },
    lookW: 0,
    lookYaw: 0,
    lookPitch: 0,
    swing: new Swing(),
    quietUntil: 0,
    baseY: person.position.y,
    baseRot: [person.rotation.x, person.rotation.z],
    history: { roll: [0, 0] },
  };
  for (const node of [
    ...rig.legs,
    ...rig.arms,
    ...rig.knees,
    ...rig.elbows,
    rig.head,
    rig.mouth,
    rig.mouthOpen,
    rig.scarf,
    ...rig.brows,
    ...rig.eyes,
  ])
    restPose(node);
  townRigs.set(person, rig);
  return rig;
}

/**
 * Animate one townsperson. `walking` with a gait `phase` (radians, tied to
 * distance by the caller) or standing; `pending` raises a hand to be noticed;
 * `receiving` holds both out for a delivery; `greeting` waves at someone
 * passing; `look` ({yaw, pitch, weight}, relative to the body) turns the head.
 * Returns offsets for the caller to fold into the body transform.
 */
export function animateTownsperson(
  person,
  {
    time = 0,
    dt = 1 / 30,
    reducedMotion = false,
    walking = false,
    phase = 0,
    speed = 0,
    turn = 0,
    pending = false,
    receiving = false,
    greeting = false,
    look = null,
    baseY,
  } = {},
) {
  const rig = townRig(person);
  const step = clamp(Math.max(0, dt), 0, 1 / 15);
  const R = reducedMotion;
  const persona = rig.persona;
  const ex = rig.ex;
  const w = rig.weights;
  const want = {
    walk: walking && !R ? 1 : 0,
    wave: pending || greeting ? 1 : 0,
    receive: receiving ? 1 : 0,
  };
  for (const key in want) {
    if (R) w[key] = want[key];
    else {
      w[key] = chase(w[key], want[key], key === "walk" ? 8 : 7, step);
      if (Math.abs(w[key] - want[key]) < 0.004) w[key] = want[key];
    }
  }
  if (pending || receiving) rig.quietUntil = time + 4.2;
  const walkW = w.walk;
  const standW = 1 - walkW;
  const waveW = w.wave * (1 - w.receive);
  const idle = standW * (1 - w.wave) * (1 - w.receive);
  Object.assign(ex, { y: 0, pitch: 0, yaw: 0, roll: 0 });
  for (const part of [ex.hips, ex.chest, ex.head, ...ex.legs, ...ex.arms])
    for (const k in part) part[k] = 0;
  ex.armLock[0] = ex.armLock[1] = 0;
  Object.assign(ex.face, {
    smile: 0,
    open: 0,
    squint: 0,
    wide: 0,
    brow: 0,
    browTilt: 0,
  });
  const osc = (p) => (R ? 0 : Math.sin(p));
  const breath = osc(time * 1.65 + rig.seed * 6.28);

  // Life while standing: weight shifts and the occasional gesture.
  if (!R) idleLayer(ex, { time, seed: rig.seed, persona, idle });
  let gesture = null;
  if (!R) gesture = scheduledFidget(time, rig.seed, persona, rig.menu);
  // Same rule as the courier: gestures fade in and out, never switch on.
  if (
    gesture &&
    gesture.def.needs !== "carrying" &&
    !(gesture.def.arms && rig.holds)
  ) {
    const gate = idle * sstep(0, 0.7, time - rig.quietUntil);
    if (gate > 0.001)
      gesture.def.pose(
        gesture.u,
        { seed: rig.seed, slot: gesture.slot },
        ex,
        gesture.k * gate,
      );
  }

  // A raised hand to be noticed: lift, then a loose wave from the elbow.
  if (waveW > 0.001) {
    const flap = osc(time * 7.2 + rig.seed * 3);
    ex.arms[0].x += -2.45 * waveW;
    ex.arms[0].z += inward(0) * -0.2 * waveW;
    ex.arms[0].e += (-0.6 + flap * 0.4) * waveW;
    ex.armLock[0] = Math.max(ex.armLock[0], waveW);
    ex.head.z += 0.07 * waveW;
    ex.face.smile += 0.45 * waveW;
    ex.face.open += 0.3 * waveW;
    ex.face.brow += 0.25 * waveW;
  }
  // Both hands out for a parcel, then a small bow of thanks.
  if (w.receive > 0.001) {
    const r = w.receive;
    const bow = sstep(0.4, 0.8, 0.5 + 0.5 * osc(time * 0.9));
    for (const i of [0, 1]) {
      ex.arms[i].x += -1.15 * r;
      ex.arms[i].z += inward(i) * 0.12 * r;
      ex.arms[i].e += -0.45 * r;
      ex.armLock[i] = Math.max(ex.armLock[i], r);
    }
    ex.pitch += 0.05 * bow * r;
    ex.head.x += 0.12 * bow * r;
    ex.face.smile += 0.5 * r;
    ex.face.squint += 0.4 * r;
  }
  // Something held in the hand keeps that arm quiet: a cane stays planted.
  const holdLock = rig.holds ? 1 : 0;

  // Gaze: the head leads, the body follows a little.
  rig.lookW = R
    ? 0
    : chase(rig.lookW, look ? clamp(look.weight ?? 1, 0, 1) : 0, 4.5, step);
  rig.lookYaw = R
    ? 0
    : chase(rig.lookYaw, clamp(look?.yaw ?? rig.lookYaw, -1.1, 1.1), 5.5, step);
  rig.lookPitch = R
    ? 0
    : chase(rig.lookPitch, clamp(look?.pitch ?? 0, -0.5, 0.5), 5.5, step);
  ex.head.y += rig.lookYaw * rig.lookW * 0.9;
  ex.head.x += rig.lookPitch * rig.lookW;
  ex.yaw += rig.lookYaw * rig.lookW * 0.18;

  const posture = R ? 0 : persona.slump;
  ex.pitch += posture * 0.6;
  ex.head.x += posture * 0.5;

  // Gait. Stride is tied to leg length: one half-cycle of phase covers exactly
  // the ground the swinging leg does, so the feet never skate.
  const ph = phase;
  const sA = 0.5 * persona.stride;
  const passing = Math.cos(ph) ** 2;
  const legs = rig.legs,
    knees = rig.knees;
  legs.forEach((leg, i) => {
    const p = ph + i * Math.PI;
    const swing = osc(p);
    const fold = R ? 0 : Math.max(0, -Math.cos(p - 0.15)) ** 1.25;
    const e = ex.legs[i];
    set(leg, "x", walkW * swing * sA + e.x);
    set(leg, "y", e.y);
    set(leg, "z", e.z);
    set(knees[i], "x", walkW * (0.08 + fold * 0.7) * persona.stride + e.k);
  });
  rig.arms.forEach((arm, i) => {
    const side = i ? -1 : 1;
    const p = ph + i * Math.PI;
    const swing = osc(p);
    const e = ex.arms[i];
    const held = rig.holds && i === 1;
    // Base: arms swing opposite the legs, elbows soften on the forward swing.
    let x = walkW * -swing * 0.46 * persona.arms + breath * 0.018 * standW;
    let z = side * (0.04 + walkW * 0.05 + breath * 0.01);
    let elbow = -0.05 + walkW * (-0.16 - Math.max(0, swing) * 0.3);
    if (held) {
      // A cane arm stays planted in front; a carried bag swings gently.
      const planted = rig.holds === "cane";
      x = planted ? -0.28 : x * 0.3;
      z = side * (planted ? 0.05 : 0.07);
      elbow = planted ? -0.24 : -0.12 + walkW * -0.1;
    }
    const lock = clamp(ex.armLock[i], 0, 1);
    set(arm, "x", x * (1 - lock) + e.x);
    set(arm, "z", z * (1 - lock) + e.z);
    set(arm, "y", e.y);
    set(rig.elbows[i], "x", elbow * (1 - lock) + e.e);
  });
  void holdLock;

  // The body: lean into the stride, roll over the stance leg, bob on contact.
  const bob =
    walkW * (passing * 0.013 * persona.bounce - 0.004) +
    breath * 0.0012 * standW +
    ex.y * 0.5;
  const roll =
    walkW * osc(ph) * 0.02 * persona.sway +
    ex.hips.z +
    ex.chest.z * 0.5 +
    ex.roll;
  const pitch = walkW * (0.04 + persona.lean) + ex.pitch + ex.chest.x * 0.6;
  person.rotation.x = rig.baseRot[0] + pitch;
  person.rotation.z = rig.baseRot[1] + roll;
  if (baseY !== undefined) rig.baseY = baseY;
  person.position.y = rig.baseY + bob;

  // The head steadies against the roll and looks where it is asked to.
  const settleHead = (axis, value) => {
    if (!rig.head) return;
    const target = restPose(rig.head).rotation[AXIS[axis]] + value;
    rig.head.rotation[axis] = R
      ? target
      : chase(rig.head.rotation[axis], target, 9, step);
  };
  settleHead(
    "x",
    walkW * osc(ph * 2 - 0.6) * 0.03 * persona.head +
      breath * 0.012 * standW +
      ex.head.x,
  );
  settleHead(
    "y",
    (walkW > 0 ? turn * 0.05 * walkW : 0) +
      osc(time * 0.37 + rig.seed * 9) * 0.035 * idle +
      ex.head.y,
  );
  settleHead("z", -roll * 0.6 + ex.head.z);

  // Face.
  faceLayer(ex, { persona, walk: walkW, carry: 0, work: 0, handoff: 0 });
  const f = ex.face;
  if (rig.mouth) {
    const smile = clamp(f.smile, -0.2, 1.3);
    const open = clamp(f.open, 0, 1);
    setScale(
      rig.mouth,
      0.88 + smile * 0.2 - open * 0.15,
      0.35 + smile * 1.05 - open * 0.5,
      1,
    );
    if (rig.mouthOpen) {
      const m = sstep(0.03, 0.5, open);
      setScale(rig.mouthOpen, m, m * (0.5 + 0.9 * open), m);
    }
  }
  rig.brows.forEach((brow) => {
    const side = brow.userData.side || 1;
    const lift = clamp(f.brow, -1, 1);
    setPosition(brow, "y", 0.008 * lift);
    set(brow, "z", -side * 0.28 * lift);
  });
  if (rig.eyes.length) {
    const cycle = 3.3 + rig.seed * 2.4;
    const local = (time + rig.seed * 19) % cycle;
    const closing = R ? 0 : Math.max(1 - Math.abs(local - 0.07) / 0.07, 0);
    const squint = clamp(f.squint, 0, 1) * 0.5;
    for (const eye of rig.eyes) {
      const rest = restPose(eye);
      eye.scale.y =
        rest.scale[1] * (1 - sstep(0, 1, closing) * 0.86) * (1 - squint);
    }
  }
  if (rig.scarf) {
    const hist = rig.history;
    const a =
      step > 0
        ? clamp(
            (roll - 2 * hist.roll[0] + hist.roll[1]) / (step * step),
            -200,
            200,
          )
        : 0;
    hist.roll = [roll, hist.roll[0]];
    if (R) rig.swing.reset();
    else
      rig.swing.step(
        -a * 0.2 + walkW * speed * 0.6,
        -a * 0.2,
        0,
        0,
        10,
        0.25,
        step,
      );
    set(
      rig.scarf,
      "x",
      clamp(rig.swing.x, -0.8, 0.8) + (R ? 0 : walkW * osc(ph * 2) * 0.1),
    );
    set(rig.scarf, "z", clamp(rig.swing.z, -0.6, 0.6));
  }
  return { yaw: ex.yaw };
}

/**
 * A shopkeeper at their door: breathing, shifting, gesturing; a hand raised
 * when an order is waiting, both hands out when Brandon arrives, and a turn of
 * the head toward whoever is near. `facing` is the door they stand at.
 */
export function animateCitizen(
  person,
  {
    time = 0,
    dt = 1 / 30,
    pending = false,
    receiving = false,
    phase = 0,
    look = null,
    facing,
    reducedMotion = false,
  } = {},
) {
  const out = animateTownsperson(person, {
    time: time + phase * 1.7,
    dt,
    reducedMotion,
    pending,
    receiving,
    look,
  });
  if (facing !== undefined) person.rotation.y = facing + out.yaw;
  return out;
}

/** An ambient walker. `travel` is distance along the route in world units. */
export function animateWalker(
  person,
  {
    travel = 0,
    time = 0,
    dt = 1 / 30,
    speed = 0.3,
    turn = 0,
    greeting = false,
    look = null,
    reducedMotion = false,
    baseY,
  } = {},
) {
  const rig = townRig(person);
  // Phase per unit of travel that matches the swing: stride = 2 L sin(theta).
  const scale = person.scale.y || 1;
  const theta = 0.5 * rig.persona.stride;
  const phasePerUnit = Math.PI / (2 * 0.2 * scale * Math.sin(theta));
  return animateTownsperson(person, {
    time,
    dt,
    reducedMotion,
    walking: true,
    phase: travel * phasePerUnit,
    speed,
    turn,
    // Only the friendly ones wave, and everyone glances at a passing courier.
    greeting: greeting && hash01(rig.seed, 77) < rig.persona.friendly * 0.9,
    look: look && {
      ...look,
      weight: look.weight * (0.35 + rig.persona.friendly * 0.65),
    },
    baseY,
  });
}
