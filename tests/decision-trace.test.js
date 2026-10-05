import test from "node:test";
import assert from "node:assert/strict";
import { fresh, begin, clone, legal, baseline } from "../shared/engine.js";
import { decisionTrace } from "../shared/decision-trace.js";
import { makeDecider } from "../server/jev.js";
import { openStore } from "../server/store.js";

test("brain snapshot matches provider criteria and preserves decision-time evidence", async () => {
  const { db } = openStore(":memory:");
  try {
    const s = fresh(42, "jev");
    const trace = decisionTrace(s);
    let criteria;
    const decide = makeDecider(db, {
      key: "test-key",
      fetcher: async (_url, request) => {
        criteria = JSON.parse(request.body).questions.action.criteria;
        return {
          ok: true,
          json: async () => ({
            answers: {
              action: {
                choice: baseline(s),
                confidence: 0.9,
                probabilities: { [baseline(s)]: 0.9 },
              },
            },
          }),
        };
      },
    });
    const choice = await decide(clone(s), "brain-test");
    assert.deepEqual(
      trace.options.map((o) => o.action),
      Object.keys(criteria),
    );
    for (const o of trace.options) {
      assert.ok(legal(s).includes(o.action));
      assert.equal(criteria[o.action], `${o.label}. ${o.reason}`);
    }
    const d = begin(s, choice.action, { ...choice, trace });
    const saved = JSON.stringify(d.trace);
    s.money += 100;
    s.learning.plan.reorderPoint += 1;
    assert.equal(JSON.stringify(d.trace), saved);
    assert.equal(d.controller, "jev");
    assert.equal(d.confidence, 0.9);
    assert.ok(!saved.includes("test-key"));
  } finally {
    db.close();
  }
});
