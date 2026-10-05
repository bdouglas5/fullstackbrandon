import { useEffect, useRef, useState } from "react";
import { Brain, X, Activity, GitBranch, Check, Sparkles } from "../icons.js";
import { ACTIONS } from "../../shared/engine.js";
import { fmt } from "../lib/format.js";
import "./brain.css";

export default function BrainPanel({
  state,
  pending,
  replaying,
  connection,
  onClose,
}) {
  const close = useRef(null);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  const decisions = state.decisions || [];
  const pinned = decisions.find((d) => d.id === selected);
  const decision = pinned || decisions.at(-1);
  const thinking = !pinned && !!pending;
  const trace = thinking ? pending : decision?.trace;
  const options =
    trace?.options ||
    (decision?.choices || []).map((action) => ({
      action,
      label: ACTIONS[action]?.label || action,
    }));
  const ranked = [...options].sort((a, b) => {
    if (thinking)
      return (
        Number(b.action === trace.recommended) -
        Number(a.action === trace.recommended)
      );
    return (
      Number(b.action === decision?.action) -
        Number(a.action === decision?.action) ||
      (decision?.probabilities?.[b.action] || 0) -
        (decision?.probabilities?.[a.action] || 0)
    );
  });
  const lessons = trace?.lessons || [];
  const status = pinned
    ? "Recorded decision"
    : replaying
      ? "Replay"
      : connection !== "connected"
        ? "Reconnecting"
        : thinking
          ? "Evaluating next move"
          : state.status === "running"
            ? "Acting on a decision"
            : state.status === "paused"
              ? "Paused"
              : state.status === "complete"
                ? "Career complete"
                : "Ready to begin";
  return (
    <section
      id="brandon-brain"
      className={`brain-panel ${thinking ? "brain-evaluating" : ""}`}
      role="region"
      aria-label="Brandon’s live brain"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="brain-header">
        <span className="brain-mark">
          <Brain size={25} />
        </span>
        <div>
          <span className="brain-eyebrow">INSIDE THE NEXT MOVE</span>
          <h2>
            Brandon’s brain <span>powered by Jev</span>
          </h2>
        </div>
        <span className="brain-status">
          <i />
          {status}
        </span>
        <button
          ref={close}
          className="brain-close"
          aria-label="Close brain"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="brain-body">
        <div className="brain-goal">
          <Activity size={14} />
          <b>{trace?.objective || "Build a sustainable pickle business"}</b>
          <span>
            {thinking
              ? `Decision at ${fmt(trace.tick)}`
              : decision
                ? `Decision ${(state.decisionCount || decisions.length) - decisions.length + decisions.indexOf(decision) + 1} · ${fmt(decision.tick)}`
                : "Waiting for the first move"}
          </span>
        </div>
        <div
          className="brain-tree"
          key={thinking ? `pending-${trace.tick}` : decision?.id || "ready"}
        >
          <svg
            className="brain-wires"
            viewBox="0 0 900 240"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M190 120 C240 120 210 40 310 40 M190 120 C240 120 210 120 310 120 M190 120 C240 120 210 200 310 200 M580 40 C660 40 620 120 710 120 M580 120 L710 120 M580 200 C660 200 620 120 710 120" />
          </svg>
          <div className="brain-column brain-inputs">
            <h3>
              <span>01</span> Read the world
            </h3>
            <div className="brain-node brain-signals">
              {(
                trace?.signals ||
                (decision?.context
                  ? [
                      {
                        label: "Cash available",
                        value: `${Math.floor(decision.context.money)} coins`,
                      },
                      {
                        label: "Ready to deliver",
                        value: `${decision.context.carrying} cases`,
                      },
                      {
                        label: "Waiting orders",
                        value: decision.context.queue,
                      },
                    ]
                  : [])
              ).map((signal) => (
                <div key={signal.label}>
                  <span>{signal.label}</span>
                  <b>{signal.value}</b>
                </div>
              ))}
              {!trace && !decision && (
                <p>
                  Press play. World inputs will appear when Brandon chooses a
                  move.
                </p>
              )}
            </div>
            <div className="brain-guard">
              <Check size={13} /> Costs, ownership, routes & labor rules
              constrain available actions.
            </div>
          </div>
          <div className="brain-column brain-options">
            <h3>
              <span>02</span> Weigh the branches{" "}
              <small>{options.length} available</small>
            </h3>
            <div className="brain-candidates">
              {ranked.slice(0, expanded ? ranked.length : 4).map((option) => {
                const chosen = !thinking && option.action === decision?.action;
                const probability =
                  decision?.controller === "jev" && !thinking
                    ? decision.probabilities?.[option.action]
                    : null;
                return (
                  <article
                    className={`brain-node brain-option ${chosen ? "brain-chosen" : ""}`}
                    key={option.action}
                  >
                    <div>
                      <GitBranch size={13} />
                      <b>{option.label}</b>
                      <span>
                        {chosen ? (
                          <Check size={14} />
                        ) : probability != null ? (
                          `${Math.round(probability * 100)}%`
                        ) : (
                          ""
                        )}
                      </span>
                    </div>
                    {probability != null && (
                      <div className="brain-probability">
                        <i style={{ width: `${probability * 100}%` }} />
                      </div>
                    )}
                    <p>
                      {option.reason || "Available in this recorded decision."}
                    </p>
                    {trace?.recommended === option.action && (
                      <small>Operating plan recommendation</small>
                    )}
                  </article>
                );
              })}
            </div>
            {ranked.length > 4 && (
              <button
                className="brain-more"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? "Show strongest branches"
                  : `Show all ${ranked.length} branches`}
              </button>
            )}
            {!options.length && (
              <div className="brain-node">
                <p>Available choices appear with the first decision.</p>
              </div>
            )}
          </div>
          <div className="brain-column brain-output">
            <h3>
              <span>03</span> Choose & act
            </h3>
            <div className="brain-node brain-result">
              <span className="brain-eyebrow">
                {thinking
                  ? "JEV IS EVALUATING"
                  : decision?.controller === "jev"
                    ? "JEV CHOSE"
                    : decision
                      ? "RULES CONTROLLER CHOSE"
                      : "NEXT ACTION"}
              </span>
              <h4>
                {thinking
                  ? "Choosing the next move…"
                  : decision?.label || "A world of possibilities"}
              </h4>
              <p>
                {thinking
                  ? "Using the current world, available actions, and saved experience."
                  : decision?.reason ||
                    "Follow the inputs, branches, decision, and result as the business runs."}
              </p>
              {!thinking && decision && (
                <div className="brain-result-meta">
                  {decision.controller === "jev" ? (
                    <>
                      <b>
                        {decision.confidence == null
                          ? "—"
                          : `${Math.round(decision.confidence * 100)}%`}{" "}
                        confidence
                      </b>
                      <span>
                        {decision.latency} ms · {decision.model || "Jev"}
                      </span>
                    </>
                  ) : (
                    <span>
                      {decision.fallback || "Deterministic operating plan"}
                    </span>
                  )}
                </div>
              )}
            </div>
            {!thinking && decision && (
              <div className="brain-outcome">
                <Check size={14} />
                <div>
                  <span>Result feeds back into experience</span>
                  <b>{decision.outcome}</b>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="brain-memory">
          <Sparkles size={16} />
          <div>
            <b>
              {lessons.length
                ? `${lessons.length} saved lessons inform this move`
                : "Experience becomes a better operating plan"}
            </b>
            <p>
              {lessons.at(-1)?.change ||
                "Observed outcomes and feedback update saved lessons for future choices."}
            </p>
          </div>
          <span>
            {trace?.plan
              ? `Stock buffer ${trace.plan.reorderPoint} · Battery reserve ${trace.plan.chargeReserve}% · Wage reserve ${trace.plan.payrollDays}d`
              : `${state.learning?.evaluatedDecisions || 0} outcomes observed`}
          </span>
        </div>
        {!!lessons.length && (
          <details className="brain-evidence">
            <summary>See the remembered evidence</summary>
            {lessons.map((lesson) => (
              <p key={lesson.key}>
                <b>{lesson.title}</b> · {lesson.evidence}
                <br />
                {lesson.change}
              </p>
            ))}
          </details>
        )}
        {!!trace?.feedback?.length && (
          <details className="brain-evidence">
            <summary>Feedback considered for this move</summary>
            {trace.feedback.map((item, i) => (
              <p key={i}>
                <b>{item.name || item.source}</b> · {item.text}
              </p>
            ))}
          </details>
        )}
      </div>
      <footer className="brain-footer">
        <div className="brain-timeline">
          <button
            className={!pinned ? "active" : ""}
            onClick={() => setSelected(null)}
          >
            {replaying ? "Follow replay" : "Follow live"}
          </button>
          {decisions
            .slice(-8)
            .reverse()
            .map((d) => (
              <button
                key={d.id}
                className={pinned?.id === d.id ? "active" : ""}
                onClick={() => setSelected(d.id)}
                title={`${d.label} · ${fmt(d.tick)}`}
              >
                {fmt(d.tick)}
              </button>
            ))}
        </div>
        <p>
          Live inputs, decision criteria and returned scores. Explanations come
          from the simulation; saved experience is not model retraining.
        </p>
      </footer>
    </section>
  );
}
