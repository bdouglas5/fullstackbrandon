import test from "node:test";
import assert from "node:assert/strict";
import { BrowserWorld } from "../src/local/world.js";
import { inventoryTotal, legal, VERSION } from "../shared/engine.js";
function world() {
  let id = 0;
  return new BrowserWorld({ uuid: () => `world-${++id}`, tickMs: 10 });
}
test("fresh browser visitor uses rules, progresses at selected pace, and conserves money and stock", () => {
  const local = world();
  assert.equal(local.request("/session").run, null);
  const run = local.request("/runs", { controller: "jev", seed: 42 });
  assert.equal(run.state.controller, "rules");
  assert.equal(run.storageMode, "browser");
  assert.equal(run.jevConfigured, false);
  local.request(`/runs/${run.id}/command`, { type: "start" });
  const frames = [];
  for (let now = 0; now <= 100; now += 10)
    local.pump(now, (frame) => frames.push(frame));
  assert.equal(frames.length, 10);
  assert.equal(frames.at(-1).state.tick, 10);
  for (const frame of frames) {
    assert.equal(inventoryTotal(frame.state), frame.state.initial);
    assert.equal(
      frame.state.money,
      frame.state.startingMoney +
        frame.state.earned -
        frame.state.spent +
        40 * frame.state.grants,
    );
  }
  const decision = frames.at(-1).state.decisions[0];
  assert.equal(decision.controller, "rules");
  assert.ok(decision.trace.options.length);
  local.request(`/runs/${run.id}/command`, { type: "pause" });
  local.pump(200, () => assert.fail("Paused worlds cannot advance"));
});
test("saved worlds reload paused and independent visitors cannot select each other's run", () => {
  const local = world(),
    run = local.request("/runs", {});
  local.request(`/runs/${run.id}/command`, { type: "start" });
  local.pump(0, () => {});
  local.pump(100, () => {});
  const restored = new BrowserWorld({
    records: structuredClone([...local.records.values()]),
    selected: run.id,
  });
  assert.equal(restored.request("/session").run.state.status, "paused");
  assert.equal(
    restored.request("/session").run.state.tick,
    local.own(run.id).state.tick,
  );
  assert.throws(() => world().request(`/runs/${run.id}`), /not found/);
});
test("weather, replay, legal decision branches, parent selection, export and trophies stay available", () => {
  const local = world(),
    run = local.request("/runs", {});
  local.request(`/runs/${run.id}/command`, { type: "start" });
  for (let now = 0; now <= 4000; now += 10) local.pump(now, () => {});
  local.request(`/runs/${run.id}/command`, {
    type: "environment",
    value: { key: "weather", value: "clear" },
  });
  assert.equal(local.own(run.id).state.environment.weatherOverride, "clear");
  const record = local.own(run.id),
    decision = record.state.decisions[0];
  const checkpoint = record.checkpoints.get(decision.id);
  assert.ok(checkpoint);
  const branch = local.request(`/runs/${run.id}/branch`, {
    decision: decision.id,
    action: legal(checkpoint)[0],
  });
  assert.equal(branch.state.status, "paused");
  assert.equal(branch.state.branch.parent, run.id);
  assert.equal(local.request(`/runs/${branch.id}/select`, {}).id, branch.id);
  assert.equal(local.request(`/runs/${run.id}/select`, {}).id, run.id);
  const history = local.request(`/runs/${run.id}/history`);
  assert.ok(history.length > 1 && history.length < 300);
  assert.equal(history.at(-1).tick, record.state.tick);
  const exported = local.request(`/runs/${run.id}/export`);
  assert.equal(exported.version, VERSION);
  assert.equal(exported.frames.at(-1).tick, record.state.tick);
  assert.ok(exported.state.decisions[0].trace);
  assert.throws(
    () =>
      local.request(`/runs/${run.id}/branch`, {
        decision: decision.id,
        action: "invalid",
      }),
    /not legal/,
  );
});
