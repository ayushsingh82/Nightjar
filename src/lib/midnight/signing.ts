// Nightjar — message signing via the DApp Connector API.
//
// Used to derive the encrypted-store key (see private-state.ts) and to sign
// agent-to-agent challenges (e.g. a buyer proving it controls the address that
// funded an escrow). The connector prepends its own prefix, so a signature here
// is not a valid transaction signature — it only proves control of the
// unshielded key.

import type { ConnectedAPI, Signature } from "@midnight-ntwrk/dapp-connector-api";

export type SignedMessage = {
  message: string;
  signature: string;
  verifyingKey: string;
};

/** Sign a UTF-8 string with the wallet's unshielded key. */
export async function signMessage(api: ConnectedAPI, message: string): Promise<SignedMessage> {
  const sig: Signature = await api.signData(message, { encoding: "text", keyType: "unshielded" });
  return { message, signature: sig.signature, verifyingKey: sig.verifyingKey };
}

/** A nonce-bearing challenge for one agent to prove control of an address. */
export function agentChallenge(purpose: string, subject: string): { message: string; nonce: string } {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const nonceHex = Array.from(nonce, (b) => b.toString(16).padStart(2, "0")).join("");
  return { message: `nightjar:${purpose}:${subject}:${nonceHex}`, nonce: nonceHex };
}

export async function signChallenge(
  api: ConnectedAPI,
  purpose: string,
  subject: string,
): Promise<SignedMessage & { nonce: string }> {
  const { message, nonce } = agentChallenge(purpose, subject);
  return { ...(await signMessage(api, message)), nonce };
}
