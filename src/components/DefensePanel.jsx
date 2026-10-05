import { WEAPONS } from "../../shared/combat.js";
export default function DefensePanel({ state, act, locked }) {
  const defense = state.defense || {
    weapon: "fists",
    owned: ["fists"],
    defeated: 0,
  };
  const live = (state.zombies || []).filter((z) => z.hp > 0).length;
  const fighting = !!state.brandon.combat;
  return (
    <div className="defense-panel">
      <div className="defense-intro">
        <h3>Defense</h3>
        <p role="status">
          {fighting
            ? `${state.brandon.combat.phase === "attack" ? "Fighting" : state.brandon.combat.phase === "dismount" ? "Stepping out" : "Returning to delivery"} · ${WEAPONS[defense.weapon].name}`
            : `Equipped: ${WEAPONS[defense.weapon].name}`}{" "}
          · {defense.defeated} defeated
        </p>
        <button
          className="text-button"
          disabled={locked || fighting || defense.weapon === "fists"}
          onClick={() => act("equip_weapon", "fists")}
        >
          Equip bare fists
        </button>
      </div>
      <div className="defense-weapons">
        {Object.entries(WEAPONS)
          .filter(([id]) => id !== "fists")
          .map(([id, weapon], index) => {
            const owned = defense.owned.includes(id),
              equipped = defense.weapon === id;
            const unlocked = defense.owned.includes(weapon.prerequisite);
            return (
              <article className="defense-card" key={id}>
                <span className="eyebrow">
                  {owned
                    ? "OWNED"
                    : `TIER ${index + 1} · ${weapon.price} COINS`}
                  {id === "particle_gun" ? " · FINAL UPGRADE" : ""}
                </span>
                <h3>{weapon.name}</h3>
                <p>{weapon.description}</p>
                <p>
                  {weapon.damage} damage · hits {weapon.targets}{" "}
                  {weapon.targets === 1 ? "zombie" : "zombies"}
                  <br />
                  Attack every {weapon.interval} simulation ticks
                </p>
                {owned ? (
                  <button
                    className="secondary-button"
                    disabled={locked || fighting || equipped}
                    onClick={() => act("equip_weapon", id)}
                  >
                    {equipped ? "Equipped" : "Equip"}
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={
                      locked ||
                      fighting ||
                      !unlocked ||
                      state.money < weapon.price
                    }
                    onClick={() => act("buy_weapon", id)}
                  >
                    {!unlocked
                      ? `Get ${WEAPONS[weapon.prerequisite].name.toLowerCase()} first`
                      : `Buy & equip · ${weapon.price} coins`}
                  </button>
                )}
              </article>
            );
          })}
      </div>
    </div>
  );
}
