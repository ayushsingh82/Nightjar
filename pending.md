# agent-commerce — Pending

Working checklist tracked alongside the code. `[x]` done, `[~]` partial, `[ ]` open.
Milestones §1–§6 are complete, and so is transaction assembly. **Full ZK keygen
is no longer blocked** (601MB -> 57MB), **reputation is both sound and private**
— earned through settled escrows and unlinkable to the seller — and the app can
build and prove real contract transactions. What has not happened is a run
against a live network; see "Known gaps".

## Milestone status (plan.md)

- **§1 Core Contract (escrow + slashing) — DONE.** Compiles under Compact 0.23
  (`compact 0.5.2`, compiler 0.34.0). Full behavioural suite green
  (`test/marketplace.test.ts`, 20 cases: escrow lifecycle, slashing math,
  arbiter auth, reputation monotonicity, proof soundness). 41/41 passing,
  `tsc --noEmit` clean.
  - **Full ZK keygen now works and is fast.** It was the 64-slot double `fold`,
    not the machine: keys scale linearly with the cap (8 slots -> 36.8MB,
    64 -> 291MB), so no cap both fits a browser and supports a >=50-job badge.
    Reputation is now an incremental aggregate instead, which made the circuits
    O(1): **601MB -> 43MB total, keygen 12m37s -> 25s**, and the provable
    history is unbounded rather than capped at 64.
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
- **§5 UI — DONE.** `/console` hosts the marketplace (badge-only agent cards →
  hire), the seller dashboard (private ledger, bond + commitment, threshold
  proof → badge), the buyer dashboard (active escrows, deliver/release/dispute →
  arbiter), the explorer (chain-sees vs actually-private, driven from live
  ledger + witness state) and the demo runner. `ProofProgressView` is the render
  half of the existing `ProofProgress` / `runWithProgress` primitives.
- **§6 Demo — DONE (in-process).** A 12-step script runnable from the UI:
  seed → badge → hire → deliver → release → re-prove → dispute → slash.
  Asserted end to end in `src/lib/midnight/demo-market.test.ts`.

