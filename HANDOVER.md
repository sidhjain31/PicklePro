# PicklePro — Handover

Live team-draw app for the **ICC Pickleball** 28-team doubles tournament. The host runs the draw on one device; everyone else watches the same spin live on phones and a projector.

> Keep this file current. Every change to the app gets an entry in the [Change log](#change-log) at the bottom.

---

## 1. Links

| Who | Link | Purpose |
|---|---|---|
| Audience (phones) | https://pickle-pro-peach.vercel.app | Watch live. Read-only. |
| Host / admin | https://pickle-pro-peach.vercel.app/admin | Log in, set up, Shuffle / Spin / Finalize, export Excel |
| Projector / TV | https://pickle-pro-peach.vercel.app/screen | Big-screen view with QR code to join |
| Backup (full app) | https://picklepro-api.onrender.com (+ `/admin`, `/screen`) | Use if Vercel is down |
| Health check | https://picklepro-api.onrender.com/api/health | `{"ok":true,"db":"up"}` = server + database fine |
| Repository | https://github.com/sidhjain31/PicklePro | |

**Host password:** the `ADMIN_PASSWORD` environment variable in Render (dashboard → `picklepro-api` → Environment). Local development uses `server/.env`.

---

## 2. How the draw works

- Categories (default **A, Women, B, C**; D optional) can be put in **any order** at setup. Order locks when the draw starts.
- **Category A** is always shuffled onto Teams 1–28 **in one go**, wherever it sits in the order.
- **Every other category** draws **one player per spin**: first spin → Team 1, next → Team 2, … → Team 28.
- A category must be **Finalized** (all 28 filled) before the next one starts. Finalized categories never change.
- **Undo** removes only the latest spin in the current category; it stays in history as *Undone*.
- Every random pick is made **on the server** with Node's `crypto.randomInt` (Fisher–Yates for A) — the operating system's cryptographically secure generator, with unbiased (rejection-sampled) ranges. Browsers only animate.
- **Provably fair (commit–reveal):** when a spin starts the server publishes `commitment = SHA-256("PicklePro|v1|actionId|category|team=name;…|key")` with a fresh 256-bit secret `key`; the key is revealed only after the spin. Every viewer's browser recomputes the hash and shows **✅ Verified fair** (tap for details). Commitment + key for every pick are in the Excel *Draw History*. Needs the server from this change deployed (git push) — until then the seal simply doesn't show.
- Each pick is **saved before it is shown**, hidden from every screen until the spin ends, and survives refresh / reconnect / server restart.
- Duplicate draws are impossible: one action at a time on the server, stale/double clicks rejected, and unique database indexes as the last guard.
- No name may appear twice anywhere in a tournament (case and spaces ignored). Each category needs exactly 28 names before its first draw.

### What the audience sees
1. **Round walk-out**: when a category starts, a full-stage "NEXT ROUND · Women · One spin per team" card with that category's own jingle.
2. **Countdown** 3 → 2 → 1 → GO! (with beeps) while every remaining name **flies by** behind the number — skipped if spin length < 4 s or the screen joined mid-spin.
3. **Slot machine**: pickleball paddles swing, a ball rallies, names tick past the line. Sounds: stadium **crowd swells**, a steady rally — or a **drumroll** when only 3 names are left.
4. **Slow-down**: the rally **speeds up and ends in a smash** as the reel stops. About 40% of spins **near-miss**: the reel stalls one name short (orange glow + crowd **"OHHH"**) then creeps onto the winner. Chosen from the draw id so every screen plays the same tease; never changes the result.
5. **Winner card** with "SMASH!", confetti, fanfare and a **crowd cheer**. Category A instead **deals 28 cards**.
6. **🏓 Captain** line: while Women/B/C are drawn, the team's A player is shown as captain.
7. **Team complete card**: on the last category's spin, the whole team (all categories) appears as one card.
8. **Trophy moment**: on Finalize, referee whistle + trophy fanfare + "Women locked in! 🏆" card.
9. Team board updates; the drawn cell stays hidden (`???`) until the reveal.
10. Sound is off until each screen taps **🔇 Tap for sound** (browser rule). **⛶ Full screen** button on the stage.

### Audience participation (phones)
- **Live reactions** 🔥 😂 👏 🎉 😱 ❤️ — bar at the bottom of the phone; **every reaction floats up on every phone and the projector** (server relays them; max 4/sec per phone; only these six emojis).
- **Predict the pick** — first time: enter a nickname. Then pick who goes to the next team (Women/B/C; not A). Changeable until the reveal; after it, ✅/❌ on the phone. **Leaderboard** (top 10, your rank) on phones; **Top predictors** + "7 of 40 called Team 5 right" on `/screen`. Guesses are stored per tournament; scored only against revealed picks; rate limited per viewer (12/min) with a global cap — never per IP, because a venue shares one Wi-Fi IP.
- **Crowd spin** (host switch, off by default): phones show a big **👆 Tap to spin for Team N** button and a meter; when the taps reach the target (default 50, settable 5–1000) the server starts the next draw through the normal guarded draw — the server still picks the result. Each phone counts at most 15 taps per round.
- **Teams gallery image** — host button when the draw is complete: one 1920×1080 PNG with all 28 teams in the ICC theme. Download only; no share/WhatsApp buttons by request.

### Host page (`/admin`)
- **Setup** (before start): tournament name, spin length, categories + order, player lists (paste or **Import .xlsx / .csv**), readiness, **Start draw**.
- **Draw**: big button changes through *Shuffle A players → Finalize A → Spin for Team N → Finalize …*; **Undo last draw**; **Export Excel**; **PDF report**; **Crowd spin** switch + taps needed; header links to **Audience view** and **Big screen**. When complete: **Download PDF report**, **Teams gallery image**, **Export Excel**.
- Below the draw: edit lists of categories not yet drawn, **Draw history**, **Past tournaments** (export any earlier one), **Start a new tournament**.

### Spreadsheet import format
First sheet of an `.xlsx`, or a `.csv`. Row 1 = category names (`A`, `Women`, `B`, `C`, `D`; also `A Player`, `Category B`, `Ladies` …), names underneath, one per cell. Sample: [`samples/sample-players.xlsx`](samples/sample-players.xlsx) (28 × A, Women, B, C, all unique).

### PDF report (organizers)
Host page → **PDF report** (during the draw) or **Download PDF report** (when complete). Built in the browser from revealed picks only. A4 landscape, ICC header: page 1 = all 28 teams × categories; page 2 = every player A–Z with category and team (for check-in desks); footer notes the fairness method.

### Excel export
Two sheets: **Final Teams** (Team, one column per category) and **Draw History** (timestamp, category, sequence, player, team, event ID, action ID, Final/UNDONE, fairness commitment, fairness key).

---

## 3. Architecture

| Part | Tech | Hosted on |
|---|---|---|
| `client/` | React 19 + Vite 8 PWA (`vite-plugin-pwa`), `socket.io-client`, `qrcode`, `jspdf` + `jspdf-autotable` | Vercel project `pickle-pro` (team `sp-tech3`), root dir `client` |
| `server/` | Node 22.12+ / Express 5 / Socket.IO 4 / Mongoose 9 / ExcelJS / Helmet | Render free web service `picklepro-api` (`render.yaml`) |
| Database | MongoDB | Atlas M0 (production), local MongoDB 9.0 service (development) |

- Vercel rewrites `/api/*` to Render (`client/vercel.json`). Socket.IO connects straight to Render via the build-time env `VITE_SOCKET_URL=https://picklepro-api.onrender.com`.
- Render also builds and serves the client, so its URL is a full backup site.
- Socket.IO clients can send only two things: an emoji `reaction` (whitelisted, rate limited, relayed to everyone) and a crowd-spin `tap` (counted only when the host enabled crowd spin; reaching the target calls the same guarded `draw()` the host uses). Nothing a client sends can choose or change a result.

### Key files
| File | What it does |
|---|---|
| `server/src/draw.js` | The draw engine: state snapshot, public/admin state, every rule, lock, reveal scheduling, tournament list |
| `server/src/models.js` | Tournament, Player, DrawEvent schemas + unique indexes; default categories |
| `server/src/server.js` | Express routes, admin router, health check, static client, Socket.IO |
| `server/src/auth.js` | Password login, signed HttpOnly cookie, failed-login rate limit |
| `server/src/excel.js` | Excel export (any tournament) and spreadsheet import parsing |
| `server/test/draw.test.js` | Full integration test suite (needs MongoDB) |
| `client/src/main.jsx` | Picks page by path: `/admin` → Admin, `/screen` → Screen, else Live |
| `client/src/useLive.js` | Socket connection, cached state, spin phases (spinning → landing → done) |
| `client/src/Stage.jsx` | Slot machine, countdown, rally, winner card, A deal, sound/fullscreen tools |
| `client/src/fx.js` | Synthesized sounds (tick, pock, beep, fanfare, deal) and confetti |
| `client/src/Screen.jsx` | Projector view with picks list and QR code |
| `client/src/fair.js` | Browser-side SHA-256 verification of each revealed draw |
| `client/src/report.js` | PDF report (jsPDF + autotable, lazy-loaded) |
| `client/src/gallery.js` | Teams gallery PNG (canvas) |
| `client/src/Audience.jsx` | Reactions bar + floating emojis, crowd meter, predictions + leaderboard, round/trophy announcements |
| `client/src/audience.css` | Styles for the above |
| `server/src/crowd.js` | Socket reactions + crowd taps, `submitGuess`, `leaderboard` |
| `client/src/Admin.jsx` | Login, setup, controls, history, archive, new tournament |
| `client/src/Board.jsx`, `Live.jsx` | Team board; audience page + shared header/steps |
| `client/src/styles.css` | All styling; palette tokens on `:root` from the ICC logo |
| `client/public/logo.png` | ICC Pickleball logo (transparent); icons generated from it |

### Database collections
- **tournaments** — name, status (`DRAFT`/`LIVE`/`COMPLETED`), teamCount (28), categories (order), currentIndex, spinMs. The **newest document is the active tournament**; older ones are the archive.
- **players** — tournamentId, category, name, nameKey (lowercase). Unique on (tournamentId, nameKey).
- **drawevents** — the source of truth: actionId, sequence, category, teamNumber, playerId, playerName, revealAt, voided, commitment, salt (fairness key; only exposed after reveal). Unique on sequence, and (for non-voided) on team-per-category and on player.
- **guesses** — tournamentId, category, teamNumber, voterId (random id stored on the phone), nickname, playerName. Unique per (tournament, category, team, voter).
- Tournament also has `crowdSpin` (bool) and `crowdTarget` (5–1000, default 50).

### API
Public: `GET /api/health`, `GET /api/state`, `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/guess`, `GET /api/leaderboard[?voter=<id>]`.
Host cookie required: `GET /api/admin`, `PATCH /api/tournament`, `POST /api/tournaments`, `GET /api/tournaments`, `PUT /api/players`, `POST /api/players/import`, `POST /api/start`, `POST /api/draw`, `POST /api/undo`, `POST /api/finalize`, `GET /api/export.xlsx[?tournament=<id>]`.
Socket events (server → clients): `tournament:state`, `draw:spinning`, `draw:revealed`, `draw:undone`, `category:finalized`, `reaction`, `crowd:taps`, `crowd:fired`. Clients → server: `reaction`, `tap`.

---

## 4. Running locally (Windows)

Prerequisites (already set up on the dev laptop): Node 22.12+ (v24 installed), MongoDB Community 9.0 running as the `MongoDB` Windows service, `server/.env` with `MONGODB_URI`, `ADMIN_PASSWORD`, `SESSION_SECRET` (32+ chars).

```bash
npm run setup:dev     # first time: install server + client dependencies
npm run dev           # server :4000 + client :5173 together
npm test              # server test suite (drops the picklepro_test database first)
npm run build         # client production build
```
- Audience http://localhost:5173 · Host http://localhost:5173/admin · Projector http://localhost:5173/screen
- Local host password: `ADMIN_PASSWORD` in `server/.env`.

### Environment variables
| Variable | Where | Notes |
|---|---|---|
| `MONGODB_URI` | server | Required |
| `ADMIN_PASSWORD` | server | Required — the host login |
| `SESSION_SECRET` | server | Required, ≥ 32 chars (Render generates it) |
| `PORT` | server | Default 4000 |
| `TRUST_PROXY` | server | Default 1 (Render) |
| `NODE_ENV` | server | `production` → Secure cookies |
| `VITE_SOCKET_URL` | client build (Vercel) | `https://picklepro-api.onrender.com` |
| `TEST_MONGODB_URI` | tests | Optional |

---

## 5. Deploying

- **Normal path:** push to `main` on GitHub → Vercel and Render both redeploy automatically, and CI runs the tests.
- **Without git (used during development):** from the repo root,
  `vercel deploy --yes --scope sp-tech3 --build-env VITE_SOCKET_URL=https://picklepro-api.onrender.com` → preview link (needs Vercel login as SP TECH),
  then `vercel promote <preview-url> --scope sp-tech3 --yes` → puts it on the main link.
  ⚠️ A later git push of older code replaces a promoted build. **Server changes only deploy via git push** (Render has no CLI here).
- Delete the `.env.local` that `vercel link/deploy` creates in the repo root (it holds a Vercel token; it is git-ignored).

---

## 6. Event-day checklist

**Before (one-time)**
- [ ] Know the `ADMIN_PASSWORD` (Render → Environment).
- [ ] UptimeRobot (free): HTTP monitor on `https://picklepro-api.onrender.com/api/health`, every 5 min — stops the ~1 min cold start.
- [ ] Atlas: database user has **readWrite on `picklepro` only**; strong password.

**Rehearsal (1–2 days before)**
- [ ] `/admin` → categories A, Women, B, C → Import `samples/sample-players.xlsx` → Save → Start → run the full draw.
- [ ] Audience link on 2–3 phones + `/screen` on a laptop: all show the same spin.
- [ ] Wi-Fi off/on on one phone → it reconnects and catches up. Refresh host mid-spin → resumes.
- [ ] Export Excel, check both sheets.
- [ ] **Start a new tournament** with the real event name (rehearsal moves to Past tournaments).

**On the day**
- [ ] 15 min before: open `/admin` (wakes server), log in. Load the real lists → every category **28/28**.
- [ ] Projector: `/screen`, F11, enable sound (tap 🔇 on the audience page on that laptop once; it's remembered).
- [ ] Share the audience link / QR. Run the draw. **Export Excel after each category** (Atlas M0 has no backups).

**If something goes wrong**
- *Connection lost* on host: draws pause until it reconnects; nothing is lost.
- Vercel down: use `https://picklepro-api.onrender.com` (+ `/admin`, `/screen`).
- Wrong pick: **Undo last draw** (current category only).
- Vercel login locked after many wrong passwords (all Vercel visitors share one IP): log in on the Render URL instead.

---

## 7. Current state

**As of 2026-10-09 (audience round, not yet pushed)**
- GitHub `main` = `c4cf8ec` — production (Vercel + Render) runs that: provably-fair draw, PDF report, countdown, big screen.
- **Uncommitted locally:** the whole audience-participation round (reactions, predictions + leaderboard, crowd spin, crowd/rally/drumroll/OHHH/jingle/whistle sounds, near-miss tease, name fly-by, captain line, team-complete card, round/trophy announcements, teams gallery image) + this HANDOVER update. **It needs a git push to go live** — reactions, predictions and crowd spin need the new server (Render deploys only from GitHub). Do not promote the client alone: against the old server the prediction box would show errors.
- CI runs on every push to `main`. GitHub login on this PC was refreshed so pushes may include workflow files.
- Tests: **21/21 pass** locally; client build clean; full local run verified in the browser (see change log).
- Production tournament: status DRAFT, categories A, Women, B, C.

**Working agreement:** the owner does all git commits/pushes at the end. Development is checked via Vercel preview/promoted links.

### Known limits
- Single server instance only (processing lock and login limiter are in memory).
- Render free tier sleeps after 15 idle minutes (fixed by UptimeRobot).
- Atlas M0: no automatic backups — export Excel.
- Team count fixed at 28 (`TEAM_COUNT` in `server/src/models.js`).
- Saving a list replaces it non-transactionally (validated first, so failures are unlikely).

### Ideas not built yet
Host phone remote, read winner names aloud (commentator voice), configurable team count.

---

## Change log

Newest first. Add an entry for every change.

### 2026-10-09 — Audience round: reactions, predictions, crowd spin, stadium sounds
- **Sounds** (`fx.js`, all synthesized): crowd swell during the spin, cheer on reveal, rally that speeds up into a smash on the slow-down, per-category walk-out jingle, drumroll when ≤ 3 names remain, crowd "OHHH" on near-miss, referee whistle + trophy fanfare on Finalize, soft pop per reaction.
- **Live reactions** relayed to every phone and the projector (`server/src/crowd.js`, `Audience.jsx`).
- **Predict the pick** + leaderboard (`POST /api/guess`, `GET /api/leaderboard`, `Guess` model); guesses saved on the phone so they survive re-renders/refresh.
- **Crowd spin** host switch + target; taps start the next draw via the guarded `draw()`.
- **Near-miss tease** (deterministic per draw), **name fly-by** in the countdown, **Captain** line, **Team complete** card, **round / trophy announcements**, **teams gallery PNG** (download only, no WhatsApp).
- Fixed during testing: guesses vanished when the spin started (component remount) → persisted per tournament; guess rate limit was per IP (would block a whole venue on one Wi-Fi) → per viewer + global cap; leaderboard wording when nobody has scored.
- Tests 21/21 (new: reaction whitelist + rate limit, crowd spin off-by-default / exactly one draw / per-phone cap, predictions open/closed rules + scoring only after reveal + private voter ids). Browser-verified locally: walk-out, countdown + fly-by, trophy, deal, reactions from a second phone floating on this phone, crowd taps starting a spin, prediction ✅/❌, captain, team-complete card, gallery image; no console errors.
- **Not yet pushed / not live.**

### 2026-10-09 — Pushed to GitHub (`c4cf8ec`)
- Committed all work since `8a1e840` and pushed together with the CI commit `3e9fc01`. Old saved GitHub token (no `workflow` scope) was cleared and the owner signed in again via browser.
- Render redeploy brings the provably-fair sealing live; Vercel rebuilt from GitHub (replaces the CLI-promoted build with identical code).

### 2026-10-09 — Provably fair draw, PDF report, real paddles
- **Provably fair:** server seals each draw with SHA-256 over the result + a fresh 256-bit key before the spin (`commitment` sent with `draw:spinning`/pending state), reveals the key afterwards; browsers verify and show ✅ Verified fair with details. Commitment/key stored on `DrawEvent`, shown in admin history data and Excel. New test proves sealing, no early key leak, verification and tamper detection. *(Server part goes live on next git push.)*
- **PDF report** for organizers (`client/src/report.js`, jsPDF): teams page + A–Z player index; buttons on host page.
- Machine paddles redrawn as **real pickleball paddles** (SVG), smaller swing, clipped to the stage.
- Tests 18/18. Promoted to production via Vercel CLI.

### 2026-10-09 — Countdown, big screen mode, sample file, handover
- 3-2-1-GO countdown with beeps before every spin/shuffle (client only; uses existing spin time).
- `/screen` projector view: giant machine, live 28-team picks list (1–14 | 15–28), category steps, QR code + join URL, auto-hiding cursor; **Big screen** link in host header; stage button renamed **⛶ Full screen**.
- Added `samples/sample-players.xlsx` and this `HANDOVER.md`.
- Promoted to production via Vercel CLI.

### 2026-10-09 — ICC theme and new slot machine
- ICC Pickleball logo → header, login, waiting/complete screens, favicon, PWA icons; palette from the logo.
- Paddle-framed reel, rally ball, tick/pock/fanfare sounds (synthesized), winner card with SMASH! stamp, confetti with pickleballs, A-category card deal, sound toggle, fullscreen.
- Default categories back to **A, Women, B, C** (D optional); test proving A shuffles in one go in any position.
- Promoted to production via Vercel CLI.

### 2026-10-09 — Cold-start messaging
- Host and audience pages show "Connecting… the server is waking up (up to a minute)" instead of a bare "Loading…"; login button shows "Logging in…".

### 2026-10-09 — Production hardening (commit `8a1e840`, pushed)
- `/api/health` reports MongoDB (503 when down).
- Past tournaments archive: list + per-tournament Excel export.
- Login rate limit counts only failed attempts.
- Cross-platform `npm run dev` (`scripts/dev.mjs`).
- Tests added: route auth sweep, cookie flags/logout, category locking + finalize order, audience socket can't mutate, upload validation, rate limit, archive, health.
- CI workflow `.github/workflows/test.yml` (commit `3e9fc01`, **not pushed** — token lacks `workflow` scope).
- Production verified: Render + Atlas + Vercel rewrite + Socket.IO origin + PWA.

### 2026-10-09 — Takeover and local setup
- Inspected the repository; installed MongoDB 9.0 locally; generated local `SESSION_SECRET`; baseline tests 7/7 passing.

### Before 2026-10-09 — Original build (Hriday)
- `5601948` first commit, `5570bcc` live draw client, deploy config and docs: complete draw engine, host/audience pages, Excel import/export, PWA, Render/Vercel config.
