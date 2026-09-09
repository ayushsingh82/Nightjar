// agent-commerce — the demo the UI runs, asserted end to end against real
// ledger state (plan.md §6). Every number the dashboards render comes out of
// `MarketSnapshot`, so checking the snapshot against the contract's own ledger
// is what makes "the UI's numbers match the chain" a fact rather than a claim.

import { describe, expect, it } from "vitest";
import { DEMO_BADGE, randomEscrowId } from "../../../contracts/src/runtime";
import { marketSession } from "./demo-market";
import { toHex, type MarketSnapshot } from "./market-types";
import {
  DEMO_BADGE_THRESHOLDS,
  badgeLabel,
  badgeThresholds,
  badgeVerdict,
  isBadgeStale,
  type PublishedBadge,
} from "./badge";

const ATLAS = "atlas";
const NOMAD = "nomad";
const ORION = "orion";

function agent(snap: MarketSnapshot, key: string) {
  const a = snap.agents.find((x) => x.key === key);
  if (!a) throw new Error(`no agent ${key}`);
  return a;
}

function badgeFor(snap: MarketSnapshot, agentId: string): PublishedBadge | undefined {
  return snap.badges.find((b) => b.agentId === agentId);
}

function commitmentFor(snap: MarketSnapshot, agentId: string): string | undefined {
  return snap.chain.reputationCommitments.find((c) => c.agentId === agentId)?.commitment;
}

/** The escrow just opened — the only one still awaiting delivery. */
function fundedEscrow(snap: MarketSnapshot) {
  const e = snap.chain.escrows.find((x) => x.state === "FUNDED");
  if (!e) throw new Error("no FUNDED escrow in the snapshot");
  return e;
}

function escrowById(snap: MarketSnapshot, id: string) {
  const e = snap.chain.escrows.find((x) => x.escrowId === id);
  if (!e) throw new Error(`escrow ${id} not in the snapshot`);
  return e;
}

describe("badge derivation", () => {
  it("renders the badge from the proven thresholds, not from local stats", () => {
    const weak: PublishedBadge = {
      agentId: "aa",
      minJobs: "1",
      minRateBps: "5000",
      minVolume: "10",
      holds: true,
      commitment: "cc",
      provenAt: 0,
    };
    // The circuit only ever proved (1, 50%, 10) — the label may say no more.
    expect(badgeLabel(badgeThresholds(weak))).toBe("1+ jobs · 50%+ · $10+");
    expect(badgeLabel(DEMO_BADGE_THRESHOLDS)).toBe("50+ jobs · 95%+ · $10k+");
  });

  it("keeps the app's demo thresholds in lockstep with the contract's", () => {
    expect(DEMO_BADGE_THRESHOLDS.minJobs).toBe(DEMO_BADGE.minJobs);
    expect(DEMO_BADGE_THRESHOLDS.minRateBps).toBe(DEMO_BADGE.minRateBps);
    expect(DEMO_BADGE_THRESHOLDS.minVolume).toBe(DEMO_BADGE.minVolume);
  });

  it("treats a badge proven against a superseded commitment as stale", () => {
    const badge: PublishedBadge = {
      agentId: "aa",
      minJobs: "50",
      minRateBps: "9500",
      minVolume: "10000",
      holds: true,
      commitment: "old",
      provenAt: 0,
    };
    expect(isBadgeStale(badge, "old")).toBe(false);
    expect(isBadgeStale(badge, "new")).toBe(true);
    expect(badgeVerdict(badge, "new").kind).toBe("stale");
    expect(badgeVerdict({ ...badge, holds: false }, "old").kind).toBe("failed");
    expect(badgeVerdict(undefined, "old").kind).toBe("none");
  });
});

describe("escrow ids", () => {
  it("draws 32 opaque bytes that never repeat", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 256; i++) {
      const id = randomEscrowId();
      expect(id).toHaveLength(32);
      ids.add(toHex(id));
    }
    expect(ids.size).toBe(256);
    // No structure an observer could exploit: not a counter, not zero-padded.
    const sample = randomEscrowId();
    expect(sample.every((b) => b === 0)).toBe(false);
  });
});

