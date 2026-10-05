/**
 * The cast bible: who everyone is, how they look, how they move.
 *
 * Looks are data for the figurine and townsfolk generators; personas are data
 * for the animation system. Both are plain JSON so they survive Object3D
 * clones and can be read in tests. Nothing here is random: every character is
 * authored, and the few seeded ones (ambient pedestrians) are derived from a
 * fixed index so every reload shows the same neighbors.
 */

// ---------------------------------------------------------------------------
// Personas. Dimensionless multipliers around the neutral walk and idle.
//   pace      how fast they stroll, as a multiple of the base walk
//   stride    leg swing length (cadence follows: longer strides, slower feet)
//   bounce    vertical weight in the step      sway   roll over the stance leg
//   arms      arm swing                        head   head bob and counter-turn
//   lean      forward lean bias (radians)      slump  chest/head droop (radians)
//   hips      pelvis yaw                       energy idle fidget rate and size
//   spring    snappiness of follow-through     glance how often they look around
//   smile     resting smile (0 flat .. 1 wide) friendly how readily they greet
//   fidgets   weighted menu of idle gestures
export const PERSONAS = {
  courier: {
    stride: 1,
    bounce: 1,
    sway: 1,
    arms: 1,
    head: 1,
    lean: 0.01,
    slump: 0,
    hips: 1,
    energy: 1,
    spring: 1,
    glance: 1,
    smile: 0.62,
    friendly: 0.8,
    fidgets: { neck: 3, strap: 2, stretch: 1.4, glance: 2.4, parcel: 1.4 },
  },
  easy: {
    pace: 1.05,
    stride: 1.16,
    bounce: 0.9,
    sway: 1.25,
    arms: 1.15,
    head: 0.85,
    lean: -0.012,
    slump: 0,
    hips: 1.3,
    energy: 0.85,
    spring: 0.8,
    glance: 1.2,
    smile: 0.7,
    friendly: 0.85,
    fidgets: { stretch: 3, glance: 2.5, neck: 1.5, shoulders: 2 },
  },
  brisk: {
    pace: 1.2,
    stride: 0.86,
    bounce: 1.25,
    sway: 0.7,
    arms: 1.0,
    head: 1.1,
    lean: 0.04,
    slump: 0,
    hips: 0.8,
    energy: 1.25,
    spring: 1.25,
    glance: 0.8,
    smile: 0.5,
    friendly: 0.55,
    fidgets: { tap: 3, check: 3, neck: 2, glance: 1.2 },
  },
  sturdy: {
    pace: 0.95,
    stride: 1.04,
    bounce: 0.6,
    sway: 1.35,
    arms: 0.8,
    head: 0.6,
    lean: 0.03,
    slump: 0.03,
    hips: 1.1,
    energy: 0.7,
    spring: 0.7,
    glance: 0.8,
    smile: 0.5,
    friendly: 0.6,
    fidgets: { shoulders: 3, glance: 2, stretch: 1, belly: 2 },
  },
  warm: {
    pace: 1.0,
    stride: 0.98,
    bounce: 1.0,
    sway: 1.0,
    arms: 1.05,
    head: 1.0,
    lean: 0,
    slump: 0,
    hips: 1.1,
    energy: 1.0,
    spring: 1.0,
    glance: 1.3,
    smile: 0.8,
    friendly: 1,
    fidgets: { tidy: 3, glance: 2.5, wave: 1.5, hands: 2 },
  },
  jolly: {
    pace: 0.95,
    stride: 0.95,
    bounce: 1.1,
    sway: 1.25,
    arms: 1.1,
    head: 1.1,
    lean: 0.01,
    slump: 0,
    hips: 1.2,
    energy: 1.1,
    spring: 0.9,
    glance: 1,
    smile: 0.9,
    friendly: 1,
    fidgets: { belly: 3, shoulders: 2, glance: 2, wave: 2 },
  },
  zippy: {
    pace: 1.3,
    stride: 0.82,
    bounce: 1.35,
    sway: 0.8,
    arms: 1.2,
    head: 1.2,
    lean: 0.05,
    slump: 0,
    hips: 0.9,
    energy: 1.45,
    spring: 1.4,
    glance: 1.4,
    smile: 0.7,
    friendly: 0.7,
    fidgets: { tap: 3, bounce: 3, glance: 2, stretch: 1.2 },
  },
  graceful: {
    pace: 0.95,
    stride: 1.12,
    bounce: 0.75,
    sway: 1.4,
    arms: 0.9,
    head: 0.7,
    lean: -0.015,
    slump: -0.01,
    hips: 1.4,
    energy: 0.8,
    spring: 0.7,
    glance: 1.1,
    smile: 0.7,
    friendly: 0.9,
    fidgets: { tidy: 3, glance: 3, stretch: 1.5, hands: 2 },
  },
  bubbly: {
    pace: 1.1,
    stride: 0.9,
    bounce: 1.3,
    sway: 1.1,
    arms: 1.15,
    head: 1.15,
    lean: 0.01,
    slump: 0,
    hips: 1.2,
    energy: 1.2,
    spring: 1.2,
    glance: 1.2,
    smile: 0.9,
    friendly: 1,
    fidgets: { bounce: 3, tidy: 2, wave: 2, glance: 2, hands: 1.5 },
  },
  precise: {
    pace: 1.05,
    stride: 0.96,
    bounce: 0.8,
    sway: 0.6,
    arms: 0.8,
    head: 0.7,
    lean: 0.015,
    slump: 0,
    hips: 0.7,
    energy: 0.8,
    spring: 1.1,
    glance: 0.9,
    smile: 0.45,
    friendly: 0.5,
    fidgets: { check: 3, glasses: 2, glance: 1.5, tap: 1 },
  },
  sporty: {
    pace: 1.5,
    stride: 1.08,
    bounce: 1.15,
    sway: 0.9,
    arms: 1.3,
    head: 0.9,
    lean: 0.035,
    slump: 0,
    hips: 1,
    energy: 1.2,
    spring: 1.2,
    glance: 1,
    smile: 0.7,
    friendly: 0.8,
    fidgets: { stretch: 3, bounce: 2, shoulders: 2, glance: 1.5 },
  },
  steady: {
    pace: 1.0,
    stride: 1.02,
    bounce: 0.85,
    sway: 0.95,
    arms: 0.95,
    head: 0.8,
    lean: 0.02,
    slump: 0,
    hips: 0.95,
    energy: 0.85,
    spring: 0.9,
    glance: 1.4,
    smile: 0.55,
    friendly: 0.7,
    fidgets: { glance: 3, strap: 2, check: 1.5, stretch: 1 },
  },
  kid: {
    pace: 1.25,
    stride: 0.74,
    bounce: 1.6,
    sway: 1.1,
    arms: 1.35,
    head: 1.3,
    lean: 0.03,
    slump: 0,
    hips: 1.1,
    energy: 1.7,
    spring: 1.5,
    glance: 1.8,
    smile: 0.95,
    friendly: 1,
    fidgets: { bounce: 4, wave: 2.5, glance: 2.5, tap: 1.5, hands: 1.5 },
  },
  dreamy: {
    pace: 0.85,
    stride: 1.06,
    bounce: 0.85,
    sway: 1.3,
    arms: 0.95,
    head: 0.9,
    lean: -0.01,
    slump: 0.01,
    hips: 1.3,
    energy: 0.85,
    spring: 0.75,
    glance: 1.6,
    smile: 0.8,
    friendly: 0.8,
    fidgets: { tidy: 3, glance: 3, sway: 2, hands: 2, stretch: 1 },
  },
  elder: {
    pace: 0.62,
    stride: 0.78,
    bounce: 0.5,
    sway: 1.1,
    arms: 0.55,
    head: 0.5,
    lean: 0.07,
    slump: 0.07,
    hips: 0.8,
    energy: 0.55,
    spring: 0.55,
    glance: 1.2,
    smile: 0.7,
    friendly: 0.85,
    fidgets: { glasses: 3, shoulders: 1.5, glance: 2, hands: 2 },
  },
  calm: {
    pace: 0.92,
    stride: 1.05,
    bounce: 0.8,
    sway: 0.9,
    arms: 0.85,
    head: 0.75,
    lean: 0.005,
    slump: 0,
    hips: 0.9,
    energy: 0.75,
    spring: 0.8,
    glance: 1.5,
    smile: 0.6,
    friendly: 0.75,
    fidgets: { glance: 3, tidy: 2, hands: 2, stretch: 1 },
  },
  tourist: {
    pace: 0.8,
    stride: 0.94,
    bounce: 1.0,
    sway: 1.0,
    arms: 1.0,
    head: 1.4,
    lean: 0.01,
    slump: 0,
    hips: 1.0,
    energy: 1.1,
    spring: 1.0,
    glance: 2.4,
    smile: 0.8,
    friendly: 0.9,
    fidgets: { glance: 4, check: 2, wave: 1, stretch: 1.5 },
  },
};

