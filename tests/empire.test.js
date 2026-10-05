import { FARM, REEF, MAIN_ISLAND } from "../shared/islands.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  begin,
  decisionReady,
  step,
  command,
  baseline,
  legal,
  capacity,
  TOOLS,
  PEOPLE,
  ISLANDS,
  ACTIONS,
  TRANSPORT,
  inventoryTotal,
  seaRoute,
  worldTime,
  NODES,
} from "../shared/engine.js";
function isolated() {
  const s = fresh();
  s.status = "running";
  s.cafe = 6;
  s.harbor = 0;
  s.operations.shipments = [];
  s.queue = [];
  s.customerQueue = [];
  s.arrivals = 0;
  s.office.stage = "complete";
  s.operations.origin = "cafe";
  s.brandon.node = "cafe";
  s.brandon.position = [...NODES.cafe];
  // These mechanism tests start after the scheduled breaks; realism tests
  // separately exercise mandatory breaks and office construction.
  s.brandon.labor = {
    day: 1,
    status: "working",
    breaksTaken: ["morning", "lunch", "afternoon"],
    pending: [],
    breakRemaining: 0,
    workedTicks: 0,
    restTicks: 0,
  };
  return s;
}
function finishTask(s, a) {
  for (let i = 0; !decisionReady(s) && i < 1200; i++) step(s);
  assert.ok(begin(s, a), `${a} must be legal`);
  let guard = 0;
  while (!decisionReady(s) && guard++ < 1200) step(s);
  assert.ok(guard < 1200, `${a} must finish`);
}
function money(s, n) {
  s.money = n;
  s.startingMoney = n + s.spent;
}
function place(s, node, position) {
  s.brandon.node = node;
  s.brandon.position = position;
}
function enqueue(s, id, arrived = s.tick) {
  const person = PEOPLE.find((p) => p.id === id);
  const order = {
    ...person,
    customerId: id,
    id: `test-${s.arrivals}`,
    arrived,
    assigned: null,
  };
  s.customerQueue.push(order);
  s.queue.push(arrived);
  s.arrivals++;
  return order;
}
test("all eleven gadgets craft and reach Pro with exact material and coin costs", () => {
  const s = isolated();
  s.scrap = 100;
  money(s, 2000);
  place(s, "workshop", [4, -3.4]);
  let scrap = 0,
    coins = 0;
  for (const [id, t] of Object.entries(TOOLS)) {
    finishTask(s, `craft_${id}`);
    scrap += t.scrap;
    assert.equal(s.tools[id], 1);
    assert.ok(!legal(s).includes(`craft_${id}`));
    finishTask(s, `upgrade_${id}`);
    coins += t.price * 2;
    assert.equal(s.tools[id], 2);
  }
  assert.equal(s.scrap, 100 - scrap);
  assert.equal(s.spent, 12 + coins);
  assert.equal(s.money, 2000 - coins);
  assert.equal(capacity(s), 9);
});
test("all customers have stable identities and real island business addresses", () => {
  assert.equal(PEOPLE.length, 16);
  assert.equal(new Set(PEOPLE.map((p) => p.id)).size, 16);
  for (const id of Object.keys(ISLANDS))
    assert.ok(PEOPLE.some((p) => p.island === id));
  assert.ok(PEOPLE.some((p) => p.island === "reef"));
  for (const p of PEOPLE) {
    assert.equal(p.position.length, 2);
    assert.ok(ACTIONS[`serve_${p.id}`]);
  }
});
test("specialty orders wait for handling equipment and a physical delivery", () => {
  const s = isolated();
  enqueue(s, "maya");
  s.carry = 1;
  s.cafe--;
  assert.ok(!legal(s).includes("serve_maya"));
  for (let i = 0; i < 10; i++) step(s);
  assert.equal(s.served, 0);
  s.tools.cooler = 1;
  finishTask(s, "serve_maya");
  assert.equal(s.customerHistory[0].role, "Greenhouse Deli");
  assert.equal(s.brandon.node, "deli");
  assert.equal(s.served, 1);
  assert.ok(s.money > 0);
});
test("vehicle purchases cost earned money and bike roads use no battery", () => {
  const s = isolated();
  money(s, 500);
  place(s, "workshop", [4, -3.4]);
  finishTask(s, "buy_bike");
  assert.equal(s.vehicle, "bike");
  assert.equal(s.spent, 12 + 24);
  const battery = s.battery;
  finishTask(s, "collect");
  assert.equal(s.battery, battery);
  assert.ok(s.travel > 0);
  finishTask(s, "buy_van");
  assert.equal(s.vehicle, "van");
  assert.equal(s.spent, 12 + 94);
});
test("puncture retains location and the Pro kit repairs in one work tick", () => {
  const s = isolated();
  s.vehicles = ["van"];
  s.vehicle = "van";
  begin(s, "collect");
  step(s);
  step(s);
  const pos = [...s.brandon.position];
  command(s, "puncture");
  s.tools.repair_kit = 2;
  assert.equal(s.brandon.action, "collect");
  assert.deepEqual(s.brandon.position, pos);
  for (let i = 0; !decisionReady(s) && i < 1200; i++) step(s);
  const repairPosition = [...s.brandon.position];
  assert.ok(legal(s).includes("patch"));
  finishTask(s, "patch");
  assert.equal(s.flatTire, false);
  assert.deepEqual(s.brandon.position, repairPosition);
});
test("sailing travels safe water corridors, walks ashore, and returns", () => {
  const s = isolated();
  s.vehicles = ["sailboat"];
  place(s, "harbor_dock", [...NODES.harbor_dock]);
  enqueue(s, "tess");
  s.carry = 1;
  s.cafe--;
  begin(s, "serve_tess");
  let shore = false,
    delivered = false,
    boatMoved = false;
  while (s.brandon.action) {
    step(s);
    const v = s.brandon.voyage;
    if (v) {
      shore ||= v.onShore;
      boatMoved ||= Math.abs(v.position[0] + 4) > 1;
      if (v.onShore) assert.deepEqual(v.position, REEF.dock);
    }
    if (s.served) delivered = true;
    assert.equal(inventoryTotal(s), s.initial);
  }
  assert.ok(shore && delivered && boatMoved);
  assert.equal(s.brandon.node, "harbor_dock");
  assert.deepEqual(s.brandon.position, NODES.harbor_dock);
  assert.equal(s.voyages, 1);
});
test("every sea route stays outside land, including hull clearance", () => {
  const land = [
    [
      MAIN_ISLAND.x - MAIN_ISLAND.width / 2,
      MAIN_ISLAND.x + MAIN_ISLAND.width / 2,
      MAIN_ISLAND.z - MAIN_ISLAND.depth / 2,
      MAIN_ISLAND.z + MAIN_ISLAND.depth / 2,
    ],
    [FARM.x - 2.75, FARM.x + 2.75, FARM.z - 2.55, FARM.z + 2.55],
    [REEF.x - 2.7, REEF.x + 2.7, REEF.z - 2.6, REEF.z + 2.6],
    ...Object.values(ISLANDS).map((i) => [
      i.x - 3.75,
      i.x + 3.75,
      i.z - 3.6,
      i.z + 3.6,
    ]),
  ];
  for (const id of [...Object.keys(ISLANDS), "farm", "reef"]) {
    const points = seaRoute(id);
    for (let i = 1; i < points.length; i++)
      for (let j = 0; j <= 100; j++) {
        const x =
            points[i - 1][0] + ((points[i][0] - points[i - 1][0]) * j) / 100,
          z = points[i - 1][1] + ((points[i][1] - points[i - 1][1]) * j) / 100;
        assert.ok(
          !land.some(
            ([a, b, c, d]) =>
              x > a - 0.95 && x < b + 0.95 && z > c - 0.95 && z < d + 0.95,
          ),
          `${id} boat intersects land at ${x},${z}`,
        );
      }
  }
});
test("flight rises above buildings before travel then lands before walking", () => {
  const s = isolated();
  s.vehicles = ["helicopter"];
  s.tools.winch = 1;
  place(s, "helipad", [14.5, -3.4]);
  enqueue(s, "ravi");
  s.tools.scanner = 1;
  s.carry = 1;
  s.cafe--;
  begin(s, "serve_ravi");
  let cruise = false,
    shore = false;
  while (s.brandon.action) {
    step(s);
    const v = s.brandon.voyage;
    if (v) {
      if (v.phase.startsWith("Flying")) {
        cruise = true;
        assert.equal(v.altitude, 7);
      }
      if (v.onShore) {
        shore = true;
        assert.equal(v.altitude, 0.48);
      }
    }
  }
  assert.ok(cruise && shore);
  assert.equal(s.customerHistory[0].island, "copper");
});
test("limited-capacity jetpack reserves excess cargo at departure and recovers it", () => {
  const s = isolated();
  s.vehicles = ["jetpack"];
  s.tools.cargo_rack = 2;
  place(s, "helipad", [14.5, -3.4]);
  enqueue(s, "tess");
  // Add a paid fixture case before loading a bulk cargo-rack shipment.
  s.initial++;
  s.cafe++;
  s.carry = 7;
  s.cafe -= 7;
  s.stormOverride = false;
  s.stormOverrideUntil = 1000;
  begin(s, "serve_tess");
  step(s);
  assert.equal(s.brandon.stowedCargo, 5);
  assert.equal(s.carry, 2);
  assert.equal(inventoryTotal(s), s.initial);
  while (s.brandon.action) step(s);
  assert.equal(s.carry, 6);
  assert.equal(s.brandon.stowedCargo, 0);
  assert.equal(inventoryTotal(s), s.initial);
});
test("storm flight gate, winch, bounded weather override, and transport preference", () => {
  const s = isolated();
  s.vehicles = ["sailboat", "helicopter", "jetpack", "teleporter"];
  s.orchard = 1;
  s.initial++;
  command(s, "storm");
  assert.ok(!legal(s).includes("fly"));
  s.tools.winch = 1;
  assert.ok(legal(s).includes("fly"));
  command(s, "prefer", "use_sailboat");
  finishTask(s, "use_sailboat");
  assert.equal(s.preferredTransport, "sailboat");
  enqueue(s, "tess");
  s.carry = 1;
  s.cafe--;
  begin(s, "serve_tess");
  assert.equal(s.brandon.transport, "sailboat");
  while (s.brandon.action) step(s);
  finishTask(s, "auto_transport");
  assert.equal(s.preferredTransport, null);
  while (s.tick < 200) step(s);
  assert.equal(s.stormOverride, null);
});
test("customer reviews use the last three fulfilled orders and reflect actual lateness", () => {
  function reviews(late) {
    const s = isolated();
    const cleo = PEOPLE.find((person) => person.id === "cleo");
    place(s, cleo.node, [...cleo.position]);
    s.tools.cooler = 1;
    for (let i = 0; i < 3; i++) {
      enqueue(s, "cleo", late ? s.tick - 1000 : s.tick);
      s.carry = 1;
      s.cafe--;
      finishTask(s, "serve_cleo");
    }
    return s;
  }
  const good = reviews(false),
    bad = reviews(true);
  assert.equal(good.reviews.length, 1);
  assert.equal(good.reviews[0].rating, 5);
  assert.equal(good.reviews[0].orders, 3);
  assert.equal(good.reviews[0].onTime, 3);
  assert.equal(bad.reviews[0].rating, 1);
  assert.equal(bad.reviews[0].onTime, 0);
  assert.equal(
    bad.reviews[0].averageWait,
    Math.round(
      bad.customerHistory
        .slice(-3)
        .reduce((sum, order) => sum + order.wait, 0) / 3,
    ),
  );
  assert.ok(
    bad.reviews[0].averageWait > 1002,
    "walking inside adds real delivery time",
  );
  assert.doesNotMatch(bad.reviews[0].text, /ticks|\d{4}/);
});
test("employees independently carry paid stock and deliver more slowly than Brandon", () => {
  const s = isolated();
  money(s, 200);
  s.vehicles = ["bike"];
  finishTask(s, "hire_employee");
  assert.equal(s.crew[0].efficiency, 0.68);
  enqueue(s, "theo");
  let moved = false;
  for (let i = 0; i < 100 && !s.crew[0].deliveries; i++) {
    step(s);
    moved ||= !!s.crew[0].move;
    assert.equal(inventoryTotal(s), s.initial);
  }
  assert.ok(moved);
  assert.equal(s.crew[0].deliveries, 1);
  assert.ok(s.crew[0].earned > 0);
  assert.equal(s.wages, 6);
  assert.equal(s.spent, 12 + 80 + 6);
  assert.equal(s.customerHistory[0].courier, "Alex");
});
test("satellite storage requires a physical supply voyage and cannot invent customer deliveries", () => {
  const s = isolated();
  money(s, 200);
  s.vehicles = ["sailboat"];
  place(s, "workshop", [...NODES.workshop]);
  finishTask(s, "expand_juniper");
  finishTask(s, "collect");
  finishTask(s, "supply_juniper");
  const outpost = s.outposts.juniper;
  assert.ok(outpost.stock > 0);
  const served = s.served,
    stored = outpost.stock;
  enqueue(s, "amara");
  for (let i = 0; i < 15; i++) step(s);
  assert.equal(s.served, served);
  assert.equal(outpost.stock, stored);
  assert.equal(outpost.earned, 0);
  assert.ok(!s.customerHistory.some((c) => c.courier.endsWith(" team")));
  assert.equal(inventoryTotal(s), s.initial);
});

