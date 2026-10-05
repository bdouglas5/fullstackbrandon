import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  FARM,
  REEF,
  MAIN_ISLAND,
  HOME_BUSINESSES,
  HARBOR_BERTH,
} from "../shared/islands.js";
import { buildWorld } from "../src/world.js";
import { setCrewTransportVisibility } from "../src/world-details.js";
import {
  seaRoute,
  EDGES,
  NODES,
  PEOPLE,
  ISLANDS,
  fresh,
  begin,
  decisionReady,
  baseline,
  step,
  TOOLS,
  legal,
  TRANSPORT,
} from "../shared/engine.js";
import {
  ActorMotion,
  articulate,
  movementPoints,
} from "../src/world-motion.js";
const world = buildWorld();
world.world.updateMatrixWorld(true);
test("authored road graph clears actual scenery mesh bounds for a loaded van", () => {
  const dynamic = new Set([
    world.brandon,
    world.van,
    world.bike,
    world.helicopter,
    world.boat,
    world.roadCones,
    world.barriers,
    ...world.customers,
    ...world.clouds,
    ...world.pedestrians,
  ]);
  const obstacles = [];
  world.world.traverse((object) => {
    if (!object.isMesh) return;
    for (let p = object; p; p = p.parent)
      if (dynamic.has(p) || p.userData.dynamic) return;
    const b = new THREE.Box3().setFromObject(object);
    if (b.max.y < 0.7 || b.min.y > 2.3) return;
    obstacles.push({ name: object.name, box: b });
  });
  const collisions = [];
  for (const [a, b] of EDGES) {
    const dx = NODES[b][0] - NODES[a][0],
      dz = NODES[b][1] - NODES[a][1],
      length = Math.hypot(dx, dz);
    const rx = Math.abs(dx / length) * 0.97 + Math.abs(dz / length) * 0.59,
      rz = Math.abs(dz / length) * 0.97 + Math.abs(dx / length) * 0.59;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        x = NODES[a][0] + dx * t,
        z = NODES[a][1] + dz * t;
      for (const { name, box } of obstacles)
        if (
          x > box.min.x - rx &&
          x < box.max.x + rx &&
          z > box.min.z - rz &&
          z < box.max.z + rz
        )
          collisions.push(`${a} to ${b}: ${name || "scenery"}`);
    }
  }
  assert.deepEqual([...new Set(collisions)], []);
});
test("parked and departing sailboats clear the cargo pier at every heading", () => {
  const pierParts = [];
  world.world.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (
      box.min.x >= -6 &&
      box.max.x <= -2 &&
      box.min.z >= 10.5 &&
      box.max.z <= 15.7
    )
      pierParts.push([mesh.name, box]);
  });
  assert.ok(pierParts.some(([name]) => name === "harbor pier"));
  const savedPosition = world.boat.position.clone(),
    savedRotation = world.boat.rotation.clone();
  try {
    for (const id of [...Object.keys(ISLANDS), "farm", "reef"]) {
      const path = seaRoute(id);
      assert.deepEqual(path[0], [...HARBOR_BERTH]);
      for (let t = 0; t <= 1; t += 0.05) {
        const x = path[0][0] + (path[1][0] - path[0][0]) * t;
        const z = path[0][1] + (path[1][1] - path[0][1]) * t;
        world.boat.position.set(x, -0.63, z);
        // Covers boarding, turning, outbound and opposite return headings.
        for (let heading = 0; heading < 16; heading++) {
          world.boat.rotation.y = (heading * Math.PI) / 8;
          world.boat.updateMatrixWorld(true);
          const hull = new THREE.Box3()
            .setFromObject(world.boat)
            .expandByScalar(0.03);
          for (const [name, box] of pierParts)
            assert.ok(
              !hull.intersectsBox(box),
              `${id} at ${x},${z} hits ${name}`,
            );
        }
      }
    }
  } finally {
    world.boat.position.copy(savedPosition);
    world.boat.rotation.copy(savedRotation);
    world.boat.updateMatrixWorld(true);
  }
});

