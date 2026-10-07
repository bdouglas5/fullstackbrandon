import BrainPanel from "./components/BrainPanel.jsx";
import { shiftEnded } from "../shared/business-hours.js";
import { visibleOrders } from "../shared/business-hours.js";
import Achievements, { AchievementBanner } from "./components/Achievements.jsx";
import EngineeringPanel from "./components/EngineeringPanel.jsx";
import AboutPanel from "./components/AboutPanel.jsx";
import SetbacksPanel from "./components/SetbacksPanel.jsx";
import MissionPanel from "./components/MissionPanel.jsx";
import InspectorPanel from "./components/InspectorPanel.jsx";
import WelcomeDialog from "./components/WelcomeDialog.jsx";
import { Suspense, lazy, useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Brain,
  Play,
  Pause,
  ArrowUpRight,
  X,
  Coffee,
  Package,
  Users,
  Leaf,
  Code2,
  ScanEye,
  History,
  Sun,
  CloudRain,
  Expand,
  Trophy,
  AlertCircle,
} from "./icons.js";
const EmpireConsole = lazy(() => import("./components/EmpireConsole.jsx"));
import { frameBus } from "./frame-bus.js";
const Island = lazy(() => import("./Island.jsx"));
import { ACTIONS, fresh } from "../shared/engine.js";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";
import "./polish.css";
import { lockPageGestures } from "./page-gestures.js";
import { api, subscribe } from "./game-client.js";
const defaultController =
  import.meta.env.VITE_BROWSER_SIMULATION === "true" ? "rules" : "jev";
const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
function IslandPlaceholder() {
  return (
    <div
      className="loading-veil island-placeholder"
      role="status"
      aria-label="Preparing the island"
    >
      <div className="loader" aria-hidden="true" />
      <p>Preparing the island…</p>
    </div>
  );
}

