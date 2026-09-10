// Nightjar — in-memory contract simulator for tests.
//
// Runs the generated circuit logic (no proof server) against a local ledger
// state, rebuilding the circuit context from the latest state before every
// call. The contract performs no Zswap coin operations, so there is no
// shielded-coin local state to thread. Cross-checked against compact-runtime 0.19.

import * as rt from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
} from "../src/managed/marketplace/contract/index.js";
import {
  applySettlement,
  emptyPrivateState,
  newEscrowNonce,
  withEscrowNonce,
  witnesses,
  ZERO_STATS,
  type AgentPrivateState,
  type Job,
  type ReputationStats,
} from "../src/witnesses";

const COIN_PK = "00".repeat(32);
const ZERO32 = new Uint8Array(32);

export class MarketSim {
  private readonly contract: Contract<AgentPrivateState>;
  private readonly addr: string;
  private readonly zswap: unknown;
  private state: unknown;

  private constructor(contract: Contract<AgentPrivateState>, addr: string, zswap: unknown, state: unknown) {
    this.contract = contract;
    this.addr = addr;
    this.zswap = zswap;
    this.state = state;
  }

  static async deploy(arbiterSecret: Uint8Array): Promise<MarketSim> {
    const contract = new Contract<AgentPrivateState>(witnesses);
    const init = await contract.initialState(
      rt.createConstructorContext(emptyPrivateState(arbiterSecret, ZERO32), COIN_PK),
      arbiterSecret,
    );
    return new MarketSim(
      contract,
      rt.sampleContractAddress(),
      init.currentZswapLocalState,
      (init.currentContractState as { data: unknown }).data,
    );
  }

  get ledger(): Ledger {
    return ledger(this.state as never) as Ledger;
  }

  /**
   * The serialized public contract state — byte-for-byte what an indexer would
   * hand back for this contract. Everything the chain knows is in this string
   * and nothing else is; the explorer panel renders it verbatim.
   */
  get publicState(): string {
    return (this.state as { toString(compact?: boolean): string }).toString(true);
  }

  agentId(secret: Uint8Array): Uint8Array {
    return pureCircuits.agentIdFrom(secret);
  }

  private async call<T>(
    ps: AgentPrivateState,
    fn: (ctx: rt.CircuitContext<AgentPrivateState>) => Promise<{ context: rt.CircuitContext<AgentPrivateState>; result: T }>,
  ): Promise<T> {
    const ctx = rt.createCircuitContext<AgentPrivateState>(
      "sim",
      this.addr,
      this.zswap as never,
      this.state as never,
      ps,
    );
    const res = await fn(ctx);
    this.state = (res.context.callContext.currentQueryContext as { state: unknown }).state;
    return res.result;
  }

  // --- bond ----------------------------------------------------------

  stakeBond(secret: Uint8Array, amount: bigint) {
    return this.call(emptyPrivateState(secret, ZERO32), (ctx) =>
      this.contract.impureCircuits.stakeBond(ctx, amount),
    );
  }

  withdrawBond(secret: Uint8Array, amount: bigint) {
    return this.call(emptyPrivateState(secret, ZERO32), (ctx) =>
      this.contract.impureCircuits.withdrawBond(ctx, amount),
    );
  }

  // --- reputation --------------------------------------------------

  registerAgent(ps: AgentPrivateState) {
    return this.call(ps, (ctx) => this.contract.impureCircuits.registerAgent(ctx));
  }

  /**
   * Fold one settled escrow into the caller's aggregate. The contract reads the
   * amount and outcome off the escrow, so `ps.stats` must already be whatever
   * the previous commitment was over — see `applySettlement`.
   */
  updateReputation(ps: AgentPrivateState, escrowId: Uint8Array) {
    // `ps` must already hold this escrow's opening — the circuit re-proves the
    // caller is the seller rather than reading a name off the record.
    return this.call(ps, (ctx) => this.contract.impureCircuits.updateReputation(ctx, escrowId));
  }

  proveReputation(ps: AgentPrivateState, minJobs: bigint, minRateBps: bigint, minVolume: bigint) {
    return this.call(ps, (ctx) =>
      this.contract.impureCircuits.proveReputation(ctx, minJobs, minRateBps, minVolume),
    );
  }

  // --- escrow ------------------------------------------------------

