import { decisionTrace } from "../shared/decision-trace.js";
import { simulationSpeed } from "../shared/business-hours.js";
import express from "express";
import compression from "compression";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./store.js";
import { makeDecider } from "./jev.js";
import {
  fresh,
  clone,
  begin,
  decisionReady,
  command,
  step,
  metrics,
  evaluateRun,
  legal,
  normalizeOrders,
  VERSION,
} from "../shared/engine.js";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  prod = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
if (prod && !process.env.PUBLIC_ORIGIN)
  throw new Error("Production requires PUBLIC_ORIGIN.");
for (const name of ["PORT", "TICK_MS", "MAX_ACTIVE_RUNS"]) {
  const value = process.env[name];
  if (value && (!Number.isSafeInteger(Number(value)) || Number(value) < 1))
    throw new Error(`${name} must be a positive integer.`);
}
if (
  process.env.PUBLIC_ORIGIN &&
  new URL(process.env.PUBLIC_ORIGIN).origin !== process.env.PUBLIC_ORIGIN
)
  throw new Error(
    "PUBLIC_ORIGIN must be an origin without a path or trailing slash.",
  );
const store = openStore(
  process.env.DATABASE_PATH || resolve(root, "data/little-worlds.sqlite"),
);
store.cleanup();
const { db } = store,
  decide = makeDecider(db),
  active = new Map(),
  streams = new Map(),
  limits = new Map();
