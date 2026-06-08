// Authored enemy ladder. Each board demonstrates one synergy idea (telegraphed by name)
// and escalates in power. Enemy deploys rows 0..3 (row 3 = front, nearest the player).
// getEnemyBoard(round, rng) returns { name, traitHint, units:[{defId,star,col,row}] }.
// Beyond the authored list, boards repeat with a star/extra-unit boost so the run can
// always continue.

const E = (defId, star, col, row) => ({ defId, star, col, row });

export const LADDER = [
  { name: 'Lone Brigand', traitHint: 'A gentle warm-up', units: [E('bone_guard', 1, 3, 3)] },
  { name: 'Roadside Bandits', traitHint: 'Two scrappers', units: [E('bone_guard', 1, 3, 3), E('skeleton_archer', 1, 3, 1)] },
  { name: 'The Iron Watch', traitHint: 'Knight wall', units: [E('knight_captain', 2, 3, 3), E('bone_guard', 1, 2, 3), E('crossbowman', 1, 3, 0)] },
  { name: 'Hex Coven', traitHint: 'Mage burst', units: [E('court_mage', 2, 4, 1), E('court_mage', 1, 2, 1), E('knight_captain', 1, 3, 3), E('field_medic', 1, 5, 0)] },
  { name: 'The Wolf Pack', traitHint: 'Beast ferocity', units: [E('beast_hunter', 2, 4, 1), E('bramble_brute', 1, 3, 3), E('pack_stalker', 1, 6, 3), E('druid_healer', 1, 2, 0)] },
  { name: 'Warhorde Raiders', traitHint: 'Orc Bloodlust — ramps as it fights', units: [E('orc_grunt', 2, 3, 3), E('berserker', 2, 6, 3), E('axethrower', 1, 5, 1), E('orc_shaman', 1, 4, 0)] },
  { name: 'The Ironsworn', traitHint: 'Knight wall — a heavy frontline', units: [E('bone_guard', 2, 3, 3), E('hellguard', 2, 5, 3), E('court_mage', 2, 4, 0), E('field_medic', 1, 2, 0), E('crossbowman', 1, 6, 1)] },
  { name: 'Shadow Cell', traitHint: 'Assassin dive!', units: [E('imp_assassin', 2, 2, 1), E('shadow_dancer', 2, 5, 1), E('hellguard', 2, 3, 3), E('court_mage', 2, 4, 0), E('bone_guard', 2, 2, 3)] },
  { name: 'Undead Horde', traitHint: 'Undead revive', units: [E('bone_guard', 2, 3, 3), E('skeleton_archer', 2, 2, 1), E('lich', 2, 4, 0), E('wraith', 2, 6, 1), E('necromancer', 1, 1, 0), E('bone_guard', 2, 5, 3)] },
  { name: 'Infernal Legion', traitHint: 'Demon mana-burn', units: [E('hellguard', 2, 3, 3), E('warlock', 2, 4, 0), E('fel_archer', 2, 2, 1), E('imp_assassin', 2, 6, 2), E('hellguard', 2, 5, 3), E('bramble_brute', 1, 1, 3)] },
  { name: 'Elf Sentinels', traitHint: 'Elf evasion', units: [E('bramble_brute', 2, 3, 3), E('moon_priestess', 2, 4, 0), E('wood_ranger', 2, 2, 1), E('grove_healer', 2, 5, 0), E('shadow_dancer', 2, 6, 1), E('moon_priestess', 2, 1, 0)] },
  { name: 'The Dragonsworn', traitHint: 'BOSS · Dragon', units: [E('dragon_knight', 2, 3, 3), E('dragon_sage', 2, 4, 0), E('knight_captain', 2, 2, 3), E('moon_priestess', 2, 5, 1), E('grove_healer', 2, 1, 0), E('wyrm_archer', 1, 6, 1)] },
  { name: 'Frost Wardens', traitHint: 'Elf wall + casters', units: [E('bramble_brute', 3, 3, 3), E('bramble_brute', 2, 5, 3), E('moon_priestess', 3, 4, 0), E('grove_healer', 2, 2, 0), E('wood_ranger', 3, 1, 1), E('shadow_dancer', 2, 6, 1), E('knight_captain', 2, 0, 3)] },
  { name: 'The Bone Legion', traitHint: 'Undead swarm', units: [E('bone_guard', 3, 3, 3), E('bone_guard', 2, 1, 3), E('necromancer', 3, 4, 0), E('lich', 3, 5, 0), E('skeleton_archer', 3, 2, 1), E('wraith', 2, 6, 1), E('bone_guard', 2, 0, 3)] },
  { name: 'Hellfire Host', traitHint: 'Demon burn', units: [E('hellguard', 3, 3, 3), E('bramble_brute', 3, 5, 3), E('warlock', 3, 4, 0), E('fel_archer', 3, 2, 1), E('imp_assassin', 3, 6, 1), E('pit_summoner', 2, 1, 0), E('hellguard', 2, 0, 3)] },
  { name: 'The Worldwyrm', traitHint: 'FINAL BOSS · Dragons', units: [E('dragon_knight', 3, 3, 3), E('dragon_sage', 3, 4, 0), E('wyrm_archer', 3, 5, 1), E('bramble_brute', 3, 2, 3), E('moon_priestess', 2, 1, 0), E('grove_healer', 2, 6, 0), E('knight_captain', 2, 0, 3)] },
];

