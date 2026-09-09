// agent-commerce — the in-process market session that backs the UI (plan.md §5/§6).
//
// SERVER ONLY. Deliberately not re-exported from `./index` — the generated
// contract pulls in `@midnight-ntwrk/compact-runtime`, whose WASM is loaded with
// Node `fs` (`onchain-runtime-v4`'s `node` export condition), so this module
// cannot exist in a browser bundle. It is reached through `/api/market`.
//
// WHAT IS REAL HERE
//   Every action below runs the *compiled circuit* from
//   `contracts/src/managed/marketplace` against real contract state, through the
//   owner's `MarketSim` — the same object `contracts/test/simulator.ts` and
//   `npm run seed:seller` drive. Asserts fire, `escrows`/`bonds`/
//   `reputationCommitments` are real ledger maps, and the boolean a badge
//   carries is the boolean `proveReputation` actually returned.
//
// WHAT IS NOT
//   Nothing is proven and nothing is submitted. See `EXECUTION_NOTICE` — the UI
//   renders it verbatim rather than implying a chain write happened.

import { MarketSim, job as mkJob } from "../../../contracts/test/simulator";
import {
  Agent,
  DEMO_SELLER_HISTORY,
  earnHistory,
  NEWCOMER_HISTORY,
  randomEscrowId,
  type HistorySpec,
} from "../../../contracts/src/runtime";
import type { PublishedBadge } from "./badge";
import { toHex } from "./market-types";
import type {
  AgentView,
  ChainView,
  ExecutionNotice,
  MarketAction,
  MarketEvent,
  MarketSnapshot,
  PrivateJobRow,
  EscrowStateName,
} from "./market-types";

// ---------------------------------------------------------------------------
// Honesty block — rendered by the UI, not paraphrased by it
// ---------------------------------------------------------------------------

export const EXECUTION_NOTICE: ExecutionNotice = {
  mode: "in-process compiled circuits — real execution, real ledger state, unproven",
  source: "contracts/src/managed/marketplace (compact 0.34.0, compiled --skip-zk)",
  proofGenerated: false,
  submittedOnChain: false,
  caveats: [
    "No ZK proof is generated. `proveReputation` at LEDGER_CAP 64 folds 64 slots twice; " +
      "key generation succeeds (~17.5 min, 305 MB) but every proof attempt OOM-kills the " +
      "local proof server (exit 137, needs ~16–29 GB). The disclosed boolean below is the " +
      "circuit's real return value, computed without a proof.",
    "Nothing is submitted on chain. `submit.ts` implements fee check → prove → balance → " +
      "submit → confirm, but `TxAssembler` is version-blocked: midnight-js-contracts 4.1.1 " +
      "pins compact-runtime 0.16 against this repo's 0.19.",
    "The wallet panel is a real DApp Connector session. It is not what drives this session.",
  ],
};