test("walking bends both knees and swings opposing arms over full stride", () => {
  const motion = { walkCycle: Math.PI / 2 };
  articulate(world.body, motion, { walking: true, dt: 1 / 60 });
  assert.ok(world.legs[0].rotation.x > 0 && world.legs[0].rotation.x < 0.5);
  for (let frame = 0; frame < 20; frame++)
    articulate(world.body, motion, { walking: true, dt: 1 / 60 });
  assert.ok(world.legs[0].rotation.x > 0.5);
  assert.ok(world.legs[1].rotation.x < -0.5);
  assert.ok(world.arms[0].rotation.x < -0.5);
  assert.ok(world.arms[1].rotation.x > 0.5);
  // Over one stride each knee folds while its leg swings forward and is
  // nearly straight as the heel lands.
  const fold = [0, 0],
    landing = [Infinity, Infinity];
  for (let k = 0; k <= 48; k++) {
    const phase = (k / 48) * Math.PI * 2;
    articulate(world.body, { walkCycle: phase }, { walking: true, dt: 1 / 60 });
    world.legs.forEach((leg, i) => {
      const knee = leg.getObjectByName("knee").rotation.x;
      fold[i] = Math.max(fold[i], knee);
      if (Math.abs(leg.rotation.x) > 0.6)
        landing[i] = Math.min(landing[i], knee);
    });
  }
  assert.ok(
    fold.every((v) => v > 0.7),
    "both knees fold during the swing",
  );
  assert.ok(
    landing.every((v) => v < 0.35),
    "knees straighten at the extremes",
  );
  articulate(world.body, motion, { walking: false, dt: 1 / 60 });
  assert.ok(
    Math.abs(world.legs[0].rotation.x) > 0.1 ||
      Math.abs(world.legs[1].rotation.x) > 0.1,
    "stopping eases into the resting pose",
  );
  for (let frame = 0; frame < 40; frame++)
    articulate(world.body, motion, { walking: false, dt: 1 / 60 });
  assert.ok(Math.abs(world.legs[0].rotation.x) < 0.001);
});
test("sparse fast-speed observations retain road corners rather than crossing buildings", () => {
  const before = {
    node: "garden",
    position: NODES.garden,
    move: { from: "garden", to: "harbor" },
  };
  const next = { node: "cafe", position: NODES.cafe, move: null };
  const points = movementPoints(before, next, NODES.garden, {
    bridgeClosed: false,
    traffic: false,
  });
  assert.ok(
    points.some((p) => p[0] === NODES.harbor[0] && p[1] === NODES.harbor[1]),
  );
  assert.ok(
    points.some((p) => p[0] === NODES.west[0] && p[1] === NODES.west[1]),
  );
});
test("water interpolation keeps navigation waypoints during accelerated playback", () => {
  const path = [
    [-4, 7.5],
    [-9, 8],
    [-9, -9],
    [-14, -9],
    [-14, -8.2],
  ];
  const before = {
    voyage: { mode: "sailboat", position: path[0], waypoints: path },
  };
  const after = {
    voyage: { mode: "sailboat", position: path[4], waypoints: path },
  };
  assert.deepEqual(movementPoints(before, after, path[0], {}), path);
});
test("every customer and gadget has editable original scene geometry", () => {
  assert.equal(world.customers.length, PEOPLE.length);
  assert.equal(Object.keys(world.gadgetModels).length, 11);
  for (const model of [
    world.jetpack,
    world.teleporter,
    ...Object.values(world.gadgetModels),
  ])
    assert.ok(model.children.length > 0);
  assert.equal(
    new Set(world.customers.map((c) => c.userData.customer.name)).size,
    PEOPLE.length,
  );
});

test("every scene vertex remains finite after procedural geometry generation", () => {
  world.world.traverse((o) => {
    if (o.geometry?.attributes?.position)
      assert.ok(
        o.geometry.attributes.position.array.every(Number.isFinite),
        o.name || o.type,
      );
  });
});

