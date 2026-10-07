> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# World polish — version 3.1.0

Implemented and verified October 3, 2026 (America/Los_Angeles). The normal local address is **http://localhost:3000**. The configured request origin is `localhost`, so use that hostname for interactive controls.

## Experience

- The introduction is a full project popup describing Brandon Douglas’s AI implementation work: observe → Jev chooses → validate and act → record the outcome. The decision inspector and implementation view remain available.
- New visitor careers request Jev automatically; the controller picker is removed. Provider failures and allowance limits retain the existing explicitly labeled rules fallback. The internal deterministic controller remains available for evaluation and replay fixtures.
- The business console is a live popup. The camera shifts its framing to retain the visible world. On phones it becomes a bottom sheet with persistent close and navigation controls.
- Workshop and fleet entries use actual editable GLB models. They rotate slowly, support pointer dragging and keyboard arrows, and load on demand through one shared preview renderer. Suggestions remain queued investments, not instantaneous purchases.
- Removed the atlas/explore control, manual ambient-motion switch, lunch-rush intervention, home-bridge closure button and power-cut button. Operating-system reduced-motion preferences remain honored. The remaining plot twists have descriptions of their actual effects. Legacy engine disruption commands remain for historical replay and evaluation.
- Businesses appear in the operations list as orders first arrive, and remain discovered afterward. Customer notifications show outstanding case counts. Location labels appear near Brandon.

## World and animation

Editable source lives in `src/world.js`, `src/world-details.js`, and `src/world-polish.js`. No third-party model licensing or runtime model CDN is required.

Sunset Bay now has a stepped seven-floor hotel with balconies, recessed glazing, rooftop pergola, pool tiles, loungers, towels and parasols. Reef Beach Club has a furnished deck, bar, stools, drinks, lighting and palms. Juniper has fishing nets and dockside supplies; Dill Ridge has trail fencing; Copperport has cornices and rooftop tanks; Festival Key has stage speakers and bunting. The district shops have awnings, steps, planters and shoreline details. Trees vary deterministically in scale and rotation, and the cloud population increased from four to twelve.

The sailboat gained teak planks, lifelines, rigging, a tiller, locker and life ring. All ten gadgets gained distinct mechanical details, and the exported models were regenerated. Gadgets are bought, crafted and upgraded at Brine Works, with an entry transition, scaffold and construction particles.

Brandon, employees and vehicle riders use the same character scale. Ground-vehicle occupants stay seated during delivery stops. Pedestrians follow street paths distributed across the world and yield toward the road edge near couriers. Vehicles can visually reverse with a slower interpolation instead of abruptly turning through 180 degrees. The authoritative road and voyage simulation remains responsible for actual travel.

`src/world-shaders.js` adds vertex waves, analytic water highlights and a five-sample edge blur. Palms and trees sway in the wind; storms add stronger movement and slanted rain streaks. Route lines sit above the road/water and remain readable with depth-safe rendering.

## Reviews

A mean wait of up to 165 simulation ticks earns five stars, including the requested normal delivery around 150. Lower ratings use longer wait bands. Comments never speak in ticks. Each of five rating bands has 1,000 unique combinations of authored sentence fragments (5,000 total), selected deterministically per customer. Reviews remain simulated judgments based on fulfilled orders, not testimonials or model reasoning.

## Verification

- Production build succeeds; the Three.js chunk retains Vite’s existing large-chunk advisory.
- 68/68 automated simulation, server, persistence, provider and scene checks pass. See `evidence/polish-tests.txt`.
- 15/15 production browser flows pass, including mobile, every transport, independent crew aircraft, replay, reviews and retirement. See `evidence/polish-browser-tests.txt` and `evidence/browser-results.json`.
- Additional checks cover review uniqueness and scoring, business discovery, workshop purchase destinations, pedestrian yielding, seated riders and reversing. Scene tests check loaded-van road clearance, helicopter landing clearance at sixteen headings, shore routes and finite geometry.
- A browser-observed live Jev sample completed **10 decisions, zero fallbacks**, reached the bicycle and served real simulated orders. This is a short live integration check, not a full AI retirement benchmark. Sanitized record: `evidence/polish-live-jev.json`.
- The hardware browser measured **29.9 scene frames/second**, 90 scene frames over 3.014 seconds, using ANGLE Metal on Apple M4 Max at 1280 × 633. The scene targets 30 fps. See `evidence/polish-metal-performance.json`. This is a short local measurement; other hardware and sustained mobile performance are unverified.
- Townspeople and clouds use shared geometry instancing; static scenery is batched by material. Catalog previews share one WebGL context and skip offscreen models. The scene suspends when hidden or scrolled out of view. No multi-megabyte island GLB is downloaded to render the main world.

The app is running locally, with a database backup saved before restart. Earlier saved careers remain on disk; incompatible version 3.0 worlds open as a new 3.1 career. Public deployment was not part of this change.
