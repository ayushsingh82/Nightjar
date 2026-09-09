// agent-commerce — the wire shape of the market session.
//
// Everything the contract session hands the UI, with `bigint` as decimal
// strings and `Uint8Array` as hex so a snapshot survives JSON. Kept apart from
// `demo-market.ts` on purpose: that module runs the compiled contract and is
// server-only, while these types (and `toHex`) are needed on both sides.

import type { PublishedBadge } from "./badge";

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * What this build can and cannot do, carried in every snapshot so the UI states
 * it rather than implying otherwise. Written in `demo-market.ts`.
 */
export type ExecutionNotice = {
  mode: string;
  source: string;
  proofGenerated: boolean;
  submittedOnChain: boolean;
  caveats: string[];
};

export type EscrowStateName =
  | "EMPTY"
  | "FUNDED"
  | "DELIVERED"
  | "RELEASED"
  | "DISPUTED"
  | "SLASHED";

export type ChainEscrow = {
  escrowId: string;
  buyer: string;
  seller: string;
  amount: string;
  state: EscrowStateName;
};

/** Exactly what the public ledger holds. Nothing here is inferred. */
export type ChainView = {
  arbiterPk: string;
  escrowCount: string;
  slashedTotal: string;
  bonds: { agentId: string; amount: string }[];
  reputationCommitments: { agentId: string; commitment: string }[];
  escrows: ChainEscrow[];
  /** Serialized contract state, verbatim — what an indexer would return. */
  serialized: string;
  /** SHA-256 over `serialized`. A content digest of real state, not a tx hash. */
  stateDigest: string;
};

export type PrivateJobRow = {
  client: string;
  price: string;
  success: boolean;
  /**
   * Set when this row was settled through an escrow in this session. The escrow
   * record is public, so for these rows the counterparty, the amount and the
   * outcome are already visible on chain — the contract is explicit that escrow
   * records name their (hashed) counterparties. Rows without it are prior
   * history: nothing about them exists on chain but the commitment.
   */
  escrowId?: string;
};

export type PrivateStats = {
  totalJobs: number;
  successfulJobs: number;
  volume: string;
  successRateBps: number;
};

export type AgentView = {
  key: string;
  name: string;
  role: "buyer" | "seller";
  blurb: string;
  agentId: string;
  /** Commitment opening — private, and the reason a stale badge cannot be replayed. */
  ledgerSalt: string;
  jobs: PrivateJobRow[];
  stats: PrivateStats;
};

export type MarketEvent = {
  seq: number;
  circuit: string;
  actor: string;
  detail: string;
  /** Real before/after diff of the public ledger. */
  ledgerWrites: string[];
  stateDigest: string;
  at: number;
};

export type MarketSnapshot = {
  agents: AgentView[];
  chain: ChainView;
  badges: PublishedBadge[];
  events: MarketEvent[];
  execution: ExecutionNotice;
};

export type MarketAction =
  | { type: "reset" }
  | { type: "seed" }
  | { type: "stakeBond"; agent: string; amount: string }
  | { type: "commitLedger"; agent: string }
  | { type: "proveReputation"; agent: string; minJobs: string; minRateBps: string; minVolume: string }
  | { type: "hire"; buyer: string; seller: string; amount: string }
  | { type: "markDelivered"; escrowId: string }
  | { type: "release"; escrowId: string }
  | { type: "dispute"; escrowId: string }
  | { type: "resolveDispute"; escrowId: string; sellerAtFault: boolean };