test("every helicopter landing clears actual scenery at sixteen headings", () => {
  const dynamic = new Set([
    world.brandon,
    world.van,
    world.bike,
    world.helicopter,
    world.boat,
    world.roadCones,
    world.barriers,
    ...world.customers,
    ...world.clouds,
    ...world.pedestrians,
  ]);
  const scenery = [];
  world.world.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent)
      if (dynamic.has(p) || p.userData.dynamic) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.max.y >= 0.6) scenery.push([o.name, b]);
  });
  const pads = {
    home: NODES.helipad,
    ...Object.fromEntries(
      Object.entries(ISLANDS).map(([id, i]) => [id, i.landing]),
    ),
    reef: REEF.landing,
    farm: FARM.landing,
  };
  const hits = new Set();
  for (const [id, p] of Object.entries(pads)) {
    world.helicopter.position.set(p[0], 0.48, p[1]);
    for (let k = 0; k < 16; k++) {
      world.helicopter.rotation.y = (k * Math.PI) / 8;
      world.helicopter.updateMatrixWorld(true);
      world.helicopter.traverse((o) => {
        if (!o.isMesh) return;
        const b = new THREE.Box3().setFromObject(o);
        for (const [name, box] of scenery)
          if (b.intersectsBox(box))
            hits.add(`${id}: ${o.name} hits ${name || "scenery"}`);
      });
    }
  }
  assert.deepEqual([...hits], []);
});

test("engine-generated island shore walks and customer handoffs clear scenery", () => {
  const dynamic = new Set([
    world.brandon,
    world.van,
    world.bike,
    world.helicopter,
    world.boat,
    world.roadCones,
    world.barriers,
    ...world.customers,
    ...world.clouds,
    ...world.pedestrians,
  ]);
  const scenery = [];
  world.world.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent)
      if (dynamic.has(p) || p.userData.dynamic) return;
    const box = new THREE.Box3().setFromObject(o);
    if (box.max.y > 0.55 && box.min.y < 2.1) scenery.push([o.name, box]);
  });
  const collisions = new Set();
  for (const mode of ["sailboat", "helicopter"])
    for (const person of PEOPLE.filter((p) => p.island !== "home")) {
      const s = fresh();
      s.status = "running";
      s.vehicles = [mode];
      s.carry = 1;
      s.harbor--;
      s.tools = Object.fromEntries(Object.keys(TOOLS).map((id) => [id, 2]));
      s.storm = false;
      s.stormOverride = false;
      s.stormOverrideUntil = 1e5;
      s.customerQueue = [
        {
          ...person,
          id: "geometry-order",
          customerId: person.id,
          arrived: 0,
          assigned: null,
        },
      ];
      s.queue = [0];
      s.brandon.node = mode === "sailboat" ? "harbor_dock" : "helipad";
      s.brandon.position = [...NODES[s.brandon.node]];
      assert.ok(begin(s, `serve_${person.id}`));
      for (let i = 0; i < 3 && !s.brandon.voyage; i++) step(s);
      assert.ok(s.brandon.voyage);
      for (const stage of s.brandon.voyage.stages.filter(
        (stage) => stage.onShore,
      ))
        for (let j = 0; j <= 24; j++) {
          const t = j / 24,
            x = stage.from[0] + (stage.to[0] - stage.from[0]) * t,
            z = stage.from[1] + (stage.to[1] - stage.from[1]) * t;
          for (const [name, b] of scenery)
            if (
              x > b.min.x - 0.28 &&
              x < b.max.x + 0.28 &&
              z > b.min.z - 0.28 &&
              z < b.max.z + 0.28
            )
              collisions.add(`${mode} ${person.name}: ${name || "scenery"}`);
        }
    }
  assert.deepEqual([...collisions], []);
});