test("world works through day and night with several actual weather patterns", () => {
  const phases = new Set(),
    weather = new Set();
  for (let tick = 0; tick < 1500; tick++) {
    const w = worldTime(tick, 42);
    phases.add(w.phase);
    weather.add(w.weather);
    assert.ok(w.hour >= 0 && w.hour < 24);
    assert.ok(w.light >= 0.13 && w.light <= 1);
  }
  assert.equal(phases.size, 4);
  assert.ok(weather.has("storm") && weather.has("fog") && weather.has("rain"));
});
test("retired careers cannot unpause accidentally and can start a new chapter", () => {
  const s = isolated();
  s.status = "complete";
  s.retirement.retiredAt = 100;
  assert.throws(() => command(s, "pause"));
  command(s, "extend");
  assert.equal(s.status, "paused");
  assert.equal(s.retirement.target, 5000);
  assert.equal(s.retirement.retiredAt, null);
});

test("navigation and waterproof wrap change physical road timing", () => {
  function travel(tools, storm) {
    const s = isolated();
    s.tools = tools;
    s.stormOverride = storm;
    s.stormOverrideUntil = 1000;
    s.vehicles = ["van"];
    s.vehicle = "van";
    place(s, "harbor", [...NODES.harbor]);
    finishTask(s, "collect");
    return s.tick;
  }
  assert.ok(travel({ navigation: 2 }, false) < travel({}, false));
  assert.ok(travel({ rain_gear: 2 }, true) < travel({}, true));
});
test("solar charger, barrel dolly, cooler, and generator have measured effects", () => {
  const solar = isolated();
  solar.tools.solar_panel = 2;
  solar.battery = 10;
  solar.stormOverride = false;
  solar.stormOverrideUntil = 1000;
  for (let i = 0; i < 3; i++) step(solar);
  assert.ok(Math.abs(solar.battery - 11.8) < 0.00001);
  const plain = isolated(),
    dolly = isolated();
  for (const s of [plain, dolly]) place(s, "cafe", [...NODES.cafe]);
  dolly.tools.cargo_dolly = 1;
  finishTask(plain, "collect");
  finishTask(dolly, "collect");
  assert.equal(
    plain.tick - dolly.tick,
    2,
    "the dolly saves two packing ticks after the same walk inside",
  );
  const warm = isolated(),
    cold = isolated();
  cold.tools.cooler = 1;
  for (const s of [warm, cold]) {
    s.cafe = 10;
    s.initial += 4;
    for (let i = 0; i < 90; i++) step(s);
    assert.equal(inventoryTotal(s), s.initial);
  }
  assert.equal(warm.waste, 1);
  assert.equal(cold.waste, 0);
  // Backup power keeps physical factory work moving; it never invents
  // unseen outpost workers or customer deliveries.
  for (const quality of [0, 1, 2]) {
    const s = isolated();
    s.powerOut = true;
    s.tools.generator = quality;
    s.production.fermenting = [{ id: "power-test", cases: 1, readyAt: 8 }];
    s.initial++;
    for (let i = 0; i < 10; i++) step(s);
    assert.equal(s.production.packing.length, quality === 2 ? 1 : 0);
    assert.equal(s.served, 0);
    assert.equal(inventoryTotal(s), s.initial);
  }
});
test("Pro winch reduces storm flight time and scanner increases island payment", () => {
  function deliver(winch, scanner) {
    const s = isolated();
    s.vehicles = ["helicopter"];
    s.tools = { winch, scanner };
    s.stormOverride = true;
    s.stormOverrideUntil = 2000;
    s.storm = true;
    place(s, "helipad", [14.5, -3.4]);
    enqueue(s, "tess");
    s.carry = 1;
    s.cafe--;
    finishTask(s, "serve_tess");
    return s;
  }
  const base = deliver(1, 0),
    pro = deliver(2, 2);
  assert.ok(pro.tick < base.tick);
  assert.equal(pro.earned - base.earned, 8);
});
test("upgrade guidance first crafts the missing prerequisite and retains the goal", () => {
  const s = isolated();
  command(s, "prefer", "upgrade_navigation");
  s.status = "running";
  let crafted = false;
  for (let i = 0; i < 3000 && s.tools.navigation !== 2; i++) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
    if (s.tools.navigation === 1) {
      crafted = true;
      if (s.brandon.action !== "upgrade_navigation")
        assert.equal(s.request, "upgrade_navigation");
    }
  }
  assert.ok(crafted);
  assert.equal(s.tools.navigation, 2);
  assert.equal(s.request, null);
});

test("reserved reef barrels also contribute to Tess's real customer reviews", () => {
  const s = isolated();
  s.vehicles = ["helicopter"];
  s.tools.winch = 1;
  for (let i = 0; i < 3; i++) {
    command(s, "chat", "reef pickle order");
    finishTask(s, "pick_parcel");
    finishTask(s, "fly_parcel");
    assert.equal(s.parcel, null);
    assert.equal(inventoryTotal(s), s.initial);
  }
  assert.equal(s.parcelsDelivered, 3);
  assert.equal(s.customerStats.tess.orders, 3);
  assert.ok(s.reviews.some((r) => r.customerId === "tess"));
  assert.equal(s.arrivals, s.served + s.queue.length);
});
