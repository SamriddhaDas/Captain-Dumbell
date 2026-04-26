// Lightweight API client for the Captain Dumbell backend.
// Replaces the previous Supabase integration.

export type ApiUser = {
  id: string;
  email: string;
  display_name: string | null;
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  exercise_type: string;
  reps: number;
  duration_seconds: number;
  feedback_summary: string | null;
  calories_estimate: number;
  session_date: string;
  created_at: string;
};

export type Profile = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  training_goal: string | null;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:4000";

const TOKEN_KEY = "captain_dumbell_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

// ---------- Auth ----------
type AuthResponse = { token: string; user: ApiUser };

type Listener = (user: ApiUser | null) => void;
const listeners = new Set<Listener>();
let currentUser: ApiUser | null = null;
let initialized = false;

function emit() {
  for (const l of listeners) l(currentUser);
}

export const api = {
  get user(): ApiUser | null {
    return currentUser;
  },

  onAuthChange(cb: Listener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  async init(): Promise<ApiUser | null> {
    if (initialized) return currentUser;
    initialized = true;
    if (!getToken()) {
      emit();
      return null;
    }
    try {
      const me = await request<{ user: ApiUser }>("/api/auth/me");
      currentUser = me.user;
    } catch {
      setToken(null);
      currentUser = null;
    }
    emit();
    return currentUser;
  },

  async signUp(email: string, password: string, display_name?: string): Promise<ApiUser> {
    const res = await request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name }),
    });
    setToken(res.token);
    currentUser = res.user;
    emit();
    return res.user;
  },

  async signIn(email: string, password: string): Promise<ApiUser> {
    const res = await request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    currentUser = res.user;
    emit();
    return res.user;
  },

  async signOut(): Promise<void> {
    setToken(null);
    currentUser = null;
    emit();
  },

  // ---------- Profile ----------
  async getProfile(): Promise<Profile | null> {
    const res = await request<{ profile: Profile | null }>("/api/profile");
    return res.profile;
  },

  // ---------- Workout sessions ----------
  async listSessions(limit = 8): Promise<WorkoutSession[]> {
    const res = await request<{ sessions: WorkoutSession[] }>(
      `/api/sessions?limit=${limit}`,
    );
    return res.sessions;
  },

  async createSession(input: {
    exercise_type: string;
    reps: number;
    duration_seconds: number;
    feedback_summary: string | null;
    calories_estimate: number;
  }): Promise<WorkoutSession> {
    const res = await request<{ session: WorkoutSession }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.session;
  },
};
