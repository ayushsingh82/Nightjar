// Nightjar — high-level marketplace client.
//
// Ties together: the connected wallet, one persona's encrypted job ledger, the
// compiled contract's circuit logic, and the prove→pay→submit pipeline.
//
// `TxAssembler` is the injection point for transaction assembly — the one part
// that still needs `@midnight-ntwrk/midnight-js-contracts` (version-blocked on
// our Compact 0.34 / runtime 0.19 toolchain) or hand-rolled `ledger-v8`.
// Everything else here is wired and tested.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import type { ProofProgress } from "./proof-server";
import { submitContractCall, type AssembledCall, type SubmitResult } from "./submit";
import { queryContractState } from "./providers";
import { AgentStateManager, type AgentPrivateState, type Job, type Persona } from "./agent";

export type CircuitName =
  | "stakeBond"
  | "withdrawBond"
  | "updateReputation"
  | "proveReputation"
  | "openEscrow"
  | "markDelivered"
  | "release"
  | "dispute"
  | "resolveDispute";

/** What a deploy yields once assembled. */
export type AssembledDeployment = AssembledCall & {
  contractAddress: string;
  signingKey: string;
};

/**
 * Builds unproven contract transactions. Structural, so `market-client` does
 * not import the ledger types; `MidnightTxAssembler` satisfies it.
 */
export interface TxAssembler {
  call(
    contractAddress: string,
    circuit: CircuitName,
    args: readonly unknown[],
    privateState: AgentPrivateState,
  ): Promise<AssembledCall>;

  /** `arbiterSecret` is the constructor argument: the deployer picks the arbiter. */
  deploy(
    arbiterSecret: Uint8Array,
    privateState: AgentPrivateState,
  ): Promise<AssembledDeployment>;
}

export type ReputationThresholds = { minJobs: bigint; minRateBps: bigint; minVolume: bigint };

export class MarketClient {
  private constructor(
    private readonly api: ConnectedAPI,
    private readonly config: ServiceConfig,
    private readonly state: AgentStateManager,
    private readonly assembler: TxAssembler,
    readonly persona: Persona,
    public contractAddress: string | null,
  ) {}

  static async create(opts: {
    api: ConnectedAPI;
    address: string;
    persona: Persona;
    config: ServiceConfig;
    assembler: TxAssembler;
    contractAddress?: string;
  }): Promise<MarketClient> {
    const state = await AgentStateManager.forWallet(opts.api, opts.address, opts.persona);
    return new MarketClient(
      opts.api,
      opts.config,
      state,
      opts.assembler,
      opts.persona,
      opts.contractAddress ?? null,
    );
  }

  // --- private state ---------------------------------------------

  loadLedger(): Promise<AgentPrivateState | null> {
    return this.state.load();
  }

  ensureIdentity(): Promise<AgentPrivateState> {
    return this.state.ensure();
  }

  recordJob(job: Job): Promise<AgentPrivateState> {
    return this.state.recordJob(job);
  }

  // --- lifecycle ------------------------------------------------

  join(contractAddress: string): void {
    this.contractAddress = contractAddress;
  }

  private async run(
    circuit: CircuitName,
    args: unknown[],
    onProgress: (p: ProofProgress) => void,
  ): Promise<SubmitResult> {
    if (!this.contractAddress) throw new Error("no contract — deploy() or join() first");
    const ps = await this.state.ensure();
    return submitContractCall(
      this.api,
      this.config,
      () => this.assembler.call(this.contractAddress!, circuit, args, ps),
      onProgress,
    );
  }

  // --- bond ---------------------------------------------------

  stakeBond(amount: bigint, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("stakeBond", [amount], onProgress);
  }

  withdrawBond(amount: bigint, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("withdrawBond", [amount], onProgress);
  }

  // --- reputation -------------------------------------------

  updateReputation(onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("updateReputation", [], onProgress);
  }

  proveReputation(t: ReputationThresholds, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("proveReputation", [t.minJobs, t.minRateBps, t.minVolume], onProgress);
  }

  // --- escrow ---------------------------------------------

  openEscrow(escrowId: Uint8Array, seller: Uint8Array, amount: bigint, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("openEscrow", [escrowId, seller, amount], onProgress);
  }

  markDelivered(escrowId: Uint8Array, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("markDelivered", [escrowId], onProgress);
  }

  release(escrowId: Uint8Array, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("release", [escrowId], onProgress);
  }

  dispute(escrowId: Uint8Array, onProgress: (x: ProofProgress) => void = () => {}) {
    return this.run("dispute", [escrowId], onProgress);
  }

  // --- reads --------------------------------------------

  marketState(): Promise<{ data: string; blockHeight: number } | null> {
    if (!this.contractAddress) return Promise.resolve(null);
    return queryContractState(this.config, this.contractAddress);
  }
}