// ---------------------------------------------------------------------------
// Authored cast. Specs feed `townsBody` / `townsHead` (src/townsfolk.js).
const SKIN = {
  fair: "#f0b58f",
  peach: "#e8a97c",
  tan: "#c9875c",
  brown: "#8d5c43",
  deep: "#6e4632",
};
const SHOE = "#fbf0dc";

export const SHOPKEEPERS = {
  maya: {
    skin: SKIN.fair,
    persona: "warm",
    hair: { style: "bun", color: "#7a3f2a" },
    outfit: {
      type: "apron",
      color: "#e58f70",
      trim: "#6fa05a",
      lower: "#4f6f95",
    },
    face: { freckles: true },
    acc: ["sprig"],
  },
  theo: {
    skin: SKIN.peach,
    persona: "jolly",
    build: 1.14,
    height: 1.0,
    hair: { style: "crop", color: "#2e2a2b" },
    hat: { style: "chef", color: "#fbf5e6", trim: "#e5ddc8" },
    outfit: {
      type: "apron",
      color: "#e5bc64",
      trim: "#fffaf0",
      lower: "#3c4f6a",
    },
    face: { mustache: true },
  },
  jun: {
    skin: SKIN.fair,
    persona: "zippy",
    build: 0.92,
    height: 0.97,
    hair: { style: "spike", color: "#26262a" },
    hat: { style: "band", color: "#e8864a" },
    outfit: {
      type: "vest",
      color: "#5f9b91",
      trim: "#2f5560",
      lower: "#33414f",
    },
  },
  amara: {
    skin: SKIN.brown,
    persona: "graceful",
    height: 1.02,
    hair: { style: "long", color: "#33262b" },
    hat: { style: "sun", color: "#e6c77a" },
    outfit: { type: "dress", color: "#a79bbb", lower: "#a79bbb" },
    acc: ["tote"],
  },
  otis: {
    skin: SKIN.peach,
    persona: "sturdy",
    build: 1.16,
    height: 0.97,
    hair: { style: "fringe", color: "#c9c4bc" },
    beard: true,
    hat: { style: "beanie", color: "#2f4766", trim: "#e9dcc0" },
    outfit: {
      type: "coat",
      color: "#617d9c",
      trim: "#e9dcc0",
      lower: "#2c3a4d",
    },
  },
  cleo: {
    skin: SKIN.tan,
    persona: "bubbly",
    hair: { style: "bun", color: "#2f2023" },
    hat: { style: "bakers", color: "#fbf5e6", trim: "#f0e6d0" },
    outfit: {
      type: "apron",
      color: "#d88b9d",
      trim: "#fff3e0",
      lower: "#6d4c3d",
    },
  },
  ravi: {
    skin: SKIN.brown,
    persona: "precise",
    hair: { style: "crop", color: "#232226" },
    outfit: {
      type: "vest",
      color: "#f1e8d3",
      trim: "#7da060",
      lower: "#3d4a3c",
    },
    face: { glasses: "#2a3640" },
    acc: ["tag"],
  },
  nell: {
    skin: SKIN.fair,
    persona: "sporty",
    hair: { style: "ponytail", color: "#d8b36a" },
    hat: { style: "visor", color: "#f6f1e4" },
    outfit: {
      type: "tee",
      color: "#659fba",
      trim: "#f6f1e4",
      lower: "#e8d9b3",
    },
  },
  hugo: {
    skin: SKIN.tan,
    persona: "jolly",
    build: 1.1,
    hair: { style: "curls", color: "#aaa59b" },
    hat: { style: "newsboy", color: "#7a5a3a" },
    outfit: {
      type: "apron",
      color: "#eadcc0",
      trim: "#c4483a",
      lower: "#3b3b46",
    },
    face: { mustache: true },
  },
  iris: {
    skin: SKIN.peach,
    persona: "precise",
    hair: { style: "bob", color: "#9a4a2a" },
    outfit: {
      type: "vest",
      color: "#b4a061",
      trim: "#2f3a3a",
      lower: "#2f3a3a",
    },
    acc: ["headset"],
  },
  tess: {
    skin: SKIN.tan,
    persona: "easy",
    height: 1.03,
    hair: { style: "long", color: "#d9b27a" },
    outfit: {
      type: "tee",
      color: "#6d9f9c",
      trim: "#f4efe0",
      lower: "#e8d9b3",
    },
  },
  leo: {
    skin: SKIN.fair,
    persona: "steady",
    hair: { style: "crop", color: "#6b4a30" },
    hat: { style: "bucket", color: "#cdbd8c" },
    outfit: {
      type: "vest",
      color: "#e8dfc4",
      trim: "#799261",
      lower: "#5e6e48",
    },
    acc: ["satchel"],
  },
  pip: {
    skin: SKIN.peach,
    persona: "kid",
    height: 0.84,
    head: 1.12,
    build: 0.94,
    hair: { style: "pigtails", color: "#7a4a2c" },
    outfit: {
      type: "apron",
      color: "#d3ac6b",
      trim: "#fff3e0",
      lower: "#6d4c3d",
    },
  },
  bea: {
    skin: SKIN.deep,
    persona: "dreamy",
    hair: { style: "curls", color: "#2e2024" },
    outfit: {
      type: "cardigan",
      color: "#a48dae",
      trim: "#ece0ee",
      lower: "#4a4a63",
    },
    acc: ["flower"],
  },
  sol: {
    skin: SKIN.brown,
    persona: "elder",
    height: 0.96,
    build: 1.05,
    hair: { style: "fringe", color: "#e3e0da" },
    outfit: {
      type: "cardigan",
      color: "#839d62",
      trim: "#cdd8ac",
      lower: "#5b4a3c",
    },
    face: { glasses: "#6b4a30" },
    acc: ["cane"],
  },
  wynn: {
    skin: SKIN.peach,
    persona: "calm",
    hair: { style: "crop", color: "#4a3a30" },
    hat: { style: "newsboy", color: "#44566a" },
    outfit: {
      type: "coat",
      color: "#739cb0",
      trim: "#e5c46a",
      lower: "#38485a",
    },
    acc: ["scarf"],
    scarf: "#e5c46a",
  },
};

