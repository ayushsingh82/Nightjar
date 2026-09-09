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
    expect(orion.stats.totalJobs).toBe(0);

    // Bonds and commitments are on chain; job rows are not.
    expect(snap.chain.bonds.find((b) => b.agentId === atlas.agentId)?.amount).toBe("20000");
    expect(commitmentFor(snap, atlas.agentId)).toMatch(/^[0-9a-f]{64}$/);
    expect(snap.chain.serialized).not.toContain(atlas.jobs[0].client);
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
    expect(snap.chain.escrowCount).toBe("1");
    const escrow = snap.chain.escrows[0];
    expect(escrow.state).toBe("FUNDED");
    expect(escrow.buyer).toBe(orion.agentId);
    expect(escrow.seller).toBe(atlas.agentId);
    expect(escrow.amount).toBe("2500");
    expect(escrow.escrowId).toMatch(/^[0-9a-f]{64}$/);

    snap = await session.apply({ type: "markDelivered", escrowId: escrow.escrowId });
    expect(snap.chain.escrows[0].state).toBe("DELIVERED");

    const commitmentBeforeRelease = commitmentFor(snap, atlas.agentId);
    snap = await session.apply({ type: "release", escrowId: escrow.escrowId });
    expect(snap.chain.escrows[0].state).toBe("RELEASED");

    // Both private ledgers grew; the seller re-committed, so the old badge is stale.
    expect(agent(snap, ATLAS).stats.totalJobs).toBe(56);
    expect(agent(snap, ATLAS).stats.volume).toBe("18400");
    expect(agent(snap, ORION).stats.totalJobs).toBe(1);
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
    const escrowId = snap.chain.escrows[0].escrowId;
    const nomadId = agent(snap, NOMAD).agentId;
    const bondBefore = snap.chain.bonds.find((b) => b.agentId === nomadId)!.amount;

    snap = await session.apply({ type: "markDelivered", escrowId });
    snap = await session.apply({ type: "dispute", escrowId });
    expect(snap.chain.escrows[0].state).toBe("DISPUTED");

    snap = await session.apply({ type: "resolveDispute", escrowId, sellerAtFault: true });
    expect(snap.chain.escrows[0].state).toBe("SLASHED");
    expect(snap.chain.slashedTotal).toBe("500");
    expect(snap.chain.bonds.find((b) => b.agentId === nomadId)!.amount).toBe(
      (BigInt(bondBefore) - 500n).toString(),
    );

    // The failed job landed in the seller's private ledger, tagged with the
    // escrow that produced it — that one counterparty is public because the
    // escrow record names it. Every row of prior history stays invisible.
    const nomad = agent(snap, NOMAD);
    expect(nomad.stats.totalJobs).toBe(10);
    expect(nomad.stats.successfulJobs).toBe(8);
    const settled = nomad.jobs.filter((j) => j.escrowId);
    expect(settled).toHaveLength(1);
    expect(settled[0].escrowId).toBe(escrowId);
    for (const jobRow of nomad.jobs.filter((j) => !j.escrowId)) {
      expect(snap.chain.serialized).not.toContain(jobRow.client);
    }
    expect(snap.chain.serialized).not.toContain(nomad.ledgerSalt);
  });

  it("refuses out-of-order lifecycle calls with the circuit's own assert", async () => {
    const session = await marketSession();
    await session.apply({ type: "reset" });
    await session.apply({ type: "seed" });
    const snap = await session.apply({ type: "hire", buyer: ORION, seller: ATLAS, amount: "100" });
    const escrowId = snap.chain.escrows[0].escrowId;
    await expect(session.apply({ type: "release", escrowId })).rejects.toThrow(
      /escrow not delivered/,
    );
  });
});