  /** The buyer opens against a commitment to the seller, not the seller's id. */
  openEscrow(
    buyerSecret: Uint8Array,
    escrowId: Uint8Array,
    sellerCommit: Uint8Array,
    amount: bigint,
  ) {
    return this.call(emptyPrivateState(buyerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.openEscrow(ctx, escrowId, sellerCommit, amount),
    );
  }

  /** The commitment a buyer opens with, given the seller's id and their nonce. */
  sellerCommitment(sellerId: Uint8Array, nonce: Uint8Array): Uint8Array {
    return pureCircuits.sellerCommitment(sellerId, nonce);
  }

  markDelivered(sellerSecret: Uint8Array, escrowId: Uint8Array, nonce: Uint8Array) {
    const ps = withEscrowNonce(emptyPrivateState(sellerSecret, ZERO32), escrowId, nonce);
    return this.call(ps, (ctx) => this.contract.impureCircuits.markDelivered(ctx, escrowId));
  }

  release(buyerSecret: Uint8Array, escrowId: Uint8Array) {
    return this.call(emptyPrivateState(buyerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.release(ctx, escrowId),
    );
  }

  /** Raising a dispute is where the buyer must name the seller. */
  dispute(buyerSecret: Uint8Array, escrowId: Uint8Array, sellerId: Uint8Array, nonce: Uint8Array) {
    const ps = withEscrowNonce(emptyPrivateState(buyerSecret, ZERO32), escrowId, nonce);
    return this.call(ps, (ctx) => this.contract.impureCircuits.dispute(ctx, escrowId, sellerId));
  }

  resolveDispute(callerSecret: Uint8Array, escrowId: Uint8Array, sellerAtFault: boolean) {
    return this.call(emptyPrivateState(callerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.resolveDispute(ctx, escrowId, sellerAtFault),
    );
  }
}

/** A private state for one agent, with an explicit committed aggregate. */
export function agentState(
  secret: Uint8Array,
  salt: Uint8Array,
  stats: ReputationStats = { ...ZERO_STATS },
  jobs: Job[] = [],
  escrowNonces: Record<string, Uint8Array> = {},
): AgentPrivateState {
  return { callerSecret: secret, ledgerSalt: salt, stats, jobs, escrowNonces };
}

export function job(client: Uint8Array, price: bigint, success: boolean): Job {
  return { client, price, success };
}

/**
 * Build a seller's committed aggregate the only way the contract allows: by
 * running real escrows through it.
 *
 * Registers the seller, then for each spec opens an escrow from `buyer`,
 * delivers, and either releases it or has the arbiter slash it — calling
 * `updateReputation` after each so the on-chain commitment tracks. Returns the
 * seller's private state, whose `stats` open that commitment.
 *
 * Tests use this instead of handing an agent a ledger, because handing an agent
 * a ledger is precisely what the contract no longer accepts.
 */
export async function earnStats(
  sim: MarketSim,
  opts: {
    seller: Uint8Array;
    sellerSalt: Uint8Array;
    buyer: Uint8Array;
    arbiter: Uint8Array;
    jobs: Array<{ price: bigint; success: boolean }>;
  },
): Promise<AgentPrivateState> {
  let ps = agentState(opts.seller, opts.sellerSalt);
  await sim.registerAgent(ps);

  const sellerId = sim.agentId(opts.seller);
  for (const [i, j] of opts.jobs.entries()) {
    const eid = new Uint8Array(32);
    crypto.getRandomValues(eid);
    eid[0] = i & 0xff; // keep ids distinct even if the RNG is stubbed

    // The opening both sides agree on when the job is arranged.
    const nonce = newEscrowNonce();
    ps = withEscrowNonce(ps, eid, nonce);

    await sim.openEscrow(opts.buyer, eid, sim.sellerCommitment(sellerId, nonce), j.price);
    await sim.markDelivered(opts.seller, eid, nonce);
    if (j.success) {
      await sim.release(opts.buyer, eid);
    } else {
      await sim.dispute(opts.buyer, eid, sellerId, nonce);
      await sim.resolveDispute(opts.arbiter, eid, true);
    }
    await sim.updateReputation(ps, eid);
    ps = agentState(
      opts.seller,
      opts.sellerSalt,
      applySettlement(ps.stats, j.price, j.success),
      ps.jobs,
      ps.escrowNonces,
    );
  }
  return ps;
}
