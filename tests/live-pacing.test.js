import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitForServer, availablePort } from "./fixtures/server-ready.js";

// At 8x the server must deliver every tick as its own, evenly spaced frame. A
// burst of eight ticks per publish is what made Brandon stop and jump.
test(
  "fast-forward streams one tick per frame, paced by the wall clock",
  { timeout: 60000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "brandon-pace-"));
    const port = await availablePort(),
      base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        PUBLIC_ORIGIN: base,
        DATABASE_PATH: join(dir, "pace.sqlite"),
        TICK_MS: "80",
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
        const exit = new Promise((r) => child.once("exit", r));
        child.kill("SIGTERM");
        await exit;
      }
      rmSync(dir, { recursive: true, force: true });
    });
    await waitForServer(child, base, () => output, "Server");
    const cookie = (await fetch(base + "/api/session")).headers
      .get("set-cookie")
      .split(";")[0];
    const call = async (path, body) => {
      const r = await fetch(base + "/api" + path, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Little-Worlds": "1",
          Origin: base,
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      assert.ok(r.ok, JSON.stringify(data));
      return data;
    };
    const run = await call("/runs", { controller: "rules", seed: 42 });
    await call(`/runs/${run.id}/command`, { type: "speed", value: 8 });
    const stream = await fetch(base + `/api/runs/${run.id}/events`, {
      headers: { Cookie: cookie },
      signal: ctrl.signal,
    });
    const reader = stream.body.getReader(),
      decoder = new TextDecoder();
    await call(`/runs/${run.id}/command`, { type: "start" });
    const frames = [];
    let pending = "";
    const began = Date.now();
    while (Date.now() - began < 3000) {
      const { done, value } = await reader.read();
      assert.ok(!done);
      pending += decoder.decode(value, { stream: true });
      let b;
      while ((b = pending.indexOf("\n\n")) >= 0) {
        const block = pending.slice(0, b);
        pending = pending.slice(b + 2);
        if (!block.startsWith("data: ")) continue;
        const state = JSON.parse(block.slice(6)).state;
        if (state.status === "running")
          frames.push({ at: Date.now(), tick: state.tick });
      }
    }
    ctrl.abort();
    assert.ok(frames.length > 40, `only ${frames.length} frames in 3 s`);
    const steps = frames.slice(1).map((f, i) => f.tick - frames[i].tick);
    assert.ok(
      steps.every((n) => n >= 0),
      "ticks never run backwards",
    );
    const single = steps.filter((n) => n === 1).length / steps.length;
    assert.ok(
      single > 0.85,
      `only ${Math.round(single * 100)}% of frames advanced one tick`,
    );
    // 8 ticks per 80 ms: about 100 ticks per second, not bursts every 80 ms.
    const rate =
      (frames.at(-1).tick - frames[0].tick) /
      ((frames.at(-1).at - frames[0].at) / 1000);
    assert.ok(
      rate > 50 && rate < 200,
      `unexpected pace ${rate.toFixed(0)} ticks/s`,
    );
  },
);
