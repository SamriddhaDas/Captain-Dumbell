import type { ExerciseStage, ExerciseType, PoseFrame, TrackerResult } from "@/types/trainer";
import { calculateAngle, distance, midpoint } from "@/lib/trainer-utils";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum MediaPipe landmark visibility score to trust a point (0–1). */
const MIN_VISIBILITY = 0.55;

/**
 * Minimum consecutive frames a pose must be held before a stage transition
 * fires. At ~30 fps this is roughly 100 ms — enough to reject single-frame
 * jitter without feeling sluggish.
 */
const CONFIRM_FRAMES = 3;

/** Minimum milliseconds between two consecutive rep counts. Prevents a slow
 *  pass through a threshold from counting 2–3 reps instead of 1.
 */
const REP_COOLDOWN_MS = 600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true only if ALL supplied PosePoints have a visibility score above
 * MIN_VISIBILITY. When MediaPipe can't see a joint clearly the score drops and
 * we should skip the frame rather than feed garbage angles to the tracker.
 */
function pointsVisible(...points: Array<{ visibility?: number }>): boolean {
  return points.every((p) => (p.visibility ?? 0) >= MIN_VISIBILITY);
}

// ─── Base tracker ─────────────────────────────────────────────────────────────

abstract class BaseTracker {
  protected reps = 0;
  protected stage: ExerciseStage = "ready";

  /** Consecutive-frame counter for the pending stage candidate. */
  private pendingStage: ExerciseStage | null = null;
  private pendingCount = 0;

  /** Timestamp of the last accepted rep — used for cooldown. */
  private lastRepTime = 0;

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
    this.pendingStage = null;
    this.pendingCount = 0;
    this.lastRepTime = 0;
  }

  /**
   * Subclasses call this instead of mutating `this.stage` directly.
   * The stage only actually changes after `CONFIRM_FRAMES` consecutive frames
   * report the same candidate, which eliminates single-frame noise.
   *
   * @returns true when the stage transition committed.
   */
  protected tryTransitionTo(candidate: ExerciseStage): boolean {
    if (candidate === this.stage) {
      this.pendingStage = null;
      this.pendingCount = 0;
      return false;
    }

    if (this.pendingStage === candidate) {
      this.pendingCount++;
    } else {
      this.pendingStage = candidate;
      this.pendingCount = 1;
    }

    if (this.pendingCount >= CONFIRM_FRAMES) {
      this.stage = candidate;
      this.pendingStage = null;
      this.pendingCount = 0;
      return true;
    }

    return false;
  }

  /**
   * Increments the rep counter only if the cooldown period has elapsed.
   * Returns true when a rep was actually counted.
   */
  protected tryCountRep(): boolean {
    const now = Date.now();
    if (now - this.lastRepTime < REP_COOLDOWN_MS) return false;
    this.reps += 1;
    this.lastRepTime = now;
    return true;
  }

  abstract process(frame: PoseFrame): TrackerResult;
}

// ─── Push-up tracker ──────────────────────────────────────────────────────────

class PushupTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    // 1. Visibility gate
    if (
      !pointsVisible(
        frame.leftShoulder, frame.rightShoulder,
        frame.leftElbow,    frame.rightElbow,
        frame.leftWrist,    frame.rightWrist,
      )
    ) {
      return { feedback: "Make sure arms are fully visible", reps: this.reps, stage: this.stage };
    }

    // 2. Angles & geometry
    const leftAngle  = calculateAngle(frame.leftShoulder,  frame.leftElbow,  frame.leftWrist);
    const rightAngle = calculateAngle(frame.rightShoulder, frame.rightElbow, frame.rightWrist);
    const armDelta   = Math.abs(leftAngle - rightAngle);

    const shoulders = midpoint(frame.leftShoulder, frame.rightShoulder);
    const hips      = midpoint(frame.leftHip,      frame.rightHip);
    const ankles    = midpoint(frame.leftAnkle,    frame.rightAnkle);
    const torso     = distance(shoulders, ankles) || 0.0001;
    const bodyBreak = Math.abs((hips.y - shoulders.y) - (ankles.y - hips.y)) / torso;

    // 3. Hard block: gross arm asymmetry
    if (armDelta > 50) {
      return { feedback: "Use both arms together", reps: this.reps, stage: this.stage };
    }

    // 4. Advisory
    let advisory = "Lower with control";
    if (bodyBreak > 0.30) advisory = "Keep your body straight — avoid sagging hips";
    else if (armDelta > 22) advisory = "Try to use both arms evenly";

    // 5. Stage machine
    const bothDown = leftAngle < 100 && rightAngle < 100;
    const bothUp   = leftAngle > 150 && rightAngle > 150;

    if (bothDown) {
      this.tryTransitionTo("down");
      return { feedback: "Drive through both palms", reps: this.reps, stage: this.stage };
    }

    if (bothUp && this.stage === "down") {
      const committed = this.tryTransitionTo("ready");
      if (committed) {
        this.tryCountRep();
        return { feedback: "Great pushup rep!", reps: this.reps, stage: this.stage };
      }
      return { feedback: "Almost — push all the way up", reps: this.reps, stage: this.stage };
    }

    return { feedback: advisory, reps: this.reps, stage: this.stage };
  }
}

