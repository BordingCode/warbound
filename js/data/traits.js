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
    bonuses: { 2: { revivePct: 0.46 }, 4: { revivePct: 0.68, vamp: 0.34 }, 6: { revivePct: 0.88, vamp: 0.46 } },
    bonusText: { 2: 'Revive once at 46% HP', 4: 'at 68% HP + 34% lifesteal', 6: 'at 88% HP + 46% lifesteal' },
  },
  elf: {
    name: 'Elf', axis: 'origin', kind: 'behaviour', color: '#54e6c0',
    desc: 'Elves slip past blows and start shielded.',
    breakpoints: [2, 4],
    bonuses: { 2: { dodge: 0.28, shield: 200 }, 4: { dodge: 0.46, shield: 360, as: 0.40 } },
    bonusText: { 2: '28% dodge + 200 shield', 4: '46% dodge + 360 shield + 40% atk speed' },
  },
  demon: {
    name: 'Demon', axis: 'origin', kind: 'behaviour', color: '#ff5a3c',
    desc: 'Every Demon attack sears its target: bonus magic damage on each hit AND it drains the enemy\'s mana, delaying the ability they\'re charging. A strong soft-counter to caster-heavy enemy boards.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { burn: 82, manaBurn: 8 }, 4: { burn: 128, manaBurn: 12 }, 6: { burn: 184, manaBurn: 21 } },
    bonusText: { 2: '+82 magic dmg & −8 enemy mana per hit', 4: '+128 magic dmg & −12 enemy mana per hit', 6: '+184 magic dmg & −21 enemy mana per hit' },
  },
  beast: {
    name: 'Beast', axis: 'origin', kind: 'behaviour', color: '#ffb15a',
    desc: 'The Wilds grow more ferocious as the fight drags on.',
    breakpoints: [2, 4],
    bonuses: { 2: { ferocity: 0.28, armor: 16 }, 4: { ferocity: 0.52, armor: 32 } },
    bonusText: { 2: '+28% atk speed/strike & +16 armor', 4: '+52% atk speed/strike & +32 armor (whole team)' },
  },
  dragon: {
    name: 'Dragon', axis: 'origin', kind: 'behaviour', color: '#ffd24a',
    desc: 'Few but mighty — dragons shrug off magic.',
    breakpoints: [1, 2],
    bonuses: { 1: { mr: 26, adPct: 0.17, ap: 50 }, 2: { mr: 46, adPct: 0.27, ap: 95 } },
    bonusText: { 1: '+26 MR, +17% AD, +50 AP', 2: '+46 MR, +27% AD, +95 AP (resists spells)' },
  },
  orc: {
    name: 'Orc', axis: 'origin', kind: 'behaviour', color: '#7fc24a',
    desc: 'The Warhorde feeds on slaughter — every strike whips the whole warband into a deeper Bloodlust: ramping attack speed AND lifesteal.',
    breakpoints: [2, 4],
    bonuses: { 2: { ferocity: 0.12, vamp: 0.10 }, 4: { ferocity: 0.19, vamp: 0.15 } },
    bonusText: { 2: '+12% atk speed/strike & 10% lifesteal (team)', 4: '+19% atk speed/strike & 15% lifesteal (team)' },
  },

  // ---------- CLASSES ----------
  knight: {
    name: 'Knight', axis: 'class', kind: 'glue', color: '#b9c4d0',
    desc: 'A wall that ignores a flat chunk of every hit.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { block: 10 }, 4: { block: 16 }, 6: { block: 22 } },
    bonusText: { 2: 'Ignore 10 dmg/hit', 4: 'ignore 16', 6: 'ignore 22' },
  },
  mage: {
    name: 'Mage', axis: 'class', kind: 'glue', color: '#c79bff',
    desc: 'Channelled power amplifies all spell damage.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ap: 24 }, 4: { ap: 72 }, 6: { ap: 132 } },
    bonusText: { 2: '+24 ability power', 4: '+72 AP', 6: '+132 AP' },
  },
  ranger: {
    name: 'Ranger', axis: 'class', kind: 'behaviour', color: '#9be86a',
    desc: 'Rangers loose bursts of rapid fire.',
    breakpoints: [2, 4],
    bonuses: { 2: { rangerAS: 0.16 }, 4: { rangerAS: 0.38 } },
    bonusText: { 2: '16% chance: +atk speed burst', 4: '38% chance' },
  },
  assassin: {
    name: 'Assassin', axis: 'class', kind: 'behaviour', color: '#ff7eb6',
    desc: 'Leap to the back line; lethal crits.',
    breakpoints: [2, 4],
    bonuses: { 2: { critChance: 0.33, critDmg: 1.15 }, 4: { critChance: 0.52, critDmg: 2.10 } },
    bonusText: { 2: 'Dive + 33% crit (+115% dmg)', 4: 'Dive + 52% crit (+210%)' },
  },
  healer: {
    name: 'Healer', axis: 'class', kind: 'glue', color: '#7affd6',
    desc: 'Amplifies all healing and mends the wounded.',
    breakpoints: [2, 3],
    bonuses: { 2: { healAmp: 0.20, regen: 8 }, 3: { healAmp: 0.40, regen: 16 } },
    bonusText: { 2: '+20% healing + regen', 3: '+40% healing + regen' },
  },
  summoner: {
    name: 'Summoner', axis: 'class', kind: 'behaviour', color: '#ffcf5a',
    desc: 'Summoned creatures hit harder and last longer.',
    breakpoints: [2, 4],
    bonuses: { 2: { summonPower: 0.10 }, 4: { summonPower: 0.22 } },
    bonusText: { 2: '+10% summon HP/dmg', 4: '+22% summon HP/dmg' },
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
