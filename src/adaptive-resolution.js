// Measure delivered frames, including CPU and GPU/browser scheduling delays.
// Separate thresholds and slow recovery prevent quality flicker near 60 FPS.
export const RESOLUTION_SCALES = [1, 0.85, 0.7, 0.58, 0.45];
export function resolutionCeiling(width, height, deviceRatio = 1) {
  return Math.min(
    deviceRatio || 1,
    width < 800 ? 1.5 : 2,
    Math.sqrt(3_000_000 / Math.max(1, width * height)),
  );
}
export function createAdaptiveResolution(now = 0) {
  let level = 0;
  let previous = null;
  let warmUntil = now + 3000;
  let windowStart = null;
  let gaps = [];
  let costs = [];
  let slowWindows = 0;
  let fastWindows = 0;
  let recoverAfter = 0;
  let lastUpgrade = -Infinity;
  let fps = null;
  const reset = (time) => {
    previous = null;
    windowStart = null;
    gaps = [];
    costs = [];
    slowWindows = fastWindows = 0;
    warmUntil = time + 3000;
  };
  return {
    get scale() {
      return RESOLUTION_SCALES[level];
    },
    get fps() {
      return fps;
    },
    reset,
    sample(time, cost = 0) {
      const gap = previous === null ? 0 : time - previous;
      previous = time;
      if (!Number.isFinite(gap) || gap <= 0) return null;
      // Visibility and resize handlers explicitly reset sampling. Keep long
      // visible frames: very slow devices still need to lower their resolution.
      if (time < warmUntil) return null;
      windowStart ??= time - gap;
      gaps.push(gap);
      costs.push(cost);
      if (time - windowStart < 1000 || gaps.length < 5) return null;
      // Trim one-off loading/GC spikes, but retain consistently slow frames.
      const sorted = [...gaps].sort((a, b) => a - b);
      const trim = Math.floor(sorted.length * 0.1);
      const steady = sorted.slice(trim, sorted.length - trim || undefined);
      fps =
        1000 / (steady.reduce((sum, value) => sum + value, 0) / steady.length);
      const work = costs.reduce((sum, value) => sum + value, 0) / costs.length;
      gaps = [];
      costs = [];
      windowStart = time;
      slowWindows = fps < 54 ? slowWindows + 1 : 0;
      fastWindows = fps >= 58 && work < 13 ? fastWindows + 1 : 0;
      let direction = null;
      if (slowWindows >= 2 && level < RESOLUTION_SCALES.length - 1) {
        level++;
        direction = "lower";
        // Failed upward probes need a longer wait before trying again.
        recoverAfter = time + (time - lastUpgrade < 15000 ? 30000 : 10000);
      } else if (fastWindows >= 8 && time >= recoverAfter && level > 0) {
        level--;
        direction = "higher";
        lastUpgrade = time;
      }
      if (!direction) return null;
      const change = {
        direction,
        scale: RESOLUTION_SCALES[level],
        fps: Math.round(fps),
      };
      reset(time);
      return change;
    },
  };
}
