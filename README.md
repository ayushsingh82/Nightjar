# agent-commerce — Private Agent-to-Agent Commerce + Reputation

Private commerce and portable reputation for the AI agent economy, built on
[Midnight](https://midnight.network) for the Midnight Buildathon.

Agents hire and pay each other for work. Pricing, client identity, and deal
volume stay in private state. An agent proves a reputation threshold —

> "≥ 50 completed jobs, ≥ 95% success rate, ≥ $10k volume"

— to win new work, without exposing a single client or price.

---

## Problem

Reputation is how agents (and the humans behind them) decide who to trust with a
task and a payment. Today that means either a public track record — every
client, price, and outcome visible to competitors — or a centralized platform
that holds the data and takes rent. Neither is acceptable infrastructure for an
open agent economy.

## Approach

| Layer | Contents |
|---|---|
| **Private (witness)** | job ledger (client, price, outcome), agent identity secret, ledger salt |
| **Public (ledger)** | staked bonds, per-agent reputation commitment, escrow records, arbiter key, slashed total |
| **Disclosed by a proof** | a single boolean: does the private ledger meet the requested `(minJobs, minRate, minVolume)` |

The job ledger is committed on-chain as `persistentCommit(ledgerHash, salt)`.
`proveReputation` re-folds the witness ledger, checks it against that
commitment, and discloses only the boolean — no per-job data leaves the circuit.
Escrow follows `openEscrow → markDelivered → release`; a dispute goes to an
arbiter (key fixed at deploy) who can slash the seller's bond by up to the
escrow amount.

**Why Midnight:** DUST-based metadata privacy means the settlement transaction
does not carry the buyer↔seller edge. Escrow records name their counterparties
as hashed ids, but each settlement is its own transaction and the payment graph
cannot be reconstructed across transactions — metadata privacy, not just amount
privacy.

---

## Architecture

```
contracts/                    Compact smart contract + tests
  src/marketplace.compact       core contract (9 circuits)
  src/witnesses.ts              private-state shape + witness implementations
  src/reputation.ts             TS reference for the aggregation
  src/runtime.ts                agent runtime — Agent, runJob/runJobs
  scripts/seed-seller.ts        CLI: seed a badge-clearing seller history
  test/                         in-memory simulator + behavioural & parity suites
src/
  lib/midnight/                 Midnight integration layer (see below)
  components/                   wallet panel, marketplace, dashboards, explorer
  app/console/                  the console (all of §5)
  app/api/market/               server route the circuits run behind
```

### Contract (`contracts/`)

Compiles under Compact ≥ 0.23 (`compact` 0.5.2 / compiler 0.34.0),
`compact-runtime` 0.19. Circuits: `stakeBond`, `withdrawBond`,
`updateReputation`, `proveReputation`, `openEscrow`, `markDelivered`, `release`,
`dispute`, `resolveDispute`.

```bash
cd contracts
npm install
npm run compact:fast   # compile logic (--skip-zk) -> src/managed/marketplace
npm run check          # tsc --noEmit && vitest run   (45 tests)
npm run seed:seller    # seed a badge-clearing seller history and prove it
```

Test coverage: full escrow lifecycle and its guards, slashing math (slash by
amount, capped at bond, no-fault, arbiter-only authorization), reputation
monotonicity, proof soundness (a fabricated or wrong-salt ledger is rejected),
TS↔circuit parity across every persona × threshold combination, and the agent
runtime (scripted job lifecycles, dispute → slash, badge seeding).

> Full ZK key generation for `proveReputation` is expensive — a 64-slot double
> `fold` — and is decoupled from the test loop (the simulator needs no keys).
> Tuning `LEDGER_CAP` vs. a Merkle-path model is tracked in `pending.md`.

### Midnight integration (`src/lib/midnight/`)

| Module | Responsibility |
|---|---|
| `config` | network endpoints per `NetworkId`; merges the wallet's reported service URIs over defaults |
| `connector` | DApp Connector API — enumerate injected wallets, connect, read the unshielded address, connection status, DUST balance |
| `private-state` | `EncryptedPrivateStateStore` — AES-GCM at rest, key derived from a wallet signature |
| `codec` | JSON encoding that preserves `bigint` and `Uint8Array` |
| `agent` | per-persona job-ledger state — `AgentStateManager` scoped by `(address, buyer\|seller)`, plus a local `localStats` preview |
| `signing` | message signing + nonce-bearing agent challenges |
| `fees` | DUST fee state and a pre-flight `assertCanPayFees` check |
| `proof-server` | proof-server health check and the `building → proving → balancing → submitting → confirming` progress machine |
| `providers` | SDK-free foundation: serves compiled ZK assets to the wallet's prover, reads contract state from the indexer |
| `submit` | the `fee check → assemble → prove → balance → submit → confirm` pipeline |
| `market-client` | `MarketClient` — one method per circuit, composing persona ledger + assembler + submit |
| `badge` | the marketplace badge, derived from the thresholds a proof actually used |
| `market-types` | wire shape of a market snapshot (client-safe) |
| `demo-market` | **server-only** — runs the compiled circuits and holds the session |
| `use-wallet` | React `WalletProvider` / `useWallet()` — the wallet session |
| `use-market` | React `MarketProvider` / `useMarket()` — the contract session |

The buyer and seller agents run from one browser with separate identities and
separately encrypted ledgers. `submit.ts` takes a `TxAssembler` — the one step
that still needs transaction assembly; `@midnight-ntwrk/midnight-js-contracts`
4.1.1 pins `compact-runtime` 0.16 against our 0.19 toolchain.

---

## Status

| Milestone (`plan.md`) | State |
|---|---|
| §1 Core contract | **Done** — compiles, 45 tests green |
| §2 Reputation circuit + parity | **Done** — TS reference + circuit parity |
| §3 Wallet integration | **Done** — connector, two-persona encrypted state, signing, DUST fees, prove→pay→submit pipeline, `MarketClient` (21 app tests); one seam (`TxAssembler`) awaits a runtime-compatible SDK |
| §4 Agent runtime | **Done** — `Agent`, scripted `runJob`/`runJobs`, `seed:seller` script that clears the badge (4 tests) |
| §5 UI | **Done** — marketplace, seller + buyer dashboards, explorer, proof-progress component |
| §6 Demo | **Done** — 12-step script runnable from `/console`, asserted end to end |

**6 of 7 milestones complete.**

### How the UI executes circuits

The generated contract loads its WASM through Node `fs`, so it cannot run in a
browser bundle. The console therefore drives the circuits **server-side**
(`src/lib/midnight/demo-market.ts` behind `/api/market`), on top of the same
`MarketSim` the tests and `seed:seller` use. That means real circuit execution,
real asserts and real ledger state — but **unproven**, and **not submitted**:

- `proveReputation` at `LEDGER_CAP` 64 cannot be proven on a normal machine —
  key generation succeeds but every proof attempt OOM-kills the proof server.
- transaction assembly (`TxAssembler`) is still version-blocked.

The UI says all of this on screen rather than implying otherwise: the console
carries an execution notice, and the progress component renders
`balancing` / `submitting` / `confirming` as blocked. The wallet panel is a real
DApp Connector session and is unchanged.

---

## Getting started

```bash
cd contracts && npm install && npm run compact:fast && cd ..   # required first:
                                                              # src/managed/ is gitignored
npm install
npm run dev        # http://localhost:3000  →  /console
npm test           # 28 app tests, including the whole demo against ledger state
npm run typecheck
npm run lint
npm run build
```

A Midnight wallet extension (1AM or Lace) is required to connect. Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MIDNIGHT_NETWORK` | `preprod` | target network |
| `NEXT_PUBLIC_PROOF_SERVER` | `http://127.0.0.1:6300` | self-hosted proof server for the health check |

After compiling the contract, run `npm run sync:zk` to copy the proving/verifier
keys into `public/zk/marketplace/`.

---

## Roadmap

1. Resolve `LEDGER_CAP` / proof-time, then generate full proving keys.
2. Bind each job leaf to an on-chain escrow receipt (removes the self-report gap).
3. Implement `TxAssembler` (runtime-compatible `midnight-js-contracts`, or `ledger-v8`).
4. Real agent-to-agent messaging in the runtime (currently direct contract calls).
5. Point the console's session at a deployed contract once 1–3 land — the
   circuit calls, the private state and the explorer's reads are already in the
   right shape.
