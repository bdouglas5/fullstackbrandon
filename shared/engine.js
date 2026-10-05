import { SHORELINE } from "./shoreline.js";
import {
  ordersOpen,
  brandonResting,
  clockOut,
  shiftEnded,
  updateShift,
  canClockOut,
  unfinishedDeliveries,
  nextShiftTick,
} from "./business-hours.js";
import { combatCommand, combatStep, normalizeCombat } from "./combat.js";
import {
  normalizeHazards,
  creatureStep,
  voyageHold,
  slipHold,
  slipCheck,
  spillStep,
  cleanupStep,
  placeSpill,
  payToll,
  setCreature,
} from "./hazards.js";
import { updateAchievements, retirementRequirements } from "./achievements.js";
import {
  weekendPolicy,
  workweekEfficiency,
  startVacation,
  arriveVacation,
  completeVacation,
  VACATION_POLICY,
} from "./workweek.js";
import { deliveryRating, reviewText } from "./reviews.js";
import {
  ISLANDS,
  FARM,
  REEF,
  HOME_BUSINESSES,
  HOME_GARAGE,
  businessEntrance,
  HARBOR_BERTH,
} from "./islands.js";
export { ISLANDS };
import { TOOLS, PEOPLE, capacity, TRANSPORT } from "./catalog.js";
export { TOOLS, PEOPLE, capacity, TRANSPORT };
import {
  ECONOMY,
  CONSTRUCTION_STAGES,
  LABOR_POLICY,
  normalizeRealism,
  originNode,
  businessStep,
  laborAvailable,
  planShipment,
} from "./realism.js";
export { ECONOMY, CONSTRUCTION_STAGES, LABOR_POLICY, normalizeRealism };
import { learnedAction, recordExperience } from "./learning.js";
import {
  constrainRoadMotion,
  resolveTrafficPositions,
  roadEntryAllowed,
  serviceBay,
  yieldAtJunction,
} from "./traffic.js";
export const VERSION = "4.0.0";
export const NODES = {
  harbor: [-4, 2],
  west: [-1.5, 2],
  east: [1.5, 2],
  cafe: [4, 2],
  nw: [-1.5, -3.4],
  ne: [1.5, -3.4],
  workshop: [4, -3.4],
  home: [7, -3.4],
  garden: [-4, -3.4],
  market: [10, 2],
  charge: [10, -3.4],
  harbor_dock: [-4, 14],
  farm_port: [4, 21.1],
  farm_shop: [4, 24.2],
  helipad: [14.5, -3.4],
  west_quay: [-8, 2],
  north_garden: [-4, -8],
  uptown: [10, -8],
  south_turn: [10, 6.8],
  ...Object.fromEntries(
    Object.values(HOME_BUSINESSES).map((business) => [
      business.node,
      [...business.position],
    ]),
  ),
};
export const EDGES = [
  ["harbor", "west"],
  ["west", "east", "bridge"],
  ["east", "cafe"],
  ["west", "nw"],
  ["nw", "ne"],
  ["ne", "east"],
  ["ne", "workshop"],
  ["nw", "garden"],
  ["garden", "harbor"],
  ["cafe", "market", "traffic"],
  ["market", "charge"],
  ["charge", "workshop"],
  ["workshop", "home"],
  ["home", "charge"],
  ["harbor", "harbor_dock"],
  ["harbor_dock", "farm_port", "causeway"],
  ["farm_port", "farm_shop"],
  ["charge", "helipad"],
  ["garden", "deli"],
  ["deli", "west_quay"],
  ["harbor", "west_quay"],
  ["west_quay", "burger"],
  ["garden", "north_garden"],
  ["north_garden", "bakery"],
  ["north_garden", "sandwich"],
  ["sandwich", "uptown"],
  ["uptown", "inn"],
  ["charge", "uptown"],
  ["market", "south_turn"],
  ["south_turn", "bagels"],
  ["south_turn", "pantry"],
  ["market", "florist"],
  ["florist", "pantry"],
];
export const ACTIONS = {
  sail: {
    label: "Sail to Pickle Cay",
    target: "harbor",
    verb: "Sailing for island pickle cases",
    icon: "ship",
  },
  market: {
    label: "Collect market pickle stock",
    target: "market",
    verb: "Finding fresh stock at the market",
    icon: "package",
  },
  charge: {
    label: "Charge the van",
    target: "charge",
    verb: "Topping up at the charging station",
    icon: "zap",
  },
  patch: {
    label: "Patch the tire",
    target: null,
    verb: "Fixing a puncture at the roadside",
    icon: "wrench",
  },
  restore: {
    label: "Restore packing room power",
    target: "workshop",
    verb: "Resetting the packing room power relay",
    icon: "zap",
  },
  collect: {
    label: "Collect pickle cases",
    target: "harbor",
    verb: "Picking up fresh pickle cases",
    icon: "package",
  },
  deliver: {
    label: "Dispatch wholesale pickles",
    target: "cafe",
    verb: "Making a packing room delivery",
    icon: "coffee",
  },
  repair: {
    label: "Repair the bridge",
    target: "workshop",
    verb: "Building a bridge repair kit",
    icon: "wrench",
  },
  wait: {
    label: "Take a breather",
    target: null,
    verb: "Taking a moment to plan",
    icon: "clock",
  },
};
for (const [id, tool] of Object.entries(TOOLS)) {
  for (const [prefix, verb] of [
    ["craft", "Craft"],
    ["buy", "Buy"],
    ["upgrade", "Upgrade"],
  ])
    ACTIONS[`${prefix}_${id}`] = {
      label: `${verb} ${tool.name.toLowerCase()}`,
      target: "workshop",
      verb: `${verb === "Craft" ? "Crafting" : verb === "Buy" ? "Buying" : "Upgrading"} a ${tool.name.toLowerCase()}`,
      icon: "wrench",
    };
}
Object.assign(ACTIONS, {
  salvage: {
    label: "Collect shoreline plastic",
    target: "garden",
    verb: "Cleaning up shoreline plastic",
    icon: "package",
  },
  buy_bike: {
    label: "Buy a bicycle",
    target: "workshop",
    verb: "Buying a bicycle",
    icon: "bike",
  },
  buy_helicopter: {
    label: "Buy a helicopter",
    target: "workshop",
    verb: "Buying a helicopter",
    icon: "plane",
  },
  ride_bike: {
    label: "Switch to bicycle",
    target: null,
    verb: "Unfolding the cargo bicycle",
    icon: "bike",
  },
  drive_van: {
    label: "Switch to van",
    target: null,
    verb: "Returning to the electric van",
    icon: "truck",
  },
  upgrade_van: {
    label: "Upgrade the van",
    target: "workshop",
    verb: "Fitting a better electric drivetrain",
    icon: "wrench",
  },
  fly: {
    label: "Fly to Pickle Cay",
    target: "workshop",
    verb: "Flying to collect farm pickle cases",
    icon: "plane",
  },
  pick_parcel: {
    label: "Pick up the reef parcel",
    target: "market",
    verb: "Collecting Tess’s pickle barrel order",
    icon: "package",
  },
  ship_parcel: {
    label: "Sail the parcel to Reef Island",
    target: "harbor",
    verb: "Sailing a parcel to Reef Island",
    icon: "ship",
  },
  fly_parcel: {
    label: "Fly the parcel to Reef Island",
    target: "workshop",
    verb: "Flying a parcel to Reef Island",
    icon: "plane",
  },
});
for (const [id, island] of Object.entries(ISLANDS)) {
  ACTIONS[`expand_${id}`] = {
    label: `Open ${island.name} outpost`,
    target: "workshop",
    verb: `Setting up a ${island.name} wholesale outpost`,
    icon: "store",
  };
  ACTIONS[`supply_${id}`] = {
    label: `Sail stock to ${island.name}`,
    target: "harbor",
    verb: `Sailing wholesale stock to ${island.name}`,
    icon: "ship",
  };
  ACTIONS[`air_${id}`] = {
    label: `Fly stock to ${island.name}`,
    target: "workshop",
    verb: `Flying wholesale stock to ${island.name}`,
    icon: "plane",
  };
}
export function clone(s) {
  return structuredClone(s);
}
export function route(from, to, closed = false, traffic = false) {
  const dist = Object.fromEntries(Object.keys(NODES).map((k) => [k, Infinity]));
  dist[from] = 0;
  const prev = {},
    todo = new Set(Object.keys(NODES));
  while (todo.size) {
    const u = [...todo].sort((a, b) => dist[a] - dist[b])[0];
    todo.delete(u);
    if (u === to) break;
    for (const [a, b, kind] of EDGES) {
      if ((kind === "bridge" && closed) || (kind === "traffic" && traffic))
        continue;
      const v = a === u ? b : b === u ? a : null;
      if (!v || !todo.has(v)) continue;
      const d =
        dist[u] +
        Math.hypot(NODES[u][0] - NODES[v][0], NODES[u][1] - NODES[v][1]);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (!Number.isFinite(dist[to])) return [];
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

const CREW_NAMES = ["Alex", "Sam", "Morgan"];
export const RETIREMENT_TARGET = 2500;
export const DAY_TICKS = 1440;
for (const [id, vehicle] of Object.entries(TRANSPORT)) {
  ACTIONS[`buy_${id}`] = {
    label: `Buy ${vehicle.name.toLowerCase()}`,
    target: "workshop",
    verb: `Buying ${vehicle.name.toLowerCase()}`,
    icon:
      id === "bike"
        ? "bike"
        : id === "van"
          ? "truck"
          : id === "sailboat"
            ? "ship"
            : "plane",
  };
}
Object.assign(ACTIONS, {
  vacation_resort: {
    label: "Take a paid resort vacation",
    target: "harbor_dock",
    verb: "Traveling to Sunset Bay Resort for real time off",
    icon: "ship",
  },
  build_office: {
    label: "Build the pickle office",
    target: "home",
    verb: "Hiring builders for the first pickle office",
    icon: "store",
  },
  negotiate_island: {
    label: "Negotiate the Pickle Cay development deal",
    target: "harbor_dock",
    verb: "Visiting Cay Development Co. on Copperport",
    icon: "store",
  },
  order_import: {
    label: "Order paid pickle shipment",
    target: "cafe",
    verb: "Ordering imported pickle cases",
    icon: "ship",
  },
  pickup_shipment: {
    label: "Collect port shipment",
    target: "harbor_dock",
    verb: "Loading the paid shipment at the port",
    icon: "package",
  },
  unload_shipment: {
    label: "Unload shipment at the shop",
    target: "cafe",
    verb: "Receiving the shipment at the shop",
    icon: "package",
  },
  buy_island: {
    label: "Purchase Pickle Cay",
    target: "workshop",
    verb: "Purchasing a site for the pickle factory",
    icon: "store",
  },
  hire_contractor: {
    label: "Hire island contractor",
    target: "workshop",
    verb: "Commissioning the island, factory and greenhouse",
    icon: "wrench",
  },
  buy_resources: {
    label: "Order growing and packing supplies",
    target: "cafe",
    verb: "Buying seed, brine and jar kits by shipment",
    icon: "package",
  },
  plant_crop: {
    label: "Plant and process a pickle batch",
    target: "farm_shop",
    verb: "Planting cucumbers in the garden and greenhouse",
    icon: "package",
  },
  expand_factory: {
    label: "Expand the pickle factory",
    target: "farm_shop",
    verb: "Expanding greenhouse beds and fermentation tanks",
    icon: "store",
  },
  rest: {
    label: "Go home and rest",
    target: "home",
    verb: "Resting after the ten-hour shift",
    icon: "clock",
  },
  use_rocket_skates: {
    label: "Put on rocket skates",
    target: "workshop",
    verb: "Securing rocket skates and safety gear",
    icon: "zap",
  },
  hire_employee: {
    label: "Hire a delivery teammate",
    target: "cafe",
    verb: "Training a new delivery teammate",
    icon: "users",
  },
  walk: {
    label: "Switch to walking",
    target: null,
    verb: "Unpacking the walking delivery bag",
    icon: "person",
  },
  use_jetpack: {
    label: "Prioritize the jetpack",
    target: null,
    verb: "Planning express jetpack routes",
    icon: "plane",
  },
  use_sailboat: {
    label: "Prioritize the sailboat",
    target: null,
    verb: "Planning sailboat routes",
    icon: "ship",
  },
  use_helicopter: {
    label: "Prioritize the helicopter",
    target: null,
    verb: "Planning helicopter routes",
    icon: "plane",
  },
  use_teleporter: {
    label: "Prioritize the teleporter",
    target: null,
    verb: "Planning portal routes",
    icon: "plane",
  },
  auto_transport: {
    label: "Choose transport automatically",
    target: null,
    verb: "Choosing the best transport for each route",
    icon: "plane",
  },
});
for (let i = 1; i <= 3; i++)
  for (const [id, transport] of Object.entries(TRANSPORT))
    ACTIONS[`buy_crew-${i}_${id}`] = {
      label: `Buy ${transport.name.toLowerCase()} for ${CREW_NAMES[i - 1]}`,
      target: "workshop",
      verb: "Purchasing a dedicated employee vehicle",
      icon: "truck",
    };
for (const person of PEOPLE)
  ACTIONS[`serve_${person.id}`] = {
    label: `Deliver to ${person.name} · ${person.role}`,
    target: person.node,
    verb: `Delivering ${person.order.toLowerCase()} to ${person.name}`,
    icon: "package",
  };
for (const action of [
  "sail",
  "ship_parcel",
  ...Object.keys(ISLANDS).map((id) => `supply_${id}`),
])
  ACTIONS[action].target = "harbor_dock";
for (const action of [
  "fly",
  "fly_parcel",
  ...Object.keys(ISLANDS).map((id) => `air_${id}`),
])
  ACTIONS[action].target = "helipad";

export function worldTime(tick, seed = 0, stormOverride = null) {
  const hour = (8 + (tick / DAY_TICKS) * 24) % 24;
  const day = 1 + Math.floor((tick + DAY_TICKS / 3) / DAY_TICKS);
  const phase =
    hour >= 7 && hour < 18
      ? "day"
      : hour >= 18 && hour < 20
        ? "dusk"
        : hour >= 5 && hour < 7
          ? "dawn"
          : "night";
  // Hash each front independently: reproducible saves, without a repeating
  // weather list or a forced change at sunrise/sunset. Fronts last 60–180 ticks.
  const block = Math.floor(tick / 1440);
  const random = (front, salt) => {
    let n =
      (seed ^
        Math.imul(block + 1, 0x9e3779b9) ^
        Math.imul(front + 1, 0x85ebca6b) ^
        salt) >>>
      0;
    n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
    n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  let front = 0,
    end = 0;
  const offset = tick - block * 1440;
  while (end <= offset) end += 60 + Math.floor(random(front++, 123) * 121);
  const chance = random(front, 456);
  let weather =
    chance < 0.35
      ? "clear"
      : chance < 0.5
        ? "cloudy"
        : chance < 0.75
          ? "rain"
          : chance < 0.9
            ? "fog"
            : "storm";
  if (stormOverride !== null) weather = stormOverride ? "storm" : "clear";
  const light =
    phase === "night"
      ? 0.13
      : phase === "dawn"
        ? 0.13 + ((hour - 5) / 2) * 0.87
        : phase === "dusk"
          ? 1 - ((hour - 18) / 2) * 0.87
          : 1;
  return { day, hour, phase, weather, light };
}
function updateWorldTime(s) {
  normalizeWeather(s);
  s.world = worldTime(s.tick, s.seed, s.stormOverride);
  if (s.environment.weatherUntil > s.tick)
    s.world.weather = s.environment.weatherOverride;
  else {
    s.environment.weatherOverride = null;
    s.environment.weatherUntil = 0;
  }
  s.storm = s.world.weather === "storm";
}

export function normalizeWeather(s) {
  const old = s.environment || {};
  const valid = ["clear", "cloudy", "rain", "fog", "storm"].includes(
    old.weatherOverride,
  );
  s.environment = {
    weatherEnabled: true,
    weatherOverride: valid
      ? old.weatherOverride
      : old.weatherEnabled === false
        ? "clear"
        : null,
    weatherUntil:
      valid && Number.isFinite(old.weatherUntil)
        ? old.weatherUntil
        : old.weatherEnabled === false
          ? s.tick + 180
          : 0,
    soundEnabled: old.soundEnabled === true,
  };
  if (typeof old.weatherEnabled !== "boolean") s.stormOverride = null;
}

function actor(id, name, color, efficiency = 1) {
  return {
    id,
    name,
    color,
    efficiency,
    node: "cafe",
    position: [...NODES.cafe],
    move: null,
    voyage: null,
    action: null,
    work: 0,
    carry: 0,
    deliveries: 0,
    earned: 0,
    vehicle: "foot",
    orderId: null,
  };
}
export function fresh(seed = 42, controller = "rules") {
  const s = {
    version: VERSION,
    seed,
    controller,
    tick: 0,
    limit: 25000,
    target: 1000,
    mode: "career",
    status: "ready",
    speed: 1,
    objective: "speed",
    bridgeClosed: false,
    market: 0,
    orchard: 0,
    harbor: 6,
    cafe: 0,
    initial: 6,
    generated: 0,
    voyages: 0,
    outposts: {},
    money: 0,
    startingMoney: 12,
    earned: 0,
    spent: 12,
    wages: 0,
    grants: 0,
    scrap: 0,
    salvageStock: 24,
    tools: {},
    vehicles: [],
    vehicle: "foot",
    preferredTransport: null,
    preferredRoadTransport: null,
    parkedVan: null,
    vanUpgrade: false,
    request: null,
    dispatchGoal: null,
    dispatch: [],
    parcel: null,
    parcelsDelivered: 0,
    customerQueue: [],
    customerHistory: [],
    orderSchemaVersion: 2,
    layoutVersion: 3,
    orderSequence: 0,
    casesDelivered: 0,
    customerStats: {},
    discoveredBusinesses: [],
    reviews: [],
    rating: { average: 0, count: 0, total: 0 },
    battery: 100,
    flatTire: false,
    powerOut: false,
    environment: {
      weatherEnabled: true,
      soundEnabled: false,
      weatherOverride: null,
      weatherUntil: 0,
    },
    storm: false,
    stormOverride: null,
    stormOverrideUntil: 0,
    traffic: false,
    charges: 0,
    tireRepairs: 0,
    carry: 0,
    parts: 4,
    served: 0,
    queue: [],
    arrivals: 0,
    waste: 0,
    lost: 0,
    waitTotal: 0,
    travel: 0,
    idle: 0,
    stockoutTicks: 0,
    repairs: 0,
    disruptions: [],
    events: [],
    decisions: [],
    decisionCount: 0,
    crew: [],
    transportUsage: {},
    milestones: [],
    world: worldTime(0, seed),
    retirement: { target: RETIREMENT_TARGET, ready: false, retiredAt: null },
    brandon: actor("brandon", "Brandon", "#7ca79b"),
    message:
      "One founder, zero coins. Press play and watch a pickle empire grow.",
    calls: 0,
    fallbacks: 0,
    inputTokens: 0,
  };
  normalizeRealism(s);
  s.operations.shipments.push({
    id: "founder-shipment",
    kind: "pickles",
    cases: 6,
    remaining: 6,
    cost: 12,
    orderedAt: -45,
    departsAt: -45,
    arrivesAt: 0,
    arrivalDay: 1,
    arrivalHour: 8,
    status: "port",
    portNode: "harbor_dock",
    reason: "Prepaid founder stock delivered for opening day",
  });
  s.brandon.node = "home";
  s.brandon.position = [...NODES.home];
  addCustomers(s, 2);
  normalizeCombat(s);
  updateAchievements(s);
  return s;
}
export function event(s, type, text) {
  s.events.push({ tick: s.tick, type, text });
  s.events = s.events.slice(-80);
  s.message = text;
}
function addCustomers(s, count, island = null) {
  for (let i = 0; i < count; i++) {
    const accessible = PEOPLE.filter((p) =>
      island
        ? p.island === island
        : p.island === "home" ||
          s.vehicles.includes("sailboat") ||
          s.vehicles.includes("helicopter") ||
          s.vehicles.includes("teleporter") ||
          s.vehicles.includes("jetpack"),
    );
    if (!accessible.length) continue;
    const open = accessible.filter(
      (p) => !s.customerQueue.some((c) => c.customerId === p.id),
    );
    if (!open.length) continue;
    const person = open[(s.arrivals + Math.abs(s.seed)) % open.length];
    s.discoveredBusinesses ||= [];
    if (!s.discoveredBusinesses.includes(person.id))
      s.discoveredBusinesses.push(person.id);
    s.customerQueue.push({
      ...person,
      customerId: person.id,
      id: `order-${s.orderSequence++}`,
      cases: 1 + ((s.arrivals + Math.abs(s.seed)) % 3),
      arrived: s.tick,
      assigned: null,
      serviceWait: 0,
      closedWait: 0,
      promisedTicks: 150 + (person.island === "home" ? 0 : 140),
    });
    s.queue.push(s.tick);
    s.arrivals++;
  }
}
export function orderCases(order) {
  return Number.isSafeInteger(order?.cases) && order.cases > 0
    ? order.cases
    : 1;
}

// Saved careers used to permit two separate requests per business. Preserve
// their demanded stock in one order, and keep an assigned courier when possible.
export function normalizeOrders(s) {
  normalizeRealism(s);
  if (!Array.isArray(s.customerQueue)) return s;
  normalizeLayout(s);
  if (s.orderSchemaVersion === 2) return s;
  s.casesDelivered = s.served || 0;
  s.orderSequence = Math.max(
    s.arrivals || 0,
    ...[...s.customerQueue, ...(s.customerHistory || [])].map((order) =>
      /^order-\d+$/.test(order.id) ? Number(order.id.slice(6)) + 1 : 0,
    ),
  );
  const grouped = new Map();
  for (const order of s.customerQueue) {
    const key = order.customerId || order.id;
    const existing = grouped.get(key);
    order.cases = orderCases(order);
    if (!existing) grouped.set(key, order);
    else {
      const keep = !existing.assigned && order.assigned ? order : existing,
        discard = keep === existing ? order : existing;
      keep.cases += discard.cases;
      keep.arrived = Math.min(keep.arrived, discard.arrived);
      grouped.set(key, keep);
      for (const courier of [s.brandon, ...(s.crew || [])])
        if (courier?.orderId === discard.id) courier.orderId = null;
    }
  }
  s.customerQueue = [...grouped.values()].sort((a, b) => a.arrived - b.arrived);
  s.queue = s.customerQueue.map((order) => order.arrived);
  s.arrivals = (s.served || 0) + s.queue.length;
  s.orderSchemaVersion = 2;
  return s;
}
function normalizeLayout(s) {
  if (s.layoutVersion === 3) return;
  for (const order of [...s.customerQueue, ...(s.customerHistory || [])]) {
    const person = PEOPLE.find((person) => person.id === order.customerId);
    if (person)
      Object.assign(order, {
        node: person.node,
        position: [...person.position],
        island: person.island,
      });
  }
  for (const courier of [s.brandon, ...(s.crew || [])]) {
    if (!courier) continue;
    if (courier.voyage) {
      // Old crossing coordinates now overlap the enlarged island. Re-dock
      // without consuming stock or recording a handoff, then plan a new route.
      courier.node =
        courier.voyage.mode === "sailboat" ? "harbor_dock" : "helipad";
      if (courier.id === "brandon") {
        s.carry += courier.stowedCargo || 0;
        courier.stowedCargo = 0;
      }
      releaseOrder(s, courier);
      courier.voyage = null;
      courier.move = null;
      courier.action = courier.id === "brandon" ? null : "return";
      courier.target = courier.id === "brandon" ? null : "cafe";
      courier.work = 0;
      const decision = s.decisions?.find(
        (entry) => entry.id === courier.decisionId,
      );
      if (decision) {
        decision.outcome =
          "Returned to the relocated port with all cargo preserved; replanning for the expanded island.";
        decision.completedAt = s.tick;
      }
    }
    const move = courier.move;
    if (move && NODES[move.from] && NODES[move.to]) {
      const fraction = Math.min(1, move.progress / move.distance);
      move.distance = length(NODES[move.from], NODES[move.to]);
      move.progress = move.distance * fraction;
      courier.position = NODES[move.from].map(
        (value, index) => value + (NODES[move.to][index] - value) * fraction,
      );
    } else if (NODES[courier.node]) courier.position = [...NODES[courier.node]];
    const order = s.customerQueue.find((order) => order.id === courier.orderId);
    if (order)
      courier.target = targetFor(s, courier.action, order, courier.transport);
  }
  s.layoutVersion = 3;
}
function has(s, vehicle) {
  return s.vehicles.includes(vehicle);
}
function roadVehicle(s) {
  if (
    s.preferredRoadTransport &&
    (s.preferredRoadTransport === "foot" || has(s, s.preferredRoadTransport))
  )
    return s.preferredRoadTransport;
  return has(s, "rocket_skates")
    ? "rocket_skates"
    : has(s, "van")
      ? "van"
      : has(s, "bike")
        ? "bike"
        : "foot";
}
function seaVehicle(s, preferred = null) {
  preferred ||= s.preferredTransport;
  if (preferred === "teleporter" && has(s, "teleporter") && s.battery >= 12)
    return "teleporter";
  if (
    preferred === "jetpack" &&
    has(s, "jetpack") &&
    !s.storm &&
    s.battery >= 18
  )
    return "jetpack";
  if (preferred === "sailboat" && has(s, "sailboat")) return "sailboat";
  if (
    preferred === "helicopter" &&
    has(s, "helicopter") &&
    (!s.storm || s.tools.winch)
  )
    return "helicopter";
  if (!preferred && has(s, "teleporter") && s.battery >= 12)
    return "teleporter";
  if (!preferred && has(s, "jetpack") && !s.storm && s.battery >= 18)
    return "jetpack";
  if (has(s, "helicopter") && (!s.storm || s.tools.winch)) return "helicopter";
  return has(s, "sailboat") ? "sailboat" : null;
}
function transportCapacity(s, mode) {
  return (
    TRANSPORT[mode].capacity +
    (mode === "jetpack"
      ? 0
      : s.tools.cargo_rack === 2
        ? 5
        : s.tools.cargo_rack
          ? 3
          : 0)
  );
}
function orderTransport(s, order, courier = s.brandon) {
  if (courier.id !== "brandon") s = { ...s, vehicles: courier.vehicles || [] };
  const preferred = seaVehicle(s);
  return (
    [preferred, "teleporter", "jetpack", "helicopter", "sailboat"].find(
      (mode) =>
        mode &&
        has(s, mode) &&
        seaVehicle(s, mode) === mode &&
        transportCapacity(s, mode) >= orderCases(order),
    ) || null
  );
}
export function orderDistance(s, order, courier = s.brandon) {
  const mode =
      order.island === "home" ? null : orderTransport(s, order, courier),
    target = targetFor(s, `serve_${order.customerId}`, order, mode),
    path = route(courier.node, target, s.bridgeClosed, s.traffic);
  if (!path.length || (order.island !== "home" && !mode)) return Infinity;
  let distance = path
    .slice(1)
    .reduce(
      (total, node, index) => total + length(NODES[path[index]], NODES[node]),
      0,
    );
  if (courier.move) {
    const nextPath = route(courier.move.to, target, s.bridgeClosed, s.traffic);
    if (!nextPath.length) return Infinity;
    distance =
      courier.move.distance -
      courier.move.progress +
      nextPath
        .slice(1)
        .reduce(
          (total, node, index) =>
            total + length(NODES[nextPath[index]], NODES[node]),
          0,
        );
  }
  if (mode === "sailboat") {
    const points = seaRoute(order.island);
    distance += points
      .slice(1)
      .reduce((total, point, index) => total + length(points[index], point), 0);
    distance += length(points.at(-1), order.position);
  } else if (mode) distance += length(NODES.helipad, order.position);
  return distance;
}
export function nearestOrder(
  s,
  { customerId = null, courier = s.brandon, stock = s.carry } = {},
) {
  return s.customerQueue
    .filter(
      (order) =>
        (!customerId || order.customerId === customerId) &&
        !order.assigned &&
        orderCases(order) <= stock &&
        (!order.requires || s.tools[order.requires]) &&
        (order.island === "home" || orderTransport(s, order, courier)),
    )
    .map((order) => ({ order, distance: orderDistance(s, order, courier) }))
    .filter(({ distance }) => Number.isFinite(distance))
    .filter(({ order, distance }) => {
      if (s.schedule?.phase !== "night_deliveries") return true;
      const speed =
        TRANSPORT[courier.id === "brandon" ? s.vehicle : courier.vehicle]
          ?.speed || 0.48;
      const homeward = length(order.position, NODES.home);
      return (
        (distance + homeward) / speed + 12 <
        ((22 - s.world.hour) / 24) * DAY_TICKS
      );
    })
    .sort(
      (a, b) => a.distance - b.distance || a.order.arrived - b.order.arrived,
    )[0]?.order;
}
function availableOrder(s, id = null) {
  return nearestOrder(s, { customerId: id });
}
export function legal(s) {
  normalizeRealism(s);
  if (s.status === "complete") return [];
  if (shiftEnded(s)) return ["rest"];
  const actions = [],
    cap = capacity(s),
    ops = s.operations;
  if (!laborAvailable(s, s.brandon))
    return [
      "rest",
      ...(s.flatTire ? ["patch"] : []),
      ...(s.schedule.isWeekend &&
      weekendPolicy(s) === "vacation" &&
      seaVehicle(s)
        ? ["vacation_resort"]
        : []),
    ];
  if (
    !ops.shipments.some((x) => x.kind === "pickles" && x.status === "at_sea") &&
    s.money >= ECONOMY.importUnitCost * 3
  )
    actions.push("order_import");
  if (
    (s.harbor || ops.islandPort || ops.oldWarehouse || ops.resourcesPort) &&
    ops.inboundCarry + ops.resourceCarry + s.carry < cap
  )
    actions.push("pickup_shipment");
  if (ops.inboundCarry || ops.resourceCarry) actions.push("unload_shipment");
  if (s.office.stage === "garage" && s.money >= ECONOMY.officePrice)
    actions.push("build_office");
  if (
    s.office.stage === "complete" &&
    s.construction.deal.status !== "agreed" &&
    seaVehicle(s)
  )
    actions.push("negotiate_island");
  if (
    s.construction.stage === "unowned" &&
    s.construction.deal.status === "agreed" &&
    s.money >= ECONOMY.islandPrice
  )
    actions.push("buy_island");
  if (
    s.construction.stage === "purchased" &&
    s.money >= ECONOMY.contractorPrice
  )
    actions.push("hire_contractor");
  if (s.construction.stage === "complete") {
    if (
      s.money >= ECONOMY.resourceBatch * ECONOMY.resourceUnitCost &&
      !ops.shipments.some(
        (x) => x.kind === "resources" && x.status !== "unloaded",
      )
    )
      actions.push("buy_resources");
    if (
      s.production.resources >= ECONOMY.resourceBatch &&
      s.production.growing.length < (s.production.expanded ? 3 : 1)
    )
      actions.push("plant_crop");
    if (
      !s.production.expanded &&
      s.production.produced >= ECONOMY.resourceBatch &&
      s.money >= ECONOMY.factoryExpansion
    )
      actions.push("expand_factory");
  }
  for (const member of s.crew)
    for (const [id, transport] of Object.entries(TRANSPORT))
      if (
        !member.vehicles?.includes(id) &&
        s.money >= transport.price &&
        (!transport.prerequisite ||
          member.vehicles?.includes(transport.prerequisite))
      )
        actions.push(`buy_${member.id}_${id}`);
  for (const [id, tool] of Object.entries(TOOLS)) {
    if (!s.tools[id]) {
      if (s.scrap >= tool.scrap) actions.push(`craft_${id}`);
      if (s.money >= tool.price) actions.push(`buy_${id}`);
    } else if (s.tools[id] === 1 && s.money >= tool.price * 2)
      actions.push(`upgrade_${id}`);
  }
  if (s.salvageStock > 0 && s.scrap < 24) actions.push("salvage");
  for (const [id, transport] of Object.entries(TRANSPORT))
    if (
      !has(s, id) &&
      s.money >= transport.price &&
      (!transport.prerequisite || has(s, transport.prerequisite))
    )
      actions.push(`buy_${id}`);
  if (
    s.office.stage === "complete" &&
    s.crew.length < 3 &&
    s.money >=
      80 + s.crew.length * 40 + (ECONOMY.wageBase + s.crew.length * 2) * 7 + 24
  )
    actions.push("hire_employee");
  if (
    has(s, "bike") &&
    s.vehicle !== "bike" &&
    s.carry <= capacity({ ...s, vehicle: "bike" })
  )
    actions.push("ride_bike");
  if (has(s, "van") && s.vehicle !== "van") actions.push("drive_van");
  if (
    has(s, "rocket_skates") &&
    s.vehicle !== "rocket_skates" &&
    s.carry <= capacity({ ...s, vehicle: "rocket_skates" })
  )
    actions.push("use_rocket_skates");
  if (s.vehicle !== "foot" && s.carry <= capacity({ ...s, vehicle: "foot" }))
    actions.push("walk");
  for (const id of ["sailboat", "helicopter", "jetpack", "teleporter"])
    if (has(s, id) && s.preferredTransport !== id) actions.push(`use_${id}`);
  if (s.preferredTransport || s.preferredRoadTransport)
    actions.push("auto_transport");
  if (has(s, "van") && !s.vanUpgrade && s.money >= 45)
    actions.push("upgrade_van");
  for (const [id, island] of Object.entries(ISLANDS)) {
    if (!s.outposts[id] && has(s, "sailboat") && s.money >= island.price)
      actions.push(`expand_${id}`);
    if (s.outposts[id] && s.carry > 0) {
      if (has(s, "sailboat")) actions.push(`supply_${id}`);
      if (seaVehicle(s, "helicopter") === "helicopter")
        actions.push(`air_${id}`);
    }
  }
  if (s.carry < cap && s.orchard > 0) {
    if (has(s, "sailboat")) actions.push("sail");
    if (seaVehicle(s, "helicopter") === "helicopter") actions.push("fly");
  }
  if (s.parcel && !s.parcel.picked && s.cafe > 0) actions.push("pick_parcel");
  if (s.parcel?.picked) {
    if (has(s, "sailboat")) actions.push("ship_parcel");
    if (seaVehicle(s, "helicopter") === "helicopter")
      actions.push("fly_parcel");
  }
  if (s.flatTire && s.vehicle === "van")
    return ["patch", ...(has(s, "bike") ? ["ride_bike"] : []), "walk", "wait"];
  if (s.flatTire) actions.push("patch");
  if (
    s.battery < 85 &&
    (has(s, "van") ||
      has(s, "helicopter") ||
      has(s, "jetpack") ||
      has(s, "teleporter"))
  )
    actions.push("charge");
  if (s.powerOut) actions.push("restore");
  if (s.carry + ops.inboundCarry + ops.resourceCarry < cap && s.cafe > 0)
    actions.push("collect");
  if (s.carry > 0) {
    actions.push("deliver");
    for (const person of PEOPLE)
      if (availableOrder(s, person.id)) actions.push(`serve_${person.id}`);
  }
  if (s.bridgeClosed && s.parts >= 2) actions.push("repair");
  const choices = [...new Set([...actions, "wait", "rest"])];
  if (
    s.schedule.phase === "night_deliveries" ||
    (s.schedule.isWeekend && !unfinishedDeliveries(s))
  )
    return choices.filter(
      (id) =>
        id.startsWith("serve_") ||
        [
          "collect",
          "unload_shipment",
          "patch",
          "charge",
          "rest",
          "wait",
        ].includes(id),
    );
  return choices;
}
function requestInvestment(s) {
  if (!s.request) return null;
  const crewPurchase = /^buy_(crew-\d+)_(.+)$/.exec(s.request);
  if (
    crewPurchase &&
    s.crew
      .find((c) => c.id === crewPurchase[1])
      ?.vehicles.includes(crewPurchase[2])
  ) {
    s.request = null;
    return null;
  }
  if (
    (s.request === "build_office" && s.office.stage !== "garage") ||
    (s.request === "buy_island" && s.construction.stage !== "unowned") ||
    (s.request === "negotiate_island" &&
      s.construction.deal.status === "agreed") ||
    (s.request === "hire_contractor" && s.construction.startedAt != null) ||
    (s.request === "expand_factory" && s.production.expanded)
  ) {
    s.request = null;
    return null;
  }
  if (
    /^(buy|craft)_/.test(s.request) &&
    TOOLS[s.request.replace(/^(buy|craft)_/, "")] &&
    s.tools[s.request.replace(/^(buy|craft)_/, "")]
  ) {
    s.request = null;
    return null;
  }
  if (s.request === "hire_employee" && s.crew.length >= 3) {
    s.request = null;
    return null;
  }
  if (
    s.request.startsWith("buy_") &&
    TRANSPORT[s.request.slice(4)] &&
    has(s, s.request.slice(4))
  ) {
    s.request = null;
    return null;
  }
  if (
    s.request.startsWith("upgrade_") &&
    TOOLS[s.request.slice(8)] &&
    s.tools[s.request.slice(8)] === 2
  ) {
    s.request = null;
    return null;
  }
  return s.request;
}
export function baseline(s) {
  if (shiftEnded(s) || canClockOut(s)) return "rest";
  if (s.retirement?.ready) return "rest";
  const a = legal(s),
    request = requestInvestment(s),
    can = (id) => a.includes(id);
  if (!laborAvailable(s, s.brandon))
    return can("vacation_resort")
      ? "vacation_resort"
      : can("patch") && s.flatTire
        ? "patch"
        : "rest";
  if (
    ["rest", "weekend"].includes(s.schedule.phase) &&
    unfinishedDeliveries(s)
  ) {
    const delivery = availableOrder(s);
    if (delivery && can(`serve_${delivery.customerId}`))
      return `serve_${delivery.customerId}`;
  }
  if (s.schedule.isWeekend && !unfinishedDeliveries(s)) {
    const special = nearestOrder(s, { stock: s.carry });
    if (special?.weekendService && can(`serve_${special.customerId}`))
      return `serve_${special.customerId}`;
    if (can("collect") && s.cafe > 0) return "collect";
    return "rest";
  }
  if (s.operations.inboundCarry || s.operations.resourceCarry)
    return "unload_shipment";
  if (s.carry === 0 && s.cafe < 3 && can("pickup_shipment"))
    return "pickup_shipment";
  if (s.carry === 0 && s.cafe === 0 && can("collect")) return "collect";
  if (can("patch") && s.vehicle === "van") return "patch";
  if (can("charge") && s.battery < 22) return "charge";
  if (can("restore")) return "restore";
  const learned = learnedAction(s, a);
  if (learned) return learned;
  if (request && can(request)) return request;
  const requestedMode = request?.replace(/^(buy|use)_/, ""),
    prerequisite = TRANSPORT[requestedMode]?.prerequisite;
  if (prerequisite && !has(s, prerequisite) && can(`buy_${prerequisite}`))
    return `buy_${prerequisite}`;
  const requestedCrew = /^buy_(crew-\d+)_(.+)$/.exec(request || "");
  if (requestedCrew) {
    const required = TRANSPORT[requestedCrew[2]]?.prerequisite;
    if (required && can(`buy_${requestedCrew[1]}_${required}`))
      return `buy_${requestedCrew[1]}_${required}`;
  }
  const development = [
    "negotiate_island",
    "buy_island",
    "hire_contractor",
    "buy_resources",
    "plant_crop",
    "expand_factory",
  ].includes(request);
  if ((request === "hire_employee" || development) && can("build_office"))
    return "build_office";
  if (
    (development || request === "vacation_resort") &&
    !seaVehicle(s) &&
    can("buy_sailboat")
  )
    return "buy_sailboat";
  if (
    development &&
    s.construction.deal.status !== "agreed" &&
    can("negotiate_island")
  )
    return "negotiate_island";
  if (development && s.construction.stage === "unowned" && can("buy_island"))
    return "buy_island";
  if (
    development &&
    s.construction.stage === "purchased" &&
    can("hire_contractor")
  )
    return "hire_contractor";
  if (request === "plant_crop" && can("buy_resources")) return "buy_resources";
  if (
    request?.startsWith("upgrade_") &&
    TOOLS[request.slice(8)] &&
    !s.tools[request.slice(8)]
  ) {
    const prerequisite = `craft_${request.slice(8)}`;
    if (can(prerequisite)) return prerequisite;
    if (can("salvage")) return "salvage";
  }
  if (
    request?.startsWith("use_") &&
    TRANSPORT[request.slice(4)] &&
    !has(s, request.slice(4)) &&
    can(`buy_${request.slice(4)}`)
  )
    return `buy_${request.slice(4)}`;
  if (request?.startsWith("craft_") && !can(request) && can("salvage"))
    return "salvage";
  if (can("plant_crop")) return "plant_crop";
  const pipeline =
    s.production.growing.length +
    s.production.fermenting.length +
    s.production.packing.length;
  if (
    !s.carry &&
    s.cafe + s.harbor + s.operations.islandPort < 12 &&
    !pipeline &&
    can("order_import")
  )
    return "order_import";
  if (
    s.construction.stage === "complete" &&
    s.production.resources < 6 &&
    !s.operations.resourcesPort &&
    !s.operations.resourceCarry &&
    can("buy_resources")
  )
    return "buy_resources";
  const untriedSea = ["sailboat", "helicopter", "jetpack", "teleporter"].find(
    (mode) => has(s, mode) && !s.transportUsage[mode],
  );
  if (untriedSea && s.carry) {
    const newRoute = s.customerQueue.find(
      (order) =>
        order.island !== "home" &&
        !order.assigned &&
        orderCases(order) <=
          Math.min(s.carry, transportCapacity(s, untriedSea)) &&
        (!order.requires || s.tools[order.requires]) &&
        can(`serve_${order.customerId}`),
    );
    if (newRoute) return `serve_${newRoute.customerId}`;
  }
  const nextDelivery = availableOrder(s);
  if (nextDelivery && can(`serve_${nextDelivery.customerId}`))
    return `serve_${nextDelivery.customerId}`;
  // Essential handling equipment is never held behind a speculative investment.
  const missing = s.customerQueue.find(
    (c) => c.requires && !s.tools[c.requires],
  )?.requires;
  if (missing && can(`craft_${missing}`)) return `craft_${missing}`;
  if (missing && can("salvage")) return "salvage";
  if (s.parcel?.picked) {
    if (can("fly_parcel")) return "fly_parcel";
    if (can("ship_parcel")) return "ship_parcel";
  }
  if (s.parcel && can("pick_parcel")) return "pick_parcel";
  // Every generation is actually used before the next transport purchase.
  if (!request) {
    if (has(s, "bike") && can("build_office")) return "build_office";
    if (has(s, "sailboat") && can("negotiate_island"))
      return "negotiate_island";
    if (has(s, "sailboat") && can("buy_island")) return "buy_island";
    if (can("hire_contractor")) return "hire_contractor";
    if (can("expand_factory")) return "expand_factory";
    for (const member of s.crew) {
      const nextMode = !member.vehicles.includes("bike")
        ? "bike"
        : has(s, "helicopter") && !member.vehicles.includes("van")
          ? "van"
          : member.vehicles.includes("van") &&
              !member.vehicles.includes("rocket_skates") &&
              has(s, "rocket_skates")
            ? "rocket_skates"
            : has(s, "teleporter") && !member.vehicles.includes("sailboat")
              ? "sailboat"
              : null;
      if (nextMode && can(`buy_${member.id}_${nextMode}`))
        return `buy_${member.id}_${nextMode}`;
    }
    const ladder = Object.keys(TRANSPORT),
      next = ladder.find((id) => !has(s, id));
    const previous = next && ladder[ladder.indexOf(next) - 1];
    if (
      next &&
      (!previous || (s.transportUsage[previous] || 0) > 0) &&
      can(`buy_${next}`)
    )
      return `buy_${next}`;
    if (has(s, "van") && s.crew.length < 1 && can("hire_employee"))
      return "hire_employee";
    if (has(s, "helicopter") && s.crew.length < 2 && can("hire_employee"))
      return "hire_employee";
    if (has(s, "teleporter") && s.crew.length < 3 && can("hire_employee"))
      return "hire_employee";
    const missingTool = Object.keys(TOOLS).find((id) => !s.tools[id]);
    if (missingTool && has(s, "van") && can(`craft_${missingTool}`))
      return `craft_${missingTool}`;
    if (
      missingTool &&
      has(s, "van") &&
      s.scrap < TOOLS[missingTool].scrap &&
      can("salvage")
    )
      return "salvage";
    if (!next) {
      const upgrade = a.find(
        (id) => id.startsWith("upgrade_") && id !== "upgrade_van",
      );
      if (upgrade) return upgrade;
      if (can("upgrade_van")) return "upgrade_van";
    }
  }
  if (
    s.vehicle !== roadVehicle(s) &&
    !s.brandon.move &&
    s.vehicle !== "jetpack"
  ) {
    const switchAction =
      roadVehicle(s) === "rocket_skates"
        ? "use_rocket_skates"
        : roadVehicle(s) === "van"
          ? "drive_van"
          : roadVehicle(s) === "bike"
            ? "ride_bike"
            : "walk";
    if (can(switchAction)) return switchAction;
  }
  if (s.carry > 0) {
    const order = availableOrder(s);
    if (order && can(`serve_${order.customerId}`))
      return `serve_${order.customerId}`;
    if (s.crew.length && s.cafe < s.crew.length * 2 && can("deliver"))
      return "deliver";
    if (can("deliver") && s.cafe < 12) return "deliver";
  }
  if (can("pickup_shipment") && s.carry === 0) return "pickup_shipment";
  if (can("collect") && (s.cafe < 12 || s.customerQueue.length))
    return "collect";
  if (can("order_import") && s.cafe < 6) return "order_import";
  if (can("market")) return "market";
  if (can("fly")) return "fly";
  if (can("sail")) return "sail";
  if (can("repair")) return "repair";
  return "wait";
}
export function reason(s, action) {
  if (action === "wait") {
    const inbound = s.operations.shipments.find(
      (shipment) => shipment.kind === "pickles" && shipment.status === "at_sea",
    );
    if (!s.carry && !s.cafe && inbound)
      return `Stock is empty. Waiting for the paid shipment on day ${inbound.arrivalDay} at ${inbound.arrivalHour}:00; queued orders are saved.`;
  }
  const vehicle = TRANSPORT[action.replace(/^buy_/, "")];
  if (vehicle)
    return `${vehicle.price} earned coins buys ${vehicle.name.toLowerCase()}. ${vehicle.effect}`;
  const tool = TOOLS[action.replace(/^(craft|buy|upgrade)_/, "")];
  if (tool)
    return `${tool.effect} Costs ${action.startsWith("craft_") ? tool.scrap + " reclaimed materials" : tool.price * (action.startsWith("upgrade_") ? 2 : 1) + " coins"}.`;
  const person = PEOPLE.find((p) => action === `serve_${p.id}`);
  if (person)
    return `Deliver the complete ${orderCases(s.customerQueue.find((order) => order.customerId === person.id))}-case order to ${person.name} at ${person.role} on ${person.island === "home" ? "the home island" : ISLANDS[person.island]?.name || "Reef Island"}. Nearby orders that fit the current cargo are served first.`;
  const island = ISLANDS[action.replace(/^(expand|supply|air)_/, "")];
  if (island)
    return action.startsWith("expand_")
      ? `${island.price} coins opens ${island.name}. It earns only by fulfilling named customer orders from delivered stock.`
      : `Transfer carried stock at ${island.name}; its local team fulfills orders while stock lasts.`;
  return (
    {
      build_office: `Invest ${ECONOMY.officePrice} coins in an office; construction takes ${ECONOMY.officeTicks} minutes, then hiring opens.`,
      order_import: `Pay ${ECONOMY.importUnitCost} coins per imported case. Brandon books a weekday delivery based on demand and available stock, allowing at least ${ECONOMY.shipmentTicks} minutes for sailing; collect at port and unload at the business before dispatch.`,
      pickup_shipment:
        "Collect a paid shipment from the port and carry it to the one active business.",
      unload_shipment:
        "Receive paid inbound supplies at the active business; only then can cases leave for customers.",
      negotiate_island:
        "Travel to Cay Development Co. on Copperport, review the 200-coin asking price, counter with 160 and sign the development agreement.",
      buy_island: `Purchase the negotiated factory site for ${ECONOMY.islandPrice} coins.`,
      hire_contractor: `Pay ${ECONOMY.contractorPrice} coins for the contractor to build the island, causeway, shop, factory, garden and greenhouse in stages.`,
      buy_resources: `Purchase six seed, brine and jar kits for ${ECONOMY.resourceBatch * ECONOMY.resourceUnitCost} coins, delivered by ship.`,
      plant_crop: `Consume six kits: grow ${ECONOMY.growTicks} minutes, ferment ${ECONOMY.fermentTicks} minutes, pack ${ECONOMY.packTicks} minutes before dispatch.`,
      expand_factory: `Reinvest ${ECONOMY.factoryExpansion} coins in three concurrent greenhouse crops and fermentation capacity.`,
      rest: "Take due meal/rest breaks, return home after the ten-hour shift and finish night service by 22:00. Weekends are off.",
      hire_employee: `Hire ${CREW_NAMES[s.crew.length]} for ${80 + s.crew.length * 40} coins. Teammates travel at 68% of Brandon’s speed and earn a daily wage; each employee transport is purchased separately.`,
      collect: `Load up to ${capacity(s)} already-paid cases from ${s.cafe} at the active business.`,
      market: `Collect from ${s.market} market cases.`,
      deliver: `Put ${s.carry} cases into the packing room for the delivery team.`,
      salvage:
        "Collect six washed-up plastic pieces along the shoreline and reuse them to craft working gadgets.",
      charge: `Battery is ${Math.round(s.battery)}%; recharge to keep electric transport reliable.`,
      patch: "Repair the puncture before the next van run.",
      restore: "Reset the relay so the packing room and outposts can operate.",
      repair: "Use two workshop parts to reopen the bridge shortcut.",
      wait: "Wait briefly for a fresh order or the next harvest.",
      sail: "Sail to the offshore farm and physically bring back fresh pickle cases.",
      fly: "Fly to the offshore farm and bring back fresh pickle cases.",
      ride_bike: "Use the cargo bicycle for battery-free road deliveries.",
      drive_van: "Use the electric van for faster, larger road runs.",
      walk: "Deliver on foot without any operating cost.",
      use_jetpack: "Equip the two-case express jetpack for island trips.",
      upgrade_van:
        "Fit a faster drivetrain with half the battery consumption for 45 coins.",
      pick_parcel: "Collect Tess’s reserved barrel from the market.",
      ship_parcel:
        "Sail Tess’s barrel to Reef Island and hand it over at the beach club.",
      fly_parcel:
        "Fly Tess’s barrel to Reef Island and hand it over at the beach club.",
    }[action] ||
    ACTIONS[action]?.label ||
    action
  );
}
function targetFor(s, a, order = null, mode = null) {
  const roadSwitch = {
    ride_bike: "bike",
    drive_van: "van",
    use_rocket_skates: "rocket_skates",
  }[a];
  if (roadSwitch) return s.vehicleLocations?.[roadSwitch]?.node || "workshop";
  if (
    [
      "collect",
      "deliver",
      "unload_shipment",
      "order_import",
      "buy_resources",
      "hire_employee",
      "pick_parcel",
    ].includes(a)
  )
    return originNode(s);
  if (a === "rest")
    return s.brandon.labor?.pending.length || s.brandon.labor?.breakRemaining
      ? s.brandon.move?.to || s.brandon.node
      : "home";
  if (a === "pickup_shipment")
    return s.operations.oldWarehouse > 0
      ? s.operations.oldOrigin
      : s.operations.resourcesPort > 0 || s.operations.islandPort > 0
        ? "farm_port"
        : "harbor_dock";
  if (a === "vacation_resort")
    return seaVehicle(s) === "sailboat" ? "harbor_dock" : "helipad";
  if (a === "negotiate_island")
    return seaVehicle(s) === "sailboat" ? "harbor_dock" : "helipad";
  if (a?.startsWith("serve_") && order)
    return order.island === "home"
      ? order.node
      : (mode || seaVehicle(s)) === "sailboat"
        ? "harbor_dock"
        : "helipad";
  return ACTIONS[a]?.target;
}
export function decisionReady(s) {
  const b = s.brandon;
  return (
    !b.action &&
    !b.combat &&
    !b.slip &&
    !b.transition &&
    !b.voyage &&
    !b.move &&
    !b.vehicleApproach &&
    !b.buildingVisit &&
    (!b.homeRoutine || b.homeRoutine.phase === "sleeping")
  );
}
export function begin(s, action, meta = {}) {
  if (!decisionReady(s)) return false;
  replanAtBoundary(s);
  if (!legal(s).includes(action)) return false;
  if (action === "vacation_resort" && !startVacation(s, DAY_TICKS))
    return false;
  const b = s.brandon,
    choices = legal(s);
  const endedShift = action === "rest" && clockOut(s);
  if (endedShift)
    event(
      s,
      "clock_out",
      "Jev clocked Brandon out. His shift has ended; he is heading home until the next shift.",
    );
  const order = action.startsWith("serve_")
    ? availableOrder(s, action.slice(6))
    : null;
  if (order) {
    order.assigned = "brandon";
    b.orderId = order.id;
  }
  if (action !== "rest") {
    if (b.homeRoutine?.phase === "sleeping")
      b.homeRoutine = {
        ...b.homeRoutine,
        phase: "exiting",
        elapsed: 0,
        start: [...b.position],
      };
    else b.homeRoutine = null;
  }
  b.transport =
    order?.island !== "home" && order ? orderTransport(s, order) : null;
  b.target = targetFor(s, action, order, b.transport);
  const decision = {
    id: `d${s.tick}-${s.decisionCount++}`,
    tick: s.tick,
    action,
    label: endedShift ? "Clock out" : ACTIONS[action].label,
    choices,
    reason: endedShift
      ? "The scheduled shift has ended. Clock out and return home until the next shift."
      : reason(s, action),
    controller: meta.controller || "rules",
    latency: meta.latency || 0,
    trace: meta.trace || null,
    probabilities: meta.probabilities || null,
    confidence: meta.confidence ?? null,
    model: meta.model || null,
    fallback: meta.fallback || null,
    outcome: "In progress",
    context: {
      money: s.money,
      scrap: s.scrap,
      stock: s.cafe,
      carrying: s.carry,
      battery: Math.round(s.battery),
      queue: s.queue.length,
      tools: { ...s.tools },
      bridgeClosed: s.bridgeClosed,
      storm: s.storm,
      powerOut: s.powerOut,
      vehicle: s.vehicle,
      crew: s.crew.length,
      day: s.world.day,
    },
  };
  s.decisions.push(decision);
  s.decisions = s.decisions.slice(-120);
  if (s.request === action) {
    s.request = null;
    s.dispatchGoal = null;
  }
  s.dispatch.push({
    tick: s.tick,
    role: "brandon",
    text: `${ACTIONS[action].label}. ${decision.reason}`,
    source: decision.controller,
    latency: decision.latency,
  });
  s.dispatch = s.dispatch.slice(-40);
  b.action = action;
  b.work = 0;
  b.decisionId = decision.id;
  if (meta.controller === "jev") s.calls++;
  if (meta.fallback) s.fallbacks++;
  s.inputTokens += meta.tokens || 0;
  event(
    s,
    "decision",
    `${ACTIONS[action].label}. ${meta.fallback ? "Rules took over: " + meta.fallback : decision.reason}`,
  );
  return decision;
}

export function command(s, type, value) {
  if (type === "environment") {
    const { key, value: setting } = value || {};
    normalizeWeather(s);
    if (key === "soundEnabled" && typeof setting === "boolean") {
      s.environment.soundEnabled = setting;
    } else if (
      key === "weather" &&
      ["auto", "clear", "cloudy", "rain", "fog", "storm"].includes(setting)
    ) {
      s.environment.weatherOverride = setting === "auto" ? null : setting;
      s.environment.weatherUntil = setting === "auto" ? 0 : s.tick + 180;
      s.stormOverride = null;
    } else if (key === "weatherEnabled" && typeof setting === "boolean") {
      // Old clients now request a temporary clearing rather than disabling the cycle.
      s.environment.weatherOverride = setting ? null : "clear";
      s.environment.weatherUntil = setting ? 0 : s.tick + 180;
      s.stormOverride = null;
    } else throw new Error("Invalid environment control.");
    updateWorldTime(s);
    s.disruptions.push({ tick: s.tick, type, value });
    return;
  }
  if (type === "next_shift" || type === "daytime") {
    if (!shiftEnded(s))
      throw new Error(
        "Go to next shift is available after Brandon clocks out.",
      );
    if (value === "morning")
      s.brandon.shift.nextShiftAt = nextShiftTick(s, true);
    s.daytimeUntil = s.brandon.shift.nextShiftAt;
    s.status = "running";
    return;
  }
  if (type === "extend") {
    if (s.status !== "complete")
      throw new Error("Continue is available after retirement.");
    s.retirement.target += RETIREMENT_TARGET;
    s.retirement.retiredAt = null;
    s.retirement.ready = false;
    s.status = "paused";
    s.limit += 25000;
    s.disruptions.push({ tick: s.tick, type, value });
    event(
      s,
      "mission",
      "A new chapter. The team is ready to build toward the next retirement fund.",
    );
    return;
  }
  if (s.status === "complete")
    throw new Error(
      "Brandon has retired. Start a new career or another chapter.",
    );
  if (["spawn_zombie", "buy_weapon", "equip_weapon"].includes(type)) {
    combatCommand(s, type, value, event);
    s.disruptions.push({ tick: s.tick, type, value });
    return;
  }
  if (["creature", "pay_toll", "place_oil"].includes(type)) {
    normalizeHazards(s);
    if (type === "creature")
      setCreature(s, value ?? !s.hazards.creature.enabled, event);
    else if (type === "pay_toll") payToll(s, value, event);
    else placeSpill(s, value, NODES, EDGES, event);
    s.disruptions.push({ tick: s.tick, type, value });
    return;
  }
  if (type === "start") {
    s.status = "running";
    event(
      s,
      "mission",
      "The business is open. Brandon will earn, invest, hire, and grow autonomously.",
    );
    return;
  }
  if (type === "pause") {
    s.status = s.status === "running" ? "paused" : "running";
    return;
  }
  if (type === "speed") {
    if (![1, 2, 4, 8].includes(value))
      throw new Error("Choose 1×, 2×, 4×, or 8× speed.");
    s.speed = value;
    return;
  }
  if (type === "request" || type === "prefer") {
    if (typeof value !== "string" || !ACTIONS[value])
      throw new Error("Choose a known business action.");
    s.request = value;
    s.dispatchGoal = ACTIONS[value].label;
    s.dispatch.push({
      tick: s.tick,
      role: "visitor",
      text: `Next priority: ${ACTIONS[value].label}`,
    });
    event(
      s,
      "dispatch",
      `Queued ${ACTIONS[value].label.toLowerCase()}. Brandon will save for it while continuing deliveries.`,
    );
  } else if (type === "chat") {
    if (typeof value !== "string" || !value.trim() || value.length > 240)
      throw new Error("Send a message between 1 and 240 characters.");
    const text = value.trim(),
      lower = text.toLowerCase();
    s.dispatch.push({ tick: s.tick, role: "visitor", text });
    s.dispatchGoal = text;
    const exact = Object.entries(ACTIONS).find(
      ([id, a]) => lower === id || lower === a.label.toLowerCase(),
    );
    const vehicle = Object.keys(TRANSPORT).find(
      (id) =>
        lower.includes(id) ||
        lower.includes(id.replaceAll("_", " ")) ||
        (id === "bike" && /bicycle/.test(lower)) ||
        (id === "sailboat" && /boat/.test(lower)) ||
        (id === "teleporter" && /portal|teleport/.test(lower)),
    );
    const tool = Object.keys(TOOLS).find(
      (id) =>
        lower.includes(id.replaceAll("_", " ")) ||
        lower.includes(TOOLS[id].name.toLowerCase()) ||
        lower.includes(id.split("_").at(-1)),
    );
    const namedMember = s.crew.find((c) =>
      lower.includes(c.name.toLowerCase()),
    );
    const businessRequest = /vacation|resort/.test(lower)
      ? "vacation_resort"
      : /negotia|island deal/.test(lower)
        ? "negotiate_island"
        : /contractor|construct.*island/.test(lower)
          ? "hire_contractor"
          : /build.*office|office.*build/.test(lower)
            ? "build_office"
            : /buy.*island|purchase.*island/.test(lower)
              ? "buy_island"
              : /expand.*factory|factory.*expand/.test(lower)
                ? "expand_factory"
                : /resource|seed|brine.*kit|jar.*kit/.test(lower)
                  ? "buy_resources"
                  : /ferment|plant.*crop|grow.*pickle/.test(lower)
                    ? "plant_crop"
                    : /order.*shipment|import.*pickle/.test(lower)
                      ? "order_import"
                      : /unload.*shipment/.test(lower)
                        ? "unload_shipment"
                        : /collect.*shipment|pick.*shipment/.test(lower)
                          ? "pickup_shipment"
                          : null;
    let request =
      exact?.[0] ||
      (namedMember && vehicle
        ? `buy_${namedMember.id}_${vehicle}`
        : businessRequest) ||
      (vehicle
        ? has(s, vehicle)
          ? vehicle === "bike"
            ? "ride_bike"
            : vehicle === "van"
              ? "drive_van"
              : `use_${vehicle}`
          : `buy_${vehicle}`
        : /hire|employee|teammate|staff/.test(lower)
          ? "hire_employee"
          : tool
            ? `${/upgrade|pro/.test(lower) ? "upgrade" : /buy/.test(lower) ? "buy" : "craft"}_${tool}`
            : null);
    if (request) {
      s.request = request;
      event(
        s,
        "dispatch",
        `Next priority: ${ACTIONS[request].label}. Saving and deliveries continue until it is ready.`,
      );
    } else if (/parcel|reef/.test(lower)) {
      if (!s.parcel)
        s.parcel = { picked: false, created: s.tick, deadline: s.tick + 240 };
      event(
        s,
        "dispatch",
        "Tess requested a special pickle barrel at Reef Island.",
      );
    } else if (/storm|rain/.test(lower)) {
      command(s, "storm");
      return;
    } else if (/bridge/.test(lower)) {
      s.dispatch.push({
        tick: s.tick,
        role: "brandon",
        source: "system",
        text: "Both bridges connect the home neighborhoods. They stay open; try the market parade or a storm instead.",
      });
      s.dispatch = s.dispatch.slice(-40);
      return;
    } else if (/power|blackout/.test(lower)) {
      command(s, "power");
      return;
    } else if (/rush/.test(lower)) {
      command(s, "rush");
      return;
    } else if (/waste|efficient/.test(lower)) {
      s.objective = "waste";
      event(s, "priority", "Use existing stock before collecting more.");
    } else
      s.dispatch.push({
        tick: s.tick,
        role: "brandon",
        source: "system",
        text: "I can prioritize any gadget, vehicle, employee, or customer delivery. The AI controller also considers your exact message at its next decision.",
      });
  } else if (type === "gift") {
    if (!TRANSPORT[value]) throw new Error("Unknown transport.");
    if (has(s, value)) throw new Error("Brandon already owns this transport.");
    s.vehicles.push(value);
    s.vehicleLocations[value] = {
      node: "workshop",
      position: [...NODES.workshop],
    };
    if (value === "bike" || value === "van")
      s.request = value === "bike" ? "ride_bike" : "drive_van";
    event(
      s,
      "disruption",
      `Visitor supplied ${TRANSPORT[value].name.toLowerCase()}.`,
    );
  } else if (type === "grant") {
    if (s.grants >= 2)
      throw new Error("Both investment grants have been used.");
    s.money += 40;
    s.grants++;
    event(s, "disruption", "A 40-coin investment arrived.");
  } else if (["storm", "traffic", "power", "puncture"].includes(type)) {
    if (type === "storm") {
      s.storm = !s.storm;
      s.stormOverride = s.storm;
      s.stormOverrideUntil = s.tick + 180;
      normalizeWeather(s);
      s.environment.weatherOverride = null;
      s.environment.weatherUntil = 0;
      updateWorldTime(s);
    }
    if (type === "traffic") s.traffic = !s.traffic;
    if (type === "power") s.powerOut = !s.powerOut;
    if (type === "puncture") {
      if (s.flatTire) throw new Error("The tire already needs a repair.");
      s.flatTire = true;
    }
    event(
      s,
      "disruption",
      {
        storm: s.storm
          ? "A storm is slowing crossings and wet roads."
          : "The storm has cleared.",
        traffic: s.traffic
          ? "Market road closed. Use the northern loop."
          : "Market road reopened.",
        power: s.powerOut
          ? "Power failure. Restore the relay or use the generator."
          : "Packing room power restored.",
        puncture: "A tire needs patching before the next van run.",
      }[type],
    );
  } else if (type === "bridge") {
    s.bridgeClosed = !s.bridgeClosed;
    event(
      s,
      "disruption",
      s.bridgeClosed
        ? "Bridge closed. Routes replan at the next junction."
        : "Bridge reopened.",
    );
  } else if (type === "shortage") {
    if (s.disruptions.filter((d) => d.type === "shortage").length >= 2)
      throw new Error("Both supply setbacks are already in play.");
    const n = Math.ceil(s.harbor / 2);
    s.harbor -= n;
    markShipmentPicked(s, "pickles", "harbor_dock", n);
    s.lost += n;
    event(s, "disruption", `${n} harbor cases lost in a supply setback.`);
  } else if (type === "rush") {
    if (s.disruptions.filter((d) => d.type === "rush").length >= 2)
      throw new Error("Both surprise rushes are already in play.");
    addCustomers(s, 6);
    event(s, "disruption", "Six additional business orders arrived.");
  } else if (type === "objective") {
    if (!["speed", "waste"].includes(value))
      throw new Error("Unknown priority.");
    s.objective = value;
    event(
      s,
      "priority",
      value === "waste"
        ? "Use existing stock before collecting more."
        : "Keep the business orders moving.",
    );
  } else throw new Error("Unknown command.");
  s.dispatch = s.dispatch.slice(-40);
  s.disruptions.push({ tick: s.tick, type, value });
  // Apply disruptions at a safe boundary, after the visible interaction.
  if (s.brandon.action && !["chat", "request", "prefer"].includes(type)) {
    s.brandon.replanRequested = type;
    replanAtBoundary(s);
  }
}
function replanAtBoundary(s) {
  const b = s.brandon;
  if (
    !b.replanRequested ||
    b.move ||
    b.voyage ||
    b.transition ||
    b.combat ||
    b.slip ||
    b.buildingVisit ||
    b.vehicleApproach ||
    (b.homeRoutine && b.homeRoutine.phase !== "sleeping")
  )
    return;
  const d = s.decisions.find((d) => d.id === b.decisionId);
  if (d && b.action) {
    d.outcome = `Interrupted by ${b.replanRequested}; reassessing at a safe boundary.`;
    d.completedAt = s.tick;
  }
  releaseOrder(s, b);
  b.action = null;
  b.work = 0;
  b.replanRequested = null;
}
function releaseOrder(s, b) {
  const order = s.customerQueue.find((c) => c.id === b.orderId);
  if (order) order.assigned = null;
  b.orderId = null;
}
function spend(s, amount) {
  if (s.money < amount) return false;
  s.money -= amount;
  s.spent += amount;
  return true;
}
function milestone(s, type, id) {
  s.milestones.push({ tick: s.tick, type, id });
  s.milestones = s.milestones.slice(-100);
}
function finish(s) {
  const b = s.brandon,
    a = b.action;
  // Waiting and sleeping are sustained states. End them when the operating
  // plan changes, rather than logging another identical decision every 3 min.
  if (a === "wait" && baseline(s) === "wait") return;
  if (
    a === "rest" &&
    !s.retirement.ready &&
    b.homeRoutine?.phase === "sleeping" &&
    shiftEnded(s)
  )
    return;
  if (b.buildingVisit?.phase === "inside") {
    b.buildingVisit.phase = "exiting";
    b.buildingVisit.points = [
      b.buildingVisit.door || [4.45, -3.4],
      [...b.buildingVisit.returnPosition],
    ];
  }
  let outcome =
    a === "rest" && b.homeRoutine?.phase === "sleeping"
      ? "Transport parked. Resting inside until the next shift."
      : "Task completed.";
  const islandId = a?.replace(/^(expand|supply|air)_/, ""),
    island = ISLANDS[islandId];
  const toolId = a?.replace(/^(craft|buy|upgrade)_/, ""),
    tool = TOOLS[toolId];
  if (island && a.startsWith("expand_") && spend(s, island.price)) {
    s.outposts[islandId] = { stock: 0, served: 0, earned: 0 };
    outcome = `${island.name} outpost opened. It needs physically delivered stock.`;
  }
  if (tool) {
    if (a.startsWith("craft_") && !s.tools[toolId] && s.scrap >= tool.scrap) {
      s.scrap -= tool.scrap;
      s.tools[toolId] = 1;
    } else if (spend(s, tool.price * (a.startsWith("upgrade_") ? 2 : 1)))
      s.tools[toolId] = a.startsWith("upgrade_") ? 2 : 1;
    outcome = `${tool.name} ready${s.tools[toolId] === 2 ? " · Pro" : ""}. ${tool.effect}`;
    milestone(s, "gadget", toolId);
  }
  const crewPurchase = /^buy_(crew-\d+)_(.+)$/.exec(a || "");
  if (crewPurchase) {
    const member = s.crew.find((c) => c.id === crewPurchase[1]),
      transport = TRANSPORT[crewPurchase[2]];
    if (
      member &&
      transport &&
      !member.vehicles.includes(crewPurchase[2]) &&
      spend(s, transport.price)
    ) {
      member.vehicles.push(crewPurchase[2]);
      outcome = `${member.name} now owns a dedicated ${transport.name.toLowerCase()}.`;
    }
  }
  if (a === "order_import" || a === "buy_resources") {
    const resource = a === "buy_resources",
      unitCost = resource ? ECONOMY.resourceUnitCost : ECONOMY.importUnitCost;
    const cases = Math.min(
      resource ? ECONOMY.resourceBatch : ECONOMY.importBatch,
      Math.floor(s.money / unitCost),
    );
    if (
      cases >= (resource ? ECONOMY.resourceBatch : 3) &&
      spend(s, cases * unitCost)
    ) {
      s.operations.shipments.push({
        id: `shipment-${s.operations.sequence++}`,
        kind: resource ? "resources" : "pickles",
        cases,
        remaining: cases,
        cost: cases * unitCost,
        orderedAt: s.tick,
        ...planShipment(s),
        status: "at_sea",
        portNode: originNode(s) === "farm_shop" ? "farm_port" : "harbor_dock",
      });
      if (resource) s.operations.resourcesPaid += cases * unitCost;
      else {
        s.operations.purchasedCases += cases;
        s.operations.importsPaid += cases * unitCost;
        s.initial += cases;
        s.generated += cases;
      }
      const booked = s.operations.shipments.at(-1);
      outcome = `Paid ${cases * unitCost} coins for ${cases} ${resource ? "seed, brine and jar kits" : "pickle cases"}; booked day ${booked.arrivalDay} at ${String(Math.floor(booked.arrivalHour)).padStart(2, "0")}:${String(Math.round((booked.arrivalHour % 1) * 60)).padStart(2, "0")}. ${booked.reason}.`;
    }
  }
  if (
    a === "build_office" &&
    s.office.stage === "garage" &&
    spend(s, ECONOMY.officePrice)
  ) {
    s.office.stage = "building";
    s.office.startedAt = s.tick;
    outcome =
      "Builders started the first pickle office. Garage deliveries continue while construction finishes.";
  }
  if (
    a === "buy_island" &&
    s.construction.stage === "unowned" &&
    spend(s, ECONOMY.islandPrice)
  ) {
    s.construction.stage = "purchased";
    s.construction.paid += ECONOMY.islandPrice;
    outcome =
      "Purchased the negotiated Pickle Cay site. Hire the contractor to build.";
  }
  if (
    a === "hire_contractor" &&
    s.construction.stage === "purchased" &&
    spend(s, ECONOMY.contractorPrice)
  ) {
    s.construction.stage = "survey";
    s.construction.startedAt = s.tick;
    s.construction.paid += ECONOMY.contractorPrice;
    outcome =
      "Cay Construction began the survey, reclamation, causeway, factory and greenhouse project.";
  }
  if (a === "plant_crop" && s.production.resources >= ECONOMY.resourceBatch) {
    const cases = ECONOMY.resourceBatch;
    s.production.resources -= cases;
    s.production.growing.push({
      id: `batch-${s.production.batches++}`,
      cases,
      readyAt: s.tick + ECONOMY.growTicks,
    });
    s.initial += cases;
    s.generated += cases;
    outcome =
      "Six finite seed, brine and jar kits entered the growing, fermentation and packing process.";
  }
  if (
    a === "expand_factory" &&
    !s.production.expanded &&
    spend(s, ECONOMY.factoryExpansion)
  ) {
    s.production.expanded = true;
    outcome =
      "Expanded greenhouse beds and fermentation capacity to three concurrent crops.";
  }
  if (a === "pickup_shipment") {
    const ops = s.operations,
      free = capacity(s) - s.carry - ops.inboundCarry - ops.resourceCarry;
    const source =
      b.target === ops.oldOrigin && ops.oldWarehouse
        ? "oldWarehouse"
        : b.target === "farm_port" && ops.resourcesPort
          ? "resourcesPort"
          : b.target === "farm_port"
            ? "islandPort"
            : "harbor";
    const n = Math.min(free, source === "harbor" ? s.harbor : ops[source]);
    if (source === "harbor") s.harbor -= n;
    else ops[source] -= n;
    if (source === "resourcesPort") ops.resourceCarry += n;
    else ops.inboundCarry += n;
    if (source !== "oldWarehouse")
      markShipmentPicked(
        s,
        source === "resourcesPort" ? "resources" : "pickles",
        b.target,
        n,
      );
    outcome = `Loaded ${n} paid ${source === "resourcesPort" ? "resource kits" : "cases"} at ${source === "oldWarehouse" ? "the old shop" : "the port"}; these must be unloaded at the shop.`;
  }
  if (a === "unload_shipment") {
    s.cafe += s.operations.inboundCarry;
    s.production.resources += s.operations.resourceCarry;
    outcome = `Received ${s.operations.inboundCarry} cases and ${s.operations.resourceCarry} resource kits at the shop.`;
    s.operations.inboundCarry = 0;
    s.operations.resourceCarry = 0;
  }
  if (a === "salvage") {
    const n = Math.min(SHORELINE.batch, s.salvageStock);
    s.salvageStock -= n;
    s.scrap += n;
    s.shorelineCleaned = (s.shorelineCleaned || 0) + n;
    outcome = `Cleaned ${n} plastic pieces from the shoreline. Recovered ${n} crafting materials.`;
  }
  const transport = a?.startsWith("buy_") ? TRANSPORT[a.slice(4)] : null;
  if (transport && spend(s, transport.price)) {
    const id = a.slice(4);
    s.vehicles.push(id);
    s.vehicleLocations[id] = {
      node: "workshop",
      position: [...NODES.workshop],
    };
    if (["bike", "van", "rocket_skates"].includes(id)) s.vehicle = id;
    outcome = `Bought ${transport.name.toLowerCase()} with ${transport.price} earned coins.`;
    milestone(s, "vehicle", id);
  }
  if (a === "hire_employee") {
    const index = s.crew.length;
    if (
      s.office.stage === "complete" &&
      index < 3 &&
      spend(s, 80 + index * 40)
    ) {
      s.crew.push(
        actor(
          `crew-${index + 1}`,
          CREW_NAMES[index],
          ["#d58b67", "#7999bd", "#b69dc8"][index],
          0.68,
        ),
      );
      const member = s.crew.at(-1);
      member.position = serviceBay(NODES[originNode(s)], index + 1);
      member.node = originNode(s);
      member.mountedMode = "foot";
      member.vehicles = [];
      member.wagePerDay = ECONOMY.wageBase + index * 2;
      member.paidDay = s.schedule.day;
      member.wageArrears = 0;
      if (spend(s, member.wagePerDay)) s.wages += member.wagePerDay;

      outcome = `${CREW_NAMES[index]} joined. Teammates take independent delivery routes at 68% of Brandon’s speed.`;
      milestone(s, "employee", CREW_NAMES[index]);
    }
  }
  if (["ride_bike", "drive_van", "walk", "use_rocket_skates"].includes(a)) {
    s.vehicle = {
      ride_bike: "bike",
      drive_van: "van",
      walk: "foot",
      use_rocket_skates: "rocket_skates",
    }[a];
    s.preferredRoadTransport = s.vehicle;
    outcome = `Now using ${s.vehicle}.`;
  }
  if (
    a?.startsWith("use_") &&
    a !== "use_rocket_skates" &&
    TRANSPORT[a.slice(4)]
  ) {
    s.preferredTransport = a.slice(4);
    outcome = `Prioritizing ${s.preferredTransport} for island deliveries when conditions allow.`;
  }
  if (a === "auto_transport") {
    s.preferredTransport = null;
    s.preferredRoadTransport = null;
    outcome = "Choosing transport automatically for every island route.";
  }
  if (a === "upgrade_van" && spend(s, 45)) {
    s.vanUpgrade = true;
    outcome = "Van drivetrain upgraded: faster roads and half the battery use.";
  }
  if (a === "pick_parcel" && s.parcel && !s.parcel.picked && s.cafe > 0) {
    s.parcel.picked = true;
    s.cafe--;
    outcome = "Tess’s pickle barrel collected from the active business.";
  }
  if (a === "collect" || a === "market") {
    const stock = "cafe",
      n = Math.min(capacity(s) - s.carry, s[stock]);
    s[stock] -= n;
    s.carry += n;
    outcome = `Collected ${n} wholesale pickle cases.`;
  }
  if (a === "deliver") {
    const n = s.carry;
    s.cafe += n;
    s.carry = 0;
    outcome = `Transferred ${n} cases to the packing room for the team.`;
  }
  if (a === "repair" && s.bridgeClosed && s.parts >= 2) {
    s.parts -= 2;
    s.bridgeClosed = false;
    s.repairs++;
    outcome = "Bridge repaired with two workshop parts.";
  }
  if (a === "charge") {
    s.battery = 100;
    s.charges++;
    outcome = "Electric transport battery fully charged.";
  }
  if (a === "patch") {
    b.repair = null;
    s.flatTire = false;
    s.tireRepairs++;
    outcome = "Tire patched. The van is ready.";
  }
  if (a === "restore") {
    s.powerOut = false;
    outcome = "Power restored to the packing room and outposts.";
  }
  if (a?.startsWith("serve_") && b.orderId) {
    const order = s.customerQueue.find((c) => c.id === b.orderId);
    if (order && order.island === "home") {
      outcome = fulfill(s, order, b)
        ? `Delivered all ${orderCases(order)} cases of ${order.order.toLowerCase()} to ${order.name}.`
        : `The complete order needs ${orderCases(order)} cases. Returning for more stock.`;
    }
  }
  if (b.lastOutcome) {
    outcome = b.lastOutcome;
    b.lastOutcome = null;
  }
  if (a === "wait") outcome = `Waiting ended. ${reason(s, baseline(s))}`;
  const d = s.decisions.find((d) => d.id === b.decisionId);
  if (d) {
    d.outcome = outcome;
    d.completedAt = s.tick;
  }
  releaseOrder(s, b);
  b.action = null;
  b.work = 0;
  b.voyage = null;
  b.transport = null;
  b.target = null;
  event(s, "outcome", outcome);
}
function markShipmentPicked(s, kind, portNode, count) {
  for (const shipment of s.operations.shipments) {
    if (
      !count ||
      shipment.status !== "port" ||
      shipment.kind !== kind ||
      shipment.portNode !== portNode
    )
      continue;
    const n = Math.min(count, shipment.remaining);
    shipment.remaining -= n;
    count -= n;
    if (!shipment.remaining) {
      shipment.status = "unloaded";
      shipment.pickedAt = s.tick;
    }
  }
  s.operations.shipments = s.operations.shipments
    .filter((x) => x.status !== "unloaded")
    .concat(
      s.operations.shipments.filter((x) => x.status === "unloaded").slice(-12),
    );
}
function fulfill(s, order, courier, outpost = null, reservedParcel = false) {
  const index = s.customerQueue.findIndex((c) => c.id === order.id);
  if (index < 0) return false;
  const cases = orderCases(order);
  if (reservedParcel) {
    if (!s.parcel?.picked) return false;
    s.parcel = null;
  } else if (courier.id === "brandon") {
    if (s.carry < cases) return false;
    s.carry -= cases;
  } else if (outpost) {
    if (outpost.stock < cases) return false;
    outpost.stock -= cases;
  } else {
    if (courier.carry < cases) return false;
    courier.carry -= cases;
  }
  s.customerQueue.splice(index, 1);
  s.queue.splice(index, 1);
  const wait = order.serviceWait ?? s.tick - order.arrived,
    promisedTicks = order.promisedTicks ?? Math.max(165, order.patience),
    onTime = wait <= promisedTicks;
  const reward =
    (reservedParcel ? 18 : (order.island === "home" ? 7 : 14) * cases) +
    (onTime ? (reservedParcel ? 8 : order.tip) : 0) +
    (s.tools.cooler === 2 ? 1 : 0) +
    (order.island !== "home" ? (s.tools.scanner || 0) * 4 : 0);
  s.money += reward;
  s.earned += reward;
  s.served++;
  s.casesDelivered = (s.casesDelivered ?? s.served - 1) + cases;
  s.waitTotal += wait;
  courier.deliveries = (courier.deliveries || 0) + 1;
  courier.earned = (courier.earned || 0) + reward;
  if (courier.id === "brandon" && s.schedule.phase === "night_deliveries") {
    s.schedule.nightDelivered++;
    s.schedule.totalNightDeliveries++;
  }
  if (outpost) {
    outpost.served++;
    outpost.earned += reward;
  }
  const historical = {
    ...order,
    cases,
    servedAt: s.tick,
    paid: reward,
    wait,
    elapsedWait: s.tick - order.arrived,
    closedWait: order.closedWait || 0,
    promisedTicks,
    onTime,
    courier: courier.name,
  };
  s.customerHistory.push(historical);
  s.customerHistory = s.customerHistory.slice(-80);
  const stat = (s.customerStats[order.customerId] ||= {
    orders: 0,
    onTime: 0,
    totalWait: 0,
    totalRating: 0,
    reviews: 0,
    lastReviewAt: 0,
  });
  stat.orders++;
  stat.onTime += onTime ? 1 : 0;
  stat.totalWait += wait;
  stat.windowWait = (stat.windowWait || 0) + wait;
  stat.windowOnTime = (stat.windowOnTime || 0) + (onTime ? 1 : 0);
  if (stat.orders % 3 === 0) {
    const averageWait = Math.round(stat.windowWait / 3),
      ratio = stat.windowOnTime / 3;
    const rating = deliveryRating(
      Math.round(averageWait / Math.max(1, promisedTicks / 150)),
    );
    // Prime stride avoids repeating a customer's wording within 1,000 reviews.
    const variant =
      (stat.reviews * 137 +
        Math.abs(s.seed) * 17 +
        PEOPLE.findIndex((p) => p.id === order.customerId) * 71) %
      1000;
    const text = reviewText(rating, variant);
    const review = {
      id: `review-${s.rating.count}`,
      customerId: order.customerId,
      name: order.name,
      role: order.role,
      island: order.island,
      rating,
      text,
      tick: s.tick,
      orders: stat.orders,
      onTime: stat.windowOnTime,
      averageWait,
      courier: courier.name,
    };
    s.reviews.push(review);
    s.reviews = s.reviews.slice(-60);
    s.rating.count++;
    s.rating.total += rating;
    s.rating.average = Math.round((s.rating.total / s.rating.count) * 10) / 10;
    stat.reviews++;
    stat.totalRating += rating;
    stat.lastReviewAt = s.tick;
    stat.windowWait = 0;
    stat.windowOnTime = 0;
    event(
      s,
      "review",
      `${order.name} left ${rating} stars after ${stat.orders} orders.`,
    );
  }
  courier.orderId = null;
  event(
    s,
    "delivery",
    `${courier.name} delivered ${cases} ${cases === 1 ? "case" : "cases"} to ${order.name} at ${order.role}: +${reward} coins${onTime ? " · on time" : " · late"}.`,
  );
  return true;
}

export function seaRoute(islandId) {
  const origin = [...HARBOR_BERTH],
    island = ISLANDS[islandId] || (islandId === "reef" ? REEF : FARM);
  const paths = {
    // West-bound routes round the freighter's berth off the pier's west side.
    juniper: [
      origin,
      [-4, 24],
      [-16, 24],
      [-16, -15.5],
      [island.x, -15.5],
      island.dock,
    ],
    ridge: [origin, [-4, 24], [-16, 24], [-16, -23.2], island.dock],
    copper: [origin, [24, 14], [24, -10.2], island.dock],
    festival: [
      origin,
      [24, 14],
      [28, 14],
      [28, 23],
      [island.x, 23],
      island.dock,
    ],
    sunset: [
      origin,
      [-4, 24],
      [-16, 24],
      [-16, 31.5],
      [island.x, 31.5],
      island.dock,
    ],
    reef: [origin, [17, 14], [17, 37.5], [island.x, 37.5], island.dock],
    farm: [origin, [0, 16], [4, 16], island.dock],
  };
  return (paths[islandId] || paths.farm).map((p) => [...p]);
}
function length(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function makeVoyage(
  s,
  b,
  mode,
  islandId,
  customer = null,
  purpose = "customer",
) {
  const island = ISLANDS[islandId] || (islandId === "reef" ? REEF : FARM),
    origin = mode === "sailboat" ? HARBOR_BERTH : NODES.helipad;
  const dock = mode === "sailboat" ? island.dock : island.landing;
  if (b.id === "brandon") {
    const cap =
      TRANSPORT[mode].capacity +
      (mode === "jetpack"
        ? 0
        : s.tools.cargo_rack === 2
          ? 5
          : s.tools.cargo_rack
            ? 3
            : 0);
    b.stowedCargo = Math.max(0, s.carry - cap);
    s.carry -= b.stowedCargo;
  }
  const stages = [],
    baseAltitude = mode === "sailboat" ? 0.08 : 0.48,
    cruise = mode === "helicopter" ? 7 : 5;
  let current = [...origin],
    height = baseAltitude;
  function stage(
    to,
    ticks,
    phase,
    onShore = false,
    nextHeight = height,
    handoff = false,
  ) {
    stages.push({
      from: [...current],
      to: [...to],
      ticks: Math.max(1, ticks),
      phase,
      onShore,
      fromAltitude: height,
      toAltitude: nextHeight,
      handoff,
    });
    current = [...to];
    height = nextHeight;
  }
  stage(origin, 3, `Boarding ${TRANSPORT[mode].name.toLowerCase()}`);
  const travelSpeed = TRANSPORT[mode].speed;
  if (mode === "sailboat") {
    const points = seaRoute(islandId);
    for (const p of points.slice(1))
      stage(p, length(current, p) / travelSpeed, `Sailing to ${island.name}`);
  } else if (mode === "teleporter") {
    stage(origin, 3, "Charging the portal");
    stage(dock, 1, `Teleporting to ${island.name}`);
    stage(dock, 2, "Portal arrival");
  } else {
    stage(origin, 4, "Taking off", false, cruise);
    stage(
      dock,
      length(current, dock) / travelSpeed,
      `Flying to ${island.name}`,
      false,
      cruise,
    );
    stage(dock, 4, "Landing", false, baseAltitude);
  }
  stage(dock, 3, "Disembarking at the landing", false, baseAltitude);
  const landing = [...dock],
    recipient =
      customer?.position ||
      (islandId === "farm" ? [FARM.x, FARM.z - 2] : [island.x, island.z + 1.5]);
  let shorePath;
  if (islandId === "reef")
    shorePath =
      mode === "sailboat"
        ? [[REEF.x, REEF.z + 3.2], [REEF.x, REEF.z + 1.9], recipient]
        : [recipient];
  else if (islandId === "farm")
    shorePath =
      mode === "sailboat" ? [[FARM.x, FARM.z - 2.8], recipient] : [recipient];
  else
    shorePath =
      mode === "sailboat"
        ? [[island.x, island.z + 2.4], [island.x, island.z + 1.4], recipient]
        : [[island.x + 2, island.z + 1.4], recipient];
  for (const point of shorePath)
    if (length(current, point) > 0.01)
      stage(
        point,
        length(current, point) / 0.5,
        `Walking to ${customer?.name || "the outpost"}`,
        true,
        0.43,
      );
  if (purpose === "negotiation") {
    stage(current, 4, "Discussing the 200-coin island offer", true, 0.43);
    stage(
      current,
      4,
      "Counter-offering 160 coins with the contractor plan",
      true,
      0.43,
    );
  }
  stage(
    current,
    purpose === "negotiation" ? 4 : 3,
    purpose === "negotiation"
      ? "Signing the island development agreement"
      : customer
        ? `Handing jars to ${customer.name}`
        : "Transferring wholesale cases",
    true,
    0.43,
    true,
  );
  if (purpose === "vacation")
    stage(
      current,
      VACATION_POLICY.stayMinutes,
      "Resting at Sunset Bay Resort",
      true,
      0.43,
    );
  const returnShore = [...shorePath.slice(0, -1).reverse(), landing];
  for (const point of returnShore)
    if (length(current, point) > 0.01)
      stage(
        point,
        length(current, point) / 0.5,
        "Returning to transport",
        true,
        0.43,
      );
  height = baseAltitude;
  stage(dock, 3, "Boarding for the return trip", false, baseAltitude);
  if (mode === "sailboat") {
    for (const point of seaRoute(islandId).slice(0, -1).reverse())
      stage(point, length(current, point) / travelSpeed, "Sailing home");
  } else if (mode === "teleporter") {
    stage(dock, 3, "Charging return portal");
    stage(origin, 1, "Teleporting home");
    stage(origin, 2, "Portal arrival");
  } else {
    stage(dock, 4, "Taking off for home", false, cruise);
    stage(
      origin,
      length(current, origin) / travelSpeed,
      "Flying home",
      false,
      cruise,
    );
    stage(origin, 4, "Landing at home", false, baseAltitude);
  }
  stage(origin, 3, "Disembarking at home", false, baseAltitude);
  b.voyage = {
    mode,
    island: islandId,
    destination: island.name,
    progress: 0,
    position: [...origin],
    vehiclePosition: [...origin],
    courierPosition: [...origin],
    altitude: baseAltitude,
    onShore: false,
    phase: stages[0].phase,
    waypoints: stages.filter((x) => !x.onShore).map((x) => x.to),
    stages,
    stageIndex: 0,
    stageWork: 0,
    totalTicks: stages.reduce((n, x) => n + x.ticks, 0),
    elapsed: 0,
    purpose,
    delivered: false,
    dock: [...dock],
  };
  s.transportUsage[mode] = (s.transportUsage[mode] || 0) + 1;
  if (mode === "jetpack") s.battery = Math.max(0, s.battery - 18);
  if (mode === "teleporter") s.battery = Math.max(0, s.battery - 12);
}
function handoff(s, b, v) {
  if (v.delivered) return;
  v.delivered = true;
  const order = s.customerQueue.find((c) => c.id === b.orderId);
  if (v.purpose === "customer" && order) {
    b.lastOutcome = fulfill(s, order, b)
      ? `${b.name} delivered all ${orderCases(order)} cases to ${order.name} on ${v.destination}.`
      : `${order.name}'s complete order needs more stock. Returning home.`;
    if (b.id !== "brandon") releaseOrder(s, b);
  }
  if (b.id !== "brandon") return;
  if (v.purpose === "vacation") {
    arriveVacation(s);
    b.lastOutcome =
      "Paid for Sunset Bay Resort and arrived for a full two-hour stay.";
  }
  if (v.purpose === "negotiation") {
    s.construction.deal.status = "agreed";
    s.construction.deal.negotiatedAt = s.tick;
    b.lastOutcome =
      "Visited Cay Development Co., compared the 200-coin asking price, countered with 160 and signed the island development agreement.";
  }
  if (v.purpose === "farm") {
    const n = Math.min(
      capacity(s) - s.carry - (b.stowedCargo || 0),
      s.orchard,
      TRANSPORT[v.mode].capacity +
        (s.tools.cargo_rack === 2 ? 5 : s.tools.cargo_rack ? 3 : 0),
    );
    s.orchard -= n;
    s.carry += n;
    b.lastOutcome = `Collected ${n} farm cases from ${v.destination}.`;
  }
  if (v.purpose === "outpost") {
    const outpost = s.outposts[v.island],
      n = Math.min(
        s.carry,
        TRANSPORT[v.mode].capacity +
          (s.tools.cargo_rack === 2 ? 5 : s.tools.cargo_rack ? 3 : 0),
      );
    if (outpost) {
      outpost.stock += n;
      s.carry -= n;
      b.lastOutcome = `Delivered ${n} cases to ${v.destination}.`;
    }
  }
  if (v.purpose === "parcel" && s.parcel?.picked) {
    const reward =
      18 + (s.tick <= s.parcel.deadline ? 8 : 0) + (s.tools.scanner || 0) * 4;
    const customer = PEOPLE.find((p) => p.id === "tess");
    const reserved = {
      ...customer,
      id: `parcel-${s.parcelsDelivered}`,
      cases: 1,
      customerId: customer.id,
      arrived: s.parcel.created,
      patience: s.parcel.deadline - s.parcel.created,
      assigned: "brandon",
    };
    s.customerQueue.push(reserved);
    s.queue.push(reserved.arrived);
    s.arrivals++;
    fulfill(s, reserved, b, null, true);
    s.parcelsDelivered++;
    b.lastOutcome = `Tess received her reserved barrel. Earned ${reward + (s.tools.cooler === 2 ? 1 : 0)} coins.`;
  }
}
function voyageStep(s, b) {
  const v = b.voyage,
    stage = v.stages[v.stageIndex];
  if (voyageHold(s, b, event)) return false;
  const weatherFactor =
    !stage.onShore && s.storm
      ? v.mode === "sailboat"
        ? 0.65
        : v.mode === "helicopter"
          ? s.tools.winch === 2
            ? 0.75
            : 0.55
          : v.mode === "jetpack"
            ? 0.5
            : 1
      : 1;
  const advance = Math.min(
    stage.ticks - v.stageWork,
    v.purpose === "vacation" && stage.phase === "Resting at Sunset Bay Resort"
      ? 1
      : b.efficiency * workweekEfficiency(s, b) * weatherFactor,
  );
  v.stageWork += advance;
  v.elapsed += advance;
  const fraction = Math.min(1, v.stageWork / stage.ticks),
    t = fraction * fraction * (3 - 2 * fraction);
  const pos = stage.from.map((x, i) => x + (stage.to[i] - x) * t);
  v.progress = Math.min(1, v.elapsed / v.totalTicks);
  v.phase = stage.phase;
  if (v.purpose === "negotiation") {
    if (stage.phase.startsWith("Discussing"))
      s.construction.deal.status = "offer";
    if (stage.phase.startsWith("Counter-offering"))
      s.construction.deal.status = "counteroffer";
  }
  v.onShore = stage.onShore;
  v.courierPosition = pos;
  if (!stage.onShore) {
    v.position = pos;
    v.vehiclePosition = pos;
    v.altitude =
      stage.fromAltitude + (stage.toAltitude - stage.fromAltitude) * t;
  } else {
    v.position = [...v.dock];
    v.vehiclePosition = [...v.dock];
    v.altitude = v.mode === "sailboat" ? 0.08 : 0.48;
  }
  if (fraction >= 1) {
    if (
      v.purpose === "vacation" &&
      stage.phase === "Resting at Sunset Bay Resort"
    ) {
      completeVacation(s);
      b.lastOutcome =
        "Completed a paid resort stay, restored energy and earned a short Monday productivity boost.";
    }
    if (stage.handoff) handoff(s, b, v);
    v.stageIndex++;
    v.stageWork = 0;
    if (v.stageIndex >= v.stages.length) {
      s.voyages++;
      b.voyage = null;
      if (b.id === "brandon") {
        s.carry += b.stowedCargo || 0;
        b.stowedCargo = 0;
      }
      b.position = [...NODES[b.node]];
      return true;
    }
  }
  return false;
}
// Where the ridden vehicle is left when Brandon goes inside to rest.
const HOME_BAY = [8.7, -3.8];
function transitionStep(s, b, to) {
  const from = b.mountedMode || "foot";
  if (from === to && !b.transition) return true;
  if (!b.transition)
    b.transition = {
      from,
      to,
      phase: to === "foot" ? "dismounting" : "boarding",
      progress: 0,
      duration: to === "foot" ? 3 : 4,
      startedAt: s.tick,
    };
  b.transition.progress = Math.min(
    1,
    b.transition.progress + 1 / b.transition.duration,
  );
  if (b.transition.progress >= 1) {
    b.mountedMode = b.transition.to;
    b.transition = null;
    return true;
  }
  return false;
}
function buildingWalk(b, visit) {
  let budget = 0.32;
  while (visit.points.length && budget > 0.00001) {
    const goal = visit.points[0],
      distance = length(b.position, goal);
    if (distance < 0.00001) {
      visit.points.shift();
      continue;
    }
    const amount = Math.min(budget, distance);
    b.position = b.position.map(
      (v, i) => v + ((goal[i] - v) * amount) / distance,
    );
    budget -= amount;
    if (amount >= distance - 0.00001) visit.points.shift();
  }
  return !visit.points.length;
}

function roadStep(s, b, target, mode, continuing = false) {
  if (b.transition) {
    transitionStep(s, b, b.transition.to);
    return false;
  }
  const nav = (b.navigationWait ||= { position: [...b.position], ticks: 0 });
  const advanced =
    Math.hypot(...b.position.map((v, i) => v - nav.position[i])) > 0.005;
  nav.ticks = advanced ? 0 : nav.ticks + 1;
  nav.position = [...b.position];
  if (b.yieldingTo && nav.ticks > 16 && target !== b.node) {
    const from = [b.move?.from, b.move?.to, b.node]
      .filter((n) => NODES[n])
      .sort(
        (a, c) => length(NODES[a], b.position) - length(NODES[c], b.position),
      )[0];
    const to =
      from === b.move?.to
        ? b.move?.from
        : b.move?.to || route(b.node, target, s.bridgeClosed, s.traffic)[1];
    if (NODES[from] && NODES[to]) {
      for (const [node, owner] of Object.entries(s.trafficJunctions || {}))
        if (owner === b.id) delete s.trafficJunctions[node];
      b.avoidance = null;
      const escape = yieldAtJunction(s, b, from, to, NODES);
      if (length(escape, b.position) > 0.005) {
        b.position = escape;
        nav.ticks = 0;
        return false;
      }
    }
  }
  // Changing vehicles means dismounting and walking to the parked equipment.
  // A punctured van must not prevent the legal walk/bicycle fallback.
  const changingRoadMode = [
    "ride_bike",
    "drive_van",
    "use_rocket_skates",
    "walk",
  ].includes(b.action);
  if (changingRoadMode) mode = "foot";
  if (
    mode === "van" &&
    s.flatTire &&
    b.id === "brandon" &&
    !b.move &&
    target !== b.node
  )
    return false;
  // Retrieve the actual parked equipment before starting another road leg.
  // This walk is persistent so interruptions/reloads cannot move the vehicle.
  if (
    b.id === "brandon" &&
    !b.move &&
    target &&
    b.node !== target &&
    !changingRoadMode &&
    mode !== "foot" &&
    (b.mountedMode || "foot") === "foot"
  ) {
    const parked = s.vehicleLocations?.[mode];
    if (parked?.node && parked.node !== b.node) {
      roadStep(s, b, parked.node, "foot", continuing);
      return false;
    }
    if (!b.transition) {
      b.vehicleApproach ||= {
        mode,
        points: [[...(parked?.position || b.position)]],
      };
      const before = [...b.position];
      if (!buildingWalk(b, b.vehicleApproach)) return false;
      b.vehicleApproach = null;
      if (length(before, b.position) > 0.00001) return false;
    }
    if (!transitionStep(s, b, mode)) return false;
  }
  if (b.move && !b.move.docking) {
    if (
      b.move.walkToVehicle &&
      b.move.progress < Math.min(2, b.move.distance - 0.01)
    )
      mode = "foot";
    else {
      b.move.walkToVehicle = false;
      if (!transitionStep(s, b, mode)) return false;
    }
  }
  if (b.move?.docking) mode = "foot";
  if (b.move && slipHold(b)) return false;
  if (b.move) {
    const m = b.move,
      base =
        mode === "foot"
          ? 0.48
          : mode === "jetpack"
            ? 0.95
            : TRANSPORT[mode]?.speed || 0.48;
    const weather = s.storm
      ? s.tools.rain_gear === 2
        ? 1
        : s.tools.rain_gear
          ? 0.85
          : 0.6
      : 1;
    const speed =
      base *
      b.efficiency *
      workweekEfficiency(s, b) *
      weather *
      (1 + (s.tools.navigation || 0) * 0.15) *
      (mode === "van" && s.vanUpgrade ? 1.2 : 1) *
      (mode === "van" && (s.battery <= 0 || s.flatTire) ? 0.35 : 1);
    const distance = Math.min(speed, m.distance - m.progress);
    if (b.target === m.to && m.distance - m.progress - distance < 1.5) {
      if (!m.docking) b.roadVehiclePosition = [...b.position];
      m.docking = true;
      if (b.id === "brandon" && mode !== "foot")
        s.vehicleLocations[mode] = {
          node: m.to,
          position: [...b.roadVehiclePosition],
        };
      if ((b.mountedMode || "foot") !== "foot" || b.transition) {
        transitionStep(s, b, "foot");
        return false;
      }
    }
    const t = Math.min(1, (m.progress + distance) / m.distance);
    const proposed = NODES[m.from].map((x, i) => x + (NODES[m.to][i] - x) * t);
    const before = [...b.position];
    // A leg that starts off the road line (leaving a bay, a door or a yard)
    // fades its sideways offset out instead of snapping onto the line.
    if (m.offset) {
      const fade = Math.max(0, 1 - (m.progress - m.start) / m.blend);
      if (fade > 0 && t < 1) proposed.forEach((x, i) => (proposed[i] = x + m.offset[i] * fade));
    }
    b.navigationStep = speed;
    b.navigationTrail = null;
    const traffic = constrainRoadMotion(s, b, proposed, NODES);
    b.yieldingTo = traffic.yieldingTo;
    if (!traffic.allowed) return false;
    // The lane-to-bay switch at a dock never moves a walker faster than walking.
    if (m.docking) {
      const hop = length(before, traffic.position),
        reach = speed * 1.25 + 0.02;
      if (hop > reach)
        traffic.position = before.map(
          (v, i) => v + ((traffic.position[i] - v) * reach) / hop,
        );
    }
    b.position = traffic.position;
    if (traffic.progressFactor === 0) return false;
    const slipAt = slipCheck(s, b, mode, before, b.position, event);
    if (slipAt) {
      b.position = slipAt;
      m.progress = length(NODES[m.from], slipAt);
      return false;
    }
    m.progress += distance;
    s.travel += distance;
    if (["van", "rocket_skates"].includes(mode) && b.id === "brandon")
      s.battery = Math.max(
        0,
        s.battery - distance * (s.vanUpgrade ? 0.22 : 0.44),
      );
    s.transportUsage[mode] = (s.transportUsage[mode] || 0) + distance;
    if (t >= 1) {
      b.node = m.to;
      if (
        b.id === "brandon" &&
        b.target === m.to &&
        s.vehicle !== "foot" &&
        !changingRoadMode
      )
        s.vehicleLocations[s.vehicle] = {
          node: m.to,
          position: [...(b.roadVehiclePosition || b.position)],
        };
      b.move = null;
    }
    return false;
  }
  if (target && b.node !== target) {
    const path = route(b.node, target, s.bridgeClosed, s.traffic);
    if (path.length > 1) {
      const to = path[1];
      const entry = roadEntryAllowed(s, b, b.node, to, mode);
      if (!entry.allowed) {
        b.yieldingTo = entry.yieldingTo;
        b.position = yieldAtJunction(s, b, b.node, to, NODES);
        return false;
      }
      b.roadVehiclePosition = null;
      b.move = {
        from: b.node,
        to,
        walkToVehicle:
          b.id !== "brandon" && (!b.mountedMode || b.mountedMode === "foot"),
        progress: Math.max(
          b.id === "brandon" ? -4 : 0,
          Math.min(
            length(NODES[b.node], NODES[to]) - 0.01,
            ((b.position[0] - NODES[b.node][0]) *
              (NODES[to][0] - NODES[b.node][0]) +
              (b.position[1] - NODES[b.node][1]) *
                (NODES[to][1] - NODES[b.node][1])) /
              length(NODES[b.node], NODES[to]),
          ),
        ),
        distance: length(NODES[b.node], NODES[to]),
      };
      {
        const m = b.move,
          at = m.progress / m.distance;
        const off = b.position.map(
          (x, i) => x - (NODES[m.from][i] + (NODES[m.to][i] - NODES[m.from][i]) * at),
        );
        if (length(off, [0, 0]) > 0.05) {
          m.offset = off;
          m.start = m.progress;
          m.blend = Math.max(1, Math.min(4, m.distance * 0.7));
        }
      }
      // Enter the next edge immediately: a graph waypoint is not a stop.
      if (!continuing) return roadStep(s, b, target, mode, true);
    }
    return false;
  }
  return transitionStep(s, b, "foot");
}
function actionVoyage(s, b) {
  if (b.action === "vacation_resort")
    return {
      mode: seaVehicle(s),
      island: "sunset",
      order: {
        name: VACATION_POLICY.resort,
        position: [ISLANDS.sunset.x, ISLANDS.sunset.z + 1.4],
      },
      purpose: "vacation",
    };
  if (b.action === "negotiate_island")
    return {
      mode: seaVehicle(s),
      island: "copper",
      order: {
        name: "Cay Development Co.",
        position: [ISLANDS.copper.x - 1.8, ISLANDS.copper.z + 1.5],
      },
      purpose: "negotiation",
    };
  const action = b.action,
    order = s.customerQueue.find((c) => c.id === b.orderId);
  if (action?.startsWith("serve_") && order?.island !== "home" && order)
    return {
      mode: b.transport || seaVehicle(s),
      island: order.island,
      order,
      purpose: "customer",
    };
  if (action === "sail" || action === "fly")
    return {
      mode: action === "sail" ? "sailboat" : "helicopter",
      island: "farm",
      purpose: "farm",
    };
  if (action === "ship_parcel" || action === "fly_parcel")
    return {
      mode: action === "ship_parcel" ? "sailboat" : "helicopter",
      island: "reef",
      order: PEOPLE.find((p) => p.id === "tess"),
      purpose: "parcel",
    };
  if (action?.startsWith("supply_") || action?.startsWith("air_"))
    return {
      mode: action.startsWith("air_") ? "helicopter" : "sailboat",
      island: action.replace(/^(supply|air)_/, ""),
      purpose: "outpost",
    };
  return null;
}
function workDuration(s, a) {
  return a === "patch"
    ? s.tools.repair_kit === 2
      ? 12
      : s.tools.repair_kit
        ? 18
        : 24
    : a?.startsWith("craft_")
      ? 8
      : a?.startsWith("upgrade_")
        ? 10
        : a?.startsWith("expand_")
          ? 6
          : a?.startsWith("buy_")
            ? 7
            : a?.startsWith("serve_")
              ? 2
              : {
                  collect: s.tools.cargo_dolly ? 1 : 3,
                  market: s.tools.cargo_dolly ? 1 : 3,
                  deliver: 2,
                  charge: 7,
                  restore: 4,
                  salvage: SHORELINE.duration,
                  repair: 7,
                  hire_employee: 8,
                  wait: 3,
                  rest: 3,
                  pickup_shipment: 3,
                  unload_shipment: 3,
                  plant_crop: 6,
                }[a] || 2;
}
function crewStep(s, b) {
  const origin = originNode(s);
  if (b.voyage) {
    if (voyageStep(s, b)) {
      b.action = "return";
      b.target = origin;
    }
    return;
  }
  if (b.action === "return") {
    if (roadStep(s, b, origin, b.vehicle)) {
      s.cafe += b.carry;
      b.carry = 0;
      b.action = null;
      b.work = 0;
    }
    return;
  }
  if (b.action === "restock") {
    if (!roadStep(s, b, b.target, b.vehicle)) return;
    const source = b.target === "farm_port" ? "islandPort" : "harbor",
      available = source === "harbor" ? s.harbor : s.operations.islandPort;
    const cases = Math.min(capacity({ ...s, vehicle: b.vehicle }), available);
    b.carry += cases;
    if (source === "harbor") s.harbor -= cases;
    else s.operations.islandPort -= cases;
    markShipmentPicked(s, "pickles", b.target, cases);
    b.action = "return";
    b.target = origin;
    return;
  }
  if (!b.action) {
    if (s.retirement.ready) {
      if (b.node !== "home") {
        b.target = "home";
        roadStep(s, b, "home", b.vehicle);
      }
      return;
    }
    if (!laborAvailable(s, b)) {
      if (
        !b.labor?.pending.length &&
        !b.labor?.breakRemaining &&
        b.node !== "home"
      ) {
        b.target = "home";
        roadStep(s, b, "home", b.vehicle);
      }
      return;
    }
    if (s.powerOut && !s.tools.generator) return;
    if (b.node !== origin) {
      b.action = "return";
      b.target = origin;
      return;
    }
    b.vehicle =
      ["rocket_skates", "bike", "van"].find((x) => b.vehicles.includes(x)) ||
      "foot";
    const cap = capacity({ ...s, vehicle: b.vehicle }),
      order = nearestOrder(s, { courier: b, stock: Math.min(s.cafe, cap) });
    if (!order) {
      if (s.cafe < 3 && (s.harbor || s.operations.islandPort)) {
        if (b.vehicles.includes("van")) b.vehicle = "van";
        b.action = "restock";
        b.target = s.operations.islandPort ? "farm_port" : "harbor_dock";
      }
      return;
    }
    order.assigned = b.id;
    b.orderId = order.id;
    b.action = `serve_${order.customerId}`;
    b.transport = order.island === "home" ? null : orderTransport(s, order, b);
    b.target = targetFor(s, b.action, order, b.transport);
    b.carry = orderCases(order);
    s.cafe -= b.carry;
    b.work = 0;
  }
  if (!roadStep(s, b, b.target, b.vehicle)) return;
  const order = s.customerQueue.find((c) => c.id === b.orderId);
  if (order?.island !== "home" && order) {
    makeVoyage(s, b, b.transport, order.island, order, "customer");
    return;
  }
  b.work += b.efficiency * workweekEfficiency(s, b);
  if (b.work >= 3) {
    if (order) fulfill(s, order, b);
    releaseOrder(s, b);
    b.action = "return";
    b.target = origin;
    b.work = 0;
  }
}
export function inventoryTotal(s) {
  return (
    (s.parcel?.picked ? 1 : 0) +
    (s.operations?.inboundCarry || 0) +
    (s.operations?.islandPort || 0) +
    (s.operations?.oldWarehouse || 0) +
    (s.operations?.shipments || [])
      .filter((x) => x.kind === "pickles" && x.status === "at_sea")
      .reduce((n, x) => n + x.cases, 0) +
    ["growing", "fermenting", "packing"].reduce(
      (n, key) =>
        n + (s.production?.[key] || []).reduce((m, b) => m + b.cases, 0),
      0,
    ) +
    (s.harbor || 0) +
    (s.market || 0) +
    (s.orchard || 0) +
    (s.cafe || 0) +
    (s.carry || 0) +
    (s.brandon?.stowedCargo || 0) +
    (s.hazards?.creature?.pickles || 0) +
    (s.casesDelivered ?? s.served ?? 0) +
    (s.waste || 0) +
    (s.lost || 0) +
    Object.values(s.outposts || {}).reduce((n, o) => n + o.stock, 0) +
    (s.crew || []).reduce((n, c) => n + c.carry, 0)
  );
}
export function step(s) {
  if (s.status !== "running") return s;
  normalizeRealism(s);
  normalizeCombat(s);
  normalizeHazards(s);
  s.tick++;
  if (s.stormOverride !== null && s.tick >= s.stormOverrideUntil)
    s.stormOverride = null;
  updateWorldTime(s);
  if (s.daytimeUntil && s.tick >= s.daytimeUntil) s.daytimeUntil = null;
  const interval = 18 + (Math.abs(s.seed) % 3) * 2;
  businessStep(s, { event, spend, dayTicks: DAY_TICKS });
  updateShift(s);
  const serviceOpen = ordersOpen(s);
  if (serviceOpen && s.tick % interval === 0) addCustomers(s, 1);
  for (const order of s.customerQueue)
    if (order.serviceWait != null) {
      if (serviceOpen) order.serviceWait++;
      else order.closedWait++;
    }
  if (s.tick % 60 === 0) {
    s.salvageStock = Math.min(30, s.salvageStock + 6);
    s.parts = Math.min(6, s.parts + 1);
  }
  if (
    s.tools.solar_panel &&
    s.world.light > 0.5 &&
    ["clear", "cloudy"].includes(s.world.weather) &&
    !s.brandon.move &&
    !s.brandon.voyage
  )
    s.battery = Math.min(100, s.battery + s.tools.solar_panel * 0.3);
  if (serviceOpen && s.customerQueue.length && s.cafe === 0) s.stockoutTicks++;
  if (s.tick % 90 === 0 && s.cafe > 9 && !s.tools.cooler) {
    s.cafe--;
    s.waste++;
    event(s, "waste", "One unchilled packing room case spoiled.");
  }
  // Satellite inventory is storage only. Every customer handoff requires a
  // named courier, a real trip and carried stock from the active workplace.
  for (const member of s.crew) crewStep(s, member);
  const b = s.brandon;
  replanAtBoundary(s);
  // Recover legacy snapshots whose disruption cleared an action mid-edge.
  if (!b.action && b.move && !b.combat && !b.slip) {
    roadStep(s, b, b.move.to, b.mountedMode || s.vehicle);
  }
  // A construction completion can relocate the business mid-trip. Finish the
  // current road edge, then route the courier to the actual new loading dock.
  if (
    [
      "collect",
      "deliver",
      "unload_shipment",
      "order_import",
      "buy_resources",
      "hire_employee",
      "pick_parcel",
    ].includes(b.action)
  )
    b.target = originNode(s);
  if (
    b.buildingVisit?.warehouse &&
    b.action !== "patch" &&
    b.buildingVisit.origin !== b.target &&
    b.buildingVisit.phase !== "exiting"
  ) {
    b.buildingVisit.phase = "exiting";
    b.buildingVisit.points = [
      b.buildingVisit.door,
      b.buildingVisit.returnPosition,
    ];
  }
  b.vehicle = s.vehicle;
  if (
    b.homeRoutine?.phase === "sleeping" &&
    ["van", "rocket_skates"].includes(b.homeRoutine.vehicle)
  )
    s.battery = Math.min(100, s.battery + 0.5);
  creatureStep(s, event);
  spillStep(s);
  const fighting =
    cleanupStep(s, event, NODES) || combatStep(s, event, NODES, route);
  if (b.homeRoutine?.phase === "exiting" && !fighting) {
    const routine = b.homeRoutine;
    const progress = Math.min(1, ++routine.elapsed / 8);
    b.position = routine.start.map(
      (v, i) => v + (NODES.home[i] - v) * progress,
    );
    if (progress === 1) b.homeRoutine = null;
  } else if (
    !fighting &&
    b.action !== "patch" &&
    b.buildingVisit?.phase === "exiting"
  ) {
    if (buildingWalk(b, b.buildingVisit)) b.buildingVisit = null;
  } else if (fighting) {
    // Encounter timing advances; the interrupted trip, work and cargo stay intact.
  } else if (b.voyage) {
    if (voyageStep(s, b)) finish(s);
  } else if (b.action) {
    const a = b.action,
      target = b.target ?? ACTIONS[a]?.target;
    if (a === "patch") {
      b.work++;
      const progress = Math.min(1, b.work / workDuration(s, a));
      b.repair = {
        phase: ["inspect", "jack", "remove", "patch", "replace", "lower"][
          Math.min(5, Math.floor(progress * 6))
        ],
        progress,
      };
      if (b.work >= workDuration(s, a)) finish(s);
    } else if (
      a === "rest" &&
      target === "home" &&
      roadStep(s, b, target, s.vehicle)
    ) {
      b.homeRoutine ||= {
        phase: "parking",
        elapsed: 0,
        vehicle: s.vehicle,
        // Only a vehicle still under Brandon is driven into the bay; one he has
        // already dismounted from stays exactly where it was left.
        mounted: (b.mountedMode || "foot") !== "foot" || !!b.transition,
        start: [...b.position],
      };
      const routine = b.homeRoutine;
      routine.elapsed++;
      // The rider drives the last metres into the parking bay, so the vehicle is
      // parked exactly where it stopped instead of being placed beside the door.
      if (routine.phase === "parking" && routine.mounted) {
        const progress = Math.min(1, routine.elapsed / 4);
        b.position = routine.start.map(
          (v, i) => v + (HOME_BAY[i] - v) * progress,
        );
      }
      if (routine.phase === "parking" && routine.elapsed >= 4) {
        routine.start = [...b.position];
        if (
          routine.vehicle !== "foot" &&
          (routine.mounted || !s.vehicleLocations?.[routine.vehicle])
        ) {
          s.vehicleLocations[routine.vehicle] = {
            node: "home",
            position: [...HOME_BAY],
          };
          if (routine.vehicle === "van")
            s.parkedVan = { node: "home", position: [...HOME_BAY] };
        }
        b.mountedMode = "foot";
        routine.phase = "entering";
        routine.elapsed = 0;
      } else if (routine.phase === "sleeping") {
        if (routine.elapsed >= 3) finish(s);
      } else if (routine.phase === "entering") {
        const progress = Math.min(1, routine.elapsed / 8);
        b.position = routine.start.map(
          (v, i) => v + ([7.45, -4.85][i] - v) * progress,
        );
        if (progress === 1) {
          routine.phase = "sleeping";
          routine.elapsed = 0;
          finish(s);
          event(
            s,
            "rest",
            shiftEnded(s)
              ? "Brandon parked his transport and went inside until the next shift."
              : "Brandon parked his transport and went inside to rest.",
          );
        }
      }
    } else if (roadStep(s, b, target, s.vehicle)) {
      if (a === "salvage") {
        b.buildingVisit ||= {
          phase: "entering",
          shoreline: true,
          door: [...SHORELINE.approach[0]],
          returnPosition: [...b.position],
          points: SHORELINE.approach.map((p) => [...p]),
        };
        if (b.buildingVisit.phase === "entering") {
          if (buildingWalk(b, b.buildingVisit))
            b.buildingVisit.phase = "inside";
          return s;
        }
      }
      const warehouseAction =
        [
          "collect",
          "deliver",
          "unload_shipment",
          "order_import",
          "buy_resources",
          "hire_employee",
          "pick_parcel",
          "build_office",
        ].includes(a) ||
        (a === "pickup_shipment" && s.operations.oldWarehouse > 0);
      if (warehouseAction && ["home", "cafe"].includes(target)) {
        const entrance =
          target === "home"
            ? HOME_GARAGE
            : { door: [3.57, 0.69], inside: [3.57, 0.2] };
        b.buildingVisit ||= {
          phase: "entering",
          warehouse: true,
          origin: target,
          door: entrance.door,
          inside: entrance.inside,
          returnPosition: [...b.position],
          points: [entrance.door, entrance.inside],
        };
        if (b.buildingVisit.phase === "entering") {
          if (buildingWalk(b, b.buildingVisit))
            b.buildingVisit.phase = "inside";
          return s;
        }
      }
      const business = a.startsWith("serve_")
        ? HOME_BUSINESSES[a.slice(6)]
        : null;
      if (business) {
        const entrance = businessEntrance(business);
        b.buildingVisit ||= {
          phase: "entering",
          delivery: true,
          door: entrance.door,
          inside: entrance.inside,
          returnPosition: [...b.position],
          points: [entrance.door, entrance.inside],
        };
        if (b.buildingVisit.phase === "entering") {
          if (buildingWalk(b, b.buildingVisit))
            b.buildingVisit.phase = "inside";
          return s;
        }
      }
      if (target === "workshop" && /^(craft_|buy_|upgrade_|hire_)/.test(a)) {
        b.buildingVisit ||= {
          phase: "entering",
          returnPosition: [...b.position],
          points: [
            [4.45, -3.4],
            [4.45, -4.78],
          ],
        };
        if (b.buildingVisit.phase === "entering") {
          if (buildingWalk(b, b.buildingVisit))
            b.buildingVisit.phase = "inside";
          return s;
        }
      }
      const trip = actionVoyage(s, b);
      if (trip && trip.mode) {
        makeVoyage(s, b, trip.mode, trip.island, trip.order, trip.purpose);
      } else {
        b.work += workweekEfficiency(s, b);
        if (a === "wait") s.idle++;
        if (b.work >= workDuration(s, a)) finish(s);
      }
    }
  } else s.idle++;
  s.retirement.ready = retirementRequirements(s).every((r) => r.complete);
  const allHome =
    b.node === "home" &&
    !b.action &&
    !b.move &&
    !b.voyage &&
    !b.combat &&
    !(s.zombies || []).some((z) => z.hp > 0) &&
    s.crew.every((c) => c.node === "home" && !c.action && !c.move && !c.voyage);
  if (s.retirement.ready && allHome) {
    s.status = "complete";
    s.retirement.retiredAt = s.tick;
    event(
      s,
      "complete",
      `Retired with ${s.money} coins, every gadget mastered, and a thriving delivery team.`,
    );
  }
  updateAchievements(s);
  recordExperience(s);
  return s;
}
export function metrics(s) {
  return {
    served: s.served,
    unserved: s.queue?.length || 0,
    averageWait: s.served ? Math.round(s.waitTotal / s.served) : 0,
    oldestWaiting: s.queue?.length ? s.tick - s.queue[0] : 0,
    waste: s.waste,
    lost: s.lost,
    travel: Math.round(s.travel),
    stockoutTicks: s.stockoutTicks,
    ticks: s.tick,
    completed: s.status === "complete",
    money: s.money,
    earned: s.earned,
    vehicles: s.vehicles?.length || 0,
    gadgets: Object.keys(s.tools || {}).length,
    masteredGadgets: Object.values(s.tools || {}).filter((n) => n === 2).length,
    employees: s.crew?.length || 0,
    reviews: s.rating?.count || 0,
    rating: s.rating?.average || 0,
    retired: s.retirement?.retiredAt != null,
  };
}
export function evaluateRun(source) {
  const s = fresh(source.seed, "rules");
  s.status = "running";
  for (let t = 0; t < source.tick; t++) {
    for (const c of source.disruptions.filter((c) => c.tick === s.tick)) {
      if (c.type === "extend" && s.status !== "complete") continue;
      command(s, c.type, c.value);
      if (c.type === "extend") s.status = "running";
    }
    if (s.status === "complete") break;
    if (!s.brandon.action && !s.retirement.ready) begin(s, baseline(s));
    step(s);
  }
  return { label: "Rules baseline", metrics: metrics(s), state: s };
}
