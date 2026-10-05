// Shared destination for simulation walking, route previews, and shoreline art.
export const SHORELINE = {
  position: [-10.55, -4.3],
  approach: [
    [-6, -3.4],
    [-10.55, -4.3],
  ],
  batch: 6,
  duration: 18,
};
export function shorelineCollection(state) {
  const collecting =
    state.brandon?.action === "salvage" &&
    state.brandon?.buildingVisit?.shoreline &&
    state.brandon.buildingVisit.phase === "inside";
  const progress = collecting
    ? Math.min(1, (state.brandon.work || 0) / SHORELINE.duration)
    : 0;
  const batch = Math.min(SHORELINE.batch, state.salvageStock || 0);
  return {
    collecting: !!collecting,
    progress,
    batch,
    remaining: Math.max(
      0,
      (state.salvageStock || 0) - Math.floor(progress * batch),
    ),
  };
}
