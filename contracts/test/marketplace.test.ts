// Nightjar — core contract behaviour against the in-memory simulator
// (no proof server). Covers the milestone-1 checklist: escrow lifecycle,
// slashing math, reputation monotonicity, and proof soundness.

import { beforeEach, describe, expect, it } from "vitest";
import { agentState, earnStats, MarketSim } from "./simulator.js";
import { applySettlement, withEscrowNonce } from "../src/witnesses.js";
import { EscrowState } from "../src/managed/marketplace/contract/index.js";

const ARBITER = new Uint8Array(32).fill(1);
const NOT_ARBITER = new Uint8Array(32).fill(99);
const SELLER = new Uint8Array(32).fill(2);
const BUYER = new Uint8Array(32).fill(3);
const SALT = new Uint8Array(32).fill(9);

const eid = (n: number) => new Uint8Array(32).fill(n);
// One fixed opening for the lifecycle tests. The buyer commits to the seller
// with it; the seller proves against it. Real clients use a fresh one per job.
const NONCE = new Uint8Array(32).fill(0xa1);
const commitTo = (sim: MarketSim, secret: Uint8Array) =>
  sim.sellerCommitment(sim.agentId(secret), NONCE);

describe("nightjar marketplace core", () => {
  let sim: MarketSim;

  beforeEach(async () => {
    sim = await MarketSim.deploy(ARBITER);
  });

  describe("escrow lifecycle", () => {
    it("runs the happy path FUNDED -> DELIVERED -> RELEASED", async () => {
      const e = eid(10);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.FUNDED);
      expect(sim.ledger.escrowCount).toBe(1n);

      await sim.markDelivered(SELLER, e, NONCE);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.DELIVERED);

      await sim.release(BUYER, e);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.RELEASED);
    });

    it("rejects a reused escrow id", async () => {
      const e = eid(11);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await expect(sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1n)).rejects.toThrow(/already used/);
    });

    it("rejects buyer == seller, at the point the seller proves who it is", async () => {
      // `openEscrow` cannot see it any more — the seller is behind a
      // commitment — so the check moved to where the opening is proven.
      const e = eid(12);
      await sim.openEscrow(BUYER, e, commitTo(sim, BUYER), 1000n);
      await expect(sim.markDelivered(BUYER, e, NONCE)).rejects.toThrow(/must differ/);
    });

    it("an agent who is not the seller cannot open the commitment", async () => {
      const e = eid(17);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      const impostor = new Uint8Array(32).fill(77);
      await expect(sim.markDelivered(impostor, e, NONCE)).rejects.toThrow(/only the seller/);
    });

    it("a dispute naming the wrong seller is refused", async () => {
      const e = eid(18);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      const notTheSeller = sim.agentId(new Uint8Array(32).fill(88));
      await expect(sim.dispute(BUYER, e, notTheSeller, NONCE)).rejects.toThrow(
        /does not open the escrow commitment/,
      );
    });

    it("the escrow record does not carry the seller id", async () => {
      const e = eid(19);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      const record = sim.ledger.escrows.lookup(e);
      const sellerId = sim.agentId(SELLER);
      expect(record.buyer).toEqual(sim.agentId(BUYER));
      expect(record.sellerCommit).not.toEqual(sellerId);
      // And the id is nowhere in the serialized public state either.
      expect(sim.publicState).not.toContain(
        Array.from(sellerId, (b) => b.toString(16).padStart(2, "0")).join(""),
      );
    });

    it("only the seller can mark delivered", async () => {
      const e = eid(13);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await expect(sim.markDelivered(BUYER, e, NONCE)).rejects.toThrow(/only the seller/);
    });

    it("only the buyer can release", async () => {
      const e = eid(14);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await sim.markDelivered(SELLER, e, NONCE);
      await expect(sim.release(SELLER, e)).rejects.toThrow(/only the buyer/);
    });

    it("cannot release before delivery", async () => {
      const e = eid(15);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await expect(sim.release(BUYER, e)).rejects.toThrow(/not delivered/);
    });

    it("cannot dispute a released escrow", async () => {
      const e = eid(16);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await sim.markDelivered(SELLER, e, NONCE);
      await sim.release(BUYER, e);
      await expect(sim.dispute(BUYER, e, sim.agentId(SELLER), NONCE)).rejects.toThrow(/not disputable/);
    });
  });

  describe("slashing math", () => {
    it("slashes the seller bond by the escrow amount on seller fault", async () => {
      await sim.stakeBond(SELLER, 5000n);
      const e = eid(20);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1200n);
      await sim.dispute(BUYER, e, sim.agentId(SELLER), NONCE);
      await sim.resolveDispute(ARBITER, e, true);

      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(3800n); // 5000 - 1200
      expect(sim.ledger.slashedTotal).toBe(1200n);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.SLASHED);
    });

    it("caps the slash at the available bond when the bond is smaller", async () => {
      await sim.stakeBond(SELLER, 300n);
      const e = eid(21);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await sim.dispute(BUYER, e, sim.agentId(SELLER), NONCE);
      await sim.resolveDispute(ARBITER, e, true);

      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(0n);
      expect(sim.ledger.slashedTotal).toBe(300n); // not 1000
    });

    it("does not slash when the seller is not at fault", async () => {
      await sim.stakeBond(SELLER, 5000n);
      const e = eid(22);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await sim.dispute(BUYER, e, sim.agentId(SELLER), NONCE);
      await sim.resolveDispute(ARBITER, e, false);

      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(5000n);
      expect(sim.ledger.slashedTotal).toBe(0n);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.RELEASED);
    });

    it("only the arbiter can resolve a dispute", async () => {
      await sim.stakeBond(SELLER, 5000n);
      const e = eid(23);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await sim.dispute(BUYER, e, sim.agentId(SELLER), NONCE);
      await expect(sim.resolveDispute(NOT_ARBITER, e, true)).rejects.toThrow(/only the arbiter/);
      await expect(sim.resolveDispute(BUYER, e, true)).rejects.toThrow(/only the arbiter/);
    });

    it("cannot resolve an escrow that was never disputed", async () => {
      const e = eid(24);
      await sim.openEscrow(BUYER, e, commitTo(sim, SELLER), 1000n);
      await expect(sim.resolveDispute(ARBITER, e, true)).rejects.toThrow(/not disputed/);
    });

    it("withdrawBond cannot exceed the stake", async () => {
      await sim.stakeBond(SELLER, 1000n);
      await expect(sim.withdrawBond(SELLER, 1001n)).rejects.toThrow(/exceeds stake/);
      await sim.withdrawBond(SELLER, 400n);
      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(600n);
    });
  });

  describe("reputation", () => {
    // 4 jobs, 3 released: 3 successes, 3/4 = 7500 bps, volume 4000+3500+2600 = 10,100.
    // Earned through real escrows, because that is the only way the contract
    // will move an aggregate.
    const base = [
      { price: 4000n, success: true },
      { price: 3500n, success: true },
      { price: 2600n, success: true },
      { price: 900n, success: false },
    ];

    const earnBase = () =>
      earnStats(sim, { seller: SELLER, sellerSalt: SALT, buyer: BUYER, arbiter: ARBITER, jobs: base });

    it("proves a threshold the earned history supports", async () => {
      const ps = await earnBase();
      expect(await sim.proveReputation(ps, 3n, 7000n, 10_000n)).toBe(true);
    });

    it("fails a threshold the history does not support", async () => {
      const ps = await earnBase();
      expect(await sim.proveReputation(ps, 4n, 7000n, 10_000n)).toBe(false); // only 3 successes
      expect(await sim.proveReputation(ps, 3n, 8000n, 10_000n)).toBe(false); // rate 7500 < 8000
      expect(await sim.proveReputation(ps, 3n, 7000n, 11_000n)).toBe(false); // volume 10100 < 11000
    });

    it("a failed job counts toward the total but not the rate or volume", async () => {
      const ps = await earnBase();
      expect(ps.stats).toEqual({ total: 4n, successes: 3n, volume: 10_100n });
    });

    it("monotonicity: one more settled job raises what can be proven", async () => {
      let ps = await earnBase();
      expect(await sim.proveReputation(ps, 4n, 7000n, 15_000n)).toBe(false);

      const eid = new Uint8Array(32).fill(210);
      await sim.openEscrow(BUYER, eid, commitTo(sim, SELLER), 5000n);
      await sim.markDelivered(SELLER, eid, NONCE);
      await sim.release(BUYER, eid);
      // The seller proves the opening again to record it, so its private state
      // has to carry the nonce.
      ps = withEscrowNonce(ps, eid, NONCE);
      await sim.updateReputation(ps, eid);
      ps = agentState(SELLER, SALT, applySettlement(ps.stats, 5000n, true), ps.jobs, ps.escrowNonces);

      expect(await sim.proveReputation(ps, 4n, 7000n, 15_000n)).toBe(true); // 4 successes, vol 15,100
    });

    it("soundness: an aggregate the chain did not compute cannot be proven", async () => {
      const ps = await earnBase();
      // Same key and salt, but one extra success invented locally.
      const inflated = agentState(SELLER, SALT, {
        total: ps.stats.total + 1n,
        successes: ps.stats.successes + 1n,
        volume: ps.stats.volume + 9999n,
      });
      await expect(sim.proveReputation(inflated, 4n, 7000n, 10_000n)).rejects.toThrow(
        /does not match the on-chain commitment/,
      );
    });

    it("soundness: a different salt does not open the commitment", async () => {
      const ps = await earnBase();
      const otherSalt = agentState(SELLER, new Uint8Array(32).fill(123), ps.stats);
      await expect(sim.proveReputation(otherSalt, 3n, 7000n, 10_000n)).rejects.toThrow(
        /does not match the on-chain commitment/,
      );
    });

    it("soundness: an escrow cannot be counted twice", async () => {
      const ps = await earnStats(sim, {
        seller: SELLER,
        sellerSalt: SALT,
        buyer: BUYER,
        arbiter: ARBITER,
        jobs: [{ price: 1000n, success: true }],
      });
      // Re-running the last settlement would double the seller's volume.
      const counted = [...sim.ledger.countedEscrows][0];
      // `ps` already carries the opening for every escrow it earned.
      await expect(sim.updateReputation(ps, counted)).rejects.toThrow(/already counted/);
    });

    it("soundness: only the seller can record their own job", async () => {
      const e3 = eid(77);
      await sim.registerAgent(agentState(SELLER, SALT));
      await sim.registerAgent(agentState(BUYER, SALT));
      await sim.openEscrow(BUYER, e3, commitTo(sim, SELLER), 1000n);
      await sim.markDelivered(SELLER, e3, NONCE);
      await sim.release(BUYER, e3);

      // The buyer holds the opening too — it still cannot pass, because the
      // commitment is over the *seller's* id.
      const buyerPs = withEscrowNonce(agentState(BUYER, SALT), e3, NONCE);
      await expect(sim.updateReputation(buyerPs, e3)).rejects.toThrow(
        /only the seller can record this job/,
      );
    });

    it("soundness: an unsettled escrow cannot be counted", async () => {
      const e4 = eid(88);
      let ps = agentState(SELLER, SALT);
      await sim.registerAgent(ps);
      await sim.openEscrow(BUYER, e4, commitTo(sim, SELLER), 1000n);
      await sim.markDelivered(SELLER, e4, NONCE); // delivered, but not released
      ps = withEscrowNonce(ps, e4, NONCE);
      await expect(
        sim.updateReputation(withEscrowNonce(ps, e4, NONCE), e4),
      ).rejects.toThrow(/has not settled/);
    });

    it("rejects an out-of-range success rate", async () => {
      const ps = await earnBase();
      await expect(sim.proveReputation(ps, 1n, 10_001n, 0n)).rejects.toThrow(/rate bps out of range/);
    });

    it("requires registration before proving", async () => {
      await expect(
        sim.proveReputation(agentState(SELLER, SALT), 1n, 5000n, 0n),
      ).rejects.toThrow(/no reputation commitment/);
    });

    it("an agent cannot register twice, so it cannot reset a bad history", async () => {
      const ps = agentState(SELLER, SALT);
      await sim.registerAgent(ps);
      await expect(sim.registerAgent(ps)).rejects.toThrow(/already registered/);
    });
  });
});