// Restarted servers restore persisted runs in a paused state.
for (const row of db.prepare("SELECT id,state FROM runs").all()) {
  const s = JSON.parse(row.state);
  const previousVersion = s.version;
  if (s.brandon && Array.isArray(s.customerQueue)) normalizeOrders(s);
  if (s.status === "running") {
    s.status = "paused";
    store.save(row.id, s);
  } else if (s.version !== previousVersion) store.save(row.id, s);
}
const app = express();
app.disable("x-powered-by");
app.use(
  compression({
    filter: (req, res) =>
      req.headers.accept?.includes("text/event-stream") ||
      String(res.getHeader("Content-Type") || "").includes("text/event-stream")
        ? false
        : compression.filter(req, res),
  }),
);
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  if (prod)
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
  next();
});
app.use(express.json({ limit: "4kb" }));
app.get("/api/health", (_req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ ok: true, version: VERSION });
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "GET") {
    const origin = req.headers.origin,
      expected = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
    if (
      req.headers["x-little-worlds"] !== "1" ||
      (origin && origin !== expected) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return res
        .status(403)
        .json({ error: "This action must come from the game." });
  }
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  let l = limits.get(ip);
  if (!l || now - l.start > 60000) {
    l = { start: now, n: 0 };
    limits.set(ip, l);
  }
  if (++l.n > 240)
    return res
      .status(429)
      .json({ error: "A little too fast. Try again in a minute." });
  let sid = req.headers.cookie?.match(
    /(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  if (!sid || !db.prepare("SELECT id FROM sessions WHERE id=?").get(sid)) {
    if (
      db
        .prepare("SELECT COUNT(*) AS n FROM sessions WHERE created>?")
        .get(now - 60000).n >= 120
    )
      return res
        .status(429)
        .json({ error: "The island is busy. Please try again shortly." });
    sid = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions(id,created,last_seen) VALUES(?,?,?)").run(
      sid,
      now,
      now,
    );
    res.cookie("lw_session", sid, {
      httpOnly: true,
      sameSite: "strict",
      secure: prod && process.env.PUBLIC_ORIGIN?.startsWith("https:"),
      maxAge: 7 * 86400000,
      path: "/",
    });
  } else db.prepare("UPDATE sessions SET last_seen=? WHERE id=?").run(now, sid);
  req.sid = sid;
  next();
});
function envelope(id, s) {
  return {
    id,
    state: s,
    metrics: s.version === VERSION ? metrics(s) : null,
    jevConfigured: !!process.env.TYPESAFE_API_KEY,
    thinking: !!active.get(id)?.pendingDecision && s.status === "running",
    pendingDecision:
      s.status === "running" ? active.get(id)?.pendingDecision || null : null,
    tickMs: Number(process.env.TICK_MS || 400),
  };
}
function publish(id, s) {
  store.save(id, s);
  for (const res of streams.get(id) || [])
    res.write(`data: ${JSON.stringify(envelope(id, s))}\n\n`);
}
function owned(req, res, next) {
  const r = store.load(req.params.id, req.sid);
  if (!r)
    return res.status(404).json({ error: "Run not found in your session." });
  req.run = r;
  req.s = active.get(r.id)?.state || r.state;
  next();
}
function register(id, s) {
  active.set(id, { state: s, busy: false, lastSeen: Date.now(), revision: 0 });
  return active.get(id);
}
function createRun(s, sid, parent = null) {
  if (db.prepare("SELECT COUNT(*) AS n FROM runs").get().n >= 1000)
    throw new Error(
      "Saved-world capacity reached. Please try again after older sessions expire.",
    );
  if (
    db
      .prepare("SELECT COUNT(*) AS n FROM runs WHERE session=? AND created>?")
      .get(sid, Date.now() - 3600000).n >= 15
  )
    throw new Error(
      "You have reached the hourly mission limit. Existing missions are still available.",
    );
  const own = [...active].filter(([id]) => store.load(id, sid));
  if (active.size - own.length >= Number(process.env.MAX_ACTIVE_RUNS || 30))
    throw new Error("The island is at capacity. Try again shortly.");
  for (const [oldId, a] of own) {
    if (a.state.status === "running") a.state.status = "paused";
    publish(oldId, a.state);
    active.delete(oldId);
  }
  const id = randomUUID();
  db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
    id,
    sid,
    JSON.stringify(s),
    Date.now(),
    Date.now(),
    parent,
  );
  store.save(id, s);
  db.prepare("UPDATE sessions SET current_run=? WHERE id=?").run(id, sid);
  register(id, s);
  return id;
}
app.get("/api/session", (req, res) => {
  const selected = db
    .prepare("SELECT current_run FROM sessions WHERE id=?")
    .get(req.sid)?.current_run;
  const row =
    (selected &&
      db
        .prepare("SELECT id FROM runs WHERE id=? AND session=?")
        .get(selected, req.sid)) ||
    db
      .prepare(
        "SELECT id FROM runs WHERE session=? ORDER BY updated DESC LIMIT 1",
      )
      .get(req.sid);
  res.json({
    run: row
      ? envelope(
          row.id,
          active.get(row.id)?.state || store.load(row.id, req.sid).state,
        )
      : null,
    jevConfigured: !!process.env.TYPESAFE_API_KEY,
  });
});
app.post("/api/runs", (req, res) => {
  try {
    const controller = req.body.controller === "rules" ? "rules" : "jev";
    const seed =
      Number.isSafeInteger(req.body.seed) &&
      req.body.seed >= 0 &&
      req.body.seed < 100000
        ? req.body.seed
        : 42;
    const s = fresh(seed, controller),
      id = createRun(s, req.sid);
    res.status(201).json(envelope(id, s));
  } catch (e) {
    res.status(429).json({ error: e.message });
  }
});
app.post("/api/runs/:id/select", owned, (req, res) => {
  for (const [id, a] of active) {
    if (store.load(id, req.sid)) {
      if (a.state.status === "running") a.state.status = "paused";
      publish(id, a.state);
      active.delete(id);
    }
  }
  if (req.s.status === "running") req.s.status = "paused";
  store.save(req.run.id, req.s);
  db.prepare("UPDATE sessions SET current_run=? WHERE id=?").run(
    req.run.id,
    req.sid,
  );
  res.json(envelope(req.run.id, req.s));
});
app.get("/api/runs/:id", owned, (req, res) =>
  res.json(envelope(req.run.id, req.s)),
);
app.post("/api/runs/:id/command", owned, (req, res) => {
  try {
    if (req.s.version !== VERSION)
      throw new Error(
        "This saved world uses an earlier simulation. Start a new career to use the updated world.",
      );
    let a = active.get(req.run.id);
    if (!a) {
      if (active.size >= Number(process.env.MAX_ACTIVE_RUNS || 30))
        throw new Error("The island is at capacity.");
      a = register(req.run.id, req.s);
    }
    if (typeof req.body.type !== "string") throw new Error("Missing command.");
    const next = clone(a.state);
    command(next, req.body.type, req.body.value);
    a.state = next;
    a.revision++;
    a.lastSeen = Date.now();
    publish(req.run.id, a.state);
    res.json(envelope(req.run.id, a.state));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/runs/:id/events", owned, (req, res) => {
  if ((streams.get(req.run.id)?.size || 0) >= 3)
    return res
      .status(429)
      .json({ error: "Too many open windows for this mission." });
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  if (!streams.has(req.run.id)) streams.set(req.run.id, new Set());
  streams.get(req.run.id).add(res);
  res.write(`data: ${JSON.stringify(envelope(req.run.id, req.s))}\n\n`);
  const heart = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heart);
    streams.get(req.run.id)?.delete(res);
  });
});
app.get("/api/runs/:id/history", owned, (req, res) => {
  res.json(
    db
      .prepare("SELECT tick,state FROM frames WHERE run=? ORDER BY tick")
      .all(req.run.id)
      .map((r) => ({ tick: r.tick, state: JSON.parse(r.state) })),
  );
});
app.get("/api/runs/:id/comparison", owned, (req, res) => {
  if (req.s.version !== VERSION)
    return res.status(400).json({
      error: "This archived world uses an earlier simulation version.",
    });
  const b = evaluateRun(req.s);
  res.json({
    actual: {
      label: req.s.branch
        ? "Player branch"
        : req.s.controller === "jev"
          ? "Jev + recorded fallbacks"
          : "Rules controller",
      metrics: metrics(req.s),
    },
    baseline: { label: b.label, metrics: b.metrics },
    note: "Same seed, starting inventory, objective changes, and timed disruptions. Baseline runs until the same simulation time or its own mission completion. Player branches are interventions; model latency is excluded from simulated time.",
  });
});
app.post("/api/runs/:id/branch", owned, (req, res) => {
  try {
    if (req.s.version !== VERSION)
      throw new Error(
        "Start a new career before branching the updated simulation.",
      );
    const checkpoint = db
      .prepare("SELECT state FROM checkpoints WHERE run=? AND decision=?")
      .get(req.run.id, req.body.decision);
    if (!checkpoint) throw new Error("That decision cannot be branched.");
    const s = normalizeOrders(JSON.parse(checkpoint.state));
    if (!legal(s).includes(req.body.action))
      throw new Error("That action was not legal at this moment.");
    const before = clone(s);
    s.status = "paused";
    const d = begin(s, req.body.action, { controller: "player" });
    s.branch = { parent: req.run.id, decision: req.body.decision };
    const id = createRun(s, req.sid, req.run.id);
    db.prepare("INSERT INTO checkpoints VALUES(?,?,?)").run(
      id,
      d.id,
      JSON.stringify(before),
    );
    if (active.has(req.run.id)) {
      req.s.status = "paused";
      publish(req.run.id, req.s);
      active.delete(req.run.id);
    }
    res.status(201).json(envelope(id, s));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/runs/:id/export", owned, (req, res) => {
  res.set(
    "Content-Disposition",
    'attachment; filename="fullstack-brandon-run.json"',
  );
  res.json({
    version: VERSION,
    ...envelope(req.run.id, req.s),
    frames: db
      .prepare("SELECT state FROM frames WHERE run=? ORDER BY tick")
      .all(req.run.id)
      .map((r) => JSON.parse(r.state)),
  });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Unknown endpoint." }),
);
// Live clock. Simulated time is paced by the wall clock: at N x speed the world
// takes N ticks per TICK_MS and every tick is published as its own frame, so the
// renderer always sees evenly spaced one-tick updates (never an N-tick burst).
// A credit accumulator keeps the pace exact when the event loop runs late.
const TICK_MS = Number(process.env.TICK_MS || 400);
const PUMP_MS = Math.max(1, Math.min(50, Math.floor(TICK_MS / 8)));
const MAX_CREDIT = 8;
const STREAM_EVERY_STEP = 4;
const interval = setInterval(async () => {
  const now = Date.now();
  for (const [id, a] of active) {
    if (streams.get(id)?.size) a.lastSeen = now;
    if (now - a.lastSeen > 30000) {
      if (a.state.status === "running") {
        a.state.status = "paused";
        publish(id, a.state);
      }
      active.delete(id);
      continue;
    }
    if (a.state.status !== "running") {
      a.pumpAt = null;
      a.credit = 0;
      continue;
    }
    if (a.busy) continue;
    // Elapsed wall time becomes simulated ticks at the selected pace. The
    // fractional remainder carries over, so 1x, 2x, 4x and 8x never drift.
    const elapsed = a.pumpAt == null ? 0 : now - a.pumpAt;
    a.pumpAt = now;
    a.credit = Math.min(
      MAX_CREDIT + simulationSpeed(a.state),
      (a.credit ?? 1) + (elapsed / TICK_MS) * simulationSpeed(a.state),
    );
    if (a.credit < 1) continue;
    a.busy = true;
    const revision = a.revision;
    try {
      // A handful of ticks owed (a late timer) are each streamed, so the client
      // can play every step; a large batch is fast-forward and sends the newest.
      const owed = Math.floor(a.credit);
      const every = owed <= STREAM_EVERY_STEP;
      let published = false;
      while (a.credit >= 1) {
        if (
          a.state.status !== "running" ||
          a.revision !== revision ||
          active.get(id) !== a
        )
          break;
        if (decisionReady(a.state)) {
          const row = db.prepare("SELECT session FROM runs WHERE id=?").get(id);
          const before = clone(a.state);
          a.pendingDecision = decisionTrace(before);
          publish(id, a.state);
          const choice = await decide(before, row.session);
          // Time spent thinking is not owed back as a burst of movement.
          a.pumpAt = Date.now();
          a.credit = Math.min(a.credit, 1);
          if (
            a.revision !== revision ||
            a.state.status !== "running" ||
            active.get(id) !== a
          )
            break;
          const trace = a.pendingDecision;
          a.pendingDecision = null;
          const d = begin(a.state, choice.action, { ...choice, trace });
          if (d)
            db.prepare("INSERT OR REPLACE INTO checkpoints VALUES(?,?,?)").run(
              id,
              d.id,
              JSON.stringify(before),
            );
          publish(id, a.state);
        }
        step(a.state);
        a.credit -= 1;
        published = false;
        // Every frame is saved so replay keeps its exact intermediate history.
        if (a.credit >= 1 && !every) store.save(id, a.state);
        else {
          publish(id, a.state);
          published = true;
        }
      }
      if (!published && a.state.status === "running") publish(id, a.state);
    } catch (e) {
      console.error("Simulation failed:", e.message);
      a.state.status = "paused";
      publish(id, a.state);
    } finally {
      a.pendingDecision = null;
      a.busy = false;
    }
  }
}, PUMP_MS);
const cleanup = setInterval(() => {
  store.cleanup();
  for (const [ip, l] of limits)
    if (Date.now() - l.start > 60000) limits.delete(ip);
  for (const [id, set] of streams) if (!set.size) streams.delete(id);
}, 60000);
if (prod) {
  app.use(
    express.static(resolve(root, "dist"), {
      maxAge: "1h",
      setHeaders: (res, path) => {
        if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
        else if (path.includes("/assets/"))
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.use((_req, res) => res.status(404).type("text").send("Not found"));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({
    error:
      err.status === 413
        ? "Request is too large."
        : "The request could not be completed.",
  });
});
const server = app.listen(port, host, () =>
  console.log(
    `Fullstack Brandon ready at http://${host}:${port} (${prod ? "production" : "development"}; Jev ${process.env.TYPESAFE_API_KEY ? "configured" : "not configured"})`,
  ),
);
function shutdown() {
  clearInterval(interval);
  clearInterval(cleanup);
  for (const [id, a] of active) {
    if (a.state.status === "running") a.state.status = "paused";
    store.save(id, a.state);
  }
  for (const set of streams.values()) for (const res of set) res.end();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
