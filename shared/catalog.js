import { ISLANDS, REEF, HOME_BUSINESSES } from "./islands.js";

// Every catalog entry has an engine effect; descriptions are also sent to Jev.
export const TOOLS = {
  repair_kit: {
    name: "Jar-crate repair kit",
    scrap: 3,
    price: 12,
    effect: "Patch tires in 2 ticks (Pro: 1), instead of 5.",
  },
  cargo_rack: {
    name: "Wholesale crate rack",
    scrap: 5,
    price: 24,
    effect:
      "Add 3 cargo slots (Pro: 5) to the current vehicle. Jetpacks remain limited to 2 cases.",
  },
  cooler: {
    name: "Cold-brine cooler",
    scrap: 4,
    price: 18,
    effect:
      "Prevent packing room spoilage. Pro also earns one extra coin per business order.",
  },
  rain_gear: {
    name: "Waterproof jar wrap",
    scrap: 3,
    price: 14,
    effect: "Road speed in storms becomes 85% (Pro: 100%), instead of 60%.",
  },
  solar_panel: {
    name: "Solar brine charger",
    scrap: 5,
    price: 22,
    effect: "Recover 0.3 battery per clear, stationary tick (Pro: 0.6).",
  },
  cargo_dolly: {
    name: "Barrel dolly",
    scrap: 3,
    price: 12,
    effect: "Load supplies in 1 tick. Pro adds one cargo slot.",
  },
  navigation: {
    name: "Wholesale route planner",
    scrap: 4,
    price: 20,
    effect: "Increase road speed by 15% (Pro: 30%).",
  },
  scanner: {
    name: "Batch-label printer",
    scrap: 4,
    price: 18,
    effect: "Earn 4 extra coins per island order (Pro: 8).",
  },
  generator: {
    name: "Brine-room generator",
    scrap: 6,
    price: 28,
    effect:
      "Keep fermentation and packing running at half speed during a blackout (Pro: full speed).",
  },
  winch: {
    name: "Cold-chain cargo winch",
    scrap: 6,
    price: 30,
    effect: "Allow helicopter crossings in storms at half speed (Pro: 75%).",
  },
  spill_kit: {
    name: "Absorbent spill kit",
    scrap: 3,
    price: 12,
    effect:
      "Brandon stops short of oil on the road and scrubs it away in 8 ticks (Pro: 4) instead of slipping.",
  },
};
export const PEOPLE = [
  {
    name: "Maya",
    role: "Greenhouse Deli",
    order: "Cold-fermented dill",
    color: "#e58f70",
    patience: 45,
    tip: 4,
    requires: "cooler",
    detail: "Keeps live-culture jars chilled. Requires a cold-brine cooler.",
  },
  {
    name: "Theo",
    role: "Harbor Burger Co.",
    order: "Classic burger chips",
    color: "#e5bc64",
    patience: 65,
    tip: 2,
    detail: "A lunch service built around the perfect crunch.",
  },
  {
    name: "Jun",
    role: "Garage Sandwich Club",
    order: "Spicy sandwich spears",
    color: "#5f9b91",
    patience: 45,
    tip: 3,
    detail: "Small deli. Big lunch rush. Always orders extra heat.",
  },
  {
    name: "Amara",
    role: "Sunday Farmers Market",
    order: "Mixed tasting jars",
    color: "#a79bbb",
    patience: 80,
    tip: 2,
    detail: "Tasting flights for curious shoppers. No hurry today.",
  },
  {
    name: "Otis",
    role: "The Ferry Galley",
    order: "Bread-and-butter chips",
    color: "#617d9c",
    patience: 30,
    tip: 4,
    detail: "Restocking before the next passenger crossing.",
  },
  {
    name: "Cleo",
    role: "Cleo’s Bagel House",
    order: "Garlic dill spears",
    color: "#d88b9d",
    patience: 55,
    tip: 3,
    detail: "Every bagel box leaves with one signature spear.",
  },
  {
    name: "Ravi",
    role: "Island Grocery",
    order: "Retail-ready dill jars",
    color: "#7da060",
    patience: 70,
    tip: 4,
    requires: "scanner",
    detail: "Needs traceable batch labels for the store shelves.",
  },
  {
    name: "Nell",
    role: "The Reef Resort",
    order: "Chilled tasting selection",
    color: "#659fba",
    patience: 40,
    tip: 4,
    requires: "cooler",
    detail: "A premium cold-chain order for the resort menu.",
  },
  {
    name: "Hugo",
    role: "Hugo’s Hot Dogs",
    order: "Sweet relish jars",
    color: "#b57c55",
    patience: 50,
    tip: 3,
    detail: "The boardwalk crowd is already lining up.",
  },
  {
    name: "Iris",
    role: "Backstage Catering",
    order: "Low-salt dill chips",
    color: "#b4a061",
    patience: 75,
    tip: 2,
    detail: "A wholesale order for tonight’s island concert.",
  },
  {
    name: "Tess",
    role: "Reef Island Beach Club",
    order: "Wholesale party barrels",
    color: "#6d9f9c",
    patience: 45,
    tip: 3,
    detail: "Her beach club needs a special island delivery.",
  },
  {
    name: "Leo",
    role: "Trailhead Provisions",
    order: "Trail-size pickle pouches",
    color: "#799261",
    patience: 60,
    tip: 2,
    detail: "Portable crunch for everyone exploring the island.",
  },
  {
    name: "Pip",
    role: "Morning Crumb Bakery",
    order: "Sandwich pickle chips",
    color: "#d3ac6b",
    patience: 65,
    tip: 2,
    detail: "Fresh bread and crisp pickles for the morning sandwich counter.",
  },
  {
    name: "Bea",
    role: "Corner Flower Shop",
    order: "Deli picnic jars",
    color: "#a48dae",
    patience: 75,
    tip: 3,
    detail: "Picnic hampers pair local flowers with jars from Brine & Co.",
  },
  {
    name: "Sol",
    role: "Eastbank Pantry",
    order: "Family-size dill jars",
    color: "#839d62",
    patience: 70,
    tip: 2,
    detail: "A neighborhood grocer keeping the pickle shelves full.",
  },
  {
    name: "Wynn",
    role: "Lantern House Inn",
    order: "Guest supper selection",
    color: "#739cb0",
    patience: 80,
    tip: 4,
    detail: "The inn kitchen serves a pickle plate with every guest supper.",
  },
];
export function capacity(s) {
  const base = TRANSPORT[s.vehicle]?.capacity || 3;
  return (
    base +
    (s.tools?.cargo_rack ? (s.tools.cargo_rack === 2 ? 5 : 3) : 0) +
    (s.tools?.cargo_dolly === 2 ? 1 : 0)
  );
}

