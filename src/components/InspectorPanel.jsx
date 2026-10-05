import { History, GitBranch, Check } from "../icons.js";
import { ACTIONS } from "../../shared/engine.js";
import { fmt } from "../lib/format.js";
export default function InspectorPanel({
  live,
  busy,
  returnToOriginal,
  state,
  branch,
  openReplay,
}) {
  const entries = [
    ...state.decisions.map((d) => ({ ...d, kind: "decision" })),
    ...state.events
      .filter(
        (e) =>
          !state.decisions.some(
            (d) => d.tick === e.tick && e.text?.includes(d.label),
          ),
      )
      .map((e, i) => ({ ...e, id: `event-${i}`, kind: "event" })),
  ].sort((a, b) => b.tick - a.tick);
  return (
    <>
      <h2>Decisions & results</h2>
      {live.branch && (
        <button
          className="secondary-button branch-return"
          disabled={busy}
          onClick={returnToOriginal}
        >
          <History size={16} />
          Return to original run
        </button>
      )}
      <div className="section-heading decision-heading">
        <h3>Decisions</h3>
        <button className="text-button" disabled={busy} onClick={openReplay}>
          <History size={15} />
          Replay
        </button>
      </div>
      <div className="event-list decision-feed">
        {entries.map((entry) => (
          <div key={`${entry.kind}-${entry.id}`}>
            <span>{fmt(entry.tick)}</span>
            {entry.kind === "decision" ? (
              <details>
                <summary>{entry.label}</summary>
                <p>{entry.reason}</p>
                <div className="outcome">
                  <Check size={15} />
                  {entry.outcome}
                </div>
                <details className="decision-alternatives">
                  <summary>Try another choice</summary>
                  <div className="choice-list">
                    {(entry.choices || []).map((action) => (
                      <button
                        key={action}
                        disabled={busy}
                        onClick={() => branch(entry, action)}
                      >
                        <span>{ACTIONS[action]?.label || action}</span>
                        {entry.action === action ? (
                          <Check size={16} />
                        ) : (
                          <GitBranch size={16} />
                        )}
                      </button>
                    ))}
                  </div>
                </details>
              </details>
            ) : (
              <p>{entry.text}</p>
            )}
            <small>{entry.kind === "decision" ? "decision" : entry.type}</small>
          </div>
        ))}
      </div>
      {!entries.length && (
        <p className="empty-state">
          Decisions appear here after you press play.
        </p>
      )}
    </>
  );
}
