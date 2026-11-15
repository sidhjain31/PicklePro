# PicklePro — Complete Handover

> **For a new Claude (or any developer) taking over:** read this whole file once. It holds everything needed to continue without asking the owner for context: what exists, how the owner works, every decision and why, every problem already hit and how it was fixed, how to test, deploy and run an event. **Keep it current** — every change gets an entry in the [Change log](#15-change-log) and a refresh of [Current state](#13-current-state-what-next-limits).

Contents: [0. Start here](#0-start-here) · [1. The project](#1-the-project-in-one-minute) · [2. Working with the owner](#2-working-with-the-owner-rules-that-matter) · [3. Links and accounts](#3-links-and-accounts) · [4. Architecture](#4-architecture) · [5. Match Draw](#5-module-a--match-draw-the-main-link) · [6. Team Auction](#6-module-b--team-auction-auction) · [7. Decisions](#7-decisions-and-why) · [8. Problems hit and fixes](#8-problems-hit-and-how-they-were-fixed) · [9. Testing](#9-testing) · [10. Running locally](#10-running-locally-windows) · [11. Deploying](#11-deploying) · [12. Event-day checklists](#12-event-day-checklists) · [13. Current state](#13-current-state-what-next-limits) · [14. Gotchas](#14-gotchas-and-environment-tips) · [15. Change log](#15-change-log)

---

## 0. Start here

1. **What's live (2026-11-16):** https://pickle-pro-peach.vercel.app is the **Match Draw** (who-plays-whom, 3D show). The finished **Team Auction** (players drawn into teams) lives at `/auction`. Both share one server, one database, one login.
2. **Code:** GitHub `sidhjain31/PicklePro`, branch `main`. Local working copy on the owner's laptop: `C:\Users\laptop\OneDrive\Documents\PicklePro` (inside OneDrive — see [Gotchas](#14-gotchas-and-environment-tips)).
3. **Pushing to `main` deploys everything:** Render rebuilds the server (~1–5 min), Vercel rebuilds the client (~1 min). **Only push when the owner asks** ([section 2](#2-working-with-the-owner-rules-that-matter)).
4. **Before touching anything:** `npm run setup:dev`, make sure the local MongoDB service runs and `server/.env` exists ([section 10](#10-running-locally-windows)), then `npm test` (expect **1040/1040**).
5. **End every task** with: tests run, a Vercel link for the owner (preview or production as asked), a HANDOVER update.

---

## 1. The project in one minute

- **Product:** live event apps for the **ICC Pickleball** tournaments (ICC Pickleball Season 2), built and run by **SP Tech** (Sidh Jain, Pinkesh Valdria) for a paying organiser. The owner (GitHub `sidhjain31`, "Sidh") sells these as event experiences; each event is a chance for the next contract ("I have only one shot to get one more contract"), so **wow factor and zero failures on the day** matter more than anything.
- **Origin:** first built by **Hriday** (commits `5601948`, `5570bcc`: auction engine, host/audience pages, Excel, PWA, Render/Vercel config). Taken over by Claude on 2026-10-08 (session 1: the auction, Oct 8–13) and continued on 2026-11-13 (session 2: the match draw, Nov 13–16).
- **Module B — Team Auction** (Oct 2026, event held **13 Oct 2026, 7 pm**): players are drawn into 28 teams (main) / 4 teams (kids) live on everyone's phone with a slot-machine show, predictions, leaderboard, PDF/Excel exports. **Done** — kept at `/auction` for the records.
- **Module A — Match Draw** (Nov 2026): the 28 + 4 teams (organisers' final list with logos) are drawn against each other live with a 3D "Smash Arena" show; then results per game, standings, knockout bracket (QF → SF → Final; kids Final + 3rd place), champions. **Live on the main link**, not yet used at the real event when this was written.
- **Scale it was built for:** ~800 phones at once (owner's estimate), on **free tiers only** (owner has no budget for paid hosting).

---

## 2. Working with the owner (rules that matter)

These come from the owner's own words over both sessions. Follow them.

- **Language/tone:** the owner writes quick, casual Hinglish with typos ("muge maja nhi aya" = "I didn't enjoy it", "maga nhi ara" = "not getting the feel"). Answer in **simple English**, short, no jargon, no long bug reports at the end ("dont give the report of bugs in end"). Explain choices plainly when asked ("for my understanding explain in simple answer").
- **Always end with links.** "give vercel link", "give all links", "give audience and host link" = give the **audience**, **host** and **TV** links (and preview link if not on production). Use a table.
- **Git:** by default the owner does git ("git push or any activity related to git i will do in last; now we just develop"). **Only commit/push when asked** ("yes push it", "push to main", "can you only do i will login to github"). When asked: commit everything relevant with a clear message and push `main` (that deploys Render + Vercel).
- **Previews vs production:** for UI review make a **Vercel preview** (`npx vercel deploy --yes --scope sp-tech3 --build-env VITE_SOCKET_URL=https://picklepro-api.onrender.com` from the repo root). Previews are behind the **SP TECH Vercel login** (the owner can open them, the organiser can't) and use the **production server + data**. **Production only when the owner says so** ("deploy to production", "promote it", "push live").
- **HANDOVER.md after every change** (owner: "in future we do anything make handover.md"): change-log entry + current state.
- **Ask before downloading files** (say name, source, size). Some sites block scripts (Pixabay, Google Drive) — the owner's Chrome (Claude in Chrome) was used with permission.
- **Never type passwords into pages or chat.** The host password is `ADMIN_PASSWORD` (production: Render → `picklepro-api` → Environment; local: `server/.env`). If the owner asks "what is the host login", point them there. For local testing use the scripts in `tools/draw-day/` (they log in by themselves).
- **The owner's taste:** "something very animated, not spin types, unique, crazy" — broadcast-TV feel (IPL auction graphics, Champions League draw), pickleball-themed, sound that feels real (dry synthesized tunes were rejected). Audience experience first ("main target is our audience").
- **Owner workflow:** builds with you daily; tests on his phone and laptop, shows the organiser, comes back with screenshots/videos and short requests. Often says "use your picks" / "take your pick" → choose sensibly, explain in one line, proceed.
- **The client (organisers)** supplies data as Excel/PDF/Word/Drive folders with messy formatting (stray characters, replaced players, PDFs as logos). Normalise carefully and show what was corrected.
- **Budget:** free tiers only (Render free, Atlas M0, Vercel hobby/team). Don't propose paid services unless asked.

---

## 3. Links and accounts

**Match Draw (main link since 2026-11-16)** — old `/fixtures…` links still open the match draw; add `?draw=kids` (or use the Main/Kids switch) for the kids draw.

| Who | Link | Notes |
|---|---|---|
| **Audience (phones)** | https://pickle-pro-peach.vercel.app | Only the match draw (no module bar). Main / Kids switch at the top. |
| **Host** | https://pickle-pro-peach.vercel.app/admin | Password login. Teams, draw, results, knockout, ↺ Restart. Host pages show the **Match Draw \| Team Auction** bar. |
| **TV** | https://pickle-pro-peach.vercel.app/tv (old `/screen`) | Arena full screen + QR (main link) + matches list. |

**Team Auction (finished, kept for records)**

| Who | Link |
|---|---|
| Audience | https://pickle-pro-peach.vercel.app/auction |
| Host | https://pickle-pro-peach.vercel.app/auction/admin |
| TV | https://pickle-pro-peach.vercel.app/auction/tv |

**Infrastructure**

| What | Where | Notes |
|---|---|---|
| Client hosting | Vercel team **`sp-tech3`**, project **`pickle-pro`**, root dir `client` | Git auto-deploy on push to `main` works again (it was broken 2026-10-12 → CLI deploys were used). Vercel CLI is logged in on the owner's laptop. |
| Server + backup site | Render free web service **`picklepro-api`** → https://picklepro-api.onrender.com | `render.yaml`. Builds the client too, so the Render URL is a full backup site (`/`, `/admin`, `/auction`…). Auto-deploys on push to `main`. No Render CLI on the laptop. |
| Health | https://picklepro-api.onrender.com/api/health | `{"ok":true,"db":"up"}` |
| Database | MongoDB **Atlas M0** (production, db `picklepro`); local MongoDB 9.0 Windows service (dev) | M0 has no automatic backups. |
| Repository | https://github.com/sidhjain31/PicklePro | GitHub credential on the laptop re-done via browser sign-in (2026-10-09) so workflow files can be pushed. CI: `.github/workflows/test.yml`. |
| Contacts shown in the app | `client/src/Brand.jsx` | Sidh Jain 90671 27688, Pinkesh Valdria 96536 72196; WhatsApp → Sidh `wa.me/919067127688` with a prefilled enquiry. |

---

## 4. Architecture

| Part | Tech | Hosted on |
|---|---|---|
| `client/` | React 19, Vite 8, `vite-plugin-pwa` 2 (PWA), `socket.io-client` 4, `three` 0.186.1 (3D), `pdfjs-dist` 4.10.38 + `fflate` 0.8.3 (imports), `jspdf` 4 + `jspdf-autotable` 5 (PDFs), `qrcode`, fonts Archivo + Big Shoulders | Vercel |
| `server/` | Node ≥ 22.12 (laptop runs v24), Express 5, Socket.IO 4, Mongoose 9, ExcelJS 4, Helmet 8 | Render (free) |
| Database | MongoDB | Atlas M0 / local service |

**Data flow**
- Vercel rewrites `/api/*` to Render (`client/vercel.json`); everything else that isn't a real file falls back to `index.html`, **except** `assets/`, `sounds/`, `season2/` (so a missing file is a real 404, never the app page).
- Socket.IO connects **straight to Render** (`VITE_SOCKET_URL=https://picklepro-api.onrender.com`, set in the Vercel project and passed with `--build-env` on CLI previews). Vercel can't proxy websockets.
- **Server-authoritative:** every random pick is made on the server (`crypto.randomInt`); browsers only animate. Clients can only send emoji reactions over the socket (whitelisted, rate-limited).
- **Two events everywhere:** `main` and `kids`. Routes are mounted twice: `/api/kids/...` and `/api/...`. Socket rooms: auction `event:<main|kids>`, match draw `cup:<main|kids>` (socket `auth = { role, viewer, event, module }`, `module: 'cup'` for the match draw). Viewer counts and reactions are per room.

**Page routing** (`client/src/main.jsx`, client-side; `/kids` prefix and `?draw=kids` select the kids event via `client/src/event.js`)

| Path | Page |
|---|---|
| `/` (and `/fixtures`) | `cup/CupLive.jsx` — match-draw audience |
| `/admin` (and `/fixtures/admin`) | `cup/CupAdmin.jsx` — match-draw host |
| `/tv`, `/screen` (and `/fixtures/tv`, `/fixtures/screen`) | `cup/CupScreen.jsx` — match-draw TV |
| `/auction` | `Live.jsx` — auction audience |
| `/auction/admin` | `Admin.jsx` — auction host |
| `/auction/tv`, `/auction/screen` | `Screen.jsx` — auction TV |

Switching Main/Kids remounts the page **without a reload** (`setEvent` + `App key={ev}`) so unlocked audio keeps playing.

### File map

**Server (`server/`)**

| File | What it does |
|---|---|
| `src/index.js` | Boot: env check, Mongo connect, start server |
| `src/server.js` | Express app (Helmet, JSON), auction routes `eventApi(ev)`, match-draw routes (`/api/kids/fixtures`, `/api/fixtures` mounted **before** the auction routes), auth routes, health, static client + SPA fallback, Socket.IO rooms + per-room viewer counts, `resumeCupReveals()` on boot, `stopCupTimers()` on close |
| `src/fixtures.js` | **Match draw:** load/store active cup (newest per event), 1 s public-state cache, `broadcast`, reveal timers (`schedule`, `resumeCupReveals`), lock queue, logo storage, actions + routes (`cupApi`), `setCupClock` (tests) |
| `src/draw.js` | **Auction engine:** snapshot, public/admin state, rules, lock, reveal scheduling, archive |
| `src/models.js` | Schemas: `Tournament`, `Player`, `DrawEvent`, `Guess`, `Cup`, `CupLogo`; auction labels/codes (`LABELS`, `SHORT`, `CODES`, `GROUPS`), `SHUFFLE`, `EVENTS` (main 28 teams / kids 4 teams) |
| `src/crowd.js` | Reactions relay (per room, rate-limited), predictions (`submitGuess`), leaderboard |
| `src/auth.js` | Password login → signed HttpOnly cookie `admin` (`<expiry>.<hmac>`, 12 h, SameSite Strict, Secure in production), failed-login rate limit |
| `src/excel.js` | Auction Excel export (any tournament) + spreadsheet import (organisers' formats) |
| `test/*.test.js`, `test/qa/*.test.js` | 1040 tests (see [Testing](#9-testing)); `test/cup.test.js` = match draw |
| `perf/load.mjs` | Auction load/stress/spike/soak script (isolated DB only) |

**Client — shared (`client/src/`)**

| File | What it does |
|---|---|
| `main.jsx` | Routing table above; reload-once on stale chunk (`vite:preloadError`) |
| `event.js` | Current event (`getEvent/setEvent/useEvent`), `apiBase`, per-event storage keys (`storeKey`), `pagePath`, `pageUrl` |
| `api.js` | `fetch` wrapper (JSON, errors with `.status`) |
| `sound.js` | Master audio engine: unlock inside a tap, one master gain + compressor, mute stops everything, iPhone silent-switch handling, resume prompt; all synthesized sounds; exports `audioContext`, `playable`, `trackSound` used by the match draw's `sfx.js` |
| `ModuleNav.jsx` | **Match Draw \| Team Auction** bar — host pages only |
| `Live.jsx` (`Header`, `ConnectionBanner`), `Brand.jsx`, `Follow.jsx` (`useWakeLock`), `Audience.jsx` (`ReactionBar`, `FloatingReactions`), `Stage.jsx` (`StageTools`, `ResumeSoundPrompt`), `Admin.jsx` (`Login`, `Waking`) | Shared building blocks used by both modules |
| `styles.css`, `audience.css` | Global + audience styles (ICC palette) |

**Client — Match Draw (`client/src/cup/`)**

| File | What it does |
|---|---|
| `core.js` | **The rules** (pure functions, no I/O) — imported by the server too (`../../client/src/cup/core.js`): `newCup`, `cleanTeams/setTeams/setLooks/setSettings`, `openArena/backToSetup`, `drawMatch/undoMatch`, `timeline`, `proofText`, `view` (what a screen may see at server time `now`), results/`outcome`/standings, knockout (`lockKnockout/unlockKnockout`, bracket), `history`; constants `SLOTS`, `GAMES`, `WEAPONS`, `TIMING`, `PALETTE`, `AIM_MIN/MAX`, `MAX_TEAMS` |
| `live.js` | `useCup(role)` (socket + first HTTP state + server clock offset + `openedAt` + 404 → `unavailable`), `cupApi`, `cupUrl`, `switchCup`, `teamOf`, `splitName`; 10-minute state cache (`cup-state-v2`); clears old demo/cache keys |
| `CupLive.jsx` | Audience page (+ `CupSwitch` Main/Kids with LIVE/Done badges, `ComingSoon` incl. waking-server note) |
| `CupAdmin.jsx` | Host page: `Setup` (teams table, imports, ⭐ Load ICC Season 2 teams, logos/colours), `SettingsDesk`, `DrawDesk`, `ResultsDesk`/`TieEditor`, `SeedDesk`, `KnockoutDesk`, `LooksDesk`, `Fairness`, `Tools` (↺ Restart, PDF, TV, new empty draw) |
| `CupScreen.jsx` | TV view (QR, arena, matches list) |
| `SmashArena.jsx` | `SmashArena` (picks 3D or 2D), `Smash3D` (loads `stage3d.js` lazily, **the director**: one run per `${cup.id}:${seq}` that follows the server's reveal times), HUD, theatre mode, `MusicToggle` (🎵 Music + 👥 Crowd) |
| `stage3d.js` | three.js engine `createStage(container, { low, onLost })`: stadium, crests, spotlight, paddle/ball, shots, shatter, emblems, cameras, bloom, adaptive quality, tweens |
| `Arena.jsx`, `fx.js` | 2D fallback arena + canvas effects (also `buzz`, fireworks, VS burst) |
| `Versus.jsx` | VS splash (team colours, logos, rosters, six games with names) |
| `Moments.jsx` | Result toasts, "All N matches are set!", knockout line-up reveal, champions overlay |
| `Boards.jsx` | `CupSteps`, `TieList`/`TieCard`, `Standings`, `Bracket`, `ChampionBanner`, `TeamsGrid`, `FindMatch` |
| `looks.jsx` | Shot names/emoji (`SHOTS`), `colorOf`, generated badges, `logoFor`/`useLogo`/`TeamLogo`, `prepareLogo` (256 px WebP + main colour), `uploadedLogoUrl` (`s:` → `/season2/logos/…`) |
| `sfx.js` | Recorded sounds: preload, `play`, music bed, crowd murmur (hunt only), short cheers, per-moment functions, Music/Crowd prefs |
| `importTeams.js`, `teamsPdf.js` | Import teams from PDF / .xlsx / .docx / CSV / text incl. embedded logos (lazy, host only) |
| `fixturesPdf.js` | Fixtures PDF export |
| `season2.json` | ICC Season 2 teams (28 main + 4 kids) with players A–D, `logo: 's:mNN.webp'`, colour |
| `cup.css` | All match-draw styles |

**Static files:** `client/public/season2/logos/` (m01–m28, k01–k04, icc-shield; 320 px WebP), `client/public/sounds/` (21 MP3s, 2.2 MB), `client/public/logo.png` (ICC logo), PWA icons.

**Tools (`tools/`):** `draw-day/` (rehearsal, crowd load, mid-show restart scripts), `assets/` (Season 2 data + logo scripts), `audio/` (sound processing). See [Testing](#9-testing).

**Other:** `samples/sample-players.xlsx` (auction import sample), `marketing/` (poster.html/png, QR, sample PDFs), `TEST_PLAN.md`, `TEST_CASES.md`, `TEST_RESULTS.md` (auction QA docs), `scripts/dev.mjs` (runs server + client together), `.claude/launch.json` (preview configs: `server` :4000, `client` :5173, `client-prod` :4173 = `vite preview` of the production build).

### Database collections
- **tournaments** (auction) — event, name, status (`DRAFT`/`LIVE`/`COMPLETED`), teamCount, categories (round order), currentIndex, spinMs, predictions. Newest per event = active; older = archive.
- **players** (auction) — tournamentId, category, name, nameKey (unique per tournament), age/contact details (host only).
- **drawevents** (auction, source of truth) — actionId, sequence, category, teamNumber, playerId/Name, revealAt, voided, commitment, salt. Unique indexes guard double picks.
- **guesses** (auction predictions) — unique per (tournament, round, team, voter).
- **cups** (match draw) — `event`, `name`, `status` (`SETUP`/`DRAW`/`KNOCKOUT`; `league`/`done` are derived), `aimMs`, `weapon`, `courts`, `teams [{key,name,players{A,B,C,D},color,logo}]`, `draws [{seq,tie,a,b,weapon,last,aimMs,startAt,revealA,revealB,doneAt,commitment,salt,voided,voidedAt}]`, `results {L1…|QF1…|SF1|SF2|F|3P: {a,b,games[{w,sa,sb}],decider}}`, `seeds`. **Newest document per event is active**; Restart/new create a new document, old ones stay (history).
- **cuplogos** — `hash` (unique, 32 hex of SHA-256), `type` (PNG/JPEG/WebP), `data`. Served at `/api/fixtures/logo/<hash>` with a 1-year immutable cache.

### API
**Auction** (main `/api`, kids `/api/kids`): public `GET /state`, `POST /guess`, `GET /leaderboard[?voter=]`; host `GET /admin`, `PATCH /tournament`, `POST /tournaments`, `GET /tournaments`, `PUT /players`, `PUT /players/details`, `POST /players/import`, `POST /start`, `POST /draw`, `POST /undo`, `POST /finalize`, `GET /export.xlsx[?tournament=]`. Shared: `GET /api/health`, `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`. Socket (room `event:<ev>`): `viewers`, `tournament:state`, `draw:spinning`, `draw:revealed`, `draw:undone`, `category:finalized`, `reaction`; client → `reaction`.

**Match draw** (main `/api/fixtures`, kids `/api/kids/fixtures`):
- Public: `GET /state` (1 s cache, includes `now` = server clock), `GET /logo/:hash`.
- Host (cookie): `GET /admin` (fairness history), `PATCH /settings {name?, aimMs, weapon, courts}`, `PATCH /looks {looks: {t1: {color, logo}}}`, `PUT /logos {logos: {t1: dataUrl|null}}` (PNG/JPEG/WebP ≤ 400 KB), `PUT /teams {teams}`, `POST /open`, `POST /setup` (back to setup while nothing drawn), `POST /draw {tie, weapon?}` → `{seq, tie}` only, `POST /undo {seq}`, `PUT /result {tie, games[6], decider}`, `POST /seed {seeds}`, `POST /unseed`, `POST /new {name?, keepTeams?}` (`keepTeams: true` = **Restart**). Unknown paths → 404 JSON.
- Socket: `auth.module = 'cup'` → room `cup:<ev>`; server emits `cup:state` on join, on every change and at each reveal (+30 ms), plus `viewers`, `reaction`.

---

## 5. Module A — Match Draw (the main link)

### 5.1 Format (from the organisers' sheet; their timings are ignored)
- Every team plays **one match (tie)** against a **drawn** opponent. A tie = **six doubles games**, same categories facing each other: **A/B, C/D, A/C, B/D, A/D, B/C** (`GAMES` in `core.js`; A–D = the team's four players; D is the woman in the main draw).
- Ties are spread over courts in draw order: tie N → court `((N−1) % courts) + 1`, round `ceil(N / courts)` (default 2 courts).
- A tie is won with **4+ games**; at **3–3** the total points decide (if entered), else the host taps a **decider**.
- Standings: ties won → games won → points difference → points for. The host can reorder before locking (own tie-break rules).
- **Knockout:** 8+ teams (main, 28 → 14 ties) → seeds 1–8 → **QF1 1v8, QF2 2v7, QF3 3v6, QF4 4v5** → **SF1 = W(QF1) v W(QF2), SF2 = W(QF3) v W(QF4)** → **Final**. 4–7 teams (kids, 4 → 2 ties) → **Final 1v2** + **3rd place 3v4**.
- Phases: `setup` → (Open the arena) `draw` → (all paired) `league` → (Lock knockout) `knockout` → (Final decided) `done`.

### 5.2 Host flow (`/admin`, then the Main/Kids switch)
1. **Teams** — ⭐ **Load ICC Season 2 teams** (one tap, from `season2.json`, logos included) **or** upload a file (PDF, .xlsx, .docx, CSV) **or** paste text → editable table (logo, colour, name, players A–D) → **Save**. Needs an even number ≥ 4.
2. **The show** — name, suspense (`aimMs`, server accepts 1.5–9 s, default 3.5 s), shot (🎲 Surprise = changes every match, never the same within 3; or one fixed), courts.
3. **🎨 Logos & colours** — change any time (even mid-event); names/players lock when the arena opens.
4. **Open the arena** → audiences see the crests rise. **Draw match N of 14** per tap (optionally pick that match's shot). The button is locked while a show runs (counts down) and right after a tap until the show is confirmed. **↶ Undo last match** (only the latest, not during its show, not once it has results). **Back to team setup** while nothing is drawn.
5. **Results** — per game tap the winning pair or type points; 3–3 → points or decider tap. Toasts on every phone.
6. **🔒 Knockout line-up** — from the standings, reorderable → **Lock & reveal** (asks first if any league tie is undecided). Back-to-back VS cards on every screen. **Unlock** while no knockout result exists.
7. **Knockout results** → **Champions** overlay everywhere.
8. **Tools** — **↺ Restart draw** (same teams, logos, settings; nothing drawn; type `RESTART`; refused while a show runs) · 📄 Fixtures PDF · 📺 TV view · *Start a new match draw (empty, new name)* (type `NEW`). Restart/new keep the old draw in the database; to undo one, delete the newest `cups` document of that event in Atlas — the previous one becomes active again.
9. **Fairness** card — re-checks every finished match's seal (✅ N/N).

### 5.3 The show — Smash Arena 3D
**Timeline per match** (server times; `TIMING = { introMs: 1800, strikeMs: 3800, vsMs: 7800, fateMs: 2600 }`, `timeline()` in `core.js`):
- `startAt` → title card ("☄️ SKY LOB", 1.8 s) → spotlight **hunt** (`aimMs`) → **revealA** (`start + intro + aim`) → strike (3.8 s: camera behind the paddle, slow-motion toss, smash, chase cam, crest shatters, logo emblem rises "X is in!") → hunt again (`aimMs`) → **revealB** (`revealA + strike + aim`) → second strike → emblems **collide** ("It's on!") → **VERSUS** screen (7.8 s, team colours, logos, rosters, six games with names) → **doneAt** (`revealB + strike + vs`). ≈ 24 s at 3.5 s suspense (measured 23.6 s; 20 s at 1.5 s).
- **Last two teams:** 🔗 "Last two standing / Fate decides": both lift, lightning arcs, they collide; `revealA = revealB = start + intro + fate`, `doneAt = + strike + vs` (≈ 16 s).
- **Shots** (`WEAPONS`): 🔥 Fireball Smash, ⚡ Thunder Smash (lightning from the sky), 💠 Laser Drive, 🚀 Rocket Serve (smoke trail), ☄️ Sky Lob (meteor), 🌀 Banana Curve.
- **Other moments:** crests rise + camera swoop when the host opens the arena (`openedAt`, only if the screen saw it happen); "All N matches are set!" + fireworks (5 s); result toasts; knockout line-up VS cards (3.4 s each); champions overlay (14 s or tap).
- **Theatre mode:** during a show the arena goes full screen on audience/TV (✕ to minimise on phones). The host's arena stays inline.
- **The director (`SmashArena.jsx`)** runs once per `${cup.id}:${seq}`. It never decides anything: it waits for each team to appear in the public state (`waitSide`), plays the matching animation, and uses the server clock (`serverNow = Date.now() + offset`) to skip or shorten steps for late joiners (`fresh`, `strikeFresh`) so every screen ends together. When `state.current` disappears the run is cleaned up.
- **3D engine (`stage3d.js`)** API: `sync(teams, live, {rise})`, `opening()`, `jumbo(a,b)`, `hunt(until, serverNow, exclude)`, `strike(key, side, shot, onImpact)`, `fate(keys)`, `clashFate(a,b,onImpact)`, `place(key, side)`, `collide()`, `finish()`, `resize()`, `pause(v)`, `quality()`, `dispose()`.
  - **Crests:** extruded shield in the team colour (metallic, emissive glow when the spotlight is on it), a **square logo plate** (1.0 × 1.0, rounded) on a light frame (1.1), name label sprite above; the whole crest **leans back 0.24 rad** towards the raised camera. Formation adapts to portrait/landscape and team count (`layout`).
  - **Emblems** (revealed teams floating in camera space): rounded-square logo (1.26) in a glowing team-colour frame (1.42) + name label.
  - **Look:** night stadium, floodlights, crowd with camera flashes, jumbotron with the ICC logo ("MATCH 4 OF 14 · ROCKET SERVE"), court + net. ACES filmic tone mapping.
  - **Bloom:** `UnrealBloomPass(256², strength 0.55, radius 0.45, threshold 0.92)`; logos are drawn at linear level 0.88 and frames 0.84 so they **never bloom** (stay sharp); texture anisotropy up to 8.
  - **Sharpness/performance:** every screen renders at its **full native resolution** (`devicePixelRatio`, capped at 3×: a 4K TV gets 3840×2160, an iPhone its full Retina pixels) with edge smoothing (MSAA) always on — owner's request ("max resolution on every screen"). Phones (coarse pointer) skip bloom and can step down native → 2× → 1.6× (floor); computers native + bloom → native without bloom → 1.5× → 1.25× → 1×. It steps down only on real overload (frames averaging > 42 ms, i.e. under ~24 fps, for 2 s) — a phone capped at 30 fps (iPhone Low Power Mode, WhatsApp's in-app browser) is not "slow". Entering/leaving full screen re-sizes the 3D picture at once (and again at 120/450 ms) so it is never a stretched copy. All effect materials compiled while loading (`renderer.compile` prewarm), no allocations mid-show (pre-built lightning, shared shard materials, reused labels), 3D paused behind the VS screen and when scrolled off screen (IntersectionObserver) or the tab is hidden.
  - **Tweens finish by the clock:** every tween also ends via `setTimeout(ms + 150)`, so the show keeps the server's schedule even when no frames are drawn (scrolled away, background tab, throttled phone).
- **2D fallback** (`Arena.jsx` + `fx.js` canvas): used when WebGL is missing, the GPU context is lost, or with `?2d=1`.

### 5.4 Fair and spoiler-free
- The server picks both teams with `crypto.randomInt`, stores them, and seals: `commitment = SHA-256(proofText({seq, tie, a: nameA, b: nameB, salt}))` with `proofText = "PicklePro|cup|v1|seq|tie|a|b|salt"` and a fresh 32-byte salt. Commitment is public when the show starts, salt only after `doneAt`.
- `view(cup, now)` hides each team until its reveal time: `current.a/b` stay `null`, the team's `tie` field and `remaining` list don't change, and the tie isn't listed until `revealB`. Verified with a polling script and 300 sockets: nobody ever saw a team early.
- The draw response to the host is only `{seq, tie}` — not even the host's network tab shows the pair early.
- The server pushes a fresh `cup:state` to the room at each reveal (+30 ms) and at `doneAt`; reveal timers are re-scheduled on boot (`resumeCupReveals`) so a server restart mid-show is harmless.
- Double taps / two host phones: every host action goes through one lock queue; `drawMatch` refuses while a show runs and refuses a `tie` that isn't `nextTie` ("your screen was out of date").

### 5.5 Teams, logos and the ICC Season 2 data
- **`season2.json`** — built by `tools/assets/season2_data.py` from the organisers' *ICC PICKELBALL SEASON 2 - updated.xlsx* (28 main + 4 kids). Rules applied: the **Replaced** column wins (e.g. Team 1 got four replacements: Nihal Hemdev, Hridaan Muni, Anshvardhan Modi, Veera Mehta; kids Fireball Aces C = Kayaan Mehta); ages, phone numbers and the payment table are **ignored** (owner's instruction); names title-cased; "THE DROP SHOT DONE" → "DONS" (matches its logo), "SERVE - IVORS" → "SERVE-IVORS"; a cell "C" + 12 non-breaking spaces + "Mehul Jain" cleaned to "Mehul Jain".
- **Logos** from the organisers' Drive folder *Team Logos* (32 files; 3 were PDFs, rendered) → `tools/assets/process_logos.py` → **640 px** square WebP in `client/public/season2/logos/` (`m01`–`m28` by team number, `k01`–`k04`, `icc-shield.webp`), 3.0 MB in total (a phone loads only its draw's logos, ~2.6 MB for main; not pre-cached). Originals are ~1254 px; 320 px (the first version) looked soft on 3× phones and 4K TVs. Colours: `logo_colours.py` (most common vivid hue; pickleball yellow down-weighted). Three logos (`m01`, `m18`, `m23`) had a fake grey/white "transparent" checkerboard baked in → `clean_checker.py` flood-fills it to white from the edges (logo untouched).
- A team's `logo` is either a bundled ref **`s:<file>`** (regex in `core.js`: `s:[a-z0-9][a-z0-9_.-]{0,60}\.(webp|png|jpe?g)`, served from `/season2/logos/`) or the **hash of an uploaded image** (`cuplogos`).
- **Uploads:** the host page resizes to 256 px WebP and picks the main colour in the browser (`prepareLogo`), the server stores each distinct image once.
- **Import** (`importTeams.js`, lazy, host only): PDF (pdf.js text + images mapped to the nearest team card; repeated header images ignored), .xlsx/.docx (fflate unzip + namespace-aware XML; pictures matched by row), CSV/text. Accepts category headers A–D, M1/M2/M3/W1 and B1/G1/B2/G2. Tested with generated files (6/6 logos each) and the auction's own team-card PDFs (28/28, 4/4).
- **Generated badges** for teams without a logo (colour ring, icon, initials, name).
- Logos everywhere (3D plates, VS, lists, bracket, champions) are **rounded squares** — the organisers' artwork is square with the team name edge to edge.

### 5.6 Sound (`client/src/cup/sfx.js`)
- 21 recorded files in `client/public/sounds/` (2.2 MB), fetched **only on devices with sound on**, never precached; played through `sound.js`'s master gain (the 🔊 button mutes everything instantly). Any missing/undecodable file falls back to the old synthesized sound.
- **Layers:** music bed (dhol + electronic, 0.4, ducks under big moments); **crowd murmur only while the spotlight hunts** (0.1, fades out 1.6 s after); one-shots per moment: arena open, title, drum roll (hunt), slow-mo toss, paddle pop (skips 35 ms encoder padding), flight sound per shot, shatter + short cheer + 2.5 s dhol burst per reveal, metal clash (collide; VS adds nothing), whistle + fanfare (all set), fanfare + fireworks + dhols (champions), short cheer per result. Cheers are short faded bursts (0.3–0.55 gain, 1.2–3.5 s).
- **Per device switches:** 🎵 Music and 👥 Crowd (localStorage `team-draw:music`, `team-draw:crowd`), icon-only under 560 px.
- **Sources/licences** (checked 2026-11-14): Mixkit (Sound Effects Free License, commercial use inside a product OK): crowd 2097, open 2900, title 2918, drumroll 577, slowmo 1486, fireball 1347, thunder 1300, laser 1287, rocket 1714, meteor 3024, curve 1493, shatter 1693, cheer 462, clash 1687, whistle 614, fanfare 2293, fireworks 524. Pixabay (Pixabay Content License, free commercial use, no credit required): `pop` = "PickleBall" (freesound_community 24267), `dhol-hit` = "Dhol And Neon (15 sec stinger)" (kaazoom 564695), `music` = "Dhol And Neon (1 min edit)" (kaazoom 564697), `dhols` = "Indian Wedding Dhols" (freesound_community 52474).
- **Processing:** `tools/audio/process.mjs` (trim, mono 96 kbps / music stereo 112 kbps, loudness levelling, fades, seamless crowd loop).

### 5.7 Live-ness and robustness details
- First paint: last state from localStorage **only if < 10 minutes old** (`cup-state-v2`), never a running show; then HTTP `/state`, then the socket.
- Server clock offset from every state's `now`; all show timing uses server time.
- **Free server waking:** pages show "Connecting…" then, after 5 s, "Waking up the server — the first visit can take up to a minute." Audience and host pages also fetch both draws' `/state` every 60 s while visible (the Main/Kids badges), which keeps the free Render service awake during an event (the TV page only holds its socket).
- **Overlays** (`Moments.jsx`) use timers that survive later state updates; a new cup id (Restart) clears every overlay.
- Wake lock while the draw/knockout is on; reveal buzz only after the viewer has tapped.
- The server returns 404 for `/api/fixtures/state` if it's an old build → pages show **Coming soon** (host: "push to main → Render").

### 5.8 What the audience page shows (top to bottom)
Header (ICC logo, draw name, LIVE, 👀 watching) → SP Tech credit strip → Main/Kids switch → steps (Teams · Draw · Matches · Knockout · Champion) → by phase: *Coming up* hero / the arena / champion banner + bracket → matches drawn (with court/round, find my match) → standings → teams → footer. Reactions bar (own room) once the arena is open.

---

## 6. Module B — Team Auction (`/auction`)

Status: **finished** — Season 2 auction ran on 13 Oct 2026; production data shows the completed main and kids draws. Kept for the records (teams, PDF, Excel). Nothing in the match draw reads auction data (by design).

### 6.1 Format
| Event | Teams | Rounds in order (display letter = organisers' code) | Lists |
|---|---|---|---|
| **Main** | 28 | **A = M1** (shuffled onto all 28 teams in one action) → **B = M2** → **C = M3** → **D = W1** (key `WOMEN`); optional extra list key `D` shown as **E** (M4). Order editable in setup. | 28 players per list |
| **Kids** | 4 | **A = B1** (key `ICON`, shuffled) → **B = G1** (`GIRL1`) → **C = B2** (`BOY`) → **D = G2** (`GIRL2`) — fixed format | 4 per list (four separate lists; the old shared "Girls 8" list is only kept so old tournaments load) |

- People see **A, B, C, D everywhere** (cards, stage, PDF, Excel, Know your team); only the category buttons at the top show M1/M2/M3/W1 or B1/G1/B2/G2.
- Every non-shuffle round draws **one player per spin** for Team 1, 2, 3 … in order. A round must be **Finalized** before the next; finalized rounds never change. **Undo** = latest spin of the current round only (kept in history as *Undone*). No name may appear twice in a tournament (case/spaces/invisible characters ignored). Lists editable until their round starts.
- **Captain** line was removed (owner request, 2026-10-12).

### 6.2 Fairness and safety
Each pick saved before it's shown (hidden from every screen and from `/api/state` until the spin ends; survives refresh/reconnect/restart — reveals rescheduled on boot). One action at a time; the client must name the team it thinks is next; unique DB indexes as the last guard. Commit–reveal seal `SHA-256("PicklePro|v1|actionId|category|team=name;…|key")`, key revealed after the spin; ✅ Verified fair shown **only on the host page** (owner didn't want it on audience/TV); commitment + key in the Excel *Draw History*.

### 6.3 Audience experience
Round walk-out card + jingle → 3-2-1-GO countdown with names flying by (skipped if spin < 4 s or joined mid-spin) → slot machine between two real pickleball paddles, rally ball in its own strip, names at 13/s → slow-down with a **near-miss** (stall one short then slide on, or overshoot then settle; chosen from the draw id so all screens match) → winner card ("SMASH!", confetti, bell) → trophy moment on Finalize. Board cells still landing show `???` (no spoilers in board, ticker, now-bar or follow card).
- **⭐ Know your team** (seat chain, team alerts with buzz + pop-up), **🔮 Predict the pick** (pending list, instant lock-in, leaderboard box with top 3 + "You: #N"; host can close predictions), **All teams** + find a player, latest-picks ticker, sticky now-drawing bar, reactions, wake lock, reveal buzz.
- **Sound** (`sound.js`, all synthesized): pure **mechanical slot machine** (lever spring + gear catch, motor hum, reel whirr slowing into clacks, near-miss shudder, thunk, bell, coins) + paddle pock on real paddle hits, quiet crowd murmur, drumroll for the last ≤ 3 names, round jingles, whistle + trophy on Finalize. Tap for sound; resume prompt after refresh.
- **Viewer count** "👀 N watching": distinct audience browsers per draw (random id in localStorage; refresh/extra tabs count once; host and TV excluded; dead phones drop within ~20 s; hidden when ≤ 1).

### 6.4 Host (`/auction/admin`)
Main/Kids switch; Setup (name, spin length, categories/order, lists by paste or **Import .xlsx/.csv** — including the organisers' row format *Category | group | Name | AGE | CONTACT NUMBER* with blocks side by side, several files add up), readiness counts, **Start draw**; Draw (Shuffle/Spin for Team N/Finalize, Undo, predictions switch, links); exports **PDF report** (navy team cards, A–D rows; age + tap-to-call number under each name), **Excel** (*Final Teams*, *Draw History*, *Players* in the organisers' layout + TEAM), **Teams gallery** PNG 1920×1080; **Ages & phone numbers (PDF)** tool (fix one or reload from the organisers' files any time); Past tournaments (export any), Start a new tournament.

---

## 7. Decisions and why

### Match Draw
| # | Decision | Why |
|---|---|---|
| 1 | **Separate module** (own collection, routes, socket rooms, pages); never reads auction data | Owner: "this is a separate module… not connected to previous module"; final teams come from the organisers' file, with replaced players. |
| 2 | Format = one tie of 6 doubles games per team, knockout QF 1v8…/kids Final + 3rd; **organisers' timings ignored** | Owner's format screenshots (DAY 1 / DAY 2) and instruction. |
| 3 | **Server picks + server-timed reveals**, teams hidden until reveal time, screens animate around the server clock | Every phone in sync; nobody can peek (not even via the network tab); refresh/late join/restart safe. Same philosophy as the auction. |
| 4 | **Commit–reveal seal**, verified on the host page | Provable fairness like the auction; the owner prefers not to show seals to the audience. |
| 5 | **Rules in one pure file (`core.js`) shared by server and client** | One source of truth; the server imports it by relative path. (It also powered the in-browser demo until that was removed.) |
| 6 | Host sends the tie number it expects; one lock queue | Double taps / two host phones / stale screens can never draw twice. |
| 7 | First version was a 2D "arena" (crosshair hunt, darts-like weapons, VS splash) | Owner asked for "something unique like darts… not spin". |
| 8 | Owner wasn't impressed ("muge maja nhi aya") → offered **Smash Arena 3D** (pickleball court), **Bullseye 3D** (cinematic darts) or **Galaxy of Teams** (planets, meteor, black hole); **owner chose Smash Arena 3D** | Broadcast-TV feel, pickleball-themed, unseen. |
| 9 | **three.js**, lazy chunk (~632 KB), excluded from the PWA precache; lighter render on touch screens + adaptive quality; **2D arena kept as fallback** | Only match-draw pages pay for 3D; phones stay smooth; old/GPU-less devices still get a show. |
| 10 | Real recorded sounds (Mixkit + Pixabay) replacing synthesized ones; **dhol** music + dhol hit on reveals | Owner: sound felt "dry, only a tune". Picks were the assistant's ("use your picks"), approved before downloading; dhol suits the Indian audience. |
| 11 | Sounds fetched only when sound is on; never precached; `sounds/` excluded from the SPA fallback | Silent phones download nothing; a missing file must 404, not return HTML. |
| 12 | Logos = content hash (stored once, immutable cache) **or** bundled `s:` files for the season | Hundreds of phones download each logo once; the season's 32 logos ship with the app (CDN, no upload step). |
| 13 | Team colour auto-picked from the logo (editable) | Crests/VS look branded without manual work. |
| 14 | **Host-only control**; the audience never gets draw buttons | Owner: "host would be controlling, audience should not have access to draw". |
| 15 | "Projector/Big screen" renamed **TV view** (`/tv`) | Owner: "there is no projector view, there is TV view". |
| 16 | Season 2 data: replacements applied, **ages/phones/payments ignored** | Owner's instruction. |
| 17 | Module nav bar (Team Auction \| Match Draw) added (2026-11-15) → later **audience pages show only the match draw**; the **main link became the match draw**, auction moved to `/auction` (2026-11-16) | Owner: "add a separate module nav bar", then "in team auction link only the match draw feature". Old shared links keep working. Host pages keep the bar so the auction stays reachable. |
| 18 | A browser-only **demo** (`?demo=1`) was built so the owner could review without pushing the server; **removed on 2026-11-16** | Owner asked to remove it; the Restart button replaces its rehearsal role. Consequence: testing online requires the server on `main`. |
| 19 | **Restart keeps teams/logos/settings**, creates a new cup document, refused during a show, typed `RESTART` | Owner: "I will try multiple times, then on D-day press restart so the audience sees new content". Typed confirmation so a stray tap can't wipe a live event; old draws recoverable. |
| 20 | **Calmer crowd:** no constant bed; murmur only in the hunt; short quieter cheers; 👥 Crowd switch per device | Owner: people found the crowd noise irritating. |
| 21 | **Square logo plates** (not circles), lean-back crests, logos below the bloom threshold, cleaned checkerboards | Owner: "ensure in 3D the logos are seen clearly" — circles cut off team names; bloom blurred white logos. |
| 22 | Draw-day hardening (tweens end by the clock, overlay timers, 10-min cache, waking note, Draw-button lock, knockout-lock confirm) | Found by the real-speed rehearsal; owner: "make it so robust that I don't have any issues on draw day". |
| 23 | Production deploys and pushes only when asked | Owner's standing rule. |

### Team Auction (session 1)
| Decision | Why |
|---|---|
| A (M1) shuffled onto all 28 teams in one go; other categories one spin per team in team order; any category order | Owner's explanation of the real auction. |
| `crypto.randomInt` + Fisher–Yates; commit–reveal seal; seal hidden from the audience | Owner: "randomization strongest in the world"; later "remove verified fair thing, don't want to show to audience". |
| PDF report for organisers → redesigned as navy team cards; age + tap-to-call numbers added | Organiser feedback after the event ("not happy with the current pdf format"), then "add their age and numbers… redirect on phone pad". |
| Sound journey: synthesized stadium sounds → casino slot machine modelled on the owner's YouTube reference → **pure mechanical slot**, no arcade melody | Owner: "slot machine sound like this", then "starting sound is more arcade type, I don't want that, pure technical slot sound". |
| Know your team (renamed from "your team"), team alerts, predictions with pending list, leaderboard box | Owner's audience-engagement requests and feedback ("guy predicted…"). |
| Tap battle added then **removed entirely** | Owner's later request; it caused lag/noise. |
| **One link for both draws**, in-place switch without reload | Owner: "kids and main draw should be there in one only… admin also same"; no reload keeps sound unlocked. |
| Kids split into four lists (B1, G1, B2, G2) | Owner's format update (2026-10-12). |
| Letters A–D everywhere; M1/W1/B1/G1 only on category buttons; captain removed | Owner's screenshots/instructions (2026-10-12/13). |
| Import/export in the organisers' exact spreadsheet format | Owner: "make according to this excel as compatible for my software". |
| Free-tier hardening for ~800 phones (cached state for joins, reaction caps, WebSocket first) | Owner had no budget for paid hosting ("anything free and safe"). |
| Branding: compact SP Tech strip, Contact chip, footer credit | Owner: branding too faded/too much; smarter way to show numbers. |

---

## 8. Problems hit and how they were fixed

### Match Draw (session 2)
| Problem | Cause | Fix |
|---|---|---|
| Bash heredocs with quotes/backticks failed on Windows | Git-Bash quoting | Write a Python patch script to a temp file, then run it (pattern used for all big edits) |
| Test GET requests broke | Sending a JSON body with GET | Body only for non-GET in the test helper |
| Timers firing after the test server closed | Reveal timers outliving the server | `stopCupTimers()` on close; `broadcast` returns early without `io` |
| Phone page wider than the screen (524 px) | `.cup-steps` with `margin: auto` + grid min-content | `width: min(100%, 1440px)`, `minmax(0, 1fr)` columns |
| Opening fly-in never played | No memory of the setup → draw transition | `openedAt` ref set in `useCup` when the same cup goes setup → draw |
| Stale HUD after an interrupted show | UI state kept when the run ended early | Reset `ui` when there's no run key |
| 3D looked washed out | Light beams always on + strong bloom | Beams only in the broadcast camera, lower opacity/bloom |
| Impact camera blocked by front crests | Camera inside the formation | Raised impact pose + `clearView/restoreView` hide crests in the way |
| Crests tiny on portrait phones | Landscape spacing | Tighter portrait spacing + camera snap on first sync |
| Vite "Outdated Optimize Dep" in dev | Vite dep pre-bundling after adding three.js | Reload; guard a null holder in `SmashArena` |
| Excel import found no pictures | Absolute relationship targets; openpyxl default XML namespace | `resolve()` rel paths; namespace-aware lookups |
| PDF import missed card titles / wrong order | Narrow search window; column reading order | Wider window; generated names numbered in reading order |
| Show hitched 83 ms / 117 ms at the impacts | Huge glowing text repainted every frame | Overlay text drawn once on its own layer (`will-change`), smaller text-shadow; plus adaptive quality, prewarm compile, no allocations mid-show, pause behind VS |
| `lamejs` crashed ("MPEGMode is not defined") | lamejs 1.2.1 expects globals | Define `MPEGMode`, `Lame`, `BitStream` globals before `require('lamejs')` (`tools/audio/process.mjs`) |
| Audio analysis wrong after `decoder.reset()` | mpg123-decoder misuse | Analysed levels in the browser instead |
| Couldn't download from Pixabay / Drive | They block scripts; the built-in browser pane can't save downloads | Owner's Chrome via Claude in Chrome, with permission; re-find element refs after re-renders |
| Missing sound files "loaded" but didn't play | SPA fallback returned `index.html` with 200 | Exclude `sounds/` (later also `season2/`) from the rewrite; `preload` accepts only audio content types |
| Testing showed old code | Service worker served the previous build | Unregister the SW + clear caches before each browser check |
| Player shown as "C Mehul Jain" | "C" + 12 NBSP in the Excel cell | Strip the stray category letter before collapsing whitespace |
| Production match-draw pages stuck on "Connecting…" | Client deployed before the server (404) | 404 → friendly *Coming soon* |
| Match-draw visitors counted in the auction's viewers | Old server put them in the auction room | Per-room viewer maps (`cup:` rooms) |
| "All 14 matches are set!" stayed on the TV forever | Effect cleanup cancelled the hide timer whenever any new state arrived within 5 s | Moment timers live until they fire; hide via its own effect; champions overlay with a stable `onClose` |
| Old overlays survived a Restart | Moments ignored id changes | New cup id clears all overlays and timers |
| Last match ("fate") skipped its VS / show stalled off screen | Tweens only advance on rendered frames; the loop skips when hidden/off-screen | Every tween also ends by a timer (`ms + 150`) |
| HUD flashed "Waiting for match 3 of 2…" | `nextTie` counts the running match before the director starts | Idle message names `state.current.tie` when a show is running |
| Scary "show still running" error on a quick second Draw tap | Gap between HTTP success and the socket state | Button locked until the show is confirmed (max 4 s) |
| Knockout could be locked with a 3–3 undecided tie | Allowed by design (walkovers) but easy to misclick | Confirm dialog listing undecided ties |
| Rehearsal phones could show old matches on D-day | State cached forever in localStorage | Cache only used if < 10 min old (`cup-state-v2`); old key deleted |
| Browser console full of vibrate warnings | `navigator.vibrate` before any user tap | `buzz()` only when `navigator.userActivation.hasBeenActive` |
| Phone arena toolbar wrapped to 3 lines | Extra Crowd button | Icon-only Music/Crowd under 560 px, tighter padding |
| Team names cut off on crests | Square logos mapped onto circles | Rounded-square plates with 0..1 UVs (`plateGeo`) |
| Fake checkerboard behind 3 logos | AI-generated logos with baked "transparency" | `clean_checker.py` flood fill to white |
| Test SIT-061 failed | It matched the old rewrite text exactly | Rewritten to test behaviour (pages fall back, assets/sounds/logos don't) |
| Local server restarted itself mid-test | `node --watch` + OneDrive / Vercel CLI touching files | Just wait; scripts should retry; production has no watch mode |
| Can't measure frame rate in the built-in browser | Pane hidden → `requestAnimationFrame` stops | Measure with the pane visible or on a real device; screenshots force single frames |
| Python print crashed on "→" | Windows cp1252 console; `-I` ignores `PYTHONIOENCODING` | Write output files with `encoding='utf-8'` |
| Reading the admin session token from a file was blocked by the tool safety layer | Credential handling rules | Scripts that log in themselves (`tools/draw-day/*`) |
| **3D very blurry on the owner's iPhone** (first real-phone test, 2026-11-16) | Phones were capped at 1.3× on 3× screens, edge smoothing was off on phones, and the auto-quality treated a 30 fps cap as overload and dropped to 0.75× | Phones 2× with MSAA, floor 1.3×, step down only under ~24 fps for 2 s; bigger crest name labels |
| Owner wanted "max resolution on every screen" | Renderer still capped (2× phones, 1.75× computers); logos only 320 px | Native `devicePixelRatio` (≤ 3) everywhere; logos regenerated at 640 px from the originals (`process_logos.py … 640`, checkerboards re-cleaned) |
| 3D picture stretched during the full-screen show | The canvas kept the inline size when the arena went full screen (relied only on ResizeObserver) | Explicit `stage.resize()` when theatre mode toggles (`SmashArena.jsx`) |

### Team Auction (session 1, see change log for details)
- Root `npm run dev` didn't work on Windows → `scripts/dev.mjs`.
- CI couldn't be pushed (token without `workflow` scope) → owner re-signed in via browser.
- Guesses vanished when the spin started (component remount) → persisted per tournament.
- Guess rate limit per IP would block a whole venue on one Wi-Fi → per viewer + global cap.
- Tap battle: final tally lost when the spin fired (later the feature was removed).
- Reel/ball stutter → frame loop writing `translate3d` directly (no React renders while spinning), ball as nested glide + parabola on GPU transforms (median frame 16.7 ms).
- Join/pick lag on the free server → optimistic lock-in, memoised board/stage, nickname state moved down.
- Viewer count wrong (tabs/refresh/host counted) → per-browser id, host/TV excluded, ~20 s timeout.
- PDF silently failed after a redeploy (old tab asked for removed chunks, Vercel answered with HTML) → `/assets/*` 404s, app reloads once on `vite:preloadError`.
- Look-alike duplicate names (Unicode) → NFC + invisible-character stripping in `cleanName`.
- CI flake in the viewer-count test → relative counts and waiting for updates; don't pass `--test-timeout` to the whole run (Node 22 applies it per file).
- "Two or more people clicking at once — 30" in the QA report confused the owner (he thought only 30 people could watch) → explained: it was a race-test count, not a capacity limit; capacity tested to 1,000 viewers.

---

## 9. Testing

### Automated (server)
- `npm test` (repo root) → `server`: `node --test --test-concurrency=1 "test/**/*.test.js"` → **1040 tests** (auction unit/API/engine/race/DB/security/SIT suites + `cup.test.js` 13 match-draw tests). Uses isolated databases (`picklepro_qa_*`, `picklepro_test`) on the local MongoDB (`TEST_MONGODB_BASE`/`TEST_MONGODB_URI` to override). Takes a few minutes.
- `cup.test.js` covers: unique pairing over many full draws, weapons not repeating within 3, hidden-until-reveal, setup rules, undo rules, 3–3 outcomes, results validation, standings → QF → SF → Final, kids Final/3rd, host-route auth, a full live flow over the socket with seal verification and isolation from the auction, colours/looks, logo upload/storage/caching, bundled `s:` logos, Restart (keepTeams).
- CI: GitHub Actions on push/PR to `main` (Node 22, MongoDB 8 service, tests + client build).
- Client: no unit tests; `npm run build` must pass.

### Draw-day tools (`tools/draw-day/`, Node, need the server running; `npm install` in `server/` for socket.io-client)
- `rehearsal.mjs <main|kids> [aimMs] [drawonly|continue]` — plays the host for a whole event at real speed with Season 2 teams and checks: logins required, teams/logos saved, draw refused before opening, double tap = exactly one draw, next draw/undo/restart refused during a show, no team visible before its reveal (polls every 150 ms), every pair listed, every seal verifies, undo of match 2 (main), every team exactly once, result validation, all results, seeding, knockout to champion, Restart keeps teams/logos/settings. **Starts a new draw — never run it against production during an event.** Last results: main 14 matches all checks passed (23.6 s/match at 3.5 s), kids passed, both at once passed.
- `crowdload.mjs [phones] [seconds]` — N sockets in the main room during a draw: 300 phones → all connected, every reveal reached every phone 46–155 ms after its reveal time, none early.
- `midshow.mjs draw|watch|restart` — draw, kill and restart the server mid-show, check the match still completes on schedule (passed: server down across the first reveal, back 5 s later, team A visible on return, B on time, seal published; the TV reconnected by itself).
- Env: `PICKLEPRO_API` (default `http://localhost:4000/api`), `PICKLEPRO_SOCKET`, `ADMIN_PASSWORD` (else read from `server/.env`, never printed).

### Browser checks (how they were done)
- Start previews from `.claude/launch.json`: `server` (:4000) and `client-prod` (:4173 = production build via `vite preview`, proxies `/api` and `/socket.io` to :4000). Rebuild (`npm run build` in `client/`) before checking; **unregister the service worker and clear caches** in the page first, or you'll see the old build.
- Audience at `http://localhost:4173/`, TV at `/tv`, host at `/admin` (needs the host password typed by a human, or drive the host with `tools/draw-day/*`).
- Phone layout: 375×812 viewport; TV: 1366×768.
- Frame-rate measurements need a **visible** browser; a hidden pane stops `requestAnimationFrame`.
- Production checks without a browser: `curl` the pages/assets/API; grep the live bundle (`assets/index-*.js`) for expected strings; a one-off socket.io client to `https://picklepro-api.onrender.com` with `auth.module='cup'` should receive `cup:state`.
- Preview URLs need the SP TECH Vercel login; `npx vercel curl <url> --scope sp-tech3 -- -s` fetches them from the CLI.

---

## 10. Running locally (Windows)

Prerequisites (already on the owner's laptop): Node 22.12+ (v24 installed), MongoDB Community 9.0 as the `MongoDB` Windows service, Python 3 with Pillow + PyMuPDF + openpyxl (only for `tools/assets`), `server/.env`:

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Required (local: `mongodb://127.0.0.1:27017/picklepro`) |
| `ADMIN_PASSWORD` | Required — host login |
| `SESSION_SECRET` | Required, ≥ 32 chars (Render generates it in production) |
| `PORT` | Default 4000 |
| `TRUST_PROXY` | Default 1 (Render) |
| `NODE_ENV` | `production` → Secure cookies |
| `VITE_SOCKET_URL` | Client build (Vercel): `https://picklepro-api.onrender.com` |
| `TEST_MONGODB_URI` / `TEST_MONGODB_BASE` | Optional, tests |

```bash
npm run setup:dev     # first time: install server + client dependencies
npm run dev           # server :4000 + client :5173 together (scripts/dev.mjs)
npm test              # 1040 server tests
npm run build         # client production build (client/dist)
```
- Dev: http://localhost:5173 (audience = match draw), `/admin`, `/tv`, `/auction…`; `?draw=kids` for kids.
- Production-like: build, then `vite preview` on :4173 (`client-prod` in `.claude/launch.json`).

---

## 11. Deploying

- **Normal path (owner asks to push):** commit → `git push origin main` → Render rebuilds the server (`render.yaml`: `npm run setup && npm run build`, start `npm start`, health `/api/health`; ~1 min last time) and Vercel rebuilds the client (~1 min). CI runs the tests.
- **Verify after a push:** `curl https://picklepro-api.onrender.com/api/fixtures/state` → 200; `curl https://pickle-pro-peach.vercel.app/` and grep `assets/index-*.js` for a string from your change; `npx vercel ls pickle-pro --scope sp-tech3` shows the production build "Ready".
- **Preview (review without pushing):** from the repo root `npx vercel deploy --yes --scope sp-tech3 --build-env VITE_SOCKET_URL=https://picklepro-api.onrender.com` → `https://pickle-<id>-sp-tech3.vercel.app` (SP TECH login). It talks to the **production** server and data, so server changes don't work on a preview until pushed.
- **Production from the CLI (owner asks, e.g. client-only hotfix):** `npx vercel deploy --prod --yes --scope sp-tech3` (uses the project's env). Note: production then differs from git until a push.
- Delete any `.env.local` that `vercel` creates in the repo root (it holds a token; git-ignored anyway).
- **Order matters:** a client that expects new server routes must not reach production before the server (that's why the match-draw pages show *Coming soon* on a 404).
- Don't deploy or push during an event (a Render redeploy restarts the server).

---

## 12. Event-day checklists

### Match Draw
**Rehearsal (any day before)**
- [ ] `/admin` → log in → Main → **⭐ Load ICC Season 2 teams** → **Save** → set the show (name, suspense, shot, courts) → **Open the arena** → draw a few or all matches with the audience link on 2–3 phones and the TV view open. Try Undo, a phone refresh mid-show, Wi-Fi off/on, the PDF.
- [ ] Same for **Kids** (switch at the top).
- [ ] When happy: **↺ Restart draw** (type RESTART) in Main and in Kids → both back to *Coming up* with the same teams, nothing drawn.

**On the day**
- [ ] 15 min before: open https://picklepro-api.onrender.com/api/health (wakes the free server, first load can take ~1 min), then `/admin` and log in. Open pages keep the server awake.
- [ ] TV: open https://pickle-pro-peach.vercel.app/tv, tap **Tap for sound** and **Full screen** once. Share https://pickle-pro-peach.vercel.app (QR on the TV).
- [ ] No pushes or deploys during the event.
- [ ] **Open the arena** → **Draw match 1 … 14** (wait for each show; the button counts down). Results → **Lock knockout** → knockout results → champions.
- [ ] If the host loses connection the show still runs for everyone; reconnect and continue. A double tap or two host phones can't draw twice.

### Team Auction (if ever run again — use `/auction`, `/auction/admin`, `/auction/tv`)
- [ ] Rehearse: import lists (main: `samples/sample-players.xlsx`; kids 4 per list) → Start → full draw with 2–3 phones; Wi-Fi off/on; refresh host mid-spin; export PDF/Excel → **Start a new tournament** with the real name.
- [ ] On the day: wake the server 15 min before, load the real lists (all counts green), share the `/auction` link, export Excel after each round (Atlas M0 has no backups), PDF + gallery at the end.

### If something goes wrong
- No sound on a phone: **Tap for sound / Tap to resume sound**; check volume (media volume on Android); 🎵/👥 switches only affect that device.
- Vercel down: use https://picklepro-api.onrender.com (+ `/admin`, `/tv`).
- Host login locked after wrong passwords on Vercel (all Vercel visitors share one IP at the server): log in on the Render URL.
- Restart pressed by mistake: in Atlas delete the newest `cups` document for that event → the previous draw is active again (refresh pages).
- Wrong auction pick: **Undo last draw** (current round only).

---

## 13. Current state, what next, limits

**As of 2026-11-16 (night)**
- `main` = `6d12e02` (+ a docs-only commit). Render and Vercel production serve it; verified live: main link = match draw, `/api/fixtures/state` 200 via Vercel, live socket receives `cup:state`, native-resolution 3D + 640 px logos served, auction under `/auction`.
- **Production data right now:** Main = 28 Season 2 teams loaded by the owner, arena open, **1 test match drawn** → press **↺ Restart draw** before the real event. Kids = empty → **Load ICC Season 2 teams → Save** in Kids too.
- Local laptop database has Season 2 teams loaded in Main and Kids (setup) from the rehearsals.
- Tests 1040/1040; production build clean.
- **Sharpness fix** (native resolution on every screen + edge smoothing, no false quality drops, full-screen resize, 640 px logos) built and checked locally (phone view renders 2:1 on a 2× screen, TV view 1:1); needs the owner's iPhone and the real TV to confirm once deployed.
- **Not verified yet:** 3D smoothness and sound on real low-end phones and on the actual TV; the host page visually after the Restart/Draw-button changes (the host page needs a typed password, so only its server side and build were checked); the real event.

**Ideas / next steps (not built)**
- Host "ready check" panel (server awake, sound test), announcer voice (browser TTS or recorded), "You missed: …" catch-up after reconnecting, accessibility pass, configurable team counts for the auction, auction big-screen winner spotlight.
- Possibly undo-Restart from the host page (today: delete the newest `cups` document).

**Known limits**
- Single server instance (locks, rate limits, timers in memory). Render free tier sleeps after 15 idle minutes and has monthly hour limits. Atlas M0 has no automatic backups.
- Auction team counts fixed per event (28 / 4; `EVENTS` in `models.js`); kids format fixed.
- Web vibration doesn't work on iPhones; wake lock can be blocked by low-power mode.
- Vercel previews need the SP TECH login and use production data.

---

## 14. Gotchas and environment tips

- **OneDrive folder:** file events from OneDrive sync, the Vercel CLI or copying files can make the server's `node --watch` restart (seen mid-rehearsal). Wait a few seconds; health check before testing.
- **Line endings:** Git warns "LF will be replaced by CRLF" — harmless. Write files with `newline='\n'` from Python.
- **Shells:** Git Bash and PowerShell 5.1 are both available. Bash heredocs with backticks/quotes are fragile → write Python/Node scripts to a temp file and run them. Python on this machine is a venv (`MLProject`); `python -I` ignores `PYTHONIOENCODING`, so write UTF-8 files explicitly.
- **Service worker** caches the app: after rebuilding, unregister the SW / clear caches in the test browser. Real users get the new version automatically (autoUpdate + one reload on stale chunks).
- **Built-in browser pane hidden** → no animation frames → can't judge smoothness; screenshots still work.
- **`vercel deploy` exit code** may look like a failure if a following command fails; read the JSON (`"readyState": "READY"`).
- **Vercel git auto-deploy** stopped once (2026-10-12) and works again since 2026-11-16 — after a push, confirm with `npx vercel ls pickle-pro --scope sp-tech3`; if no new production build appears, run `npx vercel deploy --prod --yes --scope sp-tech3`.
- **Do not pass `--test-timeout`** to the whole test run (Node 22 applies it per file).
- **Docs-only commits:** put `[skip render]` in the commit message so Render doesn't redeploy (= restart) the server for nothing — useful while the owner is testing or near an event. Vercel still rebuilds the client (harmless).
- **Sites that block scripts** (Pixabay, Google Drive): ask the owner, then use their Chrome (Claude in Chrome).
- **Credentials:** never echo `ADMIN_PASSWORD`/session tokens; the tool safety layer blocks reading saved tokens — use scripts that log in themselves.
- **`core.js` is imported by the server** via a relative path into `client/src/cup/` — keep it free of browser-only APIs and imports.
- **Adding a new static folder** under `client/public/`: add it to the SPA-fallback exclusion in `client/vercel.json` and to SIT-061.
- **Big lazy chunks** (`stage3d-*`, `pdf-*`, `pdf.worker*`, `importTeams-*`) are excluded from the PWA precache in `client/vite.config.js` — keep new heavy chunks out too.

---

## 15. Change log

Newest first. Add an entry for every change.

### 2026-11-16 (night) — Sharp 3D on phones, native resolution everywhere; complete handover; tools in the repo
- **Native resolution on every screen** (owner: "resolution at 2040P on every screen"): the 3D renders at each screen's full pixel density (`devicePixelRatio` up to 3 — a 4K TV gets 4K, an iPhone its Retina resolution); logos regenerated at **640 px** (from ~1254 px originals; 3.0 MB total, not pre-cached), `m01/m18/m23` checkerboards re-cleaned; `tools/assets/process_logos.py` takes the size (default 640).
- **3D blurry on phones** (owner's iPhone screenshot): phones were capped at 1.3× on 3× screens, edge smoothing was off on phones, and the auto-quality treated a 30 fps cap (Low Power Mode / WhatsApp browser) as overload and fell to 0.75×. Now `stage3d.js`: MSAA always on; phones 2× → 1.6× → 1.3× (floor), computers 1.75× + bloom → 1.5× → 1.25× → 1×; step down only when frames average > 42 ms for 2 s; crest name labels 15 % larger. `SmashArena.jsx`: explicit `stage.resize()` when the full-screen show starts/ends (the picture was a stretched copy of the inline size). Checked locally at 375×812: buffer exactly 2× inline and full screen, names readable.
- **HANDOVER.md rewritten** as a complete handover for a new developer/Claude account: start-here, project, the owner's working rules, links/accounts, architecture + file map + data + API, both modules in depth, every decision with its reason, every problem hit and its fix, testing, running, deploying, event-day checklists, current state, gotchas; change log kept in full.
- **`tools/`** added: `draw-day/` (rehearsal, crowd load, mid-show restart — portable paths, `PICKLEPRO_API` / `PICKLEPRO_SOCKET` / `ADMIN_PASSWORD` env), `assets/` (Season 2 data, logo processing/colours, checkerboard cleaner), `audio/` (sound processing). Re-run once from the repo: kids rehearsal all checks passed.
- Preview https://pickle-2d2nxunwe-sp-tech3.vercel.app; then **pushed (`6d12e02`)** at the owner's request — live on production ~20 s later (verified: native-resolution 3D chunk served, `m01.webp` = 640 px version, server healthy).

### 2026-11-16 — Main link = match draw; auction moved to /auction
- `client/src/main.jsx`: `/` → match-draw audience, `/admin` → match-draw host, `/tv` (`/screen`) → match-draw TV; `/auction`, `/auction/admin`, `/auction/tv` → team auction; old `/fixtures…` and `/kids…` links still work.
- Audience pages no longer show the module bar (the main link is only the match draw); host pages keep **Match Draw | Team Auction** (`ModuleNav.jsx`). Match-draw TV QR = the main link; auction TV QR + label = `/auction`. Host buttons (Audience view / TV view) follow the new paths.
- SIT-061 checks the new paths. Preview https://pickle-ppovj6s3o-sp-tech3.vercel.app; then pushed (`de0c227`) — Render + Vercel production deployed from `main`.

### 2026-11-16 — Demo removed, host Restart, calmer crowd, clearer logos, draw-day hardening
- **Demo mode removed** (`client/src/cup/demo.js` deleted; no `?demo=1`; leftovers in browsers are cleaned on load).
- **↺ Restart draw** on the host page (Tools): `POST /new { keepTeams: true }` starts a fresh draw with the same teams, logos and settings; refused during a show; host types RESTART. *Start a new match draw* (empty) now needs NEW typed. Test added (`cup.test.js`, 13/13).
- **Calmer crowd** (`sfx.js`): no constant crowd bed — a soft murmur only during the hunt; short, quieter cheers; no cheer on the VS slam; **👥 Crowd on/off** next to **🎵 Music** (per device).
- **Clearer logos**: crests and emblems show the whole square logo on a rounded plate with a light frame (a circle cut off the team names), crests lean towards the camera, logos kept under the bloom threshold, higher texture filtering; 2D logos rounded squares too; checkerboard backgrounds cleaned in `m01`, `m18`, `m23`.
- **Bugs found by the draw-day rehearsal, fixed:**
  - *"All N matches are set!" could stay on screen forever* (TV!) when any update arrived within 5 s of it (a result, a reconnect) — its hide timer was cancelled. Moment timers now live until they fire (`Moments.jsx`); the champions overlay no longer restarts its timers on every update.
  - *Overlays from the previous draw survived a Restart* — a new draw id now clears every overlay.
  - *The show could stall or skip its VS card* when frames stop (arena scrolled off screen, background tab, throttled phone): every 3D tween now also finishes by the clock (`stage3d.js`), so screens keep the server's schedule.
  - HUD flashed "Waiting for match 3 of 2…" for an instant as a match started — it now names the running match.
  - Host: the Draw button stays locked from "accepted" until the live state shows the show (no scary "still running" error on a quick second tap); locking the knockout with undecided league matches (a 3–3 needing a decider) asks first.
  - Phones: 🎵 / 👥 switches are icon-only under 560 px so the arena bar fits one row.
  - A phone that watched a rehearsal no longer shows those old matches on the day: the remembered state (`cup-state-v2`) is only used if under 10 minutes old.
  - While the free server wakes up, pages say so after 5 s ("Waking up the server — the first visit can take up to a minute") instead of looking stuck.
  - Reveal buzz only after the viewer has tapped (no browser warnings).
- `client/vercel.json`: `/season2/*` excluded from the SPA fallback (a missing logo is a 404, not HTML). Outdated config test SIT-061 rewritten to check behaviour.
- Preview https://pickle-iq56c01hx-sp-tech3.vercel.app; **production deployed** (`pickle-de9nz1s2o` → https://pickle-pro-peach.vercel.app). Server (Render) unchanged until the push to `main`.

### 2026-11-15 — Organisers' final teams + logos, host-only draw, TV view, module nav
- `client/src/cup/season2.json` (28 + 4 teams from the updated Excel with replacements; ages/phones/payments ignored) and `client/public/season2/logos/*.webp` (32 team logos from the organisers' Drive + ICC shield). `core.js`: a logo may be `s:<file>` (bundled) besides an uploaded hash; `looks.jsx` maps it to `/season2/logos/<file>`. Host: **⭐ Load ICC Season 2 teams**. Demo uses the real teams (demo data version 3).
- Audience never gets draw controls: `DemoBar` (demo helpers) moved to the host page; audience demo shows a note + *Open host view*.
- "Big screen"/projector renamed **TV view**; routes `/tv` and `/fixtures/tv` (old `/screen` paths still work).
- New `client/src/ModuleNav.jsx`: **Team Auction | Match Draw** bar on top of the auction and match-draw audience + host pages (replaces the auction host's "Match draw" button).
- Preview https://pickle-7z4re3be0-sp-tech3.vercel.app; production not updated.

### 2026-11-14 — Production deploy: smoother 3D + real sounds
- Owner approved: `npx vercel deploy --prod --yes --scope sp-tech3` → https://pickle-pro-peach.vercel.app (deployment `pickle-ikvg63b2k`). Verified live (auction unchanged, match-draw coming-soon, demo 3D + sounds). Server (Render) unchanged until the push.

### 2026-11-14 — Smoother 3D + real stadium sounds (preview)
- Lag fixes in `stage3d.js` / `SmashArena.jsx` / `cup.css` (adaptive quality, pre-compiled effects, no allocations mid-show, pause behind VS / off-screen, layered overlay text, fewer re-renders). Measured before: two hitches of 83 ms and 117 ms at the impacts — caused by repainting glowing text; fixed with own layers.
- Real sounds: `client/public/sounds/` (17 Mixkit files, 1.2 MB) + `client/src/cup/sfx.js` (crowd bed, music with ducking, one-shots per moment, synthesized fallback); `sound.js` exports `audioContext`, `playable`, `trackSound`. 🎵 Music toggle on the arena (audience, big screen) and the host draw desk. `client/vercel.json`: `/sounds/*` no longer falls back to the app page.
- Then added the 4 Pixabay files (pop, dhol-hit, music, dhols); preview https://pickle-n8luwth7g-sp-tech3.vercel.app. Production not updated.

### 2026-11-14 — Client deployed to Vercel production (server pending)
- On the owner's request: `npx vercel deploy --prod --yes --scope sp-tech3` → https://pickle-pro-peach.vercel.app (deployment `pickle-ahkbxsvjr`). Not committed/pushed (owner does git).
- Added a graceful fallback for that gap: if `/api/fixtures/state` answers 404 (server not updated), the match-draw pages show "Coming soon" (+ demo button; host page explains the server update) instead of "Connecting…" forever.
- Verified on production: auction home unchanged and live; `/fixtures` shows Coming soon; `/fixtures?demo=1` loads the 3D arena (no app errors; the only 404s are the expected match-draw API calls).
- `.claude/launch.json`: new `client-prod` entry (vite preview of the production build on :4173) for local checks.

### 2026-11-14 — Smash Arena 3D, team logos & colours, Excel/Word import
- **Show:** the match draw is now a 3D stadium (three.js 0.186.1): crests per team (colour + logo + name), spotlight hunt, lock-on, paddle-cam slow-motion smash, chase camera, shatter, logo rise, logos collide → VS. Six pickleball shots (fireball, thunder, laser, rocket, sky lob, banana curve) + "last two standing". Timing: strike 3.8 s, VS 7.8 s, fate 2.6 s (`TIMING` in `core.js`, shared with the server). 2D arena kept as fallback (no WebGL / GPU loss / `?2d=1`).
- **Team looks:** each team has `color` (default palette, or the logo's main colour) and `logo` (content hash). New `cuplogos` collection; routes `PUT /logos`, `PATCH /looks`, public cached `GET /logo/:hash`. Logos/colours can change any time; names/players lock when the arena opens. Logos shown on VS, tie cards, bracket, team cards, champions. Generated badges for teams without a logo.
- **Import:** `importTeams.js` reads PDF / .xlsx / .docx / CSV / text incl. embedded logos (row/card matching); bulk "Upload logos" by file name; host editor has logo + colour columns. `fflate` 0.8.3 added (unzip). Import and 3D code are lazy chunks, excluded from the phone precache.
- **Demo:** 28 placeholder team names (Smash Titans, Dink Dynasty, …) + 4 kids teams with generated badges.
- **Preview:** https://pickle-98th39ecp-sp-tech3.vercel.app/fixtures?demo=1 (host: `/fixtures/admin?demo=1`, big screen: `/fixtures/screen?demo=1`; SP TECH Vercel login).
- **Tests:** `cup.test.js` now 11 (new: team colours/looks rules; logo upload → stored once, PNG/JPEG/WebP only, cached serving, auth). Full suite 1,038/1,038.

### 2026-11-14 — New module: Match draw (fixtures) with the arena show
- **What:** separate module at `/fixtures` (+ `/fixtures/admin`, `/fixtures/screen`, Main/Kids switch): upload the final-teams PDF → draw every match live with an animated arena show (6 weapons + "last two standing", crosshair hunt, strikes, VERSUS splash with the six games A/B C/D A/C B/D A/D B/C and real names) → results per game → standings → knockout (main: QF 1v8 2v7 3v6 4v5 → SF → Final; kids: Final 1v2 + 3rd place 3v4) → champions screen. Fixtures PDF export. `?demo=1` runs it all in the browser with sample teams.
- **Server:** `server/src/fixtures.js` (routes `/api/fixtures`, `/api/kids/fixtures`; secure picks; SHA-256 seal; reveal timers rescheduled on boot), `Cup` model, sockets with `auth.module = 'cup'` join `cup:<event>`; viewer counts and reactions now per room (auction rooms unchanged). Shared rules in `client/src/cup/core.js`.
- **Client:** `client/src/cup/*` (pages, arena, canvas effects, VS, moments, boards, PDF import via `pdfjs-dist` 4.10.38 — host only, excluded from PWA precache), new sounds in `sound.js` (riser, slam, heartbeat, lock-on, whoosh, thunk, twang, thunder, boom, launch, fall, ricochet, zap, versus, arena open). Small shared changes: `Header` takes a `kicker`, `Login` exported with a title, auction host header has a **Match draw** link, routes in `main.jsx`.
- **Tests:** new `server/test/cup.test.js` (9 tests: unique pairing over 30 full draws, weapons never repeat within 3, hidden-until-reveal, undo rules, outcome/3–3 decider, results validation, standings → QF → SF → Final and downstream protection, kids final/3rd place, host-route auth, full live flow over the socket with seal verification and auction isolation).

### 2026-10-13 — PDF shows age + tap-to-call number per player; contacts tool
- PDF: under each name, Age and the phone number as a tel: link (+91 added to 10-digit numbers). Data comes from /admin (host only) as details; public state never has it.
- Admin card "Ages & phone numbers (PDF)": fix one player's age/number, or reload ages/numbers from the organisers' Excel files, at any time (even after the draw). New host route PUT /players/details; it never changes lists or teams.

### 2026-10-13 — PDF report redesigned as team cards
- PDF = the organiser's requested format: navy team cards (team number, then A/B/C/D + player), same look as the app board. Main: 3 cards across, 2 pages for 28 teams; kids: 2 across, 1 page. Only client/src/report.js changed. Samples in marketing/.

### 2026-10-13 — Organisers' auction spreadsheets: import + export; A-D on buttons too
- Import reads the organisers' row format (Category | group | Name | AGE | CONTACT NUMBER, blocks side by side): main codes A, B, C, W1 (or D) and kids B1, G1, B2, G2. The four real files (MEN A B C, WOMEN, Boys, Girls) import as 28/28/28/28 and 4/4/4/4. Importing several files adds to the lists. Age and contact are saved with each player (kept across later list edits) and appear only in the host Excel export, never in public state.
- Export adds a Players sheet in the same layout plus TEAM.
- Category buttons now show A, B, C, D as well (no M1/W1/B1 names anywhere in the UI).

### 2026-10-13 — Letters A–D everywhere, group names only on the category buttons
- Everywhere (team cards, stage, Know your team, PDF, Excel, messages) shows A, B, C, D. Main: A=M1, B=M2, C=M3, D=W1 (key WOMEN); kids: A=B1, B=G1, C=B2, D=G2. Only the category buttons at the top (phones, admin, projector) show M1/M2/M3/W1 or B1/G1/B2/G2 (chip field). Host setup lists read "D (W1)" etc.
- Excel headers A B C D are read per event (main D = women, kids A = B1 ...); M1/W1/B1/G1 headers still work.

### 2026-10-12 — Category names M1/M2/M3/W1 and B1/G1/B2/G2, no captain, PDF fix
- Display names everywhere (chips, cards, stage, PDF, Excel, errors): main A=M1, B=M2, C=M3, WOMEN=W1 (D=M4); kids ICON=B1, GIRL1=G1, BOY=B2, GIRL2=G2. Database keys unchanged. New main tournaments default to M1, M2, M3, W1 order (host can still reorder in Setup).
- Excel import accepts M1 M2 M3 W1 / B1 G1 B2 G2 headers (old headers still work).
- Captain line removed from the stage and big screen.
- PDF: a tab opened before a redeploy asked for removed file names; Vercel answered with the page, so the PDF silently failed. Now /assets/* 404s, the app reloads itself once on such errors, and the PDF button shows a refresh message if it still fails.

### 2026-10-12 — Free-tier hardening for ~800 phones
- New socket connections get the cached public state (no DB read per phone joining).
- Reactions relayed at most 4 per 500 ms per event (taps x phones no longer floods the server).
- Phones connect over WebSocket first (polling only as fallback), halving connection work.

### 2026-10-12 — Instant prediction picks, brighter credit with Contact chip
- Predict: tapping a name locks it in on screen immediately; the save runs in the background and is rolled back with a message only if the server refuses (was a 1–3 s spinner on the free server).
- Top credit at full brightness on a subtle band; a "Contact" chip opens the Sidh / Pinkesh tap-to-call buttons; WhatsApp icon beside it.

### 2026-10-12 — Kids split categories, real slot sound, quieter branding
- Kids draw now has four separate lists drawn in this order: Boy Cat 1 (Icon, shuffled) → Girl Cat 1 → Boy Cat 2 → Girl Cat 2, 4 names each (was one shared Girls list of 8). Keys stay ICON / GIRL1 / BOY / GIRL2; a kids tournament still in DRAFT is switched to the new order automatically. Import headers: "Boy Cat 1", "Girl Cat 1", "Boy Cat 2", "Girl Cat 2" (old "Icon Boy" / "Boy" still work). Card codes B1 G1 B2 G2.
- Slot sound: the reel no longer uses filtered noise (the "shh" hiss). Each symbol box passing the window is a pitched mechanical knock (max 16/s), lever is a ratchet, softer motor hum; bells and coins unchanged.
- Branding: top strip is one quiet line "Powered by SP Tech" + small WhatsApp icon (tap the credit to show the call buttons); footer is a compact two-line credit. ICC logo bigger (88 / 112 / 72 px).

### 2026-10-12 — QA: 1,009 automated scenarios, fixes, load testing (branch `qa-suite`)
- New suites in `server/test/qa/` (unit 139, API 346, draw engine 259, race 30, DB 45, security 89, SIT 78) + original 23 = 1,009, all passing; `npm test` now runs only `test/**/*.test.js`. Docs: `TEST_PLAN.md`, `TEST_CASES.md` (generated from the real run), `TEST_RESULTS.md`.
- Fixes: Unicode-NFC + invisible-character stripping in `cleanName` (look-alike duplicate names), per-route host auth (unknown API paths now 404), text-only prediction nicknames/names, cached `GET /state` (≈5.5× throughput) and per-change leaderboard cache, client badge polling 60 s when visible + leaderboard fetch jitter.
- Local performance: 1,000 simultaneous viewers, reveal to all in < 200 ms p95, 0 missed; spike 500 phones in 1.8 s; soak flat. Not yet deployed.

### 2026-10-12 — HANDOVER rewritten
- Sections 1–7 rewritten to describe the app as it is now (two auction modes behind one link, mechanical sound, Know your team, leaderboard box, viewer rule, per-mode exports, event-aware architecture, API, checklist, current state). Change log kept below.

### 2026-10-12 — One link for both draws
- `client/src/DrawSwitch.jsx`: Main draw / Kids draw tabs (with LIVE / Done badges from each draw's status) on the audience and host pages. Switching swaps the page **in place without a reload** (`setEvent` in `client/src/event.js`; `App` remounts the page keyed by the mode, opening a new live connection for that draw), so sound that is on stays on in either mode; URL gets `?draw=kids` (refresh/back button keep the mode).
- Verified locally: sound stays on across a switch and the kids spin plays the slot sound start→finish; host Spin button works in kids mode; PDF (Team | Icon Boy | Boy | Girl 1 | Girl 2), gallery and Excel (`/api/kids/export.xlsx`) use the kids data; main draw untouched. Resume-sound prompt moved to the bottom (above the reaction bar).

### 2026-10-12 — Kids event, mechanical slot sound, Know your team, leaderboard box, resume sound
- **Kids event** (`EVENTS` in `server/src/models.js`): tournaments carry `event` ('main' default, so existing data is main); every engine function takes the event; routes mounted twice (`/api/kids`, `/api`); sockets join `event:<name>` rooms (state, spins, reactions, viewer counts per event). Kids format fixed: 4 teams, rounds ICON (shuffle) / BOY / GIRL1 / GIRL2; GIRL1+GIRL2 share the GIRL list (`poolOf`), which must hold 8 before Girl 1 and is locked once Girl 1 starts; Girl 2 uses what is left. Generalised: shuffle rounds (`SHUFFLE` = A, ICON), per-round `needed`, `ready`, `short` codes (IB, B, G1, G2). Excel import headers "Icon Boy", "Boy(s)", "Girl(s)"; export uses labels. Client: `client/src/event.js` (EVENT/BASE/API, per-event storage keys); host page reads categories/lists from the server; fixed-format card for kids. New test: full kids draw + isolation from the main event (23/23).
- **Sound**: arcade melody and beeping lever removed → pure mechanical slot (lever spring + gear catch, motor hum, reel mechanism whirr that slows into clacks, mechanical near-miss shudder, thunk + bell + coins).
- **Resume sound**: on returning to the app, audio resume is attempted; if the browser needs a tap, a floating "🔈 Tap to resume sound" appears (audience, projector, host).
- **Know your team** (renamed): team shown as a chain of seats (filled = player initials, empty = 🔔 "Arriving soon", current = 🎰 "Being drawn now"), plus a "Team alert is on" message: everyone following that team gets a buzz + pop-up when a new teammate is drawn. Board tag "⭐ Know your team".
- **Leaderboard** in Predict: always-visible box, top 3 shown, "You: #N", "See full leaderboard (N players)"; empty state explains scoring.
- **Header**: "👀 N watching" now sits under LIVE (no longer collides with the title).

### 2026-10-12 — Feedback fixes (branch `feedback-fixes`, preview first)
- **Sound** rebuilt (`client/src/sound.js`; `fx.js` now = confetti + re-export): one master gain + compressor; mute cancels every scheduled timer and long-running sound instantly; unlock inside the tap (silent buffer + `resume()`), `navigator.audioSession.type = 'playback'` so the iPhone silent switch doesn't mute it; honest toggle states (`on` / `off` / `locked` = "Tap to resume sound" after a refresh, resumed by the next tap anywhere); listens to context state changes. Diagnostics: `activeSounds()`.
- **Draw audio**: removed the per-name "tik" and the 1.4 s pock loop. New primary **casino slot-machine** sound modelled on the owner's reference (classic slot SFX), all original synthesis: **lever pull** (ratchet + clunk) → fast square-wave "bleep-bloop" arpeggio melody (look-ahead scheduled on the audio clock) over a soft mechanical reel rattle, both slowing with the reel; reel positions "clack" in the crawl → **near-miss** two-note slide → heavy reel **thunk**, ringing two-tone **jackpot bells** and a **coin cascade**. Paddle "pock" only on real paddle hits (`animationiteration`), soft, throttled. Crowd murmur and drumroll quieter.
- **Reel**: 13 rows/s; longer ease-out (3–5.2 s) ending in a deliberate near-miss on **every** one-by-one spin (`stall` one name short then slide on, or `overshoot` just past then settle back; chosen from the draw id so all screens match). Always ends on the server's winner (verified in the browser on 6 spins).
- **Viewer count** fixed (see counting rule above); new test covers 3 people, second tab, host/projector excluded, leave, refresh, close-one-tab, reconnect.
- **Branding**: ICC logo 68 px (84 px ≥ 760 px wide); slim top strip with tap-to-call Sidh/Pinkesh + compact WhatsApp pill (two rows on phones, one on desktop); footer keeps credit, tagline, contact cards, compact WhatsApp pill; one shared contact list.
- Tests 22/22, build OK, no console errors. Server part (viewer count) goes live only when merged to `main`.

### 2026-10-11 — CI fix (`8f5c151`)
- CI failed on `92d41c3` (all tests pass locally on Node 22 and 24); the timing-sensitive viewer-count test was made relative to the starting count and waits for updates instead of fixed sleeps. CI green again. (Note: don't pass `--test-timeout` to the whole run — in Node 22 it also limits the whole test file, which takes ~30 s.)

### 2026-10-11 — Audience polish: branding layout, smooth rally, tap game removed, prediction switch, faster taps
- **Branding**: tagline + WhatsApp moved into the top strip next to the SP Tech credit; developer credit + contact cards moved to the very bottom under all teams; contacts no longer duplicated; WhatsApp message updated; aria-labels, hover/pressed/focus states.
- **Smooth animation** (root causes fixed): the rally ball was one 5-stop keyframe path with per-segment easing (it decelerated at every corner) → now nested horizontal glide + vertical arc (parabola) on GPU transforms in its own strip above the reel; the reel re-rendered React every frame and blurred the names → now a frame loop writing `translate3d` and row text directly (no React renders while spinning), no blur; paddle swings (2.8 s) and pock sound (1.4 s) synced to the ball; removed paddle drop-shadow filter during the swing. Measured locally: median frame 16.7 ms, p95 16.8 ms, ball ≤ 7 px/frame, never over the names.
- **Removed** the tap battle / crowd spin entirely (UI, admin settings, socket `tap`, `TapScore`, `/api/tappers`, CSS, tests).
- **Prediction switch** on `/admin` (server-enforced, persisted, live-synced, records kept) + new test.
- **Join / pick lag**: nickname state moved inside the prediction card (Join no longer re-renders stage + 28 team cards; 28 ms locally), `Board` and `Stage` memoised, stable search Set, per-name "saving" spinner on the next frame, double-tap guard, "✓ Locked in" only after server confirmation, instant pressed states, `touch-action: manipulation`.
- Tests 22/22. Browser-verified locally (phone + desktop).

### 2026-10-11 — Viewer count, latest-picks ticker, sticky now-drawing bar
- Server: `recent` (last 5 non-A revealed picks) in public state; `viewers` count broadcast. New test (ticker order/exclusion, viewer count up and down) — 22/22.
- Client: `NowBar.jsx` (Ticker + NowBar), header viewer pill. Browser-verified locally on a phone viewport.

### 2026-10-09 — Follow your team, team search, keep awake, reveal buzz
- New `client/src/Follow.jsx`: follow-your-team card + toasts, team search, `useWakeLock`; `Board` takes `mine` / `matches`; reveal vibration in `Stage`.
- Browser-verified locally (phone viewport): follow by lowercase name, ⭐ tag on board, teammate-joined toast only after the reel landed, both vibrations, search highlight + jump, no console errors.

### 2026-10-09 — SP Tech card moved up, wording, name fix, seal hidden from audience
- SP Tech card now sits right below the games (above "All teams") with the WhatsApp button first: "For IT projects, reach us on WhatsApp" (prefilled IT-project message to Sidh).
- Name corrected to **Pinkesh Valdria**.
- "🔒 sealed / ✅ Verified fair" removed from audience phones and `/screen`; still on `/admin` (`Stage showSeal`). Fairness data still in Excel.

### 2026-10-09 — Professional audience page, tap battle, pending-player predictions
- Audience page redesigned: SP Tech credit strip + footer (`Brand.jsx`) with tap-to-call contacts and WhatsApp → Sidh (wa.me/919067127688); play-along cards (`panel-card`), "All teams" section; shared nickname (`useIdentity`).
- Tap battle: removed the 15-taps-per-round cap; taps now carry the player's nickname; round top-3 live (`crowd:taps.top`), tournament **Top tappers** leaderboard (`/api/tappers`, `TapScore`); human-speed limit 12/sec. Fixed: the final tally was lost when the spin fired.
- Predictions: dropdown replaced by a **Predict Team N** button opening the **Pending in <category>** list of tap-to-pick buttons with search.
- Tests 21/21 (crowd test rewritten for the tap game: one player can fill the meter, named vs anonymous taps, round leader, tournament leaderboard + rank, rate limit). Browser-verified locally on a phone viewport.

### 2026-10-09 — Audience round: reactions, predictions, crowd spin, stadium sounds
- **Sounds** (`fx.js`, all synthesized): crowd swell during the spin, cheer on reveal, rally that speeds up into a smash on the slow-down, per-category walk-out jingle, drumroll when ≤ 3 names remain, crowd "OHHH" on near-miss, referee whistle + trophy fanfare on Finalize, soft pop per reaction.
- **Live reactions** relayed to every phone and the projector (`server/src/crowd.js`, `Audience.jsx`).
- **Predict the pick** + leaderboard (`POST /api/guess`, `GET /api/leaderboard`, `Guess` model); guesses saved on the phone so they survive re-renders/refresh.
- **Crowd spin** host switch + target; taps start the next draw via the guarded `draw()`.
- **Near-miss tease** (deterministic per draw), **name fly-by** in the countdown, **Captain** line, **Team complete** card, **round / trophy announcements**, **teams gallery PNG** (download only, no WhatsApp).
- Fixed during testing: guesses vanished when the spin started (component remount) → persisted per tournament; guess rate limit was per IP (would block a whole venue on one Wi-Fi) → per viewer + global cap; leaderboard wording when nobody has scored.
- Tests 21/21 (new: reaction whitelist + rate limit, crowd spin off-by-default / exactly one draw / per-phone cap, predictions open/closed rules + scoring only after reveal + private voter ids). Browser-verified locally: walk-out, countdown + fly-by, trophy, deal, reactions from a second phone floating on this phone, crowd taps starting a spin, prediction ✅/❌, captain, team-complete card, gallery image; no console errors.
- Pushed as `78a062a`; CI green; live on Render + Vercel.

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
