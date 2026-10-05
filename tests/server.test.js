import test from "node:test";
import { waitForServer, availablePort } from "./fixtures/server-ready.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "production API: persistence, isolation, commands, replay, branch, and limits",
  { timeout: 90000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "brandon-api-"));
    const port = await availablePort(),
      base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        PUBLIC_ORIGIN: base,
        DATABASE_PATH: join(dir, "test.sqlite"),
        TICK_MS: "15",
        TYPESAFE_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    t.after(async () => {
      if (child.exitCode === null) {
        const exit = new Promise((r) => child.once("exit", r));
        child.kill("SIGTERM");
        await exit;
      }
      rmSync(dir, { recursive: true, force: true });
    });
    await waitForServer(child, base, () => output, "Server");
    const visitor = async () => {
      const r = await fetch(base + "/api/session");
      return r.headers.get("set-cookie").split(";")[0];
    };
    const cookie = await visitor(),
      other = await visitor();
    const call = async (path, body, who = cookie, headers = {}) => {
      const r = await fetch(base + "/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: who,
          "Content-Type": "application/json",
          "X-Little-Worlds": "1",
          Origin: base,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json(), headers: r.headers };
    };
    const create = await call("/runs", { controller: "rules" });
    assert.equal(create.status, 201);
    const id = create.data.id;
    assert.equal(create.data.state.money, 0);
    assert.equal(create.data.state.vehicle, "foot");
    assert.deepEqual(create.data.state.vehicles, []);
    await t.test("other session cannot read or mutate run", async () => {
      assert.equal((await call(`/runs/${id}`, null, other)).status, 404);
      assert.equal(
        (await call(`/runs/${id}/command`, { type: "bridge" }, other)).status,
        404,
      );
      assert.equal(
        (await call(`/runs/${id}/history`, null, other)).status,
        404,
      );
    });
    await t.test("cross-origin command is rejected", async () => {
      assert.equal(
        (
          await call(`/runs/${id}/command`, { type: "bridge" }, cookie, {
            Origin: "https://evil.example",
          })
        ).status,
        403,
      );
    });
    await t.test("bridge, rush, objective and shortage persist", async () => {
      await call(`/runs/${id}/command`, { type: "bridge" });
      const rush = await call(`/runs/${id}/command`, { type: "rush" });
      const shortage = await call(`/runs/${id}/command`, { type: "shortage" });
      await call(`/runs/${id}/command`, { type: "objective", value: "waste" });
      const r = await call("/session");
      assert.equal(r.data.run.state.bridgeClosed, true);
      assert.ok(rush.data.state.queue.length > create.data.state.queue.length);
      assert.equal(r.data.run.state.queue.length, rush.data.state.queue.length);
      assert.equal(r.data.run.state.harbor, shortage.data.state.harbor);
      assert.equal(
        r.data.run.state.lost,
        3,
        "the opening shipment can lose port stock",
      );
      assert.ok(
        r.data.run.state.disruptions.some((event) => event.type === "shortage"),
      );
      assert.equal(r.data.run.state.objective, "waste");
    });
    await t.test(
      "speed and queued investment are validated and persisted",
      async () => {
        const speed = await call(`/runs/${id}/command`, {
          type: "speed",
          value: 4,
        });
        assert.equal(speed.status, 200);
        assert.equal(speed.data.state.speed, 4);
        assert.equal(
          (await call(`/runs/${id}/command`, { type: "speed", value: 9999 }))
            .status,
          400,
        );
        const requested = await call(`/runs/${id}/command`, {
          type: "request",
          value: "buy_bike",
        });
        assert.equal(requested.status, 200);
        assert.equal(requested.data.state.request, "buy_bike");
        assert.deepEqual(requested.data.state.vehicles, []);
        assert.equal(requested.data.state.money, 0);
        assert.equal(
          (
            await call(`/runs/${id}/command`, {
              type: "request",
              value: "invent_cash",
            })
          ).status,
          400,
        );
        await call(`/runs/${id}/command`, { type: "speed", value: 1 });
      },
    );
    await call(`/runs/${id}/command`, { type: "start" });
    await delay(220);
    await t.test("SSE begins with owned authoritative state", async () => {
      const ctrl = new AbortController();
      const r = await fetch(base + `/api/runs/${id}/events`, {
        headers: { Cookie: cookie },
        signal: ctrl.signal,
      });
      assert.match(r.headers.get("content-type"), /text\/event-stream/);
      const reader = r.body.getReader();
      const chunk = await reader.read();
      assert.match(new TextDecoder().decode(chunk.value), new RegExp(id));
      ctrl.abort();
    });
    const paused = await call(`/runs/${id}/command`, { type: "pause" });
    assert.equal(paused.data.state.status, "paused");
    const tick = paused.data.state.tick;
    await delay(40);
    assert.equal((await call(`/runs/${id}`)).data.state.tick, tick);
    await t.test(
      "frames and decision checkpoints support branching without replacing original",
      async () => {
        const h = await call(`/runs/${id}/history`);
        assert.ok(h.data.length > 2);
        const d = paused.data.state.decisions[0];
        assert.ok(d);
        const b = await call(`/runs/${id}/branch`, {
          decision: d.id,
          action: "wait",
        });
        assert.equal(b.status, 201);
        assert.notEqual(b.data.id, id);
        assert.equal(b.data.state.status, "paused");
        assert.equal(b.data.state.decisions.at(-1).controller, "player");
        assert.equal((await call(`/runs/${id}`)).data.state.tick, tick);
        const unauthorized = await call(`/runs/${id}/branch`, {
          decision: d.id,
          action: "illegal",
        });
        assert.equal(unauthorized.status, 400);
      },
    );
    await t.test(
      "comparison and export contain recorded evidence",
      async () => {
        const c = await call(`/runs/${id}/comparison`);
        assert.equal(c.status, 200);
        assert.ok(c.data.baseline.metrics);
        const e = await call(`/runs/${id}/export`);
        assert.ok(e.data.frames.length > 0);
        assert.ok(!JSON.stringify(e.data).includes("TYPESAFE_API_KEY"));
      },
    );
    await t.test(
      "production page has security headers and static assets",
      async () => {
        const r = await fetch(base);
        assert.equal(r.status, 200);
        assert.match(
          r.headers.get("content-security-policy"),
          /script-src 'self'/,
        );
        assert.match(await r.text(), /Fullstack Brandon/);
      },
    );
  },
);
