// Adults league standings, quarter-final qualification and knockout (owner's spec, 2026-11-17).
// Pure logic tests on client/src/cup/qualify.js + core.js (no server, no database).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as core from '../../client/src/cup/core.js';
import { ADULT_FORMAT, semiFinalPairs } from '../../client/src/cup/qualify.js';

const NOW = 10_000_000;

// 28 teams T1..T28; league pairs T1 v T2, T3 v T4 … T27 v T28 (as the spec's examples), already drawn.
function league28() {
  const cup = core.newCup({ event: 'main' });
  core.setTeams(cup, Array.from({ length: 28 }, (_, i) => ({ name: `T${i + 1}`, players: { A: `A${i + 1}`, B: `B${i + 1}`, C: `C${i + 1}`, D: `D${i + 1}` } })));
  core.openArena(cup);
  for (let k = 1; k <= 14; k++) {
    cup.draws.push({ seq: k, tie: k, a: `t${2 * k - 1}`, b: `t${2 * k}`, weapon: 'fireball', last: false, aimMs: 0, startAt: 0, revealA: 0, revealB: 0, doneAt: 0, voided: false });
  }
  return cup;
}
const split = (total, n) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
// Six games where team a wins `winsA` games with `pa` points in total and team b has `pb` in total.
function games(winsA, pa, pb) {
  const A = split(pa, winsA);
  const B = split(pb, 6 - winsA);
  return Array.from({ length: 6 }, (_, i) => (i < winsA ? { sa: A[i], sb: 0 } : { sa: 0, sb: B[i - winsA] }));
}
const teamNo = n => `t${n}`;
// Result of the match of team n (odd = side a): wins for team n, its points, the opponent's points.
function play(cup, n, wins, pts, oppPts, opts = {}) {
  const k = Math.ceil(n / 2);
  const isA = n % 2 === 1;
  const g = isA ? games(wins, pts, oppPts) : games(6 - wins, oppPts, pts);
  core.setResult(cup, { tie: `L${k}`, games: g, now: NOW, ...opts });
}
const view = cup => core.view(cup, NOW);
const names = (cup, keys) => keys.map(k => cup.teams.find(t => t.key === k).name);

// Spec example A: 14 winners.
function exampleA() {
  const cup = league28();
  for (const [n, p] of [[1, 150], [7, 145], [21, 140]]) play(cup, n, 6, p, 0);
  for (const [n, p] of [[3, 138], [11, 135], [17, 133], [25, 131]]) play(cup, n, 5, p, 20);
  for (const [n, p] of [[13, 128], [23, 125], [5, 120], [19, 118], [9, 115], [27, 112], [15, 110]]) play(cup, n, 4, p, 40);
  return cup;
}

test('A. main example: top 8 in order and the quarter-finals', () => {
  const cup = exampleA();
  const v = view(cup);
  assert.equal(v.qualification.final, true);
  assert.deepEqual(names(cup, v.qualification.top), ['T1', 'T7', 'T21', 'T3', 'T11', 'T17', 'T25', 'T13']);
  core.lockKnockout(cup, { now: NOW });
  const ko = view(cup).knockout.ties;
  const qf = id => names(cup, [ko.find(t => t.id === id).a, ko.find(t => t.id === id).b]);
  assert.deepEqual(qf('QF1'), ['T1', 'T13']); // 1 v 8
  assert.deepEqual(qf('QF2'), ['T7', 'T25']); // 2 v 7
  assert.deepEqual(qf('QF3'), ['T21', 'T17']); // 3 v 6
  assert.deepEqual(qf('QF4'), ['T3', 'T11']); // 4 v 5
});

test('B. a drawn team with more points than a 4–2 winner still ranks below it', () => {
  const cup = league28();
  play(cup, 1, 3, 200, 199); // T1 draws 3-3 with 200 points
  play(cup, 3, 4, 50, 45); // T3 wins 4-2 with 50 points
  const rows = view(cup).standings;
  const r = n => rows.find(x => x.key === teamNo(n));
  assert.ok(r(3).pos < r(1).pos);
  assert.equal(r(1).result, 'D');
  assert.match(r(1).reason, /draws rank below every winner/);
});

