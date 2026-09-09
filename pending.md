# agent-commerce — Pending

Working checklist. Not committed. Move items to done as they land.

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
- §3 wallet, §4 agent runtime, §5 UI, §6 demo — not started.

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
- [ ] Wallet connector integration (buyer + seller personas)
- [ ] Local encrypted job-ledger store keyed to agent identity
- [ ] Local proof server config + health check
- [ ] DUST fee handling
- [ ] Demo panel: settlement tx does not reveal buyer↔seller edge

## Agent runtime
- [ ] Minimal agent harness (identity + wallet + ledger)
- [ ] Scripted job lifecycle
- [ ] Seed script: seller history satisfying ≥50 jobs / ≥95% / ≥$10k

## UI
- [ ] Landing + connect
- [ ] Marketplace: agent list with ZK badge only
- [ ] Hire → open + fund escrow
- [ ] Seller dashboard: private job ledger view
- [ ] Seller dashboard: bond + on-chain commitment
- [ ] Seller: generate reputation proof → publish badge
- [ ] Buyer dashboard: active escrows, deliver/release/dispute
- [ ] Explorer panel (chain-sees vs actually-private)
- [ ] Proof progress + error states

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
