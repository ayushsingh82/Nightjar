import { describe, expect, it } from "vitest";
import { decode, encode } from "./codec";
import {
  EncryptedPrivateStateStore,
  storeKeyFromBytes,
  type StorageBackend,
} from "./private-state";
import { AgentStateManager, appendJob, emptyAgentState, localStats, type Job } from "./agent";

function memStorage(): StorageBackend {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    allKeys: () => [...m.keys()],
  };
}

const job = (fill: number, price: bigint, success: boolean): Job => ({
  client: new Uint8Array(32).fill(fill),
  price,
  success,
});

describe("codec", () => {
  it("round-trips bigint and Uint8Array inside a job ledger", () => {
    const state = {
      callerSecret: new Uint8Array(32).fill(9),
      ledgerSalt: new Uint8Array(32).fill(3),
      jobLedger: [job(1, 100n, true), job(2, 250n, false)],
    };
    const back = decode<typeof state>(encode(state));
    expect(back.jobLedger[0].price).toBe(100n);
    expect(back.jobLedger[1].success).toBe(false);
    expect(back.callerSecret).toBeInstanceOf(Uint8Array);
    expect([...back.ledgerSalt]).toEqual(Array(32).fill(3));
  });
});

describe("EncryptedPrivateStateStore", () => {
  it("encrypts the job ledger and round-trips it", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(1));
    const store = new EncryptedPrivateStateStore(key, { address: "mn_addr_seller", storage });

    const state = emptyAgentState(new Uint8Array(32).fill(7), new Uint8Array(32).fill(8));
    const withJobs = appendJob(appendJob(state, job(1, 500n, true)), job(2, 300n, true));
    await store.set("agentmkt.seller", withJobs);

    const raw = storage.allKeys().map((k) => storage.getItem(k)!).join();
    expect(raw).not.toContain("jobLedger");
    expect(raw).not.toContain("500");

    const back = await store.get<typeof withJobs>("agentmkt.seller");
    expect(back?.jobLedger).toHaveLength(2);
    expect(back?.jobLedger[0].price).toBe(500n);
  });

  it("rejects a wrong key", async () => {
    const storage = memStorage();
    const good = await storeKeyFromBytes(new Uint8Array(32).fill(1));
    const bad = await storeKeyFromBytes(new Uint8Array(32).fill(2));
    await new EncryptedPrivateStateStore(good, { address: "a", storage }).set("x", { n: 1n });
    await expect(
      new EncryptedPrivateStateStore(bad, { address: "a", storage }).get("x"),
    ).rejects.toThrow(/could not be decrypted/);
  });
});

describe("AgentStateManager (two personas)", () => {
  it("keeps buyer and seller ledgers separate under one wallet", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(5));
    const seller = AgentStateManager.withKey(key, "mn_addr_1", "seller", storage);
    const buyer = AgentStateManager.withKey(key, "mn_addr_1", "buyer", storage);

    await seller.recordJob(job(10, 4000n, true));
    await seller.recordJob(job(11, 6000n, true));
    await buyer.ensure();

    const s = await seller.load();
    const b = await buyer.load();
    expect(s?.jobLedger).toHaveLength(2);
    expect(b?.jobLedger).toHaveLength(0);
    // distinct identities
    expect([...(s!.callerSecret)]).not.toEqual([...(b!.callerSecret)]);
  });

  it("ensure() is idempotent; rotateSalt keeps the ledger", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(6));
    const mgr = AgentStateManager.withKey(key, "mn_addr_2", "seller", storage);
    const first = await mgr.ensure();
    const second = await mgr.ensure();
    expect([...second.callerSecret]).toEqual([...first.callerSecret]);

    await mgr.recordJob(job(1, 1n, true));
    const beforeSalt = (await mgr.load())!.ledgerSalt;
    const rotated = await mgr.rotateSalt();
    expect([...rotated.ledgerSalt]).not.toEqual([...beforeSalt]);
    expect(rotated.jobLedger).toHaveLength(1);
  });

  it("localStats previews what the ledger could prove", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(4));
    const mgr = AgentStateManager.withKey(key, "mn_addr_3", "seller", storage);
    await mgr.recordJob(job(1, 4000n, true));
    await mgr.recordJob(job(2, 3500n, true));
    await mgr.recordJob(job(3, 900n, false));
    const stats = localStats((await mgr.load())!);
    expect(stats).toEqual({ totalJobs: 3, successfulJobs: 2, volume: 7500n });
  });

  it("enforces LEDGER_CAP", () => {
    let state = emptyAgentState(new Uint8Array(32), new Uint8Array(32));
    for (let i = 0; i < 64; i++) state = appendJob(state, job((i % 200) + 1, 1n, true));
    expect(() => appendJob(state, job(1, 1n, true))).toThrow(/full/);
  });
});
