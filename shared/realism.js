import { initializeWorkweek, workweekStep } from "./workweek.js";
import { initializeLearning } from "./learning.js";
import { shiftEnded, unfinishedDeliveries } from "./business-hours.js";
// Finite supplies, paid labor, a work/rest clock and a staged owned factory.
export const ECONOMY = Object.freeze({
  importBatch: 12,
  importUnitCost: 2,
  resourceBatch: 6,
  resourceUnitCost: 2,
  growTicks: 60,
  fermentTicks: 90,
  packTicks: 15,
  islandPrice: 160,
  contractorPrice: 240,
  factoryExpansion: 180,
  wageBase: 6,
  shipmentTicks: 45,
  officePrice: 60,
  officeTicks: 90,
});
// Book a concrete weekday sailing before projected stock exhaustion. Urgent
// orders use the earliest working-hours arrival; bookings are paid only once.
export function planShipment(s) {
  const rate = Math.max(0.035, (s.casesDelivered || 0) / Math.max(1, s.tick));
  const stock =
    s.cafe +
    s.harbor +
    s.carry +
    (s.operations.inboundCarry || 0) +
    (s.operations.islandPort || 0);
  const earliest = s.tick + ECONOMY.shipmentTicks;
  const deadline = s.tick + Math.max(ECONOMY.shipmentTicks, stock / rate - 90);
  let arrivesAt = earliest;
  const clock = (tick) => ({
    day: 1 + Math.floor((tick + 480) / 1440),
    hour: ((tick + 480) % 1440) / 60,
  });
  // Suppliers and collection crews work Monday through Friday, 08:00–17:00.
  for (let tick = earliest; tick <= earliest + 8 * 1440; tick++) {
    const { day, hour } = clock(tick);
    if ((day - 1) % 7 >= 5 || hour < 8 || hour > 17) continue;
    arrivesAt = tick;
    break;
  }
  const urgent = arrivesAt >= deadline;
  if (!urgent) {
    let slot = arrivesAt;
    for (let tick = arrivesAt; tick <= deadline; tick++) {
      const { day, hour } = clock(tick);
      if ((day - 1) % 7 < 5 && [8, 13, 17].includes(hour)) slot = tick;
    }
    arrivesAt = slot;
  }
  const { day, hour } = clock(arrivesAt);
  return {
    departsAt: arrivesAt - ECONOMY.shipmentTicks,
    arrivesAt,
    arrivalDay: day,
    arrivalHour: hour,
    reason: urgent
      ? "Earliest supplier slot to protect the stock buffer"
      : "Timed from current stock and sales, with 90 minutes reserved for collection",
  };
}
export const LABOR_POLICY = Object.freeze({
  shiftHours: 10,
  mealMinutes: 30,
  restMinutes: 15,
  restBreaks: 2,
  nightEnd: 22,
  overnightRestHours: 10,
});
export const CONSTRUCTION_STAGES = Object.freeze([
  { id: "survey", label: "Contractor survey", ticks: 30 },
  { id: "reclamation", label: "Island and causeway construction", ticks: 60 },
  { id: "foundation", label: "Factory foundations", ticks: 45 },
  { id: "building", label: "Shop, factory, garden and greenhouse", ticks: 75 },
]);
export function normalizeRealism(s) {
  if (s.realismVersion === 1) {
    s.vehicleLocations ||= {};
    for (const [i, c] of (s.crew || []).entries()) {
      c.vehicles ||= [];
      c.wagePerDay ??= ECONOMY.wageBase + i * 2;
      c.wageArrears ??= 0;
      c.paidDay ??= s.schedule?.day || 1;
    }
    return s;
  }
  s.version = "4.0.0";
  s.realismVersion = 1;
  s.startingMoney ??= 0;
  // Old saves occasionally used fixtures/grants without recording opening equity.
  s.startingMoney =
    s.money - (s.earned || 0) - (s.grants || 0) * 40 + (s.spent || 0);
  s.operations ||= {
    origin: s.tick || s.crew?.length ? "cafe" : "home",
    importPrice: ECONOMY.importUnitCost,
    shipments: [],
    inboundCarry: 0,
    resourceCarry: 0,
    islandPort: 0,
    resourcesPort: 0,
    oldWarehouse: 0,
    oldOrigin: "home",
    purchasedCases: 0,
    importsPaid: 0,
    resourcesPaid: 0,
    sequence: 0,
  };
  s.office ||= {
    stage: s.tick || s.crew?.length ? "complete" : "garage",
    startedAt: null,
    completedAt: null,
    price: ECONOMY.officePrice,
  };
  s.construction ||= {
    stage: "unowned",
    progress: 0,
    startedAt: null,
    completedAt: null,
    contractor: "Cay Construction",
    paid: 0,
    deal: {
      company: "Cay Development Co.",
      island: "copper",
      status: "unmet",
      askingPrice: 200,
      price: 160,
      negotiatedAt: null,
    },
  };
  s.production ||= {
    resources: 0,
    growing: [],
    fermenting: [],
    packing: [],
    produced: 0,
    harvested: 0,
    expanded: false,
    batches: 0,
  };
  s.schedule ||= {
    shiftStart: 8,
    shiftHours: 10,
    nightQuota: 2,
    nightDelivered: 0,
    totalNightDeliveries: 0,
    day: 1,
    phase: "day_shift",
    restTicks: 0,
    workTicks: 0,
  };
  for (const [i, member] of (s.crew || []).entries()) {
    member.vehicles ||= [];
    member.wagePerDay ??= ECONOMY.wageBase + i * 2;
    member.paidDay ??= 0;
    member.wageArrears ??= 0;
    if (!member.vehicles.includes(member.vehicle)) member.vehicle = "foot";
  }
  s.brandon.transition ??= null;
  s.vehicleLocations ||= Object.fromEntries(
    (s.vehicles || []).map((mode) => [
      mode,
      {
        node: mode === s.vehicle ? s.brandon.node : "workshop",
        position: mode === s.vehicle ? [...s.brandon.position] : [4, -3.4],
      },
    ]),
  );
  s.social ||= {
    bbqs: 0,
    spent: 0,
    lastBBQDay: null,
    phase: "quiet",
    gatheringUntil: null,
  };
  initializeLearning(s);
  initializeWorkweek(s);
  return s;
}
export function originNode(s) {
  return s.operations?.origin || "cafe";
}
export function updateSchedule(s, dayTicks) {
  const schedule = s.schedule,
    day = s.world.day,
    hour = s.world.hour;
  if (schedule.day !== day) {
    schedule.day = day;
    schedule.nightDelivered = 0;
    schedule.workTicks = 0;
  }
  schedule.weekday = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ][(day - 1) % 7];
  schedule.isWeekend = (day - 1) % 7 >= 5;
  schedule.phase = schedule.isWeekend
    ? "weekend"
    : hour >= 8 && hour < 18
      ? "day_shift"
      : hour >= 20 &&
          hour < LABOR_POLICY.nightEnd &&
          schedule.nightDelivered < schedule.nightQuota
        ? "night_deliveries"
        : "rest";
  if (schedule.phase === "rest" || schedule.phase === "weekend")
    schedule.restTicks++;
  if (schedule.phase === "day_shift") schedule.workTicks++;
}
export function laborAvailable(s, b) {
  return (
    !(b.id === "brandon" && shiftEnded(s)) &&
    !b.labor?.pending.length &&
    !b.labor?.breakRemaining &&
    !b.wageArrears &&
    (s.schedule.phase === "day_shift" ||
      (b.id === "brandon" &&
        (s.schedule.phase === "night_deliveries" ||
          unfinishedDeliveries(s) ||
          (s.schedule.isWeekend &&
            s.workweek?.weekendPlan === "special_delivery"))))
  );
}
export function laborStep(s, b, dayTicks) {
  const day = s.schedule.day;
  if (!b.labor || b.labor.day !== day)
    b.labor = {
      day,
      status: "working",
      breakRemaining: 0,
      breakType: null,
      breaksTaken: [],
      pending: [],
      workedTicks: 0,
      restTicks: 0,
    };
  const l = b.labor,
    dayElapsed = s.tick % dayTicks;
  for (const [id, hours, minutes, type] of [
    ["morning", 2, 15, "rest_break"],
    ["lunch", 5, 30, "meal_break"],
    ["afternoon", 7.5, 15, "rest_break"],
  ]) {
    if (
      !s.schedule.isWeekend &&
      s.world.hour >= 8 &&
      s.world.hour < 18 &&
      dayElapsed >= (hours / 24) * dayTicks &&
      !l.breaksTaken.includes(id) &&
      !l.pending.some((x) => x.id === id)
    )
      l.pending.push({
        id,
        type,
        ticks: Math.ceil((minutes / 1440) * dayTicks),
      });
  }
  const busy = (b.action && b.action !== "rest") || b.move || b.voyage;
  if (!busy && !l.breakRemaining && l.pending.length) {
    const next = l.pending.shift();
    l.breakRemaining = next.ticks;
    l.breakType = next.type;
    l.breaksTaken.push(next.id);
  }
  if (!busy && l.breakRemaining) {
    l.status = l.breakType;
    l.breakRemaining--;
    l.restTicks++;
    return;
  }
  l.status = laborAvailable(s, b) ? "working" : "off_duty";
  if (busy) l.workedTicks++;
  else if (l.status === "off_duty") l.restTicks++;
}
export function businessStep(s, { event, spend, dayTicks }) {
  updateSchedule(s, dayTicks);
  for (const member of [s.brandon, ...s.crew]) laborStep(s, member, dayTicks);
  workweekStep(s, dayTicks);
  for (const member of s.crew) {
    if (member.paidDay < s.schedule.day) {
      member.wageArrears += member.wagePerDay;
      member.paidDay = s.schedule.day;
    }
    const payment = Math.min(s.money, member.wageArrears);
    if (payment && spend(s, payment)) {
      s.wages += payment;
      member.wageArrears -= payment;
    }
  }
  for (const shipment of s.operations.shipments) {
    if (shipment.status !== "at_sea" || s.tick < shipment.arrivesAt) continue;
    shipment.status = "port";
    if (shipment.kind === "resources")
      s.operations.resourcesPort += shipment.cases;
    else if (shipment.portNode === "farm_port")
      s.operations.islandPort += shipment.cases;
    else s.harbor += shipment.cases;
    event(
      s,
      "shipment",
      `Paid ${shipment.kind} shipment arrived at the island port. Collect it and unload at the shop.`,
    );
  }
  if (
    s.office.stage === "building" &&
    s.tick - s.office.startedAt >= ECONOMY.officeTicks
  ) {
    s.office.stage = "complete";
    s.office.completedAt = s.tick;
    s.operations.oldWarehouse += s.cafe;
    s.operations.oldOrigin = s.operations.origin;
    s.cafe = 0;
    s.operations.origin = "cafe";
    event(
      s,
      "construction",
      "The main-island pickle office is built. Transfer the garage inventory before dispatching from the new office; employee hiring is now available.",
    );
  }
  const build = s.construction;
  if (build.startedAt != null && build.stage !== "complete") {
    let elapsed = s.tick - build.startedAt;
    const duration = CONSTRUCTION_STAGES.reduce(
      (n, stage) => n + stage.ticks,
      0,
    );
    build.progress = Math.min(1, elapsed / duration);
    for (const stage of CONSTRUCTION_STAGES) {
      if (elapsed < stage.ticks) {
        build.stage = stage.id;
        break;
      }
      elapsed -= stage.ticks;
    }
    if (build.progress === 1) {
      build.stage = "complete";
      build.completedAt = s.tick;
      s.operations.oldOrigin = s.operations.origin;
      s.operations.oldWarehouse += s.cafe;
      s.cafe = 0;
      s.operations.origin = "farm_shop";
      event(
        s,
        "construction",
        "The contractor completed Pickle Cay: port, causeway, shop, factory, garden and greenhouse. Move the old stock to the new shop.",
      );
    }
  }
  const social = s.social;
  if (
    s.schedule.weekday === "Saturday" &&
    s.schedule.day % 14 === 6 &&
    s.world.hour >= 14 &&
    s.world.hour < 16 &&
    social.lastBBQDay !== s.schedule.day &&
    [s.brandon, ...s.crew].every(
      (b) => b.node === "home" && !b.move && !b.voyage,
    ) &&
    spend(s, 12)
  ) {
    social.bbqs++;
    social.spent += 12;
    social.lastBBQDay = s.schedule.day;
    social.phase = "barbecue";
    social.gatheringUntil = s.tick + 30;
    event(
      s,
      "social",
      "Brandon invited the team to a paid Saturday barbecue at home. Everyone is off duty.",
    );
  }
  if (social.phase === "barbecue" && s.tick >= social.gatheringUntil)
    social.phase = "quiet";
  const p = s.production;
  for (const [from, to, duration] of [
    ["growing", "fermenting", ECONOMY.fermentTicks],
    ["fermenting", "packing", ECONOMY.packTicks],
    ["packing", null, 0],
  ]) {
    if (
      s.powerOut &&
      from !== "growing" &&
      (!s.tools.generator || (s.tools.generator === 1 && s.tick % 2 === 0))
    ) {
      for (const batch of p[from]) batch.readyAt++;
      continue;
    }
    for (const batch of [...p[from]]) {
      if (s.tick < batch.readyAt) continue;
      p[from].splice(p[from].indexOf(batch), 1);
      if (to) {
        p[to].push({ ...batch, readyAt: s.tick + duration });
        if (from === "growing") p.harvested += batch.cases;
        event(
          s,
          "production",
          `${batch.cases} cases ${from === "growing" ? "harvested; fermenting in brine" : "finished fermentation; packing into jars"}.`,
        );
      } else {
        s.cafe += batch.cases;
        p.produced += batch.cases;
        event(
          s,
          "production",
          `${batch.cases} locally grown, fermented and packed cases are ready at Pickle Cay.`,
        );
      }
    }
  }
}
