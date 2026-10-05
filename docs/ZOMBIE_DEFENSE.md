> **Development history:** This document records an earlier brief or implementation pass. Its test counts and local process status are historical. Raw `evidence/` artifacts are excluded from the public repository. See [current verification](VERIFICATION.md) and the [project overview](../README.md).

# Zombie delivery encounters

Visitors can click **Spawn Zombie** on the world, or in **Open the business → Zombie defense**. One click adds one zombie; the engine rejects a sixth live zombie. Paused worlds keep the new zombies queued until resumed. Brandon clears encounters automatically and resumes his exact interrupted delivery, cargo, order assignment, and chosen transport. Crew deliveries and business time continue, so the delay has a real delivery consequence.

Zombies wait for safe dry land during crossings or transport transitions. Brandon steps away from parked transport, attacks on foot, then returns to his trip. Zombies use the existing sculpted townsfolk kit, with green paint, ragged trim, yellow eyes, scars, and outstretched arms.

The paid progression is capped at four upgrades:

| Upgrade | Cost | Damage | Targets per attack | Attack interval |
| --- | ---: | ---: | ---: | ---: |
| Bare fists | Free | 1 | 1 | 4 ticks |
| Machete | 40 coins | 3 | 1 | 3 ticks |
| Gun | 90 coins | 6 | 1 | 2 ticks |
| Zombie spray | 170 coins | 6 | 3 | 2 ticks |
| Particle gun | 280 coins | 6 | 5 | 1 tick |

Each upgrade requires owning the previous tier, costs business coins, and equips on purchase. Equipment cannot change mid-encounter. Owned weapons and bare fists can be re-equipped. There are no upgrades beyond the particle gun. Spray emits green particles; particle-gun kills dissolve into cyan particles. Reduced motion suppresses particles and repeated swings. Combat and purchases persist in saves and recorded interventions, and replay deterministically.

## Fighting feel

Brandon visibly holds each weapon in his right hand: a curved machete, a toy pistol with an orange safety tip, a green tank sprayer with a pressure gauge, and a white particle gun with glowing cyan rings and a charge orb. Each has its own animation. Fists alternate jab, cross and a heavy hook. The machete winds up for an overhead chop then a backhand sweep. The gun and particle gun use a two-handed grip with recoil, and the spray is braced and sweeps the lane. The blow connects after the wind-up, not on the tick edge.

Effects come from a small particle simulation (`src/combat-fx.js`: velocity, drag, gravity, ground bounce, soft sprites). The gun gives a muzzle flash, sparks, rising smoke and an ejected brass casing that bounces on the pavement, plus a tracer bolt. The spray emits a continuous cone of green mist with bright droplets and splashes on zombies. The particle gun draws charge motes into its orb, fires a cyan spark cone and fanned bolts, and disintegrates zombies into drifting motes. Reduced motion turns all of this off. `data-combat-fx` on the canvas reports the live count.

A struck zombie flashes red, recoils away from Brandon with a hop, staggers for a tick, and is knocked back (simulated, so replays agree). Every third melee blow is a finisher with extra knockback and stagger but the same damage. A defeated zombie stiffens and topples onto its side like a Minecraft mob, then pops into a puff; particle-gun kills still dissolve. Reduced motion skips swings, sparks and the topple animation.

Implementation: `shared/combat.js`, `src/world-combat.js`, and `src/components/DefensePanel.jsx`. Tests: `tests/combat.test.js`, `tests/world-combat.test.js`, and `tests/zombies.spec.js`.
