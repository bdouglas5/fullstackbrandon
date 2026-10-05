import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeWorkweek,
  workweekStep,
  workweekEfficiency,
  weekendPolicy,
  startVacation,
  arriveVacation,
  completeVacation,
  VACATION_POLICY,
} from "../shared/workweek.js";

function fixture(day = 1) {
  const state = {
    tick: (day - 1) * 1440,
    schedule: { day, isWeekend: (day - 1) % 7 >= 5 },
    world: { day, hour: 10 },
    money: 200,
    spent: 0,
    cafe: 12,
    carry: 0,
    crew: [],
    vehicles: ["sailboat"],
    tools: {},
    customerQueue: [],
    rating: { count: 1, average: 5 },
    social: {},
    brandon: {
      id: "brandon",
      deliveries: 0,
      action: null,
      labor: { status: "working", breakRemaining: 0 },
      wellbeing: { fatigue: 30, morale: 65 },
    },
  };
  initializeWorkweek(state);
  return state;
}

test("weekly overtime progressively slows productive work after forty hours and resets Monday", () => {
  const s = fixture();
  s.brandon.action = "serve_cleo";
  s.brandon.workweek.workedMinutes = 2400;
  assert.equal(workweekEfficiency(s, s.brandon), 1);
  s.brandon.workweek.workedMinutes = 2460;
  const oneHour = workweekEfficiency(s, s.brandon);
  s.brandon.workweek.workedMinutes = 3000;
  assert.ok(workweekEfficiency(s, s.brandon) < oneHour);
  assert.ok(oneHour < 1);
  s.brandon.workweek.workedMinutes = 10000;
  assert.equal(workweekEfficiency(s, s.brandon), 0.6);
  s.schedule.day = 8;
  s.schedule.isWeekend = false;
  s.tick++;
  workweekStep(s);
  assert.equal(s.brandon.workweek.workedMinutes, 1);
  assert.equal(s.brandon.workweek.efficiency, 1);
  assert.equal(s.brandon.workweek.previousWeeks[0].workedMinutes, 10000);
});

test("lunch, rest, resort time, and repeated processing of the same tick do not add working hours", () => {
  const s = fixture();
  for (const action of ["rest", "wait", "vacation_resort", "host_bbq"]) {
    s.brandon.action = action;
    s.tick++;
    workweekStep(s);
  }
  s.brandon.action = "serve_cleo";
  s.brandon.labor.status = "meal_break";
  s.tick++;
  workweekStep(s);
  assert.equal(s.brandon.workweek.workedMinutes, 0);
  s.brandon.labor.status = "working";
  s.tick++;
  workweekStep(s);
  workweekStep(s);
  assert.equal(s.brandon.workweek.workedMinutes, 1);
});

test("a special weekend round promises at most two orders and tells the rest Monday", () => {
  const s = fixture(6);
  s.rating.average = 3;
  s.customerQueue = [0, 1, 2, 3].map((id) => ({
    id: `order-${id}`,
    customerId: `customer-${id}`,
    cases: 1,
    island: "home",
    arrived: id,
  }));
  assert.equal(weekendPolicy(s), "special_delivery");
  workweekStep(s);
  assert.equal(
    s.customerQueue.filter((order) => order.weekendService).length,
    2,
  );
  assert.equal(s.customerQueue[2].promisedBusinessDay, 8);
  assert.match(s.customerQueue[2].customerNotice, /Monday/);
  assert.equal(s.workweek.notices.length, 4);
  s.tick++;
  workweekStep(s);
  assert.equal(
    s.workweek.notices.length,
    4,
    "promises are not sent repeatedly",
  );
  s.brandon.deliveries = 2;
  s.tick++;
  workweekStep(s);
  assert.equal(s.workweek.weekendDelivered, 2);
  assert.notEqual(weekendPolicy(s), "special_delivery");
});

test("exhaustion chooses recovery even when customer ratings are low", () => {
  const s = fixture(6);
  s.brandon.wellbeing.fatigue = 85;
  s.rating.average = 1;
  s.customerQueue = [{ id: "late", island: "home", cases: 1, arrived: 0 }];
  assert.equal(weekendPolicy(s), "vacation");
  s.money = 5;
  assert.equal(weekendPolicy(s), "rest");
  assert.equal(startVacation(s), false);
  assert.equal(s.spent, 0);
});

test("a resort reservation charges once and grants no recovery or Monday boost before a real stay", () => {
  const s = fixture(6);
  const opening = s.money;
  assert.equal(startVacation(s), true);
  assert.equal(s.money, opening - VACATION_POLICY.price);
  assert.equal(s.spent, VACATION_POLICY.price);
  assert.equal(startVacation(s), false);
  assert.equal(s.spent, VACATION_POLICY.price);
  assert.equal(completeVacation(s), false);
  assert.equal(s.workweek.vacation.bonusRemaining, 0);
  assert.equal(s.brandon.wellbeing.fatigue, 30);
  assert.equal(arriveVacation(s), true);
  s.tick += 119;
  assert.equal(completeVacation(s), false);
  s.tick++;
  assert.equal(completeVacation(s), true);
  assert.equal(completeVacation(s), false);
  assert.equal(s.workweek.vacations, 1);
  assert.equal(s.brandon.wellbeing.fatigue, 0);
  assert.equal(s.workweek.vacation.bonusRemaining, 240);
});

test("completed vacation gives a diminishing Monday-only speed bonus for four working hours", () => {
  const s = fixture(6);
  startVacation(s);
  arriveVacation(s);
  s.tick += 120;
  completeVacation(s);
  assert.equal(
    workweekEfficiency(s, s.brandon),
    1,
    "no immediate weekend speed bonus",
  );
  s.schedule.day = 8;
  s.schedule.isWeekend = false;
  assert.equal(workweekEfficiency(s, s.brandon), 1.15);
  s.brandon.action = "serve_cleo";
  for (let minute = 0; minute < 120; minute++) {
    s.tick++;
    workweekStep(s);
  }
  assert.equal(s.workweek.vacation.bonusRemaining, 120);
  assert.ok(Math.abs(workweekEfficiency(s, s.brandon) - 1.075) < 1e-10);
  s.brandon.action = "rest";
  s.tick++;
  workweekStep(s);
  assert.equal(s.workweek.vacation.bonusRemaining, 120);
  s.schedule.day = 9;
  assert.equal(
    workweekEfficiency(s, s.brandon),
    1,
    "unused recovery boost expires after Monday",
  );
  s.schedule.day = 8;
  s.brandon.action = "serve_cleo";
  for (let minute = 0; minute < 120; minute++) {
    s.tick++;
    workweekStep(s);
  }
  assert.equal(s.workweek.vacation.bonusRemaining, 0);
  assert.equal(workweekEfficiency(s, s.brandon), 1);
});
