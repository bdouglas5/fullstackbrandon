# Verification you can reproduce

[Project](../README.md) · [Development guide](DEVELOPMENT.md) · [Historical records](VERIFICATION_HISTORY.md)

The project contains multiple kinds of evidence. A build, an engine test, a browser scenario, a real provider request, and a public deployment verify different boundaries. This guide keeps those claims separate.

## Publication checks — October 5, 2026

| Publication check | Result |
| --- | --- |
| Procedural model export and production build | Passed through the `npm test` prebuild |
| Focused AI, store, decision-trace, weather, shipment, shift-clock, and navigation checks | **34 passed, zero failed** |
| Deterministic career evaluation | **Eight of eight completed**: four seeds, unattended and disrupted |
| Documentation links | All relative Markdown links in the README and top-level docs resolve to published source or assets |
| Public source review | Private configuration, local databases, backups, dependencies, generated models, and raw captures excluded |
| Node suite excluding the HTTP/SSE career endurance test | **301 passed, one failed**; pacing test passed on standalone rerun |
| Full `npm test` endurance run | Stopped before the long HTTP/SSE career completed; incomplete |
| Browser suite, live provider, and hosted application acceptance | Not rerun for this documentation publication |

The broader run encountered a pacing assertion: 61% of sampled frames advanced one tick, below its expected proportion. A standalone rerun of `tests/live-pacing.test.js` passed. That rerun does not erase the broader failure.

The broader run completed 302 checks in approximately 180 seconds. A separate full `npm test` run remained in its long production HTTP/SSE career and was stopped before completion. No complete-suite pass is claimed. These runtime verification limits are separate from the successful documentation, build, focused checks, and deterministic evaluations.

The eight rules careers completed at 71,313–90,903 simulated ticks, with 2,504–2,535 coins, seven owned vehicles, and all eleven catalog gadgets present. These figures come from this publication run. They describe engine outcomes, not GPU performance or a live AI benchmark.

## Run the checks

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run evaluate
```

`npm test` first exports procedural GLBs and builds the frontend, then executes Node tests serially. It includes a full production HTTP/SSE career that can take several minutes; its timeout budget is intentionally longer than a small unit test.

The evaluator runs eight deterministic careers: four seeds, each unattended and disrupted. Its output is written to local `evidence/career-evaluation.json`. The script uses actual simulation transitions, no provider requests, and no browser frame timing.

## What each check tells you

| Check | Evidence it provides | What it does not establish |
| --- | --- | --- |
| Build and model export | Frontend bundles and procedural assets can be generated | Rendered acceptance or hosted operation |
| Engine tests | Rules, accounting, prerequisites, routing, workweek, hazards, progression | Human enjoyment or real-world business validity |
| Scene and motion tests | Geometry, materials, routes, footprints, animation contracts | Every rendered transition on every device |
| Provider tests | Request contract, invalid responses, timeouts, usage limits, fallback | Live provider quality or superior strategy |
| Store and recovery tests | Persistence, history, collections, restore behavior | Production disk reliability |
| API and SSE tests | Guest ownership, commands, streaming, exports, branching | TLS proxy behavior on an actual host |
| Browser tests | UI flows and rendered states in the configured browser | Physical-phone performance or human playtesting |
| Deterministic career evaluation | Rules careers under matched seeds and interventions | AI-versus-rules superiority |
| Live provider check | A configured real request and its recorded result | Broad reliability, strategic gains, or a latency SLA |
| Public deployment acceptance | Actual hosted routes, persistence, streaming, and sessions | Established by a local build alone |

## Focused source checks

The tests cover distinct promises: finite inventory, paid supplies and crew, equipment ownership, shipment flow, labor and rest, weather overrides, traffic and destinations, decision records, saved experience, provider budgets, guest isolation, replay, and recovery.

Relevant test files are grouped by feature in the [simulation](SIMULATION.md), [AI](AI_AND_REPLAY.md), and [world](WORLD_AND_MOTION.md) guides. For a targeted source change, choose tests that can catch its actual failure mode, then review the visible flow when the feature affects the scene or interface.

## Local artifacts and public evidence

Raw test logs, temporary databases, backups, and development captures remain local and are ignored by Git. Selected reviewed screenshots are published under `docs/images/`. CI uploads its own verification artifacts when workflows run.

[Historical verification](VERIFICATION_HISTORY.md) preserves earlier measurements with revision context. Its earlier pass counts and local process status are not claims about this checkout. Some older documents reference raw local artifacts that are intentionally absent from the public repository.

## Current limits

The deployment design uses one Node process and a persistent SQLite disk. Hosting acceptance, restore rehearsal on the target host, physical-device performance, human playtest results, and live-provider strategic comparisons require separate verification. Rules such as wages, production durations, fatigue, and economics are compressed simulation policies.
