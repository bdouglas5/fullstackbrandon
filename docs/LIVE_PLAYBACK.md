> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Live playback: one clock, one frame, one pose

The server is authoritative and advances the world one tick at a time. The
renderer's job is to show that world *continuously*. Three rules keep it
smooth at 1x, 2x, 4x and 8x, over a jittery connection, and across every
walk / bike / van / skates change.

## 1. The server paces simulated time with the wall clock

`server/index.js` pumps every `TICK_MS / 8` milliseconds. Elapsed wall time is
turned into *credit* (`elapsed / TICK_MS × speed`); each whole credit is one
tick. The fraction carries over, so late timers never slow the pace and never
cause a catch-up burst (credit is capped, and time spent waiting for a Jev
decision is not repaid).

Every tick is its own SSE frame. At 8x the client receives 8 frames per
`TICK_MS`, evenly spaced, instead of one frame that jumps 8 ticks. (Above four
owed ticks per pump, i.e. fast-forward such as the overnight skip, only the
newest frame is sent; all frames are still saved for replay.)

## 2. The client plays frames back on one clock (`src/live-clock.js`)

Frames are not drawn on arrival. `LiveClock` keeps a short history and a
playout time a small cushion behind the newest frame:

- the cushion is `1.25 × frame interval + 2.2 × measured jitter`, clamped to
  0.18–1.6 s, so steady delivery gets a tight cushion and jittery delivery a
  deeper one;
- the clock follows that target *proportionally*: it runs between 0.55× and
  1.5× speed to close the gap, so a late frame slows the picture instead of
  stopping it and a burst never makes it jump;
- a gap of more than three seconds, or time running backwards (restart,
  replay scrub), cuts instead of gliding.

## 3. Pose and state come from the same moment

`ActorMotion` (`src/world-motion.js`) turns each frame into a segment on a
tick timeline. The displayed pose is a critically damped follower along that
path, so real stops in the simulation (yielding, boarding, docking) become
eased slow-downs and restarts. Nothing is extrapolated; the figure only ever
moves along positions the server has already confirmed.

The scene's *discrete* state (mounted mode, transition, which vehicle is
parked where, cargo, action) is read from the frame that matches the pose on
screen (`ActorMotion.shownTick` → `LiveClock.at(tick)`), not from the newest
frame. A bike is therefore parked exactly when the figure has reached the spot
where the server parked it, never early.

`Island.jsx` feeds the newest frame to every motion, then draws everything
from the frame at Brandon's `shownTick` (crew use their own).

## Engine rule: parked things stay where they were parked

Resting no longer relocates a vehicle that Brandon has already dismounted
from. A vehicle still under him is driven into the bay over the parking ticks.

## Checking it

```
node scripts/motion-audit.mjs <speed> <seconds> stream <jitterSeconds>
node scripts/sim-audit.mjs <ticks> <seed>
node --test tests/live-clock.test.js tests/live-pacing.test.js
```

`motion-audit` runs the real engine and real motion code at 60 fps with
network jitter and counts velocity jumps, stalls and teleports per channel
(Brandon, bike, van). `sim-audit` checks the authoritative frames for
teleporting people or parked vehicles.