test("real crew aircraft, jetpack and portal trips each show one employee pilot and a shore handoff", () => {
  const observed = new Set();
  for (const mode of ["helicopter", "jetpack", "teleporter"]) {
    // Rendering fixture: a funded office hires and pays for this employee's
    // own craft through real actions. Baseline fleet ownership is independent.
    const s = fresh(42);
    s.status = "running";
    // Start this transport fixture after the opening port delivery.
    s.cafe = 6;
    s.harbor = 0;
    s.operations.shipments = [];
    s.money += 2000;
    s.startingMoney += 2000;
    s.office.stage = "complete";
    s.tools = Object.fromEntries(Object.keys(TOOLS).map((id) => [id, 2]));
    s.stormOverride = false;
    s.stormOverrideUntil = 1e5;
    for (const action of ["hire_employee", `buy_crew-1_${mode}`]) {
      s.customerQueue = [];
      assert.ok(begin(s, action));
      for (let i = 0; !decisionReady(s) && i < 500; i++) {
        s.customerQueue = [];
        step(s);
      }
      assert.equal(s.brandon.action, null);
    }
    assert.ok(s.crew[0].vehicles.includes(mode));
    assert.ok(s.spent >= TRANSPORT[mode].price + 80);
    // Isolate this route after the purchase; return any incidental fixture cargo.
    const courier = s.crew[0];
    s.cafe += courier.carry;
    Object.assign(courier, {
      carry: 0,
      action: null,
      move: null,
      orderId: null,
      node: "home",
      position: [NODES.home[0] - 0.35, NODES.home[1] + 1.15],
    });
    const customer = PEOPLE.find((p) => p.id === "amara");
    s.customerQueue = [
      {
        ...customer,
        id: `crew-${mode}`,
        customerId: customer.id,
        cases: 1,
        arrived: s.tick,
        assigned: null,
      },
    ];
    for (let i = 0; i < 1500 && !observed.has(`${mode}-shore`); i++) {
      step(s);
      for (const member of s.crew) {
        const v = member.voyage;
        if (
          !v ||
          !["helicopter", "jetpack", "teleporter"].includes(v.mode) ||
          /Teleporting/.test(v.phase)
        )
          continue;
        const key = `${v.mode}-${v.onShore ? "shore" : "travel"}`;
        if (observed.has(key)) continue;
        const rig = world.crewActors.get(member.id) || world.createCrew(member);
        const diagnostic = setCrewTransportVisibility(rig, member, true);
        assert.equal(diagnostic.visible, true, `${key} is visible`);
        assert.equal(
          diagnostic.pilotVisible,
          !v.onShore,
          `${key} has the correct passenger visibility`,
        );
        assert.equal(rig.group.visible, v.onShore, `${key} walks ashore`);
        const craft =
          v.mode === "helicopter"
            ? rig.helicopter
            : v.mode === "jetpack"
              ? rig.jetpack
              : rig.teleporter;
        const pilot =
          v.mode === "helicopter"
            ? rig.pilot
            : v.mode === "jetpack"
              ? rig.jetPilot
              : rig.portalPilot;
        assert.equal(pilot.parent, craft);
        assert.equal(
          craft.children.filter((c) => c.getObjectByName("teal overshirt"))
            .length,
          1,
          "one passenger, without the inherited founder",
        );
        assert.equal(
          pilot.getObjectByName("teal overshirt").material.color.getHexString(),
          new THREE.Color(member.color).getHexString(),
        );
        if (v.mode === "helicopter")
          assert.ok(
            pilot.position.z > 0.3 && pilot.scale.x === world.brandon.scale.x,
            "employee sits inside the transparent canopy",
          );
        observed.add(key);
      }
    }
  }
  assert.equal(observed.size, 6, `found ${[...observed]}`);
});

