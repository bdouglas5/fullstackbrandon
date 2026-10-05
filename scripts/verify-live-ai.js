import { writeFileSync } from "node:fs";
import { openStore } from "../server/store.js";
import { makeDecider } from "../server/jev.js";
import { fresh, begin, step, command, metrics } from "../shared/engine.js";
if (!process.env.TYPESAFE_API_KEY)
  throw new Error("Configure the private API key first.");
const store = openStore(
  process.env.DATABASE_PATH || "./data/little-worlds.sqlite",
);
const decide = makeDecider(store.db),
  s = fresh(42, "jev");
s.status = "running";
const records = [];
for (let i = 0; i < 8; i++) {
  if (i === 2) command(s, "power");
  if (i === 4) command(s, "gift", "helicopter");
  if (i === 6) command(s, "chat", "reef pickle order");
  const d = await decide(s, "local-ai-verification");
  begin(s, d.action, d);
  records.push({
    tick: s.tick,
    action: d.action,
    controller: d.controller,
    latency: d.latency || 0,
    confidence: d.confidence ?? null,
    tokens: d.tokens || 0,
    fallback: d.fallback || null,
  });
  let guard = 0;
  while (s.brandon.action && s.status === "running" && guard++ < 180) step(s);
  if (s.status === "complete") break;
}
const result = {
  checkedAt: new Date().toISOString(),
  scope:
    "Eight sequential live provider decisions in the expanded pickle simulation; not a full-game AI benchmark.",
  records,
  metrics: metrics(s),
};
writeFileSync(
  "evidence/live-ai-decisions.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
store.db.close();
