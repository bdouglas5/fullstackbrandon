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

## Every frame reaches the renderer (`src/frame-bus.js`)

React batches state updates, so two frames landing close together used to
render as one and the playout clock never saw the first. `main.jsx` now also
pushes every SSE frame into `frameBus`; `Island.jsx` drains it each animation
frame, feeding `LiveClock` and every `ActorMotion` the intermediate frames in
order (with `dt = 0`) before the newest one. Replays do not read the bus.

## Smooth seams

- **Road legs** (`shared/engine.js`): a leg that starts off the road line
  (leaving a bay, door or yard) starts with negative progress for the along-road
  part and a `move.offset` that fades for the sideways part, instead of
  snapping onto the line. Docking steps are capped to walking pace.
- **Parked vehicles** (`Island.jsx` `park` / `drive`): the mesh eases into its
  bay when the rider steps off and blends from the bay to the rider's pose on
  mount (snapping only past 8 units, e.g. replay scrubs).
- **Mount / dismount figure** (`world-realism.js`): sideways offset and facing
  ease back to the pose at the end of the transition; any offset left when the
  server finishes first bleeds off over about 0.1 s.
- **Drawn route** (`world-motion.js` `movementPoints`): only road still ahead of
  the pose and short of the destination is drawn, so the path never detours back
  to a node already passed.
- **Hairpins** (`ActorMotion.nextCusp`): the follower brakes into a reversal or
  a tight turn on the queued path instead of carrying speed through it.
- **Stops**: the follower never carries more speed than the spring can shed
  before the playout point, and braking is ramped.

## Checking it

```
node scripts/motion-audit.mjs <speed> <seconds> stream <jitterSeconds>
node scripts/sim-audit.mjs <ticks> <seed>
node scripts/live-probe.mjs http://localhost:3000 <speed> <seconds>
node --test tests/live-clock.test.js tests/live-pacing.test.js
```

`live-probe` drives the real server in headless Chrome (needs the app running)
and reports frame gaps, per-frame pops of Brandon and vehicles, and
screen-space acceleration spikes.
`motion-audit` runs the real engine and real motion code at 60 fps with
network jitter and counts velocity jumps, stalls and teleports per channel
(Brandon, bike, van). `sim-audit` checks the authoritative frames for
teleporting people or parked vehicles.
