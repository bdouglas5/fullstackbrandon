import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFigurine } from "../src/figurine.js";
import { dressFigurine } from "../src/figurine-dress.js";
import { createToyKit } from "../src/toy-kit.js";
import { animateCharacter, animateTownsperson, animateWalker, taskForAction } from "../src/world-animation.js";
import { PERSONAS, crewLook, townLook, PEDESTRIANS, SHOPKEEPERS } from "../src/cast.js";
import { scheduledFidget, FIDGETS, TASKS, hash01, loop, span } from "../src/character-motion.js";

const DT = 1 / 60;
const hero = () => createFigurine(null).body;
const kit = createToyKit();
const channels = (body) => {
  const find = (n) => body.getObjectByName(n);
  const j = {
    "head.x": [find("head rig"), "x"],
    "head.y": [find("head rig"), "y"],
    "head.z": [find("head rig"), "z"],
    "chest.x": [find("chest"), "x"],
    "chest.y": [find("chest"), "y"],
    "chest.z": [find("chest"), "z"],
    "hips.y": [find("hips"), "y"],
    "hips.z": [find("hips"), "z"],
    "armR.x": [find("left arm"), "x"],
    "armR.z": [find("left arm"), "z"],
    "armL.x": [find("right arm"), "x"],
    "armL.z": [find("right arm"), "z"],
    "elbowR.x": [find("left arm").getObjectByName("elbow"), "x"],
    "elbowL.x": [find("right arm").getObjectByName("elbow"), "x"],
  };
  return () => Object.fromEntries(Object.entries(j).map(([k, [node, axis]]) => [k, node.rotation[axis]]));
};
const transforms = (root) => {
  const values = [];
  root.traverse((node) =>
    values.push([node.position.toArray(), node.rotation.toArray(), node.scale.toArray(), node.visible]),
  );
  return values;
};

/** Run frames and report the largest single-frame change of every channel. */
function run(body, frames, motionAt, flagsAt, start = 0) {
  const read = channels(body);
  let previous = null,
    worst = {};
  for (let f = 0; f < frames; f++) {
    const time = start + f * DT;
    animateCharacter(body, motionAt(time, f), { ...flagsAt(time, f), time, dt: DT });
    const now = read();
    if (previous)
      for (const k in now) worst[k] = Math.max(worst[k] || 0, Math.abs(now[k] - previous[k]));
    previous = now;
  }
  return worst;
}
const still = { walkCycle: 0, moving: false, speed: 0, step: 0, turnRate: 0 };

test("a gesture is only ever faded in, never switched on, when the hands are freed", () => {
  // Find a moment when a hand gesture is under way, then put the parcel down in the middle of it.
  const probe = hero();
  let moment = null;
  for (let t = 3; t < 120 && !moment; t += 0.25) {
    const g = scheduledFidget(t, 0.5, PERSONAS.courier, PERSONAS.courier.fidgets);
    if (g && g.def.arms && g.u > 0.3 && g.u < 0.5) moment = t;
  }
  assert.ok(moment, "the schedule contains a hand gesture");
  const body = hero();
  body.userData.castId = "probe";
  // Carry for a while, then drop the parcel exactly as the gesture's peak arrives.
  const worst = run(body, 240, () => still, (t) => ({ carrying: t < moment }), moment - 2);
  for (const [k, v] of Object.entries(worst)) assert.ok(v < 0.12, `${k} moved ${v.toFixed(3)} rad in one frame`);
});

test("task changes cross-fade: no joint snaps between jobs", () => {
  const body = hero();
  const sequence = ["pack", "handoff", "gather", "build", "measure", "plug", "talk", "rest", "pack"];
  const worst = run(
    body,
    sequence.length * 150,
    () => still,
    (t) => ({ working: true, task: sequence[Math.min(sequence.length - 1, Math.floor(t / 2.5))] }),
    10,
  );
  // The hammer's strike is the quickest honest motion; everything else is slower.
  for (const [k, v] of Object.entries(worst)) assert.ok(v < 0.3, `${k} moved ${v.toFixed(3)} rad in one frame`);
});

test("everyone starts settled: no gestures in the first moments", () => {
  for (const id of ["a", "b", "c", "d", "brandon", "alex"]) {
    const seed = hash01(id.length * 31, 7);
    for (let t = 0; t < 2.5; t += 0.1) assert.equal(scheduledFidget(t, seed, PERSONAS.zippy, PERSONAS.zippy.fidgets), null);
  }
  const body = hero();
  const worst = run(body, 120, () => still, () => ({}), 0);
  assert.ok(worst["armR.x"] < 0.01 && worst["head.y"] < 0.02);
});