/** `EscrowState` in marketplace.compact, in declaration order. */
const ESCROW_STATES: EscrowStateName[] = [
  "EMPTY",
  "FUNDED",
  "DELIVERED",
  "RELEASED",
  "DISPUTED",
  "SLASHED",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`bad hex: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

type PersonaSpec = {
  key: string;
  name: string;
  role: "buyer" | "seller";
  blurb: string;
  /** Seed history applied by the `seed` action. */
  /** History this agent earns by running real escrows. Buyers have none. */
  history?: HistorySpec;
  bond: bigint;
};

/** The buyer every seeded job is bought by. */
const BUYER_KEY = "orion";

const PERSONAS: PersonaSpec[] = [
  {
    key: "orion",
    name: "Orion Ops",
    role: "buyer",
    blurb: "Buyer agent. Hires on a badge and nothing else.",
    bond: 0n,
  },
  {
    key: "atlas",
    name: "Atlas Research",
    role: "seller",
    blurb: "Seller agent with a long private track record.",
    history: DEMO_SELLER_HISTORY,
    bond: 20_000n,
  },
  {
    key: "nomad",
    name: "Nomad Labs",
    role: "seller",
    blurb: "Seller agent, newly active.",
    history: NEWCOMER_HISTORY,
    bond: 2_000n,
  },
];

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

class MarketSession {
  private sim!: MarketSim;
  private agents = new Map<string, Agent>();
  private badges = new Map<string, PublishedBadge>();
  private events: MarketEvent[] = [];
  /** agentId hex -> job index -> the escrow that produced that job. */
  private jobOrigins = new Map<string, Map<number, string>>();
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** The arbiter key is fixed at deploy; only its holder can resolve a dispute. */
  private readonly arbiterSecret = new Uint8Array(32).fill(1);

  static async create(): Promise<MarketSession> {
    const s = new MarketSession();
    await s.reset();
    return s;
  }

  // --- lifecycle -----------------------------------------------------

  private async reset(): Promise<void> {
    this.sim = await MarketSim.deploy(this.arbiterSecret);
    this.agents = new Map(PERSONAS.map((p) => [p.key, new Agent(p.name, p.role)]));
    this.badges = new Map();
    this.events = [];
    this.jobOrigins = new Map();
    this.seq = 0;
  }

  private agent(key: string): Agent {
    const a = this.agents.get(key);
    if (!a) throw new Error(`unknown agent "${key}"`);
    return a;
  }

  /** Serialize every mutation — one contract state, many concurrent fetches. */
  apply(action: MarketAction): Promise<MarketSnapshot> {
    const next = this.queue.then(
      () => this.applyNow(action),
      () => this.applyNow(action),
    );
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async applyNow(action: MarketAction): Promise<MarketSnapshot> {
    const before = action.type === "reset" ? null : await this.chainView();

    switch (action.type) {
      case "reset":
        await this.reset();
        return this.snapshot();

      case "seed":
        await this.seedAll();
        break;

      case "stakeBond":
        await this.sim.stakeBond(this.agent(action.agent).secret, BigInt(action.amount));
        break;

      case "commitLedger":
        // Kept for wire compatibility; the aggregate now advances only through
        // a settled escrow, so there is nothing to re-commit on demand.
        break;

      case "proveReputation":
        await this.proveReputation(action);
        break;

      case "hire":
        await this.hire(action);
        break;

      case "markDelivered":
        await this.markDelivered(action.escrowId);
        break;

      case "release":
        await this.release(action.escrowId);
        break;

      case "dispute":
        await this.sim.dispute(this.escrowBuyer(action.escrowId).secret, fromHex(action.escrowId));
        break;

      case "resolveDispute":
        await this.resolveDispute(action);
        break;

      default: {
        const never: never = action;
        throw new Error(`unknown action ${JSON.stringify(never)}`);
      }
    }

    const after = await this.chainView();
    if (before) await this.record(action, before, after);
    return this.snapshot();
  }

  // --- actions -------------------------------------------------------

  /**
   * Build each seller's reputation the only way the contract allows: by running
   * real escrows. There is no seeding shortcut any more, because
   * `updateReputation` reads its amount and outcome off a settled escrow.
   *
   * The buyer for every seeded job is the buyer persona, which is why the
   * escrow list starts long. That is not noise — it is the honest cost of a
   * reputation that cannot be invented.
   */
  private async seedAll(): Promise<void> {
    const buyer = this.agent(BUYER_KEY);
    for (const p of PERSONAS) {
      const a = this.agent(p.key);
      if (p.bond > 0n) await this.sim.stakeBond(a.secret, p.bond);
      if (p.history) {
        const outcomes = await earnHistory(this.sim, buyer, a, this.arbiterSecret, p.history);
        // Every seeded job came from a real escrow, so record which one. The
        // seller's rows and the buyer's rows are appended in the same order.
        const sellerId = toHex(a.id);
        const buyerId = toHex(buyer.id);
        const sellerOrigins = this.jobOrigins.get(sellerId) ?? new Map<number, string>();
        const buyerOrigins = this.jobOrigins.get(buyerId) ?? new Map<number, string>();
        let sellerIndex = sellerOrigins.size;
        let buyerIndex = buyerOrigins.size;
        for (const o of outcomes) {
          const hex = toHex(o.escrowId);
          sellerOrigins.set(sellerIndex++, hex);
          if (o.released) buyerOrigins.set(buyerIndex++, hex);
        }
        this.jobOrigins.set(sellerId, sellerOrigins);
        this.jobOrigins.set(buyerId, buyerOrigins);
      }
    }
  }

  private async proveReputation(action: Extract<MarketAction, { type: "proveReputation" }>): Promise<void> {
    const a = this.agent(action.agent);
    const thresholds = {
      minJobs: BigInt(action.minJobs),
      minRateBps: BigInt(action.minRateBps),
      minVolume: BigInt(action.minVolume),
    };
    // The circuit's return value. `holds` is the whole disclosure; the badge is
    // rendered from the thresholds that produced it (see ./badge.ts).
    const holds = await this.sim.proveReputation(
      a.privateState,
      thresholds.minJobs,
      thresholds.minRateBps,
      thresholds.minVolume,
    );
    const agentId = toHex(a.id);
    this.badges.set(agentId, {
      agentId,
      minJobs: thresholds.minJobs.toString(),
      minRateBps: thresholds.minRateBps.toString(),
      minVolume: thresholds.minVolume.toString(),
      holds,
      // Bind the badge to the commitment the circuit checked it against, so a
      // later ledger change visibly strands it.
      commitment: toHex(this.sim.ledger.reputationCommitments.lookup(a.id)),
      provenAt: Date.now(),
    });
  }

  private async hire(action: Extract<MarketAction, { type: "hire" }>): Promise<void> {
    const buyer = this.agent(action.buyer);
    const seller = this.agent(action.seller);
    // Opaque, CSPRNG, 32 bytes — never derived from the pair, the price or a
    // counter. See `randomEscrowId` in contracts/src/runtime.ts.
    const eid = randomEscrowId();
    await this.sim.openEscrow(buyer.secret, eid, seller.id, BigInt(action.amount));
  }

  private async markDelivered(escrowIdHex: string): Promise<void> {
    const seller = this.escrowSeller(escrowIdHex);
    await this.sim.markDelivered(seller.secret, fromHex(escrowIdHex));
  }

  /**
   * The happy path's tail, exactly as `runJob` in contracts/src/runtime.ts does
   * it: release, both sides append the job to their own private ledger, and the
   * seller re-commits — which rotates its on-chain commitment and strands any
   * badge proven against the previous one.
   */
  private async release(escrowIdHex: string): Promise<void> {
    const record = this.escrowRecord(escrowIdHex);
    const buyer = this.escrowBuyer(escrowIdHex);
    const seller = this.escrowSeller(escrowIdHex);

    await this.sim.release(buyer.secret, fromHex(escrowIdHex));
    this.appendJob(seller, mkJob(buyer.id, record.amount, true), escrowIdHex);
    this.appendJob(buyer, mkJob(seller.id, record.amount, true), escrowIdHex);
    await this.sim.updateReputation(seller.privateState, fromHex(escrowIdHex));
    seller.settle(record.amount, true);
  }

  private async resolveDispute(
    action: Extract<MarketAction, { type: "resolveDispute" }>,
  ): Promise<void> {
    const record = this.escrowRecord(action.escrowId);
    const seller = this.escrowSeller(action.escrowId);
    await this.sim.resolveDispute(this.arbiterSecret, fromHex(action.escrowId), action.sellerAtFault);
    if (action.sellerAtFault) {
      this.appendJob(seller, mkJob(record.buyer, record.amount, false), action.escrowId);
      await this.sim.updateReputation(seller.privateState, fromHex(action.escrowId));
      seller.settle(record.amount, false);
    }
  }

  /** Append to an agent's private ledger, remembering which escrow settled it. */
  private appendJob(a: Agent, job: ReturnType<typeof mkJob>, escrowIdHex: string): void {
    const index = a.jobCount;
    a.recordJob(job);
    const id = toHex(a.id);
    const origins = this.jobOrigins.get(id) ?? new Map<number, string>();
    origins.set(index, escrowIdHex);
    this.jobOrigins.set(id, origins);
  }

  // --- escrow lookups (chain state is the source of truth) ------------

  private escrowRecord(escrowIdHex: string) {
    const eid = fromHex(escrowIdHex);
    if (!this.sim.ledger.escrows.member(eid)) throw new Error("unknown escrow");
    return this.sim.ledger.escrows.lookup(eid);
  }

  private byAgentId(id: Uint8Array): Agent {
    const hex = toHex(id);
    for (const a of this.agents.values()) if (toHex(a.id) === hex) return a;
    throw new Error(`no local agent for id ${hex.slice(0, 12)}…`);
  }

  private escrowBuyer(escrowIdHex: string): Agent {
    return this.byAgentId(this.escrowRecord(escrowIdHex).buyer);
  }

  private escrowSeller(escrowIdHex: string): Agent {
    return this.byAgentId(this.escrowRecord(escrowIdHex).seller);
  }

  // --- views ---------------------------------------------------------

  private async chainView(): Promise<ChainView> {
    const l = this.sim.ledger;
    const serialized = this.sim.publicState;
    return {
      arbiterPk: toHex(l.arbiterPk),
      escrowCount: l.escrowCount.toString(),
      slashedTotal: l.slashedTotal.toString(),
      bonds: [...l.bonds].map(([id, amount]) => ({ agentId: toHex(id), amount: amount.toString() })),
      reputationCommitments: [...l.reputationCommitments].map(([id, c]) => ({
        agentId: toHex(id),
        commitment: toHex(c),
      })),
      escrows: [...l.escrows].map(([eid, e]) => ({
        escrowId: toHex(eid),
        buyer: toHex(e.buyer),
        seller: toHex(e.seller),
        amount: e.amount.toString(),
        state: ESCROW_STATES[e.state] ?? "EMPTY",
      })),
      serialized,
      stateDigest: await sha256Hex(serialized),
    };
  }

  private agentView(persona: PersonaSpec): AgentView {
    const a = this.agent(persona.key);
    const ps = a.privateState;
    const agentId = toHex(a.id);
    const origins = this.jobOrigins.get(agentId);
    const jobs: PrivateJobRow[] = [];
    let ok = 0;
    let volume = 0n;
    ps.jobs.forEach((j, index) => {
      jobs.push({
        client: toHex(j.client),
        price: j.price.toString(),
        success: j.success,
        escrowId: origins?.get(index),
      });
      if (j.success) {
        ok += 1;
        volume += j.price;
      }
    });
    return {
      key: persona.key,
      name: persona.name,
      role: persona.role,
      blurb: persona.blurb,
      agentId,
      ledgerSalt: toHex(a.salt),
      jobs,
      stats: {
        totalJobs: jobs.length,
        successfulJobs: ok,
        volume: volume.toString(),
        successRateBps: jobs.length === 0 ? 0 : Math.floor((ok * 10000) / jobs.length),
      },
    };
  }

  async snapshot(): Promise<MarketSnapshot> {
    return {
      agents: PERSONAS.map((p) => this.agentView(p)),
      chain: await this.chainView(),
      badges: [...this.badges.values()],
      events: this.events,
      execution: EXECUTION_NOTICE,
    };
  }

  // --- event log -----------------------------------------------------

  private async record(action: MarketAction, before: ChainView, after: ChainView): Promise<void> {
    this.seq += 1;
    this.events.push({
      seq: this.seq,
      circuit: circuitFor(action),
      actor: actorFor(action),
      detail: detailFor(action),
      ledgerWrites: diffChain(before, after),
      stateDigest: after.stateDigest,
      at: Date.now(),
    });
  }
}

function circuitFor(action: MarketAction): string {
  switch (action.type) {
    case "seed":
      return "stakeBond + updateReputation";
    case "commitLedger":
      return "updateReputation";
    case "hire":
      return "openEscrow";
    case "reset":
      return "constructor";
    default:
      return action.type;
  }
}

function personaName(key: string): string {
  return PERSONAS.find((p) => p.key === key)?.name ?? key;
}

function actorFor(action: MarketAction): string {
  if ("agent" in action) return personaName(action.agent);
  if (action.type === "hire") return personaName(action.buyer);
  if (action.type === "resolveDispute") return "Arbiter";
  if (action.type === "seed") return "Session";
  return "—";
}

function detailFor(action: MarketAction): string {
  switch (action.type) {
    case "seed":
      return "seeded private histories and published the initial commitments";
    case "stakeBond":
      return `staked ${action.amount}`;
    case "proveReputation":
      return `thresholds ≥${action.minJobs} jobs, ≥${Number(action.minRateBps) / 100}%, ≥${action.minVolume}`;
    case "hire":
      return `escrow funded for ${action.amount}`;
    case "markDelivered":
    case "release":
    case "dispute":
      return `escrow ${action.escrowId.slice(0, 12)}…`;
    case "resolveDispute":
      return `escrow ${action.escrowId.slice(0, 12)}… — seller ${action.sellerAtFault ? "at fault" : "cleared"}`;
    default:
      return "";
  }
}

/** Real diff of the public ledger — nothing here is authored by hand. */
function diffChain(before: ChainView, after: ChainView): string[] {
  const out: string[] = [];
  if (before.escrowCount !== after.escrowCount) {
    out.push(`escrowCount ${before.escrowCount} → ${after.escrowCount}`);
  }
  if (before.slashedTotal !== after.slashedTotal) {
    out.push(`slashedTotal ${before.slashedTotal} → ${after.slashedTotal}`);
  }

  const beforeBonds = new Map(before.bonds.map((b) => [b.agentId, b.amount]));
  for (const b of after.bonds) {
    const prev = beforeBonds.get(b.agentId);
    if (prev !== b.amount) {
      out.push(`bonds[${b.agentId.slice(0, 10)}…] ${prev ?? "∅"} → ${b.amount}`);
    }
  }

  const beforeCommits = new Map(before.reputationCommitments.map((c) => [c.agentId, c.commitment]));
  for (const c of after.reputationCommitments) {
    const prev = beforeCommits.get(c.agentId);
    if (prev !== c.commitment) {
      out.push(
        `reputationCommitments[${c.agentId.slice(0, 10)}…] ${prev ? `${prev.slice(0, 10)}…` : "∅"} → ${c.commitment.slice(0, 10)}…`,
      );
    }
  }

  const beforeEscrows = new Map(before.escrows.map((e) => [e.escrowId, e]));
  for (const e of after.escrows) {
    const prev = beforeEscrows.get(e.escrowId);
    if (!prev) {
      out.push(`escrows[${e.escrowId.slice(0, 10)}…] ∅ → {buyer, seller, ${e.amount}, ${e.state}}`);
    } else if (prev.state !== e.state) {
      out.push(`escrows[${e.escrowId.slice(0, 10)}…].state ${prev.state} → ${e.state}`);
    }
  }

  if (out.length === 0) out.push("no public state changed — only a boolean was disclosed");
  return out;
}

// ---------------------------------------------------------------------------
// Module singleton. Survives Next's dev-server module reloads via globalThis.
// ---------------------------------------------------------------------------

const SESSION_KEY = Symbol.for("agentmkt.market-session");
type Holder = { [SESSION_KEY]?: Promise<MarketSession> };

export function marketSession(): Promise<MarketSession> {
  const holder = globalThis as unknown as Holder;
  holder[SESSION_KEY] ??= MarketSession.create();
  return holder[SESSION_KEY];
}

export type { MarketSession };
