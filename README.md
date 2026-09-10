# Nightjar

**Private agent commerce on Midnight.** Hire an agent on a proof, not on its
client list.

A nightjar is a bird you almost never see. It hunts at dusk, its plumage is the
exact colour of the bark it sits on, and the only reason you know it is there is
the call it makes. That is the product: agents you know by their proof, not by
their exposure.

AI agents hire and pay each other for work. Their track record is the asset — and
publishing it hands every client, price and outcome to a competitor. Nightjar
keeps the record on the device and puts a zero-knowledge proof about it on the
wire instead:

> "≥ 50 completed jobs, ≥ 95% success rate, ≥ $10k volume"

— one boolean, disclosed to win the job, with no client, price or job count
leaving the circuit.

---

## Problem

Reputation is how agents (and the humans behind them) decide who to trust with a
task and a payment. Today that means either a public track record — every
client, price and outcome visible to competitors — or a centralised platform
that holds the data and takes rent. Neither is acceptable infrastructure for an
open agent economy.

The naive privacy fix is worse: let each agent self-report its history into a
private witness. That is private, but forgeable — an agent can claim any history
it likes. Nightjar refuses both halves of that trade.

## Approach

| Layer | Contents |
|---|---|
| **Private (witness)** | the running aggregate `(total, successes, volume)`, the agent's identity secret, the commitment salt, the escrow nonces it is party to |
| **Public (ledger)** | staked bonds, one 32-byte reputation commitment per agent, escrow records, the arbiter key, the slashed total, the set of already-counted escrows |
| **Disclosed by a proof** | a single boolean: does the private aggregate meet the requested `(minJobs, minRate, minVolume)` |

Three design decisions carry the whole thing.

**1. The aggregate is incremental, and the contract advances it.**
`registerAgent` anchors a commitment to the zero aggregate. `updateReputation`
takes *one settled escrow*, checks it against the ledger, folds it into the
aggregate and republishes the commitment — with the escrow id recorded in
`countedEscrows` so it can never be counted twice. A client cannot move its own
reputation by editing a list; the only path from zero is through escrows the
contract itself settled.

This also made the circuit tractable. The first design folded a 64-slot job
ledger inside `proveReputation`; key generation ran 12m37s and produced 601MB.
The incremental aggregate does the same job in **25s and 43MB** — and the
`proveReputation` prover key went from **291MB to 9.5MB**. Cost scaled linearly
with the fold width (`CAP 8` → 36.8MB, `CAP 64` → 290.8MB), which is what
identified the fold rather than the machine as the problem.

**2. The seller is a commitment, not a name.**
An escrow-bound reputation is sound, but if escrow records name their seller
then anyone can count a seller's jobs straight off the ledger — privacy lost to
soundness. So `EscrowRecord` holds
`sellerCommit = persistentCommit(agentId, nonce)`. The nonce is agreed off-chain
when the job is arranged and held by both parties: the seller proves it *is* the
seller by opening the commitment in-circuit, and the ledger still cannot say who
was hired or how often. `dispute` is the single circuit that discloses the
seller — because slashing a bond has to name whose bond it is.

**3. Everything the UI claims is checked on screen.**
The explorer searches the actual serialized contract state for the actual
private values, every render, and prints what it found. A run of the demo script
settles 66 escrows; the panel reports that **0 of 66** escrow rows name a
seller, and that none of the ledger salts appear anywhere in the public record.

**Why Midnight:** DUST-based metadata privacy means the settlement transaction
does not carry the buyer↔seller edge. Escrow ids are 32 fresh CSPRNG bytes, so
two escrows by the same buyer cannot be linked through the id, and the fee
transaction is paid by the wallet as a relayer.

---

## What is real

Measured, not estimated. `npm run test:prove` assembles real transactions and
proves them against a `midnight-proof-server` container:

| | |
|---|---|
| `registerAgent` | 1.5s |
| `proveReputation` | 2.4s → 4.9KB proven transaction |
| `proveReputation` prover key | 9.5MB (of 57MB total, 40 files) |
| Full ZK key generation | ~30s for all 10 circuits |

Real: the Compact contract and its verifier keys; transaction assembly against
the compiled contract (`tx-assembler.ts`); proving against a proof server; the
DApp Connector wallet session; every circuit call the console makes, in process,
with asserts firing and public ledger state actually changing.

Not yet: submission to a live network. Assembly and proving are verified against
real components — balancing, submission and confirmation need a funded wallet in
a browser, and no headless wallet exists for this stack to automate it.

---

## Architecture

```
contracts/                      Compact contract + tests
  src/marketplace.compact         the contract (10 circuits)
  src/witnesses.ts                private-state shape + witness implementations
  src/reputation.ts               TS reference for the aggregation
  src/runtime.ts                  agent runtime — Agent, runJobs, earnHistory
  scripts/seed-seller.ts          CLI: earn a badge-clearing seller history
  test/                           in-memory simulator + behavioural & parity suites
src/
  lib/midnight/                   Midnight integration layer (see below)
  components/                     landing, console, dashboards, explorer
  app/                            /  landing   ·  /console  ·  /api/market
```

### Contract (`contracts/`)

Compact ≥ 0.23 (`compact` 0.5.2 / compiler 0.34.0), `compact-runtime` 0.19.
Circuits: `registerAgent`, `updateReputation`, `proveReputation`, `stakeBond`,
`withdrawBond`, `openEscrow`, `markDelivered`, `release`, `dispute`,
`resolveDispute`.

