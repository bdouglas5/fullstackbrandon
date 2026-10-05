# Fullstack Brandon

By Brandon Douglas.

I built a little 3D version of myself running a pickle business. You can watch him make deliveries, suggest what he should buy next, or close the bridge and see how he handles it. The decision inspector and replay let you look back at what he chose and how it worked out.

He starts in a garage with zero coins, six prepaid cases, and no vehicle. Deliveries pay for more stock, equipment, construction, employees, and their own transport. Later he can negotiate for a factory island and start growing, fermenting, and packing local produce. I added rocket skates and a teleporter to the fleet, but he still has to earn the money for them.

I built the procedural world in Three.js and the interface in React. Node and Express handle the API and simulation. SQLite keeps guest worlds, replay frames, checkpoints, achievement collections, and provider usage.

Jev chooses from actions the engine already allows. The engine handles the route, inventory, costs, and timing. If a provider request fails or hits its allowance, the rules controller takes over and the interface tells you. Saved lessons give later requests context from previous outcomes and feedback.

The delivery details matter to me: the shipment has to reach the harbor, the courier has to carry the stock, and the handoff has to happen at the right building. I want somebody following Brandon to be able to understand what changed in the business just by watching him work.

The repository includes the source, tests, evaluation scripts, CI, backup tooling, and deployment instructions. The current setup uses one Node process and a persistent SQLite disk. Public hosting, real-device performance, and human playtesting have separate verification steps.

[Read the full case study and explore the source](https://github.com/bdouglas5/fullstackbrandon).
