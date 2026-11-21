import type { JingleStage } from './jingle_diagnostics.js';

/** Mutable timing state for the current jingle-generation stage. */
export interface JingleProgressTiming {
  stage: JingleStage;
  stage_started_at: number;
  stage_durations_ms: Partial<Record<JingleStage, number>>;
}

/**
 * Accumulates the current stage visit and starts another stage when it changes.
 *
 * @remarks Same-stage assignments leave the current visit start unchanged.
 * @param now - Monotonic timestamp in milliseconds.
 */
export function transition_jingle_stage(
  progress: JingleProgressTiming,
  stage: JingleStage,
  now: number,
): void {
  if (progress.stage === stage) return;
  progress.stage_durations_ms[progress.stage] =
    (progress.stage_durations_ms[progress.stage] ?? 0) + Math.max(0, now - progress.stage_started_at);
  progress.stage = stage;
  progress.stage_started_at = now;
}

/**
 * Adds the current stage visit to its accumulated duration.
 *
 * @remarks Call once when generation terminates.
 * @param now - Monotonic timestamp in milliseconds.
 */
export function finish_jingle_stage(progress: JingleProgressTiming, now: number): void {
  progress.stage_durations_ms[progress.stage] =
    (progress.stage_durations_ms[progress.stage] ?? 0) + Math.max(0, now - progress.stage_started_at);
}

/** Returns the non-negative elapsed milliseconds in the current stage visit. */
export function current_jingle_stage_elapsed_ms(progress: JingleProgressTiming, now: number): number {
  return Math.max(0, now - progress.stage_started_at);
}
