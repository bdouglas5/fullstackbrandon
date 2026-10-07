import { shiftEnded, simulationSpeed } from "../../shared/business-hours.js";
import {
  CloudRain,
  CircleHelp,
  Activity,
  Pause,
  RotateCcw,
  Play,
  Zap,
  Leaf,
  ShieldCheck,
  Coins,
  Wrench,
  Brain,
} from "../icons.js";
import { TOOLS, TRANSPORT } from "../../shared/engine.js";

export default function MissionPanel({
  setIntro,
  onUpgrades,
  onSetbacks,
  brainOpen,
  brainButton,
  onBrain,
  state,
  loading,
  busy,
  history,
  run,
  live,
  restart,
  act,
  locked,
}) {
  const target = state.retirement?.target || 2500;
  const moneyProgress = Math.min(100, (state.money / target) * 100);
  const mastered = Object.values(state.tools || {}).filter(
    (level) => level === 2,
  ).length;
  const running = live.status === "running";
  const complete = live.status === "complete";
  return (
    <aside className="mission-panel">
      <div className="mission-title">
        <span className="eyebrow">FULLSTACK BRANDON</span>
        <h1>Simulation</h1>
      </div>
      <section className="mission-card" aria-label="Mission">
        <div className="card-top">
          <span className="tag">PLAYBACK</span>
          <button
            className="icon-button"
            aria-label="How this works"
            title="How this works"
            onClick={() => setIntro(true)}
          >
            <CircleHelp size={17} />
          </button>
        </div>
        <button
          className="primary-button mission-play"
          disabled={loading || busy || !!history}
          onClick={() =>
            !run || complete
              ? restart()
              : act(live.status === "ready" ? "start" : "pause")
          }
        >
          {loading ? (
            <Activity size={17} />
          ) : running ? (
            <Pause size={17} />
          ) : complete ? (
            <RotateCcw size={17} />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          {loading
            ? "Preparing the world"
            : running
              ? "Pause simulation"
              : complete
                ? "Start a new business"
                : live.status === "ready"
                  ? "Play simulation"
                  : "Resume simulation"}
        </button>
        <div
          className="speed-control"
          role="group"
          aria-label="Simulation speed"
        >
          <span>
            {shiftEnded(state)
              ? `Clocked out · ${simulationSpeed(state)}×`
              : "Watch at"}
          </span>
          {[1, 2, 4, 8].map((speed) => (
            <button
              key={speed}
              aria-pressed={(state.speed || 1) === speed}
              disabled={locked}
              onClick={() => act("speed", speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </section>
      <section className="business-snapshot" aria-label="Business performance">
        <div className="reputation-summary">
          <span>Reputation</span>
          <b>
            {state.rating?.count ? state.rating.average.toFixed(1) : "—"}
            <small> / 5</small>
          </b>
          <span
            className="snapshot-stars"
            aria-label={
              state.rating?.count
                ? `${state.rating.average.toFixed(1)} out of 5 stars`
                : "Not rated yet"
            }
          >
            <span aria-hidden="true">
              {[1, 2, 3, 4, 5].map((star) => (
                <i
                  key={star}
                  className={
                    star <= Math.round(state.rating?.average || 0)
                      ? "earned"
                      : ""
                  }
                >
                  ★
                </i>
              ))}
            </span>
          </span>
          <small>{state.rating?.count || 0} ratings</small>
        </div>
        <div className="snapshot-counts">
          <div>
            <b>{state.customerQueue?.length || 0}</b>
            <span>Open orders</span>
          </div>
          <div>
            <b>{state.served || 0}</b>
            <span>Delivered</span>
          </div>
        </div>
      </section>
      <section className="career-card" aria-label="Retirement progress">
        <div className="section-heading">
          <h3>Retirement</h3>
        </div>
        <div className="career-balance">
          <Coins size={17} />
          <b>{Math.floor(state.money || 0).toLocaleString()}</b>
          <span>/ {target.toLocaleString()} coins saved</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Retirement savings"
          aria-valuenow={Math.min(target, Math.floor(state.money || 0))}
          aria-valuemin={0}
          aria-valuemax={target}
        >
          <span style={{ width: moneyProgress + "%" }} />
        </div>
        <div className="career-checks">
          <span>
            <Wrench size={13} /> {mastered}/{Object.keys(TOOLS).length} gadgets
            Pro
          </span>
          <span>
            {state.vehicles?.length || 0}/{Object.keys(TRANSPORT).length}{" "}
            vehicles
          </span>
          <span>
            {state.construction?.stage === "complete" ? "✓" : "○"} Own factory
          </span>
          <span>
            {state.production?.expanded ? "✓" : "○"} Production expanded
          </span>
        </div>
      </section>
      <div className="simulation-actions">
        <button className="secondary-button console-link" onClick={onUpgrades}>
          <Wrench size={16} /> Upgrades
        </button>
        <button className="secondary-button console-link" onClick={onSetbacks}>
          <CloudRain size={16} /> Controls
        </button>
        <button
          ref={brainButton}
          className={`brain-button brain-link ${run?.thinking && !history ? "is-thinking" : ""}`}
          aria-label="Open Brandon’s brain"
          aria-expanded={brainOpen}
          aria-controls="brandon-brain"
          onClick={onBrain}
          title="See the live decision tree"
        >
          <Brain size={17} />
          <span>Brain · decision tree</span>
          <i aria-hidden="true" />
        </button>
      </div>
      <section className="priority-section">
        <div className="section-heading">
          <h3>Choose the priority</h3>
        </div>
        <div className="segmented">
          <button
            className={state.objective === "speed" ? "selected" : ""}
            aria-pressed={state.objective === "speed"}
            disabled={locked}
            onClick={() => act("objective", "speed")}
          >
            <Zap size={14} />
            Fast service
          </button>
          <button
            className={state.objective === "waste" ? "selected" : ""}
            aria-pressed={state.objective === "waste"}
            disabled={locked}
            onClick={() => act("objective", "waste")}
          >
            <Leaf size={14} />
            Less waste
          </button>
        </div>
      </section>
      <div className="sidebar-footer">
        <span>
          <ShieldCheck size={14} />
          Your own saved world
        </span>
        <button
          disabled={loading || busy}
          onClick={() => restart()}
          title="Reset simulation"
          aria-label="Reset simulation"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </aside>
  );
}
