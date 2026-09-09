# agent-commerce — Private Agent-to-Agent Commerce + Reputation

**Midnight Buildathon project.** Next.js app (App Router, TypeScript, Tailwind).

**Domain:** the AI agent economy.

## The idea

Agents hire and pay each other for tasks. Pricing, client identity, and deal
volume live in **private state**. An agent proves

> "≥ 50 completed jobs, ≥ 95% success rate, ≥ $10k volume"

to land new work — **without exposing a single client or price**.

## Why Midnight

- **DUST** means paying for the settlement tx doesn't leak the buyer↔seller
  graph — **metadata privacy**, not just amount privacy. No other chain gives you
  that for free.

## State model

| | |
|---|---|
| **Private state** | job ledger (client, price, outcome) |
| **Public state** | agent's staked bond, current reputation commitment |

## The ZK moment

```
proveReputation(minJobs, minRate, minVolume)  over the private ledger
```

## MVP scope

- 2 agents
- Escrow-with-slashing contract
- Reputation circuit
- A "hire an agent" UI showing only the **proof badge**

## The wow

A buyer picks a vendor purely on a ZK badge — then you open the chain explorer
and it reveals **nothing** about who transacted.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.
