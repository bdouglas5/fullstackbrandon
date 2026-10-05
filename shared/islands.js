export const HOME_GARAGE = Object.freeze({
  position: [8.7, -5.4],
  door: [8.7, -4.35],
  inside: [8.7, -4.95],
});
export const CHARGING_STATION_POSITION = Object.freeze([12.4, -5.3]);

// Shared scene and navigation coordinates keep all docks and storefronts aligned.
// The cargo pickup stays on the pier; the sailboat rests in open water beyond it.
export const HARBOR_BERTH = Object.freeze([-4, 17]);
// The lighthouse stands on a rocky islet off the harbor's west quay. `lampY`
// is the lamp's height above the sea, shared by the tower and its night beam.
export const LIGHTHOUSE = Object.freeze({ x: -12.8, z: 16.4, lampY: 4.7 });
export const MAIN_ISLAND = { x: 4, z: 0, width: 32, depth: 24, radius: 6 };
export const FARM = {
  id: "farm",
  name: "Pickle Cay",
  x: 4,
  z: 25,
  dock: [4, 21.1],
  landing: [5.6, 23.2],
};
export const REEF = {
  id: "reef",
  name: "Reef Island",
  x: 23,
  z: 32,
  dock: [23, 35.8],
  landing: [24.6, 33.9],
};
export const HOME_BUSINESSES = {
  maya: {
    node: "deli",
    position: [-8, -3.4],
    building: [-8, -5.55],
    facing: 0,
    sign: "GREENHOUSE DELI",
    color: "#709b7c",
  },
  theo: {
    node: "burger",
    position: [-8, 5.8],
    building: [-8, 7.95],
    facing: Math.PI,
    sign: "HARBOR BURGER",
    color: "#d98b66",
  },
  jun: {
    node: "sandwich",
    position: [4, -8],
    building: [4, -10.15],
    facing: 0,
    sign: "SANDWICH CLUB",
    color: "#619b93",
  },
  cleo: {
    node: "bagels",
    position: [7, 6.8],
    building: [7, 8.95],
    facing: Math.PI,
    sign: "CLEO'S BAGELS",
    color: "#cf8b9b",
  },
  pip: {
    node: "bakery",
    position: [-6, -8],
    building: [-6, -10.15],
    facing: 0,
    sign: "MORNING CRUMB",
    color: "#d3ac6b",
  },
  bea: {
    node: "florist",
    position: [14, 2],
    building: [16.15, 2],
    facing: -Math.PI / 2,
    sign: "CORNER FLOWERS",
    color: "#a48dae",
  },
  sol: {
    node: "pantry",
    position: [14, 6.8],
    building: [14, 8.95],
    facing: Math.PI,
    sign: "EASTBANK PANTRY",
    color: "#839d62",
  },
  wynn: {
    node: "inn",
    position: [14, -8],
    building: [14, -10.15],
    facing: 0,
    sign: "LANTERN HOUSE",
    color: "#739cb0",
  },
};

// Door coordinates are transformed from the same shop-local model used by world.js.
export function businessEntrance(business) {
  const point = (x, z) => [
    business.building[0] +
      x * Math.cos(business.facing) +
      z * Math.sin(business.facing),
    business.building[1] -
      x * Math.sin(business.facing) +
      z * Math.cos(business.facing),
  ];
  return { door: point(0.58, 1.02), inside: point(0.58, 0.3) };
}

export const ISLANDS = {
  juniper: {
    name: "Juniper Quay",
    business: "Fishing-port delis",
    x: -23,
    z: -21,
    color: "#829eb1",
    price: 45,
    reward: 7,
    description: "Briny lunch counters and hungry fishing crews.",
  },
  ridge: {
    name: "Dill Ridge",
    business: "Mountain provisions",
    x: 4,
    z: -28,
    color: "#829764",
    price: 55,
    reward: 8,
    description: "Trail shops with a taste for premium garlic dill.",
  },
  copper: {
    name: "Copperport",
    business: "City burger restaurants",
    x: 34,
    z: -15,
    color: "#c6906a",
    price: 65,
    reward: 9,
    description: "A busy waterfront district buying wholesale burger chips.",
  },
  festival: {
    name: "Festival Key",
    business: "Food-truck collective",
    x: 35,
    z: 17,
    color: "#cb9cae",
    price: 60,
    reward: 8,
    description: "Concert crowds, relish barrels, and big seasonal orders.",
  },
  sunset: {
    name: "Sunset Bay",
    business: "Resort restaurant group",
    x: -22,
    z: 26,
    color: "#baa77c",
    price: 75,
    reward: 10,
    description: "Premium resort kitchens on a quiet tropical island.",
  },
};

const BIOMES = {
  juniper: "fishing",
  ridge: "alpine",
  copper: "industrial",
  festival: "festival",
  sunset: "tropical",
};
for (const [id, island] of Object.entries(ISLANDS)) {
  island.id = id;
  island.biome = BIOMES[id];
  island.dock = [island.x, island.z + 4.8];
  island.landing = [island.x + 2, island.z + 1.3];
}
