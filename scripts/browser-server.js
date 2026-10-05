// This database belongs only to the automated browser suite. Start clean so
// earlier fixture careers cannot consume session limits or distort timings.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
const database = resolve("data/browser-test.sqlite");
if (resolve(process.env.DATABASE_PATH || "") !== database)
  throw new Error("Browser test runner requires its isolated database.");
for (const suffix of ["", "-wal", "-shm"])
  rmSync(database + suffix, { force: true });
await import("../server/index.js");
