import { mkdirSync, writeFileSync } from "node:fs";
import {
  fresh,
  baseline,
  begin,
  step,
  command,
  metrics,
  VERSION,
  TOOLS,
} from "../shared/engine.js";

const results = [];
for (const scenario of ["unattended", "disrupted"]) {
  for (const seed of [0, 7, 42, 99]) {
    const state = fresh(seed);
    command(state, "start");
    const milestones = [];
    let lastFleet = 0,
      lastCrew = 0,
      lastTools = 0;
    while (state.status === "running" && state.tick < 120000) {
      if (scenario === "disrupted") {
        const disruption = {
          80: "bridge",
          150: "rush",
          225: "shortage",
          400: "storm",
          600: "power",
          800: "traffic",
        }[state.tick];
        if (disruption) command(state, disruption);
      }
      if (!state.brandon.action)
        begin(state, baseline(state), { controller: "rules" });
      step(state);
      const crew = state.crew?.length || 0;
      const tools = Object.values(state.tools).reduce(
        (sum, level) => sum + level,
        0,
      );
      if (
        state.vehicles.length !== lastFleet ||
        crew !== lastCrew ||
        tools !== lastTools
      ) {
        milestones.push({
          tick: state.tick,
          money: state.money,
          fleet: [...state.vehicles],
          crew,
          toolLevels: tools,
        });
        lastFleet = state.vehicles.length;
        lastCrew = crew;
        lastTools = tools;
      }
    }
    results.push({
      scenario,
      seed,
      ...metrics(state),
      status: state.status,
      retirement: state.retirement,
      money: state.money,
      fleet: state.vehicles,
      tools: state.tools,
      crew: state.crew?.map(({ name, deliveries }) => ({ name, deliveries })),
      reviewCount: state.rating?.count ?? state.reviews?.length,
      customerStats: state.customerStats,
      milestones,
    });
    console.log(
      `${scenario} seed ${seed}: ${state.status} at ${state.tick} ticks, ${state.money} coins, ${state.served} orders, ${state.vehicles.length} vehicles, ${Object.keys(state.tools).length}/${Object.keys(TOOLS).length} gadgets`,
    );
  }
}
mkdirSync("evidence", { recursive: true });
writeFileSync(
  "evidence/career-evaluation.json",
  JSON.stringify(
    {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      note: "Deterministic simulated careers using real engine transitions; no model calls or browser animation timing.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((result) => result.status !== "complete"))
  process.exitCode = 1;
