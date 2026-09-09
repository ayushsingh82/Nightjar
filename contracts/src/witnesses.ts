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
  /**
   * Openings for the seller commitments this agent is party to, keyed by escrow
   * id (hex). Agreed off-chain when the job is arranged and held by both sides:
   * the buyer needs it to build the commitment and to disclose on a dispute,
   * the seller needs it to prove it is the seller at all.
   */
  escrowNonces: Record<string, Uint8Array>;
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

  escrowNonce: (
    ctx: WitnessContext<AgentPrivateState>,
    escrowId: Uint8Array,
  ): [AgentPrivateState, Uint8Array] => {
    const nonce = ctx.privateState.escrowNonces[toHexKey(escrowId)];
    if (!nonce) {
      // Failing here rather than returning zeros keeps the error legible: the
      // circuit would otherwise just report that the caller is not the seller.
      throw new Error(
        `no escrow nonce held for ${toHexKey(escrowId)} — the opening is agreed off-chain when the job is arranged`,
      );
    }
    return [ctx.privateState, nonce];
  },
};

/** Key escrow nonces by the escrow id, as lowercase hex. */
export function toHexKey(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fresh 32-byte opening for a new escrow's seller commitment. */
export function newEscrowNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Remember an opening on both sides of a job. */
export function withEscrowNonce(
  ps: AgentPrivateState,
  escrowId: Uint8Array,
  nonce: Uint8Array,
): AgentPrivateState {
  return { ...ps, escrowNonces: { ...ps.escrowNonces, [toHexKey(escrowId)]: nonce } };
}

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
  return {
    callerSecret: secretKey,
    stats: { ...ZERO_STATS },
    jobs: [],
    ledgerSalt: salt,
    escrowNonces: {},
  };
}