describe("market session — badge → hire → escrow → deliver → release", () => {
  it("runs the demo and matches every rendered number to ledger state", async () => {
    const session = await marketSession();
    await session.apply({ type: "reset" });
    let snap = await session.apply({ type: "seed" });

    const atlas = agent(snap, ATLAS);
    const nomad = agent(snap, NOMAD);
    const orion = agent(snap, ORION);

    // Seeded private histories are exactly the fixtures the seed script uses.
    expect(atlas.stats).toEqual({
      totalJobs: 55,
      successfulJobs: 53,
      volume: "15900",
      successRateBps: 9636,
    });
    expect(nomad.stats.totalJobs).toBe(9);
    // The buyer now has a record too, because seeding runs real escrows and it
    // is the counterparty on every one: 53 of Atlas's 55 released, plus 8 of
    // Nomad's 9. A buyer accrues history by buying.
    expect(orion.stats.totalJobs).toBe(61);

    // Bonds and commitments are on chain. Atlas staked 20,000 but earned its
    // history for real, and the two jobs it botched were slashed at 300 each —
    // so the bond reads 19,400. A reputation that cannot be invented is one
    // that costs something to build.
    expect(snap.chain.bonds.find((b) => b.agentId === atlas.agentId)?.amount).toBe("19400");
    expect(commitmentFor(snap, atlas.agentId)).toMatch(/^[0-9a-f]{64}$/);
    // The salt never appears. The counterparties do, via the escrow records —
    // see the disclosure-surface assertions in the dispute case below.
    expect(snap.chain.serialized).not.toContain(atlas.ledgerSalt);

    // --- the strong seller clears the badge -----------------------------
    snap = await session.apply({
      type: "proveReputation",
      agent: ATLAS,
      minJobs: DEMO_BADGE.minJobs.toString(),
      minRateBps: DEMO_BADGE.minRateBps.toString(),
      minVolume: DEMO_BADGE.minVolume.toString(),
    });
    const atlasBadge = badgeFor(snap, atlas.agentId)!;
    expect(atlasBadge.holds).toBe(true);
    expect(badgeVerdict(atlasBadge, commitmentFor(snap, atlas.agentId))).toEqual({
      kind: "verified",
      label: "50+ jobs · 95%+ · $10k+",
    });
    // proveReputation writes nothing public — only the boolean is disclosed.
    expect(snap.events.at(-1)!.ledgerWrites).toEqual([
      "no public state changed — only a boolean was disclosed",
    ]);

    // --- the newcomer cannot ---------------------------------------------
    snap = await session.apply({
      type: "proveReputation",
      agent: NOMAD,
      minJobs: DEMO_BADGE.minJobs.toString(),
      minRateBps: DEMO_BADGE.minRateBps.toString(),
      minVolume: DEMO_BADGE.minVolume.toString(),
    });
    expect(badgeFor(snap, nomad.agentId)!.holds).toBe(false);
    expect(badgeVerdict(badgeFor(snap, nomad.agentId), commitmentFor(snap, nomad.agentId)).kind).toBe(
      "failed",
    );

    // --- hire on the badge alone -----------------------------------------
    snap = await session.apply({ type: "hire", buyer: ORION, seller: atlas.key, amount: "2500" });
    // 64 seeded settlements (55 + 9) came first, so this hire is number 65.
    expect(snap.chain.escrowCount).toBe("65");
    // Seeded history is real escrows now, so pick the one just opened.
    const escrow = fundedEscrow(snap);
    expect(escrow.state).toBe("FUNDED");
    expect(escrow.buyer).toBe(orion.agentId);
    expect(escrow.seller).toBe(atlas.agentId);
    expect(escrow.amount).toBe("2500");
    expect(escrow.escrowId).toMatch(/^[0-9a-f]{64}$/);

    snap = await session.apply({ type: "markDelivered", escrowId: escrow.escrowId });
    expect(escrowById(snap, escrow.escrowId).state).toBe("DELIVERED");

    const commitmentBeforeRelease = commitmentFor(snap, atlas.agentId);
    snap = await session.apply({ type: "release", escrowId: escrow.escrowId });
    expect(escrowById(snap, escrow.escrowId).state).toBe("RELEASED");

    // Both private ledgers grew; the seller re-committed, so the old badge is
    // stale. Atlas earned 55 seeded jobs (53 released at 300 = 15,900) and this
    // one at 2,500, so 56 jobs and 18,400 volume. Orion is on 61 seeded plus
    // this one.
    expect(agent(snap, ATLAS).stats.totalJobs).toBe(56);
    expect(agent(snap, ATLAS).stats.volume).toBe("18400");
    expect(agent(snap, ORION).stats.totalJobs).toBe(62);
    const commitmentAfterRelease = commitmentFor(snap, atlas.agentId);
    expect(commitmentAfterRelease).not.toBe(commitmentBeforeRelease);
    expect(badgeVerdict(badgeFor(snap, atlas.agentId), commitmentAfterRelease).kind).toBe("stale");

    // Re-proving against the new commitment restores it.
    snap = await session.apply({
      type: "proveReputation",
      agent: ATLAS,
      minJobs: DEMO_BADGE.minJobs.toString(),
      minRateBps: DEMO_BADGE.minRateBps.toString(),
      minVolume: DEMO_BADGE.minVolume.toString(),
    });
    expect(badgeVerdict(badgeFor(snap, atlas.agentId), commitmentFor(snap, atlas.agentId)).kind).toBe(
      "verified",
    );
  });

  it("slashes on a dispute without leaking a single ledger row", async () => {
    const session = await marketSession();
    await session.apply({ type: "reset" });
    await session.apply({ type: "seed" });
    let snap = await session.apply({ type: "hire", buyer: ORION, seller: NOMAD, amount: "500" });
    const escrowId = fundedEscrow(snap).escrowId;
    const nomadId = agent(snap, NOMAD).agentId;
    const bondBefore = snap.chain.bonds.find((b) => b.agentId === nomadId)!.amount;
    const slashedBefore = snap.chain.slashedTotal;

    snap = await session.apply({ type: "markDelivered", escrowId });
    snap = await session.apply({ type: "dispute", escrowId });
    expect(escrowById(snap, escrowId).state).toBe("DISPUTED");

    snap = await session.apply({ type: "resolveDispute", escrowId, sellerAtFault: true });
    expect(escrowById(snap, escrowId).state).toBe("SLASHED");
    // Seeded failures already slashed some bond, so assert the delta this
    // dispute caused rather than an absolute the history moves.
    expect(BigInt(snap.chain.slashedTotal) - BigInt(slashedBefore)).toBe(500n);
    expect(snap.chain.bonds.find((b) => b.agentId === nomadId)!.amount).toBe(
      (BigInt(bondBefore) - 500n).toString(),
    );

    const nomad = agent(snap, NOMAD);
    expect(nomad.stats.totalJobs).toBe(10);
    expect(nomad.stats.successfulJobs).toBe(8);

    // What is still private, and it is the part the badge rests on: the salt,
    // and the aggregate itself. The chain holds a commitment to
    // [total, successes, volume] and none of the three numbers appears in it.
    // Only the salt is searched for: it is 32 random bytes, so finding it would
    // mean something. A small decimal like the volume would match by accident
    // inside any longer number in the blob, which is a false-positive machine
    // rather than a privacy check.
    expect(snap.chain.serialized).not.toContain(nomad.ledgerSalt);

    // What is NOT private, and this is a real limitation rather than an
    // oversight: reputation is now earned through escrows, and an escrow record
    // names its seller in the clear. So every job has an on-chain trace, and an
    // observer can count a seller's settlements by filtering `escrows`.
    //
    // The fix is to store a commitment to the seller instead of the agent id,
    // opened only on dispute — see the note in marketplace.compact. Until then
    // this asserts the leak rather than pretending it away.
    const settled = nomad.jobs.filter((j) => j.escrowId);
    expect(settled).toHaveLength(nomad.jobs.length);
    expect(settled.at(-1)!.escrowId).toBe(escrowId);
    const publiclyCountable = snap.chain.escrows.filter((e) => e.seller === nomad.agentId);
    expect(publiclyCountable.length).toBe(nomad.stats.totalJobs);
  });

  it("refuses out-of-order lifecycle calls with the circuit's own assert", async () => {
    const session = await marketSession();
    await session.apply({ type: "reset" });
    await session.apply({ type: "seed" });
    const snap = await session.apply({ type: "hire", buyer: ORION, seller: ATLAS, amount: "100" });
    const escrowId = fundedEscrow(snap).escrowId;
    await expect(session.apply({ type: "release", escrowId })).rejects.toThrow(
      /escrow not delivered/,
    );
  });
});
