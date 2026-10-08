# PicklePro — Live Team Draw

Live, server-authoritative team draw for a 28-team doubles tournament. The host runs the draw at `/admin`; everyone else watches the same spin at `/` on any phone, tablet or projector, and can install it as an app.

- **A** is shuffled onto Teams 1–28 in one go.
- **Women, B, C, D** are drawn one spin at a time; each pick goes to the next team automatically.
- Every pick is saved before anyone sees it, survives refresh / reconnect / server restart, and can be exported to Excel.

## Stack

| Part | Tech | Free host |
|---|---|---|
| `client/` | React 19 + Vite PWA (service worker, manifest, offline shell) | Vercel |
| `server/` | Node + Express 5 + Socket.IO + Mongoose | Render (free web service) |
| Database | MongoDB | Atlas M0 |

Vercel can't hold Socket.IO connections, so the API runs on Render and Vercel forwards `/api/*` to it. The Render URL also serves the full app, which is your **backup link** if Vercel has trouble.

## Run locally

Requires Node 22.12+ and MongoDB running on `127.0.0.1:27017`.

```bash
npm run setup:dev
cp server/.env.example server/.env   # then set ADMIN_PASSWORD and SESSION_SECRET
npm run dev                          # server :4000, client :5173
```

- Audience: http://localhost:5173
- Host: http://localhost:5173/admin

```bash
npm test    # full draw A→D, double clicks, concurrent tabs, undo, auth, socket events, restart recovery, Excel
```

## Deploy (all free)

You need the code in a GitHub repo first (Render and Vercel deploy from GitHub).

### 1. MongoDB Atlas
1. Create a free **M0** cluster.
2. **Database Access** → add a user with a strong password.
3. **Network Access** → add `0.0.0.0/0` (Render's free tier has no fixed IP).
4. **Connect → Drivers** → copy the connection string and add the database name, e.g. `mongodb+srv://user:pass@cluster.xxxx.mongodb.net/picklepro`.

### 2. Render (API + Socket.IO + backup site)
1. **New → Blueprint** → pick the repo. It reads `render.yaml`.
2. Fill in `MONGODB_URI` (from Atlas) and `ADMIN_PASSWORD` (long and random — this is the host login). `SESSION_SECRET` is generated for you.
3. Deploy, then open `https://<your-service>.onrender.com/api/health` → `{"ok":true}`.
4. Note the exact URL. If Render added a suffix to `picklepro-api`, use that URL in the next step.

### 3. Vercel (main site)
1. Edit `client/vercel.json` so the `/api` destination is your Render URL. Commit and push.
2. **New Project** → pick the repo → **Root Directory: `client`** (framework: Vite).
3. **Environment Variables** → `VITE_SOCKET_URL` = your Render URL (e.g. `https://picklepro-api.onrender.com`).
4. Deploy. The audience link is `https://<project>.vercel.app`, and the host uses `/admin`.

### 4. Keep Render awake
Render's free tier sleeps after 15 minutes without traffic, and waking takes about a minute. Create a free [UptimeRobot](https://uptimerobot.com) HTTP monitor on `https://<render-url>/api/health` every 5 minutes. It also emails you if the server goes down.

## Event-day runbook

**Day before (rehearsal)**
- [ ] Log in at `/admin`, load dummy lists, run a full A → Women → B → C (→ D) draw.
- [ ] Open the audience link on at least 3 phones. Check they all see the same spin.
- [ ] Turn Wi-Fi off and on on one phone and check that it reconnects and catches up.
- [ ] Refresh the host page in the middle of a spin and check that it resumes.
- [ ] Export Excel and check both sheets.
- [ ] Afterwards: **Start a new tournament** (bottom of the host page) with the real event name.

**Event day**
- [ ] 15 min before: open the Render URL so it's awake, then the Vercel admin page.
- [ ] Load the final lists (paste, or import the spreadsheet). Every category shows **28/28**.
- [ ] Check spellings, then **Start draw**.
- [ ] Share the audience link (and the Render URL as a backup).
- [ ] **Export Excel after each category** as a backup (Atlas M0 has no automatic backups).
- [ ] Export the final Excel when the draw is complete.

**If something goes wrong**
- Host page shows *Connection lost*: draws are paused until it reconnects. Nothing is lost, because every pick is saved on the server.
- Vercel is down: use the Render URL for everything (`/` and `/admin`).
- Wrong pick (e.g. a misspelled player): **Undo last draw** removes only the latest spin, and only in the category being drawn. Undone picks stay in the history marked *UNDONE*.

## Spreadsheet import

First sheet of an `.xlsx`, or a `.csv`. The first row names the categories; names go below, one per cell:

| A | Women | B | C | D |
|---|---|---|---|---|
| Rahul Shah | Kruti Patel | Amit Mehta | … | … |

Headers like `A Player`, `Category B` or `Ladies` also work. Imported names fill the editor; check them, then **Save players**.

## Rules the server enforces

- Exactly 28 players before a category's first draw. No name twice anywhere in the tournament (case and spacing ignored).
- Categories run in the configured order; a category must be **finalized** (all 28 teams filled) before the next starts. Finalized categories never change.
- A list can be edited until its category's first draw.
- Every random choice uses Node's `crypto.randomInt` on the server. Browsers only animate the result.
- A pick stays hidden from every screen (and from `/api/state`) until its spin ends, so nobody sees it early.
- Double clicks, two host tabs and stale screens can't create two picks: the server processes one draw action at a time, rejects requests for the wrong team, and the database refuses duplicate team or player assignments.
- Socket.IO only sends updates to screens; nothing a viewer sends can change the draw. Every change needs the host cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, 12 h).

## Known limits

- One server instance (the processing lock is in memory). Fine for one event; scaling out would need Mongo transactions.
- Login rate limit is per IP and in memory (10 tries / 15 min).
- Spin length is set at `/admin` (default 6 s). The reel then takes about 3–5 s to slow down and stop.
