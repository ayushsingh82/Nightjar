// agent-commerce — TS reference for the reputation aggregation.
//
// MUST stay in lockstep with `proveReputation` in marketplace.compact:
//   fold over the padded ledger (LEDGER_CAP slots), skipping empty ones,
//   then okJobs && okRate && okVolume.
// Parity-tested in contracts/test/reputation.parity.test.ts.

import type { Job } from "./witnesses";

const ZERO32 = new Uint8Array(32);

function isEmpty(job: Job): boolean {
  return job.client.length === ZERO32.length && job.client.every((x) => x === 0);
}

export type ReputationStats = {
  totalJobs: bigint;
  successfulJobs: bigint;
  volume: bigint; // sum of price over successful jobs
};

export function aggregate(ledger: Job[]): ReputationStats {
  let total = 0n;
  let successes = 0n;
  let volume = 0n;
  for (const j of ledger) {
    if (isEmpty(j)) continue;
    total += 1n;
    if (j.success) {
      successes += 1n;
      volume += j.price;
    }
  }
  return { totalJobs: total, successfulJobs: successes, volume };
}

export function meetsReputation(
  ledger: Job[],
  minJobs: bigint,
  minRateBps: bigint,
  minVolume: bigint,
): boolean {
  if (minRateBps > 10000n) throw new Error("rate bps out of range");
  const s = aggregate(ledger);
  const okJobs = s.successfulJobs >= minJobs;
  // successes / total >= minRateBps / 10000  ->  successes*10000 >= total*minRateBps
  const okRate = s.successfulJobs * 10000n >= s.totalJobs * minRateBps;
  const okVolume = s.volume >= minVolume;
  return okJobs && okRate && okVolume;
}

// The marketplace badge is derived from the thresholds the agent chose to
// prove — never from these raw stats.
export const DEMO_BADGE_THRESHOLDS = {
  minJobs: 50n,
  minRateBps: 9500n, // 95%
  minVolume: 10_000n,
} as const;
