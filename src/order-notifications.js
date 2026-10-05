import { ordersOpen, visibleOrders } from "../shared/business-hours.js";

// These durations use wall time so completed deliveries disappear even when
// the simulation is paused or the server stops sending snapshots.
export const ORDER_NOTICE_TIMING = {
  arrival: 650,
  fulfilled: 1800,
  exit: 400,
};

const MAX_COMPLETED_NOTICES = 24;

function freshTimeline(previous, snapshot, scope) {
  return (
    !previous ||
    previous.scope !== scope ||
    previous.seed !== snapshot.seed ||
    snapshot.tick < previous.tick ||
    snapshot.arrivals < previous.arrivals ||
    snapshot.served < previous.served
  );
}

function notice(order, now) {
  return {
    id: order.id,
    order,
    status: "pending",
    appearedAt: now,
    fulfilledAt: null,
    removedAt: null,
  };
}

function progress(item, now) {
  if (item.removedAt !== null) {
    if (now >= item.removedAt + ORDER_NOTICE_TIMING.exit) return null;
    return { ...item, status: "leaving" };
  }
  if (item.fulfilledAt === null || now < item.fulfilledAt)
    return { ...item, status: "pending" };
  const exitAt = item.fulfilledAt + ORDER_NOTICE_TIMING.fulfilled;
  if (now >= exitAt + ORDER_NOTICE_TIMING.exit) return null;
  return {
    ...item,
    status: now >= exitAt ? "leaving" : "fulfilled",
  };
}

export function advanceOrderNotifications(
  previous,
  snapshot = {},
  now = 0,
  scope = "live",
) {
  const customerOrders = new Map();
  for (const order of visibleOrders(snapshot)) {
    const customer = order.customerId || order.id;
    const existing = customerOrders.get(customer);
    customerOrders.set(
      customer,
      existing
        ? { ...existing, cases: (existing.cases || 1) + (order.cases || 1) }
        : order,
    );
  }
  const queue = [...customerOrders.values()];
  const history = snapshot.customerHistory || [];
  const reset = freshTimeline(previous, snapshot, scope);
  const pending = new Map(queue.map((order) => [order.id, order]));
  // Only an explicit fulfillment record can turn a notification green.
  const delivered = new Map(
    history
      .filter((order) => Number.isFinite(order.servedAt))
      .map((order) => [order.id, order]),
  );
  const items = new Map(
    (reset ? [] : previous.items).map((item) => [item.id, { ...item }]),
  );
  for (const order of queue) {
    const existing = items.get(order.id);
    items.set(order.id, existing ? { ...existing, order } : notice(order, now));
  }
  // A fast delivery can arrive and finish between two server snapshots. Give
  // that real delivery the same blue -> green sequence as an observed order.
  if (!reset) {
    const seen = new Set(previous.historyIds);
    for (const [id, order] of delivered)
      if (!seen.has(id) && !items.has(id)) items.set(id, notice(order, now));
  }
  const updated = [];
  for (const item of items.values()) {
    const completion = delivered.get(item.id);
    if (completion && item.fulfilledAt === null && item.removedAt === null) {
      item.order = completion;
      item.fulfilledAt = Math.max(
        now,
        item.appearedAt + ORDER_NOTICE_TIMING.arrival,
      );
    } else if (
      !pending.has(item.id) &&
      !completion &&
      item.fulfilledAt === null &&
      item.removedAt === null
    ) {
      // A reset, cancellation, or incomplete history is not a delivery.
      item.removedAt = now;
    }
    // Hide pending bubbles immediately during rest, including a fast delivery
    // still waiting for its blue-to-green animation. Reopening starts fresh.
    if (!ordersOpen(snapshot) && item.fulfilledAt === null) continue;
    const current = progress(item, now);
    if (!ordersOpen(snapshot) && current?.status === "pending") continue;
    if (current) updated.push(current);
  }
  const completed = updated.filter(
    (item) => item.fulfilledAt !== null || item.removedAt !== null,
  );
  const overflow = new Set(
    completed
      .slice(0, Math.max(0, completed.length - MAX_COMPLETED_NOTICES))
      .map((item) => item.id),
  );
  // A business owns one bubble. A fresh request immediately replaces its old
  // success feedback; rapid repeat deliveries can never create a vertical stack.
  const customerNotices = new Map();
  for (const item of updated.filter((item) => !overflow.has(item.id))) {
    const customer = item.order.customerId || item.order.id,
      current = customerNotices.get(customer);
    if (!current || pending.has(item.id) || !pending.has(current.id))
      customerNotices.set(customer, { ...item, stack: 0 });
  }
  return {
    scope,
    seed: snapshot.seed,
    tick: snapshot.tick,
    arrivals: snapshot.arrivals,
    served: snapshot.served,
    historyIds: [...delivered.keys()],
    items: [...customerNotices.values()],
  };
}

export function nextOrderNotificationDeadline(notifications) {
  const deadlines = notifications.items.flatMap((item) => {
    if (item.removedAt !== null)
      return [item.removedAt + ORDER_NOTICE_TIMING.exit];
    if (item.fulfilledAt === null) return [];
    if (item.status === "pending") return [item.fulfilledAt];
    return [
      item.fulfilledAt +
        ORDER_NOTICE_TIMING.fulfilled +
        (item.status === "leaving" ? ORDER_NOTICE_TIMING.exit : 0),
    ];
  });
  return deadlines.length ? Math.min(...deadlines) : null;
}
