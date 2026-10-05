# I made my portfolio into a world you can poke

[Back to the project](../README.md) · [Architecture](ARCHITECTURE.md) · [Simulation](SIMULATION.md)

I wanted a portfolio that lets someone experience how I think. You can read a list of technologies anywhere. Here, you can close the bridge and find out whether the backend, the route planner, the interface, and the little person carrying your pickles agree on what happens next.

That became Fullstack Brandon: an original miniature world wrapped around a functioning business simulation. The premise is intentionally ridiculous. The system has to be coherent enough to make the ridiculousness work.

## Start with a visible problem

The founder starts with no money, no purchased fleet, and a small amount of prepaid stock in a garage. Customers place orders. Orders need the right supplies and sometimes specialized equipment. Deliveries earn money. Money pays for supplies, transport, construction, and employees. Employees need their own equipment and actual time to recover.

That gives a visitor a story they can read from the scene. A person carries cargo. A shop requests cases. A workplace changes as the business grows. A shipment arrives. A vehicle gets repaired. These are useful interface signals because they connect abstract state to visible action.

I made the engineering tools optional. The default experience should make sense to someone who wants to play. Someone reviewing the implementation can open the decision record, inspect outcomes, and follow the source. Both paths lead into the same system.

## The work lives at the seams

| Visible moment | Engineering underneath | What I wanted the visitor to understand |
| --- | --- | --- |
| A courier reaches a shop | Graph travel, reservations, arrival and handoff state, inventory accounting | A delivery is an interaction with a destination |
| A new workplace appears | Money, construction stages, progression, active supply origin | Growth changes how the business operates |
| A storm rolls in | Saved environment state, transport effects, visual transitions | Weather is part of the run |
| A decision is pending | Provider contract, bounded requests, coordinated simulation advancement | The controller is choosing within rules |
| The visitor rewinds | Recorded frames and retained checkpoints | The past can be inspected without rerunning the provider |
| A tired founder goes home | Business hours, unfinished work, fatigue, recovery | Productivity has context |

## Decision: make the backend authoritative

A scene can look convincing while quietly inventing its outcomes. I wanted the source of truth to be explicit. The browser sends commands; the server validates them and advances the world. The renderer consumes state and presents it.

That makes a lot of other things easier to reason about: guest isolation, money, finite supplies, replay, AI budgets, and recovery. It also creates work. Motion has to interpolate between updates. Interface feedback has to explain pauses and unavailable actions. The scene needs to stay readable while the network and controller do their jobs.

I accepted that complexity because the result has an inspectable causal chain.

## Decision: let AI choose; keep exact rules in code

Jev chooses among eligible actions. It does not set balances, create stock, invent destinations, or write arbitrary commands. The adapter records the controller used and falls back to the deterministic policy when needed.

The interesting design problem is making the legal choices meaningful. A controller cannot rescue a bad action model. Each available choice needs clear preconditions and effects, and its outcome must be measurable after execution. I built the provider boundary around that contract.

Saved experience supplies operating lessons from outcomes and feedback. It is useful to call this what it is: persisted context. The system does not retrain the model. That distinction helps a reviewer understand precisely which part I implemented.

## Decision: make the joke obey the economy

A cargo rack changes carrying capacity. A cooler prevents packing-room spoilage and supports cold-chain orders. A generator changes production during a blackout. A winch changes helicopter eligibility in storms. A courier's vehicle belongs to that courier.

That is how I want upgrades to work: a purchase should alter a rule the player can encounter. The shop is a set of operational choices. Even the teleporter has to participate in cargo and progression rules. I will tolerate fictional technology; the inventory still has a job to do.

## Decision: give motion a lifecycle

A vehicle arriving near a building is not the same event as a person delivering an order. The world needs parking, dismounting, walking, entry, handoff, exit, returning to equipment, and boarding. Sea and air trips have their own approach and landing requirements.

Those stages touch many systems at once: carrying state, collision footprints, actor mode, destination markers, visible equipment, and when another decision is allowed. This is one of the most revealing parts of the project because a small visual discontinuity often exposes an unclear ownership boundary.

The implementation has dedicated movement, traffic, route, vehicle, and interaction tests. The verification guide separates those checks from visual browser acceptance; passing a state-machine test does not prove every frame looks smooth.

## Decision: preserve the past without saving every frame forever

Long careers produce growing state. Saving every snapshot indefinitely would turn replay into an operating cost problem. The store keeps a recent exact window and coarser older snapshots, while retained decision checkpoints support branching.

A replay shows the recorded tick. A branch creates a separate run. External model responses do not need to be reproduced to inspect what happened. The storage tradeoff is visible rather than disguised as unlimited frame-perfect history.

## Decision: keep operations understandable

One Node process owns active simulations and SQLite usage reservations. This fits a portfolio service with a clear persistent-disk deployment model. Backups use SQLite's backup API. Recovery restores interrupted running worlds as paused.

A distributed version would need shared coordination and transactional ownership. I document that boundary because architecture includes knowing which guarantees a design actually supplies.

## What this project demonstrates

The product brings interface design, procedural graphics, simulation, backend engineering, AI integration, persistence, and verification into one experience. The strongest evidence is how those parts agree when something changes.

To inspect that agreement, follow one concrete event:

```mermaid
flowchart LR
    Closure[Visitor closes a route] --> Rules[Engine updates route conditions]
    Rules --> Choice[Controller chooses a legal next action]
    Choice --> Movement[World executes the journey]
    Movement --> Accounting[Delivery changes stock and revenue]
    Accounting --> Record[Outcome is saved and inspectable]
```

My goal is software with a clear internal model and a personality you can see. Here that personality happens to be a tiny entrepreneur with a increasingly unreasonable transportation budget.

## A useful review route

1. Read the [architecture](ARCHITECTURE.md) to understand ownership.
2. Inspect [`shared/engine.js`](../shared/engine.js) and [`shared/realism.js`](../shared/realism.js) for the rules.
3. Read [`server/jev.js`](../server/jev.js) for the actual provider contract.
4. Follow [`server/store.js`](../server/store.js) into replay and persistence.
5. Compare [`shared/traffic.js`](../shared/traffic.js) with [`src/Island.jsx`](../src/Island.jsx) and the motion modules.
6. Run the checks in [verification](VERIFICATION.md), then explore the browser yourself.

This is a simulation of an invented business. Its performance and economics are evaluated within that model. I want the repo to make the work easy to examine, including its remaining limits.