test("each persona has a repertoire, and stillness is part of the performance", () => {
  for (const [name, persona] of Object.entries(PERSONAS)) {
    const seen = new Set();
    let active = 0,
      samples = 0;
    for (let t = 3; t < 600; t += 0.2) {
      const g = scheduledFidget(t, 0.37, persona, persona.fidgets);
      samples++;
      if (g && g.k > 0.05) {
        seen.add(g.id);
        active++;
      }
    }
    assert.ok(seen.size >= 3, `${name} performs ${seen.size} different gestures`);
    const share = active / samples;
    assert.ok(share > 0.05 && share < 0.55, `${name} gestures ${(share * 100).toFixed(0)}% of the time`);
  }
});

test("a character moves the same way every run, and differently from the next one", () => {
  const make = (id) => {
    const { body } = kit.courier();
    dressFigurine(body, { ...crewLook({ name: id, color: "#5588aa" }, 0), id });
    return body;
  };
  const play = (body) => {
    for (let f = 0; f < 900; f++) animateCharacter(body, still, { time: 20 + f * DT, dt: DT });
    return JSON.stringify(transforms(body));
  };
  assert.equal(play(make("alex")), play(make("alex")), "same cast id, same performance");
  assert.notEqual(play(make("alex")), play(make("morgan")), "different people do not move in unison");
});

test("persona changes the walk: stride length, bounce and sway differ by person", () => {
  const sweep = (name) => {
    const { body } = kit.courier();
    dressFigurine(body, crewLook({ name, color: "#5588aa" }, 0));
    let hip = 0,
      bounce = [Infinity, -Infinity];
    for (let f = 0; f < 240; f++) {
      const phase = f * 0.35;
      animateCharacter(body, { walkCycle: phase, moving: true, speed: 2, step: 0.03 }, { walking: true, time: f * DT, dt: DT });
      if (f > 120) {
        hip = Math.max(hip, Math.abs(body.getObjectByName("left leg").rotation.x));
        bounce = [Math.min(bounce[0], body.position.y), Math.max(bounce[1], body.position.y)];
      }
    }
    return { hip, bounce: bounce[1] - bounce[0] };
  };
  const alex = sweep("alex"),
    sam = sweep("sam"),
    morgan = sweep("morgan");
  assert.ok(alex.hip > morgan.hip && morgan.hip > sam.hip, "easy long stride > sturdy > brisk short steps");
  assert.ok(sam.bounce > morgan.bounce, "the brisk walker bounces, the sturdy one plants");
});

test("feet do not skate: the swinging leg covers the ground the body does", () => {
  // Forward kinematics of a leg (thigh, then shin) in its own units.
  const foot = (hip, knee, L1, L2) => ({
    z: -(L1 * Math.sin(hip) + L2 * Math.sin(hip + knee)),
    y: -(L1 * Math.cos(hip) + L2 * Math.cos(hip + knee)),
  });
  // A planted foot is low and moving back relative to the body; its slip is how far
  // it moves in the world, as a fraction of the body's own travel.
  const slip = (readLegs, frames) => {
    let total = 0,
      distance = 0,
      prev = null;
    for (let f = 0; f < frames; f++) {
      const { move, legs } = readLegs(f);
      const feet = legs.map(({ hip, knee, L1, L2 }) => foot(hip, knee, L1, L2));
      if (prev && f > 60) {
        const lowest = Math.min(feet[0].y, feet[1].y);
        for (const i of [0, 1]) {
          const dz = feet[i].z - prev[i].z;
          if (feet[i].y < lowest + 0.025 && dz < 0) {
            total += Math.abs(move + dz);
            distance += move;
          }
        }
      }
      prev = feet;
    }
    return distance ? total / distance : 0;
  };
  // Courier (leg units are the figurine's own).
  for (const name of ["alex", "sam", "morgan"]) {
    const { body } = kit.courier();
    dressFigurine(body, crewLook({ name, color: "#5588aa" }, 0));
    const find = (n) => body.getObjectByName(n);
    const legs = [find("left leg"), find("right leg")];
    let travel = 0;
    const ratio = slip(
      (f) => {
        const step = 0.02; // world units per frame
        travel += step;
        animateCharacter(body, { walkCycle: travel * 12, moving: true, speed: step / DT, step }, { walking: true, time: f * DT, dt: DT });
        return {
          move: step / 0.52,
          legs: legs.map((leg) => ({ hip: leg.rotation.x, knee: leg.getObjectByName("knee").rotation.x, L1: 0.17, L2: 0.24 })),
        };
      },
      400,
    );
    assert.ok(ratio < 0.5, `${name} courier foot slip ratio ${ratio.toFixed(2)}`);
  }
  // Townsfolk: both persona extremes plus the average.
  for (const id of ["pip", "maya", "tess", "sol"]) {
    const g = new THREE.Group();
    kit.townsperson(g, id);
    g.updateMatrixWorld(true);
    const [legL, legR] = g.userData.limbs;
    const knees = g.userData.townJoints.knees;
    let travel = 0;
    const scale = g.scale.y;
    const ratio = slip(
      (f) => {
        const step = 0.004;
        travel += step;
        animateWalker(g, { travel, time: f * DT, dt: DT, speed: step / DT });
        return {
          move: step / scale,
          legs: [
            { hip: legL.rotation.x, knee: knees[0].rotation.x, L1: 0.078, L2: 0.122 },
            { hip: legR.rotation.x, knee: knees[1].rotation.x, L1: 0.078, L2: 0.122 },
          ],
        };
      },
      400,
    );
    assert.ok(ratio < 0.5, `${id} townsperson foot slip ratio ${ratio.toFixed(2)}`);
  }
});

