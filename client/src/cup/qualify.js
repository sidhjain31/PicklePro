// Adults tournament rules (owner's spec + answers, 2026-11-17): league ranking in tiers, quarter-
// final qualification (top 8), fixed QF/SF pairing, knockout winner. ONE source of truth, used by
// core.js (server and pages). Pure and deterministic: same input -> same output; no UI, no
// database, no clock, no randomness. The kids event (fewer than 8 teams) keeps its own rules.
//
// League: every team plays ONE match (6 games) against the opponent drawn live. 4-2 / 5-1 / 6-0 =
// win, 3-3 = draw (a draw is NOT decided by points in the league).
// Ranking, strictly in this order:
//   Tier 1 winners  - more games won first (6-0, 5-1, 4-2), then more cumulative points;
//   Tier 2 draws    - always below every winner; more cumulative points first (both teams of the
//                     same drawn match can qualify);
//   Tier 3 losers   - below everyone, can never qualify (ranked for display: games, then points).
// Ranks 1-8 qualify; rank = seed. The line-up exists only when ALL league matches are complete.
// Teams still level (tier, games, points) where it matters (the 8/9 cut or seeding inside the top 8)
// are never split automatically: the host decides in the app, with a recorded reason.
// Knockout (owner, 2026-11-17): quarter-finals by league rank 1v8, 2v7, 3v6, 4v5; semi-finals use
// the same logic — once all four quarter-finals are decided, the four winners in league-rank order
// play best v 4th-best and 2nd v 3rd; the Final is the two semi-final winners.
// A knockout match: more games wins; 3-3 -> more cumulative points wins; still level -> the host
// decides (with a recorded reason).

export const ADULT_FORMAT = {
  teams: 28, // expected for ICC Season 2 (16+ teams always give 8 winners/draws; with fewer, the best losers fill the gaps)
  gamesPerMatch: 6,
  qualifiers: 8,
  // Quarter-finals by league rank (= seed): QF1 1v8, QF2 2v7, QF3 3v6, QF4 4v5.
  qfPairs: [[1, 8], [2, 7], [3, 6], [4, 5]],
  // Semi-finals re-seeded: the four QF winners by league rank -> SF1 best v 4th-best, SF2 2nd v 3rd
  // (positions in the sorted list of QF winners).
  sfPairs: [[1, 4], [2, 3]],
};

// The semi-final pairs once every quarter-final has a winner: `winners` = [{ key, seed }] (seed =
// league rank). Returns [[a, b], [c, d]] (team keys) or null while a quarter-final is undecided.
export function semiFinalPairs(winners, format = ADULT_FORMAT) {
  if (!Array.isArray(winners) || winners.length !== format.qfPairs.length || winners.some(w => !w?.key || !w.seed)) return null;
  const byRank = [...winners].sort((x, y) => x.seed - y.seed);
  return format.sfPairs.map(([x, y]) => [byRank[x - 1].key, byRank[y - 1].key]);
}

const sideKey = (tie, key) => (tie.a === key ? 'a' : 'b');
export const pointsComplete = tie => tie.games.every(g => g.sa != null && g.sb != null);

// League match: decided by games only. 'a' | 'b' | 'draw' | null (not complete: a game without a
// winner, or teams not known).
export function leagueResult(tie, format = ADULT_FORMAT) {
  if (!tie?.a || !tie?.b) return null;
  if (tie.ga + tie.gb < format.gamesPerMatch) return null;
  if (tie.ga === tie.gb) return 'draw';
  return tie.ga > tie.gb ? 'a' : 'b';
}

// Knockout match: games, then (3-3) cumulative points, then the host's recorded decision.
// Points decide only when every game has its score; if a 3-3 lacks points, the host must enter them
// (or decide, with a reason).
export function knockoutOutcome(tie, format = ADULT_FORMAT) {
  const complete = tie.ga + tie.gb >= format.gamesPerMatch;
  let winner = null;
  let needsPoints = false;
  let needsDecider = false;
  if (tie.ga * 2 > format.gamesPerMatch) winner = 'a';
  else if (tie.gb * 2 > format.gamesPerMatch) winner = 'b';
  else if (complete) {
    const full = pointsComplete(tie);
    if (full && tie.pa !== tie.pb) winner = tie.pa > tie.pb ? 'a' : 'b';
    else if (tie.decider === 'a' || tie.decider === 'b') winner = tie.decider;
    else if (!full) needsPoints = true;
    else needsDecider = true;
  }
  return { winner, needsPoints, needsDecider, complete };
}