// ---- Warpath REALMS: conquer each realm by beating its 10 warbands. Each realm is a themed,
// progressively harder region; conquering one (10 wins) is permanent and unlocks the next. You
// start fresh each realm (board/economy reset). `diff` bumps enemy stars/numbers; `pool` themes
// the reinforcements so each realm FEELS distinct.
export const REALMS = [
  { name: 'The Marches',     hint: 'Border skirmishers — a fair first test',  color: '#9aa6b8', pool: null,                                                                       diff: 0 },
  { name: 'The Deepwood',    hint: 'Elven ambush — evasive, healing lines',   color: '#54e6c0', pool: ['bramble_brute', 'wood_ranger', 'moon_priestess', 'grove_healer', 'shadow_dancer'], diff: 2 },
  { name: 'The Bonelands',   hint: 'Undead horde — the dead keep rising',     color: '#8cff9e', pool: ['bone_guard', 'skeleton_archer', 'lich', 'wraith', 'necromancer'],  diff: 4 },
  { name: 'The Inferno',     hint: 'Demon legions — relentless mana-burn',    color: '#ff5a3c', pool: ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'pit_summoner'], diff: 6 },
  { name: 'The Warhorde',    hint: 'Orc bloodlust — they only hit faster',    color: '#7fc24a', pool: ['berserker', 'orc_grunt', 'orc_shaman', 'axethrower', 'warboss'],                diff: 9 },
  { name: 'The Dragonspire', hint: 'Dragonsworn — overwhelming raw power',    color: '#ffd24a', pool: ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'knight_captain'],     diff: 12 },
  { name: 'The Voidreach',   hint: 'Every horror at its fiercest',            color: '#c79bff', pool: ['dragon_knight', 'warlock', 'lich', 'wraith', 'pit_summoner', 'moon_priestess', 'warboss', 'berserker'], diff: 15 },
  // SECRET finale — only revealed once all the realms before it are conquered (see showRealms).
  { name: 'The Astral Throne', hint: 'Beyond the realms — ascend, if you can', color: '#ffe9a8', pool: ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'lich', 'warlock', 'warboss', 'orc_shaman'], diff: 18, secret: true },
];
// realm by index (endless beyond the authored list — diff keeps climbing for completionists).
export function realmAt(i) {
  if (i < REALMS.length) return { ...REALMS[i], index: i, num: i + 1 };
  const last = REALMS[REALMS.length - 1], over = i - REALMS.length + 1;
  return { name: `${last.name} +${over}`, hint: 'Beyond the known realms', color: '#ff5e8a', pool: last.pool, diff: last.diff + over * 3, index: i, num: i + 1 };
}