test("reduced motion freezes every persona, task and gesture at a time-independent pose", () => {
  for (const task of Object.keys(TASKS)) {
    for (const name of ["alex", "sam", "morgan"]) {
      const { body } = kit.courier();
      dressFigurine(body, crewLook({ name, color: "#5588aa" }, 0));
      const opts = { working: true, task, reducedMotion: true, dt: DT };
      for (let f = 0; f < 30; f++) animateCharacter(body, still, { ...opts, time: f * DT });
      const first = transforms(body);
      animateCharacter(body, { ...still, walkCycle: 91, speed: 3, acceleration: 5 }, { ...opts, time: 457.3 });
      assert.deepEqual(transforms(body), first, `${name} ${task}`);
    }
  }
  for (const id of ["maya", "otis", "sol", "pip"]) {
    const g = new THREE.Group();
    kit.townsperson(g, id);
    animateTownsperson(g, { reducedMotion: true, time: 3, pending: true, dt: DT });
    const frozen = transforms(g);
    animateTownsperson(g, { reducedMotion: true, time: 903, pending: true, dt: DT, phase: 44 });
    assert.deepEqual(transforms(g), frozen, id);
  }
});

test("props, faces and springs respond to what the character is doing", () => {
  const body = hero();
  const get = (n) => body.getObjectByName(n);
  const play = (frames, flags, motion = still, start = 0) => {
    for (let f = 0; f < frames; f++) animateCharacter(body, motion, { ...flags, time: start + f * DT, dt: DT });
  };
  play(90, { working: true, task: "build" });
  assert.equal(get("Hammer").visible, true, "the hammer appears for building");
  assert.equal(get("Clipboard").visible, false);
  play(90, { working: true, task: "measure" });
  assert.equal(get("Clipboard").visible, true);
  assert.equal(get("Hammer").visible, false, "and goes away again");
  play(60, {});
  // Talking opens the mouth at some point in its rhythm.
  let opened = 0;
  for (let f = 0; f < 600; f++) {
    animateCharacter(body, still, { working: true, task: "talk", time: 10 + f * DT, dt: DT });
    if (get("Mouth open").visible) opened++;
  }
  assert.ok(opened > 30 && opened < 580, "the mouth opens and closes while talking");
  // A sudden stop sets the charm and pack swinging, and they settle.
  const walking = { walkCycle: 0, moving: true, speed: 2.4, step: 0.04, acceleration: 0 };
  let peak = 0;
  for (let f = 0; f < 120; f++) animateCharacter(body, { ...walking, walkCycle: f * 0.3 }, { walking: true, time: 30 + f * DT, dt: DT });
  for (let f = 0; f < 90; f++) {
    animateCharacter(body, { ...still, acceleration: -9, speed: Math.max(0, 2.4 - f * 0.05) }, { time: 32 + f * DT, dt: DT });
    peak = Math.max(peak, Math.abs(get("Pickle charm").rotation.x));
  }
  assert.ok(peak > 0.05, `the charm swings when the courier stops (${peak.toFixed(2)})`);
  for (let f = 0; f < 240; f++) animateCharacter(body, still, { time: 35 + f * DT, dt: DT });
  assert.ok(Math.abs(get("Pickle charm").rotation.x) < 0.1, "and settles");
});