// Thirteen ambient walkers: archetypes you could name from across the street.
export const PEDESTRIANS = [
  {
    skin: SKIN.fair,
    persona: "brisk",
    hair: { style: "crop", color: "#2e2a2b" },
    outfit: { type: "tee", color: "#3f8f8f", lower: "#2a4253" },
    acc: ["satchel"],
  },
  {
    skin: SKIN.tan,
    persona: "sporty",
    hair: { style: "ponytail", color: "#3b2a2a" },
    hat: { style: "band", color: "#f2c35b" },
    outfit: { type: "tee", color: "#ed8970", lower: "#2a4253" },
  },
  {
    skin: SKIN.brown,
    persona: "tourist",
    hat: { style: "sun", color: "#e6c77a" },
    hair: { style: "crop", color: "#2e2a2b" },
    outfit: { type: "tee", color: "#929dc6", lower: "#c9b98a" },
    acc: ["camera"],
  },
  {
    skin: SKIN.peach,
    persona: "kid",
    height: 0.82,
    head: 1.12,
    hair: { style: "pigtails", color: "#c58a45" },
    outfit: { type: "dress", color: "#e6a5b9", lower: "#e6a5b9" },
  },
  {
    skin: SKIN.fair,
    persona: "elder",
    height: 0.95,
    hair: { style: "fringe", color: "#d8d4cd" },
    face: { glasses: "#4a4a4a" },
    outfit: {
      type: "cardigan",
      color: "#8fbf8a",
      trim: "#d3e8cf",
      lower: "#6d4c3d",
    },
    acc: ["cane"],
  },
  {
    skin: SKIN.deep,
    persona: "steady",
    hair: { style: "puff", color: "#241a1c" },
    outfit: { type: "tee", color: "#f2c35b", lower: "#4f6f95" },
    acc: ["tote"],
  },
  {
    skin: SKIN.tan,
    persona: "calm",
    hair: { style: "bun", color: "#2e2a2b" },
    outfit: { type: "dress", color: "#929dc6", lower: "#929dc6" },
  },
  {
    skin: SKIN.fair,
    persona: "easy",
    hair: { style: "spike", color: "#9b5a37" },
    outfit: {
      type: "vest",
      color: "#e8dfc4",
      trim: "#3f8f8f",
      lower: "#2a4253",
    },
  },
  {
    skin: SKIN.brown,
    persona: "warm",
    hat: { style: "beanie", color: "#e6a5b9", trim: "#fff3e0" },
    hair: { style: "bob", color: "#2e2a2b" },
    outfit: {
      type: "coat",
      color: "#8fbf8a",
      trim: "#fff3e0",
      lower: "#3c4f6a",
    },
  },
  {
    skin: SKIN.peach,
    persona: "brisk",
    hat: { style: "bucket", color: "#8fbf8a" },
    hair: { style: "crop", color: "#5b3a2a" },
    outfit: {
      type: "vest",
      color: "#f2c35b",
      trim: "#4f6f95",
      lower: "#6d4c3d",
    },
  },
  {
    skin: SKIN.tan,
    persona: "dreamy",
    hair: { style: "long", color: "#3a2a2f" },
    outfit: { type: "dress", color: "#f2c35b", lower: "#f2c35b" },
  },
  {
    skin: SKIN.fair,
    persona: "jolly",
    build: 1.1,
    beard: true,
    hat: { style: "newsboy", color: "#6d4c3d" },
    hair: { style: "crop", color: "#9b5a37" },
    outfit: {
      type: "coat",
      color: "#ed8970",
      trim: "#fff3e0",
      lower: "#2a4253",
    },
  },
  {
    skin: SKIN.deep,
    persona: "zippy",
    hair: { style: "curls", color: "#241a1c" },
    outfit: { type: "tee", color: "#e6a5b9", lower: "#3c4f6a" },
    acc: ["tote"],
  },
];

