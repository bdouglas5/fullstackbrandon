import { TOOLS, TRANSPORT } from "./catalog.js";
import { ISLANDS } from "./islands.js";

export const BRANCHES = [
  ["service", "Make a name", "From the first order to an island institution."],
  ["gadgets", "Master the toolkit", "Every gadget, then every Pro upgrade."],
  ["fleet", "Go further", "Earn new transport and put it to work."],
  ["team", "Build a team", "Hire, equip, and support three teammates."],
  [
    "business",
    "Grow the business",
    "From a garage to your own pickle production.",
  ],
  ["islands", "Across the islands", "Establish a presence beyond home."],
  [
    "retirement",
    "Earn your freedom",
    "Build the fund and bring everyone home.",
  ],
];
const milestone = (
  id,
  branch,
  title,
  description,
  target,
  value,
  requires = [],
) => ({ id, branch, title, description, target, value, requires });
const flag = (id, branch, title, description, value, requires = []) =>
  milestone(
    id,
    branch,
    title,
    description,
    1,
    (s) => Number(Boolean(value(s))),
    requires,
  );
const ladder = (branch, prefix, targets, titles, noun, value) =>
  targets.map((target, i) =>
    milestone(
      `${prefix}-${target}`,
      branch,
      titles[i],
      `${target.toLocaleString()} ${target === 1 ? noun.replace(/^orders/, "order").replace(/^cases/, "case") : noun}.`,
      target,
      value,
      i ? [`${prefix}-${targets[i - 1]}`] : [],
    ),
  );

// The engine and the achievement panel share these exact retirement conditions.
// Historical trophies never replace the live financial and staffing checks.
export function retirementRequirements(s) {
  const crew = s.crew || [];
  return [
    [
      "gadgets",
      "Master every gadget",
      Object.keys(TOOLS).every((id) => s.tools?.[id] === 2),
    ],
    [
      "fleet",
      "Own every vehicle",
      Object.keys(TRANSPORT).every((id) => s.vehicles?.includes(id)),
    ],
    [
      "experience",
      "Use every vehicle",
      Object.keys(TRANSPORT).every((id) => (s.transportUsage?.[id] || 0) > 0),
    ],
    [
      "team",
      "Three equipped teammates, no unpaid wages",
      crew.length >= 3 &&
        crew.every((c) => c.vehicles?.length && !c.wageArrears),
    ],
    ["factory", "Finish the factory", s.construction?.stage === "complete"],
    ["expansion", "Expand production", !!s.production?.expanded],
    ["production", "Produce 24 cases", (s.production?.produced || 0) >= 24],
    [
      "night",
      "Complete two night deliveries",
      (s.schedule?.totalNightDeliveries || 0) >= 2,
    ],
    [
      "fund",
      `Keep ${(s.retirement?.target || 2500).toLocaleString()} coins in the fund`,
      s.money >= (s.retirement?.target || 2500),
    ],
  ].map(([id, label, complete]) => ({ id, label, complete }));
}

