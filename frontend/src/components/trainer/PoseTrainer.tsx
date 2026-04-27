import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, RefreshCcw, Save, Sparkles } from "lucide-react";
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { createTracker } from "@/lib/trackers";
import { estimateCalories, EXERCISE_LABELS, isPoseFrameComplete } from "@/lib/trainer-utils";
import { api } from "@/lib/api";
import type { ExerciseType, PoseFrame, ProfileRow, WorkoutSessionRow } from "@/types/trainer";
import { StatsPanel } from "./StatsPanel";

const LANDMARK_INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

interface PoseTrainerProps {
  userId: string;
}

export function PoseTrainer({ userId }: PoseTrainerProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(createTracker("squat"));
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [exercise, setExercise] = useState<ExerciseType>("squat");
  const [feedback, setFeedback] = useState("Allow camera access to start guided training.");
  const [reps, setReps] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<WorkoutSessionRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const calories = useMemo(() => estimateCalories(exercise, reps, durationSeconds), [exercise, reps, durationSeconds]);

  useEffect(() => {
    trackerRef.current = createTracker(exercise);
    setReps(0);
    setDurationSeconds(0);
    setTimerActive(false);
    startTimeRef.current = null;
  }, [exercise]);

  // Independent real-time timer: ticks every second while active,
  // decoupled from pose detection so reps and time stay in sync in real time.
  useEffect(() => {
    if (!timerActive) return;
    const interval = window.setInterval(() => {
      if (startTimeRef.current) {
        setDurationSeconds(Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)));
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [timerActive]);

  useEffect(() => {
    void loadProfile();
    void loadSessions();
  }, [userId]);

  useEffect(() => {
    let disposed = false;

    async function startCamera() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm",
        );
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!disposed) {
          setCameraReady(true);
          setCameraError(null);
          loop();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Camera could not start.";
        setCameraError(message);
        setFeedback("Camera access is required on localhost or HTTPS.");
      }
    }

    void startCamera();

    return () => {
      disposed = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker) return;
    if (video.readyState < 2) {
      animationRef.current = requestAnimationFrame(loop);
      return;
    }

    const result = landmarker.detectForVideo(video, performance.now());
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const landmarks = result.landmarks[0];
    if (landmarks) {
      drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
      const poseFrame = toPoseFrame(landmarks);
      if (poseFrame && isPoseFrameComplete(poseFrame)) {
        if (!startTimeRef.current) {
          startTimeRef.current = Date.now();
          setTimerActive(true);
        }
        const next = trackerRef.current.process(poseFrame);
        setFeedback(next.feedback);
        setReps(next.reps);
      }
    } else {
      setFeedback("No body detected. Step back until your full form is visible.");
    }

    animationRef.current = requestAnimationFrame(loop);
  }

  async function loadProfile() {
    try {
      const profile = await api.getProfile();
      setProfile(profile as ProfileRow | null);
    } catch {
      // ignore
    }
  }

  async function loadSessions() {
    try {
      const sessions = await api.listSessions(8);
      setSessions(sessions as unknown as WorkoutSessionRow[]);
    } catch {
      // ignore
    }
  }

  async function saveSession() {
    setSaving(true);
    try {
      await api.createSession({
        exercise_type: exercise,
        reps,
        duration_seconds: durationSeconds,
        feedback_summary: feedback,
        calories_estimate: calories,
      });
      toast({ title: "Session saved", description: "Your workout history has been updated." });
      await loadSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save session";
      toast({ title: "Could not save session", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function resetCurrentSet() {
    trackerRef.current.reset();
    setReps(0);
    setDurationSeconds(0);
    startTimeRef.current = Date.now();
    setTimerActive(true);
    setFeedback("Set reset. Resume with smooth controlled reps.");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-border/70 bg-card/95">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Guided camera trainer</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile?.display_name ? `${profile.display_name}, stay centered and move deliberately.` : "Stay centered and move deliberately."}
                </p>
              </div>
              <Tabs onValueChange={(value) => setExercise(value as ExerciseType)} value={exercise}>
                <TabsList className="grid h-auto grid-cols-3 gap-1 bg-secondary/80">
                  <TabsTrigger value="pushup">Pushups</TabsTrigger>
                  <TabsTrigger value="squat">Squats</TabsTrigger>
                  <TabsTrigger value="press">Press</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative aspect-[4/3] overflow-hidden bg-hero">
              <video className="hidden" muted playsInline ref={videoRef} />
              <canvas className="h-full w-full object-cover" ref={canvasRef} />
              <motion.div
                animate={{ opacity: [0.65, 1, 0.65] }}
                className="absolute left-4 top-4 rounded-md bg-card/90 px-3 py-2 text-sm shadow-sm"
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Sparkles className="text-primary" />
                  {EXERCISE_LABELS[exercise]}
                </div>
                <p className="mt-1 text-muted-foreground">{cameraReady ? feedback : "Starting camera..."}</p>
              </motion.div>
              {!cameraReady ? (
                <div className="absolute inset-0 flex items-center justify-center bg-hero/80 text-center text-hero-foreground">
                  <div className="space-y-2 px-6">
                    <Camera className="mx-auto h-8 w-8" />
                    <p>{cameraError ?? "Allow webcam access to begin."}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live guidance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-secondary p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current feedback
                </p>
                <p className="mt-2 break-words text-base font-semibold leading-snug text-secondary-foreground sm:text-lg">
                  {feedback}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0 rounded-md border border-border/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Reps</p>
                  <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{reps}</p>
                </div>
                <div className="min-w-0 rounded-md border border-border/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Time</p>
                  <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
                    {formatDuration(durationSeconds)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={saveSession} disabled={saving || reps === 0}>
                  <Save />
                  {saving ? "Saving..." : "Save session"}
                </Button>
                <Button className="flex-1" onClick={resetCurrentSet} variant="secondary">
                  <RefreshCcw />
                  Reset set
                </Button>
              </div>
            </CardContent>
          </Card>

          <StatsPanel calories={calories} currentReps={reps} durationSeconds={durationSeconds} sessions={sessions} />
        </div>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function toPoseFrame(landmarks: NormalizedLandmark[]): Partial<PoseFrame> | null {
  const frame = Object.fromEntries(
    Object.entries(LANDMARK_INDEX).map(([key, index]) => [key, landmarks[index] ? mapPoint(landmarks[index]) : undefined]),
  );

  return frame as Partial<PoseFrame>;
}

function mapPoint(point: NormalizedLandmark) {
  return { x: point.x, y: point.y, z: point.z, visibility: point.visibility };
}

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  const pairs: Array<[number, number]> = [
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ];

  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "hsla(190, 84%, 58%, 0.9)";
  ctx.fillStyle = "hsla(152, 53%, 49%, 0.95)";

  pairs.forEach(([start, end]) => {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  });

  Object.values(LANDMARK_INDEX).forEach((index) => {
    const point = landmarks[index];
    if (!point) return;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}
