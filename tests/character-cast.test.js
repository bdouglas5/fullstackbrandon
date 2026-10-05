import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";
import { instanceCitizens } from "../src/optimize-world.js";
import { createToyKit } from "../src/toy-kit.js";
import { townsBody, townsHead } from "../src/townsfolk.js";
import { dressFigurine } from "../src/figurine-dress.js";
import { createFigurine } from "../src/figurine.js";
import {
  PERSONAS,
  SHOPKEEPERS,
  PEDESTRIANS,
  CREW,
  BUILDERS,
  townLook,
  crewLook,
  personaFor,
} from "../src/cast.js";
import { PEOPLE } from "../shared/catalog.js";
import { FIDGETS, TASKS } from "../src/character-motion.js";

const signature = (look) =>
  JSON.stringify([
    look.hair?.style,
    look.hair?.color,
    look.hat?.style,
    look.outfit.type,
    look.outfit.color,
    look.acc || [],
    !!look.beard,
    look.face?.glasses || null,
    look.height,
    look.build,
  ]);

test("every shopkeeper is an authored, distinct character", () => {
  for (const person of PEOPLE)
    assert.ok(SHOPKEEPERS[person.id], `${person.name} has a designed look`);
  const looks = PEOPLE.map((p) => townLook(p.id));
  assert.equal(new Set(looks.map(signature)).size, looks.length, "no two shopkeepers share a silhouette and palette");
  // Shopkeeper outfits keep their catalog color somewhere on the figure, so the
  // order chips and the street agree about who is who.
  for (const person of PEOPLE) {
    const look = townLook(person.id);
    const colors = [look.outfit.color, look.outfit.trim, look.hat?.color].map((c) => c?.toLowerCase());
    assert.ok(
      colors.includes(person.color.toLowerCase()) || look.outfit.type === "vest" || look.outfit.type === "apron",
      `${person.name} wears ${person.color}`,
    );
  }
});

test("pedestrians are thirteen different neighbors, not repeated dolls", () => {
  assert.equal(PEDESTRIANS.length, 13);
  assert.equal(new Set(PEDESTRIANS.map((_, i) => signature(townLook(i + 1)))).size, 13);
  // Archetypes cover the age range, so heights and heads genuinely differ.
  const heights = PEDESTRIANS.map((p) => p.height ?? 1);
  assert.ok(Math.min(...heights) < 0.9 && Math.max(...heights) >= 1);
});

test("every persona is complete and every gesture it names exists", () => {
  for (const [name, persona] of Object.entries(PERSONAS)) {
    for (const key of ["stride", "bounce", "sway", "arms", "head", "energy", "spring", "glance", "smile", "friendly", "fidgets"])
      assert.ok(persona[key] !== undefined, `${name}.${key}`);
    assert.ok(persona.stride > 0.7 && persona.stride < 1.25, `${name} stride is walkable`);
    for (const id of Object.keys(persona.fidgets)) assert.ok(FIDGETS[id], `${name} gesture ${id} exists`);
  }
  for (const look of [...Object.values(SHOPKEEPERS), ...PEDESTRIANS, ...Object.values(CREW), ...BUILDERS])
    assert.ok(PERSONAS[look.persona], `persona ${look.persona} exists`);
  for (const task of ["pack", "handoff", "gather", "build", "measure", "plug", "talk", "rest"])
    assert.ok(TASKS[task]);
  assert.equal(personaFor("nobody"), PERSONAS.courier);
});

test("townsfolk sculpts stay within their triangle and build-time budgets", () => {
  const started = performance.now();
  let worst = 0;
  const specs = [...PEOPLE.map((p) => townLook(p.id)), ...PEDESTRIANS.map((_, i) => townLook(i + 1))];
  for (const spec of specs) {
    const count = (regions) => Object.values(regions).reduce((n, g) => n + g.index.count / 3, 0);
    const body = townsBody(spec),
      head = townsHead(spec);
    for (const g of [...Object.values(body), ...Object.values(head.regions)]) {
      assert.ok(g.index.count > 0 && g.attributes.position.count > 0);
      for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v));
    }
    worst = Math.max(worst, count(body) + count(head.regions));
  }
  assert.ok(worst < 9000, `heaviest person is ${worst} triangles`);
  assert.ok(performance.now() - started < 4000, "the whole cast sculpts in a few seconds, once");
});

