// agent-commerce — private state + witness implementations for marketplace.compact
//
// Runs locally in each agent's client. The job ledger never leaves the device;
// only the commitment and ZK proofs go on-chain.

import type { Ledger, Witnesses } from "./managed/marketplace/contract/index.js";

type WitnessContext<PS> = { privateState: PS; ledger: Ledger };

export const LEDGER_CAP = 64; // must match LEDGER_CAP in marketplace.compact

export type Job = {
  client: Uint8Array; // 32 bytes; zero => empty slot
  price: bigint;
  success: boolean;
};

export type AgentPrivateState = {
  callerSecret: Uint8Array; // 32 bytes. agentId = hash(domain, secret)
  jobLedger: Job[]; // full private history, at most LEDGER_CAP entries
  ledgerSalt: Uint8Array; // 32 bytes, binds the commitment
};

const ZERO32 = new Uint8Array(32);
const EMPTY_JOB: Job = { client: ZERO32, price: 0n, success: false };

function padLedger(jobs: Job[]): Job[] {
  if (jobs.length > LEDGER_CAP) {
    throw new Error(`job ledger exceeds LEDGER_CAP (${LEDGER_CAP})`);
  }
  const out = jobs.slice();
  while (out.length < LEDGER_CAP) out.push(EMPTY_JOB);
  return out;
}

export const witnesses: Witnesses<AgentPrivateState> = {
  callerSecret: (
    ctx: WitnessContext<AgentPrivateState>,
  ): [AgentPrivateState, Uint8Array] => [ctx.privateState, ctx.privateState.callerSecret],

  jobLedger: (
    ctx: WitnessContext<AgentPrivateState>,
  ): [AgentPrivateState, Job[]] => [ctx.privateState, padLedger(ctx.privateState.jobLedger)],

  ledgerSalt: (
    ctx: WitnessContext<AgentPrivateState>,
  ): [AgentPrivateState, Uint8Array] => [ctx.privateState, ctx.privateState.ledgerSalt],
};

// Append a job locally, then call `updateReputation` to rotate the commitment.
export function appendJob(ps: AgentPrivateState, job: Job): AgentPrivateState {
  return { ...ps, jobLedger: [...ps.jobLedger, job] };
}

export function emptyPrivateState(secretKey: Uint8Array, salt: Uint8Array): AgentPrivateState {
  return { callerSecret: secretKey, jobLedger: [], ledgerSalt: salt };
}

// TODO(wallet): persist AgentPrivateState through the Midnight private state
// provider once the wallet connector lands (plan.md §3).