test('C. with 8 or more winners no drawn team qualifies, however many points', () => {
  const cup = league28();
  for (let k = 1; k <= 8; k++) play(cup, 2 * k - 1, 4, 50 + k, 30);
  for (let k = 9; k <= 14; k++) play(cup, 2 * k - 1, 3, 500, 400);
  const q = view(cup).qualification;
  assert.ok(q.final);
  assert.ok(q.top.every(k => q.rows.find(r => r.key === k).result === 'W'));
  assert.ok(q.rows.filter(r => r.result === 'D').every(r => r.status === 'out'));
});

test('D. 6 winners + 8 drawn matches: 2 places go to drawn teams by points; both teams of one drawn match qualify', () => {
  const cup = league28();
  for (let k = 1; k <= 6; k++) play(cup, 2 * k - 1, 5, 100 + k, 20); // matches 1-6: T1,T3,T5,T7,T9,T11 win
  play(cup, 13, 3, 125, 122); // match 7: T13 125, T14 122 — top two drawn teams
  const draws = [[15, 110, 100], [17, 115, 90], [19, 105, 99], [21, 111, 95], [23, 98, 97], [25, 90, 80], [27, 120, 60]];
  for (const [n, a, b] of draws) play(cup, n, 3, a, b);
  const q = view(cup).qualification;
  assert.ok(q.final);
  assert.deepEqual(names(cup, q.top.slice(6)), ['T13', 'T14']);
  const r = n => q.rows.find(x => x.key === teamNo(n));
  assert.equal(r(13).status, 'qualified');
  assert.equal(r(14).status, 'qualified');
  assert.equal(r(27).status, 'out'); // 120 points, 3rd best draw
});

test('E. an exact tie at the 8/9 boundary is flagged and blocks the quarter-finals until the host decides', () => {
  const cup = league28();
  for (let k = 1; k <= 7; k++) play(cup, 2 * k - 1, 4, 100 + k, 30); // 7 winners
  play(cup, 15, 3, 120, 100); // T15 120 (draw)
  play(cup, 17, 3, 120, 100); // T17 120 (draw) — level with T15 for the 8th place
  for (const n of [19, 21, 23, 25, 27]) play(cup, n, 3, 90, 80);
  const q = view(cup).qualification;
  assert.ok(q.final);
  assert.equal(q.top, null);
  assert.equal(q.blocking.length, 1);
  assert.equal(q.blocking[0].kind, 'cut');
  assert.deepEqual(names(cup, q.blocking[0].teams).sort(), ['T15', 'T17']);
  assert.ok(['T15', 'T17'].every(n => q.rows.find(r => r.key === teamNo(Number(n.slice(1)))).status === 'tie'));
  assert.throws(() => core.lockKnockout(cup, { now: NOW }), /Level teams need your decision/);
  assert.throws(() => core.setTieBreak(cup, { teams: [teamNo(17), teamNo(15)], reason: '', now: NOW }), /reason/);
  core.setTieBreak(cup, { teams: [teamNo(17), teamNo(15)], reason: 'Toss agreed by both captains', by: 'Sidh', now: NOW });
  const q2 = view(cup).qualification;
  assert.equal(names(cup, q2.top)[7], 'T17');
  assert.equal(q2.rows.find(r => r.key === teamNo(15)).status, 'out');
  assert.match(q2.rows.find(r => r.key === teamNo(17)).reason, /host decided: Toss agreed/);
  const entry = cup.audit.at(-1);
  assert.equal(entry.kind, 'tiebreak');
  assert.equal(entry.by, 'Sidh');
  assert.equal(entry.reason, 'Toss agreed by both captains');
  core.lockKnockout(cup, { now: NOW });
  assert.equal(view(cup).phase, 'knockout');
});

