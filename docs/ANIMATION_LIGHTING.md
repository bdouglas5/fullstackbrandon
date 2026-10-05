> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Model, animation and nighttime lighting polish

Updated October 3, 2026 (America/Los_Angeles). Available in the local preview at http://localhost:3000.

## Models and motion

The original miniature art direction now has tailored character clothing, coherent head and elbow rigs, stitched bags and footwear, detailed bicycle fittings, van coachwork, helicopter cockpit framing and instruments, and a curved, stitched sail. Glass, enamel, brass, cloth, wood and rubber have distinct material finishes. Editable source is in `src/model-finishes.js`, with regenerated GLB catalog models in `public/models/`.

`src/world-animation.js` adds breathing, head attention, coordinated gait, bent knees and elbows, packing gestures and parcel follow-through. Mounted riders keep their seated pose at stops. Bicycles lean into turns; vans have suspension and weight transfer; aircraft bank and accelerate their rotors; boats rock, trim their sails and move their tillers. Crew copies retain the same articulation. Twenty-seven small motion rigs animate palms, pennants and hanging signs.

`src/world-effects.js` adds travel-driven dust, boat foam, jet exhaust and faint landing wash. All couriers share one bounded 180-particle buffer. Paused or stationary couriers emit nothing. Reduced-motion preferences freeze decorative animation and clear travel particles. Visual motion observes the existing simulation and does not change its routes, economy or saved progress.

## Nighttime

`src/world-lighting.js` adds 48 authored light sources, warm windows and lantern halos, soft radial light pools, vehicle navigation lamps, van headlights and a slowly sweeping lighthouse beam. Six nearby point lights shade real scenery; the light budget follows the viewed district. Daylight smoothly controls the lights, while cool moonlight keeps buildings readable. Hidden vehicles and unowned gadgets cannot leave floating glow points.

Bloom runs below scene resolution, before the existing miniature lens. Desktop shadows use a 2048-pixel map and follow the viewed district with a stable, snapped anchor; mobile uses 1024 pixels. Weather, water, stars and fireflies retain reduced-motion support.

## Audit and verification

- Production build and formatting pass. The existing Three.js large-chunk advisory remains.
- 119 automated checks pass, including routing, geometry clearance, joint and vehicle motion, cloning, reduced motion, lighting transitions, particle lifetimes, persistence and server behavior. Output: `evidence/animation-night-unit-tests.txt`.
- All 27 production browser scenarios pass on the final build, including every transport, crew aircraft, replay, deliveries, onboarding, day/night pixel checks, storm lighting and reduced-motion mobile. Output: `evidence/animation-night-browser-tests.txt`; structured results: `evidence/browser-results.json`.
- Nine hardware-browser scenarios cover daytime, nighttime, reduced-motion mobile and every vehicle, with no browser errors or horizontal overflow. Screenshots and measurements: `evidence/polish-verified-hardware.json` and `evidence/polish-verified-*.png`.
- The actual moving-nighttime sample rendered 286 scene frames in 9.553 seconds, approximately 29.9 fps at the scene's 30 fps cap, using ANGLE Metal on an Apple M4 Max at 1280 × 900. Pose samples confirm pedalling, spinning wheels, bicycle lean, world travel and emitted particles. See `evidence/polish-verified-motion.json` and `evidence/polish-videos/night-bike-motion.webm`.
- Browser fixtures use a separate test database or engine-derived state held in the browser. They do not reset or alter the user's saved career.

The audit found and fixed incompatible UV layouts in static scenery batching, a lighthouse shader value that could contaminate bloom and produce a black frame on Metal, duplicate streetlamp poles, hidden-object glow leakage, and production font subsets being inlined against the existing content security policy. Browser visual checks now inspect rendered pixels as well as errors and frame counters.

These are local checks and short hardware samples. Public deployment, sustained performance and physical-phone testing are outside this verification.
