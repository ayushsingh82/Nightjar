// Nightjar — TS reference for the reputation thresholds.
//
// MUST stay in lockstep with `proveReputation` in marketplace.compact:
//   okJobs   : successes >= minJobs
//   okRate   : successes * 10000 >= total * minRateBps
//   okVolume : volume >= minVolume
// Parity-tested in contracts/test/reputation.parity.test.ts.
//
// The aggregate itself is maintained by `applySettlement` in witnesses.ts, one
// settled escrow at a time, mirroring the circuit's transition.

import type { Job, ReputationStats } from "./witnesses";

export type { ReputationStats };

/**
 * Roll a list of jobs into an aggregate. Used to build a fixture or to check a
 * client's own bookkeeping — never to authorise anything, because the contract
 * only ever advances the aggregate through settled escrows.
 */
export function aggregate(jobs: Job[]): ReputationStats {
  let total = 0n;
  let successes = 0n;
  let volume = 0n;
  for (const j of jobs) {
    total += 1n;
    if (j.success) {
      successes += 1n;
      volume += j.price;
    }
  }
  return { total, successes, volume };
}

export function meetsReputation(
  stats: ReputationStats,
  minJobs: bigint,
  minRateBps: bigint,
  minVolume: bigint,
): boolean {
  if (minRateBps > 10000n) throw new Error("rate bps out of range");
  const okJobs = stats.successes >= minJobs;
  // successes / total >= minRateBps / 10000  ->  successes*10000 >= total*minRateBps
  const okRate = stats.successes * 10000n >= stats.total * minRateBps;
  const okVolume = stats.volume >= minVolume;
  return okJobs && okRate && okVolume;
}

// The marketplace badge is derived from the thresholds the agent chose to
// prove — never from these raw stats.
export const DEMO_BADGE_THRESHOLDS = {
  minJobs: 50n,
  minRateBps: 9500n, // 95%
  minVolume: 10_000n,
} as const;