test('F. an exact tie inside the top 8 (seeding) is flagged', () => {
  const cup = exampleA();
  play(cup, 7, 6, 150, 0); // T7 now level with T1: 6-0 and 150 points
  const q = view(cup).qualification;
  assert.equal(q.top, null);
  assert.equal(q.blocking[0].kind, 'seeding');
  assert.deepEqual(names(cup, q.blocking[0].teams).sort(), ['T1', 'T7']);
  const r1 = q.rows.find(r => r.key === teamNo(1));
  assert.equal(r1.rank, 1);
  assert.equal(q.rows.find(r => r.key === teamNo(7)).rank, 1); // shared rank
  assert.throws(() => core.lockKnockout(cup, { now: NOW }), /Level teams/);
});

test('G. league incomplete (13 of 14): provisional standings only, no quarter-final line-up', () => {
  const cup = league28();
  for (let k = 1; k <= 13; k++) play(cup, 2 * k - 1, 4, 100 + k, 30);
  const q = view(cup).qualification;
  assert.equal(q.complete, 13);
  assert.equal(q.total, 14);
  assert.equal(q.final, false);
  assert.equal(q.top, null);
  assert.ok(q.rows.some(r => r.status === 'pending'));
  assert.equal(q.rows.find(r => r.key === teamNo(2)).status, 'out'); // a loss can never qualify
  assert.throws(() => core.lockKnockout(cup, { now: NOW }), /13 of 14/);
});

test('H. quarter-final seeding is 1v8, 2v7, 3v6, 4v5 in QF1–QF4; semis re-seeded by league rank', () => {
  assert.deepEqual(ADULT_FORMAT.qfPairs, [[1, 8], [2, 7], [3, 6], [4, 5]]);
  // Favourites win -> SF1 1v4, SF2 2v3.
  assert.deepEqual(semiFinalPairs([{ key: 's1', seed: 1 }, { key: 's2', seed: 2 }, { key: 's3', seed: 3 }, { key: 's4', seed: 4 }]), [['s1', 's4'], ['s2', 's3']]);
  // Upsets (8 beats 1, 7 beats 2): winners 8, 7, 3, 4 -> by rank 3, 4, 7, 8 -> SF1 3v8, SF2 4v7.
  assert.deepEqual(semiFinalPairs([{ key: 's8', seed: 8 }, { key: 's7', seed: 7 }, { key: 's3', seed: 3 }, { key: 's4', seed: 4 }]), [['s3', 's8'], ['s4', 's7']]);
  assert.equal(semiFinalPairs([{ key: 's1', seed: 1 }, null, { key: 's3', seed: 3 }, { key: 's4', seed: 4 }]), null);
  const cup = exampleA();
  core.lockKnockout(cup, { now: NOW });
  const ko = view(cup).knockout.ties;
  const seeds = cup.seeds;
  for (const [i, [x, y]] of [[1, 8], [2, 7], [3, 6], [4, 5]].entries()) {
    const t = ko.find(k => k.id === `QF${i + 1}`);
    assert.deepEqual([t.a, t.b], [seeds[x - 1], seeds[y - 1]]);
  }
});

test('I. knockout: 4–2 normal; 3–3 by cumulative points; 3–3 level on points needs the host (with a reason)', () => {
  const cup = exampleA();
  core.lockKnockout(cup, { now: NOW });
  core.setResult(cup, { tie: 'QF1', games: games(4, 60, 50), now: NOW });
  let ko = view(cup).knockout.ties;
  assert.equal(ko.find(t => t.id === 'QF1').winner, 'a');
  core.setResult(cup, { tie: 'QF2', games: games(3, 60, 61), now: NOW }); // 3-3, b has more points
  ko = view(cup).knockout.ties;
  assert.equal(ko.find(t => t.id === 'QF2').winner, 'b');
  core.setResult(cup, { tie: 'QF3', games: games(3, 60, 60), now: NOW }); // 3-3, level points
  ko = view(cup).knockout.ties;
  const qf3 = ko.find(t => t.id === 'QF3');
  assert.equal(qf3.winner, null);
  assert.equal(qf3.needsDecider, true);
  assert.throws(() => core.setResult(cup, { tie: 'QF3', games: games(3, 60, 60), decider: 'a', now: NOW }), /reason/);
  core.setResult(cup, { tie: 'QF3', games: games(3, 60, 60), decider: 'a', deciderReason: 'Golden point played', by: 'Ref', now: NOW });
  assert.equal(view(cup).knockout.ties.find(t => t.id === 'QF3').winner, 'a');
  assert.equal(cup.results.QF3.deciderNote.reason, 'Golden point played');
  // 3-3 by taps only (no points): the points must be entered first (they decide).
  const taps = Array.from({ length: 6 }, (_, i) => ({ w: i < 3 ? 'a' : 'b' }));
  core.setResult(cup, { tie: 'QF4', games: taps, now: NOW });
  assert.equal(view(cup).knockout.ties.find(t => t.id === 'QF4').needsPoints, true);
  // League 3-3 is a draw: no host decision there.
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: games(3, 50, 50), decider: 'a', deciderReason: 'x y z', now: NOW }), /draw/);
});

