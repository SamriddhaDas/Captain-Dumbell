export type ExerciseType = "pushup" | "squat" | "press";

export type ExerciseStage = "ready" | "down";

export interface PosePoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PoseFrame {
  leftShoulder: PosePoint;
  rightShoulder: PosePoint;
  leftElbow: PosePoint;
  rightElbow: PosePoint;
  leftWrist: PosePoint;
  rightWrist: PosePoint;
  leftHip: PosePoint;
  rightHip: PosePoint;
  leftKnee: PosePoint;
  rightKnee: PosePoint;
  leftAnkle: PosePoint;
  rightAnkle: PosePoint;
}

export interface TrackerResult {
  feedback: string;
  reps: number;
  stage: ExerciseStage;
}

export interface WorkoutSessionRow {
  id: string;
  exercise_type: string;
  reps: number;
  duration_seconds: number;
  feedback_summary: string | null;
  calories_estimate: number;
  session_date: string;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  training_goal: string | null;
}
