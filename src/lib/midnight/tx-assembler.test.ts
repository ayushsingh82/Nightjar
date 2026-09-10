// Nightjar — transaction assembly, against the real compiled contract.
//
// No network and no proof server, but nothing about the assembly is faked: the
// contract state comes from a real deploy assembly (so its operations carry the
// real verifier keys), the circuit runs for real, and the transcript is
// partitioned and packed into a real unproven ledger transaction. What is
// stubbed is only the boundary — the indexer read and the wallet's keys.
//
// The prover is never driven here: a real proof is the one thing that cannot be
// faked, and the ledger's WASM traps on both invalid proof bytes and a rejected
// promise rather than surfacing either. `prove-live.test.ts` does that part
// against a real proof server.
//
// Skipped when `contracts/src/managed-zk` is absent; assembly needs verifier
// keys, and a machine without them should say so rather than fail obscurely.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./config";
import { emptyPrivateState } from "../../../contracts/src/witnesses";

const MANAGED = join(process.cwd(), "contracts/src/managed-zk/marketplace");
const KEYED = existsSync(join(MANAGED, "keys/proveReputation.verifier"));

const config = { ...defaultConfig("undeployed"), zkAssetBasePath: "/zk/marketplace" };

/** Serves the compiler's real output, and the indexer, over the fetch seam. */
function diskFetch(contractStateHex?: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (init?.method === "POST") {
      const body = contractStateHex
        ? { data: { contractAction: { state: contractStateHex, transaction: { block: { height: 11 } } } } }
        : { data: { contractAction: null } };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    const match = /\/zk\/marketplace\/(keys|zkir)\/(.+)$/.exec(url);
    if (match) {
      const file = join(MANAGED, match[1], match[2]);
      if (!existsSync(file)) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(readFileSync(file)), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

/** Only what the assembler actually touches on the wallet. */
function fakeWallet() {
  const prove = vi.fn(async () => new Uint8Array());
  return {
    api: {
      getShieldedAddresses: vi.fn(async () => ({
        shieldedAddress: "mn_shield-addr_test",
        shieldedCoinPublicKey: "00".repeat(32),
        shieldedEncryptionPublicKey: "01".repeat(32),
      })),
      getProvingProvider: vi.fn(async () => ({ prove, check: vi.fn(async () => []) })),
    },
    prove,
  };
}

const ARBITER = new Uint8Array(32).fill(1);
const AGENT = new Uint8Array(32).fill(2);
const SALT = new Uint8Array(32).fill(9);
const privateState = emptyPrivateState(AGENT, SALT);

const suite = KEYED ? describe : describe.skip;

suite("MidnightTxAssembler", () => {
  /**
   * Deploy assembly, and the state it produces — the one a call needs, because
   * its operations carry the deployed verifier keys that each call's key
   * location hashes.
   */
  async function deployed() {
    const { MidnightTxAssembler } = await import("./tx-assembler");
    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch() as unknown as typeof fetch,
    });
    const deploy = await assembler.deploy(ARBITER, emptyPrivateState(ARBITER, SALT));
    return { assembler, deploy, wallet };
  }

  it("assembles a deployment carrying an address and a maintenance key", async () => {
    const { deploy } = await deployed();

    expect(deploy.contractAddress).toMatch(/^[0-9a-f]+$/i);
    expect(deploy.contractAddress.length).toBeGreaterThan(32);
    expect(deploy.signingKey).toBeTruthy();
    expect(deploy.circuitId).toBe("constructor");
  }, 180_000);

  it("a deployment needs no circuit proof, and serializes without one", async () => {
    const { deploy, wallet } = await deployed();
    const provider = await wallet.api.getProvingProvider();

    const serialized = await deploy.prove(provider as never);
    expect(serialized).toMatch(/^[0-9a-f]+$/);
    expect(serialized.length).toBeGreaterThan(64);
    // A deploy installs verifier keys; it invokes no circuit, so there is
    // nothing for the prover to do.
    expect(wallet.prove).not.toHaveBeenCalled();
  }, 180_000);

  it("assembles a real registerAgent call against the deployed state", async () => {
    const { MidnightTxAssembler, serializeContractStateHex } = await import("./tx-assembler");
    const { deploy } = await deployed();

    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch(
        serializeContractStateHex(deploy.initialContractState),
      ) as unknown as typeof fetch,
    });

    const call = await assembler.call(deploy.contractAddress, "registerAgent", [], privateState);

    expect(call.circuitId).toBe("registerAgent");
    expect(call.contractAddress).toBe(deploy.contractAddress);

    // A real, well-formed unproven ledger transaction — the transcript has been
    // partitioned and packed into a contract call prototype.
    const unproven = call.serializeUnproven();
    expect(unproven).toMatch(/^[0-9a-f]+$/);
    expect(unproven.length).toBeGreaterThan(256);
  }, 180_000);

  it("chains a second call against the state the first would leave", async () => {
    const { MidnightTxAssembler, serializeContractStateHex } = await import("./tx-assembler");
    const { deploy } = await deployed();

    const wallet = fakeWallet();
    const first = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch(
        serializeContractStateHex(deploy.initialContractState),
      ) as unknown as typeof fetch,
    });
    const register = await first.call(deploy.contractAddress, "registerAgent", [], privateState);

    // Feed the produced state back as the indexer would, and stake a bond on it.
    const second = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch(
        serializeContractStateHex(register.nextContractState),
      ) as unknown as typeof fetch,
    });
    const stake = await second.call(deploy.contractAddress, "stakeBond", [5000n], privateState);

    expect(stake.circuitId).toBe("stakeBond");
    expect(stake.serializeUnproven().length).toBeGreaterThan(256);
  }, 180_000);

  it("says so when the contract is not deployed", async () => {
    const { MidnightTxAssembler, ContractNotDeployedError } = await import("./tx-assembler");
    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch() as unknown as typeof fetch,
    });

    await expect(
      assembler.call("00".repeat(32), "registerAgent", [], privateState),
    ).rejects.toThrow(ContractNotDeployedError);
  }, 180_000);
});

