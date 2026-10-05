// One presentation clock for the whole scene.
//
// The server is authoritative and sends a frame per simulated tick. Drawing the
// newest frame as soon as it lands makes the world stop and jump with network
// timing, and mixing "newest" discrete state (which vehicle is parked, whether
// Brandon is mounted) with a position that is still gliding makes vehicles
// pop. Instead every frame goes into a short buffer and the scene is drawn at a
// single playout time a small, adaptive cushion behind the newest frame:
//
//   * positions interpolate between two known authoritative poses,
//   * discrete state (mounted mode, transition, parked vehicles, cargo) is the
//     frame that was true at that same playout time,
//   * the cushion grows with measured jitter and shrinks when delivery is
//     steady, and the clock bends its speed (never stops or jumps) to close it.
//
// This is the same technique networked games use to keep remote players
// smooth; here it also makes 1x, 2x, 4x and 8x identical apart from the rate.

export const PLAYOUT = {
  minLag: 0.18, // seconds between the newest frame and what is drawn
  maxLag: 1.6,
  jitterGain: 2.2,
  pull: 0.6, // seconds over which the clock closes a lag error
  maxSpeedUp: 1.5,
  maxSlowDown: 0.55,
  resync: 3, // seconds of lag beyond which the clock jumps instead of chasing
  // Displayed poses trail the clock by this much (critically damped follow).
  follow: 7,
  sameTickSpan: 0.25, // ticks of timeline a mid-tick correction is spread over
  history: 96, // frames retained for discrete-state lookup
};
const EPS = 1e-6;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class LiveClock {
  constructor() {
    this.reset(0);
    this.tickRate = 2.5; // simulated ticks per wall second, measured
    this.interval = 1 / this.tickRate;
    this.jitter = 0;
  }
  reset(tick = 0) {
    this.wall = 0;
    this.latest = tick;
    this.playTick = tick;
    this.lastPushAt = null;
    this.mark = null;
    this.history = [];
    this.lagSeconds = PLAYOUT.minLag;
    this.resets = (this.resets || 0) + 1;
  }
  // Ticks the displayed pose trails the playout clock by: the spring follows a
  // constant-speed ramp 2/follow seconds late.
  get trailTicks() {
    return (2 / PLAYOUT.follow) * this.tickRate;
  }
  get displayTick() {
    return this.playTick - this.trailTicks;
  }
  // Called once for every distinct authoritative frame, in arrival order.
  push(state) {
    const tick = state.tick ?? 0;
    if (!this.history.length) {
      this.reset(tick);
      this.history.push(state);
      return;
    }
    if (tick < this.latest - EPS) {
      // Time ran backwards (restart, replay scrub): cut, never glide.
      this.reset(tick);
      this.history.push(state);
      return;
    }
    if (tick > this.latest + EPS) {
      if (this.lastPushAt !== null) {
        const wall = this.wall - this.lastPushAt;
        if (wall > 0.004)
          this.jitter = lerp(
            this.jitter,
            Math.abs(wall - (tick - this.latest) / this.tickRate),
            0.2,
          );
      }
      this.lastPushAt = this.wall;
      this.measure(tick);
      this.latest = tick;
      this.history.push(state);
    } else {
      // A correction within the same tick replaces that frame.
      this.history[this.history.length - 1] = state;
    }
    if (this.history.length > PLAYOUT.history) this.history.shift();
  }
  // Ticks per wall second over windows long enough to ignore delivery bursts.
  measure(tick) {
    if (!this.mark) {
      this.mark = { wall: this.wall, tick };
      return;
    }
    const wall = this.wall - this.mark.wall;
    if (wall < 0.12) return;
    const rate = (tick - this.mark.tick) / wall;
    if (rate > 0 && Number.isFinite(rate)) {
      this.tickRate = lerp(this.tickRate, rate, 0.35);
      this.interval = 1 / this.tickRate;
    }
    this.mark = { wall: this.wall, tick };
  }
  advance(dt, running = true, reducedMotion = false) {
    dt = Math.max(0, dt);
    this.wall += dt;
    this.lagSeconds = clamp(
      this.interval * 1.25 + this.jitter * PLAYOUT.jitterGain,
      PLAYOUT.minLag,
      PLAYOUT.maxLag,
    );
    // A paused or stopped world plays out what it already has at a normal pace.
    const rate = running ? this.tickRate : Math.max(this.tickRate, 2.5);
    const wanted = running
      ? this.latest - this.lagSeconds * this.tickRate
      : this.latest;
    const error = wanted - this.playTick;
    if (reducedMotion || error > PLAYOUT.resync * Math.max(rate, 1))
      this.playTick = wanted;
    else if (dt > 0) {
      const gain = clamp(
        1 + error / (PLAYOUT.pull * Math.max(rate, 1)),
        PLAYOUT.maxSlowDown,
        PLAYOUT.maxSpeedUp,
      );
      this.playTick += rate * gain * dt;
    }
    this.playTick = Math.min(this.playTick, this.latest);
    return this.playTick;
  }
  // The authoritative frame that was current at the displayed time.
  shown(fallback = null) {
    return this.at(this.displayTick, fallback);
  }
  // The authoritative frame that was current at an arbitrary tick.
  at(tick, fallback = null) {
    if (!this.history.length) return fallback;
    const at = tick + EPS;
    let pick = this.history[0];
    for (const state of this.history) {
      if ((state.tick ?? 0) <= at) pick = state;
      else break;
    }
    return pick;
  }
  // Seconds the picture trails the newest frame; useful for diagnostics.
  get lag() {
    return (this.latest - this.displayTick) / Math.max(this.tickRate, 0.01);
  }
}
