// agent-commerce — the proving step, for real.
//
// Everything else in the suite stops short of a proof: the wallet is the only
// prover a user has, there is no headless wallet for this stack, and the
// ledger's WASM traps rather than throwing when handed invalid proof bytes, so
// a fake prover cannot stand in for a real one.
//
// This closes that gap by assembling real transactions and proving them against
// a running `midnight-proof-server`:
//
//   npm run proof-server:up
//   npm run test:prove
//   npm run proof-server:down
//
// Excluded from `npm test`, so the default suite stays fast and needs no Docker.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { proofServerProvingProvider, proofServerVersion } from "./proof-server-provider";
import { HttpZKConfigProvider } from "./zk-config";
import { emptyPrivateState } from "../../../contracts/src/witnesses";

const PROOF_SERVER = process.env.AGENTMKT_PROOF_SERVER ?? "http://127.0.0.1:6300";
const MANAGED = join(process.cwd(), "contracts/src/managed-zk/marketplace");
const KEYED = existsSync(join(MANAGED, "keys/proveReputation.prover"));

const config = { ...defaultConfig("undeployed"), zkAssetBasePath: "/zk/marketplace" };

function diskFetch(contractStateHex?: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.startsWith(PROOF_SERVER)) return fetch(input as RequestInfo, init);

    if (init?.method === "POST" && url.includes("graphql")) {
      const body = contractStateHex
        ? { data: { contractAction: { state: contractStateHex, transaction: { block: { height: 1 } } } } }
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
  }) as typeof fetch;
}

const fakeApi = {
  getShieldedAddresses: async () => ({
    shieldedAddress: "mn_shield-addr_test",
    shieldedCoinPublicKey: "00".repeat(32),
    shieldedEncryptionPublicKey: "01".repeat(32),
  }),
} as never;

const ARBITER = new Uint8Array(32).fill(1);
const AGENT = new Uint8Array(32).fill(2);
const SALT = new Uint8Array(32).fill(9);

let serverUp = false;
let serverVersion: string | null = null;

beforeAll(async () => {
  serverVersion = await proofServerVersion(PROOF_SERVER);
  serverUp = serverVersion !== null;
  if (!serverUp) {
    console.warn(
      `\n  [prove-live] no proof server at ${PROOF_SERVER} — skipping. Start one with:\n` +
        "    npm run proof-server:up\n",
    );
  }
});

const suite = KEYED ? describe : describe.skip;

suite("proving against a real proof server", () => {
  it("reports a version", () => {
    if (!serverUp) return;
    expect(serverVersion).toBeTruthy();
  });

  /**
   * `proveReputation` is the circuit the whole product rests on: it opens the
   * private aggregate against the on-chain commitment and discloses one boolean
   * about it. Redesigning it from a 64-slot fold to an incremental aggregate
   * took its prover key from 291MB to 9.5MB — this is where that shows up as a
   * proving time a demo can actually carry.
   */
  it("proves registerAgent and proveReputation end to end", async () => {
    if (!serverUp) return;

    const { MidnightTxAssembler, serializeContractStateHex } = await import("./tx-assembler");

    const deployAssembler = await MidnightTxAssembler.create({
      api: fakeApi,
      config,
      fetchImpl: diskFetch(),
    });
    const deploy = await deployAssembler.deploy(ARBITER, emptyPrivateState(ARBITER, SALT));

    const ps = emptyPrivateState(AGENT, SALT);
    const provider = proofServerProvingProvider({
      url: PROOF_SERVER,
      keyMaterial: new HttpZKConfigProvider(config.zkAssetBasePath, diskFetch()),
    });

    // registerAgent: commits the zero aggregate.
    const registerAssembler = await MidnightTxAssembler.create({
      api: fakeApi,
      config,
      fetchImpl: diskFetch(serializeContractStateHex(deploy.initialContractState)),
    });
    const register = await registerAssembler.call(
      deploy.contractAddress,
      "registerAgent",
      [],
      ps,
    );

    let started = Date.now();
    const provenRegister = await register.prove(provider);
    const registerSeconds = ((Date.now() - started) / 1000).toFixed(1);
    expect(provenRegister).toMatch(/^[0-9a-f]+$/);

    // proveReputation against the commitment registerAgent just published.
    const proveAssembler = await MidnightTxAssembler.create({
      api: fakeApi,
      config,
      fetchImpl: diskFetch(serializeContractStateHex(register.nextContractState)),
    });
    const badge = await proveAssembler.call(
      deploy.contractAddress,
      "proveReputation",
      [0n, 0n, 0n], // thresholds a zero aggregate clears
      ps,
    );

    started = Date.now();
    const provenBadge = await badge.prove(provider);
    const badgeSeconds = ((Date.now() - started) / 1000).toFixed(1);

    expect(provenBadge).toMatch(/^[0-9a-f]+$/);
    expect(provenBadge.length).toBeGreaterThan(badge.serializeUnproven().length);
    console.log(
      `\n  [prove-live] registerAgent ${registerSeconds}s · ` +
        `proveReputation ${badgeSeconds}s — ` +
        `${(provenBadge.length / 2 / 1024).toFixed(1)}KB proven transaction\n`,
    );
  }, 1_800_000);
});
