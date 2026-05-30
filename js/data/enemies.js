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
  { name: 'Hex Coven', traitHint: 'Mage burst', units: [E('court_mage', 2, 4, 1), E('court_mage', 1, 2, 1), E('thornguard', 1, 3, 3), E('field_medic', 1, 5, 0)] },
  { name: 'The Wolf Pack', traitHint: 'Beast ferocity', units: [E('beast_hunter', 2, 4, 1), E('bramble_brute', 1, 3, 3), E('pack_stalker', 1, 6, 3), E('druid_healer', 1, 2, 0)] },
  { name: 'Shadow Cell', traitHint: 'Assassin dive!', units: [E('imp_assassin', 2, 2, 1), E('shadow_dancer', 2, 5, 1), E('hellguard', 2, 3, 3), E('court_mage', 2, 4, 0), E('bone_guard', 2, 2, 3)] },
  { name: 'Undead Horde', traitHint: 'Undead revive', units: [E('bone_guard', 2, 3, 3), E('skeleton_archer', 2, 2, 1), E('lich', 2, 4, 0), E('wraith', 2, 6, 1), E('necromancer', 1, 1, 0), E('bone_guard', 2, 5, 3)] },
  { name: 'Infernal Legion', traitHint: 'Demon mana-burn', units: [E('hellguard', 2, 3, 3), E('warlock', 2, 4, 0), E('fel_archer', 2, 2, 1), E('imp_assassin', 2, 6, 2), E('hellguard', 2, 5, 3), E('bramble_brute', 1, 1, 3)] },
  { name: 'Elf Sentinels', traitHint: 'Elf evasion', units: [E('thornguard', 2, 3, 3), E('moon_priestess', 2, 4, 0), E('wood_ranger', 2, 2, 1), E('grove_healer', 2, 5, 0), E('shadow_dancer', 2, 6, 1), E('moon_priestess', 2, 1, 0)] },
  { name: 'The Dragonsworn', traitHint: 'BOSS · Dragon', units: [E('dragon_knight', 2, 3, 3), E('dragon_sage', 2, 4, 0), E('knight_captain', 2, 2, 3), E('moon_priestess', 2, 5, 1), E('grove_healer', 2, 1, 0), E('wyrm_archer', 1, 6, 1)] },
  { name: 'Frost Wardens', traitHint: 'Elf wall + casters', units: [E('thornguard', 3, 3, 3), E('bramble_brute', 2, 5, 3), E('moon_priestess', 3, 4, 0), E('grove_healer', 2, 2, 0), E('wood_ranger', 3, 1, 1), E('shadow_dancer', 2, 6, 1), E('knight_captain', 2, 0, 3)] },
  { name: 'The Bone Legion', traitHint: 'Undead swarm', units: [E('bone_guard', 3, 3, 3), E('bone_guard', 2, 1, 3), E('necromancer', 3, 4, 0), E('lich', 3, 5, 0), E('skeleton_archer', 3, 2, 1), E('wraith', 2, 6, 1), E('thornguard', 2, 0, 3)] },
  { name: 'Hellfire Host', traitHint: 'Demon burn', units: [E('hellguard', 3, 3, 3), E('bramble_brute', 3, 5, 3), E('warlock', 3, 4, 0), E('fel_archer', 3, 2, 1), E('imp_assassin', 3, 6, 1), E('pit_summoner', 2, 1, 0), E('hellguard', 2, 0, 3)] },
  { name: 'The Worldwyrm', traitHint: 'FINAL BOSS · Dragons', units: [E('dragon_knight', 3, 3, 3), E('dragon_sage', 3, 4, 0), E('wyrm_archer', 3, 5, 1), E('thornguard', 3, 2, 3), E('moon_priestess', 2, 1, 0), E('grove_healer', 2, 6, 0), E('knight_captain', 2, 0, 3)] },
];

// ---- Warpath REALMS: conquer each realm by beating its 10 warbands. Each realm is a themed,
// progressively harder region; conquering one (10 wins) is permanent and unlocks the next. You
// start fresh each realm (board/economy reset). `diff` bumps enemy stars/numbers; `pool` themes
// the reinforcements so each realm FEELS distinct.
export const REALMS = [
  { name: 'The Marches',     hint: 'Border skirmishers — a fair first test',  color: '#9aa6b8', pool: null,                                                                       diff: 0 },
  { name: 'The Deepwood',    hint: 'Elven ambush — evasive, healing lines',   color: '#54e6c0', pool: ['thornguard', 'wood_ranger', 'moon_priestess', 'grove_healer', 'shadow_dancer'], diff: 2 },
  { name: 'The Bonelands',   hint: 'Undead horde — the dead keep rising',     color: '#8cff9e', pool: ['bone_guard', 'skeleton_archer', 'lich', 'wraith', 'necromancer'],               diff: 4 },
  { name: 'The Inferno',     hint: 'Demon legions — relentless mana-burn',    color: '#ff5a3c', pool: ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'pit_summoner'],            diff: 6 },
  { name: 'The Dragonspire', hint: 'Dragonsworn — overwhelming raw power',    color: '#ffd24a', pool: ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'knight_captain'],                 diff: 9 },
  { name: 'The Voidreach',   hint: 'Every horror at its fiercest',            color: '#c79bff', pool: ['dragon_knight', 'warlock', 'lich', 'wraith', 'pit_summoner', 'moon_priestess'],   diff: 13 },
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
  const esc = Math.max(0, round - LADDER.length) + diff;     // total escalation steps
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
