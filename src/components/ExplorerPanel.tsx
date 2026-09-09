"use client";

// agent-commerce — explorer panel (plan.md §5, the demo's punchline).
//
// Left column: the contract's public ledger, read back field for field, plus
// the literal serialized state string an indexer would return.
// Right column: the same agents' private job ledgers.
//
// Nothing on this screen is illustrative. The left side is `sim.ledger`, the
// right side is each `Agent`'s witness state, and the leak check at the bottom
// searches the actual serialized state for the actual private values.

import {
  useMarket,
  type AgentView,
  type ChainEscrow,
  type MarketSnapshot,
} from "@/lib/midnight";
import { Hex, Note, Panel, Row, money } from "./market-ui";

export function ExplorerPanel() {
  const { snapshot } = useMarket();
  if (!snapshot) return null;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="What the chain sees vs. what stays private"
        subtitle="Both columns are read from live state — the left from the contract's public ledger, the right from the agents' witness data."
      >
        <LeakCheck snapshot={snapshot} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <ChainColumn snapshot={snapshot} />
        <PrivateColumn snapshot={snapshot} />
      </div>

      <Settlement snapshot={snapshot} />
      <EventLog snapshot={snapshot} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function LeakCheck({ snapshot }: { snapshot: MarketSnapshot }) {
  const serialized = snapshot.chain.serialized;
  const rows = snapshot.agents.flatMap((a) =>
    a.jobs.map((j) => ({ agent: a.name, ...j, salt: a.ledgerSalt })),
  );
  const offChain = rows.filter((r) => !r.escrowId);
  const settled = rows.filter((r) => r.escrowId);
  // Actually searched for, every render, in the real serialized state.
  const leaked = offChain.filter((r) => serialized.includes(r.client));
  const saltsLeaked = snapshot.agents.filter((a) => serialized.includes(a.ledgerSalt));

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Private job rows" value={String(rows.length)} />
        <Stat
          label="Rows with any on-chain trace"
          value={`${settled.length} of ${rows.length}`}
          hint="only rows that settled through an escrow — the escrow record names its counterparties"
        />
        <Stat label="Public state size" value={`${serialized.length} chars`} />
      </div>
      <p
        className={`text-xs ${
          leaked.length === 0 && saltsLeaked.length === 0
            ? "text-green-700 dark:text-green-400"
            : "text-red-600"
        }`}
      >
        {leaked.length === 0 && saltsLeaked.length === 0
          ? `Checked: none of the ${offChain.length} off-chain job rows and none of the ${snapshot.agents.length} ledger salts appear anywhere in the serialized public state.`
          : `Leak: ${leaked.length} job row(s) and ${saltsLeaked.length} salt(s) found in public state.`}
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-medium tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChainColumn({ snapshot }: { snapshot: MarketSnapshot }) {
  const { chain } = snapshot;

  return (
    <div className="flex flex-col gap-5">
      <Panel title="What the chain sees" subtitle="marketplace.compact — public ledger state">
        <Row label="arbiterPk">
          <Hex value={chain.arbiterPk} chars={16} />
        </Row>
        <Row label="escrowCount">{chain.escrowCount}</Row>
        <Row label="slashedTotal">{money(chain.slashedTotal)}</Row>

        <SubTable title="bonds: Map<AgentId, Uint>">
          {chain.bonds.map((b) => (
            <tr key={b.agentId} className="border-t border-black/5 dark:border-white/10">
              <td className="py-1">
                <Hex value={b.agentId} chars={14} />
              </td>
              <td className="text-right">{money(b.amount)}</td>
            </tr>
          ))}
        </SubTable>

        <SubTable title="reputationCommitments: Map<AgentId, Bytes>">
          {chain.reputationCommitments.map((c) => (
            <tr key={c.agentId} className="border-t border-black/5 dark:border-white/10">
              <td className="py-1">
                <Hex value={c.agentId} chars={14} />
              </td>
              <td className="text-right">
                <Hex value={c.commitment} chars={16} />
              </td>
            </tr>
          ))}
        </SubTable>

        {chain.escrows.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">escrows: Map&lt;EscrowId, EscrowRecord&gt;</span>
            {chain.escrows.map((e) => (
              <div
                key={e.escrowId}
                className="rounded-lg border border-black/10 dark:border-white/15 p-2 text-xs flex flex-col gap-0.5"
              >
                <Hex value={e.escrowId} chars={32} />
                <span className="text-zinc-500">
                  buyer <Hex value={e.buyer} chars={10} /> · seller{" "}
                  <Hex value={e.sellerCommit} chars={10} /> (commitment) · {money(e.amount)} ·{" "}
                  {e.state}
                </span>
              </div>
            ))}
          </div>
        )}

        <Note>
          Counterparties appear as <code>agentIdFrom(secret)</code> hashes, never as wallet
          addresses. Escrow ids are opaque CSPRNG bytes, so two escrows by the same buyer
          cannot be linked through the id — and the DUST fee transaction that pays for a
          settlement carries no buyer↔seller edge at all.
        </Note>
      </Panel>

      <Panel
        title="Serialized contract state"
        subtitle={`byte-for-byte what an indexer returns · sha256 ${chain.stateDigest.slice(0, 16)}…`}
      >
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-72 overflow-auto text-zinc-600 dark:text-zinc-400">
          {chain.serialized}
        </pre>
        <Note>
          This string is the complete public record — {chain.serialized.length} characters of
          it. Search it: no client id from a private history, no job count, no success rate,
          no ledger salt, for any agent.
        </Note>
      </Panel>
    </div>
  );
}

function SubTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{title}</span>
      <table className="w-full text-xs">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PrivateColumn({ snapshot }: { snapshot: MarketSnapshot }) {
  return (
    <div className="flex flex-col gap-5">
      {snapshot.agents.map((a) => (
        <PrivateAgent key={a.key} agent={a} />
      ))}
    </div>
  );
}

function PrivateAgent({ agent }: { agent: AgentView }) {
  const counterparties = new Set(agent.jobs.map((j) => j.client)).size;
  return (
    <Panel
      title={`What ${agent.name} actually holds`}
      subtitle="witness state — never transmitted, never committed in the clear"
    >
      <Row label="Jobs">{agent.stats.totalJobs}</Row>
      <Row label="Successful">{agent.stats.successfulJobs}</Row>
      <Row label="Distinct counterparties">{counterparties}</Row>
      <Row label="Volume">{money(agent.stats.volume)}</Row>
      <Row label="ledgerSalt (commitment opening)">
        <Hex value={agent.ledgerSalt} chars={16} />
      </Row>
      {agent.jobs.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-lg border border-black/10 dark:border-white/15 p-2">
          <table className="w-full text-[11px] font-mono">
            <tbody>
              {agent.jobs.map((j, i) => (
                <tr key={`${j.client}-${i}`}>
                  <td className="text-zinc-500 pr-2">{i + 1}</td>
                  <td className="truncate">{j.client.slice(0, 16)}…</td>
                  <td className="text-right pl-2">{money(j.price)}</td>
                  <td className={`text-right pl-2 ${j.success ? "text-green-600" : "text-red-600"}`}>
                    {j.success ? "ok" : "fail"}
                  </td>
                  <td className="text-right pl-2 text-zinc-500">{j.escrowId ? "escrow" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Note>
        The whole job graph — who, how much, how it went — lives here. The chain&apos;s only
        record of it is the single commitment in the left column.
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function Settlement({ snapshot }: { snapshot: MarketSnapshot }) {
  const settled: ChainEscrow | undefined = [...snapshot.chain.escrows]
    .reverse()
    .find((e) => e.state === "RELEASED" || e.state === "SLASHED");
  if (!settled) return null;

  const seller = snapshot.agents.find((a) => a.agentId === settled.seller);
  const sellerJobs = seller?.jobs.length ?? 0;

  return (
    <Panel
      title="A settlement, as an observer sees it"
      subtitle={`escrow ${settled.escrowId.slice(0, 24)}… · ${settled.state}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Carried on chain</span>
          <ul className="text-xs flex flex-col gap-1">
            <li>
              escrowId — <Hex value={settled.escrowId} chars={20} /> (32 CSPRNG bytes, links to
              nothing)
            </li>
            <li>
              buyer — <Hex value={settled.buyer} chars={14} /> (a hash, not an address)
            </li>
            <li>
              seller — <Hex value={settled.sellerCommit} chars={14} /> (a{" "}
              <em>commitment</em>, not an id: the chain cannot tell you who was hired, and
              nor can it count how many jobs they have done)
            </li>
            {settled.seller && (
              <li className="text-zinc-500">
                …which this client happens to know opens to{" "}
                <Hex value={settled.seller} chars={14} /> — because it arranged the job.
                An observer with only the ledger does not.
              </li>
            )}
            <li>amount — {money(settled.amount)}</li>
            <li>state — {settled.state}</li>
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Not carried</span>
          <ul className="text-xs flex flex-col gap-1 text-zinc-500">
            <li>the seller&apos;s other {Math.max(sellerJobs - 1, 0)} jobs</li>
            <li>who any of those clients were</li>
            <li>what any of them paid</li>
            <li>the seller&apos;s job count, success rate or volume</li>
            <li>either party&apos;s wallet address</li>
          </ul>
        </div>
      </div>
      <Note>
        The badge that won this job disclosed one boolean. This record discloses one job. An
        observer holding both still cannot assemble the seller&apos;s history, and cannot join
        this escrow to the next one — the id is random and the DUST fee transaction is paid by
        the wallet as a relayer, so it carries no buyer↔seller edge.
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function EventLog({ snapshot }: { snapshot: MarketSnapshot }) {
  if (snapshot.events.length === 0) return null;
  return (
    <Panel title="Ledger writes" subtitle="Actual before/after diff of public state, per circuit call">
      <div className="flex flex-col gap-2 max-h-96 overflow-auto">
        {[...snapshot.events].reverse().map((ev) => (
          <div
            key={ev.seq}
            className="border-t border-black/5 dark:border-white/10 pt-2 first:border-0 first:pt-0 text-xs"
          >
            <div className="flex justify-between gap-3">
              <span className="font-mono">
                #{ev.seq} {ev.circuit}
              </span>
              <span className="text-zinc-500">{ev.actor}</span>
            </div>
            <div className="text-zinc-500">{ev.detail}</div>
            <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px]">
              {ev.ledgerWrites.map((w) => (
                <li key={w} className="text-zinc-600 dark:text-zinc-400">
                  {w}
                </li>
              ))}
            </ul>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              state sha256 <Hex value={ev.stateDigest} chars={16} />
            </div>
          </div>
        ))}
      </div>
      <Note>
        <code>proveReputation</code> is the interesting row: it changes no public state at
        all. The only thing that crossed the boundary was one boolean.
      </Note>
    </Panel>
  );
}
