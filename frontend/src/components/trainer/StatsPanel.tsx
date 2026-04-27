import { Flame, History, Timer } from "lucide-react";
import type { WorkoutSessionRow } from "@/types/trainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EXERCISE_LABELS } from "@/lib/trainer-utils";

interface StatsPanelProps {
  currentReps: number;
  durationSeconds: number;
  calories: number;
  sessions: WorkoutSessionRow[];
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function StatsPanel({ currentReps, durationSeconds, calories, sessions }: StatsPanelProps) {
  const recent = sessions.slice(0, 4);
  const caloriesText = Number.isFinite(calories) ? `${calories.toFixed(1)} kcal` : "0.0 kcal";
  const durationText = formatDuration(durationSeconds);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={History} label="Reps completed" value={String(currentReps)} />
        <MetricCard icon={Timer} label="Session time" value={durationText} />
        <MetricCard icon={Flame} label="Calories burned" value={caloriesText} />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recent.length ? (
            recent.map((session) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
                key={session.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {EXERCISE_LABELS[session.exercise_type as keyof typeof EXERCISE_LABELS] ?? session.exercise_type}
                  </p>
                  <p className="truncate text-muted-foreground">{session.session_date}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums">{session.reps} reps</p>
                  <p className="tabular-nums text-muted-foreground">{session.duration_seconds}s</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No workout history yet. Finish a guided set to save one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="shrink-0 rounded-md bg-secondary p-2 text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
