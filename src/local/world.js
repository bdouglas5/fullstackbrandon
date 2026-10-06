import {
  fresh,
  clone,
  begin,
  baseline,
  decisionReady,
  command,
  step,
  metrics,
  legal,
  normalizeOrders,
  normalizeWeather,
  VERSION,
  evaluateRun,
} from "../../shared/engine.js";
import { decisionTrace } from "../../shared/decision-trace.js";
import { simulationSpeed } from "../../shared/business-hours.js";

// This is the same engine as the server edition. Only scheduling and storage
// ownership change: each browser owns its independent world.
export class BrowserWorld {
  constructor({
    records = [],
    selected = null,
    achievements = {},
    tickMs = 400,
    uuid = () => crypto.randomUUID(),
  } = {}) {
    this.records = new Map(records.map((record) => [record.id, record]));
    this.selected = selected;
    this.achievements = achievements;
    this.tickMs = tickMs;
    this.uuid = uuid;
    this.dirty = new Set();
    this.pendingFrames = new Map();
    this.deletedFrames = [];
    this.deletedRuns = [];
    this.credit = 0;
    this.lastPump = null;
    for (const record of this.records.values()) {
      if (record.state.brandon && Array.isArray(record.state.customerQueue))
        normalizeOrders(record.state);
      normalizeWeather(record.state);
      if (record.state.status === "running") record.state.status = "paused";
      this.remember(record);
    }
  }
  envelope(record) {
    return {
      id: record.id,
      state: clone(record.state),
      metrics: record.state.version === VERSION ? metrics(record.state) : null,
      jevConfigured: false,
      thinking: false,
      pendingDecision: null,
      tickMs: this.tickMs,
      storageMode: "browser",
    };
  }
  own(id) {
    const record = this.records.get(id);
    if (!record) throw new Error("Saved world not found in this browser.");
    return record;
  }
  remember(record) {
    Object.assign(this.achievements, record.state.achievements?.unlocked || {});
    if (Object.keys(this.achievements).length)
      record.state.achievementCollection = { unlocked: this.achievements };
    this.dirty.add(record.id);
  }
  saveFrame(record) {
    const state = clone(record.state);
    // Decision explanations belong to the current run and checkpoints. Replay
    // frames retain the decisions' outcomes without duplicating every large
    // candidate trace hundreds of times per save.
    state.decisions = state.decisions.map((decision) => ({
      ...decision,
      trace: null,
    }));
    record.frames.set(state.tick, state);
    this.pendingFrames.set(`${record.id}:${state.tick}`, {
      run: record.id,
      tick: state.tick,
      state,
    });
    if (state.tick % 60 === 0 || state.status === "complete") {
      const stride = 2 ** Math.ceil(Math.log2(Math.max(64, state.tick / 128)));
      for (const tick of record.frames.keys()) {
        if (tick < state.tick - 180 && tick % stride !== 0) {
          record.frames.delete(tick);
          this.pendingFrames.delete(`${record.id}:${tick}`);
          this.deletedFrames.push([record.id, tick]);
        }
      }
      const oldest = record.state.decisions[0]?.tick;
      for (const [key, checkpoint] of record.checkpoints)
        if (checkpoint.tick < oldest) record.checkpoints.delete(key);
    }
    this.remember(record);
  }
  create(state, parent = null) {
    for (const record of this.records.values()) {
      if (record.state.status === "running") {
        record.state.status = "paused";
        this.saveFrame(record);
      }
    }
    // Keep the active branch and its parent; bound old careers on phones.
    while (this.records.size >= 8) {
      const oldest = [...this.records.values()].find(
        (record) =>
          record.id !== parent &&
          record.id !== this.selected &&
          ![...this.records.values()].some(
            (child) => child.parent === record.id,
          ),
      );
      if (!oldest)
        throw new Error(
          "The saved career library is full. Return to an existing world.",
        );
      this.records.delete(oldest.id);
      this.deletedRuns.push(oldest.id);
    }
    const record = {
      id: this.uuid(),
      state,
      parent,
      frames: new Map(),
      checkpoints: new Map(),
    };
    this.records.set(record.id, record);
    this.selected = record.id;
    this.credit = 0;
    this.lastPump = null;
    this.saveFrame(record);
    return record;
  }
  request(path, body) {
    if (path === "/session")
      return {
        run:
          this.selected && this.records.has(this.selected)
            ? this.envelope(this.own(this.selected))
            : null,
        jevConfigured: false,
        storageMode: "browser",
      };
    if (path === "/runs" && body)
      return this.envelope(
        this.create(
          fresh(
            Number.isSafeInteger(body.seed) &&
              body.seed >= 0 &&
              body.seed < 100000
              ? body.seed
              : 42,
            "rules",
          ),
        ),
      );
    const match = path.match(/^\/runs\/([^/]+)(?:\/(\w+))?$/);
    if (!match) throw new Error("Unknown world action.");
    const record = this.own(match[1]),
      route = match[2];
    if (!route) return this.envelope(record);
    if (route === "history")
      return [...record.frames]
        .sort(([a], [b]) => a - b)
        .map(([tick, state]) => ({ tick, state: clone(state) }));
    if (route === "export")
      return {
        version: VERSION,
        ...this.envelope(record),
        frames: this.request(`/runs/${record.id}/history`).map(
          (frame) => frame.state,
        ),
      };
    if (route === "comparison") {
      const result = evaluateRun(record.state);
      return {
        actual: {
          label: record.parent ? "Player branch" : "Rules controller",
          metrics: metrics(record.state),
        },
        baseline: { label: result.label, metrics: result.metrics },
        note: "Same seed and timed disruptions; all computation runs in this browser.",
      };
    }
    if (route === "select") {
      for (const previous of this.records.values())
        if (previous.state.status === "running") {
          previous.state.status = "paused";
          this.saveFrame(previous);
        }
      this.selected = record.id;
      this.credit = 0;
      this.lastPump = null;
      return this.envelope(record);
    }
    if (record.state.version !== VERSION)
      throw new Error("Start a new career to use the updated simulation.");
    if (route === "command") {
      const state = clone(record.state);
      command(state, body.type, body.value);
      record.state = state;
      this.lastPump = null;
      this.credit = 0;
      this.saveFrame(record);
      return this.envelope(record);
    }
    if (route === "branch") {
      const checkpoint = record.checkpoints.get(body.decision);
      if (!checkpoint)
        throw new Error("That decision can no longer be branched.");
      const state = normalizeOrders(clone(checkpoint));
      if (!legal(state).includes(body.action))
        throw new Error("That action was not legal at this moment.");
      state.status = "paused";
      const before = clone(state);
      const decision = begin(state, body.action, { controller: "player" });
      state.branch = { parent: record.id, decision: body.decision };
      const branch = this.create(state, record.id);
      branch.checkpoints.set(decision.id, before);
      return this.envelope(branch);
    }
    throw new Error("Unknown world action.");
  }
  pump(now, emit) {
    if (!this.selected) return;
    const record = this.own(this.selected);
    if (record.state.status !== "running") {
      this.lastPump = null;
      this.credit = 0;
      return;
    }
    const elapsed =
      this.lastPump === null ? 0 : Math.max(0, now - this.lastPump);
    this.lastPump = now;
    this.credit = Math.min(
      8 + simulationSpeed(record.state),
      this.credit + (elapsed / this.tickMs) * simulationSpeed(record.state),
    );
    while (this.credit >= 1 && record.state.status === "running") {
      if (decisionReady(record.state)) {
        const before = clone(record.state);
        const decision = begin(record.state, baseline(record.state), {
          controller: "rules",
          trace: decisionTrace(before),
        });
        if (decision) record.checkpoints.set(decision.id, before);
      }
      step(record.state);
      this.credit -= 1;
      this.saveFrame(record);
      emit(this.envelope(record));
    }
  }
}
