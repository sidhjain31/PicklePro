import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { isAdmin, login, loginLimiter, logout, requireAdmin } from './auth.js';
import * as engine from './draw.js';
import { attachCrowd, leaderboard, submitGuess } from './crowd.js';
import { exportWorkbook, parseUpload } from './excel.js';
import { Cup, CupLogo, DrawEvent, Guess, Player, Tournament, eventOf } from './models.js';
import { cupApi, cupRoom, cupState, resumeCupReveals, setCupIo, stopCupTimers } from './fixtures.js';

const voterOf = req => (typeof req.query.voter === 'string' ? req.query.voter : undefined);

// Public + host routes for one event.
function eventApi(ev) {
  const api = express.Router();
  api.get('/state', async (req, res) => res.json(await engine.cachedPublicState(ev)));
  // Audience predictions: public, rate limited, scored only against revealed picks.
  api.post('/guess', async (req, res) => res.json(await submitGuess(req.body ?? {}, ev)));
  api.get('/leaderboard', async (req, res) => res.json(await leaderboard({ voter: voterOf(req) }, ev)));

  // Everything below mutates or reveals admin data: cookie required, enforced server-side.
  // The login check runs only on these host routes (not on every /api path), so unknown paths
  // answer 404 instead of a misleading 401.
  const admin = express.Router();
  const ok = fn => async (req, res) => res.json((await fn(req.body ?? {}, ev)) ?? { ok: true });
  admin.get('/admin', requireAdmin, async (req, res) => res.json(await engine.adminState(ev)));
  admin.patch('/tournament', requireAdmin, ok(engine.updateSettings));
  admin.post('/tournaments', requireAdmin, ok(engine.createTournament));
  admin.put('/players', requireAdmin, ok(engine.savePlayers));
  admin.put('/players/details', requireAdmin, ok(engine.updateDetails));
  admin.post('/players/import', requireAdmin, ok(parseUpload));
  admin.post('/start', requireAdmin, ok(engine.startDraw));
  admin.post('/draw', requireAdmin, ok(engine.draw));
  admin.post('/undo', requireAdmin, ok(engine.undo));
  admin.post('/finalize', requireAdmin, ok(engine.finalize));
  admin.get('/tournaments', requireAdmin, async (req, res) => res.json(await engine.listTournaments(ev)));
  // ?tournament=<id> exports an archived tournament; without it, the active one.
  admin.get('/export.xlsx', requireAdmin, async (req, res) => {
    const { buffer, name } = await exportWorkbook(req.query.tournament, ev);
    const file = `${name.replace(/[^\w -]+/g, '').trim() || 'team-draw'}.xlsx`;
    res.attachment(file).type('xlsx').send(Buffer.from(buffer));
  });
  api.use(admin);
  return api;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '6mb' }));

  // 503 when Mongo is down, so Render / UptimeRobot see a server that can't actually draw.
  app.get('/api/health', (req, res) => {
    const db = mongoose.connection.readyState === 1;
    res.status(db ? 200 : 503).json({ ok: db, db: db ? 'up' : 'down' });
  });
  app.get('/api/auth/me', (req, res) => res.json({ admin: isAdmin(req) }));
  app.post('/api/auth/login', loginLimiter, login);
  app.post('/api/auth/logout', logout);
  // Match draw (fixtures) module: separate data and rooms, mounted before the auction routes.
  app.use('/api/kids/fixtures', cupApi('kids'));
  app.use('/api/fixtures', cupApi('main'));
  // Two events on one engine: /api/kids/* is the kids draw, /api/* the main draw. Same routes,
  // same rules, separate tournaments. Kids is mounted first so /api never swallows /api/kids.
  app.use('/api/kids', eventApi('kids'));
  app.use('/api', eventApi('main'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built PWA when it exists, so this server's own URL is a full fallback for Vercel.
  const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile('index.html', { root: dist }));
  }

  app.use((err, req, res, next) => {
    const status = err.status ?? (err.code === 11000 ? 409 : err.name === 'ValidationError' ? 400 : 500);
    if (status >= 500) console.error(err);
    const message = err.code === 11000 ? 'Conflicting update — refresh and try again' : status >= 500 ? 'Server error' : err.message;
    // Some rule errors carry data for the page (e.g. the list of changes a correction would make).
    res.status(status).json({ error: message, ...(status < 500 && err.details ? err.details : {}) });
  });
  return app;
}

export async function start({ port = 4000, mongoUri = process.env.MONGODB_URI } = {}) {
  await mongoose.connect(mongoUri);
  await Promise.all([Tournament.init(), Player.init(), DrawEvent.init(), Guess.init(), Cup.init(), CupLogo.init()]);
  const server = createServer(createApp());
  // Socket.IO clients can only send emoji reactions, which are validated and relayed; nothing a
  // client sends can start, choose or change a draw.
  // Heartbeat every 10 s, drop after 10 s more: a phone that vanished (killed browser, lost Wi-Fi)
  // stops counting as a viewer within ~20 s instead of the default ~45 s.
  const io = new Server(server, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 10000 });
  attachCrowd(io);
  // Viewer count rule: the number of distinct *audience browsers* with at least one live
  // connection. Each browser sends a random id kept in localStorage, so refreshes, reconnects and
  // extra tabs in the same browser count once; host (/admin) and projector (/screen) connections
  // are not audience and are excluded. It counts browsers, not people.
  // Kept per room: each draw (auction main / kids, match draw main / kids) shows its own audience.
  const audience = new Map(); // room -> Map(viewerId -> number of live sockets)
  const lastViewers = new Map();
  const viewersTimer = new Map();
  const viewerCount = room => audience.get(room)?.size ?? 0;
  const announceViewers = room => {
    if (viewersTimer.get(room)) return;
    viewersTimer.set(room, setTimeout(() => {
      viewersTimer.delete(room);
      const n = viewerCount(room);
      if (n !== lastViewers.get(room)) {
        lastViewers.set(room, n);
        io.to(room).emit('viewers', { count: n });
      }
    }, 1500));
  };
  io.on('connection', async socket => {
    const { role, viewer, event, module } = socket.handshake.auth ?? {};
    const ev = eventOf(event);
    const cup = module === 'cup';
    const room = cup ? cupRoom(ev) : engine.roomOf(ev);
    socket.join(room);
    const viewerId = role === 'audience' && typeof viewer === 'string' && /^[\w-]{8,64}$/.test(viewer) ? viewer : null;
    if (viewerId) {
      if (!audience.has(room)) audience.set(room, new Map());
      const map = audience.get(room);
      map.set(viewerId, (map.get(viewerId) ?? 0) + 1);
      socket.on('disconnect', () => {
        const left = (map.get(viewerId) ?? 1) - 1;
        if (left > 0) map.set(viewerId, left);
        else map.delete(viewerId);
        announceViewers(room);
      });
      announceViewers(room);
    }
    socket.emit('viewers', { count: viewerCount(room) });
    try {
      if (cup) socket.emit('cup:state', await cupState(ev));
      else socket.emit('tournament:state', await engine.cachedPublicState(ev));
    } catch (err) {
      console.error('initial state failed', err);
    }
  });
  engine.setIo(io);
  setCupIo(io);
  await engine.resumePendingReveals();
  await resumeCupReveals();
  await new Promise(resolve => server.listen(port, resolve));
  return {
    port: server.address().port,
    async close() {
      engine.setIo(null);
      setCupIo(null);
      stopCupTimers();
      viewersTimer.forEach(clearTimeout);
      await io.close();
      await mongoose.disconnect();
    },
  };
}
