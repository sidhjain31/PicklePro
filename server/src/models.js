import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const TEAM_COUNT = 28;

// Draw categories (rounds). Each round draws from the player list of the same key. Keys stay as
// stored in the database. People see a letter A–D everywhere (cards, stage, PDF, Excel, Know your
// team, category buttons). The organisers' spreadsheets use the codes in CODES:
//   main: A = M1, B = M2, C = M3, D = W1 (key WOMEN); optional fifth list (key D) = E / M4
//   kids: A = B1 (key ICON, shuffled), B = G1, C = B2 (key BOY), D = G2
// GIRL is the old shared girls list, kept only so older tournaments still load.
export const LABELS = {
  A: 'A', B: 'B', C: 'C', WOMEN: 'D', D: 'E',
  ICON: 'A', GIRL1: 'B', BOY: 'C', GIRL2: 'D', GIRL: 'Girls (old list)',
};
// Short codes for team cards (same letters).
export const SHORT = { A: 'A', B: 'B', C: 'C', WOMEN: 'D', D: 'E', ICON: 'A', GIRL1: 'B', BOY: 'C', GIRL2: 'D' };
// The organisers' spreadsheet codes and groups (auction player lists and the Excel export).
export const CODES = { A: 'A', B: 'B', C: 'C', WOMEN: 'W1', D: 'D', ICON: 'B1', GIRL1: 'G1', BOY: 'B2', GIRL2: 'G2', GIRL: 'G' };
export const GROUPS = { A: 'MEN', B: 'MEN', C: 'MEN', D: 'MEN', WOMEN: 'WOMEN', ICON: 'BOYS', BOY: 'BOYS', GIRL1: 'GIRLS', GIRL2: 'GIRLS', GIRL: 'GIRLS' };
export const ALL_CATEGORIES = ['A', 'WOMEN', 'B', 'C', 'D', 'ICON', 'BOY', 'GIRL1', 'GIRL2'];
export const ALL_POOLS = ['A', 'WOMEN', 'B', 'C', 'D', 'ICON', 'BOY', 'GIRL1', 'GIRL2', 'GIRL'];
export const poolOf = category => category;
// Shuffle rounds put the whole list onto every team in one action (seeds / captains).
export const SHUFFLE = new Set(['A', 'ICON']);

// Two separate events share the engine. Each has its own active tournament, links and screens.
export const EVENTS = {
  main: {
    teamCount: TEAM_COUNT,
    available: ['A', 'B', 'C', 'WOMEN', 'D'],
    defaults: ['A', 'B', 'C', 'WOMEN'],
    fixed: false,
  },
  // Kids: 4 teams of 2 boys + 2 girls (one from each list); B1 is shuffled onto all teams at once.
  kids: {
    teamCount: 4,
    available: ['ICON', 'GIRL1', 'BOY', 'GIRL2'],
    defaults: ['ICON', 'GIRL1', 'BOY', 'GIRL2'],
    fixed: true,
  },
};
export const eventOf = value => (value === 'kids' ? 'kids' : 'main');

export const Tournament = model('Tournament', new Schema({
  // Which event this belongs to. Older documents have no field and are the main event.
  event: { type: String, enum: ['main', 'kids'], default: 'main' },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ['DRAFT', 'LIVE', 'COMPLETED'], default: 'DRAFT' },
  teamCount: { type: Number, default: TEAM_COUNT },
  // Enabled categories in draw order. Locked once the draw starts.
  categories: { type: [{ type: String, enum: ALL_CATEGORIES }], default: ['A', 'B', 'C', 'WOMEN'] },
  // Index into `categories` of the category being drawn; everything before it is finalized.
  currentIndex: { type: Number, default: 0 },
  spinMs: { type: Number, default: 6000, min: 0, max: 30000 },
  // Audience "Predict the pick": the host can switch it off (records are kept).
  predictions: { type: Boolean, default: true },
}, { timestamps: true }));

