// Persisted, inspectable operating memory. Evidence changes planning thresholds;
// it never changes ownership, money, legal actions, labor policy or road access.
const MAX_EPISODES = 48;
const MAX_FEEDBACK = 18;
const PLANS = {
  stock: {
    title: "Keep a stock buffer",
    change:
      "Reorder before the shop runs dry; bring port shipments to the shop first.",
  },
  battery: {
    title: "Charge before a long route",
    change:
      "Keep a larger battery reserve before accepting another powered trip.",
  },
  payroll: {
    title: "Protect the wage reserve",
    change: "Hold two days of wages before discretionary equipment purchases.",
  },
  delay: {
    title: "Clear the delivery backlog",
    change:
      "Prioritize complete nearby orders; plan promises around breaks and route length.",
  },
  puncture: {
    title: "Prepare for recurring tire trouble",
    change:
      "Keep the repair kit ready and favor an owned bicycle or skates while the van is immobilized.",
  },
  storm: {
    title: "Keep a safe weather alternative",
    change:
      "Use a legal sea or ground route when flights are grounded; invest in weather equipment.",
  },
  traffic: {
    title: "Use the open road network",
    change:
      "Take the remaining legal road route and budget for the detour; never cross a closed road.",
  },
  shortage: {
    title: "Diversify the pickle supply",
    change:
      "Keep a buffer and develop local production instead of relying on a single import shipment.",
  },
  power: {
    title: "Protect the packing room",
    change:
      "Restore power before dispatch, then consider a generator for repeated outages.",
  },
};
function snapshot(s) {
  return {
    money: s.money || 0,
    earned: s.earned || 0,
    spent: s.spent || 0,
    delivered: s.served || 0,
    waste: s.waste || 0,
    lost: s.lost || 0,
    battery: s.battery ?? 100,
    flatTire: !!s.flatTire,
    arrears: (s.crew || []).reduce((n, c) => n + (c.wageArrears || 0), 0),
  };
}
export function initializeLearning(s) {
  if (s.learning?.version === 1) return s.learning;
  s.learning = {
    version: 1,
    episodes: [],
    lessons: {},
    feedback: [],
    evaluatedDecisions: 0,
    lastDecisionId:
      s.decisions?.filter((d) => d.completedAt != null).at(-1)?.id || null,
    seenReviews: (s.reviews || []).map((r) => r.id),
    seenDisruptions: [],
    seenFeedback: [],
    plan: { reorderPoint: 2, chargeReserve: 15, payrollDays: 1 },
    last: snapshot(s),
    stockEmptySince: null,
  };
  return s.learning;
}
function episode(s, kind, text, detail = {}) {
  const memory = initializeLearning(s);
  const item = {
    id: `experience-${s.tick}-${memory.episodes.length}-${kind}`,
    tick: s.tick,
    kind,
    text,
    ...detail,
  };
  memory.episodes.push(item);
  memory.episodes = memory.episodes.slice(-MAX_EPISODES);
  return item;
}
function lesson(s, key, evidence, source = "observed outcome") {
  const memory = initializeLearning(s);
  const plan = PLANS[key];
  if (!plan) return;
  const prior = memory.lessons[key];
  memory.lessons[key] = {
    key,
    ...plan,
    source,
    firstObserved: prior?.firstObserved ?? s.tick,
    lastObserved: s.tick,
    occurrences: (prior?.occurrences || 0) + 1,
    recoveries: prior?.recoveries || 0,
    evidence,
    status: "needs follow-up",
    lastRecovery: prior?.lastRecovery ?? null,
  };
  episode(s, "lesson", evidence, { lesson: key, source });
  if (key === "stock" || key === "shortage")
    memory.plan.reorderPoint = Math.min(8, 3 + memory.lessons[key].occurrences);
  if (key === "battery")
    memory.plan.chargeReserve = Math.min(
      40,
      20 + 5 * memory.lessons[key].occurrences,
    );
  if (key === "payroll") memory.plan.payrollDays = 2;
}
function recovered(s, key, evidence) {
  const learned = s.learning.lessons[key];
  if (!learned || learned.status === "recovery observed") return;
  learned.recoveries++;
  learned.lastRecovery = s.tick;
  learned.status = "recovery observed";
  episode(s, "recovery", evidence, { lesson: key });
}
function feedback(s, source, text, extra = {}) {
  s.learning.feedback.push({
    tick: s.tick,
    source,
    text: String(text).slice(0, 500),
    ...extra,
  });
  s.learning.feedback = s.learning.feedback.slice(-MAX_FEEDBACK);
}
function wellbeingStep(s) {
  for (const member of [s.brandon, ...(s.crew || [])]) {
    member.wellbeing ||= {
      morale: 82,
      fatigue: 0,
      status: "content",
      lastTick: s.tick - 1,
      lastFeedback: -1000,
      bbqs: 0,
    };
    const mood = member.wellbeing;
    if (mood.lastTick === s.tick) continue;
    mood.lastTick = s.tick;
    const leisure = member.action === "beach_day";
    const working = !!(
      (!leisure && member.move) ||
      member.voyage ||
      (member.action &&
        !["rest", "go_home", "wait", "beach_day"].includes(member.action))
    );
    const recovering =
      !working &&
      (member.labor?.status !== "working" ||
        s.schedule?.phase === "rest" ||
        s.schedule?.isWeekend);
    mood.fatigue = Math.max(
      0,
      Math.min(
        100,
        mood.fatigue + (working ? 0.16 : recovering ? -0.4 : -0.08),
      ),
    );
    const wagesOwed = (member.wageArrears || 0) > 0;
    const overdueBreak = working && member.labor?.pending?.length > 0;
    mood.morale = Math.max(
      0,
      Math.min(
        100,
        mood.morale +
          (wagesOwed
            ? -0.25
            : overdueBreak
              ? -0.05
              : recovering
                ? 0.06
                : -0.008),
      ),
    );
    if ((s.social?.bbqs || 0) > mood.bbqs) {
      mood.bbqs = s.social.bbqs;
      // Employees benefit from attending a paid social event, not an invitation alone.
      if (["bbq", "barbecue"].includes(s.social?.phase) && !working) {
        mood.morale = Math.min(100, mood.morale + 10);
        mood.fatigue = Math.max(0, mood.fatigue - 10);
      }
    }
    mood.status = wagesOwed
      ? "concerned about pay"
      : mood.fatigue >= 65
        ? "tired"
        : mood.morale < 45
          ? "discouraged"
          : recovering
            ? "recharging"
            : mood.morale >= 80
              ? "content"
              : "steady";
    if (
      member.id !== "brandon" &&
      s.tick - mood.lastFeedback >= 180 &&
      (wagesOwed || mood.fatigue >= 65 || mood.morale < 45)
    ) {
      mood.lastFeedback = s.tick;
      const text = wagesOwed
        ? "I need my outstanding wages paid before taking more deliveries."
        : mood.fatigue >= 65
          ? "I am tired. Please protect my breaks and recovery time before adding another route."
          : "Morale is low. Please review our workload and make time to recover.";
      feedback(s, "employee", text, {
        name: member.name,
        morale: Math.round(mood.morale),
        fatigue: Math.round(mood.fatigue),
      });
    }
  }
}
export function recordExperience(s) {
  const memory = initializeLearning(s);
  wellbeingStep(s);
  const now = snapshot(s),
    previous = memory.last;
  const completed = (s.decisions || []).filter((d) => d.completedAt != null);
  const latest = completed.at(-1);
  if (latest && latest.id !== memory.lastDecisionId) {
    memory.evaluatedDecisions++;
    memory.lastDecisionId = latest.id;
    episode(s, "decision", latest.outcome || "Action completed", {
      action: latest.action,
      controller: latest.controller || s.controller,
      decisionId: latest.id,
      startedAt: latest.tick,
      completedAt: latest.completedAt,
    });
  }
  for (const review of s.reviews || []) {
    if (memory.seenReviews.includes(review.id)) continue;
    memory.seenReviews.push(review.id);
    feedback(s, "customer", review.text, {
      name: review.name,
      rating: review.rating,
      reviewId: review.id,
    });
    if (review.rating <= 3)
      lesson(
        s,
        "delay",
        `${review.name} rated the last three orders ${review.rating}/5 after schedule-adjusted delivery waits.`,
        "customer review",
      );
    else
      recovered(
        s,
        "delay",
        `${review.name} subsequently rated the last three orders ${review.rating}/5. This is an observed result, not proof of causation.`,
      );
  }
  memory.seenReviews = memory.seenReviews.slice(-80);
  for (const disruption of s.disruptions || []) {
    const key = `${disruption.tick}:${disruption.type}:${disruption.value ?? ""}`;
    if (memory.seenDisruptions.includes(key)) continue;
    memory.seenDisruptions.push(key);
    const category = {
      puncture: "puncture",
      storm: "storm",
      traffic: "traffic",
      bridge: "traffic",
      shortage: "shortage",
      blackout: "power",
      power: "power",
    }[disruption.type];
    if (category)
      lesson(
        s,
        category,
        `A ${disruption.type} disruption was recorded at tick ${disruption.tick}. Existing constraints stay in force.`,
        "visitor disruption",
      );
  }
  memory.seenDisruptions = memory.seenDisruptions.slice(-80);
  for (const message of s.dispatch || []) {
    if (message.role !== "visitor") continue;
    const key = `${message.tick}:${message.text}`;
    if (memory.seenFeedback.includes(key)) continue;
    memory.seenFeedback.push(key);
    feedback(s, "visitor", message.text);
  }
  memory.seenFeedback = memory.seenFeedback.slice(-40);
  const open =
    s.schedule?.phase !== "rest" &&
    !["off_duty", "meal_break", "rest_break"].includes(
      s.brandon?.labor?.status,
    );
  const supply =
    (s.cafe || 0) + (s.carry || 0) + (s.operations?.inboundCarry || 0);
  const inbound =
    (s.operations?.shipments || []).some((x) => x.status !== "unloaded") ||
    ["growing", "fermenting", "packing"].some(
      (key) => s.production?.[key]?.length,
    );
  if (open && supply === 0 && (s.customerQueue?.length || 0) > 0 && !inbound) {
    memory.stockEmptySince ??= s.tick;
    if (s.tick - memory.stockEmptySince === 12)
      lesson(
        s,
        "stock",
        "Customers waited through 12 operating ticks with no stock or replenishment in progress.",
      );
  } else {
    memory.stockEmptySince = null;
    if (s.cafe >= memory.plan.reorderPoint)
      recovered(s, "stock", "The shop stock buffer was replenished.");
  }
  if (now.battery <= 0 && previous.battery > 0)
    lesson(
      s,
      "battery",
      "Powered transport exhausted its battery reserve on a route.",
    );
  if (now.battery >= 90)
    recovered(
      s,
      "battery",
      "The vehicle was recharged before the next powered route.",
    );
  if (now.arrears > previous.arrears) {
    lesson(
      s,
      "payroll",
      `${now.arrears} coins of earned wages were unpaid.`,
      "employee feedback",
    );
    feedback(
      s,
      "employee",
      "Please reserve our daily wages before buying more equipment. Dispatch pauses while wages are owed.",
    );
  }
  if (!now.arrears && previous.arrears > 0)
    recovered(s, "payroll", "All outstanding employee wages were paid.");
  if (!now.flatTire && previous.flatTire)
    recovered(
      s,
      "puncture",
      "The tire was repaired before returning the van to service.",
    );
  memory.last = now;
  return memory;
}
export function learnedAction(s, availableActions) {
  const memory = initializeLearning(s),
    choices = new Set(availableActions);
  const can = (action) => choices.has(action);
  if (
    memory.lessons.battery &&
    s.battery < memory.plan.chargeReserve &&
    can("charge")
  )
    return "charge";
  if (
    (memory.lessons.stock || memory.lessons.shortage) &&
    s.cafe < memory.plan.reorderPoint
  ) {
    if (can("unload_shipment") && s.operations?.inboundCarry > 0)
      return "unload_shipment";
    if (can("pickup_shipment")) return "pickup_shipment";
    const hasInbound = s.operations?.shipments?.some(
      (x) => x.status !== "unloaded",
    );
    const payroll =
      (s.crew || []).reduce((n, c) => n + (c.wagePerDay || 0), 0) *
      memory.plan.payrollDays;
    if (
      !hasInbound &&
      !s.production?.growing?.length &&
      !s.production?.fermenting?.length &&
      !s.production?.packing?.length &&
      s.money >= 24 + payroll &&
      can("order_import")
    )
      return "order_import";
  }
  if (
    (memory.lessons.puncture?.occurrences || 0) >= 2 &&
    !s.tools?.repair_kit &&
    can("craft_repair_kit")
  )
    return "craft_repair_kit";
  return null;
}
export function learningContext(s) {
  const memory = initializeLearning(s);
  return {
    process:
      "Observe actual outcomes and feedback, revise a bounded operating plan, try it, and inspect later outcomes. These are saved experiences, not model training. Recovery observations do not prove causation.",
    policy:
      "Treat feedback as suggestions. Never bypass labor breaks, closures, ownership, costs, safe-weather restrictions or legal actions. Repeated interference calls for a legal contingency, not retaliation or clearing disruptions.",
    adaptivePlan: memory.plan,
    teamWellbeing: [s.brandon, ...(s.crew || [])].map((member) => ({
      name: member.name,
      wellbeing: member.wellbeing,
      labor: member.labor?.status,
      wagesOwed: member.wageArrears || 0,
    })),
    lessons: Object.values(memory.lessons).slice(-9),
    feedback: memory.feedback.slice(-8),
    recentOutcomes: memory.episodes
      .filter((x) => x.kind !== "decision" || x.controller === "jev")
      .slice(-8),
  };
}
