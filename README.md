# Captain Dumbell

Camera-guided workout coach with real-time rep counting, calorie tracking, daily
workout planning, and saved training history. **Captain Dumbell** uses MediaPipe
Pose Landmarker to read your body in the browser (no video ever leaves the
device), counts reps for 8 exercises, and stores your sessions in your own
self-hosted backend.

This repository ships with a clean **frontend / backend split** — no Lovable
Cloud, no Supabase, no third-party backend. You run both pieces yourself.

```
captain-dumbell/
├── backend/    Node.js + Express + SQLite API (auth, profile, sessions)
└── frontend/   Vite + React + Tailwind + MediaPipe + Three.js client
```

> 🚀 **Deploying?** See [`DEPLOY.md`](./DEPLOY.md) for a full step-by-step
> guide (Render for the backend, Vercel for the frontend, plus Railway,
> Fly.io, and bare-VM alternatives).

---

## Features

- **8 exercises with form feedback** — pushup, squat, overhead press, lunge,
  bicep curl, jumping jack, sit-up, plank (time-based).
- **Daily workout selector** — asks every day which workout you're doing and
  resets at local midnight.
- **Calorie tracking** — per-session and daily totals.
- **Live or recorded video input** — stream from the device camera or upload a
  recorded clip and have it analyzed frame-by-frame.
- **3D figure visualization** — pose landmarks driven onto a Three.js humanoid
  instead of a flat stick figure.
- **Saved history** — every session is saved against your account.
- **Self-hosted backend** — Node + Express + SQLite, JWT auth, runs anywhere
  (local, VM, container, Render, Fly, Railway, etc.).

---

## Quick start (local development)

You'll run two terminals: one for the backend, one for the frontend.

### 1. Backend

```bash
cd backend
cp .env.example .env          # edit JWT_SECRET for anything beyond local dev
npm install
npm run dev                   # http://localhost:4000
```

The server creates `backend/data/captain-dumbell.db` on first launch and
applies the schema automatically.

### 2. Frontend

```bash
cd frontend
cp .env.example .env          # point VITE_API_BASE_URL at your backend
npm install
npm run dev                   # http://localhost:8080
```

Open <http://localhost:8080>, create an account, allow camera access, and
start training.

---

## Backend

### Stack

- **Node.js** (>=18) + **Express 4**
- **better-sqlite3** for an embedded, zero-config database
- **bcryptjs** for password hashing
- **jsonwebtoken** (JWT, 30-day expiry) for stateless auth
- **cors** with an explicit allowlist

### Environment (`backend/.env`)

| Variable        | Default                           | Purpose                              |
| --------------- | --------------------------------- | ------------------------------------ |
| `PORT`          | `4000`                            | HTTP port                            |
| `CORS_ORIGIN`   | `http://localhost:8080,http://localhost:5173` | Comma-separated allowed origins  |
| `JWT_SECRET`    | `change-me-in-production`         | Token signing secret                 |
| `DATABASE_FILE` | `./data/captain-dumbell.db`       | SQLite file path                     |

### Schema (auto-created)

- `users(id, email UNIQUE, password_hash, display_name, created_at)`
- `profiles(id, user_id UNIQUE → users.id, display_name, avatar_url, training_goal, …)`
- `workout_sessions(id, user_id → users.id, exercise_type, reps, duration_seconds,
  feedback_summary, calories_estimate, session_date, created_at, updated_at)`

### API

All endpoints return JSON. Authenticated endpoints require
`Authorization: Bearer <token>`.

| Method | Path                | Auth | Body                                                                                  |
| ------ | ------------------- | ---- | ------------------------------------------------------------------------------------- |
| GET    | `/api/health`       | —    | —                                                                                     |
| POST   | `/api/auth/signup`  | —    | `{ email, password, display_name? }` → `{ token, user }`                              |
| POST   | `/api/auth/login`   | —    | `{ email, password }` → `{ token, user }`                                             |
| GET    | `/api/auth/me`      | ✅   | → `{ user }`                                                                          |
| GET    | `/api/profile`      | ✅   | → `{ profile }`                                                                       |
| GET    | `/api/sessions`     | ✅   | `?limit=8` → `{ sessions: [...] }`                                                    |
| POST   | `/api/sessions`     | ✅   | `{ exercise_type, reps, duration_seconds, feedback_summary, calories_estimate }`     |