test("turning on the spot steps the feet round; standing still does not", () => {
  const body = hero();
  const legs = [body.getObjectByName("left leg"), body.getObjectByName("right leg")];
  let facing = 0,
    moved = 0;
  for (let f = 0; f < 180; f++) {
    facing += 3.2 * DT;
    animateCharacter(body, { ...still, facing }, { time: 4 + f * DT, dt: DT });
    if (f > 60) moved = Math.max(moved, ...legs.map((l) => Math.abs(l.rotation.x)));
  }
  assert.ok(moved > 0.08, `pivot steps lift the legs (${moved.toFixed(2)})`);
  let calm = 0;
  for (let f = 0; f < 150; f++) {
    animateCharacter(body, { ...still, facing }, { time: 8 + f * DT, dt: DT });
    // Give the last step a moment to finish, then the feet must be quiet.
    if (f > 60) calm = Math.max(calm, ...legs.map((l) => Math.abs(l.rotation.x)));
  }
  assert.ok(calm < 0.05, `once the turn ends the feet are still (${calm.toFixed(3)})`);
});

test("townsfolk wave to be noticed, hold out their hands for a parcel, and turn their heads", () => {
  const g = new THREE.Group();
  kit.townsperson(g, "maya");
  const [, , armR] = g.userData.limbs;
  const head = g.userData.townJoints.head;
  for (let f = 0; f < 90; f++) animateTownsperson(g, { time: f * DT, dt: DT, pending: true });
  assert.ok(armR.rotation.x < -1.5, "a raised hand");
  for (let f = 0; f < 240; f++) animateTownsperson(g, { time: 2 + f * DT, dt: DT });
  assert.ok(Math.abs(armR.rotation.x) < 0.05, "back at their side");
  for (let f = 0; f < 90; f++) animateTownsperson(g, { time: 8 + f * DT, dt: DT, receiving: true });
  assert.ok(g.userData.limbs[3].rotation.x < -0.9 && armR.rotation.x < -0.9, "both hands out");
  for (let f = 0; f < 120; f++) animateTownsperson(g, { time: 12 + f * DT, dt: DT, look: { yaw: 0.8, weight: 1 } });
  assert.ok(head.rotation.y > 0.55, `the head turned toward the visitor (${head.rotation.y.toFixed(2)})`);
});

test("only friendly neighbours wave at a passing courier", () => {
  const waved = [];
  for (const [i] of PEDESTRIANS.entries()) {
    const g = new THREE.Group();
    kit.townsperson(g, i + 1);
    for (let f = 0; f < 120; f++)
      animateWalker(g, { travel: f * 0.01, time: f * DT, dt: DT, greeting: true, look: { yaw: 0.3, weight: 1 } });
    waved.push(g.userData.limbs[2].rotation.x < -1.2);
  }
  assert.ok(waved.some(Boolean) && waved.some((v) => !v), "some wave, some only glance");
});

test("engine actions map to the work the hands should be doing", () => {
  assert.equal(taskForAction("serve_maya"), "handoff");
  assert.equal(taskForAction("deliver"), "handoff");
  assert.equal(taskForAction("collect"), "gather");
  assert.equal(taskForAction("charge"), "plug");
  assert.equal(taskForAction("craft_scanner"), "build");
  assert.equal(taskForAction("negotiate_island"), "talk");
  assert.equal(taskForAction("rest"), "rest");
  assert.equal(taskForAction("something_new"), "pack");
  assert.equal(taskForAction(undefined), "pack");
});

test("spline tracks are smooth and periodic", () => {
  const v = [0, 1, 0.3, -0.5, 0];
  for (let u = 0; u < 1; u += 0.01) assert.ok(Math.abs(loop(u + 1, v) - loop(u, v)) < 1e-9);
  assert.ok(Math.abs(loop(0.999999, v) - loop(0, v)) < 1e-4);
  assert.equal(span(0, [0, 1, 2]), 0);
  assert.equal(span(1, [0, 1, 2]), 2);
});
