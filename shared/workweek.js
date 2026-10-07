// A bounded game policy for overtime, weekend promises and paid recovery trips.
// It does not represent a jurisdiction-specific labor or overtime-pay policy.
export const WORKWEEK_POLICY = Object.freeze({
  regularMinutes: 40 * 60,
  overtimeSlowdownPerHour: 0.035,
  minimumEfficiency: 0.6,
  weekendDeliveryLimit: 2,
});
export const VACATION_POLICY = Object.freeze({
  island: "sunset",
  resort: "Sunset Bay Resort",
  price: 28,
  stayMinutes: 120,
  mondayBonusMinutes: 240,
  mondayMaxBoost: 1.15,
});

const dayOf = (s, dayTicks = 1440) =>
  s.schedule?.day || s.world?.day || 1 + Math.floor(s.tick / dayTicks);
const weekOf = (s, dayTicks) => 1 + Math.floor((dayOf(s, dayTicks) - 1) / 7);
const weekdayOf = (s) => (dayOf(s) - 1) % 7;
const isWeekend = (s) => s.schedule?.isWeekend ?? weekdayOf(s) >= 5;
const currentStock = (s) => (s.cafe || 0) + (s.carry || 0);
const protectedReserve = (s) =>
  24 +
  (s.crew || []).reduce(
    (sum, member) =>
      sum + 2 * (member.wagePerDay || 0) + (member.wageArrears || 0),
    0,
  );
const hasIslandTransport = (s) =>
  (s.vehicles || []).some((mode) =>
    ["sailboat", "helicopter", "jetpack", "teleporter"].includes(mode),
  );

export function initializeWorkweek(s, dayTicks = 1440) {
  const week = weekOf(s, dayTicks);
  s.workweek ||= {
    week,
    lastTick: null,
    weekendDelivered: 0,
    lastBrandonDeliveries: s.brandon?.deliveries || 0,
    notices: [],
    vacations: 0,
    vacationSpent: 0,
    vacation: null,
    weekendPlan: "rest",
  };
  for (const actor of [s.brandon, ...(s.crew || [])].filter(Boolean))
    actor.workweek ||= {
      week,
      workedMinutes: 0,
      overtimeMinutes: 0,
      efficiency: 1,
      previousWeeks: [],
    };
  return s;
}

function canVacation(s) {
  const vacation = s.workweek?.vacation;
  return (
    isWeekend(s) &&
    hasIslandTransport(s) &&
    vacation?.week !== weekOf(s) &&
    s.money >= VACATION_POLICY.price + protectedReserve(s)
  );
}

function eligibleWeekendOrders(s) {
  return (s.customerQueue || [])
    .filter(
      (order) =>
        (!order.assigned || order.assigned === "brandon") &&
        (!order.requires || s.tools?.[order.requires]) &&
        (order.island === "home" || hasIslandTransport(s)) &&
        (order.cases || 1) <= currentStock(s),
    )
    .sort((a, b) => a.arrived - b.arrived);
}

export function weekendPolicy(s) {
  if (!isWeekend(s)) return "rest";
  const vacation = s.workweek?.vacation;
  if (vacation && ["traveling", "staying"].includes(vacation.status))
    return "vacation";
  const fatigue = s.brandon?.wellbeing?.fatigue || 0;
  const overtime = s.brandon?.workweek?.overtimeMinutes || 0;
  const recover = fatigue >= 65 || overtime >= 10 * 60;
  if (recover) return canVacation(s) ? "vacation" : "rest";
  const delivered = s.workweek?.weekendDelivered || 0;
  const remaining = eligibleWeekendOrders(s);
  const unhappy = (s.rating?.count || 0) > 0 && s.rating.average < 4;
  const late = remaining.some(
    (order) => (order.serviceWait || 0) > (order.promisedTicks || 180),
  );
  if (
    delivered < WORKWEEK_POLICY.weekendDeliveryLimit &&
    remaining.length &&
    (unhappy || late)
  )
    return "special_delivery";
  if (
    canVacation(s) &&
    (s.request === "vacation_resort" ||
      overtime > 0 ||
      fatigue >= 30 ||
      weekOf(s) % 3 === 0)
  )
    return "vacation";
  if (
    (s.crew || []).length &&
    s.money >= 12 + protectedReserve(s) &&
    s.social?.lastBBQDay !== dayOf(s)
  )
    return "bbq";
  return "rest";
}

function updateWeekendPromises(s) {
  if (!isWeekend(s)) return;
  const state = s.workweek;
  const day = dayOf(s),
    week = weekOf(s);
  const quota = Math.max(
    0,
    WORKWEEK_POLICY.weekendDeliveryLimit - state.weekendDelivered,
  );
  const selected =
    state.weekendPlan === "special_delivery"
      ? new Set(
          eligibleWeekendOrders(s)
            .slice(0, quota)
            .map((order) => order.id),
        )
      : new Set();
  for (const order of s.customerQueue || []) {
    const special = selected.has(order.id);
    // An assigned weekend promise remains valid while its courier finishes safely.
    if (
      order.assigned &&
      order.weekendService &&
      order.weekendPromiseWeek === week
    )
      continue;
    const promise = special ? "special_weekend" : "next_business_day";
    const promisedDay = special ? day : day + (7 - weekdayOf(s));
    order.weekendService = special;
    order.weekendPromiseWeek = week;
    order.promisedBusinessDay = promisedDay;
    const message = special
      ? "Brandon has scheduled a special weekend delivery for your order."
      : "The team is resting this weekend. Your order is scheduled for Monday.";
    const key = `${week}:${order.id}:${promise}`;
    order.deliveryWindow = promise;
    order.customerNotice = message;
    if (!state.notices.some((notice) => notice.key === key)) {
      state.notices.push({
        key,
        tick: s.tick,
        day,
        orderId: order.id,
        customerId: order.customerId,
        promise,
        promisedDay,
        message,
      });
      if (state.notices.length > 32) state.notices.shift();
    }
  }
}

