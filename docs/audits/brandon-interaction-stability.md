# Brandon decision and interaction stability audit

This audit treats a decision as a committed workflow with physical entry, work, exit and recovery phases. Jev chooses the next task at a safe boundary; the simulation owns the interaction timing and inventory.

Jev chooses the legal objective; the engine executes its ordered physical phases. A delivery is approach → park → dismount → enter → handoff → exit → retrieve → board → resume. An equipped spill kit inserts dismount → clean → remount into the current trip. Without a kit, the spin/recovery holds that trip in place. The renderer follows these saved phases; it does not consume stock or decide that work is complete. Decisions that have no physical interaction can still resolve directly.

## Changes

| Finding | Implemented behavior |
| --- | --- |
| Flying pose lifted feet out of the boots | Skating uses planted feet through travel, turns and stops, while upper-body/cargo animation continues. A frame-by-frame foot-position regression covers this constraint. |
| Rocket skates ignored oil | All road modes spin out without a spill kit. Equipped transport, cargo and destination persist through recovery. |
| Remounting occurred after an arbitrary distance | Brandon walks back to the recorded parked equipment, boards there, and resumes the road route. Equipment stored at another node must be retrieved physically. |
| New decisions could begin before a building exit completed | Shared readiness checks block decisions during entry/exit, boarding, retrieval, voyages, encounters and spin recovery. The server and Jev adapter share this gate. |
| Backpack disappeared during boarding | Transition animation receives the actual carried stock, including inbound supplies and resources. |
| Traffic recovery could move a boarding actor | Boarding and dismounting hold position and finish before traffic recovery runs. |
| Travel prediction continued during a spin | Spin recovery has no speculative forward movement between snapshots. |
| Visitor disruptions cleared an action in the middle of its interaction | Replanning waits until the current road edge or interaction finishes. A punctured van finishes its edge slowly; subsequent repair/fallback decisions occur at the safe boundary. Legacy orphaned road movements can finish their current edge. |
| Task effects ran during approach/boarding | Work animations and task effects activate during actual work, after entry. Cleaning tools are packed away for remounting. |
| Boarding poses jumped between tick updates | Bounded interpolation advances the pose between authoritative snapshots and freezes when paused or reduced motion is selected. |
| Pedestrians could deadlock on the way home | Walking couriers use swept collision checks at crossings; an intermediate route cursor can catch up after a safe detour. Arrival still requires a clear service bay. |
| Charging canopy overlapped a loaded van route | The charging station is set farther back from the road; actual scenery mesh clearance is tested. |
| Live state and replay frames were saved in separate commits | Saves now use one atomic savepoint and one serialization. A forced frame-write failure rolls back the live state; an outer transaction can still roll back the entire save. |
| Fresh state changed when loaded | Fresh weather/audio settings include their persisted defaults. |

## Checked sequences

- Walk, bike, van and rocket skates × no kit, standard kit, Pro kit. Interruptions preserve action, order, work, route progress and cargo; repeated serialization during the encounter preserves the workflow.
- Park → dismount → walk into the actual customer building → deliver two cases from three → exit → retrieve the same equipment → board → deliver the remaining case.
- Boarding/dismounting retain visible backpack cargo.
- New Jev decisions cannot overwrite active interactions or spend provider calls while locked.
- Punctures wait for an interaction boundary before reassessment; stationary spin recovery does not drift between snapshots.
- Boarding progress is bounded, continuous and stationary when paused.

Live Jev returned three accepted provider decisions (pickup shipment, unload shipment, rest). Requests during those committed tasks returned the interaction lock without another provider call. This is a bounded provider integration check, not a claim that the model has explored every possible decision.

Evidence is in `evidence/interaction-stability/`, including the provider results, focused/animation tests, regression logs and browser checks. Browser fixtures use separate databases and preserve the user's active save.

The final non-endurance regression run passes all 294 checks (`final-regressions.log`). All four browser scenarios pass; the two rocket scenarios were repeated after the planted-foot pose change, and their latest captures were visually inspected. Four deterministic unattended career seeds also reach retirement. The production HTTP/SSE endurance career passes too, including retirement, conserved stock/money, employee deliveries, completed construction/production, persisted final state and bounded replay history (`server-career-final.log`, `../career-server-run.json`). Together these final Node runs pass 295 checks. The final build succeeds (`final-build.log`).

Earlier production-server endurance attempts kept advancing but exceeded the old ten-minute wall-clock limit. The final run took about twelve minutes at the accelerated 1ms test cadence with full decision traces and per-tick disk persistence. It uses a fifteen-minute bound plus a check for stopped tick progress. Atomic rollback/restart checks are in `persistence-verified.log`. Earlier failure logs are retained as audit history. Browser rendering does not establish performance on every device, and the three live Jev calls do not constitute an unattended provider-driven career.
