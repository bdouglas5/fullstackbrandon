import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeLearning,
  recordExperience,
  learnedAction,
  learningContext,
} from "../shared/learning.js";
const state = () => ({
  tick: 0,
  money: 100,
  earned: 0,
  spent: 0,
  served: 0,
  cafe: 4,
  carry: 0,
  battery: 100,
  tools: {},
  customerQueue: [{}],
  crew: [],
  brandon: {
    id: "brandon",
    name: "Brandon",
    labor: { status: "working", pending: [] },
  },
  schedule: { phase: "day_shift" },
  operations: { shipments: [] },
  production: {},
  decisions: [],
  dispatch: [],
  reviews: [],
  disruptions: [],
});
test("persisted mistakes raise reserves and a later recovery is tracked without fabricating success", () => {
  const s = state();
  initializeLearning(s);
  s.battery = 0;
  s.tick = 1;
  recordExperience(s);
  assert.equal(s.learning.lessons.battery.occurrences, 1);
  assert.equal(s.learning.plan.chargeReserve, 25);
  assert.equal(s.learning.lessons.battery.status, "needs follow-up");
  assert.equal(learnedAction(s, ["wait"]), null);
  assert.equal(learnedAction(s, ["wait", "charge"]), "charge");
  const restored = JSON.parse(JSON.stringify(s));
  restored.battery = 100;
  restored.tick++;
  recordExperience(restored);
  assert.equal(restored.learning.lessons.battery.recoveries, 1);
  recordExperience(restored);
  assert.equal(restored.learning.lessons.battery.recoveries, 1);
});
test("stock learning excludes labor breaks and incoming supply; learned orders protect payroll", () => {
  const s = state();
  s.cafe = 0;
  s.schedule.phase = "rest";
  initializeLearning(s);
  for (let i = 0; i < 30; i++) {
    s.tick++;
    recordExperience(s);
  }
  assert.equal(s.learning.lessons.stock, undefined);
  s.schedule.phase = "day_shift";
  for (let i = 0; i < 14; i++) {
    s.tick++;
    recordExperience(s);
  }
  assert.ok(s.learning.lessons.stock);
  s.money = 25;
  s.crew = [{ id: "crew-1", wagePerDay: 6 }];
  assert.equal(learnedAction(s, ["order_import"]), null);
  s.money = 40;
  assert.equal(learnedAction(s, ["order_import"]), "order_import");
});
test("customer, employee and visitor feedback persists and repeated interference retains legal gates", () => {
  const s = state();
  initializeLearning(s);
  s.reviews = [
    {
      id: "r1",
      name: "Maya",
      rating: 2,
      text: "Late beyond the agreed window.",
    },
  ];
  s.dispatch = [
    { role: "visitor", tick: 1, text: "Keep some cash for wages." },
  ];
  s.crew = [
    {
      id: "crew-1",
      name: "Alex",
      wagePerDay: 6,
      wageArrears: 6,
      labor: { status: "off_duty", pending: [] },
    },
  ];
  s.disruptions = [
    { tick: 1, type: "puncture" },
    { tick: 2, type: "puncture" },
  ];
  s.tick = 3;
  recordExperience(s);
  assert.equal(s.learning.lessons.puncture.occurrences, 2);
  assert.ok(s.learning.feedback.some((x) => x.source === "customer"));
  assert.ok(s.learning.feedback.some((x) => x.source === "employee"));
  assert.ok(s.learning.feedback.some((x) => x.source === "visitor"));
  assert.equal(s.learning.plan.payrollDays, 2);
  assert.equal(learnedAction(s, ["wait"]), null);
  assert.equal(learnedAction(s, ["craft_repair_kit"]), "craft_repair_kit");
  const count = s.learning.feedback.length;
  recordExperience(s);
  assert.equal(s.learning.feedback.length, count);
  assert.match(learningContext(s).policy, /Never bypass labor breaks/);
});
test("fatigue rises with work, lawful rest restores it and wage concerns affect morale", () => {
  const s = state();
  s.brandon.action = "serve_maya";
  initializeLearning(s);
  for (let i = 0; i < 100; i++) {
    s.tick++;
    recordExperience(s);
  }
  const tired = s.brandon.wellbeing.fatigue;
  assert.ok(tired > 0);
  s.brandon.action = null;
  s.brandon.labor.status = "meal_break";
  s.schedule.phase = "rest";
  for (let i = 0; i < 30; i++) {
    s.tick++;
    recordExperience(s);
  }
  assert.ok(s.brandon.wellbeing.fatigue < tired);
  const morale = s.brandon.wellbeing.morale;
  s.brandon.wageArrears = 6;
  s.tick++;
  recordExperience(s);
  assert.ok(s.brandon.wellbeing.morale < morale);
  assert.equal(s.brandon.wellbeing.status, "concerned about pay");
});
test("memory remains bounded while preserving aggregate lesson evidence", () => {
  const s = state();
  initializeLearning(s);
  for (let i = 1; i <= 150; i++) {
    s.tick = i;
    s.disruptions.push({ tick: i, type: "traffic" });
    s.disruptions = s.disruptions.slice(-60);
    recordExperience(s);
  }
  assert.equal(s.learning.lessons.traffic.occurrences, 150);
  assert.ok(s.learning.episodes.length <= 48);
  assert.ok(s.learning.seenDisruptions.length <= 80);
});
