> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Verification and release status

## Current revision: 4.0.0 — October 4, 2026

The [real-world simulation model](REAL_WORLD_SIMULATION.md) supersedes earlier
free stock, shared employee vehicles, continuous work, and commission rules.
Historical 3.x records below do not describe current behavior.

- **148/148 unit, engine, scene, provider, persistence, recovery and production
  HTTP/SSE checks passed** in `evidence/realism-unit-tests.txt`. Two additional
  traffic regressions pass in `evidence/realism-traffic-regressions.txt`: short
  roads release departure reservations before acquiring arrival, and boarding
  vans reserve their whole narrow road before mounting.
- **Eight complete careers passed**, seeds 0, 7, 42 and 99 with and without
  disruptions. Every-tick cash, inventory and customer accounting balanced;
  all reached paid office construction, negotiation, contractor construction,
  finite production, expansion, individual paid fleets, wages and retirement.
  Normal careers retired at ticks 71,073–74,266; disrupted runs at
  82,784–84,213. A repeated full seed matched exactly. See
  `evidence/realism-careers.json` and `evidence/realism-audit-log.txt`.
- A fresh **production HTTP/SSE career** independently retired at tick **72,879**,
  after **573 orders**, **510 locally produced cases**, **184 reviews averaging
  4.2 stars**, and **2,500 coins** saved. It completed six paid resort stays.
  The test observed 9,112 streamed frames over 318.8 seconds using a 1 ms test
  cadence and 8× simulation speed; this is not normal gameplay or GPU timing.
  See `evidence/career-server-run.json`.
- One actual Jev request included saved puncture/battery lessons and visitor
  feedback and returned a legal charging action with no fallback. This proves
  memory transmission and a bounded response, not long-term learning gains or
  model retraining. See `evidence/learning-provider.json`.
- **34/34 browser scenarios passed across the complete suite and focused
  corrective reruns.** They cover all seven owned transport models, individually
  purchased employee aircraft, staged repair, desktop/mobile operations, the
  actual learning record, customer notices, replay and workplace hover/pinning
  at all three origins. The pin toggle centers the current workplace. See
  `evidence/realism-browser-acceptance.json` for each result and source report.
  The initial run exposed stale six-vehicle/onboarding fixtures, employee fleet
  assumptions and a missing rocket-skate catalog model; those were corrected
  and the affected cases rerun successfully.
- Production build and **19 editable GLB exports** completed. The final
  punctured-van walking/bicycle fallback and parked-vehicle preservation passed
  together with 25 engine checks; the final eight-career audit retained identical
  results. Asset-container and traffic checks passed separately. Existing saves
  were backed up with the SQLite backup API before the local refresh.
- The local production server at `http://127.0.0.1:3000` reports **4.0.0**, with
  Jev configured. A fresh browser loaded the scene, controls and workplace panel
  without a runtime error. No saved career was reset.

Browser scenarios use an isolated disposable database. Most later views are
actual unattended career states. Employee aircraft views explicitly queue and
pay for each employee's own vehicle through the simulation, then observe an
actual dispatch. The puncture view applies the real command to a moving van.
These staged views are separate from the uninterrupted production-server test.

Labor hours, wages, prices, cultivation and fermentation durations are game
policies, not jurisdiction-specific legal compliance or literal production
lead times. The collision system uses graph routing, reservations, footprints
and swept checks; it is not a general-purpose rigid-body physics engine.
Hardware/phone performance and human playtest acceptance remain unmeasured for
this revision.

## Historical version 3.x verification

**Latest visual and interface update:** see [Miniature scene and visitor clarity](MINIATURE.md) for the persistent tilt-shift lens, environmental weather, forward vehicle motion, matching 3D routes, order feedback, and first-visit introduction. Its evidence files are separate from the historical results below.

**Previous revision: version 3.1.0.** See [World polish and verification](POLISH.md) for the new 68-test suite, refreshed 15-case browser suite, live Jev check and Metal performance measurement. The version 3.0 record below is retained as historical evidence; its measurements and local process status are not current.

Recorded October 3, 2026 for simulation version **3.0.0**. The current scope is a complete autonomous business career. Earlier café missions and 180-tick shift results are historical and do not verify this revision.

## Version 3.0 verification status

**The final unit, engine, scene-geometry, provider-boundary, persistence, and production API suite passed 63/63 tests**: 55 top-level tests plus eight nested API checks, with zero failures. The exact output is `evidence/career-unit-and-api-tests.txt` (local development artifact).

