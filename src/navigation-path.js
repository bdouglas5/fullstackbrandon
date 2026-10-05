import { SHORELINE } from "../shared/shoreline.js";
import { NODES, route } from "../shared/engine.js";
import { actorMode, roadLanePoint } from "../shared/traffic.js";
import {
  HOME_GARAGE,
  HOME_BUSINESSES,
  businessEntrance,
} from "../shared/islands.js";

export function destinationApproach(actor, state) {
  const action = actor.action || "";
  const target = actor.target;
  if (action === "salvage")
    return SHORELINE.approach.map((p) => [p[0], 0.43, p[1]]);
  if (action === "rest" && target === "home") return [[7.45, 0.43, -4.85]];
  const business = action.startsWith("serve_")
    ? HOME_BUSINESSES[action.slice(6)]
    : null;
  if (business) {
    const entrance = businessEntrance(business);
    return [entrance.door, entrance.inside].map((p) => [p[0], 0.43, p[1]]);
  }
  if (target === "workshop" && /^(craft_|buy_|upgrade_|hire_)/.test(action))
    return [
      [4.45, 0.43, -3.4],
      [4.45, 0.43, -4.78],
    ];
  const warehouse =
    [
      "collect",
      "deliver",
      "unload_shipment",
      "order_import",
      "buy_resources",
      "hire_employee",
      "pick_parcel",
      "build_office",
    ].includes(action) ||
    (action === "pickup_shipment" && state.operations?.oldWarehouse > 0);
  if (warehouse && ["home", "cafe"].includes(target)) {
    const entrance =
      target === "home"
        ? HOME_GARAGE
        : { door: [3.57, 0.69], inside: [3.57, 0.2] };
    return [entrance.door, entrance.inside].map((p) => [p[0], 0.43, p[1]]);
  }
  return [];
}
const gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export function roundNavigation(points, radius = 0.22) {
  const clean = points.filter((p, i) => !i || gap(p, points[i - 1]) > 0.00001);
  if (clean.length < 3) return clean;
  const result = [clean[0]];
  for (let i = 1; i < clean.length - 1; i++) {
    const a = clean[i - 1],
      b = clean[i],
      c = clean[i + 1];
    const incoming = gap(a, b),
      outgoing = gap(b, c),
      trim = Math.min(radius, incoming * 0.3, outgoing * 0.3);
    const dot =
      a.reduce((sum, v, n) => sum + (b[n] - v) * (c[n] - b[n]), 0) /
      (incoming * outgoing);
    if (dot > 0.9995) {
      result.push(b);
      continue;
    }
    const u = b.map((v, n) => v + ((a[n] - v) * trim) / incoming),
      w = b.map((v, n) => v + ((c[n] - v) * trim) / outgoing);
    result.push(u);
    for (let j = 1; j <= 5; j++) {
      const t = j / 5;
      result.push(
        u.map(
          (v, n) => (1 - t) ** 2 * v + 2 * (1 - t) * t * b[n] + t * t * w[n],
        ),
      );
    }
  }
  result.push(clean.at(-1));
  return result;
}
export function roadForecast(actor, state) {
  const goal = actor.target,
    from = actor.move?.to || actor.node;
  if (!NODES[from] || !NODES[goal]) return [];
  const index = Math.max(
    0,
    [state.brandon, ...(state.crew || [])].findIndex((a) => a?.id === actor.id),
  );
  const points = (actor.avoidance?.points || []).map((p) => [p[0], 0.43, p[1]]);
  const legs = [];
  if (actor.move) legs.push({ ...actor.move });
  const path = route(from, goal, state.bridgeClosed, state.traffic);
  for (let i = 1; i < path.length; i++)
    legs.push({
      from: path[i - 1],
      to: path[i],
      progress: 0,
      distance: gap(NODES[path[i - 1]], NODES[path[i]]),
    });
  for (const leg of legs) {
    const a = NODES[leg.from],
      b = NODES[leg.to],
      length = leg.distance;
    let start = leg.progress || 0;
    if (actor.avoidance?.goal && leg === legs[0]) {
      const p = actor.avoidance.goal;
      start = Math.max(
        start,
        ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) /
          length,
      );
    }
    for (
      let d = Math.min(length, start + 0.3);
      ;
      d = Math.min(length, d + 0.3)
    ) {
      const p = a.map((v, i) => v + ((b[i] - v) * d) / length);
      const lane = roadLanePoint(
        { ...actor, move: leg },
        p,
        NODES,
        index,
        actorMode(actor),
      ).position;
      points.push([lane[0], 0.43, lane[1]]);
      if (d >= length) break;
    }
  }
  return [...points, ...destinationApproach(actor, state)];
}
