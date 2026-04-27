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

  // Note: reps/time/calories values are intentionally not rendered here.
  // Per design, the live guidance area shows only the metric icons (logos).
  void currentReps;
  void durationSeconds;
  void calories;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={History} ariaLabel="Reps completed" />
        <MetricCard icon={Timer} ariaLabel="Session time" />
        <MetricCard icon={Flame} ariaLabel="Calories burned" />
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

function MetricCard({ icon: Icon, ariaLabel }: { icon: typeof Flame; ariaLabel: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center p-6">
        <div
          className="rounded-md bg-secondary p-3 text-secondary-foreground"
          role="img"
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          <Icon className="h-7 w-7" />
        </div>
      </CardContent>
    </Card>
  );
}
