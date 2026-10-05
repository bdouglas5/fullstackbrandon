> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Fullstack Brandon — Game Concept and Engineering Brief

Documented: October 3, 2026
Project: FullStackBrandon
Status: Original planning brief; implementation now exists. See [verification and release status](VERIFICATION.md) for current evidence.
Working presentation: Fullstack Brandon

## 1. Purpose

Fullstack Brandon is now centered on **Fullstack Brandon**, a little character who solves problems in a beautifully rendered miniature 3D island. It is a fun browser game backed by a working simulation. Jev helps Brandon choose among valid actions; visitors set challenges, change priorities, introduce disruptions, and intervene to explore different solutions.

Fullstack Brandon is the protagonist and the face of the portfolio. The initial focus is one expressive problem-solver rather than a fleet of equally prominent autonomous agents. The workshop, café, roads, bridge, and harbor give his actions an understandable setting. Delivery robots may become supporting characters later.

The product has two equally important goals:

1. Give visitors a fun, approachable game with a recognizable character, clear goals, meaningful choices, and satisfying outcomes.
2. Give prospective employers credible evidence of Brandon's design, programming, problem-solving, implementation, and full-stack engineering skills.

The experience must make the time, care, and judgment behind the work visible through the quality of its interactions and through inspectable implementation evidence. Visual polish, backend behavior, simulation rules, and AI integration are all part of the product.

This is a real working software demonstration of a simulated operation. Its inventory, movement, tasks, decisions, and consequences genuinely execute. It does not initially control physical robots, real businesses, or actual supply chains. Its operational assumptions and simplified rules should be explicit.

## 2. Agreed direction

The following comes from the selected concept and the user's stated intent:

- Fullstack Brandon is a little character and the central problem-solver in a fun game.
- A miniature 3D island contains a workshop, a café, roads, a bridge, and a harbor; delivery robots can be supporting characters.
- Visitors can close a bridge, trigger a supply shortage, add a rush of customers, and change priorities from fastest service to least waste.
- Fullstack Brandon uses Jev to make simulation decisions in response to changing conditions. Visitors can inspect his available actions, Jev's selection, and resulting outcomes.
- Jev chooses among valid actions using a compact description of the situation and priorities.
- Application code handles movement, inventory, timing, route calculations, and other exact rules.
- Visitors can rewind to a decision and explore an alternative choice.
- Results can be compared against a simple rules-based controller under matched starting conditions.
- Jev's successes and failures are both measured and represented honestly.
- Visitors can use a free demo funded by the owner's server-side API key; the key is never distributed to browsers.
- Employers should be able to understand the frontend, backend, simulation, and AI work behind the experience.

The character-led game direction supersedes the earlier emphasis on a general-purpose operations dashboard. The architecture, mission designs, interaction details, and acceptance criteria below are working proposals. They provide a starting point for implementation without claiming that a stack, character design, or every feature has already been approved or built.

## 3. The signature experience

Fullstack Brandon is already busy when the visitor arrives: carrying a parcel, checking a task, or heading toward the café. A small mission card introduces a concrete problem. The world communicates what needs attention through visible customers, cargo, destination markers, and expressive character reactions.

The visitor closes the bridge while Brandon is trying to replenish the café. He notices the interruption, pauses briefly, and chooses his next move. Depending on the remaining routes and resources, he may take the longer route, collect repair materials, switch to another useful task, or wait. A thought bubble or action cue makes his selected intention readable before the animation carries it out.

The visitor selects Brandon and can inspect:

- What he knows about the current situation.
- Which actions are currently legal.
- Which action the controller selected.
- Whether Jev or a fallback controller made the choice.
- The returned decision probabilities, where available.
- What happened after the action executed.

They rewind to that decision, choose a different valid action, and compare the resulting branch with the original.

The mission ends with a short result showing what Brandon accomplished, which tradeoffs mattered, and an invitation to replay or try a different choice. The system must permit an unfavorable outcome: a closure cannot produce a successful reroute if no alternative path exists. Setbacks should feel understandable and recoverable.

### Proposed player role and game loop

The visitor is Brandon's collaborator and occasional source of chaos. The first version uses indirect control: the player sets the challenge or priority, and Brandon chooses and executes actions. Direct movement controls are not required for the initial slice.

1. Pick a short mission with an understandable goal.
2. Watch Brandon assess the situation and start working.
3. Change a condition, adjust a priority, or offer a specific valid action.
4. Watch the consequences unfold through movement, character reactions, and world changes.
5. Complete the mission or encounter a recoverable setback.
6. Replay, branch at a decision, or compare with the baseline controller.

