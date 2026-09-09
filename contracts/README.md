# agent-commerce — contracts

Core Compact contract for private agent-to-agent commerce + reputation.

```
src/
  marketplace.compact   core contract
  witnesses.ts          private state shape + witness implementations
  reputation.ts         TS reference for the aggregation (parity target)
test/                   (todo) contract + parity tests
```

## Build

Needs the Midnight Compact toolchain — **not installed on this machine yet**, so
nothing here is compiled or tested.

```bash
curl --proto '=https' --tlsv1.2 -sSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source $HOME/.local/bin/env

compact compile src/marketplace.compact src/managed/marketplace
```

Target: Compact **>= 0.23**, compact-runtime 0.16.x, Node >= 22.

## Contract shape

- **Public ledger**: `arbiterPk` (sealed), `bonds`, `reputationCommitments`,
  `escrows`, `escrowCount`, `slashedTotal`.
- **Private witnesses**: `callerSecret`, `jobLedger` (`Vector<64, Job>`, padded),
  `ledgerSalt`.
- **Reputation**: `ledgerHash` is an order-sensitive hash chain over the 64-slot
  ledger; `reputationCommitments[agent] = persistentCommit(ledgerHash, salt)`.
  `proveReputation` re-folds the witness ledger, checks it against the
  commitment, and discloses only `okJobs && okRate && okVolume`.
- **Escrow + slashing**: `openEscrow → markDelivered → release`; `dispute` then
  `resolveDispute` (arbiter-only) refunds the buyer and cuts the seller's bond.

## Applied from ../../REVIEW.md

| Item | Done |
|---|---|
| S1 pragma 0.15 → **>= 0.23** | ✅ |
| S2 struct fields comma-separated | ✅ |
| S4 struct spread removed — every transition rebuilds `EscrowRecord` explicitly | ✅ |
| S5 explicit `as Uint<64>` on ledger arithmetic | ✅ |
| S7 aggregation via `fold` (expression-bodied), `LEDGER_CAP` const | ✅ |
| C4 `persistentHash<Vector<64,Job>>` → hash-chain `fold` over `jobLeaf` | ✅ |
| C5 overflow: `minRateBps <= 10000` asserted, counts bounded by `LEDGER_CAP` | ✅ |
| C6 `resolveDispute` gated on `deriveArbiterPk(callerSecret()) == arbiterPk` | ✅ |
| C7 counterparties visible on-contract by design — DUST hides the graph across txs; README pitch reworded | ✅ |

## Still open (need the compiler)

- `fold` with a tuple accumulator `[Uint<64>, Uint<64>, Uint<64>]` and `acc[i]`
  indexing — confirm against the runtime.
- `updateReputation` trusts the witness ledger (self-reported). Production binds
  each `jobLeaf` to an on-chain escrow receipt inserted by `release` — noted
  inline in `release()`.
- `LEDGER_CAP = 64` → 64 in-circuit hashes per reputation proof. Measure proof
  time; drop to 32 if needed (also lowers the max provable job count).
- Contract tests + `reputation.ts` ↔ circuit parity tests.

See `../pending.md` → Core contract.