function isProductive(actor) {
  if (
    actor.labor?.breakRemaining ||
    ["meal_break", "rest_break"].includes(actor.labor?.status)
  )
    return false;
  return (
    !!actor.action &&
    !["rest", "wait", "vacation_resort", "host_bbq", "beach_day"].includes(
      actor.action,
    )
  );
}

export function workweekEfficiency(s, actor) {
  const overtimeMinutes = Math.max(
    0,
    (actor.workweek?.workedMinutes || 0) - WORKWEEK_POLICY.regularMinutes,
  );
  const overtime = Math.max(
    WORKWEEK_POLICY.minimumEfficiency,
    1 / (1 + (overtimeMinutes / 60) * WORKWEEK_POLICY.overtimeSlowdownPerHour),
  );
  const vacation = s.workweek?.vacation;
  const monday =
    actor.id === "brandon" &&
    weekdayOf(s) === 0 &&
    vacation?.status === "complete" &&
    vacation.bonusWeek === weekOf(s);
  const boost = monday
    ? ((VACATION_POLICY.mondayMaxBoost - 1) *
        Math.max(0, vacation.bonusRemaining || 0)) /
      VACATION_POLICY.mondayBonusMinutes
    : 0;
  return overtime * (1 + boost);
}

export function workweekStep(s, dayTicks = 1440) {
  initializeWorkweek(s, dayTicks);
  const state = s.workweek,
    week = weekOf(s, dayTicks);
  if (state.week !== week) {
    state.week = week;
    state.weekendDelivered = 0;
    state.weekendPlan = "rest";
  }
  if (state.lastTick === s.tick) return;
  state.lastTick = s.tick;
  const minutes = 1440 / dayTicks;
  for (const actor of [s.brandon, ...(s.crew || [])].filter(Boolean)) {
    const log = actor.workweek;
    if (log.week !== week) {
      log.previousWeeks.push({
        week: log.week,
        workedMinutes: log.workedMinutes,
        overtimeMinutes: log.overtimeMinutes,
      });
      log.previousWeeks = log.previousWeeks.slice(-6);
      log.week = week;
      log.workedMinutes = 0;
      log.overtimeMinutes = 0;
    }
    if (isProductive(actor)) {
      log.workedMinutes += minutes;
      if (
        actor.id === "brandon" &&
        weekdayOf(s) === 0 &&
        state.vacation?.bonusWeek === week
      )
        state.vacation.bonusRemaining = Math.max(
          0,
          state.vacation.bonusRemaining - minutes,
        );
    }
    log.overtimeMinutes = Math.max(
      0,
      log.workedMinutes - WORKWEEK_POLICY.regularMinutes,
    );
    log.efficiency = workweekEfficiency(s, actor);
  }
  const delivered = s.brandon?.deliveries || 0;
  if (isWeekend(s))
    state.weekendDelivered += Math.max(
      0,
      delivered - state.lastBrandonDeliveries,
    );
  state.lastBrandonDeliveries = delivered;
  state.weekendPlan = weekendPolicy(s);
  updateWeekendPromises(s);
}

export function startVacation(s, dayTicks = 1440) {
  initializeWorkweek(s, dayTicks);
  if (!canVacation(s)) return false;
  s.money -= VACATION_POLICY.price;
  s.spent += VACATION_POLICY.price;
  s.workweek.vacationSpent += VACATION_POLICY.price;
  s.workweek.vacation = {
    week: weekOf(s),
    island: VACATION_POLICY.island,
    resort: VACATION_POLICY.resort,
    status: "traveling",
    startedAt: s.tick,
    arrivedAt: null,
    completedAt: null,
    costPaid: VACATION_POLICY.price,
    stayTicks: Math.ceil((VACATION_POLICY.stayMinutes / 1440) * dayTicks),
    bonusWeek: null,
    bonusRemaining: 0,
  };
  return true;
}

export function arriveVacation(s) {
  const vacation = s.workweek?.vacation;
  if (!vacation || vacation.status !== "traveling") return false;
  vacation.status = "staying";
  vacation.arrivedAt = s.tick;
  return true;
}

export function completeVacation(s) {
  const vacation = s.workweek?.vacation;
  if (
    !vacation ||
    vacation.status !== "staying" ||
    s.tick - vacation.arrivedAt < vacation.stayTicks
  )
    return false;
  vacation.status = "complete";
  vacation.completedAt = s.tick;
  vacation.bonusWeek = vacation.week + 1;
  vacation.bonusRemaining = VACATION_POLICY.mondayBonusMinutes;
  s.workweek.vacations++;
  if (s.brandon.wellbeing) {
    s.brandon.wellbeing.fatigue = Math.max(0, s.brandon.wellbeing.fatigue - 40);
    s.brandon.wellbeing.morale = Math.min(100, s.brandon.wellbeing.morale + 15);
  }
  return true;
}