// The previous index-driven variety remains the fallback for any other caller.
export function fallbackLook(i) {
  const style = i % 3;
  return {
    skin: ["#f0b58f", "#c9875c", "#8d5c43"][i % 3],
    persona: ["warm", "brisk", "easy", "steady"][i % 4],
    hair: {
      style: ["bun", "bob", "pigtails"][style],
      color: ["#5b3a2a", "#2e2a2b", "#c58a45", "#9b5a37"][i % 4],
    },
    outfit: {
      type: i % 4 === 1 ? "dress" : "tee",
      color: ["#ed8970", "#f2c35b", "#3f8f8f", "#929dc6", "#e6a5b9", "#8fbf8a"][
        i % 6
      ],
      lower: ["#2a4253", "#6d4c3d", "#4f6f95"][i % 3],
    },
  };
}

/** Resolve a customer id, a pedestrian index, or an explicit spec to a look. */
export function townLook(input) {
  const base =
    typeof input === "number"
      ? PEDESTRIANS[
          (input - 1 + PEDESTRIANS.length * 8) % PEDESTRIANS.length
        ] || fallbackLook(input)
      : typeof input === "string"
        ? SHOPKEEPERS[input]
        : input;
  const look = base || fallbackLook(0);
  return {
    height: 1,
    head: 1,
    build: 1,
    ...look,
    outfit: { shoe: SHOE, ...look.outfit },
    id: typeof input === "string" ? input : look.id,
  };
}