// Light deterministic variation + escalation. `opts.diff` (from chosen paths) and rounds past
// the authored ladder both push enemies harder; `opts.pool`/`opts.name` theme the reinforcements.
export function getEnemyBoard(round, rng, opts = {}) {
  const diff = Math.max(0, opts.diff || 0);
  const i = Math.min(round - 1, LADDER.length - 1);
  const base = LADDER[i];
  // total escalation steps. The within-realm ramp (round/4) is the key fix: previously a realm's
  // rounds 1–9 were FLAT (esc = diff) and only the round-10 boss spiked, so mid-rounds stomped then
  // the boss walled. Now difficulty creeps up across the realm (+1 by round 5, +2 by round 9),
  // easing the climb into the boss without touching the gentle opening rounds.
  const esc = Math.max(0, round - LADDER.length) + diff + Math.floor((round - 1) / 4);
  let units = base.units.map((u) => ({ ...u }));
  if (esc > 0) {
    const starBump = Math.min(2, Math.floor(esc / 3) + 1);
    units = units.map((u) => ({ ...u, star: Math.min(3, u.star + starBump) }));
    const pool = (opts.pool && opts.pool.length) ? opts.pool : ['bramble_brute', 'warlock', 'moon_priestess', 'wraith', 'dragon_knight'];
    const adds = Math.min(3, Math.ceil(esc / 2));            // reinforcements, capped so boards stay sane
    const cols = [1, 6, 4];                                  // spread-out spawn columns
    for (let k = 0; k < adds; k++) {
      units.push(E(pool[(round + k) % pool.length], Math.min(3, 1 + Math.floor(esc / 3)), cols[k % cols.length], k % 2 === 0 ? 2 : 0));
    }
  }
  const name = opts.name ? opts.name : (esc > 0 ? base.name + ' +' + esc : base.name);
  return { name, traitHint: base.traitHint, units };
}

// A NEUTRAL CREEP CAMP for Warpath's "Neutral Camp" rounds (Auto-Chess creep round). A pack of wild
// monsters — deliberately a notch WEAKER than a same-round warband (star scales on esc/4 vs the
// warband's esc/3) so it reads as a beatable breather that drops loot. They grant no synergy and
// never cast. Scales with the realm difficulty so it stays relevant deep in the run.
export function getCreepCamp(round, opts = {}) {
  const diff = Math.max(0, opts.diff || 0);
  const esc = diff + Math.floor((round - 1) / 4);
  const star = Math.min(3, 1 + Math.floor(esc / 4));     // gentler ramp than getEnemyBoard's esc/3
  // pack SIZE scales with the run so the early opener is a tiny camp a 2-unit starter board can
  // beat (round 1, realm 0 → just 2 monsters), filling out to a full pack deeper in (cap 6). This
  // tracks the player's growing board limit so a camp is always a breather, never a first-fight wall.
  const size = Math.max(2, Math.min(6, 2 + Math.floor(round / 3) + Math.floor(diff / 4)));
  const roster = [
    E('creep_brute', star, 3, 3),
    E('creep_wolf', star, 2, 3),
    E('creep_spore', star, 4, 1),
    E('creep_wolf', star, 5, 3),
    E('creep_spore', star, 1, 1),
    E('creep_wolf', star, 3, 2),
  ];
  const units = roster.slice(0, size);
  const NAMES = ['Wolf Pack', 'Troll Warren', 'Spore Grove', 'the Wild Beasts'];
  return { name: 'Neutral Camp — ' + NAMES[round % NAMES.length], traitHint: 'wild monsters · clear them for loot', creep: true, units };
}