// The wallet's prover is handed a *contract key location*, not a circuit name.
// Left unparsed it would be fetched verbatim and 404 — which would only show up
// against a live wallet, minutes into a proof. These pin it down here instead.
describe("FetchKeyMaterialProvider key locations", () => {
  const BASE = "/zk/marketplace";

  function recordingFetch() {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    return { urls, fetchImpl: fetchImpl as unknown as typeof fetch };
  }

  it("resolves a bare circuit id", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const { urls, fetchImpl } = recordingFetch();
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl);

    await p.getProverKey("proveReputation");
    await p.getVerifierKey("proveReputation");
    expect(urls).toEqual([
      `${BASE}/keys/proveReputation.prover`,
      `${BASE}/keys/proveReputation.verifier`,
    ]);
  });

  it("resolves an encoded contract key location to the same files", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const { encodeContractKeyLocation } = await import("@midnight-ntwrk/midnight-js-types");
    const { urls, fetchImpl } = recordingFetch();
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl);

    const location = encodeContractKeyLocation({
      contractAddress: "ab".repeat(32),
      circuitId: "proveReputation",
      verifierKeyHash: "cd".repeat(32), // a 32-byte SHA-256 digest
    });
    expect(location).not.toBe("proveReputation");

    await p.getProverKey(location);
    expect(urls).toEqual([`${BASE}/keys/proveReputation.prover`]);
  });

  it("prefers the binary zkir and falls back to the text one", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      urls.push(url);
      return url.endsWith(".bzkir")
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array([9]), { status: 200 });
    });
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl as unknown as typeof fetch);

    await p.getZKIR("release");
    expect(urls).toEqual([`${BASE}/zkir/release.bzkir`, `${BASE}/zkir/release.zkir`]);
  });

  it("reports a missing artifact with its URL", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl as unknown as typeof fetch);
    await expect(p.getProverKey("release")).rejects.toThrow(
      /ZK asset not found.*release\.prover.*404/,
    );
  });
});
