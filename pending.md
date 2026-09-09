# agent-commerce — Pending

Working checklist tracked alongside the code. `[x]` done, `[~]` partial, `[ ]` open.
Milestones §1, §2, §3, §4 are complete and pushed; §5 is a shell.

## Milestone status (plan.md)

- **§1 Core Contract (escrow + slashing) — DONE.** Compiles under Compact 0.23
  (`compact 0.5.2`, compiler 0.34.0). Full behavioural suite green
  (`test/marketplace.test.ts`, 20 cases: escrow lifecycle, slashing math,
  arbiter auth, reputation monotonicity, proof soundness). 41/41 passing,
  `tsc --noEmit` clean.
  - *Caveat:* built with `--skip-zk` (logic + JS only). Full proving-key
    generation for `proveReputation` is heavy — a 64-slot double `fold`
    (`ledgerHash` + stats) — and does not finish quickly on this machine. Tied
    to the LEDGER_CAP tuning question below. Simulator tests do not need keys.
- **§2 Reputation Circuit + TS parity — DONE.** `reputation.ts` reference +
  `test/reputation.parity.test.ts` (21 cases): every persona × threshold agrees
  with the compiled `proveReputation` circuit.
- **§3 Wallet Integration — DONE.** `src/lib/midnight/`: DApp Connector wrapper,
  React `WalletProvider`/`useWallet`, AES-GCM encrypted private-state store keyed
  to a wallet signature and scoped by `(address, persona)` — buyer and seller
  agents run from one browser with separate identities and ledgers — proof-server
  health check, message signing + agent challenges, DUST fee state + pre-flight
  check, and the `prove → pay fees → submit → confirm` pipeline (`submit.ts`)
  wired to the phase machine. `MarketClient` composes it all (one method per
  circuit). 21 app unit tests, `tsc` clean, `next build` green. The one remaining
  seam is transaction assembly (`TxAssembler`) — `midnight-js-contracts` is
  version-blocked on our Compact 0.34 / runtime 0.19 toolchain.
- **§4 Agent Runtime — DONE.** `contracts/src/runtime.ts` — `Agent` (identity +
  salt + private ledger), `runJob` / `runJobs` scripting buyer↔seller task
  lifecycles against the contract (open → deliver → release → both ledgers
  updated → seller re-commits; or dispute → arbiter slash). `demoSellerLedger`
  builds a history that clears the badge; `npm run seed:seller`
  (`scripts/seed-seller.ts`) seeds it and proves it. `test/runtime.test.ts`
  (4 cases).
- §5 UI — landing page + wallet-connect panel shipped; marketplace, seller/buyer
  dashboards, badge flow, explorer panel not started.
- §6 demo — not started.

Score so far: **4 milestones done (§1, §2, §3, §4), 1 in progress (§5 shell).**

## Now
- [x] Reputation ledger shape (Job{client,price,success}, LEDGER_CAP 64)
- [x] Scaffold `contracts/` with a Compact starter contract
- [x] Define ledger state (arbiterPk, bonds, reputationCommitments, escrows, escrowCount, slashedTotal)
- [x] Reworked to Compact >= 0.23 + applied REVIEW.md S1/S2/S4/S5/S7, C4/C5/C6/C7
- [~] Install the `compact` compiler and compile `src/marketplace.compact` — compiles with `--skip-zk`; full ZK keygen deferred (see caveat above)

## Core contract
- [x] `openEscrow` — compiled + tested
- [x] `markDelivered` / `release` (happy path) — compiled + tested; each rebuilds EscrowRecord explicitly
- [x] `dispute` + `resolveDispute` — compiled + tested; arbiter-only via `deriveArbiterPk`
- [x] `updateReputation` — compiled + tested; self-reported ledger (see C-note below)
- [x] `proveReputation(minJobs, minRateBps, minVolume)` — compiled + tested, discloses only a bool
- [x] `stakeBond` / `withdrawBond`
- [x] `fold` with tuple accumulator `[Uint<64>,Uint<64>,Uint<64>]` + `acc[i]` indexing — confirmed against runtime
- [x] Contract test suite (lifecycle, slashing, monotonicity, proof soundness) — `test/marketplace.test.ts`
- [x] Parity test: `reputation.ts` vs `proveReputation` circuit — `test/reputation.parity.test.ts`
- [x] In-memory simulator (`test/simulator.ts`) — no proof server
- [x] Export `agentIdFrom` / `deriveArbiterPk` pure circuits (needed by tests + clients)
- [ ] Bind each `jobLeaf` to an on-chain escrow receipt in `release` (kill self-report)
- [ ] Full proving-key generation — needs the LEDGER_CAP decision first (below)

