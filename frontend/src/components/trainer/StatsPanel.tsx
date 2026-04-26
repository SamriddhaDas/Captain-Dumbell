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

export function StatsPanel({ currentReps, durationSeconds, calories, sessions }: StatsPanelProps) {
  const recent = sessions.slice(0, 4);
  const caloriesText = Number.isFinite(calories) ? `${calories.toFixed(2)} kcal` : "0.00 kcal";
  const durationText = durationSeconds > 0 ? `${durationSeconds} sec` : "0 sec";

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={History} label="Reps completed" value={String(currentReps)} />
        <MetricCard icon={Timer} label="Session time" value={durationText} />
        <MetricCard icon={Flame} label="Calories burned" value={caloriesText} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recent.length ? (
            recent.map((session) => (
              <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm" key={session.id}>
                <div>
                  <p className="font-medium">{EXERCISE_LABELS[session.exercise_type as keyof typeof EXERCISE_LABELS] ?? session.exercise_type}</p>
                  <p className="text-muted-foreground">{session.session_date}</p>
                </div>
                <div className="text-right">
                  <p>{session.reps} reps</p>
                  <p className="text-muted-foreground">{session.duration_seconds} sec</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No workout history yet. Finish a guided set to save one.</p>
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
        <div className="rounded-md bg-secondary p-2 text-secondary-foreground">
          <Icon />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
