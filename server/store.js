import { updateAchievements } from "../shared/achievements.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeOrders, normalizeWeather } from "../shared/engine.js";
export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created INTEGER NOT NULL, last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, state TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, parent TEXT);
 CREATE INDEX IF NOT EXISTS run_sessions ON runs(session,updated);
 CREATE TABLE IF NOT EXISTS frames (run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, tick INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(run,tick));
 CREATE TABLE IF NOT EXISTS checkpoints (run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, decision TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(run,decision));
 CREATE TABLE IF NOT EXISTS achievement_collections (session TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, unlocked TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, session TEXT NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL);
 `);
  if (
    !db
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .some((c) => c.name === "current_run")
  )
    db.exec("ALTER TABLE sessions ADD COLUMN current_run TEXT");
  const historyCounts = new Map();
  function collect(session, id, state, includeHistory = false) {
    const row = db
      .prepare("SELECT unlocked FROM achievement_collections WHERE session=?")
      .get(session);
    const unlocked = row ? JSON.parse(row.unlocked) : {};
    const sources = includeHistory
      ? db
          .prepare(
            "SELECT id,state FROM runs WHERE session=? ORDER BY created,id",
          )
          .all(session)
          .map((r) => ({ id: r.id, state: JSON.parse(r.state) }))
      : [];
    sources.push({ id, state });
    let changed = false;
    for (const source of sources) {
      for (const [key, earned] of Object.entries(
        source.state.achievements?.unlocked || {},
      )) {
        if (unlocked[key]) continue;
        unlocked[key] = {
          ...earned,
          runId: source.id,
          seed: source.state.seed,
        };
        changed = true;
      }
    }
    if (changed)
      db.prepare(
        "INSERT OR REPLACE INTO achievement_collections VALUES(?,?)",
      ).run(session, JSON.stringify(unlocked));
    if (Object.keys(unlocked).length)
      state.achievementCollection = { unlocked };
  }
  return {
    db,
    save(id, s) {
      // One commit keeps the live state, replay frame and trophies consistent.
      db.exec("SAVEPOINT simulation_save");
      try {
        const run = db.prepare("SELECT session FROM runs WHERE id=?").get(id);
        if (run) collect(run.session, id, s);
        const serialized = JSON.stringify(s);
        db.prepare("UPDATE runs SET state=?,updated=? WHERE id=?").run(
          serialized,
          Date.now(),
          id,
        );
        db.prepare("INSERT OR REPLACE INTO frames VALUES(?,?,?)").run(
          id,
          s.tick,
          serialized,
        );
        // Keep an exact recent window and progressively coarser older snapshots.
        // A career can run all evening: storing the entire growing state forever
        // would turn replay into the largest cost of operating the game.
        if (s.tick % 60 === 0 || s.status === "complete") {
          const stride = 2 ** Math.ceil(Math.log2(Math.max(64, s.tick / 256)));
          db.prepare(
            "DELETE FROM frames WHERE run=? AND tick<? AND tick % ? != 0",
          ).run(id, Math.max(0, s.tick - 360), stride);
          const oldestDecision = s.decisions?.[0]?.tick;
          if (oldestDecision !== undefined)
            db.prepare(
              "DELETE FROM checkpoints WHERE run=? AND CAST(json_extract(state, '$.tick') AS INTEGER)<?",
            ).run(id, oldestDecision);
        }
        db.exec("RELEASE simulation_save");
      } catch (error) {
        db.exec("ROLLBACK TO simulation_save; RELEASE simulation_save");
        throw error;
      }
    },
    load(id, session) {
      const r = db
        .prepare("SELECT * FROM runs WHERE id=? AND session=?")
        .get(id, session);
      if (!r) return null;
      const state = JSON.parse(r.state);
      // Normalize a copy when reading so legacy careers gain the new business
      // systems without replacing their cash, inventory, decisions or history.
      if (state.brandon && Array.isArray(state.customerQueue))
        normalizeOrders(state);
      normalizeWeather(state);
      updateAchievements(state, { backfill: true });
      const runCount = db
        .prepare("SELECT COUNT(*) AS n FROM runs WHERE session=?")
        .get(session).n;
      collect(session, id, state, historyCounts.get(session) !== runCount);
      historyCounts.set(session, runCount);
      return { ...r, state };
    },
    cleanup() {
      db.prepare("DELETE FROM sessions WHERE last_seen<?").run(
        Date.now() - 7 * 86400000,
      );
      db.prepare("DELETE FROM usage WHERE day<?").run(
        new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      );
    },
  };
}
