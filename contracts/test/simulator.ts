// agent-commerce — in-memory contract simulator for tests.
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
  emptyPrivateState,
  witnesses,
  type AgentPrivateState,
  type Job,
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

  updateReputation(ps: AgentPrivateState) {
    return this.call(ps, (ctx) => this.contract.impureCircuits.updateReputation(ctx));
  }

  proveReputation(ps: AgentPrivateState, minJobs: bigint, minRateBps: bigint, minVolume: bigint) {
    return this.call(ps, (ctx) =>
      this.contract.impureCircuits.proveReputation(ctx, minJobs, minRateBps, minVolume),
    );
  }

  // --- escrow ------------------------------------------------------

  openEscrow(buyerSecret: Uint8Array, escrowId: Uint8Array, seller: Uint8Array, amount: bigint) {
    return this.call(emptyPrivateState(buyerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.openEscrow(ctx, escrowId, seller, amount),
    );
  }

  markDelivered(sellerSecret: Uint8Array, escrowId: Uint8Array) {
    return this.call(emptyPrivateState(sellerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.markDelivered(ctx, escrowId),
    );
  }

  release(buyerSecret: Uint8Array, escrowId: Uint8Array) {
    return this.call(emptyPrivateState(buyerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.release(ctx, escrowId),
    );
  }

  dispute(buyerSecret: Uint8Array, escrowId: Uint8Array) {
    return this.call(emptyPrivateState(buyerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.dispute(ctx, escrowId),
    );
  }

  resolveDispute(callerSecret: Uint8Array, escrowId: Uint8Array, sellerAtFault: boolean) {
    return this.call(emptyPrivateState(callerSecret, ZERO32), (ctx) =>
      this.contract.impureCircuits.resolveDispute(ctx, escrowId, sellerAtFault),
    );
  }
}

/** A private job-ledger state for one agent. */
export function agentState(secret: Uint8Array, salt: Uint8Array, jobLedger: Job[] = []): AgentPrivateState {
  return { callerSecret: secret, ledgerSalt: salt, jobLedger };
}

export function job(client: Uint8Array, price: bigint, success: boolean): Job {
  return { client, price, success };
}