export const ACHIEVEMENTS = [
  ...ladder(
    "service",
    "orders",
    [1, 10, 50, 100, 250, 500],
    [
      "First handoff",
      "Finding a rhythm",
      "Local favorite",
      "A hundred happy handoffs",
      "Island institution",
      "Delivery legend",
    ],
    "orders delivered",
    (s) => s.served || 0,
  ),
  ...ladder(
    "service",
    "cases",
    [25, 100, 500, 1000],
    [
      "Crates in motion",
      "Wholesale momentum",
      "A sea of pickles",
      "Thousand-case club",
    ],
    "cases delivered",
    (s) => s.casesDelivered || 0,
  ),
  ...ladder(
    "service",
    "revenue",
    [100, 1000, 5000, 10000],
    ["First hundred", "Real business", "Growing empire", "Five-figure founder"],
    "coins earned over this career",
    (s) => s.earned || 0,
  ),
  ...[
    [
      "steady",
      "Fast lane",
      "Deliver 50 orders in a fast-demand world, such as seed 42.",
    ],
    [
      "busy",
      "Finding balance",
      "Deliver 50 orders in a balanced-demand world, such as seed 43.",
    ],
    [
      "rush",
      "Patient builder",
      "Deliver 50 orders in a slower-demand world, such as seed 44.",
    ],
  ].map(([id, title, description], index) => ({
    ...milestone(
      `seed-${id}`,
      "service",
      title,
      description,
      50,
      (s) => (Math.abs(s.seed) % 3 === index ? s.served || 0 : 0),
      ["orders-50"],
    ),
    seedClass: index,
  })),
  flag(
    "night-service",
    "service",
    "After-hours hero",
    "Complete two night deliveries.",
    (s) => s.schedule?.totalNightDeliveries >= 2,
  ),
  ...Object.entries(TOOLS).flatMap(([id, tool]) => [
    flag(
      `tool-${id}`,
      "gadgets",
      tool.name,
      `Acquire the ${tool.name.toLowerCase()}.`,
      (s) => s.tools?.[id] >= 1,
    ),
    flag(
      `pro-${id}`,
      "gadgets",
      `${tool.name} · Pro`,
      tool.effect,
      (s) => s.tools?.[id] >= 2,
      [`tool-${id}`],
    ),
  ]),
  flag(
    "tool-master",
    "gadgets",
    "Master of the workshop",
    "Upgrade every gadget to Pro.",
    (s) => Object.keys(TOOLS).every((id) => s.tools?.[id] === 2),
    Object.keys(TOOLS).map((id) => `pro-${id}`),
  ),
  ...Object.entries(TRANSPORT).flatMap(([id, vehicle]) => [
    flag(`vehicle-${id}`, "fleet", vehicle.name, vehicle.effect, (s) =>
      s.vehicles?.includes(id),
    ),
    flag(
      `use-${id}`,
      "fleet",
      `${vehicle.name} · In motion`,
      "Put this vehicle to work at least once.",
      (s) => s.transportUsage?.[id] > 0,
      [`vehicle-${id}`],
    ),
  ]),
  flag(
    "van-upgrade",
    "fleet",
    "A better drivetrain",
    "Upgrade the van for speed and battery efficiency.",
    (s) => s.vanUpgrade,
    ["vehicle-van"],
  ),
  flag(
    "fleet-master",
    "fleet",
    "Every road, sea, and sky",
    "Own and use every vehicle.",
    (s) =>
      Object.keys(TRANSPORT).every(
        (id) => s.vehicles?.includes(id) && s.transportUsage?.[id] > 0,
      ),
    Object.keys(TRANSPORT).map((id) => `use-${id}`),
  ),
  ...[1, 2, 3].flatMap((n) => [
    milestone(
      `hire-${n}`,
      "team",
      ["Your first teammate", "Strength in numbers", "The whole crew"][n - 1],
      `Hire ${n} teammate${n > 1 ? "s" : ""}.`,
      n,
      (s) => s.crew?.length || 0,
      n > 1 ? [`hire-${n - 1}`] : [],
    ),
    flag(
      `equip-${n}`,
      "team",
      `Teammate ${n} · Ready to roll`,
      "Give this teammate their own vehicle.",
      (s) => s.crew?.[n - 1]?.vehicles?.length,
      [`hire-${n}`],
    ),
  ]),
  flag(
    "team-ready",
    "team",
    "A team you can count on",
    "Have three equipped teammates with no unpaid wages.",
    (s) =>
      s.crew?.length >= 3 &&
      s.crew.every((c) => c.vehicles?.length && !c.wageArrears),
    ["equip-1", "equip-2", "equip-3"],
  ),
  flag(
    "office",
    "business",
    "Out of the garage",
    "Finish the first pickle office.",
    (s) => s.office?.stage === "complete",
  ),
  flag(
    "factory",
    "business",
    "Made on the islands",
    "Complete factory construction.",
    (s) => s.construction?.stage === "complete",
  ),
  ...ladder(
    "business",
    "production",
    [1, 24, 100, 500],
    [
      "Our very first batch",
      "Production proven",
      "Factory momentum",
      "Pickle powerhouse",
    ],
    "cases produced",
    (s) => s.production?.produced || 0,
  ),
  flag(
    "expansion",
    "business",
    "Room to grow",
    "Expand the factory production line.",
    (s) => s.production?.expanded,
    ["factory"],
  ),
  ...Object.entries(ISLANDS).map(([id, island]) =>
    flag(
      `outpost-${id}`,
      "islands",
      `${island.name} outpost`,
      `Establish an outpost on ${island.name}.`,
      (s) => s.outposts?.[id],
    ),
  ),
  ...ladder(
    "retirement",
    "savings",
    [250, 750, 1500, 2500],
    [
      "A little breathing room",
      "A future taking shape",
      "More than halfway home",
      "The retirement fund",
    ],
    "coins held at once",
    (s) => s.money || 0,
  ),
  flag(
    "retirement-ready",
    "retirement",
    "The freedom to stop",
    "Meet every retirement requirement at the same time.",
    (s) => retirementRequirements(s).every((r) => r.complete),
  ),
  flag(
    "retired",
    "retirement",
    "Home, at last",
    "Retire with Brandon and the whole team safely home.",
    (s) => s.retirement?.retiredAt != null,
    ["retirement-ready"],
  ),
];
export const ACHIEVEMENT_BY_ID = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export function updateAchievements(s, { backfill = false } = {}) {
  s.achievements ||= { version: 1, unlocked: {} };
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.unlocked[a.id]) continue;
    if (
      a.requires.every((id) => s.achievements.unlocked[id]) &&
      a.value(s) >= a.target
    )
      s.achievements.unlocked[a.id] = { tick: s.tick, backfilled: backfill };
  }
  return s.achievements;
}

export function achievementProgress(a, s) {
  const earned = s.achievements?.unlocked?.[a.id];
  const value = Math.min(a.target, Math.max(0, a.value(s)));
  const blockedBy = a.requires.filter((id) => !s.achievements?.unlocked?.[id]);
  return { earned, value, ratio: earned ? 1 : value / a.target, blockedBy };
}

// Collection trophies reveal paths, but only this run's trophies satisfy engine prerequisites.
export function achievementDiscovery(a, s) {
  const p = achievementProgress(a, s);
  const collected = s.achievementCollection?.unlocked?.[a.id] || p.earned;
  const known = {
    ...s.achievementCollection?.unlocked,
    ...s.achievements?.unlocked,
  };
  const hidden =
    !collected && a.requires.length > 0 && !a.requires.every((id) => known[id]);
  const availableSeed =
    a.seedClass == null || Math.abs(s.seed) % 3 === a.seedClass;
  return { ...p, collected, hidden, availableSeed };
}

export function achievementLayout(branch) {
  const nodes = ACHIEVEMENTS.filter((a) => a.branch === branch);
  const depths = {};
  const rows = {};
  const placed = nodes.map((a) => {
    const parents = a.requires.filter((id) => depths[id] != null);
    const depth = parents.length
      ? Math.max(...parents.map((id) => depths[id])) + 1
      : 0;
    depths[a.id] = depth;
    const row = rows[depth] || 0;
    rows[depth] = row + 1;
    return { ...a, x: 24 + depth * 220, y: 24 + row * 120 };
  });
  return {
    nodes: placed,
    width: 48 + (Math.max(...Object.values(depths)) + 1) * 220,
    height: 48 + Math.max(...Object.values(rows)) * 120,
  };
}
