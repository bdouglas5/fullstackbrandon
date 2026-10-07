> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# October 4, 2026 expansion — current requested scope

This revision supersedes earlier free-supply, continuous-work, and shared-employee-fleet behavior below. Implemented and checked locally; see VERIFICATION.md for exact evidence:

- Collision-aware physical actors, service bays, staged boarding and six-stage tire repairs; rocket skates after the van.
- Home garage → paid office construction → employee hiring → visit island development company and negotiate a private factory-island deal → contractor island/shop/factory/garden/greenhouse construction → paid finite local production and expansion before retirement.
- Purchased imports/resources arrive by ship, move from port to the active business, and originate all customer packages there.
- Daily employee wages and individual transport purchases; a 10-hour business day, protected lunch/rest breaks, limited night deliveries, overnight recovery and weekends.
- Weekly overtime after 40 hours slows productivity; demand and satisfaction can justify bounded special weekend deliveries, otherwise customers receive Monday promises. Paid resort stays restore wellbeing and add a temporary Monday boost. Home and occasional paid crew BBQs remain visible.
- Employee emotions and feedback, customer reviews tolerant of lawful breaks and reasonable delivery time, and persistent inspectable lessons supplied to Jev for bounded adaptive planning under repeated interference.
- Workplace hover/pinned stats anchored to the active home, office, or factory island.
- Preserve existing saves through migration; verify financial/inventory invariants, complete careers, production HTTP, rendered interaction and mobile behavior. Full simulation policies are documented in REAL_WORLD_SIMULATION.md.

---

# Goal and local delivery — Fullstack Brandon: Pickle Empire

Updated October 3, 2026 from Brandon Douglas’s instructions in this chat. This is the authoritative expanded scope for the existing active local-first / production-ready goal. New instructions below supersede the original café concept and the intermediate pre-owned-van start.

## Objective

Build a functional, exceptionally polished full-stack portfolio game by Brandon Douglas that demonstrates frontend design, interactive 3D, backend engineering, simulation design, AI orchestration, problem solving, persistence, replay, and meaningful evaluation. Deliver and verify a local version first, then prepare it for public web deployment.

Fullstack Brandon autonomously runs and expands a wholesale pickle empire across a huge, explorable archipelago. The default rules controller runs the whole business without visitor input. Visitors can guide or disrupt his plans, and an optional private AI controller makes real, bounded decisions. The experience must be fun and approachable, while its engineering is inspectable and accurately presented to future employers.

## Required experience

1. **Start with Brandon alone.** He begins on foot without a vehicle. He starts with zero money. Earned money unlocks a bike, van, sailboat, helicopter, jetpack, and teleporter in that order. Each has a meaningful purpose, speed/capacity tradeoff, operating constraints, and visible 3D behavior. Visitor gifts remain an explicit experimentation option, not starting equipment.
2. **A huge multi-island world.** Multiple home districts plus distinct offshore islands, business areas, docks, roads, and opportunities to expand. Camera controls support both a readable map and close character/vehicle inspection.
3. **A pickle-specific economy.** Wholesale pickle products and businesses replace generic packages. Business customers exist across the islands, with identifiable owners, differentiated products, handling requirements, demand, and rewards. Purchasable outposts consume delivered stock and earn real simulated revenue.
4. **Ten usable gadgets.** Brandon can craft, buy, and improve ten tools according to the scenario. Recipes, prices, work time, quality upgrades, and effects are implemented in the engine. Gadgets help fulfill specific orders or overcome constraints.
5. **Visitor interference.** Bridge/road closures, demand rushes, stock shortages, storms, power failures, tire problems, priority changes, dispatch requests, and controlled resource/vehicle gifts create genuine replanning decisions. State changes must preserve inventory and money accounting.
6. **Fast, visible AI decisions.** The private server-side provider selects only legal actions. A live dispatch conversation shows actual choices, sources, timing, and consequences. Natural-language preferences stay within the bounded game system. Do not fabricate AI reasoning, latency, or superiority over a baseline.
7. **Provider-neutral public presentation.** Public UI calls it the AI controller and emphasizes Brandon Douglas’s implementation. The particular underlying model is not the product branding. Private credentials remain in the ignored server `.env`; visitors play without seeing or providing a key.
8. **Impressive 3D presentation.** Detailed character, vehicles, customers, businesses, scenery, purposeful animation, lighting, weather, and effects. Preserve editable source and reusable model exports. Keep performance and reduced-motion behavior under review.
9. **Built to be looked inside.** Expand the engineering view into a substantive exhibit: immutable decision context, action gates, alternatives and scores when available, state transitions, routing, economic/inventory ledgers, persistence, event streaming, failure handling, resource budgets, and architectural tradeoffs.
10. **Replay and evaluation.** Rewind recorded history, branch at a decision, preserve and return to the original, and compare controllers under matched starting conditions and disturbances. Label player branches and incomplete benchmarks honestly.
11. **Fix the completion-screen bug.** World labels and character markers must not draw above the result card. Results, next-shift controls, and replay remain usable at desktop and mobile sizes.
12. **Endless autonomous operation and retirement.** Renewable supply and recurring customers keep the business operating day and night. Brandon hires independently moving couriers, completes the full transport and Pro gadget collection, and retires only after earning the visible cash target. Every third fulfilled order from a customer contributes a review based on actual delivery performance.
13. **Full-stack delivery.** Private sessions, authoritative state, validation, persistence, recovery, live streaming, bounded provider cost, production configuration, tests, documentation, a local launch path, and an explicit public-launch checklist.

