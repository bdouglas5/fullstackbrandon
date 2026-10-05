import { brandonResting } from "../../shared/business-hours.js";
import { Construction, CircleAlert, ChevronRight } from "../icons.js";
const clockLabel = (ticks) => {
  const minutes = Math.max(0, Math.round(ticks)),
    h = Math.floor(minutes / 60);
  return h ? `${h}h ${minutes % 60}m` : `${minutes % 60}m`;
};
export default function SetbacksPanel({ state, locked, act }) {
  const creature = state.hazards?.creature,
    holds = [
      state.brandon?.voyage?.held && {
        target: "brandon",
        label: "Brandon's boat",
        hold: state.brandon.voyage.held,
      },
      ...(state.operations?.shipments || []).map(
        (x) =>
          x.held && { target: x.id, label: "The cargo boat", hold: x.held },
      ),
    ].filter(Boolean);
  const pickles =
    (state.cafe || 0) +
    (state.operations?.oldWarehouse || 0) +
    (state.harbor || 0) +
    (state.carry || 0);
  const spills = (state.hazards?.spills || []).filter((o) => !o.cleanedAt);
  const kit = state.tools?.spill_kit;
  const challenges = [
    [
      "traffic",
      Construction,
      state.traffic,
      "Clear the road",
      "Block market road",
      "Close the eastern road. Deliveries take the northern route until you clear it.",
      "coral",
    ],
    [
      "puncture",
      CircleAlert,
      state.flatTire,
      "Tire needs a patch",
      "Puncture a van tire",
      "Brandon must stop and repair the van before continuing his deliveries.",
      "coral",
    ],
  ];
  return (
    <div className="setbacks-panel">
      <section className="environment-controls" aria-label="Weather controls">
        <h3>Weather & atmosphere</h3>
        <p>
          Weather changes on its own. Creative controls below last three world
          hours, then the automatic cycle resumes.
        </p>
        <small role="status">
          {state.environment?.weatherUntil > state.tick
            ? `Temporary ${state.environment.weatherOverride} · automatic weather in ${clockLabel(state.environment.weatherUntil - state.tick)}`
            : `Automatic weather · ${state.world?.weather || "clear"}`}
        </small>
        {[
          ["clear", "Clear weather"],
          ["cloudy", "Clouds"],
          ["rain", "Rain"],
          ["storm", "Thunderstorm"],
          ["auto", "Resume automatic weather"],
        ].map(([value, label]) => (
          <button
            key={value}
            className="weather-toggle"
            aria-pressed={
              value === "auto"
                ? !state.environment?.weatherOverride
                : state.environment?.weatherOverride === value
            }
            disabled={locked}
            onClick={() => act("environment", { key: "weather", value })}
          >
            <b>{label}</b>
          </button>
        ))}
        <button
          className="weather-toggle"
          aria-pressed={!!state.environment?.soundEnabled}
          disabled={locked}
          onClick={() =>
            act("environment", {
              key: "soundEnabled",
              value: !state.environment?.soundEnabled,
            })
          }
        >
          <b>Thunder sound</b>
          <span>{state.environment?.soundEnabled ? "On" : "Off"}</span>
        </button>
      </section>
      <section className="environment-controls">
        <h3>Time</h3>
        <p>
          Let the day unfold, or move through Brandon’s rest to the next
          morning.
        </p>
        <button
          className="secondary-button"
          disabled={
            locked ||
            !brandonResting(state) ||
            !!state.daytimeUntil ||
            state.world?.phase === "day"
          }
          onClick={() => act("daytime")}
        >
          {state.daytimeUntil ? "Transitioning to daytime…" : "Go to daytime"}
        </button>
      </section>
      <section className="environment-controls">
        <h3>Zombies</h3>
        <p>Spawn a slow-moving zombie for Brandon to handle.</p>
        <button
          className="secondary-button"
          disabled={
            locked || (state.zombies || []).filter((z) => z.hp > 0).length >= 5
          }
          onClick={() => act("spawn_zombie")}
        >
          Spawn Zombie · {(state.zombies || []).filter((z) => z.hp > 0).length}
          /5
        </button>
      </section>
      <section className="environment-controls" aria-label="Harbor creature">
        <h3>Harbor creature’s toll</h3>
        <p>
          Something purple lurks beneath the harbor. While awake, it reaches up
          and holds Brandon’s sailboat or the cargo boat for 1.5 to 2 hours.
          Wait, or pay pickles to keep moving.
        </p>
        <button
          className={"secondary-button " + (creature?.enabled ? "is-on" : "")}
          aria-pressed={!!creature?.enabled}
          disabled={locked}
          onClick={() => act("creature")}
        >
          {creature?.enabled ? "Let the creature sleep" : "Wake the creature"}
        </button>
        {holds.map(({ target, label, hold }) => (
          <div className="toll-row" key={target}>
            <span>
              <b>{label}</b>
              <small>
                {hold.status === "holding"
                  ? `Held · lets go in about ${clockLabel(hold.until - state.tick)}`
                  : "Letting go…"}
              </small>
            </span>
            <button
              className="secondary-button"
              disabled={locked || hold.status !== "holding" || pickles < 6}
              onClick={() => act("pay_toll", target)}
            >
              Pay 6 pickles
            </button>
          </div>
        ))}
        {!!holds.length && pickles < 6 && (
          <small>Not enough pickles for the toll ({pickles}/6).</small>
        )}
        {!!creature?.grabs && (
          <small>
            {creature.grabs} grabs · {creature.paid} tolls paid
          </small>
        )}
      </section>
      <section className="environment-controls" aria-label="Oil spill">
        <h3>Oil spill</h3>
        <p>
          A spill appears at a random spot on the street. Anything on the ground
          that hits it spins out and sits dazed, except rocket skates. It stays
          for a full day unless Brandon has the spill kit to scrub it away.
        </p>
        <button
          className="secondary-button"
          disabled={locked || spills.length >= 6}
          onClick={() => act("place_oil")}
        >
          Spill oil on a road · {spills.length}/6
        </button>
        <small>
          {kit
            ? `Spill kit${kit === 2 ? " Pro" : ""} ready: Brandon stops and cleans oil in his path.`
            : "Brandon has no spill kit yet: craft or buy one in the workshop."}
          {state.hazards?.slips
            ? ` · ${state.hazards.slips} spin-outs, ${state.hazards.cleaned || 0} cleaned`
            : ""}
        </small>
      </section>
      <h3>Town challenges</h3>
      {challenges.map(([type, Icon, active, on, off, description, color]) => (
        <button
          key={type}
          className={"challenge-button " + (active ? "is-active" : "")}
          disabled={
            locked ||
            (type === "puncture" &&
              (active || !state.vehicles?.includes("van")))
          }
          onClick={() => act(type)}
        >
          <span className={"challenge-icon " + color}>
            <Icon size={18} />
          </span>
          <span>
            <b>{active ? on : off}</b>
            <small>{description}</small>
          </span>
          <ChevronRight size={14} />
        </button>
      ))}
    </div>
  );
}