```bash
cd contracts
npm install
npm run compact:fast   # logic only (--skip-zk) -> src/managed/      ~0.5s
npm run compact:zk     # logic + proving keys   -> src/managed-zk/   ~30s, 57MB
npm run check          # tsc --noEmit && vitest run   (53 tests)
npm run seed:seller    # earn a badge-clearing history and prove it
```

Two output directories on purpose: the app imports the contract bindings from
`src/managed/`, which rebuilds in half a second, while the 57MB of proving keys
live in `src/managed-zk/` and only need regenerating when the circuits change.
Both are gitignored — they are reproducible from `marketplace.compact`.

Test coverage: the full escrow lifecycle and its guards; slashing math (slash by
amount, capped at bond, no-fault, arbiter-only); seller-commitment binding
(wrong nonce, wrong agent, disclosure on dispute); reputation monotonicity and
double-count rejection; proof soundness (a fabricated or wrong-salt aggregate is
rejected); TS↔circuit parity across every persona × threshold combination; and
the agent runtime, whose history is *earned* through real escrows rather than
handed over.

### Midnight integration (`src/lib/midnight/`)

| Module | Responsibility |
|---|---|
| `config` | network endpoints per `NetworkId`; merges the wallet's reported service URIs over defaults |
| `connector` | DApp Connector API — enumerate injected wallets, connect, unshielded address, status, DUST balance |
| `private-state` | `EncryptedPrivateStateStore` — AES-GCM at rest, key derived from a wallet signature |
| `codec` | JSON encoding that preserves `bigint` and `Uint8Array` |
| `agent` | per-persona private state — `AgentStateManager` scoped by `(address, buyer\|seller)` |
| `signing` | message signing + nonce-bearing agent challenges |
| `fees` | DUST fee state and a pre-flight `assertCanPayFees` check |
| `proof-server` | health check and the `building → proving → balancing → submitting → confirming` progress machine |
| `providers` | SDK-free foundation: serves compiled ZK assets to the wallet's prover, reads contract state from the indexer |
| `tx-assembler` | **real assembly** — `createUnprovenDeployTx` / `createUnprovenCallTx` against the compiled contract |
| `proof-server-provider` | a `ProvingProvider` backed by a local proof server, for testing without a wallet |
| `submit` | the `fee check → assemble → prove → balance → submit → confirm` pipeline |
| `market-client` | `MarketClient` — one method per circuit, composing persona state + assembler + submit |
| `live` | the on-chain entry point; lazily imports the ledger WASM so the demo never pays for it |
| `badge` | the marketplace badge, derived from the thresholds a proof actually used |
| `demo-market` | **server-only** — runs the compiled circuits and holds the session |
| `use-wallet` / `use-market` | React providers for the wallet session and the contract session |

Buyer and seller run from one browser with separate identities and separately
encrypted state.

### How the console executes circuits

The generated contract loads its WASM through Node `fs`, so it cannot run in a
browser bundle. The console drives the circuits **server-side**
(`demo-market.ts` behind `/api/market`) on the same `MarketSim` the tests use:
real circuit execution, real asserts, real ledger state — but unproven and not
submitted. The console says so on screen rather than implying otherwise: there
is an execution notice above every tab, and the progress component renders
`balancing` / `submitting` / `confirming` as off-path, with the reason.

---

## Getting started

```bash
cd contracts && npm install && npm run compact:fast && cd ..   # required first:
                                                              # src/managed/ is gitignored
npm install
npm run dev        # http://localhost:3000  →  /console
npm test           # 37 app tests, including the whole demo against ledger state
npm run typecheck
npm run lint
npm run build
```

To exercise proving as well:

```bash
npm --prefix contracts run compact:zk   # ~30s, 57MB of keys
npm run sync:zk                         # serve them from public/zk/marketplace
npm run proof-server:up                 # docker: midnightnetwork/proof-server
npm run test:prove
npm run proof-server:down
```

`proof-server:up` mounts a named volume at `/.cache/midnight/zk-params`. The
container runs with `--rm`, so without it every session re-downloads ~50s of
proving parameters before the server will answer `/health`; with it, that
happens once per machine and startup is about four seconds.

A Midnight wallet extension (Lace or 1AM) is required to connect the wallet
panel; everything else runs without one.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MIDNIGHT_NETWORK` | `preprod` | target network |
| `NEXT_PUBLIC_PROOF_SERVER` | `http://127.0.0.1:6300` | proof server for the health check |
| `NIGHTJAR_PROOF_SERVER` | `http://127.0.0.1:6300` | proof server for `test:prove` |

---

## Demo

`/console` opens on a 12-step script. Every step is a real circuit call, and the
runner threads contract state from one step into the next, so the escrow ids it
acts on are the opaque ids the contract actually stored:

1. Deploy — the constructor fixes the arbiter key
2. Both sellers **earn** their history through real escrows (55 jobs and 9)
3. Atlas proves `≥50 jobs, ≥95%, ≥$10k` → `true`, changing no public state
4. Nomad tries the same thresholds → `false`, and there is no way to display one
5. A buyer hires Atlas on the badge alone
6–8. Deliver → release → re-prove against the commitment the release moved
9–12. A second job goes wrong: deliver → dispute → the arbiter slashes the bond

Then open the Explorer tab. The numbers there are read back from that state, not
from the script.

---

## Roadmap

1. Submit to a live network — the one remaining gap (needs a funded wallet).
2. Agent-to-agent messaging and task payloads (currently direct contract calls).
3. An escrow asset — native token or a mock stablecoin.
4. An arbiter service, rather than an arbiter key fixed at deploy.
