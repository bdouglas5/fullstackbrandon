> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Expanded town and order polish

Updated October 3, 2026.

The main island is a rounded 32 × 24 town. Eight home businesses each have their own delivery node, storefront, shopkeeper and sign; four new customers join the existing cast. The five expansion islands, Pickle Cay and Reef Island sit farther offshore. Shared layout coordinates drive scene geometry and navigation.

Road intersections are one tessellated surface, avoiding coplanar road slabs. Bridges meet the road height. Shop roofs stay inside the coastline; service scenery, palms, docks and air pads follow the new layout. Shop side and rear windows make the town readable from different camera angles.

Every business can have one pending order, containing one to three cases. Couriers choose the nearest reachable order they can fully supply with their current stock and equipment. Deliveries consume the complete quantity and record one completed order; inventory separately counts cases delivered. Employees can physically collect stock for the packing room. One notification per business shows the requested case count, confirms delivery, then disappears on wall time.

Rain fades in and out while drops keep falling. Lighting, ocean and wind transitions follow the same gradual storm strength. Walking limbs ease into their resting pose. The tilt-shift lens was restored to the previous fixed effect following the user's correction; there is no increased blur tied to zoom.

The route uses a 3.2-pixel stroke. Its dash phase is anchored to the destination, so remaining dashes stay fixed as the courier advances. Depth testing lets models cover the line. Browser pinch and zoom shortcuts are blocked over the page while normal panel scrolling and scene camera zoom remain available.

Saved careers retain stock and progress. Legacy duplicate requests merge into a single order preserving the quantity. Legacy addresses update to the new map; an old voyage returns to the relocated home dock with cargo preserved before replanning. Current-layout voyages remain intact. A consistent SQLite backup was taken before restarting the local preview.

## Evidence

- `evidence/town-unit-tests.txt`: 103 passing engine, API and unit checks, including full careers, inventory conservation, migration, nearest complete orders and notice lifecycle.
- `evidence/town-browser-tests.txt`: 23 passing end-to-end browser scenarios for desktop, mobile, delivery feedback, camera controls, vehicles, crew and replay.
- `evidence/town-weather-browser.json`: actual rendered rain intensity samples during onset and clearing.
- `evidence/town-render-sample.json`: three-second local sample near 30 fps, zero duplicate customer notices, page scale 1, and no error overlay. This is a short desktop sample, not a sustained or physical-mobile performance measurement.
- `evidence/town-final.png`: final local visual review.
- `evidence/town-build.txt`, `evidence/town-format-check.txt`: build and formatting results.
- `evidence/town-models.txt`: regenerated GLB export results; procedural source remains editable.

Available in the local preview. No publishing was performed.
