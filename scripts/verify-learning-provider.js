import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fresh, legal } from "../shared/engine.js";
import { recordExperience, learningContext } from "../shared/learning.js";
import { openStore } from "../server/store.js";
import { makeDecider } from "../server/jev.js";
if (!process.env.TYPESAFE_API_KEY)
  throw new Error(
    "The private AI connection is not configured. No live-provider claim can be made.",
  );
const path = mkdtempSync(join(tmpdir(), "brandon-learning-"));
const store = openStore(join(path, "learning.sqlite"));
try {
  const state = fresh(42, "jev");
  state.vehicles = ["bike", "van"];
  state.vehicle = "van";
  state.brandon.vehicle = "van";
  state.tick = 1;
  state.battery = 0;
  state.disruptions = [
    { tick: 0, type: "puncture" },
    { tick: 1, type: "puncture" },
  ];
  state.dispatch = [
    {
      role: "visitor",
      tick: 1,
      text: "Please learn from repeated breakdowns and protect the crew’s rest.",
    },
  ];
  recordExperience(state);
  let submitted;
  const fetcher = async (url, args) => {
    submitted = JSON.parse(args.body);
    return fetch(url, args);
  };
  const result = await makeDecider(store.db, {
    fetcher,
    sessionLimit: 1,
    daily: 8192,
  })(state, "learning-verification");
  const report = {
    checkedAt: new Date().toISOString(),
    controller: result.controller,
    action: result.action,
    legal: legal(state).includes(result.action),
    fallback: result.fallback || null,
    lessonKeys: submitted?.state?.experience?.lessons.map((x) => x.key) || [],
    feedbackIncluded: submitted?.state?.experience?.feedback.length || 0,
    latencyMs: result.latencyMs || null,
    limit:
      "One actual provider decision with synthetic observed incidents. This verifies memory transmission and a legal response, not long-term learning improvement.",
  };
  if (!report.legal) throw new Error("Provider result was not legal.");
  if (
    JSON.stringify(submitted.state.experience) !==
    JSON.stringify(learningContext(state))
  )
    throw new Error("Saved memory did not reach the provider.");
  mkdirSync("evidence", { recursive: true });
  writeFileSync(
    "evidence/learning-provider.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  store.db.close();
  rmSync(path, { recursive: true, force: true });
}
