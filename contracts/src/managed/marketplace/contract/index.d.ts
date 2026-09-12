import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum EscrowState { EMPTY = 0,
                          FUNDED = 1,
                          DELIVERED = 2,
                          RELEASED = 3,
                          DISPUTED = 4,
                          SLASHED = 5
}

export type Witnesses<PS> = {
  callerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  reputationStats(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [bigint,
                                                                               bigint,
                                                                               bigint]];
  ledgerSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  escrowNonce(context: __compactRuntime.WitnessContext<Ledger, PS>,
              escrowId_0: Uint8Array): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  stakeBond(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdrawBond(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  registerAgent(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  updateReputation(context: __compactRuntime.CircuitContext<PS>,
                   escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  proveReputation(context: __compactRuntime.CircuitContext<PS>,
                  minJobs_0: bigint,
                  minRateBps_0: bigint,
                  minVolume_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  openEscrow(context: __compactRuntime.CircuitContext<PS>,
             escrowId_0: Uint8Array,
             sellerCommit_0: Uint8Array,
             amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  markDelivered(context: __compactRuntime.CircuitContext<PS>,
                escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  release(context: __compactRuntime.CircuitContext<PS>, escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  dispute(context: __compactRuntime.CircuitContext<PS>,
          escrowId_0: Uint8Array,
          seller_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 escrowId_0: Uint8Array,
                 sellerAtFault_0: boolean): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  stakeBond(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdrawBond(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  registerAgent(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  updateReputation(context: __compactRuntime.CircuitContext<PS>,
                   escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  proveReputation(context: __compactRuntime.CircuitContext<PS>,
                  minJobs_0: bigint,
                  minRateBps_0: bigint,
                  minVolume_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  openEscrow(context: __compactRuntime.CircuitContext<PS>,
             escrowId_0: Uint8Array,
             sellerCommit_0: Uint8Array,
             amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  markDelivered(context: __compactRuntime.CircuitContext<PS>,
                escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  release(context: __compactRuntime.CircuitContext<PS>, escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  dispute(context: __compactRuntime.CircuitContext<PS>,
          escrowId_0: Uint8Array,
          seller_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 escrowId_0: Uint8Array,
                 sellerAtFault_0: boolean): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  agentIdFrom(sk_0: Uint8Array): Uint8Array;
  deriveArbiterPk(sk_0: Uint8Array): Uint8Array;
  statsCommit(total_0: bigint,
              successes_0: bigint,
              volume_0: bigint,
              salt_0: Uint8Array): Uint8Array;
  sellerCommitment(agentId_0: Uint8Array, nonce_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  agentIdFrom(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  deriveArbiterPk(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  statsCommit(context: __compactRuntime.CircuitContext<PS>,
              total_0: bigint,
              successes_0: bigint,
              volume_0: bigint,
              salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  sellerCommitment(context: __compactRuntime.CircuitContext<PS>,
                   agentId_0: Uint8Array,
                   nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  stakeBond(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdrawBond(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  registerAgent(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  updateReputation(context: __compactRuntime.CircuitContext<PS>,
                   escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  proveReputation(context: __compactRuntime.CircuitContext<PS>,
                  minJobs_0: bigint,
                  minRateBps_0: bigint,
                  minVolume_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  openEscrow(context: __compactRuntime.CircuitContext<PS>,
             escrowId_0: Uint8Array,
             sellerCommit_0: Uint8Array,
             amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  markDelivered(context: __compactRuntime.CircuitContext<PS>,
                escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  release(context: __compactRuntime.CircuitContext<PS>, escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  dispute(context: __compactRuntime.CircuitContext<PS>,
          escrowId_0: Uint8Array,
          seller_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 escrowId_0: Uint8Array,
                 sellerAtFault_0: boolean): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly arbiterPk: Uint8Array;
  bonds: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  reputationCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  escrows: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { buyer: Uint8Array,
                                 sellerCommit: Uint8Array,
                                 amount: bigint,
                                 state: EscrowState
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { buyer: Uint8Array,
  sellerCommit: Uint8Array,
  amount: bigint,
  state: EscrowState
}]>
  };
  readonly escrowCount: bigint;
  readonly slashedTotal: bigint;
  countedEscrows: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  disputedSellers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               arbiterSecret_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