**The final browser suite passed all 15 cases**, with zero failures, skips, or flaky results, in approximately 2.4 minutes. See `evidence/browser-results.json` (local development artifact) and `evidence/career-browser-tests.txt` (local development artifact). The refreshed production app is running locally at [http://127.0.0.1:3000](http://127.0.0.1:3000); its health endpoint confirms version 3.0.0.

## Requirements and authoritative evidence

| Requirement | Evidence and scope |
| --- | --- |
| Begin on foot with zero money and no owned fleet, tools, or employees | Fresh-state assertions in `tests/engine.test.js`; actual fresh production-server career below |
| Buy and use bike → van → sailboat → helicopter → jetpack → teleporter without visitor input | Eight deterministic career evaluations; real production HTTP/SSE career with recorded transport usage |
| Keep growing until retirement | Careers reach all ten Pro gadgets, six owned and used vehicles, three employees, and at least 2,500 saved coins; old order/time limits cannot end a career |
| Renewable supply and correct accounting | Every-tick inventory, money, and customer conservation checks across unattended and disrupted runs, including crew cargo and cargo stored at departure pads |
| Twelve identifiable customers across the islands | Stable customer identities/addresses, real physical delivery tests, island customer statistics in the career evaluation |
| Craft, buy, and upgrade ten working gadgets | Exact cost tests and measured effects for capacity, loading, refrigeration, navigation, rain protection, charging, repair, labeling, backup power, and the flight winch |
| Independent, less efficient employees | Crew physically collect and deliver stock at 68% of founder speed, earn actual order income, and receive a one-coin commission; all three complete deliveries in the production career. Real-career scene regressions now verify visible employee pilots in helicopters, jetpacks, and portals, including shore handoffs. |
| Performance-based customer reviews | Reviews every three fulfilled orders use actual on-time counts and wait times, including reserved Reef Island barrels; aggregate ratings retain lifetime counts while recent review cards are bounded |
| Meaningful visitor guidance and disruptions | Saved unaffordable purchase priorities, prerequisite crafting for requested upgrades, transport preferences, valid speed settings, closures, rushes, shortages, punctures, storms, and power failures are exercised |
| Day/night and changing weather | Deterministic day/dusk/night/dawn and clear/rain/fog/storm state checks; timed storms clear after their bounded override |
| Safe ground, sea, shore, and flight motion | Scene tests compare road routes with actual mesh bounds, helicopter landings at sixteen headings, and actual island shore walks; engine sea routes preserve a 0.95-unit hull margin; sparse observations retain route corners. A real round-trip regression verifies repeated outward/return water coordinates cannot trigger an opposite-leg detour. |
| Full walking and editable asset sources | Arm, leg, and knee articulation checks; all twelve customer models and ten gadget models exist as editable scene geometry; original GLB container/reference checks pass; eighteen original scene/character/vehicle/gadget GLB assets have been exported |
| Private sessions, recovery, and replay | Production API tests cover session isolation, persisted state, replay, branching, and limits; restart/backup recovery and bounded exact/recent versus sampled/older history checks pass |
| Bounded optional AI controller | Provider tests cover credential boundaries, legal-action filtering, uncertainty, timeout, missing credentials, concurrent budget reservations, and invalid configuration; live sample below is separate evidence |
| Play entry, mobile controls, follow cameras, rendered transport, and result-card layering | Final 15-case browser suite passes, including the three employee helicopter/jetpack/teleporter visibility and follow checks; current screenshots were visually inspected |

## Full-career evaluation

`evidence/career-evaluation.json` (local development artifact) records real deterministic engine transitions for seeds **0, 7, 42, and 99**. All runs use the rules controller; they make no model calls and measure simulation ticks rather than browser animation speed.

| Scenario | Retired | Simulation ticks | Orders fulfilled | Coins at retirement | Lifetime reviews |
| --- | ---: | ---: | ---: | ---: | ---: |
| Unattended | 4 / 4 | 6,561–6,968 | 306–311 | 2,515–2,645 | 98–100 |
| Disrupted | 4 / 4 | 7,139–7,461 | 307–314 | 2,502–2,578 | 98–101 |

The disrupted scenario closes the bridge, adds a rush, removes stock, starts a storm, cuts power, and closes the market road at recorded ticks. Every run finishes with all six vehicles, all ten gadgets at Pro, and three employees. Ratings range from 3.0 to 3.2 stars across these samples: delivery delays genuinely affect feedback instead of producing scripted praise. These results demonstrate the tested rules policy's recovery; they do not establish AI superiority or human enjoyment.

## Real production-server career

`evidence/career-server-run.json` (local development artifact) separately records a fresh, zero-cash career running through the actual production HTTP/SSE server, with no gifts or visitor interventions:

- Retirement at **tick 6,583**, with **307 fulfilled orders** and **2,515 coins**.
- All six vehicles used; all ten gadgets reached Pro.
- Alex, Sam, and Morgan completed **67, 58, and 22** deliveries respectively.
- **99 lifetime reviews**, averaging **3.2 stars**.
- **825 streamed frames** and **459 retained replay frames**.
- The test used **8× simulation speed and a 5 ms server cadence**, completing in approximately **16.35 seconds**. This is test acceleration, not a claim about normal gameplay duration or graphics performance.

The server test verifies retirement and persistence independently of browser snapshots. It is stronger evidence of unattended server operation than loading an already completed state into a page.

## Live private AI sample

`evidence/live-ai-decisions.json` (local development artifact) and the sanitized `evidence/career-live-ai-log.txt` (local development artifact) record **eight sequential live provider decisions** in the expanded simulation. The sample includes stock collection, salvage, restoring power, crafting a cooler, customer deliveries, and a reserved Reef Island parcel.

All eight records identify the live controller and have no fallback. Observed request latency was **107–313 ms**, with a median of **159 ms**. The sample ended at tick 194 with three fulfilled orders and did **not** reach retirement. These are limited live integration observations, not a full-career AI benchmark, reliability guarantee, or evidence that the model beats the deterministic controller. Full-career success above is specifically rules-controller evidence.

## Browser evidence and performance limits

The browser suite has two distinct forms of coverage:

1. A real fresh session uses Play, autonomous investment, intervention, persistence, and replay through the UI.
2. Later-stage rendering checks load **actual states computed by an unattended engine career** into the isolated browser-test database. They inspect each transport, crew following (including employee helicopter, jetpack, and teleporter trips), reviews, night rendering, and retirement layering, then resume sampled states through the server. These fixtures are genuine computed simulation states, but they are not a claim that a browser continuously watched the entire career.

Current artifacts include `career-ready.png`, `career-mobile-workshop.png`, `career-inspector.png`, `career-retired.png`, `career-reviews.png`, `career-night.png`, the seven `transport-*.png` images, and the three `crew-*.png` aircraft/portal views in `evidence/`. Current day, night, retirement, and airborne employee screenshots were visually inspected after the final fixes. All fifteen browser scenarios passed against the production build.

Headless Chromium uses **SwiftShader software WebGL** for these checks. Software-rendering and screenshot contention affected earlier bounded test runs; direct HTTP checks remained responsive. The final passing rerun is the acceptance source for browser status. Startup now loads the saved session before lazily importing the 3D scene, so scene construction does not delay the initial session request. The render loop suspends when the canvas is offscreen or the document is hidden; the authoritative server keeps simulating, and rendering resumes at the current pose. The scene's 30 FPS render cap is a ceiling, not measured sustained performance. The refreshed `evidence/local-performance.json` (local development artifact) records the final production build at 1440 × 1000 in software WebGL: first scene frame at 3,951 ms, 368 draw calls, 151,362 triangles, and a 2,094 ms sample with ten rendered scene frames and a mean animation-frame interval of 209.43 ms. This small, constrained software sample is slow; it does not measure GPU frame time or establish hardware-accelerated performance. Hardware-accelerated desktop and physical-phone frame rates remain unmeasured.

## Public launch boundary

This work has **not been publicly deployed**. Local production HTTP operation, persistence, and recovery have been tested; a Docker image/container deployment and a multi-instance/serverless deployment have not been verified.

Before public launch, select the hosting destination and domain, provision a persistent SQLite disk and TLS, configure private provider credentials and budgets, approve the owner's contact/résumé/source links, and verify the deployed stream and restoration procedure. Human playtesting and real-device performance measurement remain separate from automated correctness checks. The complete local automated acceptance suite has passed, and the refreshed production app is available for the owner to play.

A second short measurement with Chromium’s default graphics selection is saved in `evidence/local-browser-default-performance.json` (local development artifact). It also selected SwiftShader, with a 603 ms first scene frame and 24 rendered frames over 2,021 ms. Neither headless measurement establishes hardware-accelerated performance.
