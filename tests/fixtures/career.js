import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { openStore } from "../../server/store.js";
import {
  fresh,
  command,
  begin,
  baseline,
  step,
  clone,
} from "../../shared/engine.js";

let recorded, career;
// Fixtures use deterministic engine states in the isolated browser-test DB.
// Electric crew rendering explicitly combines paid ownership and a real voyage.
export function careerSnapshots(requested) {
  if (requested?.startsWith("crew_") && !recorded?.[requested]) {
    // Buy each employee craft through normal guidance and earned funds.
    // Capture helicopter dispatch directly; stage electric flight poses below.
    const mode = requested.slice(5);
    const source =
      mode === "helicopter"
        ? careerSnapshots("crew").crew
        : careerSnapshots("retired").retired;
    const guided = clone(source);
    if (guided.status === "complete") {
      command(guided, "extend");
      command(guided, "start");
    }
    command(guided, "prefer", `buy_crew-1_${mode}`);
    for (let i = 0; i < 40000 && guided.status === "running"; i++) {
      if (!guided.brandon.action) begin(guided, baseline(guided));
      step(guided);
      const member = guided.crew[0];
      if (mode !== "helicopter" && member?.vehicles.includes(mode)) {
        // This is a controlled rendering fixture, not a dispatch assertion:
        // use a real paid employee and an engine-generated voyage. Busy home
        // queues can legitimately keep that employee on local deliveries.
        const donor = clone(careerSnapshots(mode)[mode]);
        for (let j = 0; j < 2000; j++) {
          const v = donor.brandon.voyage;
          if (
            v?.mode === mode &&
            !v.onShore &&
            (mode === "teleporter"
              ? v.phase === "Portal arrival"
              : v.phase.startsWith("Flying to"))
          )
            break;
          if (!donor.brandon.action) begin(donor, baseline(donor));
          step(donor);
        }
        const flight = donor.brandon;
        if (!flight.voyage || flight.voyage.mode !== mode)
          throw new Error(`No engine voyage for ${mode}`);
        member.voyage = clone(flight.voyage);
        member.position = [...flight.position];
        member.node = flight.node;
        member.transport = mode;
        member.action = flight.action;
        recorded[requested] = clone(guided);
        break;
      }
      const v = member?.voyage;
      if (v?.mode === mode && !v.onShore && v.phase.startsWith("Flying to")) {
        recorded[requested] = clone(guided);
        break;
      }
    }
    if (!recorded[requested])
      throw new Error(`Paid employee ${mode} never dispatched`);
    return recorded;
  }
  if (recorded?.[requested] || recorded?.retired) return recorded;
  if (!career) {
    career = fresh(42);
    command(career, "start");
    recorded = {};
  }
  const s = career;
  while (s.tick < 120000 && s.status === "running") {
    if (!s.brandon.action) begin(s, baseline(s), { controller: "rules" });
    step(s);
    const boarding =
      !s.brandon.voyage &&
      [s.brandon.node, s.brandon.move?.from, s.brandon.move?.to].includes(
        "harbor_dock",
      );
    const mode =
      s.brandon.voyage?.mode ||
      (boarding ? "foot" : s.brandon.mountedMode || s.vehicle);
    if (
      !recorded[mode] &&
      (s.brandon.move || s.brandon.voyage) &&
      !s.brandon.transition
    )
      recorded[mode] = clone(s);
    if (!recorded.night && s.world?.phase === "night")
      recorded.night = clone(s);
    if (!recorded.crew && s.crew?.some((c) => c.move || c.voyage))
      recorded.crew = clone(s);
    if (
      !recorded.shipment &&
      s.operations?.shipments.some((shipment) => shipment.status === "at_sea")
    )
      recorded.shipment = clone(s);
    if (
      !recorded.office &&
      s.office?.stage === "complete" &&
      s.operations.origin === "cafe"
    )
      recorded.office = clone(s);
    if (!recorded.construction && s.construction?.stage === "foundation")
      recorded.construction = clone(s);
    if (
      !recorded.factory &&
      s.construction?.stage === "complete" &&
      s.production?.fermenting.length
    )
      recorded.factory = clone(s);
    if (
      !recorded.rest &&
      s.schedule?.phase === "rest" &&
      !s.brandon.move &&
      !s.brandon.voyage
    )
      recorded.rest = clone(s);
    if (!recorded.negotiation && s.brandon.action === "negotiate_island")
      recorded.negotiation = clone(s);
    if (!recorded.transition && s.brandon.transition)
      recorded.transition = clone(s);
    if (!recorded.vacation && s.workweek?.vacation?.status === "staying")
      recorded.vacation = clone(s);
    if (
      !recorded.monday &&
      s.schedule.weekday === "Monday" &&
      s.workweek?.vacation?.bonusRemaining > 0 &&
      s.brandon.action?.startsWith("serve_")
    )
      recorded.monday = clone(s);
    if (
      !recorded.repair &&
      s.vehicle === "van" &&
      s.brandon.mountedMode === "van" &&
      s.brandon.move &&
      !s.brandon.transition &&
      !s.flatTire
    ) {
      const punctured = clone(s);
      command(punctured, "puncture");
      begin(punctured, "patch", { controller: "rules" });
      step(punctured);
      if (punctured.flatTire && punctured.brandon.action === "patch")
        recorded.repair = punctured;
    }
    for (const member of s.crew || []) {
      const voyage = member.voyage;
      if (!voyage || voyage.onShore) continue;
      const flight =
        ["helicopter", "jetpack"].includes(voyage.mode) &&
        voyage.phase.startsWith("Flying to");
      const arrival =
        voyage.mode === "teleporter" && voyage.phase === "Portal arrival";
      if ((flight || arrival) && !recorded[`crew_${voyage.mode}`])
        recorded[`crew_${voyage.mode}`] = clone(s);
    }
    if (!recorded.reviews && s.reviews?.length >= 3)
      recorded.reviews = clone(s);
    if (requested && recorded[requested]) break;
  }
  if (s.status === "complete") recorded.retired = clone(s);
  if (!requested && s.status !== "complete")
    throw new Error(`Career fixture failed to retire after ${s.tick} ticks`);
  return recorded;
}

export async function installSnapshot(context, name) {
  const source = careerSnapshots(name)[name];
  if (!source) throw new Error(`No autonomous ${name} snapshot was observed`);
  return installState(context, source);
}

// Paused fixture injection is limited to the isolated browser test database.
export async function installState(
  context,
  source,
  {
    databasePath = resolve(
      process.env.BROWSER_TEST_DATABASE || "data/browser-test.sqlite",
    ),
    baseURL = "http://127.0.0.1:4080",
  } = {},
) {
  const s = clone(source);
  if (s.status === "running") s.status = "paused";
  s.speed = 1;
  const session = randomBytes(32).toString("hex"),
    id = randomUUID();
  const { db, save } = openStore(databasePath);
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const now = Date.now();
    db.prepare(
      "INSERT INTO sessions(id,created,last_seen,current_run) VALUES(?,?,?,?)",
    ).run(session, now, now, id);
    db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)").run(
      id,
      session,
      JSON.stringify(s),
      now,
      now,
      null,
    );
    save(id, s);
  } finally {
    db.close();
  }
  await context.addCookies([
    {
      name: "lw_session",
      value: session,
      url: baseURL,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  return s;
}
