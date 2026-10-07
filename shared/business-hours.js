import { beachHours } from "./beach.js";
// Keep saved requests intact while the business and its owner are resting.
export function brandonResting(s) {
  const b = s.brandon;
  if (!b) return false;
  if (b.combat || b.move) return false;
  if (b.voyage) return /^Resting at /.test(b.voyage.phase || "");
  if (["parking", "entering", "exiting"].includes(b.homeRoutine?.phase))
    return false;
  return (
    b.homeRoutine?.phase === "sleeping" ||
    b.labor?.breakRemaining > 0 ||
    ["meal_break", "rest_break"].includes(b.labor?.status) ||
    (b.action === "rest" && b.node === b.target) ||
    (b.action === "beach_day" && b.buildingVisit?.phase === "inside") ||
    (!b.action && b.node === "home" && b.labor?.status === "off_duty")
  );
}

// Off-duty weekend leisure: Brandon spends the daylight hours of a clocked-out
// weekend at the beach. A chosen "Beach weekend" keeps him there all weekend.
export function weekendBeachTime(s) {
  const b = s.brandon;
  if (!b || !s.schedule?.isWeekend || b.combat || b.voyage) return false;
  if (!shiftEnded(s)) return false;
  const week = Math.floor(((s.schedule.day || 1) - 1) / 7);
  return (
    s.request === "beach_day" ||
    s.weekendLeisure?.week === week ||
    beachHours(s.world?.hour ?? 12)
  );
}

export function ordersOpen(s) {
  return (
    (!s.schedule ||
      ["day_shift", "night_deliveries"].includes(s.schedule.phase)) &&
    s.brandon?.action !== "rest" &&
    !brandonResting(s)
  );
}

export function visibleOrders(s) {
  return ordersOpen(s) ? s.customerQueue || [] : [];
}

export function unfinishedDeliveries(s) {
  return !!(
    s.customerQueue?.some(
      (order) =>
        order.assigned ||
        order.deliveryWindow !== "next_business_day" ||
        order.promisedBusinessDay <= s.schedule?.day,
    ) ||
    s.brandon?.orderId ||
    s.parcel?.picked ||
    s.operations?.inboundCarry ||
    s.operations?.resourceCarry
  );
}

// Ending a shift is a decision, separate from pausing, thinking or taking a break.
export function canClockOut(s) {
  const b = s.brandon;
  // Queued requests cannot be completed without stock. Preserve them for the
  // next shift instead of keeping the owner on duty until a future shipment.
  const awaitingStock =
    !!s.customerQueue?.length &&
    s.operations?.shipments?.some(
      (shipment) => shipment.kind === "pickles" && shipment.status === "at_sea",
    ) &&
    [
      s.carry,
      s.cafe,
      s.harbor,
      s.operations?.oldWarehouse,
      s.operations?.islandPort,
    ].every((stock) => (stock || 0) === 0) &&
    !s.customerQueue.some((order) => order.assigned) &&
    !b?.orderId &&
    !s.parcel?.picked &&
    !s.operations?.inboundCarry &&
    !s.operations?.resourceCarry;
  return (
    !!b &&
    ["rest", "weekend"].includes(s.schedule?.phase) &&
    !(s.schedule.isWeekend && s.workweek?.weekendPlan === "special_delivery") &&
    !b.combat &&
    !b.voyage &&
    (!unfinishedDeliveries(s) || awaitingStock) &&
    (!b.buildingVisit || b.buildingVisit.phase === "exiting") &&
    (!b.action || b.action === "rest") &&
    !b.labor?.breakRemaining &&
    !b.labor?.pending?.length
  );
}

export function nextShiftTick(s, morningOnly = false) {
  // One tick is one world minute; the world starts Monday at 08:00.
  const now = s.tick + 480;
  const today = Math.floor(now / 1440);
  for (let day = today; day <= today + 7; day++) {
    if (day % 7 >= 5) continue;
    for (const hour of morningOnly ? [8] : [8, 20]) {
      if (
        hour === 20 &&
        day === today &&
        s.schedule.nightDelivered >= s.schedule.nightQuota
      )
        continue;
      const tick = day * 1440 + hour * 60 - 480;
      if (tick > s.tick) return tick;
    }
  }
}

export function clockOut(s) {
  if (!canClockOut(s) || shiftEnded(s)) return false;
  s.brandon.shift = {
    status: "clocked_out",
    clockedOutAt: s.tick,
    nextShiftAt: nextShiftTick(s),
  };
  return true;
}

export function shiftEnded(s) {
  return (
    s.brandon?.shift?.status === "clocked_out" &&
    s.tick < s.brandon.shift.nextShiftAt &&
    !(s.schedule.isWeekend && s.workweek?.weekendPlan === "special_delivery")
  );
}

export function updateShift(s) {
  if (s.brandon.shift?.status === "clocked_out" && !shiftEnded(s)) {
    s.brandon.shift.status = "working";
    s.brandon.shift.clockedInAt = s.tick;
    s.daytimeUntil = null;
  }
}

export function simulationSpeed(s) {
  const selected = [1, 2, 4, 8].includes(s.speed) ? s.speed : 1;
  if (s.daytimeUntil > s.tick) return 64;
  return selected * (shiftEnded(s) && brandonResting(s) ? 2 : 1);
}
