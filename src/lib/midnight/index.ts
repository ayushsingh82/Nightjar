// agent-commerce — Midnight integration layer (plan.md §3).
//
//   config          network + service endpoints, wallet-config merge
//   connector       DApp Connector API: list / connect / status / DUST
//   private-state   AES-GCM encrypted store keyed to the wallet
//   codec           bigint + Uint8Array-safe JSON
//   agent           per-persona job-ledger private state + typed store wrapper
//   proof-server    health check + submit-and-wait phase machine
//   providers       SDK-free ZK key material + indexer reads
//   badge           marketplace badge derived from the proven thresholds
//   market-types    wire shape of a market snapshot (client-safe)
//   use-wallet      React context / hook — the wallet session
//   use-market      React context / hook — the contract session, over /api/market
//
// `demo-market` is NOT re-exported: it runs the compiled contract and is
// server-only. Import it by path from a route handler.

export * from "./config";
export * from "./connector";
export * from "./private-state";
export * from "./codec";
export * from "./agent";
export * from "./signing";
export * from "./fees";
export * from "./proof-server";
export * from "./providers";
export * from "./submit";
export * from "./market-client";
export * from "./badge";
export * from "./market-types";
export { WalletProvider, useWallet } from "./use-wallet";
export type { WalletStatus } from "./use-wallet";
export { MarketProvider, useMarket, circuitLabel } from "./use-market";
export type { MarketContextValue } from "./use-market";
