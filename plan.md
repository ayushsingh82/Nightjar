# agent-commerce — Build Plan

Private agent-to-agent commerce + reputation on Midnight. Milestones ordered so
each layer unblocks the next.

---

## 1. Core Contract (Compact)

### Escrow with slashing

- **Ledger (public) state**
  - `bonds: Map<AgentId, Uint>` — staked collateral per agent
  - `reputationCommitments: Map<AgentId, Bytes>` — commitment to the private ledger
  - `escrows: Map<EscrowId, { buyer, seller, amount, state }>` — active jobs
    (state: `Funded | Delivered | Released | Disputed | Slashed`)
- **Witness (private) inputs**
  - job ledger entries `{ client, price, outcome, timestamp }`
  - agent identity secret
  - commitment openings
- **Circuits**
  - `openEscrow(seller, amount)` — buyer funds; DUST fee should not leak the pair
  - `deliver(escrowId)` / `release(escrowId)` — happy path
  - `dispute(escrowId)` + `resolve(...)` — slashes the bond on proven failure
  - `updateReputation(newLedger)` — recompute + rotate `reputationCommitments[agent]`
    from private ledger; assert new ledger is old ledger + validated appended entry
  - `proveReputation(minJobs, minRate, minVolume) -> bool` — over private ledger,
    checks the commitment matches, discloses only the boolean
- **Tests**: escrow lifecycle, slashing math, reputation monotonicity, proof
  soundness (can't claim stats the ledger doesn't support)

## 2. Reputation Circuit

- Private ledger = ordered list of `{ client, price, outcome }`
- `proveReputation`:
  - `count(outcome == success) >= minJobs`
  - `successes / total >= minRate` (fixed-point, no division leak)
  - `sum(price where success) >= minVolume`
  - Merkle/commitment check that this ledger is the one committed on-chain
- Output: single bool + the thresholds used; **no per-job data leaves the circuit**
- TS reference implementation with parity tests

## 3. Wallet Integration

- Midnight wallet connector (Lace / Midnight-enabled)
- Two personas need wallets: buyer agent + seller agent
- Local **private state store**: encrypted job ledger keyed to agent identity
- Proof server config + health check; submit-and-wait UX for `proveReputation`
- DUST fee handling — and a demo panel showing the settlement tx does **not**
  reveal the buyer↔seller edge

## 4. Agent Runtime (mock)

- Minimal agent harness: each agent has an identity, a wallet, a job ledger
- Scripted job lifecycle: buyer posts task → seller accepts → escrow funded →
  delivered → released → both ledgers updated
- Seed script to give the "seller" agent a history that satisfies
  `≥50 jobs, ≥95%, ≥$10k` for the demo
- Later: real task payloads / actual agent-to-agent messaging

## 5. UI (Next.js, App Router)

- **Landing** — the pitch, connect wallet
- **Marketplace / "hire an agent"**
  - list of available agents showing **only a ZK reputation badge** (e.g. "Verified:
    50+ jobs · 95%+ · $10k+") — no client list, no prices, no history
  - "hire" → open + fund escrow
- **Seller dashboard**
  - private job ledger (visible locally only)
  - current on-chain reputation commitment + bond
  - "generate reputation proof" → pick thresholds → prove → publish badge
- **Buyer dashboard**
  - active escrows, deliver/release/dispute actions
- **Explorer panel** (demo aid): "what the chain sees" (bonds, commitments, an
  opaque settlement tx) vs "what's actually private" (the whole job graph)

## 6. Demo Script

- Seller agent seeded with a strong private history
- Seller publishes a ZK badge — buyer sees only the badge
- Buyer hires purely on the badge, funds escrow, seller delivers, funds release
- Open explorer: bond + commitment + a settlement tx that reveals **nothing**
  about who transacted or for how much
- Optional: a dispute → bond slashed, still no ledger leak

## 7. Stretch

- Real agent-to-agent messaging / task protocol
- Reputation decay / recency weighting
- Multiple reputation dimensions (speed, category-specific)
- Cross-marketplace portable reputation (same commitment, many pools)
- Buyer-side privacy: prove "I'm a funded buyer" without revealing identity

---

## Workstream order

1. Core contract (escrow + slashing) + tests
2. Reputation circuit + TS parity
3. Wallet + proof server integration
4. Agent runtime + seed history
5. UI: seller proof flow → marketplace badge → buyer escrow
6. Explorer panel + demo script polish
