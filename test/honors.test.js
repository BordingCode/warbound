// War Honors tests. Run: node test/honors.test.js
globalThis.localStorage = (() => { let s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; }, clear: () => { s = {}; } }; })();
import * as Meta from '../js/state/meta.js';
import { HONORS, HONOR_BY_ID, TOTAL_BOUNTY } from '../js/data/honors.js';

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) { cond ? pass++ : (fail++, fails.push(name)); process.stdout.write(cond ? '.' : 'F'); }

// ---- data integrity ----
{
  ok('honors: a non-empty list', HONORS.length >= 10);
  ok('honors: unique ids', new Set(HONORS.map((h) => h.id)).size === HONORS.length);
  ok('honors: every honour has a positive bounty', HONORS.every((h) => h.bounty > 0));
  ok('honors: every honour has name/desc/icon/cat', HONORS.every((h) => h.name && h.desc && h.icon && h.cat));
  ok('honors: HONOR_BY_ID resolves', HONOR_BY_ID['first_realm'] && HONOR_BY_ID['clear_trials']);
  ok('honors: TOTAL_BOUNTY sums the bounties', TOTAL_BOUNTY === HONORS.reduce((s, h) => s + h.bounty, 0));
  // secret honours: the hidden-content feats are flagged (masked on the board until earned)
  ok('secret: the hidden Astral Throne feat is secret', HONOR_BY_ID['astral'].secret === true);
  ok('secret: the ultimate forge tier feat is secret', HONOR_BY_ID['forge_godforged'].secret === true);
  ok('secret: ordinary feats are NOT secret', !HONOR_BY_ID['first_realm'].secret && !HONOR_BY_ID['clear_trials'].secret && !HONOR_BY_ID['reach_master'].secret);
}

// ---- claimHonor: pays the bounty ONCE, idempotent ----
{
  localStorage.clear();
  const before = Meta.load().spoils;
  const def = HONOR_BY_ID['first_boss'];
  const r = Meta.claimHonor('first_boss');
  ok('claim: returns the honour + bounty', r && r.honor.id === 'first_boss' && r.bounty === def.bounty);
  ok('claim: spoils increased by exactly the bounty', Meta.load().spoils === before + def.bounty);
  ok('claim: honour is now marked earned', Meta.hasHonor('first_boss'));
  const again = Meta.claimHonor('first_boss');
  ok('claim: a second claim returns null (no double-pay)', again === null);
  ok('claim: spoils unchanged on the second claim', Meta.load().spoils === before + def.bounty);
  ok('claim: unknown id is a no-op', Meta.claimHonor('nope_not_real') === null);
}

// ---- markHonor: credits earned status WITHOUT paying a bounty ----
{
  localStorage.clear();
  const before = Meta.load().spoils;
  const marked = Meta.markHonor('all_realms');
  ok('mark: returns true the first time', marked === true);
  ok('mark: honour shows earned', Meta.hasHonor('all_realms'));
  ok('mark: NO spoils were paid', Meta.load().spoils === before);
  ok('mark: a second mark returns false', Meta.markHonor('all_realms') === false);
  ok('mark: an already-claimed honour cannot be re-marked', (Meta.claimHonor('astral'), Meta.markHonor('astral') === false));
}

// ---- honor-init flag (retro-credit guard) ----
{
  localStorage.clear();
  ok('init: starts undone', Meta.honorInitDone() === false);
  Meta.setHonorInit();
  ok('init: flips to done', Meta.honorInitDone() === true);
}

// ---- honorsEarned reflects the map ----
{
  localStorage.clear();
  Meta.claimHonor('three_star'); Meta.markHonor('reach_gold');
  const e = Meta.honorsEarned();
  ok('earned: map contains both', e['three_star'] === true && e['reach_gold'] === true);
  ok('earned: unset honours are absent/falsy', !e['reach_master']);
}

console.log(`\n\n${fail === 0 ? '✓ ALL PASS' : '✗ FAIL'}  (${pass} passed, ${fail} failed)`);
if (fails.length) { console.log('Failed:', fails.join(', ')); process.exit(1); }
