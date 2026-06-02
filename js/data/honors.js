// War Honors — persistent, one-time achievements that span all three modes (Warpath, Trials,
// Ladder). Each pays a small Spoils BOUNTY the first (and only) time it's earned. Because Spoils
// are sink-gated by War Caches, honours guide play and reward milestones WITHOUT inflating raw
// power (KB systems-and-economy: prefer goals/visibility over stat-creep; cap power).
//
// The board doubles as a quest log: it tells a new warlord WHAT to chase. This is pure data —
// main.js claims honours at the moment each is achieved (Meta.claimHonor). `cat` groups them on
// the board; `bounty` = Spoils awarded once.
//
// `secret: true` = the honour points at hidden content the player hasn't discovered yet (the
// hidden 7th realm; the ultimate forge tier). Its name/desc/bounty stay masked as "???" on the
// board UNTIL earned — earning it is the reveal. Don't mark a feat secret just because it's hard.

export const HONOR_CATS = [
  { id: 'conquest', name: 'Conquest',   icon: 'sword',  color: 'var(--gold)' },
  { id: 'trials',   name: 'The Trials', icon: 'burst',  color: '#ff6a8a' },
  { id: 'ladder',   name: 'The Ladder', icon: 'crown',  color: '#6fb1ff' },
  { id: 'mastery',  name: 'Mastery',    icon: 'star',   color: '#c79bff' },
];

export const HONORS = [
  // — Conquest (Warpath) —
  { id: 'first_realm',     cat: 'conquest', icon: 'banner', bounty: 15, name: 'First Conquest',       desc: 'Conquer your first realm.' },
  { id: 'three_realms',    cat: 'conquest', icon: 'sword',  bounty: 25, name: 'Warlord',              desc: 'Conquer three realms.' },
  { id: 'all_realms',      cat: 'conquest', icon: 'crown',  bounty: 50, name: 'Conqueror of the Six', desc: 'Conquer all six realms.' },
  { id: 'astral',          cat: 'conquest', icon: 'gem',    bounty: 75, name: 'Ascendant',            desc: 'Conquer the hidden Astral Throne.', secret: true },
  { id: 'flawless',        cat: 'conquest', icon: 'shield', bounty: 30, name: 'Untouched',            desc: 'Conquer a realm without losing a single life.' },
  // — The Trials —
  { id: 'first_boss',      cat: 'trials',   icon: 'fang',   bounty: 12, name: 'Boss Slayer',          desc: 'Slay your first Trials boss.' },
  { id: 'clear_trials',    cat: 'trials',   icon: 'trophy', bounty: 50, name: 'Gauntlet Champion',    desc: 'Slay every boss of the Trials.' },
  // — The Ladder —
  { id: 'ladder_win',      cat: 'ladder',   icon: 'trophy', bounty: 25, name: 'Top of the Heap',      desc: 'Win a ladder game — last warband standing.' },
  { id: 'reach_gold',      cat: 'ladder',   icon: 'crown',  bounty: 20, name: 'Gold Rank',            desc: 'Climb to Gold rank.' },
  { id: 'reach_diamond',   cat: 'ladder',   icon: 'gem',    bounty: 35, name: 'Diamond Rank',         desc: 'Climb to Diamond rank.' },
  { id: 'reach_master',    cat: 'ladder',   icon: 'star',   bounty: 60, name: 'Master Rank',          desc: 'Climb to the summit — Master rank.' },
  // — Mastery (any run) —
  { id: 'three_star',      cat: 'mastery',  icon: 'star',   bounty: 18, name: 'Triple Crown',         desc: 'Field a 3★ champion.' },
  { id: 'six_synergy',     cat: 'mastery',  icon: 'bars',   bounty: 22, name: 'Perfect Synergy',      desc: 'Activate a synergy at six or more champions.' },
  { id: 'forge_mythic',    cat: 'mastery',  icon: 'anvil',  bounty: 25, name: 'Master Smith',         desc: 'Forge a Mythic piece of gear.' },
  { id: 'forge_godforged', cat: 'mastery',  icon: 'flame',  bounty: 60, name: 'Godsmith',             desc: 'Forge a Godforged item — the ceiling.', secret: true },
];

export const HONOR_BY_ID = Object.fromEntries(HONORS.map((h) => [h.id, h]));
export const TOTAL_BOUNTY = HONORS.reduce((s, h) => s + h.bounty, 0);
