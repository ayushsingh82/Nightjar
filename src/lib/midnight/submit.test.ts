import { describe, expect, it, vi } from "vitest";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { defaultConfig } from "./config";
import { readFeeState, assertCanPayFees, ESTIMATED_CALL_FEE } from "./fees";
import { signMessage, agentChallenge } from "./signing";
import { submitContractCall, type AssembledCall } from "./submit";
import { MarketClient, type TxAssembler } from "./market-client";

function fakeApi(over: Partial<Record<keyof ConnectedAPI, unknown>> = {}): ConnectedAPI {
  const base = {
    getDustBalance: vi.fn(async () => ({ balance: 5_000_000n, cap: 10_000_000n })),
    signData: vi.fn(async (data: string) => ({ data, signature: `sig(${data})`, verifyingKey: "vk" })),
    getProvingProvider: vi.fn(async () => ({
      prove: vi.fn(async (bytes: Uint8Array) => new TextEncoder().encode(`proven:${new TextDecoder().decode(bytes)}`)),
      check: vi.fn(async () => []),
    })),
    balanceUnsealedTransaction: vi.fn(async (tx: string) => ({ tx: `balanced:${tx}` })),
    submitTransaction: vi.fn(async () => undefined),
  };
  return { ...base, ...over } as unknown as ConnectedAPI;
}

const config = defaultConfig("preprod");

/** Stands in for an assembled call: records the prover it was handed. */
function fakeCall(circuitId = "openEscrow", contractAddress = "0xcontract"): AssembledCall {
  return {
    circuitId,
    contractAddress,
    prove: async (provider) => {
      const proof = await provider.prove(new TextEncoder().encode("TX"), circuitId);
      return new TextDecoder().decode(proof);
    },
    serializeUnproven: () => "unproven:TX",
  };
}

describe("fees", () => {
  it("reads balance / cap / headroom", async () => {
    const s = await readFeeState(fakeApi());
    expect(s.balance).toBe(5_000_000n);
    expect(s.headroom).toBeCloseTo(0.5);
    expect(s.sufficient).toBe(true);
  });

  it("assertCanPayFees throws below the estimate", () => {
    expect(() =>
      assertCanPayFees({ balance: ESTIMATED_CALL_FEE - 1n, cap: 1n, headroom: 0, sufficient: false }),
    ).toThrow(/not enough DUST/);
  });
});

describe("signing", () => {
  it("signs a UTF-8 message", async () => {
    const s = await signMessage(fakeApi(), "hello");
    expect(s).toEqual({ message: "hello", signature: "sig(hello)", verifyingKey: "vk" });
  });

  it("agentChallenge embeds purpose, subject, and a nonce", () => {
    const c = agentChallenge("escrow-funder", "esc-7");
    expect(c.message).toContain("escrow-funder");
    expect(c.message).toContain("esc-7");
    expect(c.message).toContain(c.nonce);
  });
});

describe("submitContractCall", () => {
  const call = fakeCall();

  it("runs prove → balance → submit → confirm in order", async () => {
    const api = fakeApi();
    const phases: string[] = [];
    const assemble = vi.fn(async () => call);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: { contractAction: { state: "0xdead", transaction: { block: { height: 42 } } } } })),
    ));

    const res = await submitContractCall(api, config, assemble, (p) => phases.push(p.phase));

    expect(phases).toEqual(["building", "proving", "balancing", "submitting", "confirming", "done"]);
    expect(api.balanceUnsealedTransaction).toHaveBeenCalledWith("proven:TX", { payFees: true });
    expect(api.submitTransaction).toHaveBeenCalledWith("balanced:proven:TX");
    expect(res).toEqual({ txSubmitted: true, blockHeight: 42 });
    vi.unstubAllGlobals();
  });

  it("aborts before proving when DUST is too low", async () => {
    const api = fakeApi({ getDustBalance: vi.fn(async () => ({ balance: 1n, cap: 10n })) });
    const assemble = vi.fn(async () => call);
    await expect(submitContractCall(api, config, assemble, () => {})).rejects.toThrow(/not enough DUST/);
    expect(assemble).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("MarketClient orchestration", () => {
  it("threads persona ledger + assembler + submit for openEscrow", async () => {
    const api = fakeApi();
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: { contractAction: { state: "0x", transaction: { block: { height: 7 } } } } })),
    ));

    const seen: Array<{ circuit: string; args: unknown[]; persona: string }> = [];
    const assembler: TxAssembler = {
      deploy: vi.fn(async () => ({ ...fakeCall("constructor", "0xnew"), contractAddress: "0xnew", signingKey: "sk" })),
      call: vi.fn(async (_addr, circuit, args) => {
        seen.push({ circuit, args: [...args], persona: "buyer" });
        return fakeCall(circuit, "0xnew");
      }),
    };

    const buyer = await MarketClient.create({
      api,
      address: "mn_addr_buyer",
      persona: "buyer",
      config,
      assembler,
      contractAddress: "0xnew",
    });

    const sellerId = new Uint8Array(32).fill(9);
    const escrowId = new Uint8Array(32).fill(1);
    await buyer.openEscrow(escrowId, sellerId, 1000n);

    expect(seen).toHaveLength(1);
    expect(seen[0].circuit).toBe("openEscrow");
    expect(seen[0].args[2]).toBe(1000n);
    expect(buyer.persona).toBe("buyer");
    vi.unstubAllGlobals();
  });

  it("buyer and seller clients keep separate identities under one wallet", async () => {
    const api = fakeApi();
    const assembler = { deploy: vi.fn(), call: vi.fn() } as unknown as TxAssembler;
    const buyer = await MarketClient.create({ api, address: "w", persona: "buyer", config, assembler });
    const seller = await MarketClient.create({ api, address: "w", persona: "seller", config, assembler });
    const b = await buyer.ensureIdentity();
    const s = await seller.ensureIdentity();
    expect([...b.callerSecret]).not.toEqual([...s.callerSecret]);
  });

  it("refuses circuit calls with no contract address", async () => {
    const assembler = { deploy: vi.fn(), call: vi.fn() } as unknown as TxAssembler;
    const client = await MarketClient.create({ api: fakeApi(), address: "a", persona: "seller", config, assembler });
    await expect(client.updateReputation()).rejects.toThrow(/no contract/);
  });
});
