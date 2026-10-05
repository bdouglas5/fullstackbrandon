// Cast lab: every character at one scale, driven by the real animation code.
//   ?who=brandon,crew:db936a,town:0   rows, top to bottom ("kind[:arg]")
//   ?views=0,45,90,180                yaw per copy (degrees)
//   ?pose=idle|walk|carry|work|cycle|seat|fly|wave|receive
//   ?task=handoff|gather|build|measure|plug|talk|rest|pack   (with pose=work)
//   ?fidget=cap|stretch|...&u=0.5   freeze a gesture at normalized time u
//   ?gaze=0.6    head turned this many radians (positive = toward +x)
//   ?phase=0..6.28                    gait phase;  ?sheet=8  N phases across
//   ?time=1.7                         clock for idle / breath / blink
//   ?dist= ?elev= ?look= ?fov= ?w= ?h=  framing
import * as THREE from "three";
import { createToyKit, createToyEnvironment } from "../src/toy-kit.js";
import { animateCharacter, animateCitizen, animateTownsperson } from "../src/world-animation.js";
import { personaFor } from "../src/cast.js";
import { TASKS } from "../src/character-motion.js";
import { dressFigurine } from "../src/figurine-dress.js";
import { crewLook, BUILDERS } from "../src/cast.js";

const q = new URLSearchParams(location.search);
const W = Number(q.get("w")) || innerWidth,
  H = Number(q.get("h")) || innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#9cc7cf");
scene.environment = createToyEnvironment(renderer);
scene.environmentIntensity = 0.6;
scene.add(new THREE.HemisphereLight("#fff5de", "#5f8a96", 0.6));
const sun = new THREE.DirectionalLight("#fff3d1", 3.6);
sun.position.set(-4, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5 });
sun.shadow.normalBias = 0.02;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(16, 48),
  new THREE.MeshStandardMaterial({ color: "#e7cf9d", roughness: 0.8 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const kit = createToyKit();
const pose = q.get("pose") || "idle";
const sheet = Number(q.get("sheet") || 0);
const time = Number(q.get("time") || 0.5);
const basePhase = Number(q.get("phase") || 0);
const views = (q.get("views") || (sheet ? "90" : "0,45,90,180")).split(",").map(Number);
const who = (q.get("who") || "brandon").split(",");
const SCALE = 0.52; // every courier's world scale
const PITCH = 1.0; // spacing between copies
const ROW = 1.15; // spacing between rows
const taskName = q.get("task") || "pack";
const fidgetId = q.get("fidget");
const fidgetU = Number(q.get("u") || 0.5);
const lookYaw = q.has("gaze") ? Number(q.get("gaze")) : null;
const flags = {
  walking: pose === "walk",
  carrying: pose === "carry" || q.has("carry"),
  working: pose === "work",
  cycling: pose === "cycle",
  seated: pose === "seat",
  flying: pose === "fly",
};

// sweep=time: each slot shows a later moment (span seconds across the sheet).
const sweepTime = q.get("sweep") === "time";
const span = Number(q.get("span") || 4);
const slots = sheet
  ? Array.from({ length: sheet }, (_, i) => ({
      phase: sweepTime ? basePhase : basePhase + (i / sheet) * Math.PI * 2,
      time: sweepTime ? time + (i / Math.max(1, sheet - 1)) * span : time,
      yaw: views[0],
    }))
  : views.map((yaw) => ({ phase: basePhase, time, yaw }));
// gallery=fidget:cap@0.5,task:handoff@0.3,...  one Brandon per entry
const gallery = (q.get("gallery") || "")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [kind, rest] = entry.split(":");
    const [name, at] = rest.split("@");
    return { kind, name, u: at === undefined ? 0.5 : Number(at) };
  });
