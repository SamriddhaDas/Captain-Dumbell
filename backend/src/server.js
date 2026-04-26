import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, newId } from "./db.js";

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:8080,http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ORIGINS.includes(origin) || ORIGINS.includes("*")) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
  }),
);

// ---------- Helpers ----------
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}

function publicUser(row) {
  return { id: row.id, email: row.email, display_name: row.display_name ?? null };
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing Authorization header" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(payload.sub);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---------- Health ----------
app.get("/", (_req, res) => res.json({ name: "captain-dumbell-backend", status: "ok" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ---------- Auth ----------
app.post("/api/auth/signup", (req, res) => {
  const { email, password, display_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  if (String(password).length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(String(email).toLowerCase());
  if (existing) return res.status(409).json({ error: "email already registered" });

  const hash = bcrypt.hashSync(String(password), 10);
  const id = newId();
  const dn = display_name || String(email).split("@")[0];
  db.prepare("INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)")
    .run(id, String(email).toLowerCase(), hash, dn);

  // auto-create empty profile
  db.prepare("INSERT INTO profiles (id, user_id, display_name) VALUES (?, ?, ?)")
    .run(newId(), id, dn);

  const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
  if (!row) return res.status(401).json({ error: "invalid credentials" });
  if (!bcrypt.compareSync(String(password), row.password_hash))
    return res.status(401).json({ error: "invalid credentials" });
  res.json({ token: signToken(row), user: publicUser(row) });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- Profile ----------
app.get("/api/profile", authRequired, (req, res) => {
  const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(req.user.id) || null;
  res.json({ profile });
});

// ---------- Workout sessions ----------
app.get("/api/sessions", authRequired, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 8, 100);
  const sessions = db
    .prepare(
      `SELECT id, user_id, exercise_type, reps, duration_seconds, feedback_summary,
              calories_estimate, session_date, created_at
         FROM workout_sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(req.user.id, limit);
  res.json({ sessions });
});

app.post("/api/sessions", authRequired, (req, res) => {
  const {
    exercise_type,
    reps = 0,
    duration_seconds = 0,
    feedback_summary = null,
    calories_estimate = 0,
    session_date,
  } = req.body || {};
  if (!exercise_type) return res.status(400).json({ error: "exercise_type is required" });

  const id = newId();
  const today = session_date || new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO workout_sessions
       (id, user_id, exercise_type, reps, duration_seconds, feedback_summary, calories_estimate, session_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.user.id,
    String(exercise_type),
    Math.max(0, Number(reps) || 0),
    Math.max(0, Number(duration_seconds) || 0),
    feedback_summary,
    Math.max(0, Number(calories_estimate) || 0),
    today,
  );
  const session = db.prepare("SELECT * FROM workout_sessions WHERE id = ?").get(id);
  res.json({ session });
});

// ---------- Errors ----------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || "Internal server error" });
});

// Bind to 0.0.0.0 so platforms like Render / Railway / Fly can route traffic to the container.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Captain Dumbell backend listening on port ${PORT}`);
  console.log(`Allowed CORS origins: ${ORIGINS.join(", ") || "(none)"}`);
});