// ---- Realm BOSSES: each realm's 10th/final warband is a hand-crafted boss with a GIMMICK.
// The gimmick is an aug.enemy bundle ({flat,cond,traitBonus}) — the SAME channel augments use —
// applied to the boss board only, and named/telegraphed pre-fight (the "answer key" pillar).
export const BOSSES = [
  { realm: 0, name: 'The Iron Tyrant', traitHint: 'BOSS · Bulwark',
    gimmickName: 'Bulwark', gimmickDesc: 'The host starts heavily armored. Bring sustained or magic damage — raw autos bounce off.',
    gimmick: { flat: { armor: 30, hp: 0.15 } },
    units: [E('knight_captain', 3, 3, 3), E('bone_guard', 3, 2, 3), E('bone_guard', 3, 4, 3), E('crossbowman', 3, 1, 1), E('court_mage', 2, 5, 0), E('field_medic', 2, 6, 0)] },
  { realm: 1, name: 'Sylvan Matriarch', traitHint: 'BOSS · Evasion',
    gimmickName: 'Evasion', gimmickDesc: 'They dodge blows and start shielded. Burst them down fast — chip damage gets wasted.',
    gimmick: { traitBonus: { elf: 4 }, flat: { as: 0.15 } },
    units: [E('bramble_brute', 3, 3, 3), E('moon_priestess', 3, 4, 0), E('moon_priestess', 2, 1, 0), E('wood_ranger', 3, 2, 1), E('grove_healer', 3, 5, 0), E('shadow_dancer', 3, 6, 1)] },
  { realm: 2, name: 'The Bonelord', traitHint: 'BOSS · Undying',
    gimmickName: 'Undying', gimmickDesc: 'The whole host claws back from death once. You must kill them twice — bring burst and anti-heal.',
    gimmick: { traitBonus: { undead: 6 }, flat: { hp: 0.12 } },
    units: [E('bone_guard', 3, 3, 3), E('bone_guard', 3, 2, 3), E('necromancer', 3, 4, 0), E('lich', 3, 5, 0), E('skeleton_archer', 3, 1, 1), E('wraith', 3, 6, 1)] },
  { realm: 3, name: 'Inferno Tyrant', traitHint: 'BOSS · Hellfire',
    gimmickName: 'Hellfire', gimmickDesc: 'Every blow burns and drains mana — your casters will struggle to fire. Lean on attack carries.',
    gimmick: { traitBonus: { demon: 6 }, flat: { ap: 40 } },
    units: [E('hellguard', 3, 3, 3), E('hellguard', 3, 4, 3), E('warlock', 3, 5, 0), E('fel_archer', 3, 2, 1), E('imp_assassin', 3, 6, 1), E('pit_summoner', 2, 1, 0)] },
  { realm: 4, name: 'The Warchief', traitHint: 'BOSS · Bloodlust',
    gimmickName: 'Bloodlust', gimmickDesc: 'The whole horde ramps attack speed AND lifesteal the longer the fight drags — and they heal off every blow. Burst them down FAST; a slow grind only feeds them.',
    gimmick: { traitBonus: { orc: 4 }, flat: { hp: 0.20, as: 0.10 } },
    units: [E('warboss', 3, 3, 3), E('orc_grunt', 3, 2, 3), E('berserker', 3, 6, 2), E('axethrower', 3, 5, 1), E('orc_shaman', 3, 4, 0), E('berserker', 3, 1, 2)] },
  { realm: 5, name: 'The Worldwyrm', traitHint: 'BOSS · Dragonscale',
    gimmickName: 'Dragonscale', gimmickDesc: 'Near-immune to spells and hits like a meteor. Out-tank it and chip with physical attacks, not magic.',
    gimmick: { traitBonus: { dragon: 2 }, flat: { ad: 0.15, mr: 25 } },
    units: [E('dragon_knight', 3, 3, 3), E('dragon_sage', 3, 4, 0), E('wyrm_archer', 3, 5, 1), E('bramble_brute', 3, 2, 3), E('moon_priestess', 2, 1, 0), E('grove_healer', 2, 6, 0)] },
  { realm: 6, name: 'The Void Maw', traitHint: 'BOSS · The End',
    gimmickName: 'The End', gimmickDesc: 'Every horror at its fiercest — no single counter. Bring your strongest, most rounded board.',
    gimmick: { flat: { ad: 0.18, ap: 50, hp: 0.18 } },
    units: [E('dragon_knight', 3, 3, 3), E('warlock', 3, 4, 0), E('lich', 3, 5, 0), E('wraith', 3, 2, 1), E('pit_summoner', 3, 6, 0), E('moon_priestess', 3, 1, 0), E('bramble_brute', 3, 0, 3)] },
  // SECRET realm 6 finale — the hardest fight in the game.
  { realm: 7, name: 'The Ascendant', traitHint: 'BOSS · Apotheosis',
    gimmickName: 'Apotheosis', gimmickDesc: 'A god-king and its chosen — overwhelming on every axis. There is no counter but a maxed, perfectly-positioned warband.',
    gimmick: { flat: { ad: 0.25, ap: 70, hp: 0.25, armor: 25, mr: 25 } },
    units: [E('dragon_knight', 3, 3, 3), E('dragon_sage', 3, 4, 0), E('wyrm_archer', 3, 5, 1), E('lich', 3, 1, 0), E('warlock', 3, 6, 0), E('bramble_brute', 3, 2, 3), E('moon_priestess', 3, 0, 1)] },
];
// ---- THE TRIALS (boss-rush mode): a fixed gauntlet of unique CREATURES (data/creatures.js),
// one per round, escalating to the Ember Wyrm. Each telegraphs its mechanic on the boss banner.
// Each boss is the centrepiece of a themed warband (minions = [defId, star, col, row]) so it's a
// real encounter, not 8-on-1. Minions + the boss scale up across the gauntlet.
const TRIALS = [
  { id: 'gloom_slime', name: 'Gloom Slime', tier: 'Trial I',  gimmickName: 'Split',     gimmickDesc: 'Spits corrosive acid on a cluster, and SPLITS into two slimes when wounded. Focus it down with single-target burst.', col: 4, row: 2,
    minions: [['bone_guard', 2, 2, 3], ['skeleton_archer', 1, 6, 1]] },
  { id: 'stone_golem', name: 'Stone Golem', tier: 'Trial II', gimmickName: 'Stoneform', gimmickDesc: 'Enormous armor and reflects damage (thorns); its slam stuns. Bring magic/ability damage — raw autos bounce and hurt you back.', col: 4, row: 2,
    minions: [['orc_grunt', 2, 2, 3], ['crossbowman', 2, 1, 1], ['court_mage', 2, 6, 0]] },
  { id: 'wraith_lord', name: 'Wraith Lord', tier: 'Trial III', gimmickName: 'Soul Harvest', gimmickDesc: 'Drains life to heal itself and raises slain souls as spectres; phases out (dodge) when low. Burst it before it stabilises.', col: 4, row: 1,
    minions: [['bone_guard', 3, 2, 3], ['lich', 2, 6, 0], ['skeleton_archer', 2, 1, 1], ['wraith', 2, 6, 2]] },
  { id: 'bone_hydra',  name: 'Bone Hydra', tier: 'Trial IV', gimmickName: 'Many Heads', gimmickDesc: 'Bites your whole front line at once, and REGROWS two more heads at half health. Spread your board and out-sustain it.', col: 4, row: 2,
    minions: [['bone_guard', 2, 2, 3], ['bone_guard', 2, 6, 3], ['skeleton_archer', 2, 1, 1]] },
  { id: 'ember_wyrm',  name: 'Ember Wyrm', tier: 'Trial V', gimmickName: 'Wyrmfire', gimmickDesc: 'Breathes fire across your BACK line and ENRAGES below half HP (huge attack speed + a meteor storm). Protect your carries and end it fast.', col: 4, row: 0,
    minions: [['knight_captain', 2, 2, 3], ['wyrm_archer', 2, 1, 1], ['court_mage', 2, 6, 0], ['bone_guard', 3, 6, 3]] },
  { id: 'venom_broodmother', name: 'Venom Broodmother', tier: 'Trial VI', gimmickName: 'Brood', gimmickDesc: 'Sprays corroding venom (a lingering poison) over your clustered units and HATCHES a brood of spiderlings when wounded. Spread out and burst the mother.', col: 4, row: 1,
    minions: [['skeleton_archer', 3, 1, 1], ['skeleton_archer', 3, 6, 1], ['bone_guard', 3, 2, 3], ['bone_guard', 3, 6, 3]] },
  { id: 'elder_treant', name: 'Elder Treant', tier: 'Trial VII', gimmickName: 'Entangle', gimmickDesc: 'Roots STUN your whole front line, it reflects punishing thorns, and it slowly knits its bark back together. Bring ability/magic burst — autos bounce and it out-heals chip damage.', col: 4, row: 2,
    minions: [['bramble_brute', 3, 2, 3], ['wood_ranger', 3, 1, 1], ['grove_healer', 3, 6, 0], ['moon_priestess', 2, 6, 1]] },
  { id: 'frost_monarch', name: 'Frost Monarch', tier: 'Trial VIII', gimmickName: 'Deep Freeze', gimmickDesc: 'A glacial nova FREEZES (deep slow) and strips Magic Resist across your board, then it walls up behind a huge shield and quickens. Kill it before the ice sets in.', col: 4, row: 0,
    minions: [['lich', 3, 6, 0], ['bone_guard', 3, 2, 3], ['warboss', 3, 5, 3], ['crossbowman', 3, 1, 1]] },
  { id: 'void_maw', name: 'The Void Maw', tier: 'Trial IX', gimmickName: 'Unmaking', gimmickDesc: 'Drains and BURNS your team’s mana, rots them with void-fire, then below half phases out (dodge) and rains meteors while tearing open void-spawn. The gate to the abyss beyond.', col: 4, row: 1,
    minions: [['warlock', 3, 6, 0], ['wraith', 3, 5, 2], ['dragon_knight', 2, 2, 3], ['pit_summoner', 2, 1, 1]] },
  { id: 'abyssal_kraken', name: 'Abyssal Kraken', tier: 'Trial X', gimmickName: 'Maelstrom', gimmickDesc: 'A whirlpool CRUSHES a wide cluster, DROWNS them (your healing is cut) and hurls them back, then it hatches grasping tentacle-spawn when wounded. Spread out and keep your healers clear.', col: 4, row: 1,
    minions: [['wraith', 3, 6, 2], ['lich', 3, 6, 0], ['dragon_knight', 2, 2, 3], ['necromancer', 2, 1, 1]] },
  { id: 'thunder_roc', name: 'Thunder Roc', tier: 'Trial XI', gimmickName: 'Tempest', gimmickDesc: 'Chains lightning across your WHOLE team and stuns them, strikes blisteringly fast, and below half it whips up a hail of meteors. Burst it down before the storm builds — and don’t clump your carries.', col: 4, row: 0,
    minions: [['wyrm_archer', 3, 1, 1], ['wyrm_archer', 3, 6, 1], ['dragon_sage', 2, 6, 0], ['bone_guard', 3, 2, 3]] },
  { id: 'worldbreaker', name: 'The Worldbreaker', tier: 'FINAL TRIAL', gimmickName: 'Cataclysm', gimmickDesc: 'A colossus of stone and starlight: its slam STUNS and shatters the armour of a wide cluster, then below half it walls behind a vast shield, enrages, rains the sky down and tears open spawn. The absolute end of the gauntlet.', col: 4, row: 1,
    minions: [['dragon_knight', 3, 2, 3], ['dragon_sage', 2, 6, 0], ['wyrm_archer', 3, 1, 1]] },
];
export const TRIAL_COUNT = TRIALS.length;
export function getTrialBoard(index) {
  const t = TRIALS[Math.min(index, TRIALS.length - 1)];
  const over = Math.max(0, index - (TRIALS.length - 1));   // beyond the final = endless, scaled
  const gimmick = over > 0 ? { flat: { hp: 0.25 * over, ad: 0.15 * over } } : null;
  const units = [{ defId: t.id, star: 1, col: t.col, row: t.row }]
    .concat((t.minions || []).map(([defId, star, col, row]) => ({ defId, star: Math.min(3, star + (over > 0 ? 1 : 0)), col, row })));
  return { name: t.name + (over > 0 ? ' +' + over : ''), traitHint: t.tier, boss: true, gimmick, gimmickName: t.gimmickName, gimmickDesc: t.gimmickDesc, units };
}

// Endless realms reuse the last (toughest) boss, with its gimmick scaled up a touch per overflow.
export function bossForRealm(realmIndex) {
  const b = BOSSES[Math.min(realmIndex, BOSSES.length - 1)];
  const over = Math.max(0, realmIndex - (BOSSES.length - 1));
  const gimmick = over > 0
    ? { ...b.gimmick, flat: { ...(b.gimmick.flat || {}), hp: ((b.gimmick.flat && b.gimmick.flat.hp) || 0) + 0.1 * over, ad: ((b.gimmick.flat && b.gimmick.flat.ad) || 0) + 0.08 * over } }
    : b.gimmick;
  return { name: b.name + (over > 0 ? ' +' + over : ''), traitHint: b.traitHint, boss: true, gimmick, gimmickName: b.gimmickName, gimmickDesc: b.gimmickDesc, units: b.units.map((u) => ({ ...u })) };
}
