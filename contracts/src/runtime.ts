// agent-commerce — minimal agent runtime.
//
// Each agent has an identity secret, a ledger salt, and a private job ledger.
// `runJob` scripts one buyer↔seller task end to end against the contract:
//   buyer opens + funds escrow -> seller delivers -> buyer releases -> both
//   ledgers updated -> seller re-commits its reputation.
//
// Drives the in-memory simulator here; the same sequence runs against a
// deployed contract once the wallet client (`src/lib/midnight`) is wired.

// TypeScript sources are imported without the `.js` extension (as in
// reputation.ts) so the Next app can pull this module into its server bundle;
// its bundler resolves `./x` to `./x.ts` but does not rewrite `./x.js`.
import type { MarketSim } from "../test/simulator";
import { agentState, job as mkJob } from "../test/simulator";
import {
  applySettlement,
  newEscrowNonce,
  toHexKey,
  ZERO_STATS,
  type AgentPrivateState,
  type Job,
  type ReputationStats,
} from "./witnesses";
import { pureCircuits } from "./managed/marketplace/contract/index.js";

export type AgentRole = "buyer" | "seller";

export class Agent {
  readonly secret: Uint8Array;
  readonly salt: Uint8Array;
  /** Openings this agent holds, by escrow id hex. Shared with its counterparty. */
  private nonces: Record<string, Uint8Array> = {};
  /** The aggregate the on-chain commitment is over. Advances only in lockstep
   *  with `updateReputation`; never edited directly. */
  private stats: ReputationStats = { ...ZERO_STATS };
  /** The agent's own record of its work. Display only — no circuit reads it. */
  private ledger: Job[] = [];
  /** Whether `registerAgent` has been accepted for this identity. */
  private registered = false;

  constructor(
    readonly name: string,
    readonly role: AgentRole,
    secret?: Uint8Array,
    salt?: Uint8Array,
  ) {
    this.secret = secret ?? crypto.getRandomValues(new Uint8Array(32));
    this.salt = salt ?? crypto.getRandomValues(new Uint8Array(32));
  }

  get id(): Uint8Array {
    return pureCircuits.agentIdFrom(this.secret);
  }

  get privateState(): AgentPrivateState {
    return agentState(this.secret, this.salt, this.stats, this.ledger, this.nonces);
  }

  /** Both parties record the opening when the job is arranged. */
  rememberNonce(escrowId: Uint8Array, nonce: Uint8Array): void {
    this.nonces[toHexKey(escrowId)] = nonce;
  }

  get reputation(): ReputationStats {
    return { ...this.stats };
  }

  get isRegistered(): boolean {
    return this.registered;
  }

  markRegistered(): void {
    this.registered = true;
  }

  recordJob(job: Job): void {
    this.ledger.push(job);
  }

  /**
   * Mirror in-circuit `updateReputation`. Called immediately after the contract
   * accepts one, so the next proof opens the commitment the chain now holds.
   */
  settle(amount: bigint, succeeded: boolean): void {
    this.stats = applySettlement(this.stats, amount, succeeded);
  }

  get jobCount(): number {
    return this.ledger.length;
  }
}

export type JobSpec = {
  escrowId: Uint8Array;
  price: bigint;
  /** Whether the seller delivers acceptably (false → buyer disputes). */
  succeeds?: boolean;
};

export type JobOutcome = {
  escrowId: Uint8Array;
  price: bigint;
  released: boolean;
  disputed: boolean;
  /** The seller this escrow was really with — off-chain knowledge. */
  sellerId: Uint8Array;
  /** The opening for its seller commitment, held by both parties. */
  nonce: Uint8Array;
};

/**
 * Run one job to completion. On success the buyer releases and both agents
 * append the job to their ledgers; on failure the buyer disputes and the
 * arbiter resolves against the seller.
 */
