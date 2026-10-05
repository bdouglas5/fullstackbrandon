import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/store.js";
import { fresh, VERSION, inventoryTotal } from "../shared/engine.js";

test("long careers retain recent exact replay, sampled history, and inspectable checkpoints", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-retention-"));
  const { db, save, load } = openStore(join(dir, "state.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  db.prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)").run(
    "guest",
    0,
    Date.now(),
  );
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    "career",
    "guest",
    "{}",
    0,
    0,
    null,
  );
  db.prepare("INSERT INTO checkpoints VALUES(?,?,?)").run(
    "career",
    "expired",
    JSON.stringify({ tick: 10 }),
  );
  db.prepare("INSERT INTO checkpoints VALUES(?,?,?)").run(
    "career",
    "recent",
    JSON.stringify({ tick: 2050 }),
  );
  for (let tick = 0; tick <= 2400; tick++) {
    save("career", {
      tick,
      status: "running",
      decisions: [{ id: "recent", tick: Math.max(0, tick - 350) }],
    });
  }
  const ticks = db
    .prepare("SELECT tick FROM frames WHERE run=? ORDER BY tick")
    .all("career")
    .map((r) => r.tick);
  assert.equal(ticks[0], 0);
  assert.equal(ticks.at(-1), 2400);
  assert.ok(ticks.length < 650, "save history must remain bounded");
  for (let tick = 2040; tick <= 2400; tick++)
    assert.ok(ticks.includes(tick), `missing exact recent tick ${tick}`);
  assert.equal(load("career", "guest").state.tick, 2400);
  assert.equal(load("career", "other"), null);
  assert.deepEqual(
    db
      .prepare("SELECT decision FROM checkpoints")
      .all()
      .map((r) => r.decision),
    ["recent"],
  );
});

test("loading a saved career merges legacy requests without overwriting its stored record", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-orders-"));
  const { db, load } = openStore(join(dir, "state.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = fresh();
  const first = s.customerQueue[0];
  delete first.cases;
  s.customerQueue = [first, { ...first, id: "order-99" }];
  s.queue = [0, 0];
  s.arrivals = 100;
  delete s.orderSchemaVersion;
  const original = JSON.stringify(s);
  db.prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)").run(
    "guest",
    0,
    Date.now(),
  );
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    "career",
    "guest",
    original,
    0,
    0,
    null,
  );
  const restored = load("career", "guest").state;
  assert.equal(restored.customerQueue.length, 1);
  assert.equal(restored.customerQueue[0].cases, 2);
  assert.equal(restored.orderSequence, 100);
  assert.equal(restored.money, s.money);
  assert.equal(restored.harbor, s.harbor);
  assert.equal(
    db.prepare("SELECT state FROM runs WHERE id=?").get("career").state,
    original,
  );
});

test("loading a current-layout career preserves a voyage already in progress", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-voyage-"));
  const { db, load } = openStore(join(dir, "state.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = fresh();
  s.brandon.voyage = { mode: "helicopter", phase: "Flying", progress: 0.4 };
  s.brandon.action = "fly";
  const original = JSON.stringify(s);
  db.prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)").run(
    "guest",
    0,
    Date.now(),
  );
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    "career",
    "guest",
    original,
    0,
    0,
    null,
  );
  assert.deepEqual(load("career", "guest").state, s);
});