Pause, reset, and a clear next interaction should keep the visitor involved. Validate through playtesting that the experience gives players meaningful things to do and does not become passive watching.

### Proposed first mission: Save the Café

The café needs supplies for an incoming customer rush. Brandon starts with limited carrying capacity and access to supplies at the harbor. The visitor can close the bridge and choose whether to emphasize quick service or reduced waste.

The first mission should support a small set of concrete actions: collect supplies, deliver supplies, take an available route, and wait. Bridge repair is a later extension requiring workshop materials and explicit repair rules.

Success means meeting a stated service target under the selected scenario rules. Exact quantities, timing, scoring, and session length should be tuned through playtesting, not treated as approved requirements in this document. A proposed target is a satisfying two-to-five-minute first session.

### Character and personality

- Make Brandon recognizable at the scale of the world, with readable gestures and a consistent silhouette.
- Give him warm, capable, slightly playful behavior: acknowledging a problem, checking his next task, celebrating a delivery, and reacting to a setback.
- Use authored quips, icons, and action labels selected from known game events. Jev does not generate dialogue.
- Keep displayed intention grounded in the action actually selected. A thought bubble is interface storytelling, not a transcript of model reasoning.
- Make competence visible through decisions and outcomes while allowing mistakes and retries.
- Decide the final character appearance in a dedicated art pass; a literal likeness of Brandon has not been specified.

## 4. Useful problem being demonstrated

The simulation explores how a small operation responds to disrupted transport, limited supplies, fluctuating demand, and competing objectives.

Questions visitors should be able to investigate include:

- Does prioritizing the longest-waiting customer improve service across the whole run?
- When should Brandon replenish stock rather than fulfill a pending delivery?
- How does reducing waste affect waiting time or unfulfilled demand?
- How much does an alternate route improve recovery after a closure?
- Does an AI-selected action improve on a transparent rules-based policy in this scenario?

Findings apply to the stated simulation assumptions. The site must not imply that a successful demonstration validates real-world logistics performance.

## 5. Two paths through one product

### Visitor and recruiter path

Target experience, subject to usability testing:

- Within roughly 30 seconds, meet Fullstack Brandon and understand the first mission and available player action.
- Within roughly two minutes, influence his plan, see a meaningful consequence, and discover that his decisions are inspectable.
- Reach Brandon's introduction, résumé, contact information, and project case study directly.

The main game should be available without account creation. A guided mission and a reset action should make exploration approachable. Technical panels and résumé links remain easy to reach, but playing should not require reading an architecture explanation.

### Engineering and hiring-manager path

An optional engineering view should connect what is happening on screen to the real implementation:

- **Frontend:** Component design, scene organization, animation choices, accessibility, loading behavior, and measured rendering performance.
- **Backend:** Session ownership, state persistence, event delivery, request validation, job handling, and operational visibility.
- **Simulation:** Resource conservation, routing rules, valid actions, clocks, random seeds, and state transitions.
- **AI:** Request construction, available choices, returned results, latency, recorded usage, and fallback behavior.
- **Evaluation:** Matched runs, metric definitions, failures, regressions, and known limitations.

This view should be optional so implementation detail does not obstruct the primary product experience.

## 6. Simulation and AI responsibilities

### Deterministic application code owns

- Simulation time and seeded external events.
- Transport graph, pathfinding, travel duration, and bridge state.
- Inventory, carrying capacity, consumption, spoilage, and customer queues.
- Action eligibility, resource reservations, and state mutation.
- Numeric comparisons, objective weights, scoring, and metrics.
- Completion, interruption, and cancellation rules for actions.

### Jev owns a bounded judgment

At a meaningful decision point for Fullstack Brandon, the server supplies a compact state summary and an explicit set of eligible choices. Jev selects an action; the server validates that it remains legal before applying it. The server is authoritative even if a visitor proposes an action directly.

Candidate actions might include delivering an available order, collecting supplies, performing a permitted workshop task, or waiting. Each action needs preconditions, a duration or completion condition, effects, and interruption rules. Keep the initial vocabulary small until its behavior is understood and tested.

AI calls happen at decision points, not once per rendered frame. Animation continues independently of model latency.

Jev is not responsible for generating 3D assets, writing dialogue, performing arithmetic, or finding geometric routes. Human-readable explanations are assembled from recorded state, rules, and model outputs. They must not be presented as access to the model's internal reasoning.

Model confidence is a signal to evaluate, not proof of correctness. Timeouts, rejected responses, stale decisions, and low-confidence results need explicit behavior. A deterministic fallback keeps the demonstration usable and is visibly identified when it acts.

## 7. Proposed system structure

