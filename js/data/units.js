// Champion roster (~29 units) across the 6 Origins x 6 Classes matrix.
// Stats are 1-star base values, cost-scaled, then role-adjusted. Ability is data the
// combat sim's ability handlers read (sim/rules.js). These are STARTING numbers — the
// headless autobalancer (sim/autobalance.js) will tune the outliers.

// Base 1-star stats per cost tier.
const COST_BASE = {
  1: { hp: 480, ad: 62, as: 0.70, armor: 16, mr: 16, mana: 50 },
  2: { hp: 560, ad: 72, as: 0.72, armor: 20, mr: 20, mana: 55 },
  3: { hp: 630, ad: 84, as: 0.75, armor: 24, mr: 24, mana: 60 },
  4: { hp: 720, ad: 98, as: 0.78, armor: 28, mr: 28, mana: 65 },
  5: { hp: 850, ad: 118, as: 0.80, armor: 32, mr: 32, mana: 70 },
};

// Role shapes: how a class bends the base stats + which mana-gen profile it uses.
// manaPer = mana gained per auto-attack (TFT: carry 10, caster 7, tank 5).
const ROLE = {
  knight:   { hpx: 1.45, adx: 0.78, range: 1, manaPer: 5, startMana: 0.0 },
  mage:     { hpx: 0.85, adx: 0.70, range: 3, manaPer: 7, startMana: 0.0 },
  ranger:   { hpx: 0.85, adx: 1.05, range: 3, manaPer: 10, startMana: 0.0 },
  assassin: { hpx: 0.90, adx: 1.20, range: 1, manaPer: 10, startMana: 0.0, dive: true },
  healer:   { hpx: 0.95, adx: 0.65, range: 2, manaPer: 7, startMana: 0.25 },
  summoner: { hpx: 0.95, adx: 0.70, range: 2, manaPer: 7, startMana: 0.15 },
};

function mk(defId, name, origin, klass, cost, ability) {
  const b = COST_BASE[cost], r = ROLE[klass];
  return {
    defId, name, origin, klass, cost,
    range: r.range,
    hp: Math.round(b.hp * r.hpx),
    ad: Math.round(b.ad * r.adx),
    as: b.as,
    armor: b.armor + (klass === 'knight' ? 20 : 0),
    mr: b.mr + (klass === 'knight' ? 10 : 0),
    maxMana: b.mana,
    startMana: Math.round(b.mana * r.startMana),
    manaPer: r.manaPer,
    dive: !!r.dive,
    ability,
  };
}

// Ability data. type: magic|physical|heal|shield|summon. target: current|lowestAllyHP|
// mostEnemies|cluster|self. ap = base scaling number (boosted by Mage trait / AP items).
const A = {
  smite:   (ap) => ({ name: 'Smite', type: 'magic', target: 'current', ap }),
  nuke:    (ap) => ({ name: 'Arcane Nuke', type: 'magic', target: 'cluster', radius: 1, ap }),
  cleave:  (ad) => ({ name: 'Cleave', type: 'physical', target: 'cluster', radius: 1, adRatio: ad }),
  exec:    (ad) => ({ name: 'Execute', type: 'physical', target: 'lowestEnemyHP', adRatio: ad }),
  volley:  (ad) => ({ name: 'Volley', type: 'physical', target: 'mostEnemies', adRatio: ad }),
  mend:    (ap) => ({ name: 'Mend', type: 'heal', target: 'lowestAllyHP', ap }),
  ward:    (ap) => ({ name: 'Aegis', type: 'shield', target: 'lowestAllyHP', ap }),
  raise:   (ap) => ({ name: 'Raise Dead', type: 'summon', summonHp: 350, summonAd: 30, ap }),
  bash:    (ad) => ({ name: 'Shield Bash', type: 'physical', target: 'current', adRatio: ad, stun: 1.0 }),
  breath:  (ap) => ({ name: 'Dragon Breath', type: 'magic', target: 'cluster', radius: 2, ap }),
};

