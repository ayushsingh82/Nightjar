// agent-commerce — core contract behaviour against the in-memory simulator
// (no proof server). Covers the milestone-1 checklist: escrow lifecycle,
// slashing math, reputation monotonicity, and proof soundness.

import { beforeEach, describe, expect, it } from "vitest";
import { agentState, job, MarketSim } from "./simulator.js";
import { appendJob } from "../src/witnesses.js";
import { EscrowState } from "../src/managed/marketplace/contract/index.js";

const ARBITER = new Uint8Array(32).fill(1);
const NOT_ARBITER = new Uint8Array(32).fill(99);
const SELLER = new Uint8Array(32).fill(2);
const BUYER = new Uint8Array(32).fill(3);
const SALT = new Uint8Array(32).fill(9);

const CLIENT_A = new Uint8Array(32).fill(50);
const CLIENT_B = new Uint8Array(32).fill(51);

const eid = (n: number) => new Uint8Array(32).fill(n);

describe("agent-commerce marketplace core", () => {
  let sim: MarketSim;

  beforeEach(async () => {
    sim = await MarketSim.deploy(ARBITER);
  });

  describe("escrow lifecycle", () => {
    it("runs the happy path FUNDED -> DELIVERED -> RELEASED", async () => {
      const e = eid(10);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.FUNDED);
      expect(sim.ledger.escrowCount).toBe(1n);

      await sim.markDelivered(SELLER, e);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.DELIVERED);

      await sim.release(BUYER, e);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.RELEASED);
    });

    it("rejects a reused escrow id", async () => {
      const e = eid(11);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await expect(sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1n)).rejects.toThrow(/already used/);
    });

    it("rejects buyer == seller", async () => {
      await expect(sim.openEscrow(BUYER, eid(12), sim.agentId(BUYER), 1000n)).rejects.toThrow(/must differ/);
    });

    it("only the seller can mark delivered", async () => {
      const e = eid(13);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await expect(sim.markDelivered(BUYER, e)).rejects.toThrow(/only the seller/);
    });

    it("only the buyer can release", async () => {
      const e = eid(14);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await sim.markDelivered(SELLER, e);
      await expect(sim.release(SELLER, e)).rejects.toThrow(/only the buyer/);
    });

    it("cannot release before delivery", async () => {
      const e = eid(15);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await expect(sim.release(BUYER, e)).rejects.toThrow(/not delivered/);
    });

    it("cannot dispute a released escrow", async () => {
      const e = eid(16);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await sim.markDelivered(SELLER, e);
      await sim.release(BUYER, e);
      await expect(sim.dispute(BUYER, e)).rejects.toThrow(/not disputable/);
    });
  });

  describe("slashing math", () => {
    it("slashes the seller bond by the escrow amount on seller fault", async () => {
      await sim.stakeBond(SELLER, 5000n);
      const e = eid(20);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1200n);
      await sim.dispute(BUYER, e);
      await sim.resolveDispute(ARBITER, e, true);

      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(3800n); // 5000 - 1200
      expect(sim.ledger.slashedTotal).toBe(1200n);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.SLASHED);
    });

    it("caps the slash at the available bond when the bond is smaller", async () => {
      await sim.stakeBond(SELLER, 300n);
      const e = eid(21);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await sim.dispute(BUYER, e);
      await sim.resolveDispute(ARBITER, e, true);

      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(0n);
      expect(sim.ledger.slashedTotal).toBe(300n); // not 1000
    });

    it("does not slash when the seller is not at fault", async () => {
      await sim.stakeBond(SELLER, 5000n);
      const e = eid(22);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await sim.dispute(BUYER, e);
      await sim.resolveDispute(ARBITER, e, false);

      expect(sim.ledger.bonds.lookup(sim.agentId(SELLER))).toBe(5000n);
      expect(sim.ledger.slashedTotal).toBe(0n);
      expect(sim.ledger.escrows.lookup(e).state).toBe(EscrowState.RELEASED);
    });

    it("only the arbiter can resolve a dispute", async () => {
      await sim.stakeBond(SELLER, 5000n);
      const e = eid(23);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
      await sim.dispute(BUYER, e);
      await expect(sim.resolveDispute(NOT_ARBITER, e, true)).rejects.toThrow(/only the arbiter/);
      await expect(sim.resolveDispute(BUYER, e, true)).rejects.toThrow(/only the arbiter/);
    });

    it("cannot resolve an escrow that was never disputed", async () => {
      const e = eid(24);
      await sim.openEscrow(BUYER, e, sim.agentId(SELLER), 1000n);
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
    const base = [
      job(CLIENT_A, 4000n, true),
      job(CLIENT_B, 3500n, true),
      job(CLIENT_A, 2600n, true),
      job(CLIENT_B, 900n, false),
    ];

    it("proves a threshold the private ledger supports", async () => {
      const ps = agentState(SELLER, SALT, base);
      await sim.updateReputation(ps);
      // 3 successes, 3/4 = 7500 bps, volume 10100
      expect(await sim.proveReputation(ps, 3n, 7000n, 10_000n)).toBe(true);
    });

    it("fails a threshold the ledger does not support", async () => {
      const ps = agentState(SELLER, SALT, base);
      await sim.updateReputation(ps);
      expect(await sim.proveReputation(ps, 4n, 7000n, 10_000n)).toBe(false); // only 3 successes
      expect(await sim.proveReputation(ps, 3n, 8000n, 10_000n)).toBe(false); // rate 7500 < 8000
      expect(await sim.proveReputation(ps, 3n, 7000n, 11_000n)).toBe(false); // volume 10100 < 11000
    });

    it("monotonicity: appending a successful job raises what can be proven", async () => {
      let ps = agentState(SELLER, SALT, base);
      await sim.updateReputation(ps);
      expect(await sim.proveReputation(ps, 4n, 7000n, 10_000n)).toBe(false);

      ps = appendJob(ps, job(CLIENT_A, 5000n, true));
      await sim.updateReputation(ps); // rotate the commitment
      expect(await sim.proveReputation(ps, 4n, 7000n, 15_000n)).toBe(true); // now 4 successes, vol 15100
    });

    it("soundness: cannot prove against a ledger other than the committed one", async () => {
      const committed = agentState(SELLER, SALT, base);
      await sim.updateReputation(committed);

      // same salt + key, but a fabricated ledger with an extra success
      const fabricated = agentState(SELLER, SALT, [...base, job(CLIENT_A, 9999n, true)]);
      await expect(sim.proveReputation(fabricated, 4n, 7000n, 10_000n)).rejects.toThrow(
        /does not match on-chain commitment/,
      );
    });

    it("soundness: a different salt does not match the commitment", async () => {
      const committed = agentState(SELLER, SALT, base);
      await sim.updateReputation(committed);
      const otherSalt = agentState(SELLER, new Uint8Array(32).fill(123), base);
      await expect(sim.proveReputation(otherSalt, 3n, 7000n, 10_000n)).rejects.toThrow(
        /does not match on-chain commitment/,
      );
    });

    it("rejects an out-of-range success rate", async () => {
      const ps = agentState(SELLER, SALT, base);
      await sim.updateReputation(ps);
      await expect(sim.proveReputation(ps, 1n, 10_001n, 0n)).rejects.toThrow(/rate bps out of range/);
    });

    it("requires a commitment before proving", async () => {
      const ps = agentState(SELLER, SALT, base);
      await expect(sim.proveReputation(ps, 1n, 5000n, 0n)).rejects.toThrow(/no reputation commitment/);
    });
  });
});
