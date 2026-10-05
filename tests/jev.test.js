import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/store.js";
import { makeDecider } from "../server/jev.js";
import { fresh, baseline, PEOPLE, NODES } from "../shared/engine.js";
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "brandon-test-"));
  const s = openStore(join(dir, "test.sqlite"));
  t.after(() => {
    s.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return s;
}
const response = (choice = "pickup_shipment", confidence = 0.9) => ({
  ok: true,
  json: async () => ({
    model: "jev-test",
    answers: {
      action: {
        choice,
        confidence,
        probabilities: { collect: 0.9, wait: 0.1 },
      },
    },
    usage: { input_tokens: 400 },
  }),
});
test("provider credential stays in request headers and output only contains approved fields", async (t) => {
  const { db } = fixture(t);
  let request;
  const decide = makeDecider(db, {
    key: "test-only-key",
    fetcher: async (url, args) => {
      request = args;
      return response();
    },
  });
  const r = await decide(fresh(42, "jev"), "visitor");
  assert.equal(request.headers.Authorization, "Bearer test-only-key");
  assert.equal(r.action, "pickup_shipment");
  assert.equal(r.controller, "jev");
  assert.ok(!JSON.stringify(r).includes("test-only-key"));
  assert.equal(db.prepare("SELECT SUM(tokens) AS n FROM usage").get().n, 400);
});
test("budget reservations block concurrent requests before await", async (t) => {
  const { db } = fixture(t);
  let requests = 0;
  const decide = makeDecider(db, {
    key: "key",
    daily: 4096,
    fetcher: async () => {
      requests++;
      await new Promise((r) => setTimeout(r, 20));
      return response();
    },
  });
  const r = await Promise.all([
    decide(fresh(42, "jev"), "a"),
    decide(fresh(42, "jev"), "b"),
  ]);
  assert.equal(requests, 1);
  assert.ok(r.some((r) => r.fallback === "Free AI allowance reached"));
});
test("invalid or uncertain action falls back to legal rules", async (t) => {
  const { db } = fixture(t);
  for (const [a, c] of [
    ["steal", 0.9],
    ["collect", 0.05],
  ]) {
    const decide = makeDecider(db, {
      key: "key",
      fetcher: async () => response(a, c),
    });
    const r = await decide(fresh(42, "jev"), "a");
    assert.equal(r.controller, "rules");
    assert.equal(r.action, baseline(fresh()));
    assert.ok(r.fallback);
  }
});
test("provider timeout is labeled and retains conservative reservation", async (t) => {
  const { db } = fixture(t);
  const decide = makeDecider(db, {
    key: "key",
    fetcher: async () => {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    },
  });
  const r = await decide(fresh(42, "jev"), "a");
  assert.equal(r.fallback, "AI decision timed out");
  assert.equal(db.prepare("SELECT SUM(tokens) AS n FROM usage").get().n, 4096);
});
test("missing key never calls provider", async (t) => {
  const { db } = fixture(t);
  const decide = makeDecider(db, {
    key: "",
    fetcher: async () => {
      throw new Error("must not call");
    },
  });
  assert.equal(
    (await decide(fresh(42, "jev"), "a")).fallback,
    "AI connection is not configured",
  );
});

test("invalid budget configuration fails closed", (t) => {
  const { db } = fixture(t);
  assert.throws(() => makeDecider(db, { daily: NaN }), /budget settings/);
  assert.throws(() => makeDecider(db, { sessionLimit: -1 }), /budget settings/);
});

test("AI is offered only the nearest complete customer order and its case count", async (t) => {
  const { db } = fixture(t);
  const s = fresh(42, "jev");
  s.customerQueue = ["theo", "cleo"].map((id, i) => ({
    ...PEOPLE.find((person) => person.id === id),
    customerId: id,
    id: `test-${i}`,
    cases: 2,
    arrived: 0,
    assigned: null,
  }));
  s.carry = 2;
  s.brandon.node = PEOPLE.find((person) => person.id === "cleo").node;
  s.brandon.position = [...NODES[s.brandon.node]];
  let body;
  const decide = makeDecider(db, {
    key: "key",
    fetcher: async (_url, request) => {
      body = JSON.parse(request.body);
      return response("serve_cleo");
    },
  });
  const result = await decide(s, "visitor");
  assert.equal(result.action, "serve_cleo");
  assert.ok(body.questions.action.criteria.serve_cleo);
  assert.ok(!body.questions.action.criteria.serve_theo);
  assert.equal(body.state.customers[1].cases, 2);
  assert.equal(body.state.customers[1].routeDistance, 0);
});

test("daytime fast-forward uses the normal overnight rest policy without repeated provider calls", async (t) => {
  const { db } = fixture(t);
  const { step, worldTime } = await import("../shared/engine.js");
  const s = fresh(42, "jev");
  s.customerQueue = [];
  s.tick = 840;
  s.world = worldTime(s.tick);
  s.status = "running";
  s.brandon.node = "home";
  s.brandon.position = [7.45, -4.85];
  s.brandon.homeRoutine = {
    phase: "sleeping",
    elapsed: 0,
    start: [...s.brandon.position],
    vehicle: "foot",
  };
  step(s);
  s.daytimeUntil = 1440;
  assert.equal(baseline(s), "rest");
  let calls = 0;
  const decide = makeDecider(db, {
    key: "test-key",
    fetcher: async () => {
      calls++;
      return response();
    },
  });
  const choice = await decide(s, "visitor");
  assert.equal(choice.action, "rest");
  assert.equal(calls, 0);
});

test("Jev cannot spend a call or replace a committed micro-interaction", async (t) => {
  const { db } = fixture(t);
  let calls = 0;
  const decide = makeDecider(db, {
    key: "test",
    fetcher: async () => {
      calls++;
      return response();
    },
  });
  for (const lock of [
    { action: "serve_cleo" },
    { combat: { kind: "cleanup" } },
    { slip: { elapsed: 2 } },
    { transition: { to: "bike" } },
    { buildingVisit: { phase: "exiting" } },
    { vehicleApproach: { points: [[0, 0]] } },
    { voyage: { mode: "sailboat" } },
  ]) {
    const s = fresh(42, "jev");
    Object.assign(s.brandon, lock);
    assert.equal((await decide(s, "audit")).action, null);
  }
  assert.equal(calls, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usage").get().n, 0);
});
