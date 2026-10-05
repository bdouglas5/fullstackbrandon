/**
 * Proportion bible for everything the courier rides, carries or uses.
 *
 * The figurine is a chibi: about 2.9 heads tall, a head as wide as the whole
 * torso plus arms, a 0.41-unit leg and mitten hands. It is placed in the world
 * at CHAR_SCALE, so every prop is authored in world units from these numbers
 * instead of being eyeballed. Re-measure with scripts/pose-contacts.mjs if the
 * figurine changes; tests/vehicle-fit.test.js fails when a seat drifts away
 * from the posed body.
 */
export const CHAR_SCALE = 0.52;

// Courier measurements in the courier's own units (feet at y = 0, facing +z).
export const CHAR = {
  height: 1.48, // cap included
  headWidth: 0.64,
  headCenterY: 1.165,
  shoulderY: 0.83,
  hipY: 0.41,
  kneeY: 0.24,
  armSpread: 0.28, // shoulder x
  footLength: 0.28,
  backpackBackZ: -0.345,
};

// Same numbers in world units; vehicles use these.
export const WORLD = {
  height: CHAR.height * CHAR_SCALE, // 0.77
  headWidth: CHAR.headWidth * CHAR_SCALE, // 0.33
  headCenterY: CHAR.headCenterY * CHAR_SCALE, // 0.61
  shoulderY: CHAR.shoulderY * CHAR_SCALE, // 0.43
  hipY: CHAR.hipY * CHAR_SCALE, // 0.21
  footLength: CHAR.footLength * CHAR_SCALE,
};

// Measured contact points of the animation poses, courier units, relative to
// the body origin (scripts/pose-contacts.mjs).
export const POSE = {
  seated: {
    hip: [0.12, 0.41, 0],
    knee: [0.12, 0.322, 0.146],
    sole: [0.12, 0.083, 0.15],
    toe: [0.12, 0.059, 0.308],
    hand: [0.269, 0.637, 0.262],
  },
  cycling: {
    hip: [0.12, 0.408, 0.045],
    // The pedal stroke slides the sole along this arc: back/low, mid, forward/high.
    sole: [
      [0.12, 0.092, -0.093],
      [0.12, 0.057, 0.199],
      [0.12, 0.273, 0.426],
    ],
    hand: [0.269, 0.656, 0.366],
  },
  flying: {
    hip: [0.12, 0.416, 0.025],
    sole: [0.106, 0.028, -0.1],
    hand: [0.216, 0.533, 0.147],
    handCarry: [0.315, 0.652, 0.309],
  },
};

// Wheel radii drive the roll animation (world-animation.js).
export const WHEEL_RADIUS = { van: 0.24, bike: 0.22 };

// Where each vehicle seats its courier: position in the vehicle's local frame
// (world units; the body origin is the standing foot plane) and yaw.
export const SEAT = {
  van: { position: [-0.2, 0.3, 0.1], parent: "chassis" },
  bike: { position: [0, 0.13, 0.02] },
  helicopter: { position: [0, 0.36, 0.32] },
  sailboat: { position: [-0.12, 0.5, -0.36] },
  rocket_skates: { position: [0, 0.165, 0] },
};