if (gallery.length) who.splice(0, who.length, ...gallery.map(() => q.get("who") || "brandon"));
const rowLayout = gallery.length > 0 || q.get("layout") === "row";
const rows = rowLayout ? 1 : who.length;
const actors = [];
who.forEach((entry, entryIndex) => {
  const row = rowLayout ? 0 : entryIndex;
  const [kind, arg] = entry.split(":");
  // "town:0_1_2" lines up several townsfolk in one row (one per slot).
  const indices = kind === "town" ? String(arg || 0).split("_").map((v) => (/^\d+$/.test(v) ? Number(v) : v)) : [];
  const cols = indices.length > 1 ? indices.map((_, i) => ({ ...slots[0], i })) : slots;
  cols.forEach((slot, col) => {
    const c0 = rowLayout ? entryIndex : col;
    const x = (c0 - ((rowLayout ? who.length : cols.length) - 1) / 2) * PITCH;
    const z = (row - (rows - 1) / 2) * ROW;
    const yaw = THREE.MathUtils.degToRad(slot.yaw);
    if (kind === "town") {
      const g = new THREE.Group();
      scene.add(g);
      const index = indices.length > 1 ? indices[col] : indices[0];
      kit.townsperson(g, index);
      // The game applies these per instance; the lab has no instancing step.
      g.traverse((o) => {
        if (!o.isMesh || !o.userData.tint) return;
        o.material = o.material.clone();
        o.material.color.set(o.userData.tint);
      });
      g.userData.walkPath = [[-40, 0], [40, 0]];
      g.userData.walkSpeed = 0;
      actors.push({ kind, g, x, z, yaw, phase: slot.phase, time0: slot.time, index, order: actors.length });
    } else {
      const { body } = kit.courier();
      if (kind === "crew") {
        // crew:alex[:HEX]  or  crew:builder1 / builder2
        const [who, hex] = String(arg || "alex").split("-");
        const color = `#${hex || "db936a"}`;
        if (/^builder/.test(who)) dressFigurine(body, { ...BUILDERS[Number(who.slice(7) || 1) - 1], color: "#edbc55", trim: "#fff3d0" });
        else dressFigurine(body, { ...crewLook({ name: who, color }, 0), color });
      }
      const holder = new THREE.Group();
      holder.scale.setScalar(SCALE);
      holder.add(body);
      scene.add(holder);
      actors.push({ kind, body, g: holder, x, z, yaw, phase: slot.phase, time0: slot.time, item: gallery[entryIndex] });
    }
  });
});

const fov = Number(q.get("fov") || 28);
const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 200);
const widest = Math.max(rowLayout ? who.length : slots.length, ...who.map((e) => (e.startsWith("town:") ? e.split(":")[1].split("_").length : 0)));
const spanX = (widest - 1) * PITCH + 1.1;
const fit = spanX / (W / H) / (2 * Math.tan((fov * Math.PI) / 360));
const dist = Number(q.get("dist") || Math.max(4.4, fit + 1 + (rows - 1) * 0.6));
const elev = Number(q.get("elev") || 0.22);
const look = Number(q.get("look") || 0.4);
camera.position.set(0, look + dist * Math.sin(elev), dist * Math.cos(elev));
camera.lookAt(0, look, 0);

// Let springs, blends and task clocks run up to the requested instant. In a
// time sweep each copy is stepped further, so tasks show later parts of their loop.
const dt = 1 / 60,
  frames = Number(q.get("settle") || 150);
for (const a of actors) {
  let n = frames + Math.max(0, Math.round((a.time0 - time) / dt));
  // A gallery task is held at u of its loop (after the blend-in settles).
  if (a.item?.kind === "task") n = Math.round(1.0 / dt) + Math.round((a.item.u * (TASKS[a.item.name]?.period || 2)) / dt);
  for (let f = 0; f < n; f++) {
    const t = a.time0 - (n - f) * dt;
    if (a.kind !== "town") {
      const stride = personaFor(a.body.userData.persona).stride;
      animateCharacter(
        a.body,
        { walkCycle: a.phase * stride, moving: flags.walking, speed: flags.walking ? 2.2 : 0, step: 0 },
        {
          ...flags,
          working: flags.working || a.item?.kind === "task",
          carrying: flags.carrying || a.item?.carry,
          task: a.item?.kind === "task" ? a.item.name : taskName,
          fidget: a.item?.kind === "fidget" ? { id: a.item.name, u: a.item.u, k: 1 } : fidgetId ? { id: fidgetId, u: fidgetU, k: 1 } : null,
          look: lookYaw === null ? null : { yaw: lookYaw, weight: 1 },
          time: t,
          dt,
        },
      );
    } else {
      animateTownsperson(a.g, {
        time: t,
        dt,
        walking: pose === "walk",
        phase: a.phase,
        speed: 0.3,
        pending: pose === "wave",
        receiving: pose === "receive",
        look: lookYaw === null ? null : { yaw: lookYaw, weight: 1 },
      });
    }
  }
}
// Place every copy after animation. Walkers keep their own vertical bob.
for (const a of actors) {
  a.g.position.set(a.x, a.g.position.y, a.z);
  a.g.rotation.y = a.yaw;
}
renderer.render(scene, camera);
window.__lab = { scene, camera, actors, renderer };
document.body.dataset.ready = "1";