test('J. a correction after the quarter-finals exist asks for confirmation and lists what changes', () => {
  const cup = exampleA();
  core.lockKnockout(cup, { now: NOW });
  // T15 (4-2, 110) re-entered as 4-2 with 130 points -> passes T13 (128) for 8th place.
  let err = null;
  try {
    play(cup, 15, 4, 130, 40, { by: 'Pinkesh' });
  } catch (e) {
    err = e;
  }
  assert.equal(err?.status, 409);
  assert.equal(err.details.code, 'CONFIRM');
  assert.ok(err.details.changes.some(c => /T13 drops out of the top 8/.test(c)));
  assert.ok(err.details.changes.some(c => /T15 moves into the top 8/.test(c)));
  assert.deepEqual(names(cup, cup.seeds).at(-1), 'T13'); // nothing changed yet
  play(cup, 15, 4, 130, 40, { by: 'Pinkesh', confirm: true });
  assert.deepEqual(names(cup, cup.seeds).at(-1), 'T15');
  const entry = cup.audit.at(-1);
  assert.equal(entry.by, 'Pinkesh');
  assert.ok(entry.before && entry.after);
  assert.ok(entry.changes.length > 0);
  // A knockout winner changing after the next round exists also asks first.
  for (const id of ['QF1', 'QF2', 'QF3', 'QF4']) core.setResult(cup, { tie: id, games: games(4, 60, 40), now: NOW });
  assert.ok(view(cup).knockout.ties.find(t => t.id === 'SF1').a);
  assert.throws(() => core.setResult(cup, { tie: 'QF1', games: games(2, 40, 60), now: NOW }), e => e.details?.code === 'CONFIRM' && e.details.changes.some(c => /Semi-final/.test(c)));
});

test('K. validation rejects bad scores and early knockout scores', () => {
  const cup = exampleA();
  const six = g => [g, {}, {}, {}, {}, {}];
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: six({ sa: -1, sb: 3 }), now: NOW }), /whole number/);
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: six({ sa: 2.5, sb: 3 }), now: NOW }), /whole number/);
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: six({ sa: 7, sb: 7 }), now: NOW }), /level/);
  assert.throws(() => core.setResult(cup, { tie: 'L1', games: [{ sa: 11, sb: 5 }], now: NOW }), /all 6 games/);
  assert.throws(() => core.setResult(cup, { tie: 'QF1', games: games(4, 40, 20), now: NOW }), /Lock the knockout/);
  core.lockKnockout(cup, { now: NOW });
  assert.throws(() => core.setResult(cup, { tie: 'SF1', games: games(4, 40, 20), now: NOW }), /not known yet/);
  // A match is complete only when all six games have a winner.
  const c2 = league28();
  core.setResult(c2, { tie: 'L1', games: six({ sa: 11, sb: 5 }), now: NOW });
  assert.equal(view(c2).ties.find(t => t.id === 'L1').complete, false);
  assert.equal(view(c2).qualification.complete, 0);
});

