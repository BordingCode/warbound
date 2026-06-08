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
    bonuses: { 2: { revivePct: 0.37 }, 4: { revivePct: 0.56, vamp: 0.27 }, 6: { revivePct: 0.76, vamp: 0.38 } },
    bonusText: { 2: 'Revive once at 37% HP', 4: 'at 56% HP + 27% lifesteal', 6: 'at 76% HP + 38% lifesteal' },
  },
  elf: {
    name: 'Elf', axis: 'origin', kind: 'behaviour', color: '#54e6c0',
    desc: 'Elves slip past blows and start shielded.',
    breakpoints: [2, 4],
    bonuses: { 2: { dodge: 0.22, shield: 140 }, 4: { dodge: 0.38, shield: 270, as: 0.32 } },
    bonusText: { 2: '22% dodge + 140 shield', 4: '38% dodge + 270 shield + 32% atk speed' },
  },
  demon: {
    name: 'Demon', axis: 'origin', kind: 'behaviour', color: '#ff5a3c',
    desc: 'Every Demon attack sears its target: bonus magic damage on each hit AND it drains the enemy\'s mana, delaying the ability they\'re charging. A strong soft-counter to caster-heavy enemy boards.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { burn: 96, manaBurn: 10 }, 4: { burn: 150, manaBurn: 15 }, 6: { burn: 184, manaBurn: 21 } },
    bonusText: { 2: '+96 magic dmg & −10 enemy mana per hit', 4: '+150 magic dmg & −15 enemy mana per hit', 6: '+184 magic dmg & −21 enemy mana per hit' },
  },
  beast: {
    name: 'Beast', axis: 'origin', kind: 'behaviour', color: '#ffb15a',
    desc: 'The Wilds grow more ferocious as the fight drags on.',
    breakpoints: [2, 4],
    bonuses: { 2: { ferocity: 0.15, armor: 8 }, 4: { ferocity: 0.30, armor: 18 } },
    bonusText: { 2: '+15% atk speed/strike & +8 armor', 4: '+30% atk speed/strike & +18 armor (whole team)' },
  },
  dragon: {
    name: 'Dragon', axis: 'origin', kind: 'behaviour', color: '#ffd24a',
    desc: 'Few but mighty — dragons shrug off magic.',
    breakpoints: [1, 2],
    bonuses: { 1: { mr: 22, adPct: 0.12, ap: 38 }, 2: { mr: 40, adPct: 0.19, ap: 70 } },
    bonusText: { 1: '+22 MR, +12% AD, +38 AP', 2: '+40 MR, +19% AD, +70 AP (resists spells)' },
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
    bonuses: { 2: { block: 12 }, 4: { block: 20 }, 6: { block: 28 } },
    bonusText: { 2: 'Ignore 12 dmg/hit', 4: 'ignore 20', 6: 'ignore 28' },
  },
  mage: {
    name: 'Mage', axis: 'class', kind: 'glue', color: '#c79bff',
    desc: 'Channelled power amplifies all spell damage.',
    breakpoints: [2, 4, 6],
    bonuses: { 2: { ap: 27 }, 4: { ap: 82 }, 6: { ap: 152 } },
    bonusText: { 2: '+27 ability power', 4: '+82 AP', 6: '+152 AP' },
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
    bonuses: { 2: { critChance: 0.25, critDmg: 0.88 }, 4: { critChance: 0.41, critDmg: 1.65 } },
    bonusText: { 2: 'Dive + 25% crit (+88% dmg)', 4: 'Dive + 41% crit (+165%)' },
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
    bonuses: { 2: { summonPower: 0.13 }, 4: { summonPower: 0.28 } },
    bonusText: { 2: '+13% summon HP/dmg', 4: '+28% summon HP/dmg' },
  },
  paladin: {
    name: 'Paladin', axis: 'class', kind: 'glue', color: '#ffe7a0',
    desc: 'Oathbound protectors raise a holy ward — the whole warband takes reduced damage.',
    breakpoints: [2, 3],
    bonuses: { 2: { dmgRed: 0.07 }, 3: { dmgRed: 0.12 } },
    bonusText: { 2: 'All allies take 7% less damage', 3: 'All allies take 12% less damage' },
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