const playerSchema = new Schema({
  tournamentId: { type: Schema.Types.ObjectId, required: true },
  category: { type: String, enum: ALL_POOLS, required: true }, // the player list (pool)
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  // From the organisers' spreadsheet; only ever written to the host's Excel export.
  age: { type: String, maxlength: 10 },
  phone: { type: String, maxlength: 20 },
}, { timestamps: true });
// One name per tournament: blocks duplicates and a player sitting in two categories.
playerSchema.index({ tournamentId: 1, nameKey: 1 }, { unique: true });
export const Player = model('Player', playerSchema);

// The draw log is the source of truth: team board, team pointer and remaining pool are all
// derived from non-voided events, so a single insert is the whole state change.
const eventSchema = new Schema({
  tournamentId: { type: Schema.Types.ObjectId, required: true },
  actionId: { type: String, required: true }, // one per spin; the A shuffle writes 28 events with one actionId
  sequence: { type: Number, required: true },
  category: { type: String, enum: ALL_CATEGORIES, required: true },
  teamNumber: { type: Number, required: true },
  playerId: { type: Schema.Types.ObjectId, required: true },
  playerName: { type: String, required: true },
  revealAt: { type: Date, required: true }, // hidden from every client until the spin animation ends
  voided: { type: Boolean, default: false }, // set by "undo last spin"; the row stays for the audit trail
  // Provably fair: `commitment` = SHA-256 of the result + secret `salt`, published when the spin
  // starts; `salt` is published only at reveal, so anyone can check the result wasn't changed.
  commitment: String,
  salt: String,
  voidedAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } });
const liveOnly = { unique: true, partialFilterExpression: { voided: false } };
eventSchema.index({ tournamentId: 1, sequence: 1 }, { unique: true });
// Last line of defence against double draws: one player per team per category, each player drawn once.
eventSchema.index({ tournamentId: 1, category: 1, teamNumber: 1 }, liveOnly);
eventSchema.index({ playerId: 1 }, liveOnly);
export const DrawEvent = model('DrawEvent', eventSchema);

// Audience predictions: one guess per viewer per team, changeable until that pick is revealed.
const guessSchema = new Schema({
  tournamentId: { type: Schema.Types.ObjectId, required: true },
  category: { type: String, enum: ALL_CATEGORIES, required: true },
  teamNumber: { type: Number, required: true },
  voterId: { type: String, required: true },
  nickname: { type: String, required: true },
  playerName: { type: String, required: true },
}, { timestamps: true });
guessSchema.index({ tournamentId: 1, category: 1, teamNumber: 1, voterId: 1 }, { unique: true });
export const Guess = model('Guess', guessSchema);

// Match draw ("fixtures") — a separate module from the team auction. One document per match draw;
// the newest per event is active, older ones are kept as history. The rules live in
// client/src/cup/core.js (shared with the browser demo); `teams`, `draws` and `results` hold its
// plain objects. Draw times are server-clock milliseconds.
export const Cup = model('Cup', new Schema({
  event: { type: String, enum: ['main', 'kids'], default: 'main' },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ['SETUP', 'DRAW', 'KNOCKOUT'], default: 'SETUP' },
  aimMs: { type: Number, default: 3500 },
  weapon: { type: String, default: 'auto' },
  courts: { type: Number, default: 2 },
  teams: { type: Array, default: [] }, // [{ key, name, players: { A, B, C, D } }]
  draws: { type: Array, default: [] }, // [{ seq, tie, a, b, weapon, last, aimMs, startAt, revealA, revealB, doneAt, commitment, salt, voided }]
  results: { type: Schema.Types.Mixed, default: {} }, // { L1 | QF1 | SF1 | F | 3P: { a, b, games: [{ w, sa, sb }], decider } }
  seeds: { type: [String], default: [] },
}, { timestamps: true, minimize: false }));

// Match-draw team logos, stored once per image (content hash) and served with long caching, so
// the live state only carries the hash and each phone downloads each logo once.
export const CupLogo = model('CupLogo', new Schema({
  hash: { type: String, required: true, unique: true },
  type: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp'], required: true },
  data: { type: Buffer, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } }));
