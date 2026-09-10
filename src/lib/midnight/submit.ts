// Nightjar — the "prove → pay fees → submit → confirm" pipeline.
//
// Composes the DApp Connector API's proving, balancing and relay methods with
// the `proof-server.ts` phase machine so every escrow / reputation call renders the
// same progress UI.
//
// The wallet does the expensive parts: `getProvingProvider` returns a prover
// bound to our compiled circuit assets, `balanceUnsealedTransaction` pays DUST
// fees and fixes imbalances, `submitTransaction` relays.

import type { ConnectedAPI, ProvingProvider } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import { assertCanPayFees, readFeeState } from "./fees";
import { getProvingProvider, queryContractState } from "./providers";
import { runWithProgress, type ProofProgress } from "./proof-server";

export type SubmitResult = {
  txSubmitted: true;
  /** Latest ledger state after the call landed (poll result). */
  blockHeight: number;
};

/**
 * A contract call that has been assembled but not yet proven.
 *
 * `prove` is a method rather than raw bytes because proving is the ledger's
 * job, not ours: it walks the transaction's contract calls and drives the
 * prover per proof. Keeping it behind this interface means the ledger types
 * stay in `tx-assembler.ts` and this module only handles the serialized string
 * the wallet wants.
 */
export type AssembledCall = {
  circuitId: string;
  contractAddress: string;
  /** Prove the transaction and return it serialized, ready for balancing. */
  prove(provider: ProvingProvider): Promise<string>;
  /**
   * The unproven transaction, serialized. Nothing in the pipeline needs it —
   * it is here so an assembled call can be inspected or persisted before the
   * minutes-long proof, which is otherwise the only way to see one.
   */
  serializeUnproven(): string;
};

/** An assembled call plus the ledger state it would leave behind. */
export type AssembledCallWithState<S = unknown> = AssembledCall & {
  /**
   * The contract state this call produces, with the deployed operations (and so
   * the verifier keys) carried over from the state it ran against.
   *
   * Useful for chaining several calls before any of them confirms, and for
   * showing an agent the effect of an action before it pays for a proof. It is
   * a *prediction*: the chain decides, and a competing transaction can land
   * first.
   */
  nextContractState: S;
};

/**
 * Run one contract call to completion, reporting progress.
 *
 * `assembleCall` is the single step that still needs transaction assembly
 * (`@midnight-ntwrk/midnight-js-contracts`, or hand-rolled `ledger-v8`). It
 * receives nothing and returns the unproven transaction; everything after it —
 * proving, fee payment, relay, confirmation — is wired here.
 */
export async function submitContractCall(
  api: ConnectedAPI,
  config: ServiceConfig,
  assembleCall: () => Promise<AssembledCall>,
  onProgress: (p: ProofProgress) => void,
): Promise<SubmitResult> {
  let call: AssembledCall | undefined;
  let provenTx: string | undefined;
  let balancedTx: string | undefined;
  let blockHeight = 0;

  await runWithProgress(
    [
      {
        phase: "building",
        run: async () => {
          const fees = await readFeeState(api);
          assertCanPayFees(fees);
          call = await assembleCall();
        },
      },
      {
        phase: "proving",
        run: async () => {
          const prover = await getProvingProvider(api, config);
          // The ledger drives the prover, once per contract call in the
          // transaction. Handing it the whole serialized transaction — as this
          // used to — is not what `ProvingProvider.prove` takes: that wants a
          // proof *preimage*.
          provenTx = await call!.prove(prover);
        },
      },
      {
        phase: "balancing",
        run: async () => {
          const { tx } = await api.balanceUnsealedTransaction(provenTx!, { payFees: true });
          balancedTx = tx;
        },
      },
      {
        phase: "submitting",
        run: async () => {
          await api.submitTransaction(balancedTx!);
        },
      },
      {
        phase: "confirming",
        run: async () => {
          const state = await queryContractState(config, call!.contractAddress);
          blockHeight = state?.blockHeight ?? 0;
        },
      },
    ],
    onProgress,
  );

  return { txSubmitted: true, blockHeight };
}
