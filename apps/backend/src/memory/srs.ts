import type { MasteryLevel } from "../generated/prisma/enums.js";

// Spaced repetition for secure concepts — a Leitner ladder (increasing
// intervals, no per-card ease factor). A concept's review_step indexes this
// ladder; a successful re-review of a still-secure concept advances the step,
// so the next interval grows. emerging/developing are not spaced (always
// eligible — brief §5.3); only secure concepts age out via this ladder.
const DEFAULT_SECURE_INTERVALS_DAYS = [1, 2, 4, 8];

// Per-deployment override: SRS_SECURE_INTERVALS_DAYS="1,3,7,16". Pure (env
// injectable) so the policy is testable without a live process environment.
export function secureIntervalsDays(
  env: NodeJS.ProcessEnv = process.env,
): number[] {
  const raw = env.SRS_SECURE_INTERVALS_DAYS;
  if (!raw) {
    return DEFAULT_SECURE_INTERVALS_DAYS;
  }
  const parsed = raw.split(",").map((part) => Number(part.trim()));
  if (parsed.length === 0 || parsed.some((n) => Number.isNaN(n) || n <= 0)) {
    throw new Error(`Invalid SRS_SECURE_INTERVALS_DAYS: ${raw}`);
  }
  return parsed;
}

// The Leitner step after a revision resolves a concept. Only a still-secure
// concept climbs (longer next interval); becoming secure starts at the bottom,
// and dropping below secure resets it (it returns to the always-eligible tiers).
export function nextReviewStep(
  prevLevel: MasteryLevel | null,
  newLevel: MasteryLevel,
  prevStep: number,
  ladderLength: number,
): number {
  if (newLevel !== "secure") {
    return 0;
  }
  if (prevLevel === "secure") {
    return Math.min(prevStep + 1, ladderLength - 1);
  }
  return 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Whether a secure concept is due again. A missing timestamp (never stamped
// under the SRS) counts as due. Dueness is derived at read time against now —
// nothing materialized (brief §5.3).
export function isSecureDue(
  lastReviewedAt: Date | null,
  reviewStep: number,
  now: Date,
  intervalsDays: number[],
): boolean {
  if (lastReviewedAt === null) {
    return true;
  }
  const index = Math.min(Math.max(reviewStep, 0), intervalsDays.length - 1);
  const days = intervalsDays[index];
  if (days === undefined) {
    return true;
  }
  return now.getTime() - lastReviewedAt.getTime() >= days * DAY_MS;
}
