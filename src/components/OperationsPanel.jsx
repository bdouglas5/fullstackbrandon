import { ECONOMY } from "../../shared/engine.js";
import { Package, Leaf, Construction, Users } from "../icons.js";
import { VACATION_POLICY } from "../../shared/workweek.js";

const number = (value) => Math.floor(value || 0).toLocaleString();
const labels = {
  day_shift: "Day shift",
  night_deliveries: "Evening delivery round",
  rest: "Off duty",
  meal_break: "Lunch break",
  rest_break: "Paid rest break",
  off_duty: "Off duty",
  weekend: "Weekend at home",
  vacation: "Resort vacation",
  bbq: "Weekend BBQ",
};
const stageLabels = {
  unowned: "Negotiate the island",
  purchased: "Hire the contractor",
  survey: "Site survey",
  reclamation: "Build the island",
  foundation: "Lay foundations",
  building: "Build factory & greenhouse",
  complete: "Open for business",
};
export function WorkSchedule({ state, compact = false }) {
  const schedule = state.schedule || {};
  const labor = state.brandon?.labor || {};
  const phase =
    labor.status && labor.status !== "working" ? labor.status : schedule.phase;
  return (
    <div className={compact ? "work-schedule compact" : "work-schedule"}>
      <span className="operation-status">{labels[phase] || "Day shift"}</span>
      <span>
        {schedule.weekday || "Monday"} · 08:00–18:00 · 10-hour workday
      </span>
      {!compact && (
        <small>
          {schedule.nightDelivered || 0} / {schedule.nightQuota || 2} evening
          deliveries · overnight rest
        </small>
      )}
    </div>
  );
}
function Metric({ label, value, detail }) {
  return (
    <div className="operation-metric">
      <span>{label}</span>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}
function Suggest({ action, children, locked, prioritize, disabled }) {
  return (
    <button
      className="secondary-button"
      disabled={locked || disabled}
      onClick={() => prioritize(action)}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </button>
  );
}
function Quantity({ batches }) {
  return (
    <>
      {number(
        (batches || []).reduce((total, batch) => total + (batch.cases || 0), 0),
      )}
    </>
  );
}
export default function OperationsPanel({ state, locked, prioritize }) {
  const operations = state.operations || {};
  const production = state.production || {};
  const construction = state.construction || {};
  const schedule = state.schedule || {};
  const crew = state.crew || [];
  const workweek = state.brandon?.workweek || {};
  const vacation = state.workweek?.vacation;
  const payroll = crew.reduce(
    (total, person) => total + (person.wagePerDay || 0),
    0,
  );
  const arrears = crew.reduce(
    (total, person) => total + (person.wageArrears || 0),
    0,
  );
  const shipments = (operations.shipments || []).filter(
    (shipment) => shipment.status !== "unloaded",
  );
  const agreement = construction.deal || {};
  const negotiationPhase =
    state.brandon?.voyage?.purpose === "negotiation"
      ? state.brandon.voyage.phase
      : null;
  const complete = construction.stage === "complete";
  const factory = operations.origin === "farm_shop";
  const originName = factory
    ? "Brandon’s Pickle Works"
    : ["garage", "home"].includes(operations.origin)
      ? "Brandon’s home garage"
      : "Pickle office & packing room";
  const nextConstruction =
    construction.stage === "unowned" || !construction.stage
      ? agreement.status === "agreed" || agreement.negotiatedAt != null
        ? "buy_island"
        : "negotiate_island"
      : construction.startedAt == null
        ? "hire_contractor"
        : null;
  return (
    <div className="operations-panel">
      <div className="console-heading">
        <p>Supply & production</p>
        <b>Day {state.world?.day || 1}</b>
      </div>
      <section
        className="operations-section schedule-section"
        aria-label="Work and rest schedule"
      >
        <div className="operation-heading">
          <div>
            <span className="eyebrow">A SUSTAINABLE WORKDAY</span>
            <h3>Work schedule</h3>
          </div>
          <Users size={23} />
        </div>
        <WorkSchedule state={state} />

        <div
          className="shift-timeline"
          aria-label="Day shift 8 AM to 6 PM, evening deliveries, overnight rest"
        >
          <span>
            08:00–18:00
            <br />
            <b>Day shift + breaks</b>
          </span>
          <span>
            Evening
            <br />
            <b>2 deliveries</b>
          </span>
          <span>
            Overnight
            <br />
            <b>Rest</b>
          </span>
        </div>
        <div className="operation-metrics">
          <Metric
            label="Daily payroll"
            value={`${number(payroll)} coins`}
            detail={`${crew.length} employed couriers`}
          />
          <Metric
            label="Wages paid"
            value={`${number(state.wages)} coins`}
            detail={
              arrears
                ? `${number(arrears)} coins outstanding`
                : "No outstanding wages"
            }
          />
          <Metric
            label="Evening round"
            value={`${schedule.nightDelivered || 0} / ${schedule.nightQuota || 2}`}
            detail="Brandon’s limited night deliveries"
          />
        </div>

        <div className="operation-metrics">
          <Metric
            label="Brandon this week"
            value={`${((workweek.workedMinutes || 0) / 60).toFixed(1)} / 40 h`}
            detail="Extra hours gradually reduce productivity"
          />
          <Metric
            label="Current productivity"
            value={`${Math.round((workweek.efficiency || 1) * 100)}%`}
            detail={
              workweek.overtimeMinutes > 0
                ? `${(workweek.overtimeMinutes / 60).toFixed(1)} hours above 40`
                : "Regular weekly pace"
            }
          />
          <Metric
            label="Weekend BBQs"
            value={number(state.social?.bbqs)}
            detail={`${number(state.social?.spent)} coins spent hosting`}
          />
        </div>
        <div className="island-deal">
          <b>{VACATION_POLICY.resort} · paid weekend recovery</b>
          <p>
            {VACATION_POLICY.price} coins for a resort stay. Completing the
            visit restores morale and gives Brandon up to 15% extra pace on
            Monday, fading over four working hours.
          </p>
          <span className="operation-status">
            {vacation?.status === "complete"
              ? `${state.workweek.vacations} stay(s) completed · ${state.workweek.vacationSpent} coins paid`
              : vacation?.status === "staying"
                ? "Resting at the resort"
                : vacation?.status === "traveling"
                  ? "On the way to the resort"
                  : "No vacation in progress"}
          </span>
          {vacation?.bonusRemaining > 0 && (
            <p>
              {vacation.bonusRemaining} working minutes of Monday recovery
              benefit remaining.
            </p>
          )}
        </div>
        <div className="operations-actions">
          <Suggest action="vacation_resort" {...{ locked, prioritize }}>
            Plan a resort weekend · {VACATION_POLICY.price} coins
          </Suggest>
        </div>
        {(state.workweek?.notices || []).length > 0 && (
          <details className="experiment-drawer">
            <summary>Customer delivery promises</summary>
            <ul className="learning-feedback">
              {state.workweek.notices
                .slice(-6)
                .reverse()
                .map((notice) => (
                  <li key={notice.key}>
                    <b>
                      {notice.customerId}
                      <span>
                        {notice.promise === "special_weekend"
                          ? "Special weekend"
                          : "Monday delivery"}
                      </span>
                    </b>
                    <p>{notice.message}</p>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>
      <section
        className="operations-section"
        aria-label="Garage and office progression"
      >
        <div className="operation-heading">
          <div>
            <span className="eyebrow">IT STARTS AT HOME</span>
            <h3>Workplace</h3>
          </div>
          <Construction size={23} />
        </div>

        <div className="construction-tracker">
          <span className={state.office?.stage === "garage" ? "current" : ""}>
            Home garage
          </span>
          <span className={state.office?.stage === "building" ? "current" : ""}>
            Office construction
          </span>
          <span className={state.office?.stage === "complete" ? "current" : ""}>
            Office open · hiring unlocked
          </span>
        </div>
        {state.office?.stage !== "complete" && (
          <div className="operations-actions">
            <Suggest
              action="build_office"
              disabled={state.office?.stage === "building"}
              {...{ locked, prioritize }}
            >
              {state.office?.stage === "building"
                ? "Office under construction"
                : `Build the Pickle office · ${ECONOMY.officePrice || 60} coins`}
            </Suggest>
          </div>
        )}
      </section>
      <section className="operations-section" aria-label="Supply chain">
        <div className="operation-heading">
          <div>
            <span className="eyebrow">ONE BUSINESS. EVERY PACKAGE.</span>
            <h3>{originName}</h3>
          </div>
          <Package size={23} />
        </div>

        <ol className="supply-pipeline">
          <li>
            <span>01</span>
            <b>Purchase</b>
            <small>{ECONOMY.importUnitCost} coins / imported case</small>
          </li>
          <li>
            <span>02</span>
            <b>Port arrival</b>
            <small>
              {number((state.harbor || 0) + (operations.islandPort || 0))} cases
              waiting
            </small>
          </li>
          <li>
            <span>03</span>
            <b>Bring to shop</b>
            <small>{number(operations.inboundCarry)} in transit</small>
          </li>
          <li>
            <span>04</span>
            <b>Dispatch</b>
            <small>{number(state.cafe)} cases at the business</small>
          </li>
        </ol>
        <div className="operations-actions">
          <Suggest action="order_import" {...{ locked, prioritize }}>
            Schedule {ECONOMY.importBatch} cases ·{" "}
            {ECONOMY.importBatch * ECONOMY.importUnitCost} coins
          </Suggest>
          <Suggest action="pickup_shipment" {...{ locked, prioritize }}>
            Collect a port shipment
          </Suggest>
        </div>
        {shipments.length > 0 ? (
          <ul className="shipment-list" aria-label="Active shipments">
            {shipments.slice(-5).map((shipment) => (
              <li key={shipment.id}>
                <b>
                  {shipment.cases}{" "}
                  {shipment.kind === "resources"
                    ? "ingredient kits"
                    : "pickle cases"}
                </b>
                <span>
                  {shipment.status === "at_sea"
                    ? `${state.tick < (shipment.departsAt ?? shipment.orderedAt) ? "Scheduled" : "At sea"} · day ${shipment.arrivalDay ?? Math.floor((shipment.arrivesAt + 480) / 1440) + 1}, ${String(Math.floor(((shipment.arrivesAt + 480) % 1440) / 60)).padStart(2, "0")}:${String(shipment.arrivesAt % 60).padStart(2, "0")}`
                    : shipment.status === "port"
                      ? "At port · awaiting collection"
                      : "Moving to the shop"}
                </span>
                <small>
                  {shipment.cost} coins paid ·{" "}
                  {shipment.reason || "Supplier delivery"}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section
        className="operations-section"
        aria-label="Private factory island"
      >
        <div className="operation-heading">
          <div>
            <span className="eyebrow">BUILD A PLACE OF HIS OWN</span>
            <h3>Factory island</h3>
          </div>
          <Construction size={23} />
        </div>
        <div className="island-deal">
          <b>Cay Development Co. · Copperport</b>
          <p>
            Brandon travels to the company, negotiates a land agreement, then
            pays for the island and commissions the contractor.
          </p>
          <span className="operation-status">
            {agreement.status === "agreed" || agreement.negotiatedAt != null
              ? `Deal agreed · ${agreement.price || ECONOMY.islandPrice} coins`
              : agreement.status === "negotiating"
                ? "Negotiation in progress"
                : "A visit and negotiation are required"}
          </span>
        </div>
        <div className="construction-tracker" aria-label="Construction stages">
          {Object.entries(stageLabels).map(([id, label]) => (
            <span
              key={id}
              className={construction.stage === id ? "current" : ""}
              aria-current={construction.stage === id ? "step" : undefined}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="operations-actions">
          {nextConstruction && (
            <Suggest action={nextConstruction} {...{ locked, prioritize }}>
              {nextConstruction === "negotiate_island"
                ? "Visit and negotiate the island"
                : nextConstruction === "buy_island"
                  ? `Purchase island · ${agreement.price || ECONOMY.islandPrice} coins`
                  : `Hire contractor · ${ECONOMY.contractorPrice} coins`}
            </Suggest>
          )}
          {complete && (
            <Suggest
              action="expand_factory"
              disabled={production.expanded}
              {...{ locked, prioritize }}
            >
              {production.expanded
                ? "Factory expanded"
                : `Expand the factory · ${ECONOMY.factoryExpansion} coins`}
            </Suggest>
          )}
        </div>
      </section>
      <section className="operations-section" aria-label="Pickle production">
        <div className="operation-heading">
          <div>
            <span className="eyebrow">FROM GARDEN TO DELIVERY</span>
            <h3>Grow. Ferment. Pack.</h3>
          </div>
          <Leaf size={23} />
        </div>
        <div className="operation-metrics">
          <Metric
            label="Ingredient kits"
            value={number(production.resources)}
            detail={`${ECONOMY.resourceUnitCost} coins each · seeds, brine & jars`}
          />
          <Metric
            label="Produced here"
            value={`${number(production.produced)} cases`}
            detail={
              production.expanded
                ? "Expanded factory"
                : complete
                  ? "Factory operating"
                  : "Factory not built yet"
            }
          />
        </div>
        <ol className="supply-pipeline production-pipeline">
          <li>
            <span>01</span>
            <b>Growing</b>
            <small>
              <Quantity batches={production.growing} /> cases in the garden
            </small>
          </li>
          <li>
            <span>02</span>
            <b>Fermenting</b>
            <small>
              <Quantity batches={production.fermenting} /> cases in brine
            </small>
          </li>
          <li>
            <span>03</span>
            <b>Packing</b>
            <small>
              <Quantity batches={production.packing} /> cases being sealed
            </small>
          </li>
        </ol>
        <div className="operations-actions">
          <Suggest action="buy_resources" {...{ locked, prioritize }}>
            Order {ECONOMY.resourceBatch} kits ·{" "}
            {ECONOMY.resourceBatch * ECONOMY.resourceUnitCost} coins
          </Suggest>
          <Suggest action="plant_crop" {...{ locked, prioritize }}>
            Start a growing batch
          </Suggest>
        </div>
      </section>
    </div>
  );
}