export const UNITS = [
  // ---- Human ----
  mk('knight_captain', 'Knight-Captain', 'human', 'knight', 1, A.bash(2.0)),
  mk('court_mage',     'Court Mage',     'human', 'mage',   2, A.nuke(220)),
  mk('crossbowman',    'Crossbowman',    'human', 'ranger', 1, A.volley(2.2)),
  mk('royal_blade',    'Royal Blade',    'human', 'assassin', 3, A.exec(3.0)),
  mk('field_medic',    'Field Medic',    'human', 'healer', 1, A.mend(200)),

  // ---- Undead ----
  mk('bone_guard',     'Bone Guard',     'undead', 'knight', 1, A.bash(1.8)),
  mk('lich',           'Lich',           'undead', 'mage',   3, A.nuke(320)),
  mk('skeleton_archer','Skeleton Archer','undead', 'ranger', 1, A.volley(2.0)),
  mk('wraith',         'Wraith',         'undead', 'assassin', 4, A.exec(3.6)),
  mk('necromancer',    'Necromancer',    'undead', 'summoner', 5, A.raise(260)),

  // ---- Elf ----
  mk('thornguard',     'Thornguard',     'elf', 'knight', 2, A.bash(2.1)),
  mk('moon_priestess', 'Moon Priestess', 'elf', 'mage',   4, A.nuke(380)),
  mk('wood_ranger',    'Wood Ranger',    'elf', 'ranger', 1, A.volley(2.1)),
  mk('shadow_dancer',  'Shadow Dancer',  'elf', 'assassin', 3, A.exec(3.2)),
  mk('grove_healer',   'Grove Healer',   'elf', 'healer', 2, A.mend(260)),
  mk('spirit_caller',  'Spirit Caller',  'elf', 'summoner', 3, A.raise(220)),

  // ---- Demon ----
  mk('hellguard',      'Hellguard',      'demon', 'knight', 2, A.cleave(1.9)),
  mk('warlock',        'Warlock',        'demon', 'mage',   4, A.nuke(400)),
  mk('fel_archer',     'Fel Archer',     'demon', 'ranger', 2, A.volley(2.3)),
  mk('imp_assassin',   'Imp Assassin',   'demon', 'assassin', 1, A.exec(2.6)),
  mk('pit_summoner',   'Pit Summoner',   'demon', 'summoner', 5, A.raise(300)),

  // ---- Beast ----
  mk('beast_hunter',   'Beast Hunter',   'beast', 'ranger', 2, A.volley(2.4)),
  mk('bramble_brute',  'Bramble Brute',  'beast', 'knight', 4, A.cleave(2.4)),
  mk('pack_stalker',   'Pack Stalker',   'beast', 'assassin', 3, A.exec(3.3)),
  mk('druid_healer',   'Druid Healer',   'beast', 'healer', 3, A.ward(300)),
  mk('beastmaster',    'Beastmaster',    'beast', 'summoner', 4, A.raise(280)),

  // ---- Dragon (elite, expensive) ----
  mk('dragon_knight',  'Dragon Knight',  'dragon', 'knight', 5, A.breath(280)),
  mk('dragon_sage',    'Dragon Sage',    'dragon', 'mage',   5, A.breath(420)),
  mk('wyrm_archer',    'Wyrm Archer',    'dragon', 'ranger', 5, A.volley(3.0)),
];

export const UNITS_BY_ID = Object.fromEntries(UNITS.map((u) => [u.defId, u]));

// Star scaling: ~1.7x stats per star (HP + AD). Ability scaling follows AD/AP ratios.
export const STAR_MULT = { 1: 1, 2: 1.7, 3: 1.7 * 1.7 };

export function statsForStar(def, star) {
  const m = STAR_MULT[star] || 1;
  return {
    ...def,
    star,
    hp: Math.round(def.hp * m),
    ad: Math.round(def.ad * m),
    // armor/mr/as/range/mana unchanged by star (TFT convention: HP+AD scale, utility doesn't)
  };
}

// Roster counts by cost (sanity / pool sizing).
export const COST_COUNTS = UNITS.reduce((a, u) => ((a[u.cost] = (a[u.cost] || 0) + 1), a), {});