function App() {
  useEffect(() => lockPageGestures(), []);
  const [preview] = useState(() => fresh(42, defaultController));
  const [followTarget, setFollowTarget] = useState("brandon");
  const [following, setFollowing] = useState(false);
  const [run, setRun] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [panel, setPanel] = useState(null),
    [connection, setConnection] = useState("connecting"),
    [history, setHistory] = useState(null),
    [replay, setReplay] = useState(0),
    [viewReset, setViewReset] = useState(0),
    [intro, setIntro] = useState(true),
    [reduced] = useState(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [controller, setController] = useState(defaultController);
  const [brainOpen, setBrainOpen] = useState(false);
  const brainButton = useRef(null);
  const closeBrain = () => {
    setBrainOpen(false);
    brainButton.current?.focus({ preventScroll: true });
  };
  const errorTimer = useRef();
  const [shiftTransition, setShiftTransition] = useState(null);
  const morningTarget = useRef(null);
  function closeIntro() {
    setIntro(false);
  }
  useEffect(() => {
    if (!panel && !intro) return;
    const prior = document.activeElement;
    const dialog = document.querySelector("[data-dialog]");
    if (!dialog) return;
    const selectors =
      'button:not(:disabled),a[href],input,select,[tabindex="0"]';
    dialog.querySelector(selectors)?.focus({ preventScroll: true });
    const key = (e) => {
      if (e.key === "Escape") {
        setPanel(null);
        if (intro) closeIntro();
      }
      if (e.key === "Tab") {
        const items = [...dialog.querySelectorAll(selectors)];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      const restore =
        prior?.isConnected && prior !== document.body
          ? prior
          : document.querySelector(".mission-play");
      restore?.focus({ preventScroll: true });
    };
  }, [panel, intro]);
  const live = run?.state || preview,
    state = history?.[replay]?.state || live;
  const lastDecision = state.decisions?.at(-1);
  const thought =
    state.status === "complete"
      ? "The business is built. Time to enjoy the view."
      : run?.thinking && !history
        ? "Choosing my next move…"
        : state.brandon.action
          ? ACTIONS[state.brandon.action]?.verb
          : state.status === "ready"
            ? "Ready to collect stock and make the first delivery."
            : state.message;
  useEffect(() => {
    if (
      shiftTransition === "advancing" &&
      morningTarget.current != null &&
      live.tick >= morningTarget.current
    )
      setShiftTransition("revealing");
  }, [live.tick, shiftTransition]);
  useEffect(() => {
    if (shiftTransition !== "revealing") return;
    const timer = setTimeout(
      () => {
        setShiftTransition(null);
        morningTarget.current = null;
      },
      reduced ? 200 : 1200,
    );
    return () => clearTimeout(timer);
  }, [shiftTransition, reduced]);
  async function advanceToMorning(plan = "morning") {
    if (!run || busy || shiftTransition) return;
    setShiftTransition("advancing");
    setBusy(true);
    try {
      const next = await api(`/runs/${run.id}/command`, {
        type: "next_shift",
        value: plan,
      });
      morningTarget.current = next.state.brandon.shift.nextShiftAt;
      setRun(next);
    } catch (e) {
      setShiftTransition(null);
      morningTarget.current = null;
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (run?.storageWarning) notify(new Error(run.storageWarning));
  }, [run?.storageWarning]);
  function notify(e) {
    setError(e.message || String(e));
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(""), 7000);
  }
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const d = await api("/session");
        let r = d.run;
        if (!r)
          r = await api("/runs", {
            controller: defaultController,
          });
        if (r.state.status === "running")
          r = await api(`/runs/${r.id}/command`, { type: "pause" });
        if (!cancel) {
          setRun(r);
          setController(r.state.controller);
        }
      } catch (e) {
        if (!cancel) notify(e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
      clearTimeout(errorTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!run?.id) return;
    setConnection("connecting");
    const close = subscribe(
      run.id,
      (next) => {
        frameBus.push(next.id, next.state);
        setRun(next);
        setConnection("connected");
      },
      setConnection,
    );
    return close;
  }, [run?.id]);
  function openBusiness() {
    document
      .querySelector(".world-panel")
      ?.scrollIntoView({ behavior: "instant", block: "center" });
    setPanel("business");
  }
  async function act(type, value) {
    if (!run || busy) return;
    setBusy(true);
    try {
      setRun(
        await api(`/runs/${run.id}/command`, {
          type,
          value,
        }),
      );
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function restart(next = defaultController) {
    setBusy(true);
    try {
      const r = await api("/runs", {
        controller: next,
        seed: ((run?.state.seed ?? 41) + 1) % 100000,
      });
      setRun(r);
      setHistory(null);

      setFollowTarget("brandon");
      setController(r.state.controller);
      setPanel(null);
      setIntro(true);
      return r;
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function startFromIntroduction() {
    if (!run || busy || loading || history) return;
    setBusy(true);
    try {
      let current = run;
      if (current.state.status === "complete") {
        current = await api("/runs", {
          controller,
          seed: (current.state.seed + 1) % 100000,
        });
        setFollowTarget("brandon");
      }
      if (current.state.status === "ready" || current.state.status === "paused")
        current = await api(`/runs/${current.id}/command`, {
          type: current.state.status === "ready" ? "start" : "pause",
        });
      setRun(current);
      closeIntro();
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function openReplay() {
    setBusy(true);
    try {
      if (live.status === "running")
        setRun(
          await api(`/runs/${run.id}/command`, {
            type: "pause",
          }),
        );
      const h = await api(`/runs/${run.id}/history`);
      setHistory(h);
      setReplay(h.length - 1);
      setPanel(null);
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function returnToOriginal() {
    if (!live.branch) return;
    setBusy(true);
    try {
      if (live.status === "running")
        await api(`/runs/${run.id}/command`, {
          type: "pause",
        });
      const original = await api(`/runs/${live.branch.parent}/select`, {});
      setRun(original);
      setHistory(null);

      setController(original.state.controller);
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function branch(d, action) {
    setBusy(true);
    try {
      const r = await api(`/runs/${run.id}/branch`, {
        decision: d.id,
        action,
      });
      setRun(r);
      setHistory(null);
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  const locked = loading || busy || !!history || live.status === "complete";
  return (
    <div className="app-shell">
      <header className="topbar" inert={!!panel || intro}>
        <a className="brand" href="/" aria-label="Fullstack Brandon home">
          <span className="brandmark">
            B<span>.</span>
          </span>
          <span>
            Fullstack
            <br />
            <b>Brandon</b>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={!panel ? "nav-active" : ""}
            onClick={() => setPanel(null)}
          >
            Simulation
          </button>
          <button
            className={panel === "engineering" ? "nav-active" : ""}
            onClick={() => setPanel("engineering")}
          >
            Under the hood <Code2 size={15} />
          </button>
          <button
            className={panel === "achievements" ? "nav-active" : ""}
            onClick={() => setPanel("achievements")}
          >
            <Trophy size={15} /> Achievements
          </button>
        </nav>
        <button className="about-link" onClick={() => setPanel("about")}>
          Meet the builder <ArrowUpRight size={17} />
        </button>
      </header>
      <main className="game-layout" inert={!!panel || intro}>
        <MissionPanel
          setIntro={setIntro}
          onUpgrades={() => setPanel("upgrades")}
          onSetbacks={() => setPanel("setbacks")}
          brainOpen={brainOpen}
          brainButton={brainButton}
          onBrain={() => setBrainOpen(!brainOpen)}
          state={state}
          loading={loading}
          busy={busy}
          history={history}
          run={run}
          live={live}
          restart={restart}
          act={act}
          locked={locked}
        />
        <section
          className="world-panel"
          data-phase={state.world?.phase || "day"}
          aria-label="Fullstack Brandon simulation"
        >
          {brainOpen && (
            <BrainPanel
              state={state}
              pending={!history ? run?.pendingDecision : null}
              replaying={!!history}
              connection={connection}
              onClose={closeBrain}
            />
          )}
          {shiftTransition && (
            <div
              className={`shift-fade ${shiftTransition}`}
              aria-hidden="true"
            />
          )}
          {!loading && (shiftEnded(state) || shiftTransition) && (
            <div
              className="resting-notice"
              role="status"
              aria-live="polite"
              aria-busy={shiftTransition === "advancing"}
            >
              <Sun size={16} aria-hidden="true" />
              <b>
                {shiftTransition === "revealing"
                  ? "Morning shift ready"
                  : shiftTransition
                    ? state.schedule?.isWeekend
                      ? "Skipping the weekend…"
                      : "Advancing to morning…"
                    : state.brandon.action === "beach_day"
                      ? "Brandon is lounging on the beach"
                      : state.schedule?.isWeekend
                        ? "Brandon is off for the weekend"
                        : "Brandon has clocked out"}
              </b>
              <button
                disabled={locked || !!state.daytimeUntil || !!shiftTransition}
                onClick={() => advanceToMorning("morning")}
              >
                {shiftTransition === "revealing"
                  ? "Ready"
                  : shiftTransition || state.daytimeUntil
                    ? state.schedule?.isWeekend
                      ? "Skipping weekend…"
                      : "Going to next shift…"
                    : state.schedule?.isWeekend
                      ? "Skip the weekend"
                      : "Go to next shift"}
              </button>
              {state.schedule?.isWeekend &&
                !shiftTransition &&
                !state.daytimeUntil && (
                  <button
                    className="beach-weekend"
                    disabled={locked}
                    onClick={() => advanceToMorning("beach")}
                  >
                    Spend it at the beach
                  </button>
                )}
            </div>
          )}
          {loading ? (
            <IslandPlaceholder />
          ) : (
            <Suspense fallback={<IslandPlaceholder />}>
              <Island
                state={state}
                liveFeed={!history && !!run?.state}
                notificationScope={`${run?.id || "preview"}:${history ? `replay-${replay}` : "live"}`}
                businessOpen={panel === "business"}
                onSelect={() => {
                  setPanel("inspect");
                }}
                viewReset={viewReset}
                reducedMotion={reduced}
                followTarget={followTarget}
                onFollowTargetChange={setFollowTarget}
                onFollowModeChange={setFollowing}
                thought={thought}
              />
            </Suspense>
          )}
          <div className="world-top">
            <div className="weather-pill">
              {state.world?.weather === "rain" ||
              state.world?.weather === "storm" ? (
                <CloudRain size={16} />
              ) : (
                <Sun size={16} />
              )}
              <b>
                Day {state.world?.day || 1} ·{" "}
                {String(Math.floor(state.world?.hour ?? 8)).padStart(2, "0")}:
                {String(
                  Math.floor(((state.world?.hour ?? 8) % 1) * 60),
                ).padStart(2, "0")}
              </b>
              <span>
                {state.world?.phase || "day"} ·{" "}
                {state.world?.weather || "clear"}
              </span>
            </div>
          </div>
          <div className="world-badges">
            <span className="state-pill">
              <i className={live.status === "running" ? "pulse" : ""} />
              {history
                ? "REPLAY"
                : state.status === "ready"
                  ? "READY TO START"
                  : state.status === "running"
                    ? "SIMULATION RUNNING"
                    : state.status === "complete"
                      ? "RETIRED"
                      : "PAUSED"}
            </span>
          </div>
          <div className="scene-tools">
            <button
              className="glass-button"
              onClick={() => setViewReset((n) => n + 1)}
              title="Reset camera"
              aria-label="Reset camera"
            >
              <Expand size={18} />
            </button>
          </div>
          <div className="mobile-play">
            <span>
              <b>Brandon’s pickle delivery business.</b>
              <small>
                {state.status === "ready"
                  ? "AI plans. Brandon delivers. You can step in."
                  : `${state.served} orders · ${Math.floor(state.money || 0).toLocaleString()} coins`}
              </small>
            </span>
            <button
              className="primary-button"
              disabled={loading || busy || !!history}
              onClick={() =>
                !run || live.status === "complete"
                  ? restart()
                  : act(live.status === "ready" ? "start" : "pause")
              }
            >
              {live.status === "running" ? (
                <Pause size={15} />
              ) : (
                <Play size={15} />
              )}{" "}
              {live.status === "ready"
                ? "Play simulation"
                : live.status === "running"
                  ? "Pause simulation"
                  : live.status === "complete"
                    ? "Start a new business"
                    : "Resume simulation"}
            </button>
          </div>
          <div className={`world-bottom ${following ? "is-following" : ""}`}>
            {!following && (
              <button
                className="brandon-card"
                onClick={() => {
                  setPanel("inspect");
                }}
              >
                <span className="avatar-mark">B.</span>
                <span>
                  <b>
                    Fullstack Brandon{" "}
                    <span className="tiny-tag">PROBLEM SOLVER</span>
                  </b>
                  <small>{thought}</small>
                  {lastDecision && state.status !== "complete" && (
                    <small className="decision-line">
                      Decided: {lastDecision.label}
                      {lastDecision.outcome &&
                      lastDecision.outcome !== "In progress"
                        ? ` → ${lastDecision.outcome}`
                        : ` — ${lastDecision.reason}`}
                    </small>
                  )}
                </span>
                <ScanEye size={20} />
              </button>
            )}
            <button className="business-launch" onClick={openBusiness}>
              <Users size={17} /> Business{" "}
              <span>{state.customerQueue?.length || 0} pending orders</span>
            </button>
            <span className="orbit-hint">DRAG TO EXPLORE · SCROLL TO ZOOM</span>
          </div>
          {live.status === "complete" && !history && (
            <div
              className="result-card"
              role="region"
              aria-label="Retirement results"
            >
              <span className="result-icon">
                <Trophy size={28} />
              </span>
              <span className="eyebrow">A WELL-EARNED RETIREMENT</span>
              <h2>The business is built.</h2>
              <p>
                {live.served} orders delivered. Every gadget upgraded.
                <br />
                {Math.floor(live.money || 0).toLocaleString()} coins saved,{" "}
                {live.crew?.length || 0} crew members, and a business across the
                islands.
              </p>
              <div className="retirement-rating">
                {live.rating?.count
                  ? `${live.rating.average.toFixed(1)} ★ · ${live.rating.count} customer reviews`
                  : "Retirement goal reached."}
              </div>
              <div className="result-actions">
                <button className="primary-button" onClick={openReplay}>
                  <History size={16} />
                  Replay the business
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => restart()}
                >
                  Start a new business
                </button>
              </div>
            </div>
          )}
          {history && (
            <div className="replay-bar">
              <History size={19} />
              <b>Replay</b>
              <input
                aria-label="Replay timeline"
                type="range"
                min="0"
                max={history.length - 1}
                value={replay}
                onChange={(e) => {
                  setReplay(Number(e.target.value));
                }}
              />
              <span>{fmt(state.tick)}</span>
              <button
                className="icon-button"
                aria-label="Exit replay"
                onClick={() => setHistory(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
        </section>
      </main>
      <footer className="statusbar" inert={!!panel || intro}>
        <span>
          <span className={"connection-dot " + connection} />
          {connection === "connected"
            ? "World connected"
            : connection === "reconnecting"
              ? "Reconnecting to your world…"
              : "Connecting…"}
        </span>
        <div className="world-stats">
          <span>
            <Package size={15} />
            <b>{state.harbor}</b> at harbor
          </span>
          <span>
            <Coffee size={15} />
            <b>{state.cafe}</b> at{" "}
            {state.operations?.origin === "home"
              ? "garage"
              : state.operations?.origin === "farm_shop"
                ? "factory"
                : "office"}
          </span>
          <span>
            <Users size={15} />
            <b>{visibleOrders(state).length}</b> waiting
          </span>
          <span>
            <Leaf size={15} />
            <b>{state.waste}</b> wasted
          </span>
        </div>
        <button disabled={!run || busy} onClick={openReplay}>
          <History size={15} />
          Rewind & replay
        </button>
      </footer>
      {run && (
        <AchievementBanner
          key={run.id}
          state={live}
          hidden={!!panel || intro}
          replaying={!!history}
          onOpen={() => setPanel("achievements")}
        />
      )}
      {error && (
        <div className="toast" role="alert">
          <AlertCircle size={19} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {intro && (
        <WelcomeDialog
          loading={loading}
          busy={busy}
          canStart={!!run && !history}
          jevConfigured={!!run?.jevConfigured}
          onAchievements={() => {
            closeIntro();
            setPanel("achievements");
          }}
          onClose={closeIntro}
          onStart={startFromIntroduction}
        />
      )}
      {panel && (
        <>
          <button
            className="drawer-scrim"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            data-dialog
            className={
              "drawer " +
              (panel === "achievements"
                ? "achievements-window"
                : panel === "business" || panel === "upgrades"
                  ? "business-window" +
                    (panel === "upgrades" ? " upgrades-window" : "")
                  : panel === "engineering"
                    ? "wide"
                    : "")
            }
            aria-label={
              panel === "achievements"
                ? "Achievements"
                : panel === "upgrades"
                  ? "Upgrades"
                  : panel === "business"
                    ? "Live business"
                    : panel === "setbacks"
                      ? "Controls"
                      : panel === "inspect"
                        ? "Decision inspector"
                        : panel === "about"
                          ? "About the builder"
                          : "Engineering details"
            }
          >
            <div className="drawer-header">
              <span className="eyebrow">
                {panel === "achievements"
                  ? "A CAREER WORTH CELEBRATING"
                  : panel === "upgrades"
                    ? "UPGRADES"
                    : panel === "business"
                      ? "LIVE FROM THE ISLANDS"
                      : panel === "setbacks"
                        ? "CONTROLS"
                        : panel === "inspect"
                          ? "DECISIONS & RESULTS"
                          : panel === "engineering"
                            ? "HOW IT WORKS"
                            : "THE PERSON BEHIND THE ISLAND"}
              </span>
              <button
                className="icon-button"
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <X size={21} />
              </button>
            </div>
            {panel === "achievements" ? (
              <Achievements
                state={state}
                replaying={!!history}
                onNewRun={() => restart(controller)}
                busy={busy}
              />
            ) : panel === "business" || panel === "upgrades" ? (
              <Suspense fallback={<p>Opening panel…</p>}>
                <EmpireConsole
                  key={panel}
                  mode={panel === "upgrades" ? "upgrades" : "business"}
                  state={state}
                  act={act}
                  locked={locked}
                  thinking={run?.thinking && !history}
                  onInspect={() => setPanel("inspect")}
                  followTarget={followTarget}
                  onFollow={(target) => {
                    setFollowTarget(target);
                    setPanel(null);
                    document.querySelector(".world-panel")?.scrollIntoView({
                      behavior: reduced ? "instant" : "smooth",
                      block: "center",
                    });
                  }}
                />
              </Suspense>
            ) : panel === "setbacks" ? (
              <>
                <h2>Controls</h2>
                <SetbacksPanel state={state} act={act} locked={locked} />
              </>
            ) : panel === "inspect" ? (
              <InspectorPanel
                live={live}
                busy={busy}
                returnToOriginal={returnToOriginal}
                state={state}
                branch={branch}
                openReplay={openReplay}
              />
            ) : panel === "engineering" ? (
              <EngineeringPanel
                controller={controller}
                busy={busy}
                restart={restart}
                run={run}
                state={state}
              />
            ) : (
              <AboutPanel setPanel={setPanel} />
            )}
          </aside>
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
