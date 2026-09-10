// Nightjar — app-side view of the marketplace contract: the private
// state each agent holds locally (its job ledger), plus a typed wrapper over
// the encrypted store.
//
// The demo runs two personas from one browser — a buyer agent and a seller
// agent — so state is scoped by (wallet address, persona). The shape MUST
// match `contracts/src/witnesses.ts` (`AgentPrivateState`).

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { EncryptedPrivateStateStore, deriveStoreKey, type StorageBackend } from "./private-state";

export const LEDGER_CAP = 64; // must match LEDGER_CAP in marketplace.compact

export type Persona = "buyer" | "seller";

export type Job = {
  client: Uint8Array; // 32 bytes; all-zero => empty slot
  price: bigint;
  success: boolean;
};

/** Mirror of `AgentPrivateState` in contracts/src/witnesses.ts. */
export type AgentPrivateState = {
  callerSecret: Uint8Array; // 32 bytes; agentId = hash(domain, secret)
  jobLedger: Job[]; // private history, at most LEDGER_CAP entries
  ledgerSalt: Uint8Array; // 32 bytes, binds the reputation commitment
};

export function emptyAgentState(callerSecret: Uint8Array, ledgerSalt: Uint8Array): AgentPrivateState {
  return { callerSecret, jobLedger: [], ledgerSalt };
}

export function appendJob(state: AgentPrivateState, job: Job): AgentPrivateState {
  if (state.jobLedger.length >= LEDGER_CAP) {
    throw new Error(`job ledger is full (LEDGER_CAP ${LEDGER_CAP})`);
  }
  return { ...state, jobLedger: [...state.jobLedger, job] };
}

export type ReputationStats = { totalJobs: number; successfulJobs: number; volume: bigint };

/** Local preview of what the ledger could prove — never sent anywhere. */
export function localStats(state: AgentPrivateState): ReputationStats {
  let total = 0;
  let ok = 0;
  let volume = 0n;
  for (const j of state.jobLedger) {
    if (j.client.every((b) => b === 0)) continue;
    total += 1;
    if (j.success) {
      ok += 1;
      volume += j.price;
    }
  }
  return { totalJobs: total, successfulJobs: ok, volume };
}

/**
 * Typed access to one persona's encrypted job ledger, scoped to a wallet
 * address. Construct via `AgentStateManager.forWallet(api, address, persona)`.
 */
export class AgentStateManager {
  private constructor(
    private readonly store: EncryptedPrivateStateStore,
    private readonly id: string,
  ) {}

  static async forWallet(
    api: ConnectedAPI,
    address: string,
    persona: Persona,
    storage?: StorageBackend,
  ): Promise<AgentStateManager> {
    const key = await deriveStoreKey(api);
    return new AgentStateManager(
      new EncryptedPrivateStateStore(key, { address, storage }),
      `nightjar.${persona}`,
    );
  }

  static withKey(key: CryptoKey, address: string, persona: Persona, storage?: StorageBackend): AgentStateManager {
    return new AgentStateManager(
      new EncryptedPrivateStateStore(key, { address, storage }),
      `nightjar.${persona}`,
    );
  }

  async load(): Promise<AgentPrivateState | null> {
    return this.store.get<AgentPrivateState>(this.id);
  }

  async save(state: AgentPrivateState): Promise<void> {
    await this.store.set(this.id, state);
  }

  /** Create fresh identity + salt if none exists yet. */
  async ensure(): Promise<AgentPrivateState> {
    const existing = await this.load();
    if (existing) return existing;
    const created = emptyAgentState(
      crypto.getRandomValues(new Uint8Array(32)),
      crypto.getRandomValues(new Uint8Array(32)),
    );
    await this.save(created);
    return created;
  }

  async recordJob(job: Job): Promise<AgentPrivateState> {
    const next = appendJob(await this.ensure(), job);
    await this.save(next);
    return next;
  }

  /** Rotate the salt (used when re-committing after a ledger change). */
  async rotateSalt(): Promise<AgentPrivateState> {
    const state = await this.ensure();
    const next = { ...state, ledgerSalt: crypto.getRandomValues(new Uint8Array(32)) };
    await this.save(next);
    return next;
  }

  async reset(): Promise<void> {
    await this.store.remove(this.id);
  }
}