// The league table. `ties` are the league matches as built by core.js (with ga, gb, pa, pb, games);
// `tieBreaks` the host's recorded decisions [{ teams: [keys in decided order], reason, by, at }].
export function rankLeague(teams, ties, tieBreaks = [], format = ADULT_FORMAT) {
  const Q = format.qualifiers;
  const total = Math.floor(teams.length / 2);
  const nameOf = new Map(teams.map(t => [t.key, t.name]));
  const matchOf = new Map();
  for (const t of ties) {
    matchOf.set(t.a, t);
    matchOf.set(t.b, t);
  }
  const complete = ties.filter(t => leagueResult(t, format)).length;
  const final = total > 0 && complete === total;

  const rows = teams.map(team => {
    const t = matchOf.get(team.key) ?? null;
    const res = t ? leagueResult(t, format) : null;
    const s = t ? sideKey(t, team.key) : null;
    const o = s === 'a' ? 'b' : 'a';
    const result = !res ? null : res === 'draw' ? 'D' : res === s ? 'W' : 'L';
    return {
      key: team.key,
      matchId: t?.id ?? null,
      opponent: t ? t[o] : null,
      drawn: Boolean(t),
      result,
      tier: result === 'W' ? 1 : result === 'D' ? 2 : result === 'L' ? 3 : 4,
      gw: t ? t[`g${s}`] : 0,
      gl: t ? t[`g${o}`] : 0,
      pf: t ? t[`p${s}`] : 0,
      pa: t ? t[`p${o}`] : 0,
      pointsComplete: t ? pointsComplete(t) : true,
    };
  });

  // Order: tier, games won, cumulative points. Teams that are still level keep a stable listing
  // order (team key) for display only — their RANK is shared and flagged, never decided by it.
  const num = k => Number(String(k).replace(/\D/g, '')) || 0;
  rows.sort((x, y) => x.tier - y.tier || y.gw - x.gw || y.pf - x.pf || num(x.key) - num(y.key));

  // Groups of teams that can't be separated: same tier and games won, and the same points — or,
  // when any of them lacks game scores, the whole tier+games block (its points are unknown).
  const groups = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].tier === 4) { groups.push([rows[i]]); i++; continue; }
    let j = i;
    while (j < rows.length && rows[j].tier === rows[i].tier && rows[j].gw === rows[i].gw) j++;
    const block = rows.slice(i, j);
    if (block.some(r => !r.pointsComplete)) groups.push(block);
    else {
      let k = 0;
      while (k < block.length) {
        let m = k;
        while (m < block.length && block[m].pf === block[k].pf) m++;
        groups.push(block.slice(k, m));
        k = m;
      }
    }
    i = j;
  }

  // Apply the host's decisions (only for exactly the same set of tied teams).
  const sameSet = (a, b) => a.length === b.length && a.every(k => b.includes(k));
  const ordered = [];
  const tieGroups = [];
  for (const g of groups) {
    if (g.length < 2 || g[0].tier === 4) { ordered.push(...g); continue; }
    const keys = g.map(r => r.key);
    // The scores the decision is made on: a later correction to them voids the decision.
    const sig = g.map(r => `${r.key}:${r.tier}:${r.gw}:${r.pf}:${r.pointsComplete ? 1 : 0}`).sort().join(',');
    const tb = tieBreaks.find(x => Array.isArray(x.teams) && sameSet(x.teams, keys) && (!x.sig || x.sig === sig));
    const group = { teams: keys, sig, tier: g[0].tier, resolved: Boolean(tb), reason: tb?.reason ?? null, by: tb?.by ?? null, at: tb?.at ?? null, pointsMissing: g.some(r => !r.pointsComplete) };
    tieGroups.push(group);
    const members = tb ? tb.teams.map(k => g.find(r => r.key === k)) : g;
    for (const r of members) {
      r.tieWith = keys.filter(k => k !== r.key);
      r.tieResolved = group.resolved;
      r.tieReason = group.reason;
      ordered.push(r);
    }
  }

  // Positions and (shared) ranks.
  let pos = 0;
  for (let g = 0; g < ordered.length; g++) {
    const r = ordered[g];
    pos++;
    r.pos = r.tier === 4 ? null : pos;
  }
  for (const r of ordered) {
    if (r.tier === 4) { r.rank = null; continue; }
    if (r.tieWith?.length && !r.tieResolved) {
      const all = [r.key, ...r.tieWith].map(k => ordered.find(x => x.key === k).pos);
      r.rank = Math.min(...all);
      r.shared = true;
    } else r.rank = r.pos;
  }

  // Only winners and draws qualify. Exception for small draws (8-15 teams): when the finished league
  // has fewer than Q winners + draws, the best losers fill the remaining places.
  const eligible = ordered.filter(r => r.tier <= 2).length;
  const fill = final && eligible < Q;

  // Ties that matter: inside the top Q (seeding) or across the Q/Q+1 cut (who qualifies).
  for (const g of tieGroups) {
    const ps = g.teams.map(k => ordered.find(x => x.key === k).pos);
    g.from = Math.min(...ps);
    g.to = Math.max(...ps);
    // Losers never qualify (unless filling a small draw), so their ties don't matter.
    g.kind = (g.tier === 3 && !fill) || g.from > Q ? 'below' : g.to > Q ? 'cut' : 'seeding';
  }
  const blocking = tieGroups.filter(g => !g.resolved && g.kind !== 'below');

  // Status and the reason for every rank.
  const remaining = total - complete;
  const winners = ordered.filter(r => r.tier === 1);
  for (const r of ordered) {
    const names = (r.tieWith ?? []).map(k => nameOf.get(k)).join(', ');
    const score = `${r.gw}–${r.gl}`;
    let why = r.tier === 1 ? `Won ${score} · ${r.pf} pts` : r.tier === 2 ? `Drew ${score} · ${r.pf} pts` : r.tier === 3 ? `Lost ${score} · ${r.pf} pts` : r.drawn ? 'Match not finished yet' : 'Not drawn yet';
    if (r.tier < 4 && !r.pointsComplete) why += ' · points missing';
    if (r.tier === 2) why += ' · draws rank below every winner';
    if (r.tier === 3) why += fill && r.pos <= Q ? ` · fills a top-${Q} place (fewer than ${Q} winners and draws)` : ' · a loss can’t qualify';
    // Mention a tie only where it matters (top-8 cut or seeding); level teams lower down share a rank.
    const tg = r.tieWith?.length ? tieGroups.find(x => x.teams.includes(r.key)) : null;
    if (tg && tg.kind !== 'below') why += r.tieResolved ? ` · level with ${names}, host decided: ${r.tieReason}` : ` · level with ${names} on games and points — the host decides`;
    r.reason = why;

    if (r.tier === 4) r.status = 'pending';
    else if (r.tier === 3 && !(fill && r.pos <= Q)) r.status = 'out';
    else if (final) {
      const g = blocking.find(x => x.teams.includes(r.key));
      r.status = g?.kind === 'cut' ? 'tie' : r.pos <= Q ? 'qualified' : 'out';
    } else {
      // Provisional: qualified only if nothing left to play can push this team below rank Q; out
      // only if it can no longer reach the top Q. A remaining match adds at most one winner or two
      // drawn teams above a team.
      const unsure = x => !x.pointsComplete || !r.pointsComplete;
      if (r.tier === 1) {
        const above = winners.filter(x => x !== r && (x.gw > r.gw || (x.gw === r.gw && (x.pf >= r.pf || unsure(x))))).length;
        r.status = above + remaining <= Q - 1 ? 'qualified' : 'pending';
      } else {
        const draws = ordered.filter(x => x !== r && x.tier === 2);
        const surelyAbove = winners.length + draws.filter(x => x.pf > r.pf && !unsure(x)).length;
        const maybeAbove = winners.length + draws.filter(x => x.pf >= r.pf || unsure(x)).length + 2 * remaining;
        r.status = surelyAbove >= Q ? 'out' : maybeAbove <= Q - 1 ? 'qualified' : 'pending';
      }
    }
  }

  return {
    rows: ordered,
    complete,
    total,
    final,
    qualifiers: Q,
    tieGroups,
    blocking,
    // The quarter-final line-up: only when every league match is complete and no tie blocks it.
    top: final && !blocking.length ? ordered.slice(0, Q).map(r => r.key) : null,
  };
}