test('L. end to end: league -> quarter-finals -> re-seeded semis -> final -> champion', () => {
  const cup = exampleA();
  const v1 = view(cup);
  assert.ok(v1.qualification.rows.slice(0, 8).every(r => r.status === 'qualified'));
  assert.ok(v1.qualification.rows.slice(8).every(r => r.status === 'out'));
  core.lockKnockout(cup, { by: 'Host', now: NOW });
  // QF1 T1 v T13: T13 wins (upset). QF2 T7 v T25: T7. QF3 T21 v T17: 3-3, T17 more points. QF4 T3 v T11: T3.
  core.setResult(cup, { tie: 'QF1', games: games(2, 50, 70), now: NOW });
  core.setResult(cup, { tie: 'QF2', games: games(5, 70, 20), now: NOW });
  core.setResult(cup, { tie: 'QF3', games: games(3, 60, 66), now: NOW });
  core.setResult(cup, { tie: 'QF4', games: games(4, 60, 40), now: NOW });
  let ko = view(cup).knockout.ties;
  const pairOf = id => names(cup, [ko.find(t => t.id === id).a, ko.find(t => t.id === id).b]);
  // Winners by league rank: T7 (2), T3 (4), T17 (6), T13 (8) -> SF1 T7 v T13, SF2 T3 v T17.
  assert.deepEqual(pairOf('SF1'), ['T7', 'T13']);
  assert.deepEqual(pairOf('SF2'), ['T3', 'T17']);
  core.setResult(cup, { tie: 'SF1', games: games(4, 60, 40), now: NOW });
  core.setResult(cup, { tie: 'SF2', games: games(3, 55, 50), now: NOW }); // 3-3, T3 more points
  ko = view(cup).knockout.ties;
  assert.deepEqual(pairOf('F'), ['T7', 'T3']);
  core.setResult(cup, { tie: 'F', games: games(6, 66, 0), now: NOW });
  const end = view(cup);
  assert.equal(end.phase, 'done');
  assert.equal(names(cup, [end.knockout.champion])[0], 'T7');
  assert.equal(names(cup, [end.knockout.runnerUp])[0], 'T3');
  assert.ok(cup.audit.filter(e => e.kind === 'result').length >= 14 + 7);
});

test('kids keep their own rules (4 teams: 3–3 decided by points, Final + 3rd place)', () => {
  const cup = core.newCup({ event: 'kids' });
  core.setTeams(cup, ['K1', 'K2', 'K3', 'K4'].map(name => ({ name })));
  core.openArena(cup);
  cup.draws.push({ seq: 1, tie: 1, a: 't1', b: 't2', voided: false, revealA: 0, revealB: 0, doneAt: 0 }, { seq: 2, tie: 2, a: 't3', b: 't4', voided: false, revealA: 0, revealB: 0, doneAt: 0 });
  core.setResult(cup, { tie: 'L1', games: games(3, 60, 50), now: NOW });
  const v = view(cup);
  assert.equal(v.qualification, null);
  assert.equal(v.ties.find(t => t.id === 'L1').winner, 'a'); // kids: 3-3 decided by points (unchanged)
  assert.deepEqual(v.knockout.ties.map(t => t.id), ['F', '3P']);
});

// Review fixes (2026-11-17).
test('a stored 3–3 host decision does not block a later correction of that match', () => {
  const cup = exampleA();
  core.lockKnockout(cup, { now: NOW });
  const tapped = [0, 1, 2, 3, 4, 5].map(i => ({ w: i < 3 ? 'a' : 'b' })); // 3-3 by taps, no points
  core.setResult(cup, { tie: 'QF1', games: tapped, decider: 'a', deciderReason: 'Golden point', now: NOW });
  assert.equal(view(cup).knockout.ties.find(t => t.id === 'QF1').winner, 'a');
  // The editor resends the stored decider with every edit: now 4-2 -> the decision is dropped.
  core.setResult(cup, { tie: 'QF1', games: tapped.map((g, i) => (i === 3 ? { w: 'a' } : g)), decider: 'a', now: NOW });
  assert.equal(cup.results.QF1.decider, null);
  // Back to a 3-3 decision, then the points are typed in and decide it.
  core.setResult(cup, { tie: 'QF1', games: tapped, decider: 'a', deciderReason: 'Golden point', now: NOW });
  core.setResult(cup, { tie: 'QF1', games: games(3, 50, 60), decider: 'a', now: NOW });
  assert.equal(cup.results.QF1.decider, null);
  assert.equal(view(cup).knockout.ties.find(t => t.id === 'QF1').winner, 'b');
  // A NEW decision on a match that doesn't need one is still refused.
  assert.throws(() => core.setResult(cup, { tie: 'QF2', games: games(4, 60, 40), decider: 'a', deciderReason: 'xyz', now: NOW }), /only for a 3–3/);
});

