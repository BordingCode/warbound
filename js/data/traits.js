// Trait definitions: 6 Origins + 6 Classes. Dota-leaning breakpoints (big classes 3/6,
// races 2/4, Dragon elite 1/2). `effect` is data the combat sim reads; `bonuses` keyed by
// the COUNT threshold reached. `kind` flags behaviour traits vs flat-stat glue.
// Colours drive the synergy panel tier chips + damage-type palette.

export const TRAITS = {
  // ---------- ORIGINS ----------
  human: {
    name: 'Human', axis: 'origin', kind: 'glue', color: '#6fb1ff',
    desc: 'Disciplined ranks channel mana to the whole warband.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { manaRegen: 4 }, 4: { manaRegen: 7 }, 6: { manaRegen: 10 } },
    bonusText: { 2: '+4 mana/s to all allies', 4: '+7 mana/s', 6: '+10 mana/s' },
  },
  undead: {
    name: 'Undead', axis: 'origin', kind: 'behaviour', color: '#8cff9e',
    desc: 'Slain Undead claw back from the grave, once.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { revivePct: 0.30 }, 4: { revivePct: 0.50 }, 6: { revivePct: 0.70 } },
    bonusText: { 2: 'Revive once at 30% HP', 4: 'at 50% HP', 6: 'at 70% HP' },
  },
  elf: {
    name: 'Elf', axis: 'origin', kind: 'behaviour', color: '#54e6c0',
    desc: 'Elves slip past blows and start shielded.',
    breakpoints: [2, 4],
    bonuses: { 2: { dodge: 0.20, shield: 120 }, 4: { dodge: 0.35, shield: 220 } },
    bonusText: { 2: '20% dodge + 120 shield', 4: '35% dodge + 220 shield' },
  },
  demon: {
    name: 'Demon', axis: 'origin', kind: 'behaviour', color: '#ff5a3c',
    desc: 'Demon strikes scorch mana and flesh (soft-counters casters).',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { burn: 18, manaBurn: 6 }, 4: { burn: 34, manaBurn: 12 }, 6: { burn: 60, manaBurn: 20 } },
    bonusText: { 2: 'Attacks burn + drain mana', 4: 'stronger burn', 6: 'searing burn' },
  },
  beast: {
    name: 'Beast', axis: 'origin', kind: 'behaviour', color: '#ffb15a',
    desc: 'Beasts grow more ferocious as the fight drags on.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ferocity: 0.04 }, 4: { ferocity: 0.07 }, 6: { ferocity: 0.11 } },
    bonusText: { 2: '+4% atk speed per strike', 4: '+7%', 6: '+11% (whole team)' },
  },
  dragon: {
    name: 'Dragon', axis: 'origin', kind: 'behaviour', color: '#ffd24a',
    desc: 'Few but mighty — dragons shrug off magic.',
    breakpoints: [1, 2],
    bonuses: { 1: { mr: 28 }, 2: { mr: 50, breath: true } },
    bonusText: { 1: '+28 magic resist', 2: '+50 MR + dragon breath' },
  },

  // ---------- CLASSES ----------
  knight: {
    name: 'Knight', axis: 'class', kind: 'glue', color: '#b9c4d0',
    desc: 'A wall that ignores a flat chunk of every hit.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { block: 28 }, 4: { block: 50 }, 6: { block: 90 } },
    bonusText: { 2: 'Ignore 15 dmg/hit', 4: 'ignore 30', 6: 'ignore 60' },
  },
  mage: {
    name: 'Mage', axis: 'class', kind: 'glue', color: '#c79bff',
    desc: 'Channelled power amplifies all spell damage.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ap: 40 }, 4: { ap: 120 }, 6: { ap: 200 } },
    bonusText: { 2: '+40 ability power', 4: '+120 AP', 6: '+200 AP' },
  },
  ranger: {
    name: 'Ranger', axis: 'class', kind: 'behaviour', color: '#9be86a',
    desc: 'Rangers loose bursts of rapid fire.',
    breakpoints: [2, 4],
    bonuses: { 2: { rangerAS: 0.40 }, 4: { rangerAS: 0.70 } },
    bonusText: { 2: '40% chance: +atk speed burst', 4: '70% chance' },
  },
  assassin: {
    name: 'Assassin', axis: 'class', kind: 'behaviour', color: '#ff7eb6',
    desc: 'Leap to the back line; lethal crits.',
    breakpoints: [2, 4],
    bonuses: { 2: { critChance: 0.20, critDmg: 0.75 }, 4: { critChance: 0.35, critDmg: 1.50 } },
    bonusText: { 2: 'Dive + 20% crit (+75% dmg)', 4: 'Dive + 35% crit (+150%)' },
  },
  healer: {
    name: 'Healer', axis: 'class', kind: 'glue', color: '#7affd6',
    desc: 'Amplifies all healing and mends the wounded.',
    breakpoints: [2, 4],
    bonuses: { 2: { healAmp: 0.20, regen: 8 }, 4: { healAmp: 0.40, regen: 16 } },
    bonusText: { 2: '+20% healing + regen', 4: '+40% healing + regen' },
  },
  summoner: {
    name: 'Summoner', axis: 'class', kind: 'behaviour', color: '#ffcf5a',
    desc: 'Summoned creatures hit harder and last longer.',
    breakpoints: [2, 4],
    bonuses: { 2: { summonPower: 0.30 }, 4: { summonPower: 0.60 } },
    bonusText: { 2: '+30% summon HP/dmg', 4: '+60% summon HP/dmg' },
  },
};

// Given a list of unit defs on the board, compute active trait counts (distinct units per
// trait) and the highest reached breakpoint for each. `bonus` adds to a trait's COUNT
// (from Augment crowns, e.g. {mage:1}) so it can push a synergy to its next breakpoint.
export function activeTraits(units, bonus) {
  bonus = bonus || {};
  const seen = {};
  for (const u of units) {
    for (const t of [u.origin, u.klass]) {
      seen[t] = seen[t] || new Set();
      seen[t].add(u.defId);
    }
  }
  const result = {};
  const allTraits = new Set([...Object.keys(seen), ...Object.keys(bonus)]);
  for (const t of allTraits) {
    const def = TRAITS[t];
    if (!def) continue;
    const count = (seen[t] ? seen[t].size : 0) + (bonus[t] || 0);
    if (count <= 0) continue;
    let tier = 0;
    for (const bp of def.breakpoints) if (count >= bp) tier = bp;
    result[t] = { count, tier, bonus: tier ? def.bonuses[tier] : null };
  }
  return result;
}
