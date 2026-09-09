// Parity: the TS reference (reputation.ts) must agree with the compiled
// `proveReputation` circuit for every persona + threshold combination.

import { describe, expect, it } from "vitest";
import { agentState, job, MarketSim } from "./simulator.js";
import { DEMO_BADGE_THRESHOLDS, meetsReputation } from "../src/reputation.js";
import type { Job } from "../src/witnesses.js";

const ARBITER = new Uint8Array(32).fill(1);
const AGENT = new Uint8Array(32).fill(2);
const SALT = new Uint8Array(32).fill(7);
const c = (n: number) => new Uint8Array(32).fill(n);

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
        const ps = agentState(AGENT, SALT, ledger);
        await sim.updateReputation(ps);

        const tsResult = meetsReputation(ledger, minJobs, minRateBps, minVolume);
        const circuitResult = await sim.proveReputation(ps, minJobs, minRateBps, minVolume);
        expect(circuitResult).toBe(tsResult);
      });
    }
  }
});

describe("demo badge thresholds", () => {
  it("a seeded strong history clears >=50 jobs / >=95% / >=$10k", () => {
    const seeded: Job[] = Array.from({ length: 55 }, (_, i) => job(c((i % 200) + 1), 300n, i % 20 !== 0));
    // 55 jobs, 3 failures -> 52 successes, 94.5%... bump to all-but-2
    const strong: Job[] = Array.from({ length: 55 }, (_, i) => job(c((i % 200) + 1), 300n, i >= 2));
    expect(meetsReputation(seeded, DEMO_BADGE_THRESHOLDS.minJobs, DEMO_BADGE_THRESHOLDS.minRateBps, DEMO_BADGE_THRESHOLDS.minVolume)).toBe(false);
    expect(meetsReputation(strong, DEMO_BADGE_THRESHOLDS.minJobs, DEMO_BADGE_THRESHOLDS.minRateBps, DEMO_BADGE_THRESHOLDS.minVolume)).toBe(true);
  });
});