Specific frameworks and hosting providers remain undecided. The initial design should stay as small as practical while preserving clear responsibilities.

| Component | Responsibility |
| --- | --- |
| Browser application | 3D world, character animation, mission and intervention controls, accessible alternative views, decision inspector, replay interface, portfolio content |
| Application API | Session access, validated disruption commands, run creation, persistence, usage limits, Jev access |
| Simulation engine | Authoritative state transitions, legal actions, routing, seeded events, metrics |
| Decision controller | Rules-based policy and Jev integration behind the same action contract |
| Background execution | Run advancement and model work where hosting or latency makes asynchronous execution appropriate |
| Persistence | Run metadata, snapshots, event history, decisions, branches, and evaluation summaries |
| Event delivery | Send ordered state updates to the browser and support recovery after disconnection |

A modular application with a worker if needed is a reasonable starting point. Independent services should be introduced only for a demonstrated requirement.

Core records should include Scenario, Run, SimulationEvent, StateSnapshot, AgentDecision, RunBranch, and EvaluationResult. Runs need scenario version, engine version, seed, controller configuration, and model version where applicable.

## 8. Replay, branching, and fair comparison

### Replay

Persist ordered events and sufficient snapshots to reconstruct state. Replaying an existing run uses the recorded decisions rather than making new AI requests. The replay should reproduce the recorded simulation, subject to a documented engine/version compatibility policy.

### Alternative decisions

Branch from the state immediately before a selected decision. Validate the visitor's replacement action, retain the original run, and record the branch relationship. Later decisions can differ as the new state develops; identify the selected continuation controller.

### Controller comparison

The Jev controller and rules-based baseline receive equivalent observations and obey the same legal actions. Use the same initial world, resource quantities, objective definition, and external disruption schedule.

Keep external randomness independent from controller-specific random draws so matched runs receive comparable conditions. Evaluate multiple seeds and scenarios. Record wall-clock latency and costs separately from simulation outcomes, and state how decision latency affects simulated time.

Proposed metrics:

- Orders completed and demand left unserved.
- Customer waiting time, with unfinished orders explicitly accounted for.
- Stockouts and resource waste.
- Brandon's travel and idle time.
- Recovery time after a disruption, with a stated recovery criterion.
- AI calls, billed token usage when available, estimated or reported cost, latency, and fallback frequency.

Do not promise that Jev outperforms the baseline. Report the measured differences and examples where each controller does better.

## 9. Free public access and operational behavior

- Store the provider credential only on the server. Exclude it from browser assets, responses, client logs, and public traces.
- Expose bounded application operations, not an unrestricted model proxy.
- Enforce per-session limits, request-size limits, concurrency limits, and an atomic shared usage budget before dispatching work.
- Account for pending requests and bounded retries when reserving budget; reconcile with actual usage where available.
- Isolate visitor runs so one visitor's disruptions cannot alter another's world.
- Pause or end inactive runs and limit concurrent simulations.
- Display loading, reconnecting, paused, failed, and fallback states clearly.
- When the AI allowance is exhausted or the provider is unavailable, offer the rules-based controller or a clearly labeled recorded run.
- Provide reset behavior and a retention policy for guest runs.

Public sharing of a run can be added after session isolation and persistence are verified. Administrative controls require server-side authorization. Login and roles should be introduced where they serve saved work or administration rather than obstructing the first demo.

## 10. Visual and interaction direction

The island and Fullstack Brandon should feel carefully art-directed: a coherent miniature world with a charming protagonist, readable silhouettes, purposeful lighting, restrained effects, and obvious cause and effect. The default interface is a game view with a compact mission display, intervention controls, and readable character intent.

- Use motion to communicate deliveries, changes of intent, shortages, and recovery.
- Make roads, bridge state, destinations, queues, and cargo understandable at a glance.
- Coordinate character selection with his action display, the optional decision inspector, and the timeline.
- Preserve a clear distinction between observed state, proposed actions, and completed outcomes.
- Provide keyboard-operable controls and a useful non-3D status view.
- Respect reduced-motion preferences and avoid making color the only status signal.
- Adapt scene quality to device capability; preserve essential controls on smaller screens.
- Establish and measure loading and rendering performance targets on named devices before making performance claims.

The final visual language and assets should be developed through a separate design pass. This brief does not lock a specific aesthetic or asset source.

## 11. Making the work visible to employers

Every major claim should have a concrete demonstration or inspectable artifact.

