import type { ExerciseStage, ExerciseType, PoseFrame, TrackerResult } from "@/types/trainer";
import { calculateAngle, distance, midpoint } from "@/lib/trainer-utils";

abstract class BaseTracker {
  protected reps = 0;
  protected stage: ExerciseStage = "ready";

  getSnapshot(): TrackerResult {
    return {
      feedback: "Align yourself in frame",
      reps: this.reps,
      stage: this.stage,
    };
  }

  reset() {
    this.reps = 0;
    this.stage = "ready";
  }

  abstract process(frame: PoseFrame): TrackerResult;
}

class PushupTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    const leftAngle = calculateAngle(frame.leftShoulder, frame.leftElbow, frame.leftWrist);
    const rightAngle = calculateAngle(frame.rightShoulder, frame.rightElbow, frame.rightWrist);
    const shoulders = midpoint(frame.leftShoulder, frame.rightShoulder);
    const hips = midpoint(frame.leftHip, frame.rightHip);
    const ankles = midpoint(frame.leftAnkle, frame.rightAnkle);

    const torso = distance(shoulders, ankles) || 0.0001;
    const bodyBreak = Math.abs((hips.y - shoulders.y) - (ankles.y - hips.y)) / torso;

    if (bodyBreak > 0.22) {
      return { feedback: "Keep your body straight", reps: this.reps, stage: this.stage };
    }

    const down = leftAngle < 95 && rightAngle < 95;
    const up = leftAngle > 155 && rightAngle > 155;

    if (Math.abs(leftAngle - rightAngle) > 18) {
      return { feedback: "Use both arms evenly", reps: this.reps, stage: this.stage };
    }

    if (down) {
      this.stage = "down";
      return { feedback: "Drive through both palms", reps: this.reps, stage: this.stage };
    }

    if (up && this.stage === "down") {
      this.reps += 1;
      this.stage = "ready";
      return { feedback: "Great pushup rep", reps: this.reps, stage: this.stage };
    }

    return { feedback: "Lower with control", reps: this.reps, stage: this.stage };
  }
}

class SquatTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    const kneeAngle = calculateAngle(frame.leftHip, frame.leftKnee, frame.leftAnkle);
    const hipAngle = calculateAngle(frame.leftShoulder, frame.leftHip, frame.leftKnee);
    const shoulderWidth = Math.abs(frame.leftShoulder.x - frame.rightShoulder.x);
    const torsoHeight = Math.abs(frame.leftShoulder.y - frame.leftHip.y) || 0.0001;

    if (shoulderWidth / torsoHeight > 0.55) {
      return { feedback: "Turn sideways for squats", reps: this.reps, stage: this.stage };
    }

    if (hipAngle > 150) {
      return { feedback: "Keep chest proud", reps: this.reps, stage: this.stage };
    }

    if (kneeAngle < 102) {
      this.stage = "down";
      return { feedback: "Hold the depth", reps: this.reps, stage: this.stage };
    }

    if (kneeAngle > 158 && this.stage === "down") {
      this.reps += 1;
      this.stage = "ready";
      return { feedback: "Strong squat rep", reps: this.reps, stage: this.stage };
    }

    return { feedback: "Sit back and go deeper", reps: this.reps, stage: this.stage };
  }
}

class PressTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    const leftAngle = calculateAngle(frame.leftShoulder, frame.leftElbow, frame.leftWrist);
    const rightAngle = calculateAngle(frame.rightShoulder, frame.rightElbow, frame.rightWrist);
    const wristsAbove = frame.leftWrist.y < frame.leftShoulder.y && frame.rightWrist.y < frame.rightShoulder.y;
    const wristsBelow = frame.leftWrist.y > frame.leftShoulder.y && frame.rightWrist.y > frame.rightShoulder.y;

    if (Math.abs(frame.leftWrist.x - frame.leftShoulder.x) > 0.12 || Math.abs(frame.rightWrist.x - frame.rightShoulder.x) > 0.12) {
      return { feedback: "Keep arms stacked over shoulders", reps: this.reps, stage: this.stage };
    }

    if (leftAngle < 95 && rightAngle < 95 && wristsBelow) {
      this.stage = "down";
      return { feedback: "Press straight up", reps: this.reps, stage: this.stage };
    }

    if (leftAngle > 158 && rightAngle > 158 && wristsAbove && this.stage === "down") {
      this.reps += 1;
      this.stage = "ready";
      return { feedback: "Locked out cleanly", reps: this.reps, stage: this.stage };
    }

    return { feedback: "Brace and press evenly", reps: this.reps, stage: this.stage };
  }
}

export function createTracker(exercise: ExerciseType) {
  switch (exercise) {
    case "pushup":
      return new PushupTracker();
    case "squat":
      return new SquatTracker();
    case "press":
      return new PressTracker();
    default:
      return new SquatTracker();
  }
}
