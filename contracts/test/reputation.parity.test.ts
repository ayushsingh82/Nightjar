// Parity: the TS reference (reputation.ts) must agree with the compiled
// `proveReputation` circuit for every persona + threshold combination.

import { describe, expect, it } from "vitest";
import { earnStats, MarketSim } from "./simulator.js";
import { aggregate, DEMO_BADGE_THRESHOLDS, meetsReputation } from "../src/reputation.js";
import type { Job } from "../src/witnesses.js";

const ARBITER = new Uint8Array(32).fill(1);
const AGENT = new Uint8Array(32).fill(2);
const BUYER = new Uint8Array(32).fill(3);
const SALT = new Uint8Array(32).fill(7);
const c = (n: number) => new Uint8Array(32).fill(n);

const job = (client: Uint8Array, price: bigint, success: boolean): Job => ({ client, price, success });

// Each persona is a history that gets *run* through real escrows, not asserted.
const personas: Record<string, Job[]> = {
  strong: Array.from({ length: 12 }, (_, i) => job(c(40 + i), 1000n + BigInt(i) * 100n, i !== 3)),
  thin: [job(c(80), 500n, true), job(c(81), 700n, false)],
  perfect: Array.from({ length: 6 }, (_, i) => job(c(90 + i), 2000n, true)),
  empty: [],
};

const thresholds: Array<[bigint, bigint, bigint]> = [
  [1n, 5000n, 0n],
  [5n, 9000n, 5000n],
  [10n, 9500n, 10_000n],
  [3n, 10000n, 1000n],
  [0n, 0n, 0n],
];

describe("reputation.ts <-> proveReputation circuit parity", () => {
  for (const [name, ledger] of Object.entries(personas)) {
    for (const [minJobs, minRateBps, minVolume] of thresholds) {
      it(`${name} @ (${minJobs}, ${minRateBps}, ${minVolume})`, async () => {
        const sim = await MarketSim.deploy(ARBITER);
        const ps = await earnStats(sim, {
          seller: AGENT,
          sellerSalt: SALT,
          buyer: BUYER,
          arbiter: ARBITER,
          jobs: ledger.map((j) => ({ price: j.price, success: j.success })),
        });

        const tsResult = meetsReputation(aggregate(ledger), minJobs, minRateBps, minVolume);
        const circuitResult = await sim.proveReputation(ps, minJobs, minRateBps, minVolume);
        expect(circuitResult).toBe(tsResult);
      });
    }
  }
});

describe("demo badge thresholds", () => {
  it("a seeded strong history clears >=50 jobs / >=95% / >=$10k", () => {
    const t = DEMO_BADGE_THRESHOLDS;
    // 55 jobs with every 20th failed -> 52/55 = 94.5%, just under the bar.
    const nearMiss: Job[] = Array.from({ length: 55 }, (_, i) => job(c((i % 200) + 1), 300n, i % 20 !== 0));
    // 55 jobs, the first 2 failed -> 53/55 = 96.3%, volume 15,900.
    const strong: Job[] = Array.from({ length: 55 }, (_, i) => job(c((i % 200) + 1), 300n, i >= 2));
    expect(meetsReputation(aggregate(nearMiss), t.minJobs, t.minRateBps, t.minVolume)).toBe(false);
    expect(meetsReputation(aggregate(strong), t.minJobs, t.minRateBps, t.minVolume)).toBe(true);
  });
});
