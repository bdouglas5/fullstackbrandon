import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  step,
  begin,
  baseline,
  command,
  legal,
} from "../shared/engine.js";
import { weekendBeachTime, shiftEnded } from "../shared/business-hours.js";
import { BEACH, beachHours } from "../shared/beach.js";

function run(seed, until, observe = () => {}) {
  const s = fresh(seed, "rules");
  s.status = "running";
  while (s.tick < until) {
    if (!s.brandon.action && !s.retirement.ready) begin(s, baseline(s));
    step(s);
    observe(s);
  }
  return s;
}

// The simulation starts Monday 08:00; Saturday is day 6.
const SATURDAY_NOON = 5 * 1440 + 4 * 60;

test("on a clocked-out weekend Brandon walks to the beach and lounges until sunset", () => {
  const phases = new Set();
  let leftAt = null;
  run(7, 6 * 1440 + 1440, (state) => {
    if (state.schedule.day !== 6) return;
    if (state.brandon.action === "beach_day")
      phases.add(state.brandon.buildingVisit?.phase || "travelling");
    if (state.world.hour >= BEACH.closeHour && leftAt === null)
      leftAt = state.tick;
  });
  assert.deepEqual([...phases].sort(), ["entering", "inside", "travelling"]);
  assert.ok(leftAt, "beach window closed");
});

test("Brandon is on the lounger during the day and home again at night", () => {
  const atNoon = run(7, SATURDAY_NOON);
  assert.equal(atNoon.brandon.action, "beach_day");
  assert.equal(atNoon.brandon.buildingVisit?.phase, "inside");
  assert.deepEqual(
    atNoon.brandon.position.map((v) => Number(v.toFixed(2))),
    BEACH.brandon.head,
  );
  assert.equal(weekendBeachTime(atNoon), true);
  const evening = run(7, 5 * 1440 + 14 * 60);
  assert.equal(beachHours(evening.world.hour), false);
  assert.equal(weekendBeachTime(evening), false);
  assert.notEqual(evening.brandon.buildingVisit?.phase, "inside");
});

test("weekdays never send Brandon to the beach", () => {
  const seen = new Set();
  run(11, 4 * 1440, (s) => seen.add(s.brandon.action));
  assert.equal(seen.has("beach_day"), false);
});

test("skipping the weekend with the beach choice keeps him there all weekend and still ends Monday morning", () => {
  const s = run(7, 5 * 1440 + 30);
  assert.equal(shiftEnded(s), true);
  assert.equal(s.schedule.isWeekend, true);
  command(s, "next_shift", "beach");
  assert.equal(s.weekendLeisure.activity, "beach");
  assert.ok(s.daytimeUntil > s.tick);
  assert.equal(weekendBeachTime(s), true, "even in the small hours");
  assert.ok(legal(s).includes("beach_day"));
  const hours = new Set();
  while (s.schedule.isWeekend) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
    hours.add(s.brandon.action);
  }
  assert.ok(hours.has("beach_day"));
  // Monday arrives: the lounge window is over, he walks home and clocks in.
  while (s.tick < s.brandon.shift.nextShiftAt + 120) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.equal(s.brandon.shift.status, "working");
  assert.notEqual(s.brandon.buildingVisit?.beach, true);
});

test("the beach weekend can only be chosen on weekends", () => {
  const s = run(7, 2 * 1440 + 22 * 60);
  s.brandon.shift = {
    status: "clocked_out",
    nextShiftAt: s.tick + 600,
  };
  assert.throws(
    () => command(s, "next_shift", "beach"),
    /only available on weekends/,
  );
});

test("requesting a beach day sends Brandon straight to the sand", () => {
  const s = run(7, 5 * 1440 + 30);
  command(s, "request", "beach_day");
  assert.equal(s.request, "beach_day");
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
    seen.add(s.brandon.action);
  }
  assert.ok(seen.has("beach_day"));
  assert.equal(s.request, null);
  assert.equal(s.weekendLeisure.activity, "beach");
});
