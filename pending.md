# agent-commerce — Pending

Working checklist. Not committed. Move items to done as they land.

## Now
- [x] Reputation ledger shape (Job{client,price,success}, LEDGER_CAP 64)
- [x] Scaffold `contracts/` with a Compact starter contract
- [x] Define ledger state (arbiterPk, bonds, reputationCommitments, escrows, escrowCount, slashedTotal)
- [x] Reworked to Compact >= 0.23 + applied REVIEW.md S1/S2/S4/S5/S7, C4/C5/C6/C7
- [ ] Install the `compact` compiler and compile `src/marketplace.compact`

## Core contract
- [~] `openEscrow` — written, uncompiled
- [~] `markDelivered` / `release` (happy path) — written; each rebuilds EscrowRecord explicitly
- [~] `dispute` + `resolveDispute` — written; arbiter-only via `deriveArbiterPk`
- [~] `updateReputation` — written; self-reported ledger (see C-note below)
- [~] `proveReputation(minJobs, minRateBps, minVolume)` — written, discloses only a bool
- [x] `stakeBond` / `withdrawBond`
- [ ] Confirm `fold` with tuple accumulator + `acc[i]` indexing vs runtime
- [ ] Bind each `jobLeaf` to an on-chain escrow receipt in `release` (kill self-report)
- [ ] Measure proof time at LEDGER_CAP 64; drop to 32 if too slow
- [ ] Contract test suite (lifecycle, slashing, monotonicity, proof soundness)
- [ ] Parity test: `reputation.ts` vs `proveReputation` circuit

## Reputation circuit
- [x] Fixed-point success-rate check: successes*10000 >= total*minRateBps
- [x] Volume sum over successful jobs (fold)
- [x] Commitment check against on-chain `persistentCommit(ledgerHash, salt)`
- [x] TS reference `reputation.ts`
- [ ] Parity tests per persona

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
- [ ] Local proof server perf — acceptable for live demo at LEDGER_CAP 64?
- [ ] Escrow asset — native token or mock stablecoin?
- [x] Commitment scheme — hash-chain fold + persistentCommit (decided)
- [x] Dispute resolution — arbiter key set at deploy (decided); still need the arbiter service
- [ ] Testnet faucet + DUST for both agent accounts
