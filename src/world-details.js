import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ISLANDS } from "../shared/islands.js";
import { SEAT } from "./toy-scale.js";
import { dressFigurine } from "./figurine-dress.js";
import { crewLook } from "./cast.js";

// Editable, original geometry. Static scenery is batched only in the runtime renderer.
export function setCrewTransportVisibility(rig, member, moving) {
  const voyage = member.voyage;
  // Aircraft and boats start at their pad or dock. Until a voyage begins,
  // their assigned courier walks there along the road like Brandon does.
  const roadMode = member.mountedMode ?? member.vehicle;
  const mode =
    voyage?.mode ||
    (["bike", "van", "rocket_skates"].includes(roadMode) ? roadMode : "foot");
  const onShore = !!voyage?.onShore;
  rig.group.visible = (!voyage && mode === "foot") || onShore;
  rig.bicycle.visible = !voyage && mode === "bike";
  rig.rider.visible = rig.bicycle.visible;
  if (rig.van) rig.van.visible = !voyage && mode === "van";
  if (rig.driver) rig.driver.visible = !!rig.van?.visible;
  if (rig.rocketSkates)
    rig.rocketSkates.visible = !voyage && mode === "rocket_skates";
  if (rig.skater) rig.skater.visible = !!rig.rocketSkates?.visible;
  rig.boat.visible = mode === "sailboat";
  rig.sailor.visible = rig.boat.visible && !onShore;
  rig.helicopter.visible = mode === "helicopter";
  rig.pilot.visible = rig.helicopter.visible && !onShore;
  rig.jetpack.visible = mode === "jetpack" && !onShore;
  rig.jetPilot.visible = rig.jetpack.visible;
  rig.teleporter.visible = mode === "teleporter" && !onShore;
  rig.portalPilot.visible =
    rig.teleporter.visible && !/Teleporting/.test(voyage?.phase || "");
  const vehicle =
    mode === "van" && rig.van
      ? rig.van
      : mode === "rocket_skates" && rig.rocketSkates
        ? rig.rocketSkates
        : mode === "helicopter"
          ? rig.helicopter
          : mode === "jetpack"
            ? rig.jetpack
            : mode === "teleporter"
              ? rig.teleporter
              : mode === "sailboat"
                ? rig.boat
                : mode === "bike"
                  ? rig.bicycle
                  : rig.group;
  const pilot =
    mode === "van" && rig.driver
      ? rig.driver
      : mode === "rocket_skates" && rig.skater
        ? rig.skater
        : mode === "helicopter"
          ? rig.pilot
          : mode === "jetpack"
            ? rig.jetPilot
            : mode === "teleporter"
              ? rig.portalPilot
              : mode === "sailboat"
                ? rig.sailor
                : mode === "bike"
                  ? rig.rider
                  : rig.body;
  return {
    mode,
    visible: vehicle.visible || rig.group.visible,
    pilotVisible: vehicle.visible && pilot.visible,
    phase: voyage?.phase || "road",
    onShore,
  };
}

