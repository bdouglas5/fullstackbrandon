import {
  Layers,
  Activity,
  ShieldCheck,
  GitBranch,
  Code2,
  Zap,
  Download,
  ArrowUpRight,
} from "../icons.js";

const SYSTEMS = [
  [
    Layers,
    "An original world, built in code",
    "Procedural islands, buildings, characters, and vehicles form a miniature archipelago. Articulated animation, camera follow, boarding, and delivery handoffs connect every trip to the business behind it.",
  ],
  [
    Activity,
    "A business with real consequences",
    "Orders reserve actual stock. Earnings pay for imports, wages, vehicles, and gadgets. The company grows from a home garage to an office and a private island with a garden, greenhouse, and working pickle factory.",
  ],
  [
    Code2,
    "AI with a defined job",
    "Jev considers the current business, visitor priorities, and recorded experience, then chooses from actions the engine permits. The engine owns the money, inventory, routes, and consequences. Every choice has a recorded result.",
  ],
  [
    Zap,
    "A world that reacts",
    "Road closures reroute deliveries. Weather changes transport conditions. Rain, fog, cloud cover, wind, water, and daylight transition through the scene. Crew members have their own vehicles, shifts, breaks, wages, and recovery.",
  ],
  [
    GitBranch,
    "A history you can investigate",
    "Live decisions and outcomes become a saved timeline. Rewind the business or branch from a past choice to try another path. The original run stays intact, and earned achievements remain part of the career.",
  ],
  [
    ShieldCheck,
    "Built for continuity",
    "Private sessions, validated commands, live server events, and SQLite persistence keep the interface and business in sync. Bounded AI usage and a deterministic fallback keep the world moving when a provider is slow or unavailable.",
  ],
];

export default function EngineeringPanel({ run, state }) {
  return (
    <>
      <span className="eyebrow">DESIGNED & IMPLEMENTED BY BRANDON DOUGLAS</span>
      <h2>An entire world, engineered to work.</h2>
      <p className="drawer-intro">
        Fullstack Brandon brings interactive design, original 3D art, full-stack
        engineering, and AI orchestration into one working experience. Every
        delivery you watch connects to a route, an inventory ledger, a business
        decision, and a history you can inspect.
      </p>
      <div className="architecture-flow">
        <span>Explore</span>
        <span>→</span>
        <span>Decide</span>
        <span>→</span>
        <span>Simulate</span>
        <span>→</span>
        <span>Learn from outcomes</span>
      </div>
      <div className="engineering-grid">
        {SYSTEMS.map(([Icon, title, body]) => (
          <article key={title}>
            <Icon />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <section className="engineering-deep">
        <h3>Progression built into the system.</h3>
        <p>
          Gadgets change capabilities. Transport changes reach and carrying
          capacity. Customer ratings reflect delivery performance. A
          prerequisite-based achievement tree connects service, equipment, crew,
          production, island expansion, and retirement into one career.
        </p>
      </section>
      <details className="source-map">
        <summary>How AI becomes action</summary>
        <div className="decision-tree">
          {[
            [
              "01 · OBSERVE",
              "Read the whole business",
              "Stock, orders, money, weather, workforce, current trips, and saved operating lessons provide the decision context.",
            ],
            [
              "02 · CONSTRAIN",
              "Offer only possible actions",
              "Ownership, available stock, equipment, schedules, road access, and funding determine what the engine allows.",
            ],
            [
              "03 · CHOOSE",
              "Select the next job or investment",
              "AI chooses within that action set. Responses are checked; timeouts, invalid choices, and usage limits fall back safely.",
            ],
            [
              "04 · EXECUTE",
              "Make the choice physically happen",
              "Couriers collect, travel, hand off stock, and return. The engine accounts for time, cost, inventory, and customer outcomes.",
            ],
            [
              "05 · REMEMBER",
              "Use the evidence next time",
              "Recorded outcomes and feedback inform future planning. This is persisted operating memory, not model retraining.",
            ],
          ].map(([step, title, body]) => (
            <div key={step}>
              <small>{step}</small>
              <b>{title}</b>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </details>
      <details className="source-map">
        <summary>Engineering & verification</summary>
        <p>
          React and Three.js render the world. Node and Express own simulation
          commands and live updates. SQLite stores private runs, frames,
          decision checkpoints, and provider usage. Static mesh batching and
          instanced townspeople reduce scene overhead.
        </p>
        <p>
          Automated checks cover inventory and money accounting, routes, vehicle
          motion, orders, crew schedules, production, weather, achievements,
          server recovery, and browser flows.
        </p>
        <pre>{`shared/engine.js         → authoritative simulation & legal actions
shared/realism.js        → labor, construction, supply & production
shared/learning.js       → persisted lessons & feedback
shared/achievements.js   → milestones & retirement prerequisites
server/jev.js           → bounded AI decisions & fallback
server/store.js         → sessions, runs, history & checkpoints
src/world*.js           → procedural assets, atmosphere & motion
src/Island.jsx          → world rendering, camera & interactions
tests/                  → engine, server & browser verification`}</pre>
      </details>
      <h3>This world, live</h3>
      <div className="engineering-readout">
        <span>
          Recorded decisions <b>{state.decisions.length}</b>
        </span>
        <span>
          Completed deliveries <b>{state.served || 0}</b>
        </span>
        <span>
          Successful AI decisions <b>{state.calls || 0}</b>
        </span>
        <span>
          Backup decisions <b>{state.fallbacks || 0}</b>
        </span>
        <span>
          Simulation version <b>{state.version}</b>
        </span>
        <span>
          Scenario seed <b>{state.seed}</b>
        </span>
      </div>
      <p className="muted">
        {run?.jevConfigured
          ? "An AI connection is configured for this server."
          : "This server is currently running with the deterministic decision controller."}{" "}
        The same business rules apply to both controllers.
      </p>
      <div className="drawer-actions">
        {run && (
          <a className="secondary-button" href={`/api/runs/${run.id}/export`}>
            <Download size={16} />
            Download this run
          </a>
        )}
        <a
          className="secondary-button"
          href="/case-study.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the case study
          <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="notice">
        Customers, money, and reviews are simulated. Operating memory improves
        planning within the game; it does not retrain the AI model.
      </div>
    </>
  );
}