// Ordered investment ladder. Vehicles are acquired with earned coins, never pre-owned.
export const TRANSPORT = {
  bike: {
    name: "Cargo bicycle",
    price: 24,
    speed: 0.95,
    capacity: 3,
    effect:
      "Quiet, battery-free road deliveries. The first step beyond walking.",
  },
  van: {
    name: "Electric delivery van",
    price: 70,
    speed: 1.4,
    capacity: 5,
    effect: "Five-case road runs; rechargeable battery and repairable tires.",
  },
  rocket_skates: {
    name: "Rocket skates",
    price: 105,
    speed: 1.8,
    capacity: 3,
    prerequisite: "van",
    effect:
      "A compact road upgrade after the van. Three-case battery-powered express runs.",
  },
  sailboat: {
    name: "Wholesale sailboat",
    price: 110,
    speed: 1.05,
    capacity: 8,
    effect:
      "Opens all island customers with eight-case, battery-free sea crossings.",
  },
  helicopter: {
    name: "Cargo helicopter",
    price: 220,
    speed: 2.5,
    capacity: 6,
    effect:
      "Fast six-case island flights. Storm operations require the cargo winch.",
  },
  jetpack: {
    name: "Brine-powered jetpack",
    price: 340,
    speed: 3.5,
    capacity: 2,
    effect:
      "Express two-case island deliveries, with clear-weather flight and battery use.",
  },
  teleporter: {
    name: "Quantum pickle portal",
    price: 600,
    speed: 12,
    capacity: 9,
    effect:
      "Instant ocean crossings between landing pads; cargo handoffs still take place on foot.",
  },
};
const home = (id) => [
  id,
  "home",
  HOME_BUSINESSES[id].node,
  HOME_BUSINESSES[id].position,
];
const away = (id, island, dx = 0, dz = 1.4) => [
  id,
  island,
  null,
  [ISLANDS[island].x + dx, ISLANDS[island].z + dz],
];
const customerLocations = [
  home("maya"),
  home("theo"),
  home("jun"),
  away("amara", "juniper", -1.15),
  away("otis", "juniper", 1.15),
  home("cleo"),
  away("ravi", "copper"),
  away("nell", "sunset"),
  away("hugo", "festival", -1.15),
  away("iris", "festival", 1.15),
  ["tess", "reef", null, [REEF.x, REEF.z + 1.9]],
  away("leo", "ridge"),
  home("pip"),
  home("bea"),
  home("sol"),
  home("wynn"),
];
PEOPLE.forEach((person, index) => {
  const [id, island, node, position] = customerLocations[index];
  Object.assign(person, {
    id,
    island,
    node,
    position,
    reviewEvery: 3,
    patience: island === "home" ? person.patience + 60 : person.patience + 180,
  });
});
