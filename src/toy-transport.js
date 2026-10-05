import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { plainMaterial } from "./sculpt.js";
import {
  PAL,
  buildVan,
  buildBike,
  buildHelicopter,
  buildBoat,
  buildJetpack,
  buildPortal,
  placePedals,
} from "./toy-vehicles.js";
import {
  GADGET_IDS,
  buildGadget,
  reskinCrates,
  reskinMesh,
} from "./toy-props.js";
import { SEAT, CHAR_SCALE } from "./toy-scale.js";

/**
 * Rebuild every vehicle, gadget and cargo model in the chibi courier's
 * proportions. Runs as the last step of buildWorld: each model keeps its
 * existing group (and every handle the renderer, crew clones and tests hold),
 * only the contents are re-sculpted. Set `w.toyTransport` to inspect or skip.
 */
const clearExcept = (group, keep = []) => {
  for (const child of [...group.children])
    if (!keep.includes(child)) child.removeFromParent();
};
const seat = (body, key) => {
  body.position.set(...SEAT[key].position);
  body.scale.setScalar(CHAR_SCALE);
};

export function applyToyTransport(w) {
  // Van: shell, cabin, wheels, roof rack. The driver (and its name) stay.
  clearExcept(w.chassis);
  const van = buildVan(w.van, w.chassis);
  w.chassis.add(w.driver);
  w.wheels = van.wheels;
  w.wheels.forEach((wheel, i) => {
    wheel.name = `Van wheel ${i}`;
    wheel.userData.restPosition = wheel.position.toArray();
  });
  w.headlights = van.headlights;
  seat(w.driver, "van");
  for (const x of [-0.3, 0.3]) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(0.05, 0.05, 1.0, 2, 0.02),
      plainMaterial(PAL.navy, "soft"),
    );
    rail.name = "roof rack";
    rail.position.set(x, 1.2, -0.12);
    rail.castShadow = true;
    w.chassis.add(rail);
  }
  w.vanCargo = [-0.22, 0, 0.22].map((x, i) => {
    const parcel = new THREE.Mesh();
    parcel.name = "roof parcel";
    parcel.position.set(x, 1.33, -0.12);
    reskinMesh(parcel, 0.2, 0.2, 0.36, `roof-${i % 2}`, {
      wood: i % 2 ? "#c69b69" : "#cb9660",
    });
    w.chassis.add(parcel);
    return parcel;
  });

  // Bicycle: the rider stays seated in the same group.
  clearExcept(w.bike);
  w.bikeWheels = buildBike(w.bike).bikeWheels;
  w.bike.add(w.rider);
  seat(w.rider, "bike");
  placePedals(w.bike);

  // Helicopter: body color first, canopy second (crew recolor/glass contract).
  clearExcept(w.helicopter);
  const heli = buildHelicopter(w.helicopter);
  w.rotor = heli.rotor;
  w.tailRotor = heli.tailRotor;
  w.helicopter.add(w.pilot);
  seat(w.pilot, "helicopter");

  // Sailboat. The captain is added by the renderer at SEAT.sailboat.
  clearExcept(w.boat);
  buildBoat(w.boat);

  // Jetpack and portal live in courier units; the pilots stay inside.
  clearExcept(w.jetpack);
  const jet = buildJetpack(w.jetpack);
  w.jetpack.add(w.jetPilot);
  w.beacons = [
    ...w.beacons.filter((b) => b.name !== "Jetpack exhaust"),
    ...jet.flames,
  ];
  clearExcept(w.teleporter);
  w.portalRings = buildPortal(w.teleporter).rings;
  w.teleporter.add(w.portalPilot);

  // Gadgets and cargo.
  for (const id of GADGET_IDS) {
    const group = w.gadgetModels[id];
    clearExcept(group);
    buildGadget(id, group);
  }
  reskinCrates(w.crates);
  reskinMesh(w.effectParcel, 0.4, 0.34, 0.32, "parcel", { wood: "#cb9660" });
  w.toyTransport = true;
  return w;
}
