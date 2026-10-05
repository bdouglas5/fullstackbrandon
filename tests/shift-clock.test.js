import test from "node:test";
import assert from "node:assert/strict";
import {
  clockOut,
  shiftEnded,
  updateShift,
  simulationSpeed,
} from "../shared/business-hours.js";

function state(tick = 600, phase = "rest") {
  return {
    tick,
    speed: 1,
    schedule: { phase, isWeekend: false, nightQuota: 2, nightDelivered: 0 },
    brandon: {
      action: null,
      node: "home",
      labor: { pending: [], breakRemaining: 0 },
    },
  };
}

test("thinking, entering the house, sleeping and breaks during a shift never clock out", () => {
  for (const homeRoutine of [
    null,
    { phase: "entering" },
    { phase: "sleeping" },
  ]) {
    const s = state(240, "day_shift");
    s.brandon.homeRoutine = homeRoutine;
    assert.equal(clockOut(s), false);
    assert.equal(shiftEnded(s), false);
    assert.equal(simulationSpeed(s), 1);
  }
  const s = state(240, "day_shift");
  s.brandon.labor = { pending: [], status: "meal_break", breakRemaining: 15 };
  assert.equal(clockOut(s), false);
  assert.equal(simulationSpeed(s), 1);
});

test("clock-out waits for unfinished work and is recorded once", () => {
  const s = state();
  s.brandon.action = "collect";
  assert.equal(clockOut(s), false);
  s.brandon.action = null;
  assert.equal(shiftEnded(s), false);
  assert.equal(clockOut(s), true);
  assert.equal(clockOut(s), false);
  assert.equal(s.brandon.shift.nextShiftAt, 720);
  s.brandon.homeRoutine = { phase: "entering" };
  assert.equal(simulationSpeed(s), 1);
  s.brandon.homeRoutine.phase = "sleeping";
  assert.equal(simulationSpeed(s), 2);
  s.tick = 720;
  s.schedule.phase = "night_deliveries";
  updateShift(s);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.brandon.shift.status, "working");
  assert.equal(simulationSpeed(s), 1);
});

test("completed evening quota moves the next shift to morning", () => {
  const s = state(760);
  s.schedule.nightDelivered = 2;
  clockOut(s);
  assert.equal(s.brandon.shift.nextShiftAt, 1440);
});

test("Friday night ends at Monday morning, but weekend promises prevent clock-out", () => {
  const s = state(4 * 1440 + 840);
  clockOut(s);
  assert.equal(s.brandon.shift.nextShiftAt, 7 * 1440);
  s.tick = 5 * 1440;
  s.schedule.phase = "weekend";
  s.schedule.isWeekend = true;
  assert.equal(shiftEnded(s), true);
  s.workweek = { weekendPlan: "special_delivery" };
  assert.equal(clockOut(s), false);
  updateShift(s);
  assert.equal(shiftEnded(s), false);
  assert.equal(s.daytimeUntil, null);
});
