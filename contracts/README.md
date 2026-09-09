# agent-commerce — contracts

Core Compact contract for private agent-to-agent commerce + reputation.

```
src/
  marketplace.compact   core contract
  witnesses.ts          private state shape + witness implementations
  reputation.ts         TS reference for the aggregation (parity target)
test/
  simulator.ts               in-memory contract runner (no proof server)
  marketplace.test.ts        behavioural suite (20 cases)
  reputation.parity.test.ts  reputation.ts <-> proveReputation parity (21 cases)
```

## Build + test

Compiles under the Midnight Compact toolchain (`compact 0.5.2`, compiler
0.34.0). `src/managed/` is generated and git-ignored.

```bash
# one-time: install the compiler
curl --proto '=https' --tlsv1.2 -sSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source $HOME/.local/bin/env

npm install
npm run compact:fast   # compile logic only (--skip-zk) -> src/managed/marketplace
npm run check          # tsc --noEmit && vitest run  (41 tests)
```

`npm run compact` (full ZK key generation) is **heavy** for `proveReputation` —
a 64-slot double `fold` — and is not part of the test loop. See the LEDGER_CAP
note in `../pending.md`.

Target: Compact **>= 0.23**, compact-runtime 0.19.0, Node >= 22.

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

## Confirmed against the compiler

- `fold` with a tuple accumulator `[Uint<64>, Uint<64>, Uint<64>]` and `acc[i]`
  indexing — compiles, and the parity suite matches `reputation.ts` for every
  persona × threshold.
- Hash-chain `ledgerHash` fold + `persistentCommit` round-trips
  (`updateReputation` → `proveReputation`); soundness tests confirm a fabricated
  or wrong-salt ledger is rejected.

## Still open

- **Full ZK key generation** for `proveReputation` is slow (`LEDGER_CAP = 64` →
  64 in-circuit hash-chain steps, twice). Tests run on `--skip-zk` output.
  Decide LEDGER_CAP vs. a `MerkleTree`-path model (REVIEW C4) before wiring a
  proof server — see `../pending.md`.
- `updateReputation` trusts the witness ledger (self-reported). Production binds
  each `jobLeaf` to an on-chain escrow receipt inserted by `release` — noted
  inline in `release()`.

See `../pending.md` → Core contract.
