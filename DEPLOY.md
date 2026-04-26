# Deploying Captain Dumbell

Captain Dumbell ships as **two independent services**:

| Piece    | What it is                                  | Where it goes well                             |
| -------- | ------------------------------------------- | ---------------------------------------------- |
| Frontend | Static Vite/React build (HTML + JS + CSS)   | **Vercel**, Netlify, Cloudflare Pages, S3, …   |
| Backend  | Node + Express + **SQLite on disk**         | **Render**, Railway, Fly.io, a VM, Docker, …   |

> ⚠️ **Do not try to put the backend on Vercel.** Vercel serverless functions
> have an **ephemeral filesystem** — the SQLite database file would be wiped
> on every cold start. The backend needs a host with a **persistent disk**
> (Render Disk, Railway Volume, Fly Volume, or any always-on VM).

The recommended combo, used in this guide, is **Render (backend) + Vercel
(frontend)**. Both have free tiers.

---

## 0. Push the repo to GitHub

From the unzipped `captain-dumbell/` folder:

```bash
git init
git add .
git commit -m "Initial commit: Captain Dumbell"
git branch -M main
git remote add origin https://github.com/<your-user>/captain-dumbell.git
git push -u origin main
```

Both Vercel and Render deploy from a GitHub repo.

---

## 1. Deploy the backend on Render

You have two options. Option A is one click (uses the included `render.yaml`).
Option B is the manual path through the dashboard.

### Option A — Blueprint (recommended)

The repo includes [`render.yaml`](./render.yaml) which already declares:

- Web service `captain-dumbell-backend`
- Root directory: `backend/`
- Build: `npm install`  •  Start: `npm start`
- Health check: `GET /api/health`
- Auto-generated `JWT_SECRET`
- A 1 GB persistent disk mounted at `/var/data`
- `DATABASE_FILE=/var/data/captain-dumbell.db` so SQLite lives on the disk

Steps:

1. Sign in at <https://dashboard.render.com>.
2. **New +** → **Blueprint** → connect your GitHub account → pick the
   `captain-dumbell` repo.
3. Render reads `render.yaml` and shows the planned service. Click
   **Apply**.
4. When the service is up, copy its public URL — it will look like
   `https://captain-dumbell-backend.onrender.com`.
5. Open the service → **Environment** → set `CORS_ORIGIN` to your future
   Vercel URL. For now you can put a placeholder like
   `https://captain-dumbell.vercel.app` — you can update it after step 2.
6. Visit `https://<your-backend>.onrender.com/api/health` — you should see
   `{"status":"ok"}`.

### Option B — Manual web service

1. **New +** → **Web Service** → pick your GitHub repo.
2. **Root Directory:** `backend`
3. **Runtime:** Node • **Build:** `npm install` • **Start:** `npm start`
4. **Instance type:** Free is fine.
5. **Environment** tab — add:
   - `NODE_VERSION` = `20`
   - `PORT` = `10000`
   - `JWT_SECRET` = a long random string (e.g. `openssl rand -hex 32`)
   - `DATABASE_FILE` = `/var/data/captain-dumbell.db`
   - `CORS_ORIGIN` = your Vercel URL (e.g. `https://captain-dumbell.vercel.app`)
6. **Disks** tab — **Add Disk**:
   - Name: `captain-dumbell-data`
   - Mount Path: `/var/data`
   - Size: `1` GB
7. **Health Check Path:** `/api/health`
8. **Create Web Service** → wait for deploy → copy the URL.

> 💤 On Render's free tier the service sleeps after ~15 minutes of inactivity.
> The first request after a sleep may take ~30s. Upgrade to Starter ($7/mo) to
> keep it warm.

---

## 2. Deploy the frontend on Vercel

1. Sign in at <https://vercel.com>.
2. **Add New…** → **Project** → import the `captain-dumbell` repo.
3. **Root Directory:** click **Edit** and set it to `frontend`.
4. Framework Preset: **Vite** (auto-detected).
5. Build Command: `npm run build` (default). Output Directory: `dist` (default).
6. **Environment Variables** — add:
   - `VITE_API_BASE_URL` = your Render backend URL, e.g.
     `https://captain-dumbell-backend.onrender.com`
   - Apply to **Production**, **Preview**, and **Development**.
