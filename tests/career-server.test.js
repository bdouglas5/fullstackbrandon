import test from "node:test";
import { waitForServer, availablePort } from "./fixtures/server-ready.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TRANSPORT, TOOLS, inventoryTotal } from "../shared/engine.js";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  "production server streams a whole unattended career through retirement and persists the result",
  { timeout: 960000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "brandon-career-")),
      port = await availablePort(),
      base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        PUBLIC_ORIGIN: base,
        DATABASE_PATH: join(dir, "career.sqlite"),
        TICK_MS: "1",
        TYPESAFE_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const ctrl = new AbortController();
    t.after(async () => {
      ctrl.abort();
      if (child.exitCode === null) {
        const exited = new Promise((r) => child.once("exit", r));
        child.kill("SIGTERM");
        await exited;
      }
      rmSync(dir, { recursive: true, force: true });
    });
    await waitForServer(child, base, () => output, "Career server");
    const entry = await fetch(base + "/api/session"),
      cookie = entry.headers.get("set-cookie").split(";")[0];
    const headers = {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Little-Worlds": "1",
      Origin: base,
    };
    const call = async (path, body) => {
      const r = await fetch(base + "/api" + path, {
        headers,
        method: body ? "POST" : "GET",
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      assert.ok(r.ok, JSON.stringify(data));
      return data;
    };
    const run = await call("/runs", { controller: "rules", seed: 42 });
    assert.equal(run.state.money, 0);
    assert.deepEqual(run.state.vehicles, []);
    await call(`/runs/${run.id}/command`, { type: "speed", value: 8 });
    const stream = await fetch(base + `/api/runs/${run.id}/events`, {
      headers: { Cookie: cookie },
      signal: ctrl.signal,
    });
    const reader = stream.body.getReader(),
      decoder = new TextDecoder();
    await call(`/runs/${run.id}/command`, { type: "start" });
    const started = Date.now();
    let pending = "",
      last = run.state,
      frames = 0,
      progressedAt = started;
    const observed = new Set();
    while (last.status !== "complete") {
      // Full decision traces grow the persisted state. Allow an endurance
      // budget for slower local disks, while still detecting a stall.
      if (Date.now() - started > 900000)
        throw new Error(
          `Career did not finish: tick ${last.tick}, ${last.message}; ${output}`,
        );
      const { done, value } = await reader.read();
      assert.ok(!done, "event stream must stay open");
      pending += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const block = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        if (!block.startsWith("data: ")) continue;
        const next = JSON.parse(block.slice(6)).state;
        if (next.tick > last.tick) progressedAt = Date.now();
        assert.ok(
          Date.now() - progressedAt < 60000,
          `Career stopped advancing at tick ${last.tick}: ${last.message}`,
        );
        last = next;
        frames++;
        for (const mode of last.vehicles) observed.add(mode);
        assert.equal(inventoryTotal(last), last.initial);
        assert.equal(
          last.money,
          last.startingMoney + last.earned - last.spent + 40 * last.grants,
        );
        assert.notEqual(
          last.status,
          "paused",
          `unexpected server pause: ${output}`,
        );
      }
    }
    assert.deepEqual([...observed], Object.keys(TRANSPORT));
    assert.ok(Object.values(last.tools).every((level) => level === 2));
    assert.equal(Object.keys(last.tools).length, Object.keys(TOOLS).length);
    assert.equal(last.crew.length, 3);
    assert.ok(last.crew.every((c) => c.deliveries > 0));
    assert.ok(last.rating.count > 0);
    assert.ok(last.money >= last.retirement.target);
    assert.ok(last.retirement.ready);
    assert.equal(last.office.stage, "complete");
    assert.equal(last.construction.stage, "complete");
    assert.ok(last.construction.deal.negotiatedAt != null);
    assert.equal(last.operations.origin, "farm_shop");
    assert.ok(last.production.produced > 0 && last.production.expanded);
    assert.ok(last.wages > 0);
    assert.ok(last.crew.every((member) => member.vehicles.length > 0));
    const persisted = await call("/session");
    assert.equal(persisted.run.state.tick, last.tick);
    assert.equal(persisted.run.state.status, "complete");
    const history = await call(`/runs/${run.id}/history`);
    assert.ok(history.length < 700);
    assert.equal(history.at(-1).state.status, "complete");
    mkdirSync("evidence", { recursive: true });
    writeFileSync(
      "evidence/career-server-run.json",
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          version: last.version,
          source:
            "Real production HTTP/SSE server, fresh zero-cash career, rules controller, no gifts or interventions; 8x engine speed and 1ms test cadence.",
          tick: last.tick,
          wallTimeMs: Date.now() - started,
          streamFrames: frames,
          retainedFrames: history.length,
          served: last.served,
          money: last.money,
          tools: last.tools,
          vehicles: last.vehicles,
          transportUsage: last.transportUsage,
          crew: last.crew.map(({ name, deliveries, efficiency }) => ({
            name,
            deliveries,
            efficiency,
          })),
          rating: last.rating,
          retirement: last.retirement,
          office: last.office,
          operations: last.operations,
          construction: last.construction,
          production: last.production,
          workweek: last.workweek,
        },
        null,
        2,
      ),
    );
    ctrl.abort();
  },
);
