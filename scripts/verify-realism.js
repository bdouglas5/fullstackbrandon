import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  fresh,
  command,
  baseline,
  begin,
  step,
  inventoryTotal,
  TRANSPORT,
  VERSION,
} from "../shared/engine.js";

// This is a deterministic simulation audit, not an animation or human-play test.
// No money, inventory, equipment, employees, or construction progress is injected.
const seeds = process.env.REALISM_SEEDS
  ? process.env.REALISM_SEEDS.split(",").map(Number)
  : [0, 7, 42, 99];
const ceiling = Number(process.env.REALISM_MAX_TICKS || 120000);
const results = [];
const disruptions = {
  80: "bridge",
  150: "rush",
  225: "shortage",
  400: "storm",
  600: "power",
  800: "traffic",
  1100: "puncture",
};

function auditCareer(seed, disrupted) {
  const state = fresh(seed, "rules");
  const phases = new Set();
  const constructionStages = new Set();
  const officeStages = new Set();
  const laborStates = new Set();
  const shipmentStages = new Set();
  const transportPhases = new Set();
  let nightDeliveries = 0;
  let lastNightCount = 0;
  let lastDay = state.schedule?.day;
  let restTicks = 0;
  command(state, "start");
  while (state.status === "running" && state.tick < ceiling) {
    if (disrupted && disruptions[state.tick])
      command(state, disruptions[state.tick]);
    if (!state.brandon.action)
      assert.ok(
        begin(state, baseline(state)),
        `No legal decision at ${state.tick}`,
      );
    step(state);
    assert.equal(
      inventoryTotal(state),
      state.initial,
      `Inventory at ${state.tick}`,
    );
    assert.equal(
      state.money,
      (state.startingMoney || 0) +
        state.earned +
        40 * state.grants -
        state.spent,
      `Cash ledger at ${state.tick}`,
    );
    assert.ok(state.money >= 0, `Negative cash at ${state.tick}`);
    assert.ok(state.harbor >= 0 && state.cafe >= 0 && state.carry >= 0);
    assert.equal(state.arrivals, state.served + state.customerQueue.length);
    phases.add(state.schedule?.phase);
    constructionStages.add(state.construction?.stage);
    officeStages.add(state.office?.stage);
    for (const shipment of state.operations?.shipments || [])
      shipmentStages.add(shipment.status);
    for (const actor of [state.brandon, ...(state.crew || [])]) {
      if (actor.labor?.status) laborStates.add(actor.labor.status);
      if (actor.transition?.phase) transportPhases.add(actor.transition.phase);
      if (actor.voyage?.phase) transportPhases.add(actor.voyage.phase);
    }
    if (state.schedule?.phase === "rest") restTicks++;
    if (state.schedule?.day !== lastDay) lastNightCount = 0;
    const count = state.schedule?.nightDelivered || 0;
    nightDeliveries += Math.max(0, count - lastNightCount);
    lastNightCount = count;
    lastDay = state.schedule?.day;
  }
  const result = {
    seed,
    scenario: disrupted ? "disrupted" : "unattended",
    status: state.status,
    tick: state.tick,
    days: state.schedule?.day,
    money: state.money,
    served: state.served,
    wages: state.wages,
    phases: [...phases],
    nightDeliveries,
    restTicks,
    constructionStages: [...constructionStages],
    officeStages: [...officeStages],
    laborStates: [...laborStates],
    shipmentStages: [...shipmentStages],
    transportPhases: [...transportPhases],
    vehicles: state.vehicles,
    transportUsage: state.transportUsage,
    employees: state.crew.map(
      ({ name, vehicles, deliveries, wagePerDay, paidDay, wageArrears }) => ({
        name,
        vehicles,
        deliveries,
        wagePerDay,
        paidDay,
        wageArrears,
      }),
    ),
    operations: state.operations,
    construction: state.construction,
    office: state.office,
    social: state.social,
    production: state.production,
    retirement: state.retirement,
    finalActors: [state.brandon, ...state.crew].map((actor) => ({
      id: actor.id,
      action: actor.action,
      node: actor.node,
      position: actor.position,
      move: actor.move,
      yieldingTo: actor.yieldingTo,
    })),
  };
  results.push(result);
  assert.equal(
    state.status,
    "complete",
    `Seed ${seed} ${result.scenario} stalled at ${state.tick}; ${state.served} orders, ${state.money} coins. See evidence/realism-careers.json.`,
  );
  for (const mode of Object.keys(TRANSPORT)) {
    assert.ok(state.vehicles.includes(mode), `Missing ${mode}`);
    assert.ok(state.transportUsage[mode] > 0, `Unused ${mode}`);
  }
  assert.equal(state.construction.stage, "complete");
  assert.equal(state.office.stage, "complete");
  assert.ok(officeStages.has("garage") && officeStages.has("building"));
  assert.ok(
    state.construction.deal.negotiatedAt != null,
    "Island purchase skipped negotiation",
  );
  assert.ok(state.production.produced > 0, "Retired before producing pickles");
  assert.ok(state.production.expanded, "Retired before factory expansion");
  assert.ok(state.operations.importsPaid > 0);
  assert.ok(state.wages > 0);
  assert.ok(
    state.crew.every(
      (employee) => employee.vehicles.length && employee.deliveries > 0,
    ),
  );
  assert.ok(
    phases.has("day_shift") &&
      phases.has("night_deliveries") &&
      phases.has("rest") &&
      phases.has("weekend"),
  );
  assert.ok(laborStates.has("meal_break") && laborStates.has("rest_break"));
  assert.ok(nightDeliveries >= 2 && restTicks > 0);
  assert.ok(
    shipmentStages.has("at_sea") &&
      shipmentStages.has("port") &&
      shipmentStages.has("unloaded"),
  );
  return state;
}

try {
  for (const disrupted of [false, true]) {
    for (const seed of seeds) {
      const state = auditCareer(seed, disrupted);
      console.log(
        `${disrupted ? "disrupted" : "unattended"} seed ${seed}: retired at ${state.tick}; ${state.served} orders; ${state.money} coins`,
      );
    }
  }
  const first = auditCareer(42, false);
  const second = auditCareer(42, false);
  assert.deepEqual(
    first,
    second,
    "Same seed must reproduce the complete career",
  );
  console.log("Deterministic repeat matched exactly.");
} finally {
  mkdirSync("evidence", { recursive: true });
  writeFileSync(
    "evidence/realism-careers.json",
    JSON.stringify(
      {
        version: VERSION,
        verifiedAt: new Date().toISOString(),
        note: "Real engine, rules controller, no model calls or injected cash/progress. Rendered motion and browser behavior are checked separately.",
        results,
      },
      null,
      2,
    ),
  );
}
