// agent-commerce — private state + witness implementations for marketplace.compact
//
// Runs locally in each agent's client. Nothing here leaves the device: the
// chain only ever holds `statsCommit(stats, salt)`.
//
// `stats` is the aggregate the on-chain commitment is over, and it is the only
// thing a circuit reads. `jobs` is the agent's own record of what happened —
// useful for its dashboard, never a witness, and never trusted by the contract.
// The two are kept separate on purpose: reputation advances only through
// `updateReputation`, one settled escrow at a time, so a client cannot move the
// aggregate by editing a list.

import type { Ledger, Witnesses } from "./managed/marketplace/contract/index.js";

type WitnessContext<PS> = { privateState: PS; ledger: Ledger };

/** The running aggregate an agent commits to. */
export type ReputationStats = {
  total: bigint;
  successes: bigint;
  volume: bigint;
};

export const ZERO_STATS: ReputationStats = { total: 0n, successes: 0n, volume: 0n };

/** One job as the agent recorded it locally. Display only. */
export type Job = {
  client: Uint8Array; // 32 bytes
  price: bigint;
  success: boolean;
};

export type AgentPrivateState = {
  callerSecret: Uint8Array; // 32 bytes. agentId = hash(domain, secret)
  stats: ReputationStats; // what the on-chain commitment is over
  jobs: Job[]; // local record; not a witness
  ledgerSalt: Uint8Array; // 32 bytes, binds the commitment
};

export const witnesses: Witnesses<AgentPrivateState> = {
  callerSecret: (
    ctx: WitnessContext<AgentPrivateState>,
  ): [AgentPrivateState, Uint8Array] => [ctx.privateState, ctx.privateState.callerSecret],

  reputationStats: (
    ctx: WitnessContext<AgentPrivateState>,
  ): [AgentPrivateState, [bigint, bigint, bigint]] => [
    ctx.privateState,
    [ctx.privateState.stats.total, ctx.privateState.stats.successes, ctx.privateState.stats.volume],
  ],

  ledgerSalt: (
    ctx: WitnessContext<AgentPrivateState>,
  ): [AgentPrivateState, Uint8Array] => [ctx.privateState, ctx.privateState.ledgerSalt],
};

/**
 * Apply one settled escrow to the aggregate, exactly as `updateReputation`
 * does in-circuit. The client must call this in lockstep with the contract or
 * its next proof will not open the commitment.
 */
export function applySettlement(
  stats: ReputationStats,
  amount: bigint,
  succeeded: boolean,
): ReputationStats {
  return {
    total: stats.total + 1n,
    successes: stats.successes + (succeeded ? 1n : 0n),
    volume: stats.volume + (succeeded ? amount : 0n),
  };
}

/** Record a job in the agent's local view. Does not touch `stats`. */
export function recordJob(ps: AgentPrivateState, job: Job): AgentPrivateState {
  return { ...ps, jobs: [...ps.jobs, job] };
}

export function emptyPrivateState(secretKey: Uint8Array, salt: Uint8Array): AgentPrivateState {
  return { callerSecret: secretKey, stats: { ...ZERO_STATS }, jobs: [], ledgerSalt: salt };
}
