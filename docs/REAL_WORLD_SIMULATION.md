# Real-world simulation model

This document describes the game's economic and physical rules. Time, prices,
construction, and fermentation are compressed simulation values. The labor policy
is a game policy, not a claim of compliance with any particular jurisdiction.

## A business with one dispatch origin

Brandon starts at home and dispatches from his garage with six prepaid pickle
cases. He pays to construct a dedicated pickle office before hiring employees.
The cash ledger records
12 coins of founder equity and 12 coins of opening inventory expense; available
cash starts at zero. Subsequent pickle cases are purchased in shipment batches.
Shipments spend time at sea, arrive at a port, and must be collected and unloaded
at the shop before customer dispatch. Stock does not regenerate for free.

Customer packages come from the garage, then the office, then the private island
shop as each location opens. Warehouse stock stays accounted for during each move. Port cargo,
courier cargo, stored cargo, production batches, deliveries, spoilage, and losses
belong to the inventory ledger.

## Work, payroll, and fair delivery expectations

Brandon has a ten-hour scheduled day, 08:00–18:00, with lunch and rest breaks. A
limited weekday evening round allows two night deliveries before overnight recovery.
Weekends normally provide recovery. With dissatisfied customers or overdue
orders, Brandon can promise a limited special round of two deliveries. Other
customers receive a simulated Monday delivery notice. Severe exhaustion takes
priority over the extra round. These notices are state within the game; they do
not send messages to anyone outside the simulation.

Brandon returns home and can occasionally host a paid barbecue with his
employees. He can also pay 28 coins for a trip to Sunset Bay Resort while keeping
an inventory and payroll reserve. A reservation alone gives no bonus: he must
physically arrive and complete a two-hour stay. The completed stay restores
energy and gives him up to a 15% speed bonus the following Monday, tapering across
four working hours. It does not boost employees or extend into Tuesday.
Employees have their own daily wage and vehicle ownership. Buying Brandon a new
vehicle does not give every employee a free copy. Unpaid wages remain visible as
arrears. Employee morale and fatigue reflect pay, work, rest, and social time;
their feedback is included in Jev's decision context.

Each courier has a persistent weekly work log. Productive work beyond 40 hours
progressively reduces movement and work speed, with a 60% efficiency floor.
Lunch, rest breaks, idle waiting, and the resort stay do not count as productive
work. The weekly hours reset on Monday and retain a short history.

The labor policy includes a 30-minute lunch and two 15-minute rest breaks. A
courier finishes an active trip safely before beginning a due break; finishing a
trip does not shorten the break. Closed hours and protected breaks do not count
as avoidable delivery lateness. Delivery expectations include travel and queue
time rather than treating every order as immediately due.

## Purchase, build, produce, expand

The private island is acquired through a visit and negotiation with the
development company on Copperport. An agreed deal is followed by the land
purchase and hiring a contractor. Construction progresses through survey,
reclamation, foundations, and building the shop, factory, garden, and greenhouse.

Ingredient kits are purchased and arrive through the port. The production chain
is growing, harvesting, fermentation, packing, and then dispatchable stock.
Factory expansion costs money. Retirement requires an operating, producing,
expanded factory as well as the fleet, team, equipment, and savings milestones.

## Movement and transport

Road actors have physical footprints and reserve space while moving; traffic
must yield instead of crossing through another courier. Vehicle changes have
boarding and disembarking stages. Water and air journeys retain departure,
travel, arrival, and walking phases. Rocket skates are an upgrade after the van.
A puncture stops travel for a visible wheel repair sequence before movement can
resume.

The rendering layer interpolates authoritative simulation positions and keeps
visible actor footprints separate. Reduced motion preserves the meaningful
transport, repair, and construction state while reducing decorative motion.

## Learning from outcomes

Jev's experience log records decision outcomes, evidence, and follow-up outcomes.
Persisted lessons are included in later decision context. This changes the
information available to future decisions; it does not retrain the model. Rules
remain the deterministic fallback when the configured AI connection is absent or
its allowance is exhausted.

## Saved worlds

Compatible earlier careers gain the new schema on load. Cash, stock, existing
vehicles, decisions, and the selected session remain intact. Migration adds
opening equity only as needed to reconcile the preexisting cash ledger. Server
restarts restore running careers as paused. Existing replay history is retained.

## Verification

- `node --test tests/*.test.js` runs engine, ledger, persistence, server, and
  rendering-model checks.
- `node scripts/verify-realism.js` runs uninterrupted and disrupted careers for
  several seeds, checks cash and inventory every tick, verifies business and
  transport milestones before retirement, and compares a complete repeated seed.
- `npx playwright test` runs browser scenarios against an isolated production
  server on port 4080 with a disposable browser-test database.

The browser suite stages actual deterministic engine snapshots to inspect later
career states without waiting through the whole career in real time. The flat
tire fixture applies the real puncture command to a real moving-van snapshot.
Employee aircraft browser fixtures queue and pay for each employee's own craft
through normal simulation actions before recording an actual dispatch.
Screenshots and audit reports are written under `evidence/`. A deterministic
career audit proves simulation behavior; browser screenshots and motion checks
provide separate evidence about presentation. Neither establishes human-play
quality or a general-purpose physics simulation.

## Workplace statistics

Hover the active workplace marker or building to reveal its live stock, cash,
staff, delivery count and schedule. The Workplace stats toggle pins the panel open and centers its workplace in the scene.
The anchor moves from the home garage to the constructed Pickle office, then to
the private factory island; the factory view adds fermenting stock and production totals.
Keyboard focus and touch controls reveal the same information.