test("real round-trip boats never replay the opposite leg at repeated water waypoints", () => {
  const s = fresh(42);
  s.status = "running";
  // Start this transport fixture after the opening port delivery.
  s.cafe = 6;
  s.harbor = 0;
  s.operations.shipments = [];
  s.vehicles = ["sailboat"];
  s.preferredTransport = "sailboat";
  s.tools = Object.fromEntries(Object.keys(TOOLS).map((id) => [id, 2]));
  s.stormOverride = false;
  s.stormOverrideUntil = 1e5;
  s.brandon.node = "harbor_dock";
  s.brandon.position = [...NODES.harbor_dock];
  let trip = 0;
  let checked = 0,
    corners = 0;
  for (let i = 0; i < 1800; i++) {
    if (!s.brandon.action) {
      const customer = PEOPLE.find(
        (person) => person.id === ["amara", "leo", "tess"][trip++ % 3],
      );
      s.customerQueue = [
        {
          ...customer,
          id: `boat-trip-${trip}`,
          customerId: customer.id,
          cases: 1,
          arrived: s.tick,
          assigned: null,
        },
      ];
      s.queue = [s.tick];
      if (s.carry === 0) {
        if (!s.cafe) break;
        s.carry++;
        s.cafe--;
      }
      if (!legal(s).includes(`serve_${customer.id}`)) {
        assert.ok(begin(s, "rest"));
        step(s);
        continue;
      }
      assert.ok(begin(s, `serve_${customer.id}`));
    }
    const before = new Map(
      [s.brandon, ...s.crew]
        .filter((a) => a.voyage?.mode === "sailboat")
        .map((a) => [a.id, structuredClone(a)]),
    );
    step(s);
    for (const actor of [s.brandon, ...s.crew]) {
      const old = before.get(actor.id),
        v = actor.voyage;
      if (!old || v?.mode !== "sailboat" || v.elapsed < old.voyage.elapsed)
        continue;
      const current = old.voyage.position,
        target = v.position;
      const direct = Math.hypot(target[0] - current[0], target[1] - current[1]);
      const points = movementPoints(old, actor, current, s);
      const visualDistance = points.reduce(
        (n, p, j) =>
          n +
          (j
            ? Math.hypot(p[0] - points[j - 1][0], p[1] - points[j - 1][1])
            : 0),
        0,
      );
      assert.ok(
        visualDistance <= direct + 1e-5,
        `tick ${s.tick}: visual ${visualDistance} versus actual ${direct}`,
      );
      checked++;
      if (v.stageIndex !== old.voyage.stageIndex) corners++;
    }
  }
  assert.ok(checked > 100);
  assert.ok(corners > 5);
});

test("mainland roads tessellate intersections exactly once", () => {
  const cells = world.roads.geometry.userData.cells;
  assert.ok(cells.length > 20);
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i],
        b = cells[j];
      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      assert.ok(
        overlapX <= 0 || overlapZ <= 0,
        "road surface patches never overlap",
      );
    }
  assert.ok(MAIN_ISLAND.width * MAIN_ISLAND.depth >= 750);
});

test("every home order has a distinct physical storefront beside its road address", () => {
  const homePeople = PEOPLE.filter((person) => person.island === "home");
  assert.equal(world.businesses.length, homePeople.length);
  assert.equal(
    new Set(homePeople.map((person) => person.node)).size,
    homePeople.length,
  );
  for (const person of homePeople) {
    const business = world.businesses.find(
      (object) => object.userData.businessId === person.id,
    );
    const customer = world.customers.find(
      (object) => object.userData.personId === person.id,
    );
    const address = HOME_BUSINESSES[person.id];
    assert.ok(
      business.getObjectByName("shop door"),
      `${person.role} has a shop`,
    );
    assert.deepEqual(NODES[person.node], person.position);
    assert.ok(
      customer.position.distanceTo(business.position) < 1.4,
      `${person.name} waits by their shop`,
    );
    assert.ok(
      Math.hypot(
        customer.position.x - address.position[0],
        customer.position.z - address.position[1],
      ) > 0.9,
      "merchant is off the traffic lane",
    );
  }
});

test("all main-island storefront roof corners stay above the rounded land", () => {
  const grass = world.world.getObjectByName("Main island continuous grass");
  const ray = new THREE.Raycaster();
  for (const business of world.businesses) {
    const roof = business.getObjectByName("shop pitched roof");
    const bounds = new THREE.Box3().setFromObject(roof);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const z of [bounds.min.z, bounds.max.z]) {
        ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
        assert.ok(
          ray.intersectObject(grass).length > 0,
          `${business.name} stays inside the coastline at ${x}, ${z}`,
        );
      }
  }
});
