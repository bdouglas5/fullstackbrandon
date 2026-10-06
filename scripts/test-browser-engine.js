import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
// These exercise Node/Express, SQLite or provider integrations from the
// separate server edition. Its complete suite remains available via npm test
// and the manual server workflow. Browser releases test the shared gameplay,
// rendering helpers and their own worker/storage flow.
const serverEdition = new Set([
  "career-server.test.js",
  "business-hours.test.js",
  "live-pacing.test.js",
  "jev.test.js",
  "recovery.test.js",
  "server.test.js",
  "decision-trace.test.js",
  "store.test.js",
]);
const files = readdirSync("tests")
  .filter(
    (name) =>
      name.endsWith(".test.js") &&
      !serverEdition.has(name) &&
      name !== "browser-world.test.js",
  )
  .sort()
  .map((name) => `tests/${name}`);
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
