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

/**
 * Rep-counting philosophy:
 * - Form warnings are ADVISORY — they update feedback but DO NOT block stage
 *   transitions or rep counts.
 * - A rep is invalidated (blocked) ONLY on gross asymmetry — e.g. one arm
 *   fully extended while the other isn't, or one arm clearly off to the side.
 * - Generous angle thresholds tolerate normal variation between left/right.
 */

class PushupTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    const leftAngle = calculateAngle(frame.leftShoulder, frame.leftElbow, frame.leftWrist);
    const rightAngle = calculateAngle(frame.rightShoulder, frame.rightElbow, frame.rightWrist);
    const shoulders = midpoint(frame.leftShoulder, frame.rightShoulder);
    const hips = midpoint(frame.leftHip, frame.rightHip);
    const ankles = midpoint(frame.leftAnkle, frame.rightAnkle);

    const torso = distance(shoulders, ankles) || 0.0001;
    const bodyBreak = Math.abs((hips.y - shoulders.y) - (ankles.y - hips.y)) / torso;

    // Only block on GROSS arm asymmetry (one arm bent, the other locked out)
    const armDelta = Math.abs(leftAngle - rightAngle);
    const grossArmAsymmetry = armDelta > 55;

    let advisory = "Lower with control";
    if (bodyBreak > 0.35) advisory = "Keep your body straight";
    else if (armDelta > 25) advisory = "Try to use both arms evenly";

    // Looser thresholds — count if BOTH arms are reasonably bent / extended
    const down = leftAngle < 110 && rightAngle < 110;
    const up = leftAngle > 145 && rightAngle > 145;

    if (grossArmAsymmetry) {
      return { feedback: "Use both arms together", reps: this.reps, stage: this.stage };
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

    return { feedback: advisory, reps: this.reps, stage: this.stage };
  }
}

class SquatTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    const leftKneeAngle = calculateAngle(frame.leftHip, frame.leftKnee, frame.leftAnkle);
    const rightKneeAngle = calculateAngle(frame.rightHip, frame.rightKnee, frame.rightAnkle);
    const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const kneeDelta = Math.abs(leftKneeAngle - rightKneeAngle);

    // Only block on GROSS leg asymmetry (e.g. one leg straight, the other bent deep)
    if (kneeDelta > 50) {
      return { feedback: "Bend both knees together", reps: this.reps, stage: this.stage };
    }

    // Looser depth thresholds
    if (kneeAngle < 115) {
      this.stage = "down";
      return { feedback: "Hold the depth", reps: this.reps, stage: this.stage };
    }

    if (kneeAngle > 150 && this.stage === "down") {
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

    const leftWristAbove = frame.leftWrist.y < frame.leftShoulder.y;
    const rightWristAbove = frame.rightWrist.y < frame.rightShoulder.y;
    const leftWristBelow = frame.leftWrist.y > frame.leftShoulder.y;
    const rightWristBelow = frame.rightWrist.y > frame.rightShoulder.y;

    // GROSS issues that should invalidate a rep:
    // 1. Only one arm raised overhead while the other stays low
    const onlyOneArmUp = leftWristAbove !== rightWristAbove;
    // 2. An arm clearly flared out to the side (way past shoulder line)
    const leftFlare = Math.abs(frame.leftWrist.x - frame.leftShoulder.x);
    const rightFlare = Math.abs(frame.rightWrist.x - frame.rightShoulder.x);
    const armWayOut = leftFlare > 0.28 || rightFlare > 0.28;
    // 3. Gross arm-angle asymmetry
    const armDelta = Math.abs(leftAngle - rightAngle);
    const grossAsymmetry = armDelta > 55;

    if (onlyOneArmUp) {
      return { feedback: "Raise both arms together", reps: this.reps, stage: this.stage };
    }
    if (armWayOut) {
      return { feedback: "Keep arms tracking near your shoulders", reps: this.reps, stage: this.stage };
    }
    if (grossAsymmetry) {
      return { feedback: "Press evenly with both arms", reps: this.reps, stage: this.stage };
    }

    // Looser thresholds — both arms reasonably bent at bottom, reasonably extended at top
    if (leftAngle < 110 && rightAngle < 110 && leftWristBelow && rightWristBelow) {
      this.stage = "down";
      return { feedback: "Press straight up", reps: this.reps, stage: this.stage };
    }

    if (leftAngle > 148 && rightAngle > 148 && leftWristAbove && rightWristAbove && this.stage === "down") {
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