test('losers that are level never need a host decision', () => {
  const cup = league28();
  play(cup, 1, 2, 50, 60); // T1 loses 2-4 with 50 points
  play(cup, 3, 2, 50, 61); // T3 loses 2-4 with 50 points (positions 3-4, provisional)
  const q = view(cup).qualification;
  const g = q.tieGroups.find(x => x.teams.includes(teamNo(1)));
  assert.equal(g.kind, 'below');
  assert.equal(q.blocking.length, 0);
  assert.doesNotMatch(q.rows.find(r => r.key === teamNo(1)).reason, /host decides/);
});

test('a host decision stops applying when the scores it was made on change', () => {
  const cup = exampleA();
  play(cup, 13, 4, 125, 40); // T13 level with T23 (4-2, 125) at the 8/9 cut
  core.setTieBreak(cup, { teams: [teamNo(23), teamNo(13)], reason: 'Toss', now: NOW });
  assert.ok(view(cup).qualification.top);
  play(cup, 13, 4, 126, 40);
  play(cup, 23, 4, 126, 40); // level again, at different points: the old decision no longer applies
  const q = view(cup).qualification;
  assert.equal(q.top, null);
  assert.equal(q.blocking.length, 1);
});

test('kids: unlocking the knockout still clears its results (unchanged)', () => {
  const cup = core.newCup({ event: 'kids' });
  core.setTeams(cup, ['K1', 'K2', 'K3', 'K4'].map(name => ({ name })));
  core.openArena(cup);
  cup.draws.push({ seq: 1, tie: 1, a: 't1', b: 't2', voided: false, revealA: 0, revealB: 0, doneAt: 0 }, { seq: 2, tie: 2, a: 't3', b: 't4', voided: false, revealA: 0, revealB: 0, doneAt: 0 });
  core.setResult(cup, { tie: 'L1', games: games(4, 60, 40), now: NOW });
  core.setResult(cup, { tie: 'L2', games: games(4, 60, 40), now: NOW });
  core.lockKnockout(cup, { seeds: ['t1', 't3', 't2', 't4'], now: NOW });
  cup.results.F = { a: 't9', b: 't8', games: games(4, 60, 40), decider: null }; // stale result for other teams
  core.unlockKnockout(cup, { now: NOW });
  assert.equal(cup.results.F, undefined);
});

test('small adults draw (8 teams, 4 winners): the best losers fill the top 8 and say so', () => {
  const cup = core.newCup({ event: 'main' });
  core.setTeams(cup, Array.from({ length: 8 }, (_, i) => ({ name: `S${i + 1}` })));
  core.openArena(cup);
  for (let k = 1; k <= 4; k++) cup.draws.push({ seq: k, tie: k, a: `t${2 * k - 1}`, b: `t${2 * k}`, voided: false, revealA: 0, revealB: 0, doneAt: 0 });
  for (let k = 1; k <= 4; k++) core.setResult(cup, { tie: `L${k}`, games: games(4, 60 + k, 40 + k), now: NOW });
  const q = view(cup).qualification;
  assert.equal(q.top.length, 8);
  const loser = q.rows.find(r => r.result === 'L');
  assert.equal(loser.status, 'qualified');
  assert.match(loser.reason, /fills a top-8 place/);
  core.lockKnockout(cup, { now: NOW });
  assert.equal(view(cup).phase, 'knockout');
});
