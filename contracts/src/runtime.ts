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
import type { AgentPrivateState, Job } from "./witnesses";
import { pureCircuits } from "./managed/marketplace/contract/index.js";

export type AgentRole = "buyer" | "seller";

export class Agent {
  readonly secret: Uint8Array;
  readonly salt: Uint8Array;
  private ledger: Job[] = [];

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
    return agentState(this.secret, this.salt, this.ledger);
  }

  recordJob(job: Job): void {
    this.ledger.push(job);
  }

  seedLedger(jobs: Job[]): void {
    this.ledger = [...jobs];
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
  await sim.openEscrow(buyer.secret, spec.escrowId, seller.id, spec.price);
  await sim.markDelivered(seller.secret, spec.escrowId);

  if (succeeds) {
    await sim.release(buyer.secret, spec.escrowId);
    const job = mkJob(buyer.id, spec.price, true);
    seller.recordJob(job);
    buyer.recordJob(mkJob(seller.id, spec.price, true));
    await sim.updateReputation(seller.privateState);
    return { escrowId: spec.escrowId, price: spec.price, released: true, disputed: false };
  }

  await sim.dispute(buyer.secret, spec.escrowId);
  await sim.resolveDispute(arbiterSecret, spec.escrowId, true);
  seller.recordJob(mkJob(buyer.id, spec.price, false));
  await sim.updateReputation(seller.privateState);
  return { escrowId: spec.escrowId, price: spec.price, released: false, disputed: true };
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
// Demo seed — a seller history that clears the marketplace badge
// (>= 50 jobs, >= 95% success, >= $10k volume).
// ---------------------------------------------------------------------------

export const DEMO_BADGE = { minJobs: 50n, minRateBps: 9500n, minVolume: 10_000n } as const;

export function demoSellerLedger(clientCount = 40): Job[] {
  const jobs: Job[] = [];
  // 55 jobs, 2 failures -> 53/55 = 96.3%, volume 53 * 300 = 15_900
  for (let i = 0; i < 55; i++) {
    const client = new Uint8Array(32).fill((i % clientCount) + 1);
    jobs.push(mkJob(client, 300n, i >= 2));
  }
  return jobs;
}

/**
 * A newcomer's history — real, but nowhere near DEMO_BADGE. Used by the UI to
 * show the other half of the guarantee: an agent whose ledger does not support
 * the thresholds gets `false` out of the circuit and simply has no badge.
 */
export function newcomerSellerLedger(): Job[] {
  const jobs: Job[] = [];
  // 9 jobs, 1 failure -> 8/9 = 88.9%, volume 8 * 120 = 960
  for (let i = 0; i < 9; i++) {
    const client = new Uint8Array(32).fill(200 + (i % 8));
    jobs.push(mkJob(client, 120n, i !== 3));
  }
  return jobs;
}
