import { useEffect, useRef, useState } from "react";
import {
  Trophy,
  X,
  Package,
  Coins,
  Users,
  Store,
  Leaf,
  Truck,
  Wrench,
  Waves,
  Zap,
  Coffee,
  CloudRain,
  BatteryCharging,
  ScanEye,
  MapPin,
  PlugZap,
  ShieldCheck,
  Construction,
  RotateCcw,
  Expand,
  CircleHelp,
  Sparkles,
} from "../icons.js";
import Bike from "lucide-react/dist/esm/icons/bike.js";
import Plane from "lucide-react/dist/esm/icons/plane.js";
import Sailboat from "lucide-react/dist/esm/icons/sailboat.js";
import Rocket from "lucide-react/dist/esm/icons/rocket.js";
import Snowflake from "lucide-react/dist/esm/icons/snowflake.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Minus from "lucide-react/dist/esm/icons/minus.js";
import { createAchievementMap } from "../lib/achievement-map.js";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  BRANCHES,
  achievementDiscovery,
} from "../../shared/achievements.js";
import "./achievements.css";

export function AchievementBanner({ state, hidden, replaying, onOpen }) {
  const seen = useRef(null);
  const [queue, setQueue] = useState([]);
  const [hovered, setHovered] = useState(false);
  const unlocked = state.achievements?.unlocked;
  useEffect(() => {
    const ids = Object.keys(unlocked || {});
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter(
      (id) =>
        !seen.current.has(id) &&
        ACHIEVEMENT_BY_ID[id] &&
        !unlocked[id].backfilled,
    );
    ids.forEach((id) => seen.current.add(id));
    if (replaying) setQueue([]);
    else if (added.length) setQueue((q) => [...q, ...added]);
  }, [unlocked, replaying]);
  useEffect(() => {
    if (hidden || replaying) setHovered(false);
  }, [hidden, replaying]);
  const current = queue[0];
  useEffect(() => {
    if (!current || hidden || hovered || replaying) return;
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), 6000);
    return () => clearTimeout(timer);
  }, [current, hidden, hovered, replaying]);
  const achievement = ACHIEVEMENT_BY_ID[current];
  return (
    <div
      className="achievement-announcer"
      aria-live="polite"
      aria-atomic="true"
    >
      {achievement && !hidden && !replaying && (
        <div
          className="achievement-banner"
          key={current}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false);
          }}
        >
          <span className="achievement-medal">
            <Trophy size={23} />
          </span>
          <button className="achievement-banner-content" onClick={onOpen}>
            <span className="eyebrow">
              ACHIEVEMENT UNLOCKED
              {queue.length > 1 ? ` · +${queue.length - 1} queued` : ""}
            </span>
            <strong>{achievement.title}</strong>
            <span>One step closer to retirement · View achievements</span>
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss achievement"
            onClick={() => {
              setQueue((q) => q.slice(1));
              setHovered(false);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const MAP = createAchievementMap();
const BRANCH_ICONS = {
  service: Package,
  gadgets: Wrench,
  fleet: Truck,
  team: Users,
  business: Store,
  islands: Waves,
  retirement: Trophy,
};
const COLORS = {
  service: "#83bfa2",
  gadgets: "#d9b570",
  fleet: "#85b8d5",
  team: "#c19acf",
  business: "#d6977a",
  islands: "#7ec4bc",
  retirement: "#e3cc76",
};
function trophyIcon(a) {
  if (a.hub) return a.id === "journey" ? Coffee : BRANCH_ICONS[a.branch];
  const id = a.id;
  if (id.startsWith("orders")) return Package;
  if (id.startsWith("cases")) return Truck;
  if (id.startsWith("revenue") || id.startsWith("savings")) return Coins;
  if (id.includes("bike") || id.includes("skates")) return Bike;
  if (id.includes("helicopter")) return Plane;
  if (id.includes("sailboat")) return Sailboat;
  if (id.includes("jetpack")) return Rocket;
  if (id.includes("teleporter")) return Sparkles;
  if (id.includes("van")) return Truck;
  if (id.includes("rain")) return CloudRain;
  if (id.includes("cooler")) return Snowflake;
  if (id.includes("solar")) return BatteryCharging;
  if (id.includes("scanner")) return ScanEye;
  if (id.includes("navigation")) return MapPin;
  if (id.includes("generator")) return PlugZap;
  if (id.includes("rack") || id.includes("dolly")) return Package;
  if (id.includes("repair") || id.includes("winch")) return Wrench;
  if (id.startsWith("pro-")) return ShieldCheck;
  if (id.startsWith("seed")) return Leaf;
  if (id === "night-service") return Coffee;
  if (id === "factory" || id === "expansion") return Construction;
  if (id.startsWith("production")) return Leaf;
  return BRANCH_ICONS[a.branch];
}

export default function Achievements({ state, replaying, onNewRun, busy }) {
  const viewport = useRef(null);
  const drag = useRef(null);
  const lastWidth = useRef(900);
  const suppressClick = useRef(false);
  const [size, setSize] = useState({ width: 900, height: 490 });
  const [camera, setCamera] = useState({
    x: 450 - MAP.branches.service.x,
    y: 32,
    scale: 1,
  });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [branch, setBranch] = useState("service");
  const collection = {
    ...state.achievementCollection?.unlocked,
    ...state.achievements?.unlocked,
  };
  const earned = ACHIEVEMENTS.filter((a) => collection[a.id]);
  const shown = MAP.nodes.filter((a) => {
    const x = camera.x + a.x * camera.scale,
      y = camera.y + a.y * camera.scale;
    return (
      x > -100 && x < size.width + 100 && y > -100 && y < size.height + 100
    );
  });
  useEffect(() => {
    const el = viewport.current;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
      const previousWidth = lastWidth.current;
      lastWidth.current = width;
      setCamera((c) =>
        width < 500 && previousWidth >= 500
          ? { ...c, x: width / 2 - MAP.byId["orders-1"].x * c.scale, y: -60 }
          : { ...c, x: c.x + (width - previousWidth) / 2 },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const minimumScale = Math.min(
    (size.width - 40) / MAP.width,
    (size.height - 40) / MAP.height,
    1,
  );
  const fittedCamera = (scale = minimumScale) => ({
    scale,
    x: (size.width - MAP.width * scale) / 2,
    y: (size.height - MAP.height * scale) / 2,
  });
  const fit = () => {
    setCamera(fittedCamera());
    setHovered(null);
    setSelected(null);
  };
  const bounded = (c) => ({
    ...c,
    x: Math.max(
      Math.min(40, size.width - MAP.width * c.scale - 40),
      Math.min(Math.max(40, size.width - MAP.width * c.scale - 40), c.x),
    ),
    y: Math.max(
      Math.min(40, size.height - MAP.height * c.scale - 40),
      Math.min(Math.max(40, size.height - MAP.height * c.scale - 40), c.y),
    ),
  });
  const move = (dx, dy) => {
    setCamera((c) => bounded({ ...c, x: c.x + dx, y: c.y + dy }));
    setHovered(null);
    setSelected(null);
  };
  const jump = (id) => {
    const a = MAP.byId[id];
    const destination =
      a.hub && size.width < 500
        ? MAP.nodes.find((n) => !n.hub && n.branch === a.branch)
        : a;
    setCamera((c) =>
      bounded({
        ...c,
        x: size.width / 2 - destination.x * c.scale,
        y: a.hub
          ? (size.width < 500 ? 100 : 120) - destination.y * c.scale
          : size.height / 2 - a.y * c.scale,
      }),
    );
    setHovered(null);
    setSelected(a.hub ? null : id);
    setBranch(a.branch);
  };
  const zoom = (delta) => {
    setCamera((c) => {
      const scale = Math.max(minimumScale, Math.min(3, c.scale * (1 + delta)));
      if (scale === minimumScale) return fittedCamera(scale);
      return {
        scale,
        x: size.width / 2 - ((size.width / 2 - c.x) * scale) / c.scale,
        y: size.height / 2 - ((size.height / 2 - c.y) * scale) / c.scale,
      };
    });
    setHovered(null);
    setSelected(null);
  };
  useEffect(() => {
    const el = viewport.current;
    const onWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      setCamera((c) => {
        const scale = Math.max(
          minimumScale,
          Math.min(3, c.scale * Math.exp(-delta * 0.002)),
        );
        if (scale === minimumScale) return fittedCamera(scale);
        return {
          scale,
          x: x - ((x - c.x) * scale) / c.scale,
          y: y - ((y - c.y) * scale) / c.scale,
        };
      });
      setHovered(null);
      setSelected(null);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [size.width, size.height, minimumScale]);
  const focused = MAP.byId[hovered || selected];
  const detail =
    focused && !focused.hub ? achievementDiscovery(focused, state) : null;
  const point = focused
    ? {
        x: Math.min(
          size.width - 244,
          Math.max(12, camera.x + focused.x * camera.scale + 35),
        ),
        y: Math.min(
          size.height - 160,
          Math.max(12, camera.y + focused.y * camera.scale - 28),
        ),
      }
    : null;
  return (
    <div className="achievements-panel">
      <div className="achievement-toolbar">
        <h2>
          Achievements{" "}
          <small>
            {earned.length} / {ACHIEVEMENTS.length}
          </small>
        </h2>
        <div className="achievement-map-controls">
          <button
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoom(-0.15)}
            disabled={camera.scale <= minimumScale}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoom(0.15)}
            disabled={camera.scale >= 3}
          >
            <Plus size={16} />
          </button>
          <button
            aria-label="Fit whole achievement tree"
            title="See the whole tree"
            onClick={fit}
          >
            <Expand size={16} />
          </button>
          <button
            aria-label="Center achievement tree"
            title="Back to the start"
            onClick={() => {
              setCamera({
                x:
                  size.width / 2 -
                  (size.width < 500
                    ? MAP.byId["orders-1"].x
                    : MAP.branches.service.x),
                y: size.width < 500 ? -60 : 32,
                scale: 1,
              });
              setBranch("service");
              setHovered(null);
              setSelected(null);
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <div className="achievement-stage">
        <nav
          className="achievement-map-shortcuts"
          aria-label="Achievement branches"
        >
          {BRANCHES.map(([id, title]) => {
            const Icon = BRANCH_ICONS[id];
            return (
              <button
                key={id}
                aria-label={title}
                title={title}
                aria-pressed={branch === id}
                style={{ "--trophy-color": COLORS[id] }}
                onClick={() => jump(`branch-${id}`)}
              >
                <Icon size={17} />
              </button>
            );
          })}
        </nav>
        <div
          ref={viewport}
          className={`achievement-viewport ${dragging ? "is-dragging" : ""}`}
          tabIndex={0}
          aria-label="Achievement tree. Drag to explore, or use arrow keys."
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            drag.current = {
              pointer: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              camera,
              moved: false,
            };
            suppressClick.current = false;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.pointer !== e.pointerId) return;
            if (e.pointerType === "mouse" && e.buttons === 0) {
              drag.current = null;
              setDragging(false);
              return;
            }
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 5) return;
            if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
            d.moved = true;
            suppressClick.current = true;
            setDragging(true);
            setHovered(null);
            setSelected(null);
            setCamera(
              bounded({ ...d.camera, x: d.camera.x + dx, y: d.camera.y + dy }),
            );
          }}
          onPointerUp={(e) => {
            if (drag.current?.pointer !== e.pointerId) return;
            drag.current = null;
            setDragging(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              e.stopPropagation();
              suppressClick.current = false;
            }
          }}
          onKeyDown={(e) => {
            const steps = {
              ArrowLeft: [100, 0],
              ArrowRight: [-100, 0],
              ArrowUp: [0, 100],
              ArrowDown: [0, -100],
            };
            if (steps[e.key]) {
              e.preventDefault();
              move(...steps[e.key]);
            } else if (e.key === "+" || e.key === "=") zoom(0.15);
            else if (e.key === "-") zoom(-0.15);
          }}
        >
          <div
            className="achievement-world"
            data-camera={`${camera.x},${camera.y},${camera.scale}`}
            style={{
              width: MAP.width,
              height: MAP.height,
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            }}
          >
            <svg
              className="achievement-connections"
              width={MAP.width}
              height={MAP.height}
              aria-hidden="true"
            >
              {MAP.edges.map(({ from, to }) => {
                const a = MAP.byId[from],
                  b = MAP.byId[to],
                  middle = (a.y + b.y) / 2;
                return (
                  <path
                    key={`${from}-${to}`}
                    className={collection[from] ? "is-lit" : ""}
                    d={`M ${a.x} ${a.y + 24} V ${middle} H ${b.x} V ${b.y - 24}`}
                  />
                );
              })}
            </svg>
            {shown.map((a) => {
              const p = a.hub ? null : achievementDiscovery(a, state);
              const Icon = p?.hidden ? CircleHelp : trophyIcon(a);
              const title = p?.hidden ? "???" : a.title;
              return (
                <button
                  key={a.id}
                  data-achievement={a.id}
                  className={`achievement-node ${a.hub ? "is-hub" : p.collected ? "is-earned" : p.hidden || p.blockedBy.length || !p.availableSeed ? "is-locked" : "is-available"} ${p?.hidden ? "is-hidden" : ""}`}
                  style={{
                    left: a.x,
                    top: a.y,
                    "--trophy-color": COLORS[a.branch],
                  }}
                  aria-label={title}
                  aria-pressed={selected === a.id}
                  aria-describedby={
                    (hovered || selected) === a.id
                      ? "achievement-tooltip"
                      : undefined
                  }
                  onMouseEnter={() => {
                    if (!drag.current?.moved) setHovered(a.id);
                  }}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(a.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => {
                    if (a.hub) setBranch(a.branch);
                    else {
                      setSelected((id) => (id === a.id ? null : a.id));
                      setBranch(a.branch);
                    }
                  }}
                >
                  <span className="achievement-token">
                    <Icon size={29} strokeWidth={1.8} />
                    {p?.collected && <b aria-label="Collected">✓</b>}
                  </span>
                  <span className="achievement-label">{title}</span>
                </button>
              );
            })}
          </div>
          {focused && !dragging && (
            <div
              id="achievement-tooltip"
              role="tooltip"
              className="achievement-tooltip"
              style={{ left: point.x, top: point.y }}
            >
              <strong>{detail?.hidden ? "Undiscovered" : focused.title}</strong>
              <p>
                {focused.hub
                  ? focused.id === "journey"
                    ? "One founder. Plenty of possibilities."
                    : `${ACHIEVEMENTS.filter((a) => a.branch === focused.branch && collection[a.id]).length} collected`
                  : detail.hidden
                    ? "Follow this path to reveal it."
                    : focused.description}
              </p>
              {detail && !detail.hidden && (
                <small>
                  {detail.collected
                    ? detail.earned
                      ? "✓ Earned this run"
                      : "✓ Collected in an earlier run"
                    : !detail.availableSeed
                      ? `Try seed ${42 + focused.seedClass}`
                      : `${detail.value.toLocaleString()} / ${focused.target.toLocaleString()}${detail.blockedBy.length ? " · Locked" : ""}`}
                </small>
              )}
            </div>
          )}
        </div>
        <span className="achievement-drag-hint">
          Drag to explore · Scroll to zoom
        </span>
        {replaying && <span className="achievement-replay">Replay moment</span>}
      </div>
      <div className="achievement-footer">
        <span>Seed {state.seed}</span>
        {!replaying && onNewRun && (
          <button
            disabled={busy}
            onClick={onNewRun}
            title="Start a new seed. Your collection carries over."
          >
            New business ↗
          </button>
        )}
      </div>
      <details className="achievement-earned-list">
        <summary>
          <Trophy size={14} /> Collected <span>{earned.length}</span>
        </summary>
        {earned.length ? (
          <ul>
            {earned.map((a) => {
              const Icon = trophyIcon(a);
              return (
                <li key={a.id}>
                  <button onClick={() => jump(a.id)}>
                    <Icon size={17} />
                    <span>{a.title}</span>
                    <small>✓</small>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Your first trophy is one delivery away.</p>
        )}
      </details>
    </div>
  );
}
