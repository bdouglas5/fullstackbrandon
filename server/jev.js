import { decisionOptions } from "../shared/decision-trace.js";
import {
  canClockOut,
  shiftEnded,
  weekendBeachTime,
} from "../shared/business-hours.js";
import { randomUUID } from "node:crypto";
import { learningContext } from "../shared/learning.js";
import {
  baseline,
  decisionReady,
  orderCases,
  orderDistance,
  ACTIONS,
  reason,
} from "../shared/engine.js";
export function makeDecider(
  db,
  {
    key = process.env.TYPESAFE_API_KEY,
    fetcher = fetch,
    daily = Number(process.env.JEV_DAILY_TOKENS || 1000000),
    sessionLimit = Number(process.env.JEV_SESSION_CALLS || 80),
  } = {},
) {
  if (
    !Number.isSafeInteger(daily) ||
    daily < 0 ||
    !Number.isSafeInteger(sessionLimit) ||
    sessionLimit < 0
  )
    throw new Error("Jev budget settings must be non-negative integers.");
  return async function decide(s, session) {
    if (!decisionReady(s))
      return {
        action: null,
        controller: "rules",
        fallback: "Finishing the committed interaction",
      };
    const fallback = (why) => ({
      action: baseline(s),
      controller: "rules",
      fallback: why,
    });
    if (canClockOut(s))
      return {
        action: "rest",
        controller: "rules",
        fallback: "Clocking out at the end of the scheduled shift",
      };
    if (weekendBeachTime(s))
      return {
        action: "beach_day",
        controller: "rules",
        fallback: "Weekend off: lounging on the beach",
      };
    if (s.controller === "rules")
      return { action: baseline(s), controller: "rules" };
    if (s.daytimeUntil > s.tick && shiftEnded(s) && baseline(s) === "rest")
      return fallback("Advancing to the next scheduled shift");
    if (!key) return fallback("AI connection is not configured");
    const day = new Date().toISOString().slice(0, 10),
      id = randomUUID(),
      reserve = 4096;
    const used = db
      .prepare(
        "SELECT COALESCE(SUM(tokens),0) AS tokens FROM usage WHERE day=?",
      )
      .get(day).tokens;
    const calls = db
      .prepare("SELECT COUNT(*) AS n FROM usage WHERE session=?")
      .get(session).n;
    if (used + reserve > daily || calls >= sessionLimit)
      return fallback("Free AI allowance reached");
    // Synchronous reservation precedes await; a single server owns this SQLite database.
    db.prepare("INSERT INTO usage VALUES(?,?,?,?)").run(
      id,
      session,
      day,
      reserve,
    );
    const start = performance.now();
    try {
      // The model chooses when to deliver; routing always offers the nearest
      // complete order, except for an explicit visitor-requested customer.
      const choices = decisionOptions(s);
      const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.JEV_MODEL || "jev-1.13.0",
          state: {
            goal:
              "Build a sustainable pickle business: pay for stock and wages, respect employee wellbeing, breaks and weekends, negotiate and construct a private factory island, grow and ferment produce, buy individual employee transport, expand before retiring. Learn from recorded outcomes and feedback. " +
              (s.objective === "waste"
                ? "Prefer efficient stocking and avoid spoilage."
                : "Prefer timely deliveries and sustainable expansion."),
            location: s.brandon.node,
            carrying: s.carry,
            packingRoomStock: s.cafe,
            harborStock: s.harbor,
            orchardIslandStock: s.orchard ?? 0,
            fleetRules:
              "Each courier uses only their own purchased vehicles. Earn and buy a bike, van, rocket skates, sailboat, helicopter, jetpack and teleporter. Use real boarding, routes and repairs. A decision commits to a complete interaction: park, dismount, walk inside, hand off exactly the ordered cases, exit, return to the same parked equipment, board, then resume. Keep cargo and equipped travel mode persistent through interruptions. Without a spill kit oil causes a spin-out, including rocket skates; with the kit stop, dismount, scrub, remount and resume the same route. Building exits, boarding, encounters and recovery must finish before another decision. Legal action descriptions carry current costs and effects.",
            experience: learningContext(s),
            schedule: s.schedule,
            labor: s.brandon.labor,
            wellbeing: s.brandon.wellbeing,
            operations: s.operations,
            construction: s.construction,
            production: s.production,
            social: s.social,
            marketStock: s.market ?? 0,
            van: {
              batteryPercent: Math.round(s.battery ?? 100),
              flatTire: !!s.flatTire,
              reserveMode: s.battery <= 0,
            },
            packingRoomPower: s.powerOut
              ? "off: cannot serve until restore action"
              : "on",
            weather: s.storm
              ? "rain: driving slower, more battery use"
              : "clear",
            marketRoad: s.traffic ? "closed; northern loop still open" : "open",
            career: {
              retirement: s.retirement,
              world: s.world,
              recommendedAction: baseline(s),
              crew: s.crew?.map(
                ({
                  id,
                  name,
                  deliveries,
                  efficiency,
                  status,
                  wagePerDay,
                  wageArrears,
                  vehicles,
                  labor,
                  wellbeing,
                }) => ({
                  id,
                  name,
                  deliveries,
                  efficiency,
                  status,
                  wagePerDay,
                  wageArrears,
                  vehicles,
                  labor,
                  wellbeing,
                }),
              ),
              reputation: s.reputation,
            },
            workshopParts: s.parts,
            waitingCustomers: s.queue.length,
            bridge: s.bridgeClosed
              ? "closed; a longer northern route exists"
              : "open",
            expansion: s.outposts,
            business: {
              money: s.money,
              scrap: s.scrap,
              tools: s.tools,
              vehicles: s.vehicles,
              activeVehicle: s.vehicle,
              vanUpgraded: s.vanUpgrade,
              parcel: s.parcel,
            },
            customers: s.customerQueue?.slice(0, 8).map((c) => ({
              orderId: c.id,
              customerId: c.customerId,
              business: c.role,
              product: c.order,
              cases: orderCases(c),
              routeDistance: Math.round(orderDistance(s, c) * 10) / 10,
              fullyStocked: orderCases(c) <= s.carry,
              wait: s.tick - c.arrived,
              tip: c.tip,
              requiredTool: c.requires || null,
              island: c.island,
            })),
            dispatchRequest: s.dispatchGoal || s.request || null,
          },
          questions: {
            action: {
              type: "choice",
              instructions:
                "Choose only an available action. Use the saved experience lessons, customer and employee feedback, and adaptive plan to avoid repeating observed mistakes. Keep wages and stock funded before discretionary purchases. Respect meal/rest breaks, fatigue, maximum shifts, overnight recovery, and weekends even when the visitor repeatedly disrupts the company. Use legal detours, safe alternative transport, supply buffers, production and repair equipment as contingencies; never clear disruptions or ignore labor policy. Customers allow for lawful breaks and normal route time. Negotiate the island agreement in person, commission construction, and establish and expand production before retirement. Each employee needs their own purchased transport. The recommendedAction is the deterministic operating plan; deviate only when evidence or visitor preference justifies it. Deliver the closest reachable complete order; never make partial deliveries. A wait or rest can be the correct legal action. Costs, ownership, routing, resources and consequences are enforced by the simulation.",
              criteria: Object.fromEntries(
                choices.map((a) => [a, `${ACTIONS[a].label}. ${reason(s, a)}`]),
              ),
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`Provider returned ${response.status}`);
      const result = await response.json();
      const a = result.answers?.action,
        tokens = result.usage?.input_tokens;
      if (Number.isSafeInteger(tokens) && tokens >= 0)
        db.prepare("UPDATE usage SET tokens=? WHERE id=?").run(tokens, id);
      if (
        !a ||
        !choices.includes(a.choice) ||
        !Number.isFinite(a.confidence) ||
        a.confidence < 0.25
      )
        return fallback("Decision uncertain or invalid");
      const probabilities = Object.fromEntries(
        choices.map((k) => [
          k,
          Number.isFinite(a.probabilities?.[k])
            ? Math.max(0, Math.min(1, a.probabilities[k]))
            : 0,
        ]),
      );
      return {
        action: a.choice,
        controller: "jev",
        confidence: a.confidence,
        probabilities,
        model:
          typeof result.model === "string" ? result.model.slice(0, 60) : "jev",
        tokens: tokens || 0,
        latency: Math.round(performance.now() - start),
      };
    } catch (error) {
      return fallback(
        error.name === "TimeoutError"
          ? "AI decision timed out"
          : error.message.startsWith("Provider returned")
            ? error.message
            : "AI controller is temporarily unavailable",
      );
    }
  };
}
