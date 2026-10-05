import * as THREE from "three";
import { ParticleSystem, buildWeaponProps } from "./combat-fx.js";
import { ActorMotion } from "./world-motion.js";
import { WEAPONS } from "../shared/combat.js";

const gap = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - (1 - x) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
// Seconds from the start of Brandon's swing to the moment the blow connects,
// and how long each swing animation lasts. The simulation lands damage on a
// tick edge; the renderer plays the wind-up and then reacts on contact.
const IMPACT = {
  fists: 0.09,
  machete: 0.17,
  gun: 0.03,
  spray: 0.05,
  particle_gun: 0.04,
};
const SWING = {
  fists: 0.34,
  machete: 0.46,
  gun: 0.3,
  spray: 0.3,
  particle_gun: 0.34,
};
const SPARK = {
  fists: "#fff0a8",
  machete: "#f4fbff",
  gun: "#ffd17a",
  spray: "#bff08a",
  particle_gun: "#9ff3ff",
};
const FIGURES = 8;
const TOPPLE = 0.42;
const FADE_START = 1.15;
const FADE = 0.35;

// Use the actual sculpted townsfolk kit, with undead paint and small clay scars.
export function createCombatWorld(w, clock = null) {
  const root = new THREE.Group();
  root.name = "Zombie encounters";
  root.userData.dynamic = true;
  w.world.add(root);
  const figures = Array.from({ length: FIGURES }, (_, i) => {
    const g = new THREE.Group();
    g.name = `Clay zombie ${i + 1}`;
    w.kit.townsperson(g, {
      id: `zombie-${i}`,
      skin: ["#9cae72", "#7d9a80", "#a5b58a"][i % 3],
      hair: { style: ["crop", "spike", "bob"][i % 3], color: "#4c5746" },
      outfit: {
        type: "coat",
        color: ["#8b6e83", "#6a8183", "#9d8462"][i % 3],
        lower: "#465b52",
        trim: "#b6ac83",
        shoe: "#5d6753",
      },
      persona: "elder",
      height: 1.03,
    });
    g.traverse((o) => {
      if (o.userData.tint) {
        o.material = o.material.clone();
        o.material.color.set(o.userData.tint);
      }
      if (o.name === "Eye") {
        o.userData.tint = "#e8d07e";
        o.material = o.material.clone();
        o.material.color.set("#e8d07e");
        o.scale.y *= i % 2 ? 0.6 : 1;
      }
    });
    const head = g.userData.townJoints.head;
    const scar = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.007, 0.052, 2, 6),
      new THREE.MeshStandardMaterial({ color: "#536843", roughness: 0.85 }),
    );
    scar.position.set(0.105, 0.165, 0.11);
    scar.rotation.z = 0.7;
    head.add(scar);
    for (let j = 0; j < 3; j++) {
      const patch = new THREE.Mesh(
        new THREE.ConeGeometry(0.028, 0.06, 3),
        new THREE.MeshStandardMaterial({ color: "#b6ac83", roughness: 0.85 }),
      );
      patch.position.set((j - 1) * 0.065, 0.29, 0.097);
      patch.rotation.z = Math.PI;
      g.add(patch);
    }
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.035, 0.025),
      new THREE.MeshBasicMaterial({ color: "#c6d77e" }),
    );
    bar.position.set(0, 0.94, 0);
    g.add(bar);
    // Roll (z) is applied in the zombie's own frame, so it topples sideways.
    g.rotation.order = "YXZ";
    // Private copies of every emissive material let one zombie flash red alone.
    const clones = new Map();
    const flash = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.material?.emissive) return;
      if (!clones.has(o.material)) {
        const copy = o.material.clone();
        clones.set(o.material, copy);
        flash.push(copy);
      }
      o.material = clones.get(o.material);
    });
    g.visible = false;
    root.add(g);
    return { g, bar, flash, motion: new ActorMotion({ clock }), id: null };
  });
  const bone = (name) => {
    let found = null;
    w.body.traverse((o) => {
      if (!found && o.name === name && o.isBone) found = o;
    });
    return found;
  };
  // Brandon's elbows and knees are both just named "elbow" / "knee"; find them
  // as the child bone of each arm and leg.
  const childBone = (parent) => parent?.children.find((o) => o.isBone) || null;
  const J = {
    hips: bone("hips"),
    chest: bone("chest"),
    "left arm": bone("left arm"),
    "right arm": bone("right arm"),
    "left leg": bone("left leg"),
    "right leg": bone("right leg"),
  };
  J["left elbow"] = childBone(J["left arm"]);
  J["right elbow"] = childBone(J["right arm"]);
  J["left knee"] = childBone(J["left leg"]);
  J["right knee"] = childBone(J["right leg"]);
  // Weapons are held in the right hand: children of the right forearm bone.
  const props = buildWeaponProps();
  props.forEach((prop) => J["right elbow"]?.add(prop));
  // Soft sprite systems: sparks and glow add up, mist and smoke blend normally.
  const puff = new ParticleSystem(500, { additive: false, seed: 11 });
  const glow = new ParticleSystem(800, { additive: true, seed: 29 });
  puff.object.name = "Combat mist and smoke";
  glow.object.name = "Combat sparks and glow";
  root.add(puff.object, glow.object);
  // Tracer bolts, one per target a shot can reach.
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const beams = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(
      beamGeometry,
      new THREE.MeshBasicMaterial({
        color: "#ffe9a8",
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    m.visible = false;
    m.frustumCulled = false;
    m.userData.until = 0;
    root.add(m);
    return m;
  });
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3(),
    bv = new THREE.Vector3();
  const mp = new THREE.Vector3(),
    mq = new THREE.Quaternion(),
    md = new THREE.Vector3(),
    mp2 = new THREE.Vector3();
  // Brandon's swing clock, driven by the simulation's strike counter.
  const fx = {
    strikes: -1,
    n: 0,
    swingAt: null,
    heavy: false,
    weight: 0,
    dirty: false,
    acc: { spray: 0, charge: 0, mote: 0 },
    shotAt: -9,
  };
  // Effects raised while posing the frame, emitted once Brandon is posed.
  const events = [];

  // Disintegration cloud for defeated particle-gun zombies, tied to ticks so a
  // saved world shows the same bounded burst on load.
  const sprite =
    typeof document !== "undefined"
      ? (() => {
          const cv = document.createElement("canvas");
          cv.width = cv.height = 32;
          const x = cv.getContext("2d");
          const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0, "#fff");
          gr.addColorStop(1, "rgba(255,255,255,0)");
          x.fillStyle = gr;
          x.fillRect(0, 0, 32, 32);
          return new THREE.CanvasTexture(cv);
        })()
      : null;
  const particlePositions = new Float32Array(120 * 3);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const particleMaterial = new THREE.PointsMaterial({
    color: "#b5f2f1",
    size: 0.1,
    map: sprite,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.name = "Particle gun disintegration cloud";
  particles.frustumCulled = false;
  particles.visible = false;
  root.add(particles);
  let visualTime = 0,
    previousTime = null;
  return {
    // Live simulated sparks, mist and smoke (the tick-based cloud is separate).
    fxCount: () => glow.count + puff.count,
    particleCount: () =>
      particles.visible ? particleGeometry.drawRange.count : 0,
    // `s` is the frame being shown; `latest` the newest authoritative one,
    // which the zombies' playout motion ingests (see live-clock.js).
    update(s, motion, time, reduced, latest = s) {
      const before = visualTime;
      frame(s, motion, time, reduced, latest);
      effects(s, reduced, visualTime - before);
    },
  };
  function frame(s, motion, time, reduced, latest = s) {
    const dt =
      previousTime == null
        ? 0
        : Math.max(0, Math.min(0.1, time - previousTime));
    if (previousTime != null && s.status === "running")
      visualTime += Math.max(0, Math.min(0.1, time - previousTime));
    previousTime = time;
    time = visualTime;
    const c = s.brandon.combat;
    const id = s.defense?.weapon || "fists";
    const fighter = c?.position || [motion.position.x, motion.position.z];
    // A new strike starts the swing; contact follows after the wind-up.
    if (!c) {
      fx.strikes = -1;
      fx.swingAt = null;
    } else if (c.strikes !== fx.strikes) {
      if (c.strikes > 0 && fx.strikes >= 0) {
        fx.swingAt = time;
        fx.n = c.strikes;
        fx.heavy = !!c.finisher;
        fx.id = c.weapon || id;
        fx.shotAt = time;
        if (!reduced) events.push({ k: "shot", id: fx.id });
      }
      fx.strikes = c.strikes;
    }
    const contactAt =
      (fx.swingAt ?? time) + (reduced ? 0 : IMPACT[fx.id || id]);
    const available = (s.zombies || []).filter((z) => z.position);
    const wanted = [
      ...available.filter((z) => z.hp > 0),
      ...available.filter((z) => z.hp <= 0),
    ].slice(0, FIGURES);
    // Keep each zombie on the same figure so a falling one never swaps places.
    const owner = new Map(figures.filter((f) => f.id).map((f) => [f.id, f]));
    const taken = new Set();
    const assigned = new Map();
    for (const z of wanted) {
      const f = owner.get(z.id);
      if (f) {
        assigned.set(f, z);
        taken.add(f);
      }
    }
    for (const z of wanted)
      if (!owner.has(z.id)) {
        const f = figures.find((f) => !taken.has(f));
        if (f) {
          assigned.set(f, z);
          taken.add(f);
        }
      }
    figures.forEach((figure, i) => {
      const { g, bar } = figure;
      const z = assigned.get(figure);
      g.visible = !!z;
      if (!z) {
        figure.id = null;
        return;
      }
      if (figure.id !== z.id) {
        figure.motion = new ActorMotion({ clock });
        figure.id = z.id;
        // A zombie first seen already defeated simply lies where it fell.
        Object.assign(figure, {
          hits: z.hits || 0,
          pending: null,
          hitAt: -99,
          deathAt: z.hp <= 0 ? time - 9 : null,
          shownHp: z.hp,
          poofed: z.hp <= 0,
          face: 0,
          hitDir: z.hitDir || [0, 1],
          heavy: false,
        });
      }
      const newest = (latest.zombies || []).find((n) => n.id === z.id) || z;
      const zm = figure.motion.update(
        { position: newest.position, action: "pursue" },
        latest,
        dt,
        reduced,
      );
      g.position.copy(zm.position);
      const toFighter = Math.atan2(
        fighter[0] - z.position[0],
        fighter[1] - z.position[1],
      );
      const facing = zm.moving ? zm.facing : toFighter;
      if (z.hp > 0 || figure.deathAt == null) figure.face = facing;
      g.rotation.set(0, figure.face, 0);
      // New simulation hit: queue its reaction for the moment of contact.
      if ((z.hits || 0) !== figure.hits) {
        figure.hits = z.hits || 0;
        figure.pending = {
          at: contactAt,
          dir: z.hitDir || [0, 1],
          heavy: !!z.hitHeavy,
          by: z.hitBy || id,
        };
      }
      const pending = figure.pending;
      if (pending && time >= pending.at) {
        figure.pending = null;
        figure.hitAt = time;
        figure.hitDir = pending.dir;
        figure.heavy = pending.heavy;
        figure.shownHp = z.hp;
        if (z.hp <= 0) figure.deathAt = time;
        figure.flashColor = pending.by === "spray" ? "#88e04c" : "#ff2a18";
        if (!reduced)
          events.push({
            k: "hit",
            x: z.position[0],
            z: z.position[1],
            dir: pending.dir,
            by: pending.by,
            heavy: pending.heavy,
            killed: z.hp <= 0,
          });
      }
      if (z.hp > 0 && figure.deathAt != null) figure.deathAt = null;
      const dying = z.hp <= 0 && figure.deathAt != null;
      const waiting = z.hp <= 0 && !dying; // killing blow hasn't landed yet
      const since = time - figure.hitAt;
      const dissolved = dying && z.defeatedBy === "particle_gun";
      const hitDuration = figure.heavy ? 0.55 : 0.38;
      const hit =
        reduced || dying ? 0 : (1 - clamp01(since / hitDuration)) ** 2;
      const aliveNow = !dying;
      const stride = reduced || dying ? 0 : Math.sin(zm.walkCycle * 0.55 + i);
      const joints = g.userData.townJoints;
      const near = aliveNow && gap(z.position, fighter) < 1.05;
      const claw =
        near && !reduced && !waiting && hit < 0.2
          ? Math.max(0, Math.sin(time * 3.4 + i * 1.7)) ** 3
          : 0;
      g.scale.setScalar(1.03);
      let lean = 0.09 + claw * 0.22 - hit * (figure.heavy ? 0.85 : 0.55);
      let roll = reduced ? 0 : stride * (zm.moving ? 0.055 : 0.025);
      let lift = !reduced ? Math.abs(stride) * (zm.moving ? 0.018 : 0.005) : 0;
      // Recoil away from the blow, with a small hop.
      if (hit > 0) {
        const slide = hit * (figure.heavy ? 0.14 : 0.07);
        g.position.x += figure.hitDir[0] * slide;
        g.position.z += figure.hitDir[1] * slide;
        lift +=
          Math.sin(clamp01(since / 0.16) * Math.PI) *
          (figure.heavy ? 0.09 : 0.04);
        roll += Math.sin(since * 46) * 0.06 * hit;
      }
      let headX = 0.08 - hit * 0.5;
      let headZ = 0.12 + (reduced ? 0 : Math.sin(time * 1.7 + i) * 0.045);
      let armLift = hit * 0.95 - claw * 0.55;
      let armDrop = 0;
      let flash = hit * 0.32;
      if (dying) {
        // Minecraft-style topple: stiff as a board, tipping over onto its side.
        const t = time - figure.deathAt;
        const side = Number(z.id.slice(1)) % 2 ? 1 : -1;
        const fall = reduced ? 1 : easeOut(clamp01(t / TOPPLE) ** 1.6);
        const settle = reduced
          ? 0
          : Math.sin(clamp01((t - TOPPLE) / 0.18) * Math.PI) * 0.07;
        lean = 0;
        roll = side * (fall * (Math.PI / 2) - settle);
        lift = 0.1 * Math.sin(Math.min(roll * side, Math.PI / 2));
        headX = 0.08;
        headZ = 0.1;
        armLift = 0;
        armDrop = fall;
        flash = Math.max(0, 0.32 - t / 0.9);
        if (dissolved) {
          const shrink = clamp01(t / 0.55);
          roll = 0;
          lift = shrink * 0.22;
          g.scale.setScalar(1.03 * Math.max(0.01, 1 - smooth(shrink)));
          armDrop = 0;
          armLift = 0.5;
        } else if (t > FADE_START) {
          const f = clamp01((t - FADE_START) / FADE);
          g.scale.setScalar(1.03 * Math.max(0.01, 1 - smooth(f)));
          if (!figure.poofed && !reduced) {
            figure.poofed = true;
            events.push({ k: "poof", x: z.position[0], z: z.position[1] });
          }
        }
      }
      g.rotation.x = lean;
      g.rotation.z = roll;
      g.position.y += lift;
      joints.head.rotation.z = headZ;
      joints.head.rotation.x = headX;
      let leg = 0,
        arm = 0;
      for (const limb of g.userData.limbs) {
        if (limb.name === "arm") {
          const base = -1.1 + stride * (arm++ ? 0.15 : -0.12);
          limb.rotation.x = lerp(base - armLift, -0.15, armDrop);
          limb.rotation.z =
            reduced || dying ? 0 : Math.sin(time * 1.3 + i) * 0.08;
        } else if (limb.name === "leg") {
          limb.rotation.x =
            zm.moving && !dying ? stride * (leg++ ? -0.27 : 0.23) : 0;
        }
      }
      joints.elbows.forEach(
        (elbow, n) =>
          (elbow.rotation.x = lerp(
            -0.22 + stride * (n ? 0.06 : -0.06),
            -0.1,
            armDrop,
          )),
      );
      for (const m of figure.flash) {
        m.emissive.set(figure.flashColor || "#ff2a18");
        m.emissiveIntensity = flash;
      }
      if (dissolved) for (const m of figure.flash) m.emissive.set("#74e6f0");
      bar.visible = aliveNow && !waiting;
      bar.scale.x = Math.max(0.01, figure.shownHp / z.maxHp);
    });
    const zombies = wanted;
    props.forEach((p, id) => {
      p.visible = !!c && s.defense?.weapon === id;
    });
    const dissolve = zombies.filter(
      (z) =>
        z.hp <= 0 && z.defeatedBy === "particle_gun" && s.tick - z.diedAt < 5,
    );
    particles.visible = !reduced && dissolve.length > 0;
    let count = 0;
    if (particles.visible) {
      for (const z of dissolve)
        for (let i = 0; i < 12; i++) {
          const spread = Math.min(1, (s.tick - z.diedAt + 1) / 4);
          particlePositions[count * 3] =
            z.position[0] + Math.sin(i * 4.1) * spread * 0.48;
          particlePositions[count * 3 + 1] =
            0.55 + (i / 12) * 0.65 + spread * 0.25;
          particlePositions[count * 3 + 2] =
            z.position[1] + Math.cos(i * 2.3) * spread * 0.48;
          count++;
        }
      particleGeometry.setDrawRange(0, count);
      particleGeometry.attributes.position.needsUpdate = true;
    }
    if (!c) {
      // Hand the rig back to the normal character animation.
      fx.weight = 0;
      if (fx.dirty) {
        w.body.position.set(0, 0, 0);
        w.body.rotation.x = 0;
        fx.dirty = false;
      }
      return;
    }
    // The parked vehicle stays at the route position; only the courier exits.
    for (const pilot of [
      w.driver,
      w.rider,
      w.skater,
      w.sailor,
      w.pilot,
      w.jetPilot,
      w.portalPilot,
    ])
      if (pilot) pilot.visible = false;
    w.rocketSkates.visible = false;
    w.jetpack.visible = false;
    w.teleporter.visible = false;
    const exit =
      c.phase === "dismount"
        ? Math.min(1, c.elapsed / 3)
        : c.phase === "remount"
          ? Math.max(0, 1 - c.elapsed / 3)
          : 1;
    w.brandon.visible = true;
    w.brandon.position.set(
      (c.parkedPosition?.[0] ?? c.position[0]) +
        (c.position[0] - (c.parkedPosition?.[0] ?? c.position[0])) * exit,
      0.43,
      (c.parkedPosition?.[1] ?? c.position[1]) +
        (c.position[1] - (c.parkedPosition?.[1] ?? c.position[1])) * exit,
    );
    w.brandon.rotation.y = c.heading || 0;
    // Blend the fighting rig in and out around the attack phase.
    fx.weight =
      reduced || !dt
        ? c.phase === "attack"
          ? 1
          : 0
        : lerp(fx.weight, c.phase === "attack" ? 1 : 0, 1 - Math.exp(-dt * 14));
    if (fx.weight < 0.002) return;
    fx.dirty = true;
    const W = fx.weight;
    const firearm = id === "gun" || id === "particle_gun";
    const span = (SWING[id] || 0.34) * (fx.heavy ? 1.35 : 1);
    const u =
      reduced || fx.swingAt == null ? 1 : clamp01((time - fx.swingAt) / span);
    const live = u < 1;
    const bob = reduced ? 0 : Math.sin(time * 7) * 0.012;
    // Guard stance: fists up, elbows tucked.
    let la = -0.85,
      lz = 0.12,
      le = -1.5;
    let rez = 0,
      lez = 0;
    let ra = -0.85,
      rz = -0.12,
      re = -1.5;
    let twist = 0,
      lean = 0.06,
      lunge = 0,
      step = 0;
    if (id === "fists") {
      const ext = !live
        ? 0
        : u < 0.35
          ? easeOut(u / 0.35)
          : 1 - smooth((u - 0.35) / 0.65);
      const power = fx.heavy ? 1.45 : 1;
      // Jab, cross, hook: odd strikes lead with the left, even with the right.
      if (fx.n % 2) {
        la = -0.85 - 0.75 * ext * power;
        le = -1.5 + 1.4 * ext;
        lz = 0.12 - 0.12 * ext;
        ra = -0.95;
        twist = 0.3 * ext * power;
      } else {
        ra = -0.85 - 0.75 * ext * power;
        re = -1.5 + 1.4 * ext;
        rz = -0.12 + 0.12 * ext;
        la = -0.95;
        twist = -0.3 * ext * power;
      }
      lean += 0.12 * ext * power;
      lunge = 0.1 * ext * power;
      step = ext * power;
    } else if (id === "machete") {
      // Overhead chop, then a sweeping backhand, wind-up first.
      const wind = !live ? 0 : smooth(clamp01(u / 0.3));
      const cut = !live ? 0 : smooth(clamp01((u - 0.3) / 0.28));
      const back = !live ? 0 : smooth(clamp01((u - 0.6) / 0.4));
      const swing = wind * (1 - cut) + cut * (1 - back);
      const chop = fx.n % 2 === 1;
      ra = chop ? lerp(lerp(-0.7, -2.3, wind), -0.7, cut) : -1.3;
      re = chop ? lerp(-1.1, -0.5, wind) : -0.6;
      rz = chop
        ? lerp(-0.1, 0.45, wind) - cut * 0.7
        : lerp(lerp(-0.1, 1.0, wind), -0.7, cut);
      twist = lerp(lerp(0, chop ? 0.4 : 0.55, wind), chop ? -0.5 : -0.65, cut);
      la = -0.5 - swing * 0.35;
      lz = 0.3;
      le = -1.0;
      lean += 0.16 * cut * (1 - back);
      lunge = 0.14 * cut * (1 - back);
      step = cut * (1 - back);
      if (!live) {
        ra = -0.75;
        re = -1.1;
        rz = 0.05;
      }
    } else if (firearm) {
      const kick = !live
        ? 0
        : u < 0.15
          ? u / 0.15
          : 1 - smooth((u - 0.15) / 0.85);
      const power = id === "particle_gun" ? 1.3 : 1;
      // Two-handed grip, solved against the rig so the muzzle points straight
      // at the target. The shot snaps the arms up and rocks Brandon back.
      const pg = id === "particle_gun";
      ra = (pg ? -1.18 : -1.14) - 0.22 * kick * power;
      rz = pg ? -1.04 : -1.19;
      re = (pg ? -0.66 : -0.86) - 0.25 * kick * power;
      rez = pg ? 0.93 : 1.02;
      la = (pg ? -1.26 : -1.29) - 0.2 * kick * power;
      lz = pg ? 0.96 : 0.98;
      le = 0.01;
      lean = -0.04 - 0.16 * kick * power;
      lunge = -0.07 * kick * power;
    } else {
      // Spray: braced one-hand nozzle, other hand on the pump, sweeping the lane.
      const shake = reduced ? 0 : Math.sin(time * 55) * 0.02;
      const pump = !live ? 0 : Math.sin(u * Math.PI);
      ra = -0.94 + shake;
      rz = -1.23;
      re = -1.13;
      rez = 0.89;
      la = -1.36 + pump * 0.08;
      lz = 0.76;
      le = 0;
      twist = reduced ? 0 : Math.sin(time * 2.6) * 0.3;
      lean = 0.03 - pump * 0.05;
    }
    const ease = (bone, axis, value) => {
      if (bone) bone.rotation[axis] += (value - bone.rotation[axis]) * W;
    };
    ease(J["left arm"], "x", la);
    ease(J["left arm"], "z", lz);
    ease(J["left elbow"], "x", le);
    ease(J["left elbow"], "z", lez);
    ease(J["right arm"], "x", ra);
    ease(J["right arm"], "z", rz);
    ease(J["right elbow"], "x", re);
    ease(J["right elbow"], "z", rez);
    ease(J.chest, "y", twist * 0.7);
    ease(J.hips, "y", -0.22 + twist * 0.3);
    ease(J.chest, "x", lean * 0.7);
    // Bladed fighting stance with a lunging front leg.
    ease(J["left leg"], "x", -0.3 - step * 0.35);
    ease(J["right leg"], "x", 0.24 + step * 0.1);
    ease(J["left knee"], "x", 0.38 + step * 0.2);
    ease(J["right knee"], "x", 0.3);
    w.body.position.set(0, (-0.03 + bob) * W, lunge * W);
    w.body.rotation.x = lean * 0.3 * W;
  }
  // Particle simulation, tracers and glow animation, run after Brandon is posed
  // so every effect starts from the weapon's real muzzle.
  function effects(s, reduced, simDt) {
    const c = s.brandon.combat;
    const id = s.defense?.weapon || "fists";
    const batch = events.splice(0);
    const visual = visualTime;
    if (reduced) {
      glow.clear();
      puff.clear();
      for (const beam of beams) beam.visible = false;
      return;
    }
    const prop = props.get(id);
    let hasMuzzle = false;
    if (c && prop?.visible && prop.userData.muzzle) {
      w.brandon.updateMatrixWorld(true);
      const m = prop.userData.muzzle;
      m.getWorldPosition(mp);
      m.getWorldQuaternion(mq);
      md.set(0, 0, 1).applyQuaternion(mq);
      mp2.copy(mp).add(md);
      root.worldToLocal(mp);
      root.worldToLocal(mp2);
      md.copy(mp2).sub(mp).normalize();
      hasMuzzle = true;
    }
    const at = () => [mp.x, mp.y, mp.z];
    const dirOf = () => [md.x, md.y, md.z];
    let beamIndex = 0;
    for (const e of batch) {
      if (e.k === "shot" && hasMuzzle) {
        if (e.id === "gun") {
          glow.emit(1, {
            at: at(),
            dir: dirOf(),
            speed: [0, 0],
            life: [0.07, 0.1],
            size: [0.3, 0.08],
            colors: ["#fff4c0", "#ffb040"],
          });
          glow.emit(9, {
            at: at(),
            dir: dirOf(),
            cone: 0.4,
            speed: [1.5, 3.4],
            life: [0.1, 0.22],
            size: [0.07, 0.01],
            drag: 3,
            colors: ["#fff6c4", "#ff9a3c"],
          });
          puff.emit(4, {
            at: at(),
            dir: [md.x, md.y + 0.4, md.z],
            cone: 0.5,
            speed: [0.25, 0.7],
            life: [0.8, 1.2],
            size: [0.07, 0.26],
            colors: ["#c4c4bc", "#8d8d88"],
            alpha: 0.6,
            gravity: -0.15,
            drag: 1.6,
          });
          // Brass casing flicks out to the side and bounces on the pavement.
          const side = new THREE.Vector3().crossVectors(md, up).normalize();
          const eject = side.multiplyScalar(0.9).addScaledVector(up, 0.7);
          glow.emit(1, {
            at: [mp.x - md.x * 0.22, mp.y + 0.03, mp.z - md.z * 0.22],
            dir: [eject.x, eject.y, eject.z],
            cone: 0.25,
            speed: [1, 1.6],
            life: [1.1, 1.4],
            size: [0.035, 0.03],
            colors: ["#ffd36b", "#c9962f"],
            gravity: 9,
            bounce: 0.4,
            alpha: 0.95,
          });
        } else if (e.id === "particle_gun") {
          glow.emit(1, {
            at: at(),
            dir: dirOf(),
            speed: [0, 0],
            life: [0.12, 0.16],
            size: [0.45, 0.1],
            colors: ["#e6feff", "#4fd1e8"],
          });
          glow.emit(22, {
            at: at(),
            dir: dirOf(),
            cone: 0.55,
            speed: [1.2, 4],
            life: [0.18, 0.4],
            size: [0.07, 0.01],
            drag: 2.2,
            colors: ["#c9fbff", "#27b8d4"],
          });
          puff.emit(3, {
            at: at(),
            dir: dirOf(),
            cone: 0.6,
            speed: [0.3, 0.8],
            life: [0.5, 0.8],
            size: [0.07, 0.3],
            alpha: 0.45,
            colors: ["#b8f3f8", "#70b9c4"],
            drag: 2,
          });
        } else if (e.id === "spray") {
          // Pump stroke: a fat puff of mist leaves the nozzle.
          puff.emit(6, {
            at: at(),
            dir: dirOf(),
            cone: 0.4,
            speed: [1, 2.2],
            life: [0.5, 0.8],
            size: [0.1, 0.34],
            alpha: 0.75,
            colors: ["#d5f2a8", "#8fcf6a"],
            drag: 1.6,
          });
        }
      }
      if (e.k === "hit") {
        const [dx, dz] = e.dir;
        const chest = [e.x, 0.6, e.z];
        glow.emit(e.heavy ? 16 : 9, {
          at: chest,
          dir: [dx, 0.35, dz],
          cone: 1.0,
          speed: [1, 3.2],
          life: [0.2, 0.42],
          size: [0.07, 0.01],
          gravity: 5,
          drag: 2,
          colors: [SPARK[e.by] || "#ffffff", "#ffffff"],
        });
        glow.emit(1, {
          at: chest,
          dir: [0, 1, 0],
          speed: [0, 0],
          life: [0.08, 0.12],
          size: [e.heavy ? 0.5 : 0.3, 0.05],
          colors: ["#ffffff", SPARK[e.by] || "#ffffff"],
        });
        if (e.heavy)
          puff.emit(6, {
            at: [e.x, 0.1, e.z],
            dir: [0, 1, 0],
            cone: 1.4,
            speed: [0.3, 0.9],
            life: [0.4, 0.7],
            size: [0.1, 0.3],
            alpha: 0.5,
            colors: ["#e6e0c8", "#b8b29c"],
            drag: 2,
          });
        if (e.by === "spray") {
          puff.emit(8, {
            at: chest,
            dir: [dx, 0.2, dz],
            cone: 1.5,
            speed: [0.3, 1.2],
            life: [0.4, 0.8],
            size: [0.09, 0.28],
            alpha: 0.75,
            colors: ["#c9ee98", "#7fc457"],
            gravity: 0.6,
            drag: 2,
          });
          glow.emit(10, {
            at: chest,
            dir: [dx, 0.4, dz],
            cone: 1.3,
            speed: [0.8, 2.2],
            life: [0.3, 0.6],
            size: [0.045, 0.01],
            gravity: 4,
            colors: ["#e3ffb8", "#8fe05a"],
          });
        }
        if (
          hasMuzzle &&
          (e.by === "gun" || e.by === "particle_gun") &&
          beamIndex < beams.length
        ) {
          a.set(mp.x, mp.y, mp.z);
          bv.set(e.x, 0.6, e.z);
          const beam = beams[beamIndex++];
          beam.position.copy(a).add(bv).multiplyScalar(0.5);
          beam.quaternion.setFromUnitVectors(up, bv.clone().sub(a).normalize());
          const r = e.by === "gun" ? 0.011 : 0.022;
          beam.scale.set(r, a.distanceTo(bv), r);
          beam.material.color.set(e.by === "gun" ? "#ffe9a8" : "#9ff3ff");
          beam.userData.until = visual + 0.09;
          beam.visible = true;
        }
        if (e.killed && e.by === "particle_gun") {
          // Disintegration: the body breaks into drifting cyan motes.
          glow.emit(56, {
            at: chest,
            box: [0.17, 0.42, 0.17],
            dir: [0, 1, 0],
            cone: 0.9,
            speed: [0.25, 1.1],
            life: [0.7, 1.4],
            size: [0.075, 0.012],
            gravity: -0.5,
            drag: 1.1,
            colors: ["#d4fcff", "#3fc6e0"],
          });
          glow.emit(1, {
            at: chest,
            dir: [0, 1, 0],
            speed: [0, 0],
            life: [0.25, 0.3],
            size: [0.9, 0.2],
            colors: ["#e6feff", "#4fd1e8"],
            alpha: 0.7,
          });
        }
      }
      if (e.k === "poof") {
        puff.emit(11, {
          at: [e.x, 0.12, e.z],
          radius: 0.16,
          dir: [0, 1, 0],
          cone: 1.3,
          speed: [0.2, 0.75],
          life: [0.5, 0.95],
          size: [0.1, 0.34],
          alpha: 0.7,
          colors: ["#d4e6b8", "#98a98a"],
          gravity: -0.1,
          drag: 2,
        });
        glow.emit(8, {
          at: [e.x, 0.2, e.z],
          radius: 0.18,
          dir: [0, 1, 0],
          cone: 0.8,
          speed: [0.4, 1],
          life: [0.5, 0.9],
          size: [0.05, 0.01],
          gravity: -0.3,
          colors: ["#f2ffb8", "#9be35a"],
        });
      }
    }
    const attacking = c?.phase === "attack" && fx.weight > 0.5;
    if (attacking && hasMuzzle) {
      if (id === "spray") {
        // A continuous cone of mist with brighter droplets riding inside it.
        fx.acc.spray += simDt * 190;
        const n = Math.floor(fx.acc.spray);
        fx.acc.spray -= n;
        puff.emit(n, {
          at: at(),
          radius: 0.02,
          dir: dirOf(),
          cone: 0.24,
          speed: [1.6, 3],
          life: [0.5, 0.85],
          size: [0.09, 0.42],
          alpha: 0.72,
          colors: ["#b7ec6e", "#5fb23a"],
          gravity: 0.4,
          drag: 1.2,
        });
        glow.emit(Math.ceil(n * 0.8), {
          at: at(),
          dir: dirOf(),
          cone: 0.22,
          speed: [2.2, 3.8],
          life: [0.3, 0.6],
          size: [0.06, 0.02],
          gravity: 2,
          colors: ["#f2ffd0", "#9bf05a"],
        });
      } else if (id === "particle_gun") {
        // Motes spiral in to feed the charge orb.
        fx.acc.mote += simDt * 55;
        const n = Math.floor(fx.acc.mote);
        fx.acc.mote -= n;
        for (let k = 0; k < n; k++) {
          const ang = (visual * 9 + k * 2.4) % (Math.PI * 2);
          const r = 0.2;
          const sx = Math.cos(ang) * r,
            sy = Math.sin(ang) * r;
          glow.emit(1, {
            at: [mp.x + sx * 0.8 + md.y * 0.0, mp.y + sy, mp.z + sx * 0.4],
            dir: [-sx, -sy, -sx * 0.4],
            cone: 0.15,
            speed: [0.7, 0.95],
            life: [0.2, 0.26],
            size: [0.045, 0.012],
            colors: ["#c9fbff", "#27b8d4"],
          });
        }
      }
    }
    // Glow animation on the particle gun: ring chase and an orb that flares on firing.
    const pg = props.get("particle_gun")?.userData;
    if (pg?.orb && props.get("particle_gun").visible) {
      const flare = Math.max(0, 1 - (visual - fx.shotAt) / 0.25);
      pg.orb.scale.setScalar(1 + 0.18 * Math.sin(visual * 20) + flare * 0.9);
      pg.rings.forEach((ring, i) => {
        ring.material.emissiveIntensity =
          0.5 + 1.1 * Math.max(0, Math.sin(visual * 16 - i * 1.3)) + flare;
      });
      pg.core.material.emissiveIntensity = 1.1 + flare * 1.2;
    }
    glow.step(simDt);
    puff.step(simDt);
    for (const beam of beams)
      if (beam.visible && visual > beam.userData.until) beam.visible = false;
  }
}