// ---------------------------------------------------------------------------
// Crew: three colleagues in Brandon's uniform family, each their own person.
// Their uniform colors come from the engine (terracotta, periwinkle, lilac), so
// skin tones are chosen to separate from them by value.
export const CREW = {
  alex: {
    persona: "easy",
    scale: 1.04,
    build: 0.96,
    skin: SKIN.fair,
    hair: { color: "#2b1e1f", style: "ponytail" },
    headwear: "cap",
    glasses: null,
  },
  sam: {
    persona: "brisk",
    scale: 0.95,
    build: 1.0,
    skin: SKIN.tan,
    hair: { color: "#b5702f", style: "short" },
    headwear: "beanie",
    glasses: "#2a3640",
  },
  morgan: {
    persona: "sturdy",
    scale: 1.0,
    build: 1.1,
    skin: SKIN.deep,
    hair: { color: "#1f1819", style: "puff" },
    headwear: "bandana",
    glasses: null,
  },
};
const CREW_ORDER = ["alex", "sam", "morgan"];
export function crewLook(member, index = 0) {
  const key = String(member?.name || "").toLowerCase();
  const look = CREW[key] || CREW[CREW_ORDER[index % CREW_ORDER.length]];
  return {
    ...look,
    id: key || CREW_ORDER[index % CREW_ORDER.length],
    color: member?.color,
  };
}

export const BUILDERS = [
  {
    id: "builder-1",
    persona: "sturdy",
    scale: 1.0,
    build: 1.08,
    skin: SKIN.tan,
    hair: { color: "#2b1e1f", style: "short" },
    headwear: "hardhat",
    task: "build",
  },
  {
    id: "builder-2",
    persona: "brisk",
    scale: 0.97,
    build: 0.98,
    skin: SKIN.fair,
    hair: { color: "#8a5a32", style: "short" },
    headwear: "hardhat",
    glasses: "#2a3640",
    task: "measure",
  },
];

export const HERO = { id: "brandon", persona: "courier" };
export const personaFor = (id) => PERSONAS[id] || PERSONAS.courier;