// ─── Squat tracker ────────────────────────────────────────────────────────────

class SquatTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    // 1. Visibility gate
    if (
      !pointsVisible(
        frame.leftHip,   frame.rightHip,
        frame.leftKnee,  frame.rightKnee,
        frame.leftAnkle, frame.rightAnkle,
      )
    ) {
      return { feedback: "Step back — make sure legs are fully visible", reps: this.reps, stage: this.stage };
    }

    // 2. Angles
    const leftKneeAngle  = calculateAngle(frame.leftHip,  frame.leftKnee,  frame.leftAnkle);
    const rightKneeAngle = calculateAngle(frame.rightHip, frame.rightKnee, frame.rightAnkle);
    const kneeAngle      = (leftKneeAngle + rightKneeAngle) / 2;
    const kneeDelta      = Math.abs(leftKneeAngle - rightKneeAngle);

    const hipY  = midpoint(frame.leftHip,  frame.rightHip).y;
    const kneeY = midpoint(frame.leftKnee, frame.rightKnee).y;

    // 3. Hard block: gross leg asymmetry
    if (kneeDelta > 45) {
      return { feedback: "Bend both knees together", reps: this.reps, stage: this.stage };
    }

    // 4. Advisory
    let advisory = "Sit back and go deeper";
    if (this.stage === "down" && hipY > kneeY + 0.05) {
      advisory = "Push knees out and drive hips back";
    }

    // 5. Stage machine
    if (kneeAngle < 105) {
      this.tryTransitionTo("down");
      return { feedback: "Hold the depth", reps: this.reps, stage: this.stage };
    }

    if (kneeAngle > 155 && this.stage === "down") {
      const committed = this.tryTransitionTo("ready");
      if (committed) {
        this.tryCountRep();
        return { feedback: "Strong squat rep!", reps: this.reps, stage: this.stage };
      }
      return { feedback: "Almost — stand all the way up", reps: this.reps, stage: this.stage };
    }

    return { feedback: advisory, reps: this.reps, stage: this.stage };
  }
}

// ─── Overhead-press tracker ───────────────────────────────────────────────────

class PressTracker extends BaseTracker {
  process(frame: PoseFrame): TrackerResult {
    // 1. Visibility gate
    if (
      !pointsVisible(
        frame.leftShoulder, frame.rightShoulder,
        frame.leftElbow,    frame.rightElbow,
        frame.leftWrist,    frame.rightWrist,
      )
    ) {
      return { feedback: "Make sure arms are fully visible overhead", reps: this.reps, stage: this.stage };
    }

    // 2. Angles & geometry
    const leftAngle  = calculateAngle(frame.leftShoulder,  frame.leftElbow,  frame.leftWrist);
    const rightAngle = calculateAngle(frame.rightShoulder, frame.rightElbow, frame.rightWrist);
    const armDelta   = Math.abs(leftAngle - rightAngle);

    const leftWristAbove  = frame.leftWrist.y  < frame.leftShoulder.y;
    const rightWristAbove = frame.rightWrist.y < frame.rightShoulder.y;
    const leftWristBelow  = frame.leftWrist.y  > frame.leftShoulder.y;
    const rightWristBelow = frame.rightWrist.y > frame.rightShoulder.y;

    const leftFlare  = Math.abs(frame.leftWrist.x  - frame.leftShoulder.x);
    const rightFlare = Math.abs(frame.rightWrist.x - frame.rightShoulder.x);

    // 3. Hard blocks
    if (leftWristAbove !== rightWristAbove) {
      return { feedback: "Raise both arms together", reps: this.reps, stage: this.stage };
    }
    if (leftFlare > 0.25 || rightFlare > 0.25) {
      return { feedback: "Keep arms tracking close to your shoulders", reps: this.reps, stage: this.stage };
    }
    if (armDelta > 50) {
      return { feedback: "Press evenly with both arms", reps: this.reps, stage: this.stage };
    }

    // 4. Stage machine
    const atBottom = leftAngle < 105 && rightAngle < 105 && leftWristBelow && rightWristBelow;
    const atTop    = leftAngle > 155 && rightAngle > 155 && leftWristAbove && rightWristAbove;

    if (atBottom) {
      this.tryTransitionTo("down");
      return { feedback: "Brace core and press straight up", reps: this.reps, stage: this.stage };
    }

    if (atTop && this.stage === "down") {
      const committed = this.tryTransitionTo("ready");
      if (committed) {
        this.tryCountRep();
        return { feedback: "Locked out cleanly!", reps: this.reps, stage: this.stage };
      }
      return { feedback: "Press all the way to lockout", reps: this.reps, stage: this.stage };
    }

    return { feedback: "Brace and press evenly", reps: this.reps, stage: this.stage };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTracker(exercise: ExerciseType) {
  switch (exercise) {
    case "pushup": return new PushupTracker();
    case "squat":  return new SquatTracker();
    case "press":  return new PressTracker();
    default:       return new SquatTracker();
  }
}
