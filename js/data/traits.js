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
    bonuses: { 2: { dodge: 0.21, shield: 130 }, 4: { dodge: 0.37, shield: 250, as: 0.31 } },
    bonusText: { 2: '21% dodge + 130 shield', 4: '37% dodge + 250 shield + 31% atk speed' },
  },
  demon: {
    name: 'Demon', axis: 'origin', kind: 'behaviour', color: '#ff5a3c',
    desc: 'Every Demon attack sears its target: bonus magic damage on each hit AND it drains the enemy\'s mana, delaying the ability they\'re charging. A strong soft-counter to caster-heavy enemy boards.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { burn: 96, manaBurn: 10 }, 4: { burn: 154, manaBurn: 16 }, 6: { burn: 216, manaBurn: 25 } },
    bonusText: { 2: '+96 magic dmg & −10 enemy mana per hit', 4: '+154 magic dmg & −16 enemy mana per hit', 6: '+216 magic dmg & −25 enemy mana per hit' },
  },
  beast: {
    name: 'Beast', axis: 'origin', kind: 'behaviour', color: '#ffb15a',
    desc: 'Beasts grow more ferocious as the fight drags on.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ferocity: 0.17, armor: 9 }, 4: { ferocity: 0.30, armor: 17 }, 6: { ferocity: 0.40, armor: 27 } },
    bonusText: { 2: '+17% atk speed/strike & +9 armor', 4: '+30% & +17 armor', 6: '+40% & +27 armor (whole team)' },
  },
  dragon: {
    name: 'Dragon', axis: 'origin', kind: 'behaviour', color: '#ffd24a',
    desc: 'Few but mighty — dragons shrug off magic.',
    breakpoints: [1, 2],
    bonuses: { 1: { mr: 30, adPct: 0.19, ap: 60 }, 2: { mr: 54, adPct: 0.29, ap: 110 } },
    bonusText: { 1: '+30 MR, +19% AD, +60 AP', 2: '+54 MR, +29% AD, +110 AP (near-immune to spells)' },
  },

  // ---------- CLASSES ----------
  knight: {
    name: 'Knight', axis: 'class', kind: 'glue', color: '#b9c4d0',
    desc: 'A wall that ignores a flat chunk of every hit.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { block: 9 }, 4: { block: 15 }, 6: { block: 26 } },
    bonusText: { 2: 'Ignore 9 dmg/hit', 4: 'ignore 15', 6: 'ignore 26' },
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
    bonuses: { 2: { critChance: 0.22, critDmg: 0.78 }, 4: { critChance: 0.36, critDmg: 1.50 } },
    bonusText: { 2: 'Dive + 22% crit (+78% dmg)', 4: 'Dive + 36% crit (+150%)' },
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
    bonuses: { 2: { summonPower: 0.14 }, 4: { summonPower: 0.36 } },
    bonusText: { 2: '+14% summon HP/dmg', 4: '+36% summon HP/dmg' },
  },
};

// Given a list of unit defs on the board, compute active trait counts (distinct units per
// trait) and the highest reached breakpoint for each. `bonus` adds to a trait's COUNT
// (from Augment crowns, e.g. {mage:1}) so it can push a synergy to its next breakpoint.
// A unit object may carry `grants` (array of trait ids from equipped Emblems) + a unique
// `gid` (so two units granting the same trait each count as a distinct +1, not deduped).
export function activeTraits(units, bonus) {
  bonus = bonus || {};
  const seen = {};
  for (const u of units) {
    for (const t of [u.origin, u.klass]) {
      seen[t] = seen[t] || new Set();
      seen[t].add(u.defId);
    }
    if (u.grants && u.grants.length) {
      const gid = u.gid != null ? u.gid : u.defId;
      for (const t of u.grants) { seen[t] = seen[t] || new Set(); seen[t].add('E:' + gid + ':' + t); }
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
