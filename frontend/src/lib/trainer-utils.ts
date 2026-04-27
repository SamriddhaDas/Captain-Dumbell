import type { PoseFrame, PosePoint } from "@/types/trainer";

export const EXERCISE_LABELS = {
  pushup: "Pushups",
  squat: "Squats",
  press: "Overhead Press",
} as const;

export function calculateAngle(a: PosePoint, b: PosePoint, c: PosePoint) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export function midpoint(a: PosePoint, b: PosePoint): PosePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: PosePoint, b: PosePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function estimateCalories(exercise: keyof typeof EXERCISE_LABELS, reps: number, durationSeconds: number) {
  const repFactor = {
    pushup: 0.42,
    squat: 0.32,
    press: 0.28,
  }[exercise];

  const timeFactor = durationSeconds / 90;
  return Number((reps * repFactor + timeFactor).toFixed(2));
}

/** Minimum MediaPipe visibility score required for a landmark to be trusted. */
const POSE_MIN_VISIBILITY = 0.4;

/**
 * Returns true only when every landmark in the frame is present AND has a
 * MediaPipe visibility score above POSE_MIN_VISIBILITY.
 *
 * Previously only checked for landmark existence — low-confidence points
 * (occluded or partially off-screen) passed through and produced unreliable
 * angles that caused phantom reps.
 */
export function isPoseFrameComplete(frame: Partial<PoseFrame>): frame is PoseFrame {
  const required: Array<keyof PoseFrame> = [
    "leftShoulder", "rightShoulder",
    "leftElbow",    "rightElbow",
    "leftWrist",    "rightWrist",
    "leftHip",      "rightHip",
    "leftKnee",     "rightKnee",
    "leftAnkle",    "rightAnkle",
  ];

  return required.every((key) => {
    const point = frame[key];
    return point !== undefined && (point.visibility ?? 0) >= POSE_MIN_VISIBILITY;
  });
}