### Run in production

```bash
cd backend
npm ci --omit=dev
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) npm start
```

Put it behind a reverse proxy (nginx, Caddy) and serve over HTTPS. The SQLite
file in `backend/data/` is the entire database — back it up.

---

## Frontend

### Stack

- **Vite 5** + **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** + **Radix**
- **MediaPipe Tasks Vision** (Pose Landmarker) for in-browser body tracking
- **Three.js** for the 3D figure renderer
- **framer-motion** for transitions

### Environment (`frontend/.env`)

| Variable             | Default                  | Purpose                                |
| -------------------- | ------------------------ | -------------------------------------- |
| `VITE_API_BASE_URL`  | `http://localhost:4000`  | Captain Dumbell backend base URL       |

### Build

```bash
cd frontend
npm run build      # outputs to frontend/dist
npm run preview    # serve dist locally
```

Deploy `frontend/dist` to any static host (Vercel, Netlify, Cloudflare Pages,
S3 + CloudFront, nginx, etc.). Make sure `VITE_API_BASE_URL` is set at build
time to the public URL of the backend.

---

## Deploying

You deploy the two pieces independently.

### Backend on a VM / Render / Fly / Railway

1. Provision a small Node host with persistent disk for `backend/data/`.
2. Set env vars: `PORT`, `JWT_SECRET`, `CORS_ORIGIN` (your frontend's URL).
3. Run `npm ci --omit=dev && npm start`.

### Frontend on Vercel

1. Import the repo into Vercel and set the **Root Directory** to `frontend`.
2. Framework preset: **Vite**. Build command `npm run build`, output `dist`.
3. Add env var `VITE_API_BASE_URL=https://your-backend.example.com`.
4. Deploy.

For local end-to-end testing, point the frontend `.env` at
`http://localhost:4000` and add `http://localhost:8080` to the backend's
`CORS_ORIGIN`.

---

## Project layout

```
captain-dumbell/
├── README.md
├── backend/
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── src/
│       ├── db.js          # SQLite schema bootstrap
│       └── server.js      # Express app, auth, routes
└── frontend/
    ├── .env.example
    ├── .gitignore
    ├── components.json
    ├── eslint.config.js
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── public/
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── index.css
    │   ├── components/
    │   │   ├── trainer/
    │   │   │   ├── AuthPanel.tsx
    │   │   │   ├── DailyWorkoutPrompt.tsx
    │   │   │   ├── Pose3DFigure.tsx
    │   │   │   ├── PoseTrainer.tsx
    │   │   │   └── StatsPanel.tsx
    │   │   └── ui/         # shadcn/ui primitives
    │   ├── hooks/
    │   │   └── useAuth.ts
    │   ├── lib/
    │   │   ├── api.ts      # Backend API client (replaces Supabase)
    │   │   ├── trackers.ts
    │   │   ├── trainer-utils.ts
    │   │   └── utils.ts
    │   ├── pages/
    │   │   ├── Index.tsx
    │   │   └── NotFound.tsx
    │   ├── test/
    │   └── types/
    │       └── trainer.ts
    ├── tailwind.config.ts
    ├── tsconfig*.json
    ├── vite.config.ts
    └── vitest.config.ts
```

---

## Privacy

The webcam stream and uploaded recordings are processed **entirely in your
browser** by MediaPipe. The only data sent to the backend is the *summary* of
each session you choose to save (exercise, reps, duration, calories,
feedback string). No video, audio, or pose landmarks are uploaded.

---

## License

MIT — do whatever you like, no warranty.
