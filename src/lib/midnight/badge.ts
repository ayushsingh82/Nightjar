// agent-commerce — the marketplace badge.
//
// A badge is a *claim about thresholds*, not about statistics. `proveReputation`
// takes (minJobs, minRateBps, minVolume) as public inputs and returns one
// boolean; the thresholds are bound to that boolean because they are the inputs
// the circuit checked. Nothing else about the ledger crosses the boundary.
//
// So the badge text MUST be derived from the thresholds the agent actually
// proved, never from a locally-known stat. An agent that proves `true` at
// minJobs=1 has proven "1+ jobs" and nothing more — it must not be able to
// render "50+ jobs". `badgeLabel` is the only place badge text is produced, and
// it can only see the thresholds.
//
// Pure module: no wallet, no contract runtime, safe on the client.

import type { ReputationThresholds } from "./market-client";

/** A badge as it travels over the wire / sits in a snapshot (bigints as decimal strings). */
export type PublishedBadge = {
  /** Agent the badge belongs to, hex agent id. */
  agentId: string;
  /** Public inputs the circuit checked — the badge's entire meaning. */
  minJobs: string;
  minRateBps: string;
  minVolume: string;
  /** The single bit `proveReputation` disclosed. */
  holds: boolean;
  /** `reputationCommitments[agentId]` at proving time; the proof is bound to it. */
  commitment: string;
  provenAt: number;
};

export const DEMO_BADGE_THRESHOLDS: ReputationThresholds = {
  minJobs: 50n,
  minRateBps: 9500n,
  minVolume: 10_000n,
};

export function badgeThresholds(badge: PublishedBadge): ReputationThresholds {
  return {
    minJobs: BigInt(badge.minJobs),
    minRateBps: BigInt(badge.minRateBps),
    minVolume: BigInt(badge.minVolume),
  };
}

export function formatRateBps(bps: bigint): string {
  const pct = Number(bps) / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

export function formatVolume(v: bigint): string {
  if (v >= 1_000_000n) return `$${Number(v) / 1_000_000}M`;
  if (v >= 1_000n) return `$${Number(v) / 1_000}k`;
  return `$${v}`;
}

/**
 * The badge string. Reads only the thresholds — by construction it cannot
 * over-claim, because the numbers it prints are the numbers the circuit was
 * given and the boolean is bound to those numbers.
 */
export function badgeLabel(t: ReputationThresholds): string {
  return `${t.minJobs}+ jobs · ${formatRateBps(t.minRateBps)}+ · ${formatVolume(t.minVolume)}+`;
}

/**
 * A badge is only as current as the commitment it was proven against. Any
 * ledger change rotates `reputationCommitments[agent]`, which strands the old
 * proof — the agent has to re-prove. Surfacing this is the honest behaviour:
 * a stale badge is not evidence about the current ledger.
 */
export function isBadgeStale(badge: PublishedBadge, currentCommitment: string | undefined): boolean {
  return currentCommitment !== undefined && badge.commitment !== currentCommitment;
}

export type BadgeVerdict =
  | { kind: "none" }
  | { kind: "failed"; label: string }
  | { kind: "stale"; label: string }
  | { kind: "verified"; label: string };

export function badgeVerdict(
  badge: PublishedBadge | undefined,
  currentCommitment: string | undefined,
): BadgeVerdict {
  if (!badge) return { kind: "none" };
  const label = badgeLabel(badgeThresholds(badge));
  if (!badge.holds) return { kind: "failed", label };
  if (isBadgeStale(badge, currentCommitment)) return { kind: "stale", label };
  return { kind: "verified", label };
}