export function enrichWorld(w) {
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.76 }),
      );
    return materials.get(color);
  };
  const mesh = (g, geometry, color, x, y, z, name) => {
    const m = new THREE.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    m.name = name || "Island detail";
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // Every edge gets a small bevel so props catch a highlight like painted toys.
  const box = (g, x, y, z, a, b, c, color, name) =>
    mesh(
      g,
      new RoundedBoxGeometry(a, b, c, 1, Math.min(0.04, a / 4, b / 4, c / 4)),
      color,
      x,
      y,
      z,
      name,
    );
  const ball = (g, x, y, z, r, color, name) =>
    mesh(g, new THREE.IcosahedronGeometry(r, 2), color, x, y, z, name);
  const cylinder = (g, x, y, z, r, h, color, name) =>
    mesh(g, new THREE.CylinderGeometry(r, r, h, 12), color, x, y, z, name);
  const dynamicGroup = (name) => {
    const g = new THREE.Group();
    g.name = name;
    g.userData.dynamic = true;
    w.world.add(g);
    return g;
  };
  const ring = (g, r, color) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.04, 6, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    );
    m.rotation.x = Math.PI / 2;
    g.add(m);
    return m;
  };
  // A transparent canopy and seated pilot make the person inside the aircraft readable.
  const canopy = w.helicopter.children[1];
  canopy.material = canopy.material.clone();
  canopy.material.transparent = true;
  canopy.material.opacity = 0.38;
  canopy.material.depthWrite = false;
  w.pilot.position.set(0, 0.49, 0.35);
  w.pilot.scale.setScalar(0.52);
  w.dynamicAssets = [];
  w.lightMaterials = [];
  w.streetLights = [];
  w.beacons = [];
  const lamp = (x, z) => {
    cylinder(w.world, x, 1.08, z, 0.035, 1.45, "#344c60", "Streetlamp pole");
    const glow = ball(w.world, x, 1.87, z, 0.12, "#ffe7a5", "Warm lantern");
    glow.material = new THREE.MeshStandardMaterial({
      color: "#ffe3a0",
      emissive: "#ffd16a",
      emissiveIntensity: 0,
    });
    w.lightMaterials.push(glow.material);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.3),
      new THREE.MeshBasicMaterial({
        color: "#facc71",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(x, 0.43, z);
    halo.userData.dynamic = true;
    w.world.add(halo);
    w.streetLights.push(halo);
  };
  for (const [x, z] of [
    [5.3, -2.3],
    [11.1, 3.2],
    [8.7, -2.45],
  ])
    lamp(x, z);
  for (const [id, island] of Object.entries(ISLANDS)) {
    const { x, z } = island;
    lamp(x - 0.8, z + 2.25);
    lamp(x + 0.8, z - 2.6);
    // Every district has a distinct silhouette, materials, and livelihood.
    if (id === "ridge") {
      for (let j = 0; j < 3; j++) {
        const peak = mesh(
          w.world,
          new THREE.ConeGeometry(0.85 + j * 0.12, 2 + j * 0.48, 5),
          "#738581",
          x - 2 + j * 1.8,
          1.28 + j * 0.24,
          z - 2.65,
          "Dill Ridge mountain",
        );
        peak.rotation.y = j;
        mesh(
          w.world,
          new THREE.ConeGeometry(0.27 + j * 0.025, 0.65, 5),
          "#eff2df",
          x - 2 + j * 1.8,
          2.18 + j * 0.48,
          z - 2.65,
          "Mountain snowcap",
        );
      }
      box(
        w.world,
        x - 2.25,
        0.66,
        z + 1.5,
        0.6,
        0.6,
        0.5,
        "#d8a66c",
        "Trail provisions chest",
      );
    } else if (id === "juniper") {
      for (let j = 0; j < 3; j++) {
        box(
          w.world,
          x - 2.9,
          0.54 + j * 0.28,
          z + 0.5,
          0.62,
          0.24,
          0.58,
          j % 2 ? "#86a6b3" : "#a68d67",
          "Fishing crate",
        );
        const buoy = ball(
          w.world,
          x - 4,
          -0.45,
          z - 1 + j * 1.3,
          0.23,
          "#e89f65",
          "Fishing buoy",
        );
        buoy.scale.y = 1.3;
      }
      box(
        w.world,
        x - 3.5,
        0.22,
        z - 0.3,
        1.5,
        0.18,
        2.4,
        "#9b8065",
        "Fishing wharf",
      );
      for (let j = 0; j < 4; j++)
        cylinder(
          w.world,
          x - 4.1,
          0.5,
          z - 1.3 + j * 0.6,
          0.035,
          1.2,
          "#536b6a",
          "Net post",
        );
    } else if (id === "copper") {
      for (let j = 0; j < 3; j++) {
        box(
          w.world,
          x - 2 + j * 2,
          1.4 + j * 0.2,
          z - 1.55,
          1.4,
          2 + j * 0.4,
          1.35,
          j % 2 ? "#b87e61" : "#c3a18b",
          "Copperport apartment",
        );
        for (let floor = 0; floor < 3; floor++)
          for (const dx of [-0.33, 0.33]) {
            const win = box(
              w.world,
              x - 2 + j * 2 + dx,
              0.9 + floor * 0.55,
              z - 0.86,
              0.23,
              0.28,
              0.025,
              "#f7d298",
              "City apartment window",
            );
            win.material = new THREE.MeshStandardMaterial({
              color: "#e6ca8d",
              emissive: "#ffc570",
              emissiveIntensity: 0,
            });
            w.lightMaterials.push(win.material);
          }
      }
      box(
        w.world,
        x - 2.7,
        0.6,
        z + 1.2,
        0.75,
        0.65,
        0.65,
        "#c77d59",
        "Burger bar kiosk",
      );
    } else if (id === "festival") {
      box(
        w.world,
        x,
        0.55,
        z - 2.7,
        2.6,
        0.3,
        0.8,
        "#5d506f",
        "Festival stage",
      );
      for (const dx of [-1.4, 1.4])
        cylinder(
          w.world,
          x + dx,
          1.55,
          z - 2.65,
          0.05,
          2.5,
          "#7f668e",
          "Festival rigging",
        );
      box(
        w.world,
        x,
        2.7,
        z - 2.65,
        2.9,
        0.08,
        0.12,
        "#cf8fab",
        "Stage lighting rail",
      );
      for (let j = 0; j < 7; j++) {
        const b = ball(
          w.world,
          x - 1.15 + j * 0.38,
          2.57,
          z - 2.6,
          0.085,
          ["#ffca77", "#f28fab", "#b7dcb0"][j % 3],
          "Concert lantern",
        );
        b.material = new THREE.MeshStandardMaterial({
          color: b.material.color,
          emissive: b.material.color,
          emissiveIntensity: 0,
        });
        w.lightMaterials.push(b.material);
      }
      for (const dx of [-2.5]) {
        box(
          w.world,
          x + dx,
          0.68,
          z + 1.45,
          0.8,
          0.7,
          0.7,
          "#e99d86",
          "Food truck",
        );
        box(
          w.world,
          x + dx,
          1.15,
          z + 1.45,
          1,
          0.12,
          1,
          "#f7d486",
          "Food-truck canopy",
        );
      }
    }
  }
  // Jetpack has its own articulated pilot and visible, animated exhaust.
  w.jetpack = dynamicGroup("Brandon personal jetpack");
  w.jetPilot = w.body.clone(true);
  w.jetpack.add(w.jetPilot);
  w.jetpack.scale.setScalar(0.52);
  for (const side of [-1, 1]) {
    cylinder(
      w.jetpack,
      side * 0.25,
      0.75,
      -0.25,
      0.14,
      0.55,
      "#93a9b2",
      "Jetpack turbine",
    );
    const flame = mesh(
      w.jetpack,
      new THREE.ConeGeometry(0.12, 0.5, 10),
      "#89efff",
      side * 0.25,
      0.24,
      -0.25,
      "Jetpack exhaust",
    );
    flame.rotation.z = Math.PI;
    flame.material = new THREE.MeshBasicMaterial({
      color: "#79edff",
      transparent: true,
      opacity: 0.8,
    });
    w.beacons.push(flame);
  }
  w.teleporter = dynamicGroup("Quantum pickle portal");
  const portal = ring(w.teleporter, 0.9, "#bfa3ff");
  portal.rotation.x = 0;
  portal.position.y = 1;
  const inner = ring(w.teleporter, 0.74, "#77e8d9");
  inner.rotation.x = 0;
  inner.position.y = 1;
  cylinder(
    w.teleporter,
    0,
    0.08,
    0,
    0.78,
    0.16,
    "#635576",
    "Teleport landing disc",
  );
  w.portalRings = [portal, inner];
  w.portalPilot = w.body.clone(true);
  w.teleporter.add(w.portalPilot);
  w.teleporter.scale.setScalar(0.52);
  // Gadget installation models are also visible in the workshop and during use.
  w.gadgets = dynamicGroup("Installed delivery gadgets");
  w.gadgetModels = {};
  const gadget = (id) => {
    const g = new THREE.Group();
    g.name = id;
    g.visible = false;
    w.gadgets.add(g);
    w.gadgetModels[id] = g;
    return g;
  };
  let g = gadget("repair_kit");
  box(g, 0, 0.12, 0, 0.4, 0.24, 0.25, "#e7b867", "Repair toolbox");
  box(g, 0, 0.26, 0, 0.2, 0.05, 0.04, "#355d6d", "Toolbox handle");
  g = gadget("cargo_rack");
  for (const x of [-0.24, 0.24])
    box(g, x, 0.2, 0, 0.03, 0.4, 0.5, "#bfc8bd", "Rack upright");
  for (const y of [0, 0.22])
    box(g, 0, y, 0, 0.5, 0.025, 0.5, "#8aab8c", "Rack shelf");
  g = gadget("cooler");
  box(g, 0, 0.15, 0, 0.44, 0.3, 0.34, "#a6dce1", "Cold-brine cooler");
  box(g, 0, 0.32, 0, 0.48, 0.065, 0.38, "#e6f4e7", "Cooler lid");
  g = gadget("rain_gear");
  mesh(
    g,
    new THREE.ConeGeometry(0.3, 0.16, 10),
    "#f0c96c",
    0,
    0.3,
    0,
    "Waterproof jar umbrella",
  );
  cylinder(g, 0, 0.15, 0, 0.015, 0.3, "#485b60", "Umbrella pole");
  g = gadget("solar_panel");
  box(g, 0, 0.08, 0, 0.5, 0.06, 0.38, "#344767", "Solar charger");
  for (const x of [-0.16, 0, 0.16])
    box(g, x, 0.116, 0, 0.12, 0.005, 0.32, "#7cadd0", "Solar cells");
  g = gadget("cargo_dolly");
  box(g, 0, 0.26, 0, 0.035, 0.5, 0.03, "#cd8b60", "Dolly frame");
  box(g, 0, 0.025, 0.12, 0.33, 0.05, 0.3, "#cd8b60", "Dolly platform");
  for (const x of [-0.2, 0.2]) {
    const q = cylinder(g, x, 0.06, 0, 0.07, 0.035, "#385565", "Dolly wheel");
    q.rotation.z = Math.PI / 2;
  }
  g = gadget("navigation");
  box(g, 0, 0.13, 0, 0.3, 0.25, 0.06, "#355f69", "Route planner");
  box(g, 0, 0.15, 0.035, 0.24, 0.14, 0.008, "#b8e5bf", "Planner map");
  g = gadget("scanner");
  box(g, 0, 0.11, 0, 0.35, 0.2, 0.3, "#d9ddd2", "Batch-label printer");
  box(g, 0, 0.13, 0.2, 0.21, 0.025, 0.18, "#fff3cc", "Printed label");
  g = gadget("generator");
  box(g, 0, 0.17, 0, 0.43, 0.34, 0.32, "#dcab5e", "Brine generator");
  for (const x of [-0.1, 0.1])
    box(g, x, 0.19, 0.17, 0.025, 0.19, 0.02, "#554f47", "Cooling vent");
  g = gadget("winch");
  cylinder(g, 0, 0.15, 0, 0.14, 0.25, "#9facb6", "Cargo winch");
  box(g, 0, 0.05, 0.17, 0.035, 0.32, 0.035, "#cfb581", "Winch cable");
  g = gadget("spill_kit");
  cylinder(g, -0.06, 0.15, 0, 0.16, 0.3, "#df6f55", "Spill kit bucket");
  box(g, 0.2, 0.4, 0.06, 0.04, 0.55, 0.04, "#b88a5a", "Spill kit mop handle");
  box(g, 0.26, 0.68, 0.08, 0.18, 0.1, 0.14, "#f0cf62", "Spill kit sponge");
  box(
    w.world,
    3.9,
    0.8,
    5,
    2.1,
    0.13,
    1.0,
    "#a2815b",
    "Outdoor invention workbench",
  );
  for (const x of [3.05, 4.75])
    box(w.world, x, 0.59, 5, 0.12, 0.4, 0.8, "#755e4a", "Workbench trestle");
  Object.values(w.gadgetModels).forEach((m, i) => {
    m.scale.setScalar(0.5);
    m.position.set(3.1 + (i % 6) * 0.34, 0.87, 4.74 + Math.floor(i / 6) * 0.5);
  });
  w.workEffect = dynamicGroup("Active packing and gadget interaction");
  w.effectParcel = box(
    w.workEffect,
    0,
    0.5,
    0.42,
    0.38,
    0.32,
    0.3,
    "#c9975d",
    "Case in transit",
  );
  w.effectGlow = ring(w.workEffect, 0.57, "#c7f2ab");
  w.effectGlow.position.y = 0.02;
  w.activeGadget = new THREE.Group();
  w.workEffect.add(w.activeGadget);
  w.crewActors = new Map();
  w.createCrew = (member) => {
    const group = dynamicGroup(`${member.name} delivery colleague`);
    const body = w.body.clone(true);
    group.add(body);
    group.scale.setScalar(0.52);
    // Each colleague is their own person in the courier's uniform family:
    // their own skin, hair and headwear, in their own uniform color.
    dressFigurine(body, crewLook(member, w.crewActors.size));
    const marker = ring(group, 0.5, member.color || "#fac786");
    marker.position.y = 0.025;
    const bicycle = w.bike.clone(true);
    bicycle.userData.dynamic = true;
    bicycle.name = `${member.name} cargo bicycle`;
    w.world.add(bicycle);
    // The employee replaces Brandon on their bicycle.
    const oldRider = bicycle.children.find(
      (c) =>
        c.name === w.rider.name && c.type === "Group" && c.scale.x === 0.52,
    );
    if (oldRider) oldRider.removeFromParent();
    const rider = body.clone(true);
    rider.position.set(...SEAT.bike.position);
    rider.scale.setScalar(0.52);
    bicycle.add(rider);
    const craft = w.boat.clone(true);
    craft.getObjectByName("Brandon sailboat captain")?.removeFromParent();
    craft.userData.dynamic = true;
    craft.name = `${member.name} skiff`;
    w.world.add(craft);
    const sailor = body.clone(true);
    sailor.scale.setScalar(0.52);
    sailor.position.set(...SEAT.sailboat.position);
    craft.add(sailor);
    const cloneWithPilot = (source, sourcePilot, label) => {
      const vehicle = source.clone(true);
      vehicle.name = `${member.name} ${label}`;
      vehicle.userData.dynamic = true;
      // Remove the inherited founder rather than stacking two passengers in one seat.
      vehicle.children[source.children.indexOf(sourcePilot)].removeFromParent();
      const passenger = body.clone(true);
      passenger.name = `${member.name} ${label} pilot`;
      passenger.position.copy(sourcePilot.position);
      passenger.scale.copy(sourcePilot.scale);
      passenger.rotation.copy(sourcePilot.rotation);
      passenger.visible = true;
      vehicle.add(passenger);
      vehicle.visible = false;
      w.world.add(vehicle);
      return [vehicle, passenger];
    };
    const [helicopter, pilot] = cloneWithPilot(
      w.helicopter,
      w.pilot,
      "helicopter",
    );
    helicopter.children[0].material = helicopter.children[0].material.clone();
    helicopter.children[0].material.color.set(member.color || "#db936a");
    const rotor = helicopter.children[w.helicopter.children.indexOf(w.rotor)];
    const tailRotor =
      helicopter.children[w.helicopter.children.indexOf(w.tailRotor)];
    const [jetpack, jetPilot] = cloneWithPilot(
      w.jetpack,
      w.jetPilot,
      "jetpack",
    );
    const [teleporter, portalPilot] = cloneWithPilot(
      w.teleporter,
      w.portalPilot,
      "portal",
    );
    const portalRings = teleporter.children.filter(
      (c) => c.geometry?.type === "TorusGeometry",
    );
    portalRings.forEach((r) => {
      r.material = r.material.clone();
      r.material.color.set(member.color || "#db936a");
    });
    const exhaust = jetpack.children.filter(
      (c) => c.name === "Jetpack exhaust",
    );
    const rig = {
      group,
      body,
      bicycle,
      rider,
      boat: craft,
      sailor,
      marker,
      helicopter,
      pilot,
      rotor,
      tailRotor,
      jetpack,
      jetPilot,
      teleporter,
      portalPilot,
      portalRings,
      exhaust,
    };
    setCrewTransportVisibility(rig, member, false);
    w.crewActors.set(member.id, rig);
    return rig;
  };
  const litWindows = new Map();
  w.world.traverse((o) => {
    if (
      o.name.includes("window") &&
      o.isMesh &&
      o.material.color &&
      !/pillar|frame|shutter|sill|mullion/i.test(o.name)
    ) {
      const source = o.material;
      if (!litWindows.has(source)) {
        const lit = source.clone();
        lit.emissive = new THREE.Color("#ffc575");
        lit.emissiveIntensity = 0;
        litWindows.set(source, lit);
        w.lightMaterials.push(lit);
      }
      o.material = litWindows.get(source);
    }
  });
  return w;
}
