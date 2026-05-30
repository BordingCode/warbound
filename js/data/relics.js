// Relics: run-long passive blessings, drafted at act boundaries (Slay-the-Spire style).
// Effects are read by run.js (economy/board/lives) and combat.js (team combat mods).
// Keep each one a single clear verb so builds feel distinct.

export const RELICS = {
  warchest:    { name: 'War Chest', icon: '💰', desc: '+2 gold every round.', econ: { goldPerRound: 2 } },
  usurer:      { name: "Usurer's Ledger", icon: '🏦', desc: 'Interest cap +3 (save up to 80g).', econ: { interestCap: 3 } },
  free_scout:  { name: 'Spyglass', icon: '🔭', desc: 'One free reroll each planning phase.', econ: { freeRerolls: 1 } },
  banner:      { name: 'Rallying Banner', icon: '🚩', desc: '+1 board slot.', econ: { boardPlus: 1 } },
  whetstone:   { name: 'Whetstone', icon: '🪨', desc: 'Your whole team: +14% Attack Damage.', combat: { ad: 0.14 } },
  bulwark:     { name: 'Bulwark', icon: '🧱', desc: 'Your whole team: +16% max HP.', combat: { hp: 0.16 } },
  grimoire:    { name: 'Shared Grimoire', icon: '📖', desc: 'Your whole team: +35 Ability Power.', combat: { ap: 35 } },
  aegis:       { name: 'Aegis Charm', icon: '🔰', desc: 'Your whole team starts with a 180 shield.', combat: { shield: 180 } },
  veteran:     { name: "Veteran's Rite", icon: '🎖', desc: '+1 max life (heal 1 now).', once: { lifeMax: 1 } },
  scholar:     { name: "Scholar's Tome", icon: '📜', desc: '+3 XP every round.', econ: { xpPerRound: 3 } },
  swiftboots:  { name: 'Swift Boots', icon: '🥾', desc: 'Your whole team: +12% Attack Speed.', combat: { as: 0.12 } },
  vampiric:    { name: 'Vampiric Sigil', icon: '🩸', desc: 'Your whole team heals 12% of attack damage.', combat: { vamp: 0.12 } },
  ironhide:    { name: 'Ironhide Totem', icon: '🪖', desc: 'Your whole team: +22 Armor & Magic Resist.', combat: { armor: 22, mr: 22 } },
  glasscannon: { name: 'Glass Cannon', icon: '💎', desc: 'Your whole team: +28% Attack Damage, but -10% max HP.', combat: { ad: 0.28, hp: -0.10 } },
  spiked:      { name: 'Spiked Carapace', icon: '🦔', desc: 'Your whole team reflects 14% of attack damage taken.', combat: { thorns: 0.14 } },
};
export const RELIC_IDS = Object.keys(RELICS);

// Sum the combat mods granted by a set of owned relic ids.
export function relicCombatMods(ids = []) {
  const m = {};
  for (const id of ids) { const r = RELICS[id]; if (r && r.combat) for (const [k, v] of Object.entries(r.combat)) m[k] = (m[k] || 0) + v; }
  return m;
}
export function relicEcon(ids = []) {
  const e = { goldPerRound: 0, interestCap: 0, freeRerolls: 0, boardPlus: 0, xpPerRound: 0 };
  for (const id of ids) { const r = RELICS[id]; if (r && r.econ) for (const [k, v] of Object.entries(r.econ)) e[k] = (e[k] || 0) + v; }
  return e;
}