test("legacy careers migrate in place with conserved cash, inventory and decisions", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-migration-"));
  const { db, load, save } = openStore(join(dir, "state.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = fresh();
  Object.assign(s, {
    version: "3.1.0",
    money: 319,
    earned: 413,
    spent: 94,
    startingMoney: 0,
  });
  for (const key of [
    "realismVersion",
    "operations",
    "construction",
    "production",
    "schedule",
  ])
    delete s[key];
  s.vehicles = ["bike", "van"];
  s.vehicle = "van";
  s.decisions = [{ id: "old-decision", tick: 60, action: "buy_van" }];
  s.tick = 62;
  const original = JSON.stringify(s);
  db.prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)").run(
    "guest",
    0,
    Date.now(),
  );
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    "career",
    "guest",
    original,
    0,
    0,
    null,
  );
  const migrated = load("career", "guest").state;
  assert.equal(migrated.version, VERSION);
  assert.equal(migrated.money, 319);
  assert.equal(inventoryTotal(migrated), inventoryTotal(s));
  assert.deepEqual(migrated.vehicles, s.vehicles);
  assert.deepEqual(migrated.decisions, s.decisions);
  assert.ok(migrated.operations && migrated.production && migrated.schedule);
  assert.equal(
    migrated.startingMoney + migrated.earned - migrated.spent,
    migrated.money,
  );
  assert.equal(
    db.prepare("SELECT state FROM runs WHERE id=?").get("career").state,
    original,
  );
  save("career", migrated);
  assert.deepEqual(load("career", "guest").state, migrated);
});

test("trophy collection survives new seeds and a database restart, without leaking between sessions", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-collection-"));
  const path = join(dir, "state.sqlite");
  let store = openStore(path);
  t.after(() => {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  for (const session of ["guest", "other"])
    store.db
      .prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)")
      .run(session, 0, Date.now());
  const first = fresh(42);
  first.achievements.unlocked["orders-1"] = { tick: 70 };
  store.db
    .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)")
    .run("first", "guest", JSON.stringify(first), 0, 0, null);
  store.save("first", first);
  const next = fresh(43);
  store.db
    .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)")
    .run("next", "guest", JSON.stringify(next), 1, 1, null);
  store.save("next", next);
  assert.deepEqual(next.achievements.unlocked, {});
  assert.equal(next.achievementCollection.unlocked["orders-1"].seed, 42);
  assert.equal(next.achievementCollection.unlocked["orders-1"].runId, "first");
  store.db.close();
  store = openStore(path);
  assert.deepEqual(
    store.load("next", "guest").state.achievementCollection,
    next.achievementCollection,
  );
  assert.equal(store.load("next", "other"), null);
  const other = fresh(44);
  store.db
    .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)")
    .run("other-run", "other", JSON.stringify(other), 0, 0, null);
  store.save("other-run", other);
  assert.equal(other.achievementCollection, undefined);
  // Import an old saved run that predates the collection table.
  const legacy = fresh(41);
  legacy.achievements.unlocked["orders-10"] = { tick: 140 };
  store.db
    .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)")
    .run("legacy", "guest", JSON.stringify(legacy), 0, 0, null);
  assert.equal(
    store.load("next", "guest").state.achievementCollection.unlocked[
      "orders-10"
    ].seed,
    41,
  );
});

test("a failed replay-frame write rolls back the live state, and saves respect an outer transaction", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brandon-atomic-"));
  const { db, save } = openStore(join(dir, "state.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  db.prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)").run(
    "guest",
    0,
    Date.now(),
  );
  const original = { tick: 0, status: "running", decisions: [] };
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    "career",
    "guest",
    JSON.stringify(original),
    0,
    0,
    null,
  );
  save("career", original);
  db.exec(
    "CREATE TRIGGER reject_frame BEFORE INSERT ON frames BEGIN SELECT RAISE(ABORT, 'frame failed'); END",
  );
  assert.throws(() => save("career", { ...original, tick: 1 }), /frame failed/);
  assert.equal(
    JSON.parse(
      db.prepare("SELECT state FROM runs WHERE id=?").get("career").state,
    ).tick,
    0,
  );
  assert.deepEqual(
    db
      .prepare("SELECT tick FROM frames WHERE run=?")
      .all("career")
      .map((x) => x.tick),
    [0],
  );
  db.exec("DROP TRIGGER reject_frame; BEGIN");
  save("career", { ...original, tick: 2 });
  db.exec("ROLLBACK");
  assert.equal(
    JSON.parse(
      db.prepare("SELECT state FROM runs WHERE id=?").get("career").state,
    ).tick,
    0,
  );
  assert.deepEqual(
    db
      .prepare("SELECT tick FROM frames WHERE run=?")
      .all("career")
      .map((x) => x.tick),
    [0],
  );
});
