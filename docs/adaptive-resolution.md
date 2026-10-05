# Adaptive scene resolution

The island targets 60 rendered frames per second. `src/adaptive-resolution.js`
measures the time between delivered scene frames, so GPU delays, browser scheduling,
and scene update work all contribute. It replaces the previous automatic 30 FPS cap.

The scene starts at its existing density/pixel-budget ceiling (up to 2× density,
1.5× for narrow scenes, at most 3 million pixels), then uses five relative linear
resolution levels: 100%, 85%, 70%, 58%, and 45%. At the lowest level the render buffer
contains about 20% of the original pixels. Canvas layout, HTML labels, controls,
world simulation, and animation updates remain intact. The existing lens detects
pixel ratio changes and resizes its post-processing buffers on the next render.

After a three-second startup/resize/resume grace period, one-second sample windows
trim the largest and smallest 10% of frame intervals to ignore isolated stalls.
Two consecutive windows below 54 FPS lower resolution by one step. Eight consecutive
windows at or above 58 FPS, with scene CPU work below 13 ms, allow one step upward.
Every change restarts the grace period. Recovery waits at least ten seconds after
a reduction; an unsuccessful upward probe waits thirty seconds before another try.
Sampling pauses when the scene leaves the viewport or the document is hidden.

A small top-right status notice shows the direction, measured FPS before the change,
and new resolution percentage for 4.5 seconds. It is noninteractive and announced
politely to assistive technology. Canvas data attributes expose `resolutionScale`,
`pixelRatio`, `measuredFps`, and `targetFps` for inspection.

60 FPS is a target, not a guarantee: reducing pixels helps GPU fill/shader work but
cannot resolve every CPU bottleneck or a display/browser capped below 60 Hz. The
minimum resolution bounds image softness. This change keeps scene geometry and all
interactions; further geometry/detail tiers would require separate profiling.

Validation:

- `node --test tests/adaptive-resolution.test.js`
- `npm run build`
- `npx playwright test --config playwright.resolution.config.js`

The isolated browser checks force slower frame delivery at desktop and narrow
viewport sizes, checking buffer reduction, stable CSS size, the status notice,
continued rendering, and camera zoom. Controller tests cover upward recovery,
anti-oscillation, reset behavior, bounded resolution, and extreme frame delays.
Browser tests use installed Chrome with deliberately limited frame delivery and
do not establish physical-device FPS.
