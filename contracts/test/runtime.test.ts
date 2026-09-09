// agent-commerce — the scripted agent runtime against the simulator.

import { describe, expect, it } from "vitest";
import { MarketSim } from "./simulator.js";
import {
  Agent,
  DEMO_BADGE,
  DEMO_SELLER_HISTORY,
  earnHistory,
  escrowId,
  runJob,
  runJobs,
} from "../src/runtime.js";

const ARBITER = new Uint8Array(32).fill(1);
const SELLER_SK = new Uint8Array(32).fill(2);
const BUYER_SK = new Uint8Array(32).fill(3);
const SALT = new Uint8Array(32).fill(9);

function agents() {
  return {
    buyer: new Agent("buyer", "buyer", BUYER_SK, SALT),
    seller: new Agent("seller", "seller", SELLER_SK, SALT),
  };
}

describe("agent runtime", () => {
  it("runs a job end to end and updates both ledgers", async () => {
    const sim = await MarketSim.deploy(ARBITER);
    const { buyer, seller } = agents();
    await sim.stakeBond(seller.secret, 5_000n);

    const outcome = await runJob(sim, buyer, seller, ARBITER, { escrowId: escrowId(1), price: 400n });

    expect(outcome.released).toBe(true);
    expect(seller.jobCount).toBe(1);
    expect(buyer.jobCount).toBe(1);
    expect(sim.ledger.escrows.lookup(escrowId(1)).state).toBe(3); // RELEASED
    expect(sim.ledger.reputationCommitments.member(seller.id)).toBe(true);
  });

  it("a failed job disputes, slashes the seller, and records a failure", async () => {
    const sim = await MarketSim.deploy(ARBITER);
    const { buyer, seller } = agents();
    await sim.stakeBond(seller.secret, 5_000n);

    const outcome = await runJob(sim, buyer, seller, ARBITER, {
      escrowId: escrowId(2),
      price: 1_000n,
      succeeds: false,
    });

    expect(outcome.disputed).toBe(true);
    expect(sim.ledger.bonds.lookup(seller.id)).toBe(4_000n); // 5000 - 1000
    expect(sim.ledger.slashedTotal).toBe(1_000n);
    expect(seller.jobCount).toBe(1);
  });

  it("runs a sequence and the seller can prove a threshold it has earned", async () => {
    const sim = await MarketSim.deploy(ARBITER);
    const { buyer, seller } = agents();
    await sim.stakeBond(seller.secret, 10_000n);

    await runJobs(
      sim,
      buyer,
      seller,
      ARBITER,
      Array.from({ length: 6 }, (_, i) => ({ escrowId: escrowId(100 + i), price: 2_000n })),
    );

    expect(seller.jobCount).toBe(6);
    // 6 successes, volume 12_000
    expect(await sim.proveReputation(seller.privateState, 6n, 10_000n, 12_000n)).toBe(true);
    expect(await sim.proveReputation(seller.privateState, 7n, 10_000n, 12_000n)).toBe(false);
  });

  it("a history earned through real escrows clears the marketplace badge", async () => {
    const sim = await MarketSim.deploy(ARBITER);
    const seller = new Agent("seller", "seller", SELLER_SK, SALT);
    const buyer = new Agent("buyer", "buyer");

    await earnHistory(sim, buyer, seller, ARBITER, DEMO_SELLER_HISTORY);

    const ok = await sim.proveReputation(
      seller.privateState,
      DEMO_BADGE.minJobs,
      DEMO_BADGE.minRateBps,
      DEMO_BADGE.minVolume,
    );
    expect(ok).toBe(true);
    expect(seller.jobCount).toBe(DEMO_SELLER_HISTORY.jobs);
    // 55 jobs, 2 slashed -> 53 successes at 300 each.
    expect(seller.reputation).toEqual({ total: 55n, successes: 53n, volume: 15_900n });
  }, 60_000);
});
