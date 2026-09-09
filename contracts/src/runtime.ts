// agent-commerce — minimal agent runtime.
//
// Each agent has an identity secret, a ledger salt, and a private job ledger.
// `runJob` scripts one buyer↔seller task end to end against the contract:
//   buyer opens + funds escrow -> seller delivers -> buyer releases -> both
//   ledgers updated -> seller re-commits its reputation.
//
// Drives the in-memory simulator here; the same sequence runs against a
// deployed contract once the wallet client (`src/lib/midnight`) is wired.

import type { MarketSim } from "../test/simulator.js";
import { agentState, job as mkJob } from "../test/simulator.js";
import type { AgentPrivateState, Job } from "./witnesses.js";
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

export function escrowId(n: number): Uint8Array {
  const b = new Uint8Array(32);
  new DataView(b.buffer).setUint32(0, n);
  return b;
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