## Reputation circuit
- [x] Fixed-point success-rate check: successes*10000 >= total*minRateBps
- [x] Volume sum over successful jobs (fold)
- [x] Commitment check against on-chain `persistentCommit(ledgerHash, salt)`
- [x] TS reference `reputation.ts`
- [x] Parity tests per persona

## Wallet + infra
- [x] Wallet connector integration (buyer + seller personas) — `connector.ts`, `use-wallet.tsx`
- [x] Local encrypted job-ledger store keyed to agent identity — `private-state.ts` + `agent.ts` (`AgentStateManager`, scoped by `(address, persona)`); unit-tested
- [x] Local proof server config + health check — `config.ts` + `checkProofServerHealth`
- [x] Message signing + agent challenges — `signing.ts`
- [x] DUST fee state + pre-flight `assertCanPayFees` — `fees.ts`
- [x] Submit pipeline — `submit.ts`: fee check → assemble → prove → `balanceUnsealedTransaction({payFees:true})` → `submitTransaction` → poll indexer, driven by the phase machine
- [x] `MarketClient` — persona ledger + assembler + submit, one method per circuit — `market-client.ts`
- [x] SDK-free provider foundation — `providers.ts` (`FetchKeyMaterialProvider`, `queryContractState`)
- [x] Demo panel note: settlement is DUST-paid by the wallet as relayer — no buyer↔seller edge on the fee tx (WalletPanel)
- [x] Unit tests for fees / signing / submit pipeline / client orchestration — `submit.test.ts` (9 cases)
- [ ] `TxAssembler` implementation — `midnight-js-contracts` 4.1.1 pins `compact-runtime` 0.16 vs our 0.19; either it catches up, or hand-roll via `ledger-v8`
- [ ] `npm run sync:zk` to copy compiled keys into `public/zk/marketplace/` before a real proof

## App / infra
- [x] Next 16 app builds (`next build`), `tsc --noEmit` clean, vitest wired (`npm test`)
- [x] `WalletProvider` in `layout.tsx`; `@/lib/midnight` barrel export
- [x] `src/lib/midnight/` unit tests (codec, encrypted store, two-persona managers, config, fees, signing, submit, client) — 21 cases
- [x] tsconfig `target` bumped to ES2020 (bigint), `contracts/` excluded from app typecheck
- [x] repaired truncated `@next/swc-darwin-arm64` binary
- [x] `tsx` + `contracts` script (`seed:seller`)
- [ ] eslint pass over `src/lib/midnight/` (not yet run)

## Agent runtime
- [x] `Agent` — identity secret + salt + private job ledger (`recordJob` / `seedLedger`) — `contracts/src/runtime.ts`
- [x] Scripted job lifecycle — `runJob` / `runJobs` (open → deliver → release → both ledgers → re-commit; or dispute → arbiter slash)
- [x] Seed script — `npm run seed:seller` seeds a ≥50 job / ≥95% / ≥$10k history and proves the badge
- [x] `test/runtime.test.ts` (4 cases)
- [ ] Real agent-to-agent messaging / task payloads (currently direct calls)

## UI
- [x] Landing + connect — `page.tsx` + `WalletPanel` (address, DUST, proof-server status, privacy note)
- [x] Proof progress primitives — `ProofProgress` / `runWithProgress` (render component still TODO)
- [ ] Marketplace: agent list with ZK badge only
- [ ] Hire → open + fund escrow
- [ ] Seller dashboard: private job ledger view
- [ ] Seller dashboard: bond + on-chain commitment
- [ ] Seller: generate reputation proof → publish badge
- [ ] Buyer dashboard: active escrows, deliver/release/dispute
- [ ] Explorer panel (chain-sees vs actually-private)

## Demo
- [ ] Seed seller with strong private history
- [ ] End-to-end: badge → hire → escrow → deliver → release
- [ ] Explorer shows opaque settlement tx
- [ ] Optional dispute → slash with no ledger leak

## Open questions
- [ ] Which Midnight wallet for the demo (Lace / other)?
- [ ] **LEDGER_CAP + proof time.** Full keygen for `proveReputation` at CAP 64 is
      slow. Dropping to 32/16 speeds it up but caps the provable job count —
      and the demo badge wants ≥50 jobs. Options: keep 64 and eat the keygen
      cost once, move the ledger to a `MerkleTree` (REVIEW C4) so the circuit
      folds over a witness path instead of 64 slots, or lower the demo threshold.
- [ ] Escrow asset — native token or mock stablecoin?
- [x] Commitment scheme — hash-chain fold + persistentCommit (decided)
- [x] Dispute resolution — arbiter key set at deploy (decided); still need the arbiter service
- [ ] Testnet faucet + DUST for both agent accounts
