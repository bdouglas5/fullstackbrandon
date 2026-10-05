import test from "node:test";
import { waitForServer, availablePort } from "./fixtures/server-ready.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { VERSION, inventoryTotal } from "../shared/engine.js";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test("server restart restores a running world as paused without losing the session", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-recovery-")),
    path = join(dir, "game.sqlite"),
    port = await availablePort(),
    base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    let output = "";
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        PUBLIC_ORIGIN: base,
        DATABASE_PATH: path,
        TICK_MS: "20",
        TYPESAFE_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    await waitForServer(child, base, () => output, "Recovery server");
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exit = new Promise((r) => child.once("exit", r));
    child.kill("SIGTERM");
    await exit;
  }
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  await start();
  const session = await fetch(base + "/api/session"),
    cookie = session.headers.get("set-cookie").split(";")[0];
  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-Little-Worlds": "1",
    Origin: base,
  };
  const run = await fetch(base + "/api/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({ controller: "rules" }),
  }).then((r) => r.json());
  await fetch(base + `/api/runs/${run.id}/command`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "start" }),
  });
  await delay(120);
  await stop();
  const disk = new DatabaseSync(path);
  const saved = JSON.parse(
    disk.prepare("SELECT state FROM runs WHERE id=?").get(run.id).state,
  );
  assert.equal(saved.status, "paused");
  assert.ok(saved.tick > 0);
  await backup(disk, join(dir, "backup.sqlite"));
  disk.close();
  const copied = new DatabaseSync(join(dir, "backup.sqlite"));
  assert.equal(
    copied.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(
    JSON.parse(
      copied.prepare("SELECT state FROM runs WHERE id=?").get(run.id).state,
    ).tick,
    saved.tick,
  );
  copied.close();
  await start();
  const restored = await fetch(base + "/api/session", { headers }).then((r) =>
    r.json(),
  );
  assert.equal(restored.run.id, run.id);
  assert.deepEqual(restored.run.state, saved);
  await stop();
  const legacy = structuredClone(saved);
  legacy.version = "3.1.0";
  for (const field of [
    "realismVersion",
    "operations",
    "construction",
    "production",
    "schedule",
  ])
    delete legacy[field];
  const legacyDb = new DatabaseSync(path);
  legacyDb
    .prepare("UPDATE runs SET state=? WHERE id=?")
    .run(JSON.stringify(legacy), run.id);
  legacyDb.close();
  await start();
  const migrated = await fetch(base + "/api/session", { headers }).then((r) =>
    r.json(),
  );
  assert.equal(migrated.run.id, run.id);
  assert.equal(migrated.run.state.version, VERSION);
  assert.equal(migrated.run.state.money, legacy.money);
  assert.equal(migrated.run.state.tick, legacy.tick);
  assert.equal(inventoryTotal(migrated.run.state), inventoryTotal(legacy));
  assert.deepEqual(migrated.run.state.decisions, legacy.decisions);
  const resumed = await fetch(base + `/api/runs/${run.id}/command`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "start" }),
  });
  assert.equal(
    resumed.status,
    200,
    "migrated careers resume without creating a new run",
  );
});
test("exported original 3D assets have valid GLB containers and mesh references", () => {
  for (const name of ["island", "fullstack-brandon", "brandon-rocket_skates"]) {
    const b = readFileSync(`public/models/${name}.glb`);
    assert.equal(b.readUInt32LE(0), 0x46546c67);
    assert.equal(b.readUInt32LE(4), 2);
    assert.equal(b.readUInt32LE(8), b.length);
    const length = b.readUInt32LE(12);
    const gltf = JSON.parse(b.subarray(20, 20 + length).toString());
    assert.equal(gltf.asset.version, "2.0");
    assert.ok(gltf.meshes.length > 10);
    assert.ok(gltf.nodes.length > 10);
    for (const node of gltf.nodes)
      if (node.mesh !== undefined) assert.ok(gltf.meshes[node.mesh]);
  }
});

test("exported catalog couriers include the merged face and clothing details", () => {
  for (const name of [
    "fullstack-brandon",
    "brandon-bike",
    "brandon-van",
    "brandon-rocket_skates",
    "brandon-helicopter",
    "brandon-jetpack",
    "brandon-teleporter",
  ]) {
    const bytes = readFileSync(`public/models/${name}.glb`);
    const gltf = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    const names = new Set(gltf.nodes.map((node) => node.name));
    for (const detail of [
      "Brow rig",
      "Mouth rig",
      "Courier patch",
      "Pickle charm",
    ])
      assert.ok(
        names.has(detail),
        `${name} is missing ${detail}; regenerate the catalog models`,
      );
  }
});