7. **Deploy**. You'll get a URL like `https://captain-dumbell.vercel.app`.
8. Go back to Render → backend service → **Environment** → update
   `CORS_ORIGIN` to that exact Vercel URL (no trailing slash). Save → Render
   restarts the service automatically.

The included [`frontend/vercel.json`](./frontend/vercel.json) tells Vercel to
serve `index.html` for any unknown route, so React Router deep links and page
refreshes don't 404.

---

## 3. Verify end to end

1. Visit your Vercel URL.
2. Sign up with an email + password.
3. Open the browser devtools **Network** tab — auth requests should hit your
   Render URL and return `200`.
4. Allow camera, do a few reps, **Save session**.
5. Reload the page — your saved session reappears in the history panel.

If signup fails with a CORS error, the `CORS_ORIGIN` on Render does not
exactly match the Vercel URL you opened. Fix it and Render will redeploy.

---

## Alternative hosts

### Backend on Railway

1. New Project → Deploy from GitHub repo, **Root**: `backend`.
2. Add a **Volume** mounted at `/var/data`.
3. Variables: `PORT=4000`, `JWT_SECRET=…`, `DATABASE_FILE=/var/data/captain-dumbell.db`,
   `CORS_ORIGIN=https://<your-frontend>`.
4. Railway auto-detects Node and runs `npm start`.

### Backend on Fly.io

```bash
cd backend
fly launch          # answer no to Postgres / Redis
fly volumes create captain_data --size 1
# In fly.toml, mount the volume at /var/data and set
# DATABASE_FILE=/var/data/captain-dumbell.db
fly secrets set JWT_SECRET=$(openssl rand -hex 32) CORS_ORIGIN=https://<your-frontend>
fly deploy
```

### Backend on a plain VM (Ubuntu/Debian)

```bash
sudo apt-get install -y nodejs npm
git clone https://github.com/<you>/captain-dumbell.git
cd captain-dumbell/backend
npm ci --omit=dev
cp .env.example .env       # edit JWT_SECRET, CORS_ORIGIN, DATABASE_FILE
# Run with a process manager (systemd / pm2):
sudo npm i -g pm2
pm2 start src/server.js --name captain-dumbell
pm2 save && pm2 startup
```

Front it with nginx/Caddy and HTTPS (Let's Encrypt).

### Frontend on Netlify / Cloudflare Pages

- Base directory: `frontend`
- Build: `npm run build`  •  Publish: `dist`
- Env var: `VITE_API_BASE_URL=https://<your-backend>`
- Add an SPA rewrite: Netlify needs `frontend/public/_redirects` containing
  `/*  /index.html  200`. Cloudflare Pages handles SPA routing automatically
  if you choose the Vite preset.

---

## Updating the deployment

- **Push to `main`** → Vercel and Render both auto-deploy.
- Changing env vars on Render or Vercel triggers a redeploy automatically.
- To wipe the database on Render: shell into the service and
  `rm /var/data/captain-dumbell.db*`, then restart.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `CORS … not allowed` in browser console | `CORS_ORIGIN` on backend doesn't match the frontend URL exactly | Set it to the full origin, no trailing slash, then redeploy backend |
| Frontend loads but every API call returns 404 | `VITE_API_BASE_URL` not set at build time | Add it in Vercel env vars and **redeploy** (env changes need a new build for Vite) |
| Login works, but on next page load you're logged out | Mixed http/https or browser blocked `localStorage` | Make sure both frontend and backend are HTTPS in production |
| Sessions disappear after a day | Backend on a host without persistent disk | Move backend to Render/Railway/Fly with a real volume |
| First request after idle is very slow | Render free-tier sleep | Upgrade plan, or hit `/api/health` from an uptime monitor |
| `better-sqlite3` build fails on Render | Native module needs Node ≥ 18 | The `NODE_VERSION=20` env var in `render.yaml` handles this — make sure it's set |
