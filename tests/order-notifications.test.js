import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceOrderNotifications,
  nextOrderNotificationDeadline,
  ORDER_NOTICE_TIMING,
} from "../src/order-notifications.js";
import { fresh, baseline, begin, step } from "../shared/engine.js";

const order = (id, customerId = "ari") => ({
  id,
  customerId,
  name: "Ari",
  order: "Garlic dill for lunch",
  position: [3, 4],
  arrived: 0,
});
const snapshot = (queue = [], history = [], overrides = {}) => ({
  seed: 42,
  tick: 10,
  arrivals: 2,
  served: history.length,
  customerQueue: queue,
  customerHistory: history,
  ...overrides,
});
const complete = (request, servedAt = 10) => ({
  ...request,
  servedAt,
  courier: "Brandon",
});

test("a fulfilled order turns green, exits, and disappears on wall time while paused", () => {
  const request = order("one");
  let notices = advanceOrderNotifications(null, snapshot([request]), 0);
  assert.equal(notices.items[0].status, "pending");
  const paused = snapshot([], [complete(request)], { status: "paused" });
  notices = advanceOrderNotifications(notices, paused, 1000);
  assert.equal(notices.items[0].id, request.id);
  assert.equal(notices.items[0].status, "fulfilled");
  assert.equal(notices.items[0].order.courier, "Brandon");
  const exitAt = 1000 + ORDER_NOTICE_TIMING.fulfilled;
  assert.equal(nextOrderNotificationDeadline(notices), exitAt);
  notices = advanceOrderNotifications(notices, paused, exitAt);
  assert.equal(notices.items[0].status, "leaving");
  notices = advanceOrderNotifications(
    notices,
    paused,
    exitAt + ORDER_NOTICE_TIMING.exit,
  );
  assert.deepEqual(notices.items, []);
  assert.equal(nextOrderNotificationDeadline(notices), null);
  assert.deepEqual(advanceOrderNotifications(notices, paused, 10000).items, []);
});

test("fast delivery still shows blue before green without changing its identity", () => {
  const request = order("quick");
  let notices = advanceOrderNotifications(null, snapshot([request]), 0);
  const delivered = snapshot([], [complete(request)]);
  notices = advanceOrderNotifications(notices, delivered, 100);
  assert.equal(notices.items[0].status, "pending");
  assert.equal(
    nextOrderNotificationDeadline(notices),
    ORDER_NOTICE_TIMING.arrival,
  );
  notices = advanceOrderNotifications(
    notices,
    delivered,
    ORDER_NOTICE_TIMING.arrival,
  );
  assert.equal(notices.items[0].status, "fulfilled");
  assert.equal(notices.items[0].id, "quick");
});

test("deliveries between snapshots animate, but old history on first load does not", () => {
  const old = complete(order("old"));
  let notices = advanceOrderNotifications(null, snapshot([], [old]), 0);
  assert.deepEqual(notices.items, []);
  const newDelivery = complete(order("new"), 12);
  const next = snapshot([], [old, newDelivery], { tick: 12 });
  notices = advanceOrderNotifications(notices, next, 1000);
  assert.deepEqual(
    notices.items.map((item) => item.id),
    ["new"],
  );
  assert.equal(notices.items[0].status, "pending");
  notices = advanceOrderNotifications(notices, next, 1650);
  assert.equal(notices.items[0].status, "fulfilled");
});

test("one customer has one bubble and a new pending order replaces completed feedback", () => {
  const first = order("first");
  const second = order("second");
  let notices = advanceOrderNotifications(null, snapshot([first, second]), 0);
  assert.deepEqual(
    notices.items.map((item) => item.stack),
    [0],
  );
  notices = advanceOrderNotifications(
    notices,
    snapshot([second], [complete(first)]),
    1000,
  );
  assert.deepEqual(
    notices.items.map((item) => [item.id, item.status]),
    [["second", "pending"]],
  );
  assert.deepEqual(notices.items[0].order.position, second.position);
});

test("disappearing from the queue without fulfillment never turns green", () => {
  let notices = advanceOrderNotifications(
    null,
    snapshot([order("missing")]),
    0,
  );
  const removed = snapshot();
  notices = advanceOrderNotifications(notices, removed, 1000);
  assert.equal(notices.items[0].status, "leaving");
  assert.equal(notices.items[0].fulfilledAt, null);
  notices = advanceOrderNotifications(notices, removed, 1400);
  assert.deepEqual(notices.items, []);
});

test("new runs and replay seeks clear prior feedback even when IDs and ticks repeat", () => {
  const request = order("order-0");
  let notices = advanceOrderNotifications(
    null,
    snapshot([request]),
    0,
    "run-a",
  );
  notices = advanceOrderNotifications(
    notices,
    snapshot([], [complete(request)]),
    1000,
    "run-a",
  );
  notices = advanceOrderNotifications(
    notices,
    snapshot([request]),
    1100,
    "run-b",
  );
  assert.equal(notices.items[0].status, "pending");
  assert.equal(notices.items[0].fulfilledAt, null);
  const replay = snapshot([], [complete(request)], { tick: 50 });
  notices = advanceOrderNotifications(notices, replay, 1200, "run-b:replay-50");
  assert.deepEqual(notices.items, []);
  notices = advanceOrderNotifications(notices, replay, 1300, "run-b:replay-60");
  assert.deepEqual(notices.items, []);
});

test("tick regression clears stale feedback without relying on explicit scope", () => {
  const request = order("order-0");
  let notices = advanceOrderNotifications(null, snapshot([request]), 0);
  notices = advanceOrderNotifications(
    notices,
    snapshot([], [complete(request)]),
    1000,
  );
  notices = advanceOrderNotifications(
    notices,
    snapshot([request], [], { tick: 0 }),
    1100,
  );
  assert.equal(notices.items[0].fulfilledAt, null);
  assert.equal(notices.items[0].status, "pending");
});

test("completed notification bursts are bounded without hiding waiting customers", () => {
  const pending = order("waiting", "jo");
  let notices = advanceOrderNotifications(null, snapshot([pending]), 0);
  const history = Array.from({ length: 80 }, (_, i) =>
    complete(order(`old-${i}`)),
  );
  notices = advanceOrderNotifications(
    notices,
    snapshot([pending], history),
    1000,
  );
  assert.equal(notices.items.length, 2);
  assert.ok(notices.items.some((item) => item.id === "waiting"));
  notices = advanceOrderNotifications(
    notices,
    snapshot([pending], history),
    4000,
  );
  assert.deepEqual(
    notices.items.map((item) => item.id),
    ["waiting"],
  );
});

test("real engine fulfillment produces green feedback for the exact delivered order", () => {
  const state = fresh(42);
  state.status = "running";
  let notices = advanceOrderNotifications(null, state, 0);
  for (let i = 0; i < 600 && state.served === 0; i++) {
    if (!state.brandon.action) begin(state, baseline(state));
    step(state);
    notices = advanceOrderNotifications(notices, state, state.tick * 100);
  }
  assert.ok(state.served > 0, "engine fulfilled an actual request");
  const delivery = state.customerHistory.at(-1);
  assert.ok(!state.customerQueue.some((request) => request.id === delivery.id));
  assert.equal(
    notices.items.find((item) => item.id === delivery.id)?.status,
    "fulfilled",
  );
});
