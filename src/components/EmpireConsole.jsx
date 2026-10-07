import DefensePanel from "./DefensePanel.jsx";
import { useState, useEffect, useRef } from "react";
import {
  Send,
  Wrench,
  Store,
  Coins,
  Sparkles,
  Users,
  MapPin,
  ScanEye,
  Check,
} from "../icons.js";
import {
  TOOLS,
  PEOPLE,
  ACTIONS,
  capacity,
  ISLANDS,
  TRANSPORT,
} from "../../shared/engine.js";
import ProductArt from "./ProductArt.jsx";
import OperationsPanel, { WorkSchedule } from "./OperationsPanel.jsx";

const BUSINESS_TABS = [
  ["operations", Store, "Operations & Dispatch"],
  ["businesses", MapPin, "Businesses & Islands"],
  ["reviews", Sparkles, "Reviews"],
];
const UPGRADE_TABS = [
  ["defense", Wrench, "Defense"],
  ["crew", Users, "Crew"],
  ["workshop", Wrench, "Gadget workshop"],
  ["fleet", Store, "Fleet"],
];
const money = (value) => Math.floor(value || 0).toLocaleString();
function Stars({ rating }) {
  return (
    <span
      className="review-stars"
      aria-label={`${Number(rating).toFixed(1)} out of 5 stars`}
    >
      <span aria-hidden="true">
        {"★".repeat(Math.round(rating))}
        <i>{"★".repeat(5 - Math.round(rating))}</i>
      </span>
    </span>
  );
}
function CrewAvatar({ color = "#71977a", brandon = false }) {
  return (
    <svg className="crew-portrait" viewBox="0 0 120 100" aria-hidden="true">
      <circle cx="60" cy="49" r="44" fill="#e4edd7" />
      <path d="M27 100V80q1-21 32-21t34 21v20" fill={color} />
      <path d="M51 54h19v20q-8 7-19 0" fill="#d8a984" />
      <ellipse cx="61" cy="40" rx="23" ry="27" fill="#e9b894" />
      <path d="M38 36V23q8-16 32-8l14 11v13l-10-12-19-2-7 12Z" fill="#3f4740" />
      <path
        d="m42 48 8 10h20l11-10v14q-19 18-37-2Z"
        fill={brandon ? "#4f5143" : "#d9a77f"}
      />
      <path
        d="M49 40h7m11 0h7"
        stroke="#3f4740"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M42 81h35v19H42Z" fill="#c2d292" />
      <path d="M47 73v12m29-12v12" stroke="#c2d292" strokeWidth="5" />
      <path d="M54 88h14v7H54Z" fill="#e8efd6" />
    </svg>
  );
}
function Reviews({ state }) {
  const reviews = state.reviews || [];
  const rating = state.rating?.average || 0;
  const count = state.rating?.count || reviews.length;
  return (
    <div className="reviews-layout">
      <aside className="rating-summary">
        <span className="eyebrow">CUSTOMER RATINGS</span>
        <div className="rating-number">
          {count ? rating.toFixed(1) : "—"}
          <small>/ 5</small>
        </div>
        <Stars rating={rating} />
        <p>{count ? `${count} customer reviews` : "No reviews yet."}</p>
        <div className="rating-bars">
          {[5, 4, 3, 2, 1].map((n) => {
            const matches = reviews.filter(
              (r) => Math.round(r.rating) === n,
            ).length;
            return (
              <div key={n}>
                <span>{n} ★</span>
                <span className="rating-bar">
                  <i
                    style={{
                      width: `${reviews.length ? (matches / reviews.length) * 100 : 0}%`,
                    }}
                  />
                </span>
                <b>{matches}</b>
              </div>
            );
          })}
        </div>
      </aside>
      <div className="review-feed" aria-label="Customer reviews">
        {reviews.length ? (
          reviews
            .slice()
            .reverse()
            .map((review) => (
              <article className="review-card" key={review.id}>
                <div className="review-heading">
                  <span className="review-avatar">
                    {review.name?.[0] || "C"}
                  </span>
                  <div>
                    <b>{review.name}</b>
                    <small>
                      {review.role} ·{" "}
                      {ISLANDS[review.island]?.name ||
                        (review.island === "reef"
                          ? "Reef Island"
                          : "Home islands")}
                    </small>
                  </div>
                  <Stars rating={review.rating} />
                </div>
                <blockquote>“{review.text}”</blockquote>
                <div className="review-evidence">
                  <span>
                    <Check size={12} />
                    {review.orders} lifetime orders
                  </span>
                  <span>Last 3: {review.onTime} on time</span>
                  <span>
                    {review.averageWait <= 165
                      ? "Comfortably on schedule"
                      : review.averageWait <= 240
                        ? "A little behind schedule"
                        : "Longer than expected"}
                  </span>
                  {review.courier && (
                    <span>Latest delivery: {review.courier}</span>
                  )}
                </div>
              </article>
            ))
        ) : (
          <div className="console-empty">
            <span className="empty-symbol">✦</span>
            <h3>Reviews follow repeat orders.</h3>
            <p>
              Let the business run. Customer feedback will show which deliveries
              went well and which took too long.
            </p>
            <div className="empty-review-preview" aria-hidden="true">
              <span>★★★★★</span>
              <i />
              <i />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Crew({ state, locked, prioritize, followTarget, onFollow }) {
  const crew = state.crew || [];
  return (
    <>
      <div className="console-heading">
        <b>{crew.length} / 3 hired</b>
      </div>
      <div className="crew-grid">
        <article className="crew-card founder">
          <CrewAvatar brandon />
          <span className="eyebrow">FOUNDER</span>
          <h3>Fullstack Brandon</h3>
          <WorkSchedule state={state} compact />
          <div className="crew-wellbeing">
            <b>{state.brandon.wellbeing?.status || "Content"}</b>Morale{" "}
            {Math.round(state.brandon.wellbeing?.morale ?? 82)} / 100 · Fatigue{" "}
            {Math.round(state.brandon.wellbeing?.fatigue || 0)} / 100
          </div>
          <p>
            {ACTIONS[state.brandon.action]?.verb ||
              "Ready for the next delivery."}
          </p>
          <div className="crew-stats">
            <span>
              <b>{state.brandon.deliveries || 0}</b> deliveries
            </span>
            <span>
              <b>{money(state.brandon.earned)}</b> earned
            </span>
          </div>
          <button
            className="secondary-button"
            aria-pressed={followTarget === "brandon"}
            onClick={() => onFollow("brandon")}
          >
            <ScanEye size={15} />
            Follow Brandon
          </button>
        </article>
        {crew.map((person) => (
          <article className="crew-card" key={person.id}>
            <CrewAvatar color={person.color} />
            <span className="eyebrow">
              COURIER · {Math.round(person.efficiency * 100)}% PACE
            </span>
            <h3>{person.name}</h3>
            <span className="crew-wage">
              {person.wagePerDay || 0} coins / day
              {person.wageArrears > 0 && ` · ${money(person.wageArrears)} owed`}
            </span>
            <div className="crew-wellbeing">
              <b>{person.wellbeing?.status || "Content"}</b>
              Morale {Math.round(person.wellbeing?.morale ?? 82)} / 100 ·
              Fatigue {Math.round(person.wellbeing?.fatigue || 0)} / 100
              <br />
              {person.labor?.status?.replaceAll("_", " ") ||
                "Ready for a shift"}
            </div>
            <p>
              {ACTIONS[person.action]?.verb ||
                (person.orderId
                  ? "A wholesale order is on the way."
                  : "Looking for the next delivery.")}
            </p>
            <div className="crew-stats">
              <span>
                <b>{person.deliveries || 0}</b> deliveries
              </span>
              <span>
                <b>{money(person.earned)}</b> earned
              </span>
            </div>
            <div className="crew-transport">
              <span className="eyebrow">PERSONAL TRANSPORT</span>
              <p>
                {person.vehicles?.length
                  ? person.vehicles
                      .map((id) => TRANSPORT[id]?.name || id)
                      .join(" · ")
                  : "Walking · no vehicle purchased yet"}
              </p>
              <label>
                Buy transport for {person.name}
                <select
                  aria-label={`Buy transport for ${person.name}`}
                  disabled={locked}
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      prioritize(`buy_${person.id}_${event.target.value}`);
                  }}
                >
                  <option value="">Choose next investment…</option>
                  {Object.entries(TRANSPORT)
                    .filter(([id]) => !person.vehicles?.includes(id))
                    .map(([id, vehicle]) => (
                      <option value={id} key={id}>
                        {vehicle.name} · {vehicle.price} coins
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button
              className="secondary-button"
              aria-pressed={followTarget === person.id}
              onClick={() => onFollow(person.id)}
            >
              <ScanEye size={15} />
              Follow {person.name}
            </button>
          </article>
        ))}
        {crew.length < 3 && (
          <article className="crew-card crew-opening">
            <div className="crew-hire-mark">
              <Users size={38} />
            </div>
            <span className="eyebrow">GROW THE CREW</span>
            <h3>Hire another courier.</h3>
            <p>
              A courier collects orders from the business and delivers them.
              Build the Pickle office to unlock hiring. Budget{" "}
              {6 + crew.length * 2} coins each day, plus their transport.
            </p>
            <button
              className="secondary-button"
              disabled={locked || state.office?.stage !== "complete"}
              onClick={() => prioritize("hire_employee")}
            >
              {state.office?.stage !== "complete"
                ? "Build the office first"
                : `Hire next · ${80 + crew.length * 40} coins`}
            </button>
          </article>
        )}
      </div>
    </>
  );
}
export default function EmpireConsole({
  mode = "business",
  state,
  act,
  locked,
  thinking,
  onInspect,
  followTarget,
  onFollow,
}) {
  const [tab, setTab] = useState(
      mode === "upgrades" ? "defense" : "operations",
    ),
    [message, setMessage] = useState("");
  const feed = useRef();
  const messages = state.dispatch || [];
  const request = (text) => act("chat", text);
  const prioritize = (action) => act("prefer", action);
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages.length, thinking, tab]);
  return (
    <section className="empire-console" id="empire-console">
      <header>
        <div>
          <h2>{mode === "upgrades" ? "Upgrades" : "Business"}</h2>
        </div>
        <div className="economy-badge">
          <Coins size={18} />
          <b>{money(state.money)}</b> coins
          <span>· {state.scrap || 0} reclaimed plastic</span>
        </div>
      </header>
      <nav
        className="console-tabs"
        aria-label={
          mode === "upgrades" ? "Upgrade categories" : "Empire console"
        }
      >
        {(mode === "upgrades" ? UPGRADE_TABS : BUSINESS_TABS).map(
          ([id, Icon, name]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              aria-pressed={tab === id}
              aria-label={name}
              onClick={() => setTab(id)}
            >
              <Icon size={16} />
              {name}
              {id === "reviews" && state.rating?.count > 0 ? (
                <span className="tab-count">
                  {state.rating.average.toFixed(1)} ★
                </span>
              ) : null}
            </button>
          ),
        )}
      </nav>
      {state.request && (
        <div className="priority-banner" role="status">
          <Check size={15} />
          <span>
            <b>
              Next priority: {ACTIONS[state.request]?.label || state.request}.
            </b>{" "}
            Brandon will earn what he needs first.
          </span>
        </div>
      )}
      <div className="console-content">
        {tab === "operations" && (
          <section className="order-queue" aria-label="Pending orders">
            <div className="section-heading">
              <h3>Pending orders</h3>
              <span>{state.customerQueue?.length || 0}</span>
            </div>
            <ol className="fulfillment-list">
              {[...(state.customerQueue || [])]
                .sort((a, b) => (a.arrived || 0) - (b.arrived || 0))
                .map((order) => (
                  <li key={order.id}>
                    <div>
                      <b>{order.role || order.name}</b>
                      <small>
                        {order.name} ·{" "}
                        {ISLANDS[order.island]?.name || "Home islands"}
                      </small>
                    </div>
                    <span>
                      {order.cases || 1}{" "}
                      {(order.cases || 1) === 1 ? "case" : "cases"}
                    </span>
                    <span className="order-tag">
                      {order.assigned
                        ? "In delivery"
                        : order.requires && !state.tools?.[order.requires]
                          ? `Needs ${TOOLS[order.requires]?.name || order.requires}`
                          : "Awaiting dispatch"}
                    </span>
                  </li>
                ))}
            </ol>
            {!state.customerQueue?.length && <p>No pending orders.</p>}
            <details className="experiment-drawer">
              <summary>
                Recent fulfilled orders ({state.customerHistory?.length || 0})
              </summary>
              {state.customerHistory
                ?.slice(-12)
                .reverse()
                .map((customer) => (
                  <p className="console-note" key={customer.id}>
                    {customer.role} · {customer.cases || 1}{" "}
                    {(customer.cases || 1) === 1 ? "case" : "cases"} ·{" "}
                    {customer.order} · +{customer.paid} coins
                  </p>
                ))}
            </details>
          </section>
        )}
        {tab === "operations" && (
          <details className="console-section">
            <summary>Live dispatch</summary>
            <div className="dispatch-layout">
              <div>
                <div
                  ref={feed}
                  className="dispatch-feed"
                  role="log"
                  aria-label="Live dispatch conversation"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  <article className="chat-message brandon">
                    <b>
                      Fullstack Brandon<small>BUSINESS UPDATES</small>
                    </b>
                    <p>
                      I deliver pickles, use the earnings to expand, and work
                      toward retirement. You can suggest my next purchase below.
                    </p>
                  </article>
                  {messages.slice(-18).map((m, i) => (
                    <article
                      key={`${m.tick}-${i}`}
                      className={"chat-message " + m.role}
                    >
                      <b>
                        {m.role === "visitor" ? "You" : "Fullstack Brandon"}
                        <small>
                          {m.role === "visitor"
                            ? "YOUR GUIDANCE"
                            : m.source === "jev"
                              ? "AI DECISION"
                              : m.source === "rules"
                                ? "DECISION"
                                : "BUSINESS UPDATE"}
                        </small>
                      </b>
                      <p>{m.text}</p>
                    </article>
                  ))}
                  {thinking && (
                    <article className="chat-message brandon thinking">
                      <b>
                        Choosing the next move
                        <span className="thinking-dots">•••</span>
                      </b>
                    </article>
                  )}
                </div>
                <form
                  className="dispatch-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (message.trim()) {
                      request(message.trim());
                      setMessage("");
                    }
                  }}
                >
                  <input
                    aria-label="Message Brandon"
                    placeholder="Try “Buy a bike next” or “Hire an employee”…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={240}
                    disabled={locked}
                  />
                  <button
                    aria-label="Send dispatch message"
                    disabled={locked || !message.trim()}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
              <aside className="dispatch-brief">
                <span className="eyebrow">YOUR NEXT MOVE</span>
                <h3>Choose what he works toward.</h3>
                {[
                  "Buy a bicycle",
                  "Hire an employee",
                  "Build the teleporter",
                  "Send in a storm",
                ].map((text) => (
                  <button
                    className="secondary-button"
                    disabled={locked}
                    key={text}
                    onClick={() => request(text)}
                  >
                    {text}
                    <span>↗</span>
                  </button>
                ))}
                <button className="text-button" onClick={onInspect}>
                  See decisions and results →
                </button>
                {state.request && (
                  <div className="queued-priority">
                    <span className="eyebrow">YOUR NEXT PRIORITY</span>
                    <b>{ACTIONS[state.request]?.label || state.request}</b>
                  </div>
                )}
              </aside>
            </div>
          </details>
        )}
        {tab === "defense" && (
          <DefensePanel state={state} act={act} locked={locked} />
        )}
        {tab === "reviews" && <Reviews state={state} />}
        {tab === "operations" && (
          <details className="console-section">
            <summary>Supply & production</summary>
            <OperationsPanel
              state={state}
              locked={locked}
              prioritize={prioritize}
            />
          </details>
        )}

        {tab === "crew" && (
          <Crew
            state={state}
            locked={locked}
            prioritize={prioritize}
            followTarget={followTarget}
            onFollow={onFollow}
          />
        )}
        {tab === "workshop" && (
          <section className="upgrade-category" aria-label="Gadget workshop">
            <>
              <div className="console-heading">
                <b>
                  {Object.keys(state.tools || {}).length} / 10 built ·{" "}
                  {capacity(state)} cargo slots
                </b>
              </div>
              <div className="tool-grid">
                {Object.entries(TOOLS).map(([id, tool]) => {
                  const level = state.tools?.[id] || 0;
                  return (
                    <article
                      key={id}
                      className={
                        "tool-card illustrated-card " + (level ? "owned" : "")
                      }
                    >
                      <ProductArt id={id} label={tool.name} />
                      <div className="product-info">
                        <span className="tool-status">
                          {level === 2
                            ? "✦ PRO QUALITY"
                            : level
                              ? "✓ BUILT"
                              : "NOT BUILT YET"}
                        </span>
                        <h3>{tool.name}</h3>
                        <p>{tool.effect}</p>
                        <small>
                          {tool.scrap} plastic pieces to craft · {tool.price}{" "}
                          coins to buy
                        </small>
                        <div className="product-actions">
                          {!level ? (
                            <>
                              <button
                                disabled={locked}
                                onClick={() => prioritize(`craft_${id}`)}
                                aria-label={`Suggest crafting ${tool.name}`}
                              >
                                Suggest crafting
                              </button>
                              <button
                                disabled={locked}
                                onClick={() => prioritize(`buy_${id}`)}
                                aria-label={`Suggest buying ${tool.name}`}
                              >
                                Suggest purchase
                              </button>
                            </>
                          ) : (
                            <button
                              disabled={locked || level === 2}
                              onClick={() => prioritize(`upgrade_${id}`)}
                              aria-label={`Upgrade ${tool.name} to Pro`}
                            >
                              {level === 2
                                ? "Fully upgraded"
                                : `Suggest Pro · ${tool.price * 2} coins`}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          </section>
        )}
        {tab === "fleet" && (
          <section className="upgrade-category" aria-label="Fleet">
            <>
              <div className="console-heading">
                <b>
                  {state.vehicles?.length || 0} /{" "}
                  {Object.keys(TRANSPORT).length} owned
                </b>
              </div>
              <div className="fleet-routing">
                <span>
                  {state.preferredTransport
                    ? `Preferred island transport: ${TRANSPORT[state.preferredTransport]?.name || state.preferredTransport}`
                    : "Brandon chooses the best available transport for each trip."}
                </span>
                <button
                  className="text-button"
                  disabled={locked}
                  onClick={() => prioritize("auto_transport")}
                >
                  Choose transport automatically
                </button>
              </div>
              <div className="fleet-grid">
                {Object.entries(TRANSPORT).map(([id, vehicle], index) => {
                  const owned = state.vehicles?.includes(id);
                  const action = {
                    bike: "ride_bike",
                    van: "drive_van",
                    rocket_skates: "use_rocket_skates",
                    sailboat: "use_sailboat",
                    helicopter: "use_helicopter",
                    jetpack: "use_jetpack",
                    teleporter: "use_teleporter",
                  }[id];
                  return (
                    <article
                      className={
                        "fleet-card illustrated-card " + (owned ? "owned" : "")
                      }
                      key={id}
                    >
                      <ProductArt id={id} label={vehicle.name} />
                      <div className="product-info">
                        <span className="tool-status">
                          {owned
                            ? "✓ IN THE FLEET"
                            : `0${index + 1} / NOT OWNED`}
                        </span>
                        <h3>{vehicle.name}</h3>
                        <p>{vehicle.effect}</p>
                        <div className="vehicle-specs">
                          <span>{vehicle.capacity} cargo slots</span>
                          <span>{vehicle.price} coins</span>
                        </div>
                        <button
                          className="secondary-button"
                          disabled={locked || (owned && !ACTIONS[action])}
                          onClick={() =>
                            prioritize(owned ? action : `buy_${id}`)
                          }
                          aria-pressed={
                            owned
                              ? state.preferredTransport === id ||
                                state.vehicle === id
                              : undefined
                          }
                          aria-label={
                            owned
                              ? `Use ${vehicle.name}`
                              : `Suggest buying ${vehicle.name}`
                          }
                        >
                          {owned
                            ? state.preferredTransport === id ||
                              state.vehicle === id
                              ? "Preferred for deliveries"
                              : "Use this transport"
                            : "Suggest next purchase"}
                          <span>↗</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <section className="upgrade-experiments">
                <h3>Give the business a head start</h3>

                <div className="fleet-footer">
                  <button
                    className="secondary-button"
                    disabled={locked || state.grants >= 2}
                    onClick={() => act("grant")}
                  >
                    <Sparkles size={16} />
                    Gift 40 coins ({state.grants || 0}/2)
                  </button>
                  {["bike", "helicopter"].map((id) => (
                    <button
                      key={id}
                      className="secondary-button"
                      disabled={locked || state.vehicles?.includes(id)}
                      onClick={() => act("gift", id)}
                    >
                      Gift a {id}
                    </button>
                  ))}
                </div>
              </section>
            </>
          </section>
        )}
        {tab === "businesses" && (
          <details className="console-section">
            <summary>Businesses</summary>
            <>
              <div className="console-heading">
                <b>{state.served} fulfilled</b>
              </div>
              <div className="business-grid">
                {PEOPLE.filter(
                  (person) =>
                    state.discoveredBusinesses?.includes(person.id) ||
                    state.customerQueue?.some(
                      (c) => c.customerId === person.id,
                    ) ||
                    state.customerStats?.[person.id],
                ).map((person) => {
                  const stats =
                    state.customerStats?.[person.id || person.name] || {};
                  return (
                    <article
                      className="business-card"
                      key={person.id || person.name}
                    >
                      <div
                        className="business-avatar"
                        style={{ background: person.color }}
                      >
                        {person.name[0]}
                      </div>
                      <div>
                        <small>
                          {person.name} ·{" "}
                          {ISLANDS[person.island]?.name ||
                            (person.island === "reef"
                              ? "Reef Island"
                              : "Home islands")}
                        </small>
                        <h3>{person.role}</h3>
                        <b>{person.order}</b>
                        <p>{person.detail}</p>
                        <span className="order-tag">
                          {stats.orders || 0} completed orders
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          </details>
        )}
        {tab === "businesses" && (
          <details className="console-section">
            <summary>Islands</summary>
            <>
              <div className="console-heading">
                <b>{Object.keys(state.outposts || {}).length} / 5 outposts</b>
              </div>
              <div className="business-grid">
                {Object.entries(ISLANDS).map(([id, island]) => (
                  <article className="island-card" key={id}>
                    <div
                      className={`island-postcard postcard-${id}`}
                      style={{ "--island-color": island.color }}
                      aria-hidden="true"
                    >
                      <span className="postcard-sun" />
                      <span className="postcard-land" />
                      <span className="postcard-land second" />
                      <i />
                      <b>{island.name}</b>
                    </div>
                    <div className="product-info">
                      <span className="eyebrow">{island.business}</span>
                      <h3>{island.name}</h3>
                      <p>{island.description}</p>
                      <small>
                        Optional storage · {island.price} coins to open
                      </small>
                      {state.outposts?.[id] ? (
                        <>
                          <p>
                            {state.outposts[id].stock} cases in stock ·{" "}
                            {money(state.outposts[id].earned)} earned
                          </p>
                          <div className="product-actions">
                            <button
                              disabled={locked}
                              onClick={() => prioritize(`supply_${id}`)}
                            >
                              Send by sea
                            </button>
                            <button
                              disabled={locked}
                              onClick={() => prioritize(`air_${id}`)}
                            >
                              Send by air
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="product-actions">
                          <button
                            disabled={locked}
                            onClick={() => prioritize(`expand_${id}`)}
                          >
                            Open storage · {island.price} coins
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          </details>
        )}
      </div>
    </section>
  );
}
