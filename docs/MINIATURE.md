> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Miniature scene and visitor clarity

Updated October 3, 2026.

The island always uses a tilt-shift lens. Its focus strip follows the camera target and remains present at the closest zoom. Two Gaussian blur passes soften the foreground and distance, while 4-sample offscreen antialiasing preserves cleaner geometry in focus. Device pixel ratio is capped at 2 on desktop and 1.5 on mobile, with a three-million-pixel scene limit for large displays.

Rain occupies fixed world coordinates across the islands and eases in and out over several seconds. Drops keep falling during the fade, while storm lighting, wind and ocean strength transition with them. Switching couriers cannot drag it across the scene. Clouds vary in position, height, scale, rotation and silhouette; their drift changes speed continuously with storms. The layout is repeatable so reloads do not move the world around.

Vehicle animation and dotted routes share one 3D trajectory, including road corners, gangways, sea routes, takeoff and landing. All vehicle noses point in the direction of travel. Crew walk to a dock or helipad before boarding. Following another courier selects that courier's route. Route paint uses a 3.2-pixel dashed stroke with its spacing anchored to the destination. Moving couriers trim the travelled portion without sliding the remaining dashes; normal depth testing lets the models cover the line.

Each business has one pending order and one notification at a time. Orders request one to three cases, all of which must be delivered together. Couriers choose the nearest reachable order they can fully supply with their current stock and handling equipment. It enters blue, turns green only when that order appears in the delivery history, then leaves after 1.8 seconds of confirmation and a 0.4-second exit. These timers use wall time, so pausing does not leave completed notices on screen. A new pending order replaces any lingering completion notice for the same business. Changing runs or seeking replay clears stale feedback.

The main island is now a rounded 32-by-24 town with eight separate business addresses and visible storefronts. Other islands, including the farm and reef, sit farther offshore. Shared coordinates align businesses, delivery nodes, docks, boat corridors, and aircraft pads. The road surface is a tessellated union without overlapping intersection faces; bridge tops align with the courier and route height.

Browser pinch and zoom shortcuts are consumed at the document level, including over UI panels. Ordinary panel scrolling and camera zoom over the scene remain available. Character limbs ease between walking and resting poses.

New visitors see an introduction that explains the business, what AI chooses, which outcomes are simulated, and how to intervene. Start and Look around stay visible on small screens. Dismissal is saved locally; How this works reopens the explanation. The rest of the interface uses concrete language, with implementation detail available through Under the hood. Mobile Play, the Brandon inspector, and Open business have separate hit areas.

## Verification evidence

Previous miniature pass: production build succeeded, 84 unit/engine/API checks and 22 browser scenarios passed, and formatting passed. See `TOWN_UPDATE.md` for the expanded-island follow-up and current evidence.

- `tests/environment.test.js`: rain stays fixed when its subject changes; cloud layout variety and reduced-motion behavior.
- `tests/vehicle-motion.test.js`: road, sea and air paths through complete simulated careers, with forward-facing movement for Brandon and crew; boarding visibility.
- `tests/order-notifications.test.js`: actual engine fulfillment, repeat orders, missed snapshots, pause-time removal, replay and reset.
- `tests/miniature.spec.js`: maximum zoom, aircraft route height, and an actual blue-to-green delivery through the running server.
- `tests/onboarding.spec.js`: first visit, working Start, remembered dismissal, keyboard focus, responsive action visibility and mobile hit targets.
- `evidence/miniature-unit-tests.txt`, `evidence/miniature-browser-tests.txt`, and `evidence/miniature-format-check.txt`: current acceptance output.
- `evidence/miniature-retina-performance.json`: a three-second local Apple M4 Max sample at a 2560 × 1600 viewport and DPR 2. The rendered scene stayed near 30 fps with no context loss or page errors. This is a short desktop sample, not a physical-phone or sustained-performance claim.

Screenshots include `miniature-overview.png`, `miniature-helicopter-close.png`, the `order-*.png` lifecycle, `miniature-introduction-desktop.png`, `miniature-introduction-mobile.png`, and `mobile-controls-fixed.png` in `evidence/`.

This update is available in the local preview; it has not been published.
