# Building the world around the rules

[Project](../README.md) · [Simulation](SIMULATION.md) · [Architecture](ARCHITECTURE.md)

The world should look like a miniature you want to pick up. It should also tell you what the simulation is doing. I built the scene from procedural geometry so I can work on that relationship directly.

## An editable scene, not a flat picture

Buildings, terrain, shoreline, vegetation, props, characters, and vehicles are constructed as named mesh groups. The structure makes it possible to change proportions, material treatment, pose, and articulation in source.

[`scripts/export-models.js`](../scripts/export-models.js) generates reusable GLB assets from that structure. The runtime separately supplies application lighting, ocean treatment, and canvas signage. A model export is not the entire live scene.

| Area | Main source |
| --- | --- |
| World assembly | [`world.js`](../src/world.js), [`world-layout.js`](../src/world-layout.js), [`world-buildings.js`](../src/world-buildings.js) |
| Toy proportions and materials | [`toy-scale.js`](../src/toy-scale.js), [`toy-kit.js`](../src/toy-kit.js), [`toy-shading.js`](../src/toy-shading.js), [`model-finishes.js`](../src/model-finishes.js) |
| Character and cast | [`figurine.js`](../src/figurine.js), [`cast.js`](../src/cast.js), [`character-motion.js`](../src/character-motion.js) |
| Transport | [`toy-transport.js`](../src/toy-transport.js), [`toy-vehicles.js`](../src/toy-vehicles.js), [`world-motion.js`](../src/world-motion.js) |
| Water and shoreline | [`world-water.js`](../src/world-water.js), [`world-shoreline.js`](../src/world-shoreline.js), [`shoreline.js`](../shared/shoreline.js) |
| Weather and light | [`world-atmosphere.js`](../src/world-atmosphere.js), [`world-rain.js`](../src/world-rain.js), [`world-thunder.js`](../src/world-thunder.js), [`world-lighting.js`](../src/world-lighting.js) |
| Rendering lifecycle | [`Island.jsx`](../src/Island.jsx), [`optimize-world.js`](../src/optimize-world.js), [`adaptive-resolution.js`](../src/adaptive-resolution.js) |

## One world, two clocks

The simulation advances through authoritative ticks. The browser renders at its own cadence and interpolates between state updates. Playback speed changes the relationship between simulated time and elapsed time; animation still needs a continuous journey.

```mermaid
flowchart TD
    State[Authoritative state updates] --> Clock[Live clock and interpolation]
    Clock --> Actors[Actor positions and motion]
    Actors --> Pose[Walking, riding, carrying, boarding]
    State --> Weather[Saved environment state]
    Weather --> Effects[Rain, clouds, light, lightning]
    Actors --> Routes[Route overlays and follow camera]
    Pose --> Frame[Rendered scene]
    Effects --> Frame
    Routes --> Frame
```

The difficult cases are transitions: a new route, an interruption, parking, dismounting, boarding, entry, a replay seek, and returning from a sea voyage. Position, pose, cargo, equipment visibility, and camera tracking need to stay consistent across those events.

Inspect [`src/live-clock.js`](../src/live-clock.js), [`src/navigation-path.js`](../src/navigation-path.js), [`src/world-motion.js`](../src/world-motion.js), and the live-clock, continuous-navigation, character-motion, and vehicle-motion tests.

## A destination marker is a promise

A route overlay should terminate at the actual destination approach. A marker pointing to the town center while the courier serves a different building creates a misleading interface even if the inventory update is correct.

Shared route and shoreline rules help keep scene movement aligned with the simulation. Aircraft need departure and landing clearance; boats need water paths and shore handoffs. Foot traffic and vehicles have different footprints, and junction behavior has to avoid creating deadlocks between those modes.

The traffic model uses swept distance checks so a fast actor cannot simply step through a slower actor between samples. It also handles reservations and service approaches. These mechanics are designed for this world rather than general physical simulation.

## Weather belongs to the saved run

Day/night and weather are simulation state. The scene translates them into visual conditions: light and sky changes, rain, clouds, fog, storm intensity, lightning, and optional delayed synthesized thunder.

Automatic fronts remain the default. Temporary overrides expire in simulated time. Thunder defaults off and requires browser interaction before audio can play. Reduced-motion handling changes the presentation of effects without making the server's weather disappear.

This creates a useful design constraint: state must remain readable in bright daylight, night, rain, and storms. A polished sunny screenshot is only one condition.

## Make detail affordable

The runtime optimization pass batches static meshes by material. Moving characters, customer actors, cargo, vehicles, clouds, and other dynamic elements remain independently controllable. Adaptive resolution provides another lever when rendering becomes expensive.

Optimization needs to preserve selection, labels, animation, and scene identity. Lower draw calls alone are not the product goal; a visitor still needs to recognize the courier and understand the task.

The repository includes tests for geometry, shading, optimization, effects, lighting, camera motion, and adaptive resolution. Browser tests exercise the rendered experience. Hardware FPS, sustained device performance, mobile battery use, and human readability require their own measurements.

## How I'd inspect a visual change

1. Observe the world at 1× and accelerated playback.
2. Follow a complete delivery, including the building approach and return to equipment.
3. Compare clear day, night, rain, storm, and reduced-motion states.
4. Exercise follow camera, orbit, zoom, route overlays, selection, and replay seeking.
5. Check desktop and a narrow viewport; test real devices separately when making device-performance claims.

The scene is the explanation people encounter first. Keeping it consistent with the rules is part of the engineering.