test("a crowd of different outfits is still a handful of draw calls", () => {
  const w = buildWorld();
  // Clouds share the instancing pass; count only what belongs to people.
  const cloudBatches = new Set();
  for (const cloud of w.clouds)
    cloud.traverse((o) => o.isMesh && cloudBatches.add(`${o.geometry.uuid}/${o.material.uuid}`));
  const batches = instanceCitizens(w) && w.world.children.filter((c) => c.name === "Instanced island neighbors");
  const people = w.customers.length + w.pedestrians.length;
  assert.equal(people, 29);
  const peopleBatches = batches.length - cloudBatches.size;
  // Two unique painted pieces per person plus shared limbs, faces and props.
  assert.ok(peopleBatches < people * 2 + 40, `${peopleBatches} batches for ${people} people`);
  // Tints ride on the instances: parts that share a shape keep their own color.
  const tinted = batches.filter((b) => b.instanceColor);
  assert.ok(tinted.length > 10);
  const sleeveGeometry = w.customers[0].getObjectByName("sleeve").geometry;
  const sleeves = batches.find((b) => b.geometry === sleeveGeometry && b.instanceColor);
  assert.ok(sleeves, "all sleeves are one batch");
  assert.equal(sleeves.count, people * 2);
  const colors = new Set();
  for (let i = 0; i < sleeves.count; i++) {
    const c = new THREE.Color();
    sleeves.getColorAt(i, c);
    colors.add(c.getHexString());
  }
  assert.ok(colors.size > 12, "sleeves carry many different outfit colors");
});

test("citizens keep the contracts the scene and animation rely on", () => {
  const w = buildWorld();
  for (const person of [...w.customers, ...w.pedestrians]) {
    const limbs = person.userData.limbs;
    assert.equal(limbs.length, 4);
    assert.deepEqual(limbs.map((l) => l.name), ["leg", "leg", "arm", "arm"]);
    assert.ok(person.userData.townJoints.head, "heads turn on a neck pivot");
    assert.equal(person.userData.townJoints.knees.length, 2);
    assert.equal(person.userData.townJoints.elbows.length, 2);
    assert.ok(PERSONAS[person.userData.persona]);
  }
  assert.deepEqual(
    w.customers.map((c) => c.userData.townLook),
    PEOPLE.map((p) => p.id),
    "customers keep their address order",
  );
});

test("crew are their own people in the courier's uniform family", () => {
  const kit = createToyKit();
  const seen = new Set();
  for (const [index, name] of ["Alex", "Sam", "Morgan"].entries()) {
    const { body } = kit.courier();
    const look = crewLook({ name, color: "#336699" }, index);
    dressFigurine(body, look);
    seen.add(JSON.stringify([look.skin, look.hair, look.headwear, look.glasses, look.scale]));
    assert.equal(body.userData.persona, look.persona);
    assert.equal(body.userData.castId, look.id);
    // The hero's face, rig and carried parcel all survive dressing.
    for (const part of ["head rig", "left leg", "carried parcel", "backpack", "Pickle charm"])
      assert.ok(body.getObjectByName(part), part);
    const cap = body.getObjectByName("cap");
    if (look.headwear === "cap") assert.ok(cap);
    else {
      assert.equal(cap, undefined, "the courier cap gives way to other headwear");
      assert.ok(body.getObjectByName({ beanie: "Knit beanie", bandana: "Tied bandana", hardhat: "Hard hat" }[look.headwear]));
    }
    // Dressed bodies still clone with their own skeleton and persona.
    const copy = body.clone(true);
    assert.equal(copy.userData.persona, look.persona);
  }
  assert.equal(seen.size, 3, "three colleagues, three different looks");
  assert.deepEqual(BUILDERS.map((b) => b.headwear), ["hardhat", "hardhat"]);
});

test("the hero's face is built to act: brows, a mouth that opens, plain black eyes", () => {
  const { body } = createFigurine(null);
  assert.equal(body.getObjectByName("Brow", true) !== undefined, true);
  const brows = [],
    eyes = [];
  body.traverse((o) => {
    if (o.name === "Brow") brows.push(o);
    if (o.name === "Eye") eyes.push(o);
  });
  assert.equal(brows.length, 2);
  assert.equal(eyes.length, 2);
  // Eyes are plain black ovals: no highlights.
  for (const eye of eyes) assert.equal(eye.children.length, 0);
  assert.ok(body.getObjectByName("Mouth open"));
  assert.ok(body.getObjectByName("Cap pickle emblem"));
  assert.ok(body.getObjectByName("Pickle charm body"));
});
