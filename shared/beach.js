// The weekend cove: an expanded sand beach on the main island's west shore,
// shared by the simulation (where Brandon walks and lounges) and the scene
// (cabanas, loungers, and the residents who join him).
export const BEACH = Object.freeze({
  // Rounded sand footprint. It overlaps the island's old west edge (x = -12)
  // and reaches out to sea, where the plastic cleanup still washes ashore.
  cove: Object.freeze({ x: -12.8, z: -4.4, hx: 3.2, hz: 4.7, r: 2.6 }),
  top: 0.4,
  // Brandon leaves the road here and walks the boardwalk onto the sand.
  door: [-6, -3.4],
  approach: [
    [-6, -3.4],
    [-10.4, -3.4],
    [-12.2, -4.4],
  ],
  // Weekend daytime: residents gather from 09:00 until 19:00.
  openHour: 9,
  closeHour: 19,
  // Sea is to the west; every lounger faces it.
  seaFacing: -Math.PI / 2,
  // Brandon's lounger: he walks up to its head end, then eases down onto it.
  brandon: Object.freeze({ lounger: [-12.9, -4.4], head: [-12.2, -4.4] }),
  loungers: [
    [-12.9, -5.8],
    [-12.9, -3.0],
    [-12.9, -7.2],
    [-12.9, -1.6],
  ],
  cabanas: [
    [-14.2, -8.1],
    [-14.2, -0.8],
  ],
  // Residents who prefer to stand and chat (shaded porches and the shoreline).
  stands: [
    [-14.0, -7.2],
    [-14.0, -1.6],
    [-14.6, -4.4],
    [-11.2, -7.6],
    [-11.2, -1.2],
  ],
  // Ambient walkers stroll the waterline and the boardwalk edge.
  strolls: [
    [
      [-15.1, -8.4],
      [-15.1, -0.5],
      [-15.1, -8.4],
    ],
    [
      [-9.9, -8.4],
      [-9.9, -0.5],
      [-9.9, -8.4],
    ],
  ],
});

// A pure helper so the engine, the panels and the scene agree on "beach time".
export function beachHours(hour) {
  return hour >= BEACH.openHour && hour < BEACH.closeHour;
}

// Feet position for a person lying on lounger `i` (0 is Brandon's). Feet point
// out to sea and the head rests at the land end.
export function loungerFeet(i) {
  const [x, z] = i === 0 ? BEACH.brandon.lounger : BEACH.loungers[i - 1];
  return [x - 0.45, z];
}