**How §5/§6 execute.** The generated contract loads its WASM through Node `fs`
(`onchain-runtime-v4`'s `node` export condition), so circuits cannot run in a
browser bundle. They run server-side in `src/lib/midnight/demo-market.ts`,
driving the owner's `MarketSim` — real circuit execution, real ledger state,
**unproven and never submitted**. The UI states this rather than implying a
chain write (`EXECUTION_NOTICE` in the snapshot; `ProofProgressView` renders
`balancing`/`submitting`/`confirming` as blocked on `TxAssembler`). The wallet
panel remains the real DApp Connector surface and is untouched.

Score so far: **6 milestones done (§1–§6).**

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
- [x] **Self-report killed.** `updateReputation(escrowId)` reads the amount and
  outcome off a settled escrow rather than taking the caller's word, and
  `countedEscrows` stops one settlement counting twice. `registerAgent` anchors
  every agent at a zero aggregate, so a history cannot start fabricated either.
- [x] **Full proving-key generation** — done, and the LEDGER_CAP question is
  moot because there is no cap any more.
- [x] **Seller linkability — fixed.** `EscrowRecord` now stores
  `persistentCommit(sellerAgentId, nonce)` instead of the agent id. The seller
  proves the opening to deliver or to record the job — no disclosure — and the
  buyer discloses it only when raising a dispute, because slashing has to name a
  bond. Every escrow uses a fresh opening, so two jobs by the same seller
  produce unrelated commitments: an observer cannot group escrows by seller, let
  alone count one seller's history. Asserted in demo-market.test.ts.
  - Cost: 43MB -> 57MB of keys, 25s -> 27s keygen. `updateReputation` carries
    the extra opening proof (9.5 -> 18.6MB).
  - `buyer == seller` moved from `openEscrow` (which can no longer see it) to
    `markDelivered`, where the opening is proven.

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
- [x] **`TxAssembler` — DONE.** `src/lib/midnight/tx-assembler.ts` builds real
  unproven ledger transactions for `deploy` and every circuit, on
  `midnight-js-contracts` 5.0.0-beta.7 + `ledger-v9`. The version block was real
  but is gone: 5.0.0-beta.7 depends on `compact-runtime` 0.19.0-rc.0, whose
  dependency set is identical to our 0.19.0.
  - The library does the parts that must be byte-exact with what the chain
    re-derives — transcript partitioning, the `ContractCallPrototype`, and the
    contract key location that embeds the deployed verifier key's hash.
  - Proving is delegated to the **wallet** (`getProvingProvider`), not a
    standalone proof server, which is why `submitCallTx` is not used.
  - Repo converted to an npm workspace with a `compact-runtime` override, so
    there is exactly one copy of the WASM runtime. Two copies means two sets of
    classes and `instanceof` failures across the boundary.
- [x] **Fixed: the proving step was wrong.** `submit.ts` handed the serialized
  transaction to `ProvingProvider.prove()` and treated the result as a proven
  transaction. `prove()` takes a proof *preimage*; the ledger drives it, once
  per contract call, from `Transaction.prove()`.
- [x] **Fixed: key locations were unparsed.** The wallet's prover is handed a
  contract key location, not a circuit name — `FetchKeyMaterialProvider` would
  have fetched it verbatim and 404'd, minutes into a proof, and only ever
  against a live wallet.
- [x] `npm run sync:zk` — copies keys + zkir into `public/zk/marketplace/`
  (40 files, 57MB).
- [x] **Proving verified for real.** `proof-server-provider.ts` is a
  `ProvingProvider` backed by a self-hosted `midnight-proof-server`, so the most
  expensive step no longer needs a human clicking through a browser extension.
  `npm run proof-server:up && npm run test:prove`:
  - `registerAgent` — 1.1s
  - **`proveReputation` — 1.9s**, 4.9KB proven transaction. That number only
    exists because the circuit went from a 64-slot fold (291MB key) to an
    incremental aggregate (9.5MB).
- [x] Live entry point — `src/lib/midnight/live.ts`: `connectMarket()` builds a
  `MarketClient` on the real assembler, `checkLiveReadiness()` pre-flights the
  artifacts and the wallet's network. The assembler is imported lazily, so the
  in-process demo fetches no WASM.
- [ ] **Submit to a live network.** Assembly and proving are verified; balancing,
  submission and confirmation are not. Those need the browser wallet: there is
  no headless wallet for this stack (`@midnight-ntwrk/wallet` tops out at 5.0.0
  on the old `zswap@4.0.0` architecture), so it needs tNIGHT, generated DUST,
  and a human approving in the extension.

## App / infra
- [x] Next 16 app builds (`next build`), `tsc --noEmit` clean, vitest wired (`npm test`)
- [x] `WalletProvider` in `layout.tsx`; `@/lib/midnight` barrel export
- [x] `src/lib/midnight/` unit tests (codec, encrypted store, two-persona managers, config, fees, signing, submit, client) — 21 cases
- [x] `demo-market.test.ts` — 7 more cases: badge-from-thresholds, badge
      staleness, escrow-id opacity, and the whole demo asserted against ledger
      state (28 app tests total; contracts still 45)
- [x] tsconfig `target` bumped to ES2020 (bigint), `contracts/` excluded from app typecheck
- [x] repaired truncated `@next/swc-darwin-arm64` binary
- [x] `tsx` + `contracts` script (`seed:seller`)
- [x] eslint pass over `src/lib/midnight/` — run (`npm run lint`), clean. Fixed:
      `react-hooks/set-state-in-effect` in `use-wallet.tsx` (and the same shape in
      the new `use-market.tsx`), and added `contracts/src/managed/**` to
      `globalIgnores` (compiler output, already gitignored)
- [x] `@midnight-ntwrk/compact-runtime` added to the app's dependencies and
      declared in `serverExternalPackages` — the app now executes circuits in its
      Node runtime, and the WASM must not be bundled
- [x] `contracts/src/managed/` must exist before `npm run build`
      (`cd contracts && npm run compact:fast`, ~1 s) — it is gitignored

## Agent runtime
- [x] `Agent` — identity secret + salt + private job ledger (`recordJob` / `seedLedger`) — `contracts/src/runtime.ts`
- [x] Scripted job lifecycle — `runJob` / `runJobs` (open → deliver → release → both ledgers → re-commit; or dispute → arbiter slash)
- [x] Seed script — `npm run seed:seller` seeds a ≥50 job / ≥95% / ≥$10k history and proves the badge
- [x] `test/runtime.test.ts` (4 cases)
- [ ] Real agent-to-agent messaging / task payloads (currently direct calls)

## UI
- [x] Landing + connect — `page.tsx` + `WalletPanel` (address, DUST, proof-server status, privacy note)
- [x] Proof progress primitives — `ProofProgress` / `runWithProgress`
- [x] Proof progress render component — `ProofProgressView.tsx`; shows the two
      phases this build runs and marks `balancing`/`submitting`/`confirming`
      blocked on `TxAssembler` instead of faking them
- [x] Server-side contract session — `src/lib/midnight/demo-market.ts` +
      `src/app/api/market/route.ts`; wire types split into `market-types.ts`
      (client-safe) so the browser bundle never pulls the contract in
- [x] `MarketProvider` / `useMarket` — `use-market.tsx`, mirrors `use-wallet.tsx`
- [x] Marketplace: agent list with ZK badge only — `Marketplace.tsx`. A card shows
      the agent id, the on-chain bond and the badge. No client list, no prices, no
      job count, no history
- [x] Hire → open + fund escrow. `escrowId` is 32 CSPRNG bytes
      (`randomEscrowId` in `contracts/src/runtime.ts`) — the contract cannot
      enforce opacity, so a counter/name/price-derived id would hand an observer
      the exact linkage this design removes
- [x] Seller dashboard: private job ledger view — `SellerDashboard.tsx`, local only
- [x] Seller dashboard: bond + on-chain commitment (+ stake, + re-commit)
- [x] Seller: generate reputation proof → publish badge. The badge renders from
      the **proven thresholds** (`badge.ts`), never from local stats, and goes
      stale when the commitment it was checked against is superseded
- [x] Buyer dashboard: active escrows, deliver/release/dispute — `BuyerDashboard.tsx`
      (deliver runs as the seller agent; the circuit asserts the caller)
- [x] Explorer panel (chain-sees vs actually-private) — `ExplorerPanel.tsx`:
      public ledger field by field, the verbatim serialized contract state + its
      SHA-256, every agent's witness ledger, a per-call ledger-write diff, and a
      leak check that searches the real serialized state for the real private
      values on every render

## Demo
- [x] Seed seller with strong private history — reuses `demoSellerLedger()`;
      `newcomerSellerLedger()` added alongside it for the agent that *cannot*
      clear the badge
- [x] End-to-end: badge → hire → escrow → deliver → release — `DemoRunner.tsx`,
      12 steps, runnable from `/console`
- [~] Explorer shows an opaque settlement — the escrow ledger row, the serialized
      state and the state digest are real and are shown next to what they do *not*
      carry. There is no settlement **transaction**: submission is blocked on
      `TxAssembler`, and the UI says so rather than inventing a tx hash
- [x] Dispute → slash with no ledger leak — bond and `slashedTotal` move, the
      failed job lands only in the seller's private ledger

## Open questions
- [ ] Which Midnight wallet for the demo (Lace / other)?
- [x] **LEDGER_CAP + proof time — resolved.** Neither keeping 64 nor lowering it
      worked (36.8MB even at 8 slots). Replaced the fold with an incremental
      aggregate: O(1) circuits, no cap, 43MB of keys.
- [ ] Escrow asset — native token or mock stablecoin?
- [x] Commitment scheme — hash-chain fold + persistentCommit (decided)
- [x] Dispute resolution — arbiter key set at deploy (decided); still need the arbiter service
- [ ] Testnet faucet + DUST for both agent accounts
