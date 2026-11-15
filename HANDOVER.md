# PicklePro — Handover

Live team-draw ("auction") app for the **ICC Pickleball** tournaments, built & developed by **SP Tech**. The host runs the draw on one device; everyone else watches the same spin live on their phones (and optionally a projector). One app runs **two auction modes**:

| Mode | Teams | Rounds (in order) | Each team gets |
|---|---|---|---|
| **Main draw** | 28 | A (shuffled in one go) → Women → B → C (D optional; any order) | one player per category |
| **Kids draw** | 4 | Icon Boy (shuffled in one go) → Boy → Girl 1 → Girl 2 | 1 Icon Boy + 1 Boy + 2 Girls |

A second, **separate module — the Match draw** (`/fixtures`) — decides who plays whom after the auction: the host uploads the final-teams PDF, every match is drawn live with an animated "arena" show on every phone, then results, standings, quarter-finals, semis and the final follow live. See [section 2b](#2b-match-draw-fixtures-module).

> Keep this file current. Every change to the app gets an entry in the [Change log](#change-log) at the bottom.

---

## 1. Links

| Who | Link | Notes |
|---|---|---|
**Since 2026-11-16 the main link is the MATCH DRAW** (the team auction is finished and moved to `/auction`). Old `/fixtures…` links still open the match draw.

| Who | Link | Notes |
|---|---|---|
| **Everyone (phones) — match draw** | https://pickle-pro-peach.vercel.app | Live match draw, fixtures, results, knockout. **Main / Kids** switch at the top (`?draw=kids`). Only the match draw — no module bar for the audience. |
| **Host — match draw** | https://pickle-pro-peach.vercel.app/admin | Log in (same password). Load teams, draw matches, results, knockout, ↺ Restart. Host pages have the **Match Draw \| Team Auction** bar. |
| **TV — match draw** | https://pickle-pro-peach.vercel.app/tv (old `/screen`) | Arena full screen + QR (the main link) + matches list. |
| Team auction — everyone | https://pickle-pro-peach.vercel.app/auction | The finished auction (teams, history). Main / Kids switch at the top. |
| Team auction — host | https://pickle-pro-peach.vercel.app/auction/admin | Shuffle / Spin / Finalize, PDF / Excel / gallery. |
| Team auction — TV | https://pickle-pro-peach.vercel.app/auction/tv | Big-screen view with QR (`/auction`). |
| Backup (full app) | https://picklepro-api.onrender.com (+ `/admin`) | Use if Vercel is down. |
| Health check | https://picklepro-api.onrender.com/api/health | `{"ok":true,"db":"up"}` = server + database fine. |
| Repository | https://github.com/sidhjain31/PicklePro | Push to `main` deploys everything. |

- The switch changes mode **in place, without reloading** (so sound stays on) and adds `?draw=kids` to the URL — a refresh or a shared link opens the same mode. Older links `/kids`, `/kids/admin`, `/kids/screen` still work.
- **Host password:** the `ADMIN_PASSWORD` environment variable in Render (dashboard → `picklepro-api` → Environment). One login works for both modes. Local development uses `server/.env`.
- **Contacts shown in the app** (top strip + footer, from one list in `client/src/Brand.jsx`): Sidh Jain 90671 27688, Pinkesh Valdria 96536 72196; WhatsApp enquiries → Sidh (`wa.me/919067127688`, prefilled "Hi SP Tech, I would like to enquire about your website and application development services.").

---

## 2. How the draw works (both modes)

- **Server-authoritative.** Every random pick is made on the server with Node's `crypto.randomInt` (Fisher–Yates for shuffle rounds) — the operating system's cryptographically secure generator with unbiased ranges. Browsers only animate the result.
- **Shuffle rounds** (A in the main draw, Icon Boy for kids) place the whole list onto every team in one action. The players of the first shuffle round are shown as each team's **🏓 Captain**.
- **Every other round** draws **one player per spin** for the next team: Team 1, Team 2, … in order.
- A round must be **Finalized** (every team filled) before the next starts. Finalized rounds never change.
- **Undo** removes only the latest spin in the current round; it stays in the history as *Undone*.
- **Each pick is saved before it is shown**, hidden from every screen (and from `/api/state`) until the spin ends, and survives refresh / reconnect / server restart (pending reveals are rescheduled on boot).
- **No double draws:** one action at a time on the server, stale/double clicks rejected (the client must name the team it thinks is next), and unique database indexes as the last guard.
- **Lists:** no name may appear twice anywhere in a tournament (case/spaces ignored). A list must hold exactly the players its rounds will place before its first draw (main: 28 per category; kids: Icon Boy 4, Boy 4, **Girls 8** — Girl 1 and Girl 2 both draw from the one Girls list; Girl 2 uses the 4 left after Girl 1). A list can be edited until its first round starts.
- **Provably fair (commit–reveal):** when a spin starts the server publishes `commitment = SHA-256("PicklePro|v1|actionId|category|team=name;…|key")` with a fresh 256-bit secret key, revealed only after the spin. The **host page** recomputes it and shows ✅ Verified fair (audience and projector don't show the seal — owner's choice). Commitment + key for every pick are in the Excel *Draw History*.
- **Separate events.** The main and kids draws have separate tournaments, player lists, predictions, leaderboards, viewer counts and live (Socket.IO) rooms. Both can run at the same time; neither can see or affect the other.

### What the audience sees during a draw
1. **Round walk-out**: "NEXT ROUND · Girl 1 · One spin per team" card + that round's jingle.
2. **Countdown** 3 → 2 → 1 → GO! while the remaining names fly by (skipped if spin length < 4 s or the screen joined mid-spin).
3. **Slot machine**: two pickleball paddles, a rally ball in its own strip above the reel (smooth parabola on GPU transforms), names scrolling at 13 per second.
4. **Slow-down + near-miss** on every one-by-one spin: the reel either stalls one name short then slides on, or slips just past then settles back (chosen from the draw id so every screen matches). It always ends on the server's pick.
5. **Winner card** ("SMASH!", confetti, bell). Shuffle rounds deal one card per team instead.
6. **Captain** line, and on the last round a **Team complete** card with the whole team.
7. **Trophy moment** on Finalize ("Girl 1 locked in! 🏆").
8. The team board updates; a cell still landing on that phone shows `???` (no spoilers anywhere: board, ticker, now-bar, follow card).

### Sound (all synthesized in `client/src/sound.js`, no audio files)
- **Pure mechanical slot machine:** lever spring + gear catch → motor hum and reel mechanism whirr that slows into distinct clacks → mechanical near-miss shudder → heavy thunk, ringing bell, coin cascade. Plus a soft paddle "pock" only when the ball reaches a paddle, a quiet crowd murmur, a drumroll for the last ≤ 3 names, round jingles, whistle + trophy on Finalize.
- **Tap for sound** (browser rule). Audio is unlocked inside the tap (incl. iPhone silent-switch handling). All sound goes through one master volume: **mute stops everything instantly**, including scheduled notes.
- **Resume:** after a refresh or coming back from another app, if the phone paused audio a **"🔈 Tap to resume sound"** button appears (bottom of the screen); one tap restores it. Switching Main/Kids does **not** pause sound (no reload).

### Audience page (top to bottom)
1. Header: big ICC logo, tournament name, LIVE, and "👀 N watching" under LIVE.
2. Slim SP Tech strip: tap-to-call **Sidh** and **Pinkesh**, "By SP Tech", compact green **WhatsApp us** pill.
3. **Main draw | Kids draw** switch (LIVE / Done badges).
4. Round steps → stage (team, captain, reel, result) → **latest picks ticker** (last 5).
5. **⭐ Know your team** — type your name; your team appears as a chain of seats (filled = player, 🎰 = being drawn now, 🔔 = arriving soon) with the **Team alert** message: everyone following that team gets a buzz + pop-up the moment a new teammate is drawn ("New teammate: X joined Team 7!"); "🎉 You're in Team N!" when you're drawn.
6. **🔮 Predict the pick** — pick who goes to the next team from the **Pending in <round>** list (search, tap to pick, change until the reel stops; saved only after the server confirms). Below it an always-visible **🏆 Leaderboard** box: top 3, "You: #N", **See full leaderboard (N players)**. Hidden if the host closes predictions.
7. **All teams** with **🔍 Find a player's team** (matches glow, jump buttons) and the ⭐ tag on your team.
8. Footer: "Built & developed by SP Tech", "Turning Ideas into Experiences", Sidh + Pinkesh call cards, WhatsApp pill.
- Floating: **reaction bar** 🔥 😂 👏 🎉 😱 ❤️ (everyone's reactions float on every phone of the same draw), sticky **"Now drawing"** bar when the stage scrolls off screen, screen kept awake during a live draw, buzz on every reveal (Android; iPhones don't allow web vibration).

### Viewer count rule ("👀 N watching")
Distinct **audience browsers** with a live connection, per draw. Each browser sends a random id (localStorage) with its connection; refreshes, reconnects and extra tabs in the same browser count once; host (`/admin`) and projector (`/screen`) are excluded; dead phones drop out within ~20 s. It counts browsers, not people. Hidden when ≤ 1.

### Host page (`/admin`)
- **Switch** Main draw / Kids draw at the top (one login for both).
- **Setup** (before start): name, spin length; main draw = choose categories + order; kids draw = **fixed format card**. Player lists per list (paste one per line or **Import .xlsx / .csv**), readiness (e.g. Icon Boy 4/4, Boy 4/4, Girls 8/8), **Start draw**.
- **Draw**: big button *Shuffle … → Finalize … → Spin for Team N → Finalize …*; **Undo last draw**; **Export Excel**; **PDF report**; **Audience predictions open/closed** switch; links to Audience view and Big screen (in the current mode).
- **When complete**: Download PDF report, Teams gallery image, Export Excel.
- Below: edit lists not yet drawn, Draw history, **Past tournaments** (export any earlier one, per mode), **Start a new tournament** (per mode).

### Spreadsheet import
First sheet of an `.xlsx`, or a `.csv`. Row 1 = list names, names underneath, one per cell.
- Main: `A`, `Women` (or `Ladies`), `B`, `C`, `D` (also `A Player`, `Category B` …). Sample: [`samples/sample-players.xlsx`](samples/sample-players.xlsx).
- Kids: `Icon Boy` (or `Icon`), `Boy` / `Boys`, `Girl` / `Girls`.

### Exports (follow the selected mode)
- **PDF report** (built in the browser, revealed picks only): A4 landscape, ICC header; page 1 = all teams × rounds (kids: Team | Icon Boy | Boy | Girl 1 | Girl 2); page 2 = every player A–Z with round and team; fairness note in the footer.
- **Excel**: *Final Teams* + *Draw History* (timestamp, round, sequence, player, team, event/action ids, Final/UNDONE, fairness commitment + key). Main: `/api/export.xlsx`, kids: `/api/kids/export.xlsx` (host cookie).
- **Teams gallery image**: one 1920×1080 PNG of all teams in the ICC theme (kids: 4 large cards). Download only — no share buttons by request.

---

## 2b. Match draw (fixtures) module

Separate from the auction: own data (`cups` collection), routes (`/api/fixtures/*`, `/api/kids/fixtures/*`), live rooms (`cup:main`, `cup:kids`) and pages (`/fixtures`, `/fixtures/admin`, `/fixtures/screen`). Teams come only from the uploaded PDF (or typed in), never from the auction.

**Format** (organisers' sheet; timings ignored): every team plays **one match** against a drawn opponent. A match = **six doubles games**, same categories against each other: **A/B, C/D, A/C, B/D, A/D, B/C**. Matches are spread over the courts in draw order (default 2 courts: match 1 → Court 1, match 2 → Court 2, …). Then the knockout:
- **8+ teams (main, 28):** standings → **QF1 1st v 8th, QF2 2nd v 7th, QF3 3rd v 6th, QF4 4th v 5th** → **SF1 = winners QF1/QF2, SF2 = winners QF3/QF4** → **Final**.
- **4–7 teams (kids, 4):** **Final 1st v 2nd** and **3rd/4th place 3rd v 4th**.
- A match is won with 4+ games; at 3–3 the points decide (if entered), else the host taps a decider. Standings: matches won → games won → points difference → points for. The host can change any knockout position before locking (own tie-break rules).

**Host flow** (`/fixtures/admin`): 1) **Upload teams file** — **PDF, Excel (.xlsx), Word (.docx), CSV** or pasted text. Reads team names, players by category (A–D; M1/M2/M3/W1 and B1/G1/B2/G2 read as A–D) in any of: the auction's own team-card PDF (tested 28/28, 4/4), cards with a team name above, a table `Team | A | B | C | D` (any order, extra columns ignored), a list `Team | Category | Name` (one player per row, team name only on its first row is fine), or `Team 1` + `A: Name` lines. **Logos inside the file are picked up**: Excel pictures by the row they sit in, Word pictures by table row, PDF pictures by the nearest team card (a picture repeated on every page, like a header logo, is ignored). Tested with generated files: Excel 6/6 logos, Word 6/6, PDF 6/6. Everything shows in an editable table with **logo** (tap to change), **colour** (taken from the logo automatically, editable), name and players → **Save**. **Upload logos** takes many pictures at once (file named after the team → that team; others fill teams without a logo in order). 2) **The show**: title, suspense (2–7 s), shot (Surprise = changes every match, or one fixed), courts. 3) **Open the arena** (needs an even number of teams, ≥ 4; locks names/players — logos and colours can still be changed later under **🎨 Logos & colours**). Then **Draw match N** per match (optionally choose that match's shot), **Undo last match** (only the latest, not during its show, not once it has results). Results: tap the winning pair per game or type points; knockout line-up → **Lock & reveal**; **Unlock** while no knockout result exists. Tools: **↺ Restart draw** (same teams, logos and settings, nothing drawn — rehearse as often as you like, then Restart once before the real draw; the host must type RESTART, and it is refused while a show runs), **Fixtures PDF**, **Start a new match draw** (empty, new name; type NEW). Old draws stay in the database — to undo a Restart, delete the newest `cups` document of that event in Atlas and the previous one is active again.

**The show — Smash Arena 3D** (every phone, in sync, ~23 s per match at 3.5 s suspense; three.js, loaded only on match-draw pages): a night stadium (floodlights, crowd with camera flashes, big screen with the ICC logo showing "MATCH 4 OF 14 · ROCKET SERVE"), a pickleball court and net; every team not yet drawn stands on the far side as a glowing **crest** in its colour with its logo and name. Per match: the arena goes full-screen ("theatre", ✕ to minimise) → shot title card → a **spotlight hunts** across the crests, faster with a heartbeat → **locks on** → camera drops behind the paddle, ball tossed, **slow-motion smash** → the camera chases the shot → the crest **shatters**, the team's logo rises with its name ("SMASH TITANS is in!") and floats to the corner → hunt again → second smash → the two logos **collide** → **VERSUS** screen in the two team colours with both logos, rosters and the six games with real names → the remaining crests regroup. Shots: 🔥 Fireball Smash, ⚡ Thunder Smash (lightning from the sky), 💠 Laser Drive, 🚀 Rocket Serve (smoke trail), ☄️ Sky Lob (meteor from the sky), 🌀 Banana Curve; the **last two teams** get 🔗 "Last two standing" (they lift, lightning arcs, they collide). Also: crests rise when the host opens the arena, "All N matches are set!" + fireworks, result toasts, knockout line-up revealed as back-to-back VS cards, **Champions** screen with the logo. Phones (touch screens) use a lighter render (no bloom, lower resolution); without WebGL, or if the GPU drops out, the 2D arena takes over automatically (`?2d=1` forces it). Logos are shown as **full squares** (rounded, light frame) on every crest and on the floating emblem, leaning back towards the camera and kept just under the glow threshold so they stay sharp — the organisers' logos are square artwork with the team name edge to edge, which a circle cut off. The same rounded squares are used in the 2D lists, VS and champions screens. Teams without a logo get a generated badge (colour ring, icon, initials, name). Reactions bar works here too (own room). Sound: real recordings (see *Match-draw sounds* below) with the synthesized sounds as fallback.

**Fair and spoiler-free:** the server picks both teams with `crypto.randomInt` and stores them, but each team appears in the public state only at its reveal time (server clock; screens animate around it), and a fresh state is pushed to every phone at each reveal. Seal: `SHA-256("PicklePro|cup|v1|seq|match|teamA|teamB|key")` public when the show starts, key public when it ends; the host page re-checks every match (✅ Fairness seal N/N).

**Match-draw sounds** (`client/public/sounds/*.mp3`, played by `client/src/cup/sfx.js` through the main sound engine, so the 🔊 button still mutes everything instantly; files are fetched only on phones with sound on, never precached):
- Layers: **music** (dhol + electronic, ducks under big moments), a **soft crowd murmur only while the spotlight hunts** (fades out after each reveal — no constant stadium roar, people found it irritating), and one-shot effects: arena open, title card, drum roll (hunt), slow-motion whoosh, real paddle pop, one flight sound per shot, shatter + short cheer + dhol hit on every reveal, metal clash (logos collide / VS, no extra cheer), referee whistle + fanfare (all matches set), fanfare + fireworks + dhols (champions), short cheer per result. Every cheer is a short faded burst (about 1–3 s, quieter than before).
- Per device: **🎵 Music on/off** and **👥 Crowd on/off** buttons in the arena (remembered on that phone/TV); the 🔊 button mutes everything.
- Sources and licences (checked 2026-11-14): **Mixkit** (Sound Effects Free License — commercial use inside a product allowed): crowd 2097, open 2900, title 2918, drumroll 577, slowmo 1486, fireball 1347, thunder 1300, laser 1287, rocket 1714, meteor 3024, curve 1493, shatter 1693, cheer 462, clash 1687, whistle 614, fanfare 2293, fireworks 524 (ids = mixkit.co item ids). **Pixabay** (Pixabay Content License — free commercial use, no credit needed, not resold standalone): `pop` = "PickleBall" (freesound_community, id 24267), `dhol-hit` = "Dhol And Neon (15 sec stinger)" (kaazoom, 564695), `music` = "Dhol And Neon (1 min edit)" (kaazoom, 564697), `dhols` = "Indian Wedding Dhols" (freesound_community, 52474).
- Processing: trimmed, mono 96 kbps (music stereo 112 kbps), levelled, faded; crowd made a seamless loop. Script kept outside the repo (scratchpad `audio-tools/process.mjs`, uses `mpg123-decoder` + `lamejs`); 21 files = 2.2 MB in the app (Pixabay credit line shown by Pixabay: "Music by Paul Winter from Pixabay" for the kaazoom tracks — credit is optional under the Pixabay licence). A missing file just falls back to the synthesized sound (Vercel returns 404 for `/sounds/*` that don't exist — `client/vercel.json`).

**Performance** (3D): starts at bloom + 1.75× resolution (desktop) or no bloom + 1.3× (touch screens), then steps down automatically (bloom off → 1.3× → 1× → 0.75×) when frames stay slower than ~38 fps; all effect materials compiled while loading (no freeze at the first smash); lightning shapes pre-built per bolt; shard materials shared; emblem labels reuse the crest label; 3D stops drawing behind the VERSUS screen and when scrolled off screen; big glowing overlay text drawn once into its own layer; the page re-renders twice per match (not per step).

**ICC Season 2 teams (organisers' final list)** — `client/src/cup/season2.json`, built from *ICC PICKELBALL SEASON 2 - updated.xlsx* (28 main + 4 kids teams; the **Replaced** column wins — e.g. Team 1 has all four replacements, Fireball Aces has Kayaan Mehta for Hridhaan Muni; ages, phone numbers and the payment table are ignored; "THE DROP SHOT DONE" corrected to "DONS" to match its logo, "SERVE - IVORS" written "SERVE-IVORS"). Logos from the organisers' Drive folder *Team Logos* (32 files; 3 were PDFs, rendered) are in `client/public/season2/logos/` as 320 px WebP (`m01`–`m28` main by team number, `k01`–`k04` kids, plus `icc-shield.webp`), ~1.1 MB, served by Vercel's CDN. Team colours are the most vivid colour of each logo (pickleball-yellow down-weighted). A team's `logo` can therefore be a bundled file `s:m01.webp` (no upload needed) or an uploaded image hash. Host page: **⭐ Load ICC Season 2 teams** fills the table in one tap (then Save). Three logos (`m01`, `m18`, `m23`) had a fake grey/white "transparent" checkerboard baked in; it was replaced with plain white (flood fill from the edges, logo untouched; scratchpad `clean_checker.py`). Scripts used (outside the repo, scratchpad): `season2_data.py`, `process_logos.py`, `logo_colours.py`.

**Who controls what:** only the host (`/fixtures/admin`, password) opens the arena, draws, enters results and locks the knockout. Audience pages never show draw controls. There is no demo mode any more (removed 2026-11-16): every page talks to the real server. The **Team Auction | Match Draw** bar at the top of every audience and host page switches modules (`client/src/ModuleNav.jsx`); TV views don't show it.

**Rules live in one place:** `client/src/cup/core.js` (pure functions) is used by the server **and** the pages, so both read a cup the same way.

---

## 3. Architecture

| Part | Tech | Hosted on |
|---|---|---|
| `client/` | React 19 + Vite 8 PWA (`vite-plugin-pwa`), `socket.io-client`, `qrcode`, `jspdf` + `jspdf-autotable` | Vercel project `pickle-pro` (team `sp-tech3`), root dir `client` |
| `server/` | Node 22.12+ / Express 5 / Socket.IO 4 / Mongoose 9 / ExcelJS / Helmet | Render free web service `picklepro-api` (`render.yaml`) |
| Database | MongoDB | Atlas M0 (production), local MongoDB 9.0 service (development) |

- Vercel rewrites `/api/*` (incl. `/api/kids/*`) to Render (`client/vercel.json`). Socket.IO connects straight to Render (`VITE_SOCKET_URL`).
- Render also builds and serves the client, so its URL is a full backup site.
- **Events:** each tournament has `event` = `main` (default; older documents without the field are main) or `kids`. Routes are mounted twice: `/api/kids/*` (kids) before `/api/*` (main). Sockets send `auth: { role, viewer, event }` and join room `event:<name>`; state, spins, reactions and viewer counts go only to that room.
- Socket.IO clients can only send emoji `reaction`s (whitelisted, rate limited, relayed to their own draw). Nothing a client sends can start, choose or change a draw.

### Key files
| File | What it does |
|---|---|
| `server/src/models.js` | Schemas + indexes; `LABELS`, `SHORT` codes, `SHUFFLE` rounds, `poolOf` (Girl 1/2 → Girls list), `EVENTS` (main/kids formats) |
| `server/src/draw.js` | The draw engine (every function takes the event): snapshot, public/admin state (`needed`, `ready`, `recent`…), rules, lock, reveal scheduling, archive |
| `server/src/server.js` | `eventApi(ev)` routes, auth routes, health, static client, Socket.IO rooms + per-event viewer counts |
| `server/src/crowd.js` | Reactions relay, `submitGuess`, `leaderboard` (per event) |
| `server/src/auth.js` | Password login, signed HttpOnly cookie, failed-login rate limit |
| `server/src/excel.js` | Excel export (any tournament) and spreadsheet import (main + kids headers) |
| `server/test/draw.test.js`, `server/test/qa/*.test.js` | 1,009 automated scenarios (unit, API, draw engine, race, DB, security, SIT) — see `TEST_PLAN.md`, `TEST_CASES.md`, `TEST_RESULTS.md` |
| `server/perf/load.mjs` | Local load / stress / spike / soak script (isolated DB only) |
| `client/src/event.js` | Current mode (`getEvent`, `setEvent`, `useEvent`), API base, per-mode storage keys, URLs |
| `client/src/main.jsx` | Picks the page (`/admin`, `/screen`, audience) and remounts it when the mode switches |
| `client/src/DrawSwitch.jsx` | Main draw / Kids draw tabs with LIVE / Done badges |
| `client/src/useLive.js` | Live connection, cached state, spin phases, announcements, viewer count |
| `client/src/Stage.jsx` | Reel (frame loop, near-miss), rally ball, paddles, countdown, winner/team cards, sound toggle, resume-sound prompt |
| `client/src/sound.js` | All audio (mechanical slot, effects, unlock/mute/resume logic); `fx.js` = confetti + re-export |
| `client/src/Audience.jsx` | Reactions, predictions + leaderboard box, announcements |
| `client/src/Follow.jsx` | Know your team (seat chain + alerts), team search, wake lock |
| `client/src/NowBar.jsx` | Latest picks ticker + sticky now-drawing bar |
| `client/src/Brand.jsx` | SP Tech strip + footer, contacts, WhatsApp link |
| `client/src/Admin.jsx` | Login, setup (event-aware), controls, prediction switch, history, archive |
| `client/src/Board.jsx`, `Live.jsx`, `Screen.jsx` | Team board; audience page; projector |
| `client/src/report.js`, `gallery.js`, `fair.js` | PDF report; gallery PNG; browser-side fairness check |
| `client/src/styles.css`, `audience.css` | Styling (palette from the ICC logo) |
| `server/src/fixtures.js` | Match draw: storage, secure picks, seal, timed reveal broadcasts, routes (`cupApi`) |
| `client/src/cup/core.js` | Match draw rules (shared by server + pages): view/hiding, draw, undo, results, standings, knockout |
| `client/src/cup/live.js` | Live hook (`useCup`, socket room `cup:<event>`, clock offset), API routing |
| `client/src/cup/SmashArena.jsx`, `stage3d.js` | The 3D show: director in step with the server reveals + captions; three.js stadium, crests, spotlight, paddle/ball, shots, shatter, emblems |
| `client/src/cup/Arena.jsx`, `fx.js`, `Versus.jsx`, `Moments.jsx` | 2D fallback arena + canvas effects, VS splash (team colours + logos), toasts / knockout reveal / champions |
| `client/src/cup/looks.jsx` | Team colours, generated badges, logo URLs, `TeamLogo`, logo resizing + main-colour detection, shot names |
| `client/src/cup/CupLive.jsx`, `CupAdmin.jsx`, `CupScreen.jsx`, `Boards.jsx` | Audience, host, big screen; fixtures, standings, bracket, find my match |
| `client/src/cup/importTeams.js`, `teamsPdf.js` | Import PDF / Excel / Word / CSV / text incl. logos (fflate + pdf.js, host only, lazy, not precached) |
| `client/src/cup/fixturesPdf.js`, `cup.css` | Fixtures PDF, styles |

### Database collections
- **tournaments** — event, name, status (`DRAFT`/`LIVE`/`COMPLETED`), teamCount (28 / 4), categories (round order), currentIndex, spinMs, predictions (on/off). The newest document **per event** is that event's active tournament; older ones are its archive.
- **players** — tournamentId, category (= list: A, WOMEN, B, C, D, ICON, BOY, GIRL), name, nameKey. Unique on (tournamentId, nameKey).
- **drawevents** — the source of truth: actionId, sequence, category (round), teamNumber, playerId, playerName, revealAt, voided, commitment, salt. Unique on sequence and (non-voided) on team-per-round and on player.
- **guesses** — tournamentId, category, teamNumber, voterId, nickname, playerName. Unique per (tournament, round, team, voter).
- **cups** (match draw) — event, name, status (`SETUP`/`DRAW`/`KNOCKOUT`; league/done are derived), aimMs, weapon, courts, teams `[{key,name,players{A,B,C,D},color,logo}]` (logo = hash of a stored image), draws `[{seq,tie,a,b,weapon,last,startAt,revealA,revealB,doneAt,commitment,salt,voided}]`, results `{L1|QF1|SF1|F|3P: {a,b,games[{w,sa,sb}],decider}}`, seeds. Newest per event is active.
- **cuplogos** — hash (SHA-256, 32 hex), type (PNG/JPEG/WebP), data. One document per distinct image; served at `/api/fixtures/logo/<hash>` with a one-year immutable cache, so each phone downloads each logo once.

### API (main at `/api`, kids at `/api/kids` — same routes)
Public: `GET /state`, `POST /guess`, `GET /leaderboard[?voter=]` — plus shared `GET /api/health`, `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`.
Host cookie: `GET /admin`, `PATCH /tournament`, `POST /tournaments`, `GET /tournaments`, `PUT /players`, `POST /players/import`, `POST /start`, `POST /draw`, `POST /undo`, `POST /finalize`, `GET /export.xlsx[?tournament=]`.
Socket events (server → clients, per draw room): `viewers`, `tournament:state`, `draw:spinning`, `draw:revealed`, `draw:undone`, `category:finalized`, `reaction`. Client → server: `reaction`.

**Match draw** (main at `/api/fixtures`, kids at `/api/kids/fixtures`): public `GET /state`, `GET /logo/:hash`; host cookie `GET /admin` (fairness history), `PATCH /settings`, `PATCH /looks {looks: {t1: {color, logo}}}`, `PUT /logos {logos: {t1: dataUrl|null}}` (≤ 400 KB each), `PUT /teams`, `POST /open`, `POST /setup`, `POST /draw {tie, weapon?}`, `POST /undo {seq}`, `PUT /result {tie, games, decider}`, `POST /seed {seeds}`, `POST /unseed`, `POST /new {name}`. Sockets connect with `auth.module = 'cup'` → room `cup:<event>`, event `cup:state` (sent on every change and at each reveal), plus `viewers` / `reaction`.

---

## 4. Running locally (Windows)

Prerequisites (set up on the dev laptop): Node 22.12+ (v24), MongoDB Community 9.0 as the `MongoDB` Windows service, `server/.env` with `MONGODB_URI`, `ADMIN_PASSWORD`, `SESSION_SECRET` (32+ chars).

```bash
npm run setup:dev     # first time: install server + client dependencies
npm run dev           # server :4000 + client :5173 together
npm test              # 1,009 server tests (isolated picklepro_qa_* / picklepro_test DBs)
npm run build         # client production build
```
- http://localhost:5173 (audience) · http://localhost:5173/admin (host) · add `?draw=kids` for the kids draw (or use the switch).
- Note: the repo lives in OneDrive; OneDrive syncing can make the server's `--watch` restart repeatedly or start slowly — just wait or restart it.

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

- **Normal path:** commit and push to `main` → Vercel (client) and Render (server) redeploy automatically (~2–5 min) and GitHub Actions CI runs the tests (`.github/workflows/test.yml`). Server changes only go live through a push.
- **Preview first (optional):** work on a branch, then from the repo root `vercel deploy --yes --scope sp-tech3 --build-env VITE_SOCKET_URL=https://picklepro-api.onrender.com` → preview link (Vercel login as SP TECH required; it uses the **production** server and data). Publish = merge the branch into `main` and push.
- Delete the `.env.local` that `vercel deploy` creates in the repo root (holds a Vercel token; git-ignored).
- Don't pass `--test-timeout` to the whole test run (in Node 22 it also limits the whole file, which takes ~40 s).

---

## 6. Event-day checklist

**Before (one-time)**
- [ ] Know the `ADMIN_PASSWORD` (Render → Environment).
- [ ] **UptimeRobot** (free): New monitor → HTTP(s) → `https://picklepro-api.onrender.com/api/health`, every 5 min, email alerts. Reduces cold starts but can't guarantee the free Render service never sleeps — open the site 15 min before.
- [ ] Atlas: database user has **readWrite on `picklepro` only**; strong password.

**Rehearsal (1–2 days before), for each draw you'll run**
- [ ] `/admin` → choose Main or Kids → import the lists (main: `samples/sample-players.xlsx`; kids: Icon Boy 4, Boy 4, Girls 8) → Save → Start → run the full draw.
- [ ] Audience link on 2–3 phones: all show the same spin; tap for sound; switch modes and back — sound stays on.
- [ ] Wi-Fi off/on on one phone → reconnects and catches up. Refresh host mid-spin → resumes.
- [ ] Export PDF and Excel; check them.
- [ ] **Start a new tournament** (in that mode) with the real name — the rehearsal moves to Past tournaments.

**On the day**
- [ ] 15 min before: open `/api/health` and `/admin` (wakes the server), log in, pick the mode, load the real lists → all counts green.
- [ ] Share **one** link: https://pickle-pro-peach.vercel.app (people use the switch).
- [ ] Run the draw. **Export Excel after each round** (Atlas M0 has no automatic backups). PDF + gallery at the end.

**Match draw — rehearsal (any day before)**
- [ ] Server pushed to `main` (Render deployed) — otherwise `/fixtures` shows *Coming soon*.
- [ ] `/fixtures/admin` → Main → **⭐ Load ICC Season 2 teams** → Save → settings → **Open the arena** → draw a few (or all) matches with the audience link on 2–3 phones + the TV view. Try Undo, a phone refresh mid-show, Wi-Fi off/on.
- [ ] Same for **Kids** (switch at the top).
- [ ] When happy: **↺ Restart draw** (type RESTART) in Main and in Kids → both back to *Coming up* with the same teams, nothing drawn.

**Match draw — on the day**
- [ ] 15 min before: open https://picklepro-api.onrender.com/api/health (wakes the free server; first load can take ~1 min), then `/fixtures/admin`, log in. Open pages keep the server awake.
- [ ] TV: open `/fixtures/tv`, tap **Tap for sound** and **Full screen** once. Share the audience link https://pickle-pro-peach.vercel.app/fixtures (QR on the TV).
- [ ] Don't push code or redeploy during the event.
- [ ] **Open the arena** → **Draw match 1 … 14** (wait for each show; the button counts down). Results → **Lock knockout** → knockout results.
- [ ] A double tap or two host phones can't draw twice (the server takes one, refuses the rest). If the host loses connection, the show still runs for everyone; reconnect and continue.

**If something goes wrong**
- *Connection lost* on host: draws pause until it reconnects; nothing is lost.
- Vercel down: use `https://picklepro-api.onrender.com` (+ `/admin`).
- Wrong pick: **Undo last draw** (current round only).
- No sound on a phone: tap **Tap for sound / Tap to resume sound**; check the phone's volume (and media volume on Android).
- Host login locked after many wrong passwords on Vercel (all Vercel visitors share one IP): log in on the Render URL.

---

## 7. Current state

**As of 2026-11-16 (night) — everything LIVE: match draw on the main link**
- Pushed to `main` (owner asked): commit `de0c227`. **Render** deployed the server (live ~1 min after the push; /api/fixtures/state 200 via Vercel; a live socket got cup:state). **Vercel** production deployed by itself from the push (git auto-deploy works again): deployment `pickle-5ezw7ojpe`, aliased to https://pickle-pro-peach.vercel.app — bundle checked (socket → Render, new links, no demo).
- Links: audience https://pickle-pro-peach.vercel.app · host https://pickle-pro-peach.vercel.app/admin · TV https://pickle-pro-peach.vercel.app/tv · auction under `/auction`.
- Production database starts empty for the match draw: host → **⭐ Load ICC Season 2 teams** → Save (Main and Kids), rehearse, then **↺ Restart draw** before the real draw.

**As of 2026-11-16 — demo removed, Restart, calmer crowd, clearer logos, draw-day rehearsal (client LIVE on production)**
- Links changed later the same day: main link `/` = match draw, `/admin` = match-draw host, `/tv` = match-draw TV; auction under `/auction`, `/auction/admin`, `/auction/tv`. Preview https://pickle-ppovj6s3o-sp-tech3.vercel.app — **not on production yet** (deploy right after the server push, otherwise the main link would show *Coming soon*).
- **Production updated** (owner approved, before the link change): `npx vercel deploy --prod` → deployment `pickle-de9nz1s2o`, aliased to https://pickle-pro-peach.vercel.app. Verified live: new bundle (no demo; Restart, Crowd switch, waking-server note present), `/season2/logos/*` served as WebP (missing logo → 404), sounds served as audio, auction pages unchanged. `/api/fixtures/state` still 404 → `/fixtures` shows *Coming soon* until the server is pushed to `main`. Preview of the same build: https://pickle-iq56c01hx-sp-tech3.vercel.app.
- **The demo is gone** — the match draw now only works against the real server, so the **server must be pushed to `main`** (Render) before anyone (incl. the host) can try it. Until then production `/fixtures` shows *Coming soon*.
- Tested locally against the real server (scripts in the scratchpad: `rehearsal.mjs`, `crowdload.mjs`, `midshow.mjs`): full Main (28 teams, 14 matches + an undo, results, QF→SF→Final, champion, Restart) and Kids (4 teams) at real speed, also both at once — every check passed (no team visible before its reveal, a double tap gives exactly one draw, next draw/undo/restart refused during a show, every team drawn exactly once, every fairness seal verifies). **300 simulated phones**: all connected, every reveal arrived 46–155 ms after its reveal time, none early. **Server killed mid-show** and restarted: the match finished on schedule, the TV reconnected and caught up by itself. Server tests 1040/1040. The local dev server (watch mode) also restarted by itself once mid-rehearsal (a file event from the Vercel CLI/OneDrive) — the draw carried on correctly.

**As of 2026-11-15 — ICC Season 2 teams + logos, host-only control, TV view, module nav (preview)**
- Preview: https://pickle-7z4re3be0-sp-tech3.vercel.app (SP TECH Vercel login) — `/fixtures?demo=1` (audience, watch only), `/fixtures/admin?demo=1` (host demo), `/fixtures/tv?demo=1`. **Production not updated yet** (still the build from 2026-11-14 night).
- For the real event (host on one device, audience on their phones) the **server must be pushed to `main`** (Render). Until then only the demo works, and the demo only syncs tabs of one browser.
- Tests: `cup.test.js` 12/12 (new: bundled `s:` logos accepted, path-like refused).

**As of 2026-11-14 (night) — lag fix + real sounds LIVE on production (client)**
- `npx vercel deploy --prod` → deployment `pickle-ikvg63b2k`, aliased to https://pickle-pro-peach.vercel.app. Verified there: auction page unchanged (Season 2, 28 teams, live); `/fixtures` shows *Coming soon* (Render not updated yet); `/fixtures?demo=1` runs the 3D arena with the 🎵 Music button; `/sounds/*.mp3` served as audio, unknown sound files 404.
- Still pending: **push to `main`** so Render gets the match-draw server (real `/fixtures`), and git matches what is live. Nothing committed.

**Earlier — as of 2026-11-14 (evening) — lag fix + real sounds on a preview**
- Preview with the lag fix and **all 21 real sounds** (incl. dhol music): https://pickle-n8luwth7g-sp-tech3.vercel.app/fixtures?demo=1 (SP TECH Vercel login). **Production still has the earlier build** (no sounds, no lag fix) until the next `vercel deploy --prod`.
- The 4 Pixabay files were downloaded through the owner's Chrome (Pixabay blocks scripts) and processed like the rest: pop 0.45 s (one clean paddle hit cut from a 2-min game recording), dhol-hit 7 s (played as a 2.5 s burst per reveal), music 59 s stereo, dhols 6 s. All 21 files = 2.2 MB.
- Verified: all 17 recorded files decode in the browser with the right lengths/levels; a full match with sound on runs with no errors; preview serves `/sounds/*.mp3` as audio. Not verified: how it sounds/feels on a real phone (can't listen here); smoothness re-measurement (the browser pane was hidden).

**As of 2026-11-14 (latest) — client in PRODUCTION, server not yet**
- **Vercel production** now serves this build (`npx vercel deploy --prod`, deployment `pickle-ahkbxsvjr`, aliased to https://pickle-pro-peach.vercel.app). Auction pages verified unchanged (Season 2 draw complete, live, viewers). https://pickle-pro-peach.vercel.app/fixtures?demo=1 runs the 3D demo for anyone (no login).
- **Render (server) is still the old version** until the code is pushed to `main`: real `/fixtures`, `/fixtures/admin`, `/fixtures/screen` show **"Coming soon — The match draw"** (with a *Watch the demo* button); the host page says the server needs the update. Meanwhile a match-draw page counts in the auction's "watching" number (old server puts it in the auction room) — goes away with the server update.
- Production now differs from git `main` (code is uncommitted): **commit + push to `main`** to bring Render up to date and keep git in step with what's live.

**As of 2026-11-14 (later) — Match draw: Smash Arena 3D + logos (not committed yet)**
- The match draw (see 2b) now runs as **Smash Arena 3D** with team logos/colours and Excel/Word/PDF import incl. logos; the 2D arena stays as automatic fallback. All **uncommitted** in the working tree (owner does all git).
- Vercel **preview**: see the latest link in the change log entry below (SP TECH Vercel login needed). On a preview only the **demo** works (`/fixtures?demo=1`, `/fixtures/admin?demo=1`, `/fixtures/screen?demo=1`) until the server is pushed; the demo uses placeholder team names and generated badges.
- **Waiting for the organisers' final file** (team names, logos, players with category; some players were replaced). Load it in `/fixtures/admin` → check the table → Save. If a logo is missing or wrong, tap it.
- To go live: commit + push to `main` (Render redeploys the server, Vercel the client — or the Vercel prod deploy in the deployment section).
- Verified locally: 3D show desktop + 375 px phone (theatre, all phases, framing), host editor with logos/colours, import of Excel (table + list), Word, CSV/text and PDF (incl. logos), production build. **Server tests: 1,038/1,038 pass.**
- Not verified: 3D smoothness on real low-end phones (lighter mode is used on touch screens; 2D fallback exists), sound on real phones, the organisers' real file (not received yet).

**As of 2026-10-12**
- GitHub `main` = `3636a9b` — pushed; CI green; Render and Vercel serve it.
- Live: both auction modes (main 28 teams, kids 4 teams) behind one link with the reload-free switch; mechanical slot sound; resume-sound prompt; Know your team; leaderboard box; viewer count under LIVE; accurate viewer counting; compact SP Tech branding; prediction switch; PDF/Excel/gallery per mode.
- Tests: **23/23** pass locally and in CI; production build clean.
- Production data: main tournament untouched (the main event keeps its existing tournaments); a kids tournament is created automatically the first time the kids draw is opened (DRAFT, "Kids Team Draw").
- **Still needs a physical-device check:** the new mechanical sound on a real iPhone and Android phone (synthesized audio couldn't be listened to during development), and the viewer count with several real phones.
- **Not done:** UptimeRobot monitor (needs the owner's account — steps above).

### Known limits
- Single server instance only (processing lock and login limiter are in memory).
- Render free tier sleeps after 15 idle minutes and has a monthly hours limit.
- Atlas M0: no automatic backups — export Excel.
- Team counts are fixed per mode (28 main, 4 kids — `EVENTS` in `server/src/models.js`); kids format is fixed (1 Icon Boy, 1 Boy, 2 Girls per team).
- Saving a list replaces it non-transactionally (validated first, so failures are unlikely).
- Web vibration doesn't work on iPhones; the screen wake lock can be blocked by low-power mode.

### Ideas not built yet
Host "ready check" panel (server awake, test sound), real recorded slot sound files (would need licensed audio), big-screen winner spotlight, accessibility pass (larger text, screen-reader announcements), "You missed: …" catch-up after reconnecting, commentator voice, configurable team counts.

---

## Change log

Newest first. Add an entry for every change.

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
