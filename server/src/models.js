import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const TEAM_COUNT = 28;
export const LABELS = { A: 'A', WOMEN: 'Women', B: 'B', C: 'C', D: 'D' };
export const ALL_CATEGORIES = Object.keys(LABELS);

export const Tournament = model('Tournament', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ['DRAFT', 'LIVE', 'COMPLETED'], default: 'DRAFT' },
  teamCount: { type: Number, default: TEAM_COUNT },
  // Enabled categories in draw order. Locked once the draw starts.
  categories: { type: [{ type: String, enum: ALL_CATEGORIES }], default: ['A', 'WOMEN', 'B', 'C'] },
  // Index into `categories` of the category being drawn; everything before it is finalized.
  currentIndex: { type: Number, default: 0 },
  spinMs: { type: Number, default: 6000, min: 0, max: 30000 },
}, { timestamps: true }));

const playerSchema = new Schema({
  tournamentId: { type: Schema.Types.ObjectId, required: true },
  category: { type: String, enum: ALL_CATEGORIES, required: true },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
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
  voidedAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } });
const liveOnly = { unique: true, partialFilterExpression: { voided: false } };
eventSchema.index({ tournamentId: 1, sequence: 1 }, { unique: true });
// Last line of defence against double draws: one player per team per category, each player drawn once.
eventSchema.index({ tournamentId: 1, category: 1, teamNumber: 1 }, liveOnly);
eventSchema.index({ playerId: 1 }, liveOnly);
export const DrawEvent = model('DrawEvent', eventSchema);
