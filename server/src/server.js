import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { isAdmin, login, loginLimiter, logout, requireAdmin } from './auth.js';
import * as engine from './draw.js';
import { attachCrowd, leaderboard, submitGuess, tapLeaderboard } from './crowd.js';
import { exportWorkbook, parseUpload } from './excel.js';
import { DrawEvent, Guess, Player, TapScore, Tournament } from './models.js';

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
  app.get('/api/state', async (req, res) => res.json(await engine.publicState()));
  app.get('/api/auth/me', (req, res) => res.json({ admin: isAdmin(req) }));
  app.post('/api/auth/login', loginLimiter, login);
  app.post('/api/auth/logout', logout);
  // Audience predictions: public, rate limited, scored only against revealed picks.
  app.post('/api/guess', async (req, res) => res.json(await submitGuess(req.body ?? {})));
  app.get('/api/tappers', async (req, res) => res.json(await tapLeaderboard({ voter: typeof req.query.voter === 'string' ? req.query.voter : undefined })));
  app.get('/api/leaderboard', async (req, res) => res.json(await leaderboard({ voter: typeof req.query.voter === 'string' ? req.query.voter : undefined })));

  // Everything below mutates or reveals admin data: cookie required, enforced server-side.
  const admin = express.Router();
  admin.use(requireAdmin);
  const ok = fn => async (req, res) => res.json((await fn(req.body ?? {})) ?? { ok: true });
  admin.get('/admin', async (req, res) => res.json(await engine.adminState()));
  admin.patch('/tournament', ok(engine.updateSettings));
  admin.post('/tournaments', ok(engine.createTournament));
  admin.put('/players', ok(engine.savePlayers));
  admin.post('/players/import', ok(parseUpload));
  admin.post('/start', ok(engine.startDraw));
  admin.post('/draw', ok(engine.draw));
  admin.post('/undo', ok(engine.undo));
  admin.post('/finalize', ok(engine.finalize));
  admin.get('/tournaments', async (req, res) => res.json(await engine.listTournaments()));
  // ?tournament=<id> exports an archived tournament; without it, the active one.
  admin.get('/export.xlsx', async (req, res) => {
    const { buffer, name } = await exportWorkbook(req.query.tournament);
    const file = `${name.replace(/[^\w -]+/g, '').trim() || 'team-draw'}.xlsx`;
    res.attachment(file).type('xlsx').send(Buffer.from(buffer));
  });
  app.use('/api', admin);
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
    res.status(status).json({ error: message });
  });
  return app;
}

export async function start({ port = 4000, mongoUri = process.env.MONGODB_URI } = {}) {
  await mongoose.connect(mongoUri);
  await Promise.all([Tournament.init(), Player.init(), DrawEvent.init(), Guess.init(), TapScore.init()]);
  const server = createServer(createApp());
  // Socket.IO clients can only send emoji reactions (relayed) and crowd-spin taps (which at most
  // start the next draw through the same guarded draw(), and only when the host enabled it).
  const io = new Server(server, { cors: { origin: true } });
  const stopCrowd = attachCrowd(io);
  io.on('connection', async socket => {
    try {
      socket.emit('tournament:state', await engine.publicState());
    } catch (err) {
      console.error('initial state failed', err);
    }
  });
  engine.setIo(io);
  await engine.resumePendingReveals();
  await new Promise(resolve => server.listen(port, resolve));
  return {
    port: server.address().port,
    async close() {
      engine.setIo(null);
      await stopCrowd();
      await io.close();
      await mongoose.disconnect();
    },
  };
}