## Acceptance and evidence

- Exercise the actual local production server in a browser, including narrow viewports and the reported completion-screen layering bug.
- Verify progression from no vehicles, crafting and upgrades, purpose-specific transport, island deliveries, customers and outpost income, and real visitor interruptions.
- Check inventory, money, customer accounting, legal actions, deterministic baseline replay, state persistence, session isolation, restart recovery, and secret boundaries.
- Verify live private AI decisions separately from mock-provider tests. Record observed latency and fallback behavior without presenting a small sample as an AI performance benchmark.
- Show real completed decision records and historical alternatives in the engineering inspector.
- Regenerate editable model exports and update game/architecture/deployment documentation to match the final implementation.
- Leave the refreshed local game available for Brandon to play. Public deployment is a separate step requiring a selected destination, persistent storage, TLS, approved contact/source links, and deployment verification.

## Completed local delivery — October 3, 2026

Implemented in version 3.0.0: a single Play entry; a zero-money, on-foot founder; the complete bike → van → sailboat → helicopter → jetpack → teleporter progression; ten illustrated gadgets with crafting, purchasing, and Pro effects; independent slower employees; twelve named customers distributed across distinct islands; physical deliveries and stocked outposts; day/night weather; saved visitor investment and transport priorities; actual performance-based reviews; and retirement after the complete collection and a visible 2,500-coin fund. The scene includes full walking articulation, ground and sea route preservation, staged takeoff/landing, shore handoffs, follow cameras, and editable original models.

Verified: **63/63 final unit, engine, scene, provider-boundary, persistence, and production API tests** pass (55 top-level tests plus eight nested checks). Eight deterministic full careers, including four disturbed careers, reach retirement with six vehicles, ten Pro gadgets, and three employees. A separate fresh career completed through the real production HTTP/SSE server at tick 6,583, with 307 orders, 2,515 coins, and 99 reviews. Real-career scene regressions also cover visible employee aircraft/jetpack/portal pilots and repeated round-trip water waypoints. Eighteen editable model exports are available. Startup defers 3D construction until session loading finishes, and offscreen rendering suspends without pausing the server simulation. Eight live AI decisions were observed separately; this is a limited integration sample, not a full-career AI result.

**Final browser acceptance: 15/15 cases passed**, with zero failures, skips, or flaky results. This includes the three employee aircraft/portal visibility and follow checks added after the final rendering fixes. Current day, night, retirement, and airborne employee screenshots were visually inspected. The refreshed production app is running at [http://127.0.0.1:3000](http://127.0.0.1:3000), with health version 3.0.0 confirmed. Later-stage browser scenarios use actual engine-computed career snapshots; the independent full HTTP/SSE career supplies continuous unattended server evidence. See [VERIFICATION.md](VERIFICATION.md) and its linked artifacts for exact scope and measurements.

Not claimed: public deployment, full-career AI superiority or reliability, physical-phone performance, a sustained hardware-accelerated frame rate, or human playtest acceptance. Public deployment remains a separate step. The requested local implementation, automated acceptance, documentation, and running-app handoff are complete. The current software-WebGL performance sample is recorded honestly in VERIFICATION.md; it is not a hardware performance guarantee.

## October 3 career-simulation revision

The latest request replaces short timed shifts with an autonomous business career. The first view must explain the experience immediately and offer one Play action. With no visitor input, Brandon earns from deliveries, buys transport in sequence (bike, van, sailboat, helicopter, jetpack, teleporter), obtains and upgrades the full gadget catalog, hires less efficient couriers, and continues working through day/night and changing weather until the workshop is complete and a visible retirement cash target is met.

Customers must live on distinct islands, and delivery performance must determine repeat-customer star reviews. Visitors can prioritize purchases, transport and hires or follow an employee. All ten gadgets need recognizable product pictures and visible world interactions. Walking must articulate the whole character; vehicles and couriers must follow safe routes, avoid buildings/island terrain, and arrive smoothly. The 3D scene, current business results, live decisions and inspectable implementation together form the portfolio showcase.

Verification must cover an entire unattended career, accounting across renewable supplies and employee cargo, actual fulfilled island orders, all transport progression, review scoring, retirement gates, user-directed priorities, day/night rendering, smooth road/sea/air movement, employee follow, mobile controls, saved state and replay. Earlier 180-tick results are historical evidence only and cannot verify this revision.