| Claim | Evidence |
| --- | --- |
| Strong interaction and game design | A polished first mission, expressive character feedback, meaningful interventions, accessible alternatives, and documented playtest improvements |
| Frontend engineering | Scene/component architecture, observed performance measurements, and behavior across supported devices |
| Backend engineering | Reconnection handling, session isolation, persisted runs, validated commands, and reproducible operational tests |
| Simulation correctness | Tests for inventory conservation, action legality, resource contention, routing, and replay consistency |
| Responsible AI implementation | Captured decision records, model versions, validated actions, visible fallbacks, and usage accounting |
| Problem-solving | Short decision records describing the constraint, considered alternatives, chosen solution, and measured consequence |
| Iteration and attention to detail | Actual development notes, before/after captures, resolved issues, and linked commits where available |

A case study should tell the story from problem to decisions to working result. Include failures and tradeoffs when they explain the implementation. Keep source links, relevant tests, and architecture diagrams close to the claims they support.

Use honest attribution for personal work, libraries, assets, and AI assistance. Record time only if it is actually tracked; do not invent effort estimates, user counts, results, or performance numbers for presentation.

Maintain a distinction between **planned**, **implemented**, **verified**, and **measured**. A build passing does not establish visual quality, simulation correctness, or a successful visitor experience.

## 12. Proposed delivery stages

### Stage 1 — First complete playable scenario

Build Fullstack Brandon and one small island with the harbor, workshop, café, a bridge, and an alternative route. Establish explicit resource and service rules. A visitor can start Save the Café, intervene by closing the bridge, observe Brandon respond, inspect his action, reach a mission result, and reset the run. Supporting autonomous robots are outside this initial slice.

Implement the rules-based controller first so the world has a testable baseline. Introduce Jev through the same action interface. Persist the run and expose the actual decision records. Keep this slice narrow enough to polish fully.

### Stage 2 — Disruption and recovery

Add supply shortage, customer rush, and objective switching. Complete interruption behavior, reconnect handling, visible fallback behavior, and public usage controls.

### Stage 3 — Replay and evaluation

Add timeline replay, alternative-decision branches, matched baseline comparisons, and evaluation across multiple scenarios and seeds.

### Stage 4 — Portfolio presentation and release quality

Complete the employer view, case study, résumé/contact paths, source documentation, visual refinement, device testing, accessibility review, deployment checks, monitoring, and recovery procedures.

Each stage should end with a working, reviewable experience. Do not postpone visual inspection or end-to-end verification until the last stage.

## 13. Acceptance criteria for the first complete slice

- A new visitor can enter a working demo without supplying an API key or creating an account.
- A visitor understands the mission, can make a meaningful intervention, and reaches an understandable result.
- Fullstack Brandon is the visible protagonist, with animation and action cues matching the current simulation state.
- Closing the bridge changes the authoritative route graph and Brandon's resulting behavior.
- Brandon obeys capacity and inventory rules; resources cannot appear or disappear outside defined events.
- The inspector displays actual legal choices, selected actions, controller identity, and recorded outcomes.
- Jev outputs are validated against current state before execution.
- A provider timeout produces visible, recoverable behavior.
- Two independent visitor sessions cannot modify each other's simulation.
- A browser refresh can recover the stored run according to the defined lifecycle.
- Backend access to Jev is limited by enforced request and budget controls.
- Essential controls work with a keyboard and without relying solely on the 3D scene.
- The first mission is exercised end to end, visually inspected, playtested for enjoyment and clarity, and accompanied by recorded verification results. Automated checks alone do not establish that the game is fun.
- The portfolio identifies exactly what is implemented and what remains planned.

## 14. Decisions to resolve during implementation planning

- Final character design, island art direction, and asset workflow.
- Initial world size, resource types, workshop function, and any later supporting characters.
- Mission goals, pacing, feedback, intervention frequency, and difficulty.
- Fixed simulation ticks versus event-driven advancement.
- Policy for model latency, concurrent decisions, and resource reservations.
- Hosting, database, background execution, and live-update transport.
- Initial baseline policy and evaluation scenarios.
- Guest session duration, usage allowance, retention, and operating budget.
- Supported devices and measurable performance targets.

## 15. Technical references

These references informed the concept discussion. Recheck current model capabilities, pricing, and limits during implementation.

- [TypeSafe introduction](https://docs.typesafe.ai/introduction): structured decisions and question types.
- [TypeSafe models](https://docs.typesafe.ai/models): model identifiers, text-only inputs, pricing, and rate limits.
- [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13): arithmetic, generation, context, and adversarial-input limitations.
- [TypeSafe confidence](https://docs.typesafe.ai/confidence): interpreting returned distributions and confidence.
- [TypeSafe patterns](https://docs.typesafe.ai/patterns): composing bounded decisions into application behavior.
