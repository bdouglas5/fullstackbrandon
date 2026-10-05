import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const source = process.env.DATABASE_PATH || "data/little-worlds.sqlite";
mkdirSync("data/backups", { recursive: true });
const target = resolve(
  "data/backups",
  `little-worlds-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
const db = new DatabaseSync(source);
await backup(db, target);
db.close();
console.log(`Consistent SQLite backup saved: ${target}`);