export async function runJob(
  sim: MarketSim,
  buyer: Agent,
  seller: Agent,
  arbiterSecret: Uint8Array,
  spec: JobSpec,
): Promise<JobOutcome> {
  const succeeds = spec.succeeds ?? true;
  // A seller has to be registered before any settlement can be folded in — the
  // zero commitment is what later transitions are anchored to.
  if (!seller.isRegistered) {
    await sim.registerAgent(seller.privateState);
    seller.markRegistered();
  }
  // Arranged off-chain: one opening, held by both sides. The chain sees only
  // the commitment, so nothing on it says who was hired.
  const nonce = newEscrowNonce();
  buyer.rememberNonce(spec.escrowId, nonce);
  seller.rememberNonce(spec.escrowId, nonce);

  await sim.openEscrow(
    buyer.secret,
    spec.escrowId,
    sim.sellerCommitment(seller.id, nonce),
    spec.price,
  );
  await sim.markDelivered(seller.secret, spec.escrowId, nonce);

  if (succeeds) {
    await sim.release(buyer.secret, spec.escrowId);
    seller.recordJob(mkJob(buyer.id, spec.price, true));
    buyer.recordJob(mkJob(seller.id, spec.price, true));
    // The contract reads the amount and outcome off the settled escrow, so the
    // seller's aggregate is advanced with the state it was committed at, then
    // moved forward to match.
    await sim.updateReputation(seller.privateState, spec.escrowId);
    seller.settle(spec.price, true);
    return {
      escrowId: spec.escrowId,
      price: spec.price,
      released: true,
      disputed: false,
      sellerId: seller.id,
      nonce,
    };
  }

  // A dispute is the one place the seller is named — the buyer does it, and
  // proves the name opens the escrow's commitment.
  await sim.dispute(buyer.secret, spec.escrowId, seller.id, nonce);
  await sim.resolveDispute(arbiterSecret, spec.escrowId, true);
  seller.recordJob(mkJob(buyer.id, spec.price, false));
  await sim.updateReputation(seller.privateState, spec.escrowId);
  seller.settle(spec.price, false);
  return {
    escrowId: spec.escrowId,
    price: spec.price,
    released: false,
    disputed: true,
    sellerId: seller.id,
    nonce,
  };
}

/** Run a sequence of jobs between the same pair. */
export async function runJobs(
  sim: MarketSim,
  buyer: Agent,
  seller: Agent,
  arbiterSecret: Uint8Array,
  specs: JobSpec[],
): Promise<JobOutcome[]> {
  const out: JobOutcome[] = [];
  for (const spec of specs) out.push(await runJob(sim, buyer, seller, arbiterSecret, spec));
  return out;
}

/** Deterministic escrow id — tests and fixtures only. Never use this for a real
 *  escrow: see `randomEscrowId` for why a derived id is a privacy hole. */
export function escrowId(n: number): Uint8Array {
  const b = new Uint8Array(32);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

/**
 * The only escrow id a client should ever open with: 32 fresh CSPRNG bytes.
 *
 * `openEscrow` discloses the id, both agent ids and the amount — that is the
 * design. What it cannot do is check where the id came from: the contract only
 * asserts `!escrows.member(eid)`. So an id derived from a sequence number, a
 * client name, a timestamp or the price is accepted by the chain and is exactly
 * the linkage Midnight's metadata privacy exists to remove — a sequence number
 * chains one buyer's escrows together, a name- or price-derived id lets an
 * observer confirm a guess by recomputing the hash. Opaque randomness is the
 * client's responsibility, and it is not optional.
 */
export function randomEscrowId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ---------------------------------------------------------------------------
// Demo history — earned, not asserted
//
// The first cut handed the seller a fabricated 55-job ledger. That no longer
// works, and the reason is the point: reputation now advances only through
// `updateReputation`, which reads its amount and outcome off an escrow that
// actually settled on this contract. A history has to be *run*.
// ---------------------------------------------------------------------------

export const DEMO_BADGE = { minJobs: 50n, minRateBps: 9500n, minVolume: 10_000n } as const;

export type HistorySpec = {
  /** Total jobs to run. */
  jobs: number;
  /** How many of them the seller botches (disputed, arbiter slashes). */
  failures: number;
  price: bigint;
};

/** 55 jobs, 2 failures -> 53/55 = 96.3%, volume 53 * 300 = 15,900. Clears DEMO_BADGE. */
export const DEMO_SELLER_HISTORY: HistorySpec = { jobs: 55, failures: 2, price: 300n };

/** 9 jobs, 1 failure -> 8/9 = 88.9%, volume 960. Nowhere near the badge, on purpose:
 *  the UI needs an agent for whom the circuit honestly returns false. */
export const NEWCOMER_HISTORY: HistorySpec = { jobs: 9, failures: 1, price: 120n };

/**
 * Earn a seller's history by running real escrows through the contract.
 *
 * Registers the seller if needed, then runs `spec.jobs` jobs with the failures
 * first, so a partially-run history is always the pessimistic one. Every job is
 * a genuine open -> deliver -> release (or dispute -> slash) and a genuine
 * `updateReputation`, so the aggregate the seller ends up committed to is one
 * the contract itself computed.
 */
export async function earnHistory(
  sim: MarketSim,
  buyer: Agent,
  seller: Agent,
  arbiterSecret: Uint8Array,
  spec: HistorySpec = DEMO_SELLER_HISTORY,
): Promise<JobOutcome[]> {
  const specs: JobSpec[] = [];
  for (let i = 0; i < spec.jobs; i++) {
    specs.push({ escrowId: randomEscrowId(), price: spec.price, succeeds: i >= spec.failures });
  }
  return runJobs(sim, buyer, seller, arbiterSecret, specs);
}
