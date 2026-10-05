import test from "node:test";
import assert from "node:assert/strict";
import { reviewText, deliveryRating } from "../shared/reviews.js";
import {
  pedestrianPose,
  updatePedestrian,
  ActorMotion,
} from "../src/world-motion.js";
import { buildWorld } from "../src/world.js";
import { fresh, baseline, begin, step, ACTIONS } from "../shared/engine.js";
import { setCrewTransportVisibility } from "../src/world-details.js";

test("reviews offer 1,000 distinct natural comments for each score and welcome a normal 150-tick wait", () => {
  for (let score = 1; score <= 5; score++) {
    const reviews = Array.from({ length: 1000 }, (_, i) =>
      reviewText(score, i),
    );
    assert.equal(new Set(reviews).size, 1000);
    assert.ok(reviews.every((r) => !/ticks|\d/.test(r)));
  }
  assert.equal(deliveryRating(150), 5);
  assert.equal(deliveryRating(166), 4);
  assert.equal(deliveryRating(1000), 1);
});
test("business discovery grows only from actual incoming orders and survives fulfilled orders", () => {
  const s = fresh();
  const initial = [...s.discoveredBusinesses];
  assert.ok(initial.length <= 2);
  assert.deepEqual(initial, [
    ...new Set(s.customerQueue.map((c) => c.customerId)),
  ]);
  s.status = "running";
  for (let i = 0; i < 1000; i++) {
    if (!s.brandon.action) begin(s, baseline(s));
    step(s);
  }
  assert.ok(s.discoveredBusinesses.length > initial.length);
  for (const id of initial) assert.ok(s.discoveredBusinesses.includes(id));
  for (const c of [...s.customerQueue, ...s.customerHistory])
    assert.ok(s.discoveredBusinesses.includes(c.customerId));
});
test("gadgets are installed at Brandon's own workshop", () => {
  assert.equal(ACTIONS.buy_cooler.target, "workshop");
  assert.equal(ACTIONS.upgrade_cooler.target, "workshop");
});
test("walkers traverse entire streets, yield beside couriers, and leave the road clear", () => {
  const world = buildWorld();
  const p = world.pedestrians[0];
  const start = pedestrianPose(p.userData.walkPath, 0),
    later = pedestrianPose(p.userData.walkPath, 5);
  assert.ok(Math.hypot(later.x - start.x, later.z - start.z) > 2);
  updatePedestrian(p, 0, 0.1, [], false);
  const old = p.position.clone();
  for (let i = 0; i < 30; i++) updatePedestrian(p, 0, 0.1, [old], false);
  assert.ok(p.position.distanceTo(old) > 0.25);
  for (let i = 0; i < 30; i++) updatePedestrian(p, 0, 0.1, [], false);
  assert.ok(p.position.distanceTo(old) < 0.01);
  const rig = world.createCrew({
    id: "crew-test",
    name: "Test",
    color: "#dab578",
    vehicle: "bike",
  });
  assert.equal(rig.group.scale.x, world.brandon.scale.x);
  assert.equal(rig.rider.scale.x, world.brandon.scale.x);
  assert.equal(world.driver.scale.x, world.brandon.scale.x);
  assert.equal(world.pilot.scale.x, world.brandon.scale.x);
  setCrewTransportVisibility(rig, { vehicle: "bike" }, false);
  assert.equal(rig.rider.visible, true);
  assert.equal(rig.group.visible, false);
});
test("a van faces its direction of travel after a turnaround", () => {
  const motion = new ActorMotion(),
    state = { tick: 0, status: "running", vehicle: "van" };
  motion.update({ node: null, position: [0, 0], vehicle: "van" }, state, 0.05);
  state.tick++;
  motion.update({ node: null, position: [0, -1], vehicle: "van" }, state, 0.05);
  assert.equal(motion.reversing, false);
  assert.ok(motion.position.z < 0 && motion.position.z > -0.3);
  assert.ok(Math.abs(Math.abs(motion.heading) - Math.PI) < 0.01);
});
