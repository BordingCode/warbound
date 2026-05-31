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
    bonuses: { 2: { manaRegen: 3 }, 4: { manaRegen: 5 }, 6: { manaRegen: 8 } },
    bonusText: { 2: '+3 mana/s to all allies', 4: '+5 mana/s', 6: '+8 mana/s' },
  },
  undead: {
    name: 'Undead', axis: 'origin', kind: 'behaviour', color: '#8cff9e',
    desc: 'Slain Undead claw back from the grave, once.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { revivePct: 0.38 }, 4: { revivePct: 0.58, vamp: 0.30 }, 6: { revivePct: 0.78, vamp: 0.42 } },
    bonusText: { 2: 'Revive once at 38% HP', 4: 'at 58% HP + 30% lifesteal', 6: 'at 78% HP + 42% lifesteal' },
  },
  elf: {
    name: 'Elf', axis: 'origin', kind: 'behaviour', color: '#54e6c0',
    desc: 'Elves slip past blows and start shielded.',
    breakpoints: [2, 4],
    bonuses: { 2: { dodge: 0.20, shield: 120 }, 4: { dodge: 0.35, shield: 220, as: 0.20 } },
    bonusText: { 2: '20% dodge + 120 shield', 4: '35% dodge + 220 shield + 20% atk speed' },
  },
  demon: {
    name: 'Demon', axis: 'origin', kind: 'behaviour', color: '#ff5a3c',
    desc: 'Every Demon attack sears its target: bonus magic damage on each hit AND it drains the enemy\'s mana, delaying the ability they\'re charging. A strong soft-counter to caster-heavy enemy boards.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { burn: 52, manaBurn: 8 }, 4: { burn: 88, manaBurn: 14 }, 6: { burn: 128, manaBurn: 22 } },
    bonusText: { 2: '+52 magic dmg & −8 enemy mana per hit', 4: '+88 magic dmg & −14 enemy mana per hit', 6: '+128 magic dmg & −22 enemy mana per hit' },
  },
  beast: {
    name: 'Beast', axis: 'origin', kind: 'behaviour', color: '#ffb15a',
    desc: 'Beasts grow more ferocious as the fight drags on.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ferocity: 0.12 }, 4: { ferocity: 0.20 }, 6: { ferocity: 0.27 } },
    bonusText: { 2: '+12% atk speed per strike', 4: '+20%', 6: '+27% (whole team)' },
  },
  dragon: {
    name: 'Dragon', axis: 'origin', kind: 'behaviour', color: '#ffd24a',
    desc: 'Few but mighty — dragons shrug off magic.',
    breakpoints: [1, 2],
    bonuses: { 1: { mr: 28, adPct: 0.06, ap: 22 }, 2: { mr: 50, adPct: 0.11, ap: 45 } },
    bonusText: { 1: '+28 MR, +6% AD, +22 AP', 2: '+50 MR, +11% AD, +45 AP (near-immune to spells)' },
  },

  // ---------- CLASSES ----------
  knight: {
    name: 'Knight', axis: 'class', kind: 'glue', color: '#b9c4d0',
    desc: 'A wall that ignores a flat chunk of every hit.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { block: 16 }, 4: { block: 30 }, 6: { block: 54 } },
    bonusText: { 2: 'Ignore 16 dmg/hit', 4: 'ignore 30', 6: 'ignore 54' },
  },
  mage: {
    name: 'Mage', axis: 'class', kind: 'glue', color: '#c79bff',
    desc: 'Channelled power amplifies all spell damage.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ap: 24 }, 4: { ap: 72 }, 6: { ap: 135 } },
    bonusText: { 2: '+24 ability power', 4: '+72 AP', 6: '+135 AP' },
  },
  ranger: {
    name: 'Ranger', axis: 'class', kind: 'behaviour', color: '#9be86a',
    desc: 'Rangers loose bursts of rapid fire.',
    breakpoints: [2, 4],
    bonuses: { 2: { rangerAS: 0.09 }, 4: { rangerAS: 0.22 } },
    bonusText: { 2: '9% chance: +atk speed burst', 4: '22% chance' },
  },
  assassin: {
    name: 'Assassin', axis: 'class', kind: 'behaviour', color: '#ff7eb6',
    desc: 'Leap to the back line; lethal crits.',
    breakpoints: [2, 4],
    bonuses: { 2: { critChance: 0.25, critDmg: 0.85 }, 4: { critChance: 0.40, critDmg: 1.60 } },
    bonusText: { 2: 'Dive + 25% crit (+85% dmg)', 4: 'Dive + 40% crit (+160%)' },
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
    bonuses: { 2: { summonPower: 0.22 }, 4: { summonPower: 0.52 } },
    bonusText: { 2: '+22% summon HP/dmg', 4: '+52% summon HP/dmg' },
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
