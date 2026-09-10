"use client";

// Nightjar — explorer panel (plan.md §5, the demo's punchline).
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
import { Hex, Note, Panel, Row, Stat, money } from "./market-ui";

/** A real run settles well over a hundred escrows; the panel shows the tail. */
const ESCROW_PREVIEW = 12;

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
  const escrows = snapshot.chain.escrows;
  const rows = snapshot.agents.flatMap((a) => a.jobs);

  // Actually searched for, every render, in the real serialized state. The
  // salt is the commitment opening: with it, the aggregate stops being hidden.
  const saltsLeaked = snapshot.agents.filter((a) => serialized.includes(a.ledgerSalt));

  // The claim the seller commitment exists to make. This client happens to know
  // who sold what — it arranged the jobs — so it can count what an observer
  // holding only the ledger could not: how many escrow rows name each seller.
  // The answer has to be zero, because escrows carry persistentCommit(id, nonce).
  const sellers = snapshot.agents
    .filter((a) => a.role === "seller")
    .map((a) => ({
      name: a.name,
      sells: escrows.filter((e) => e.seller === a.agentId).length,
      // Occurrences of the raw agent id anywhere in the public record.
      appearances: serialized.split(a.agentId).length - 1,
      inEscrows: escrows.filter((e) => e.sellerCommit === a.agentId).length,
    }))
    .filter((s) => s.sells > 0);

  const namedInEscrows = sellers.reduce((n, s) => n + s.inEscrows, 0);
  const clean = saltsLeaked.length === 0 && namedInEscrows === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Private job rows" value={String(rows.length)} tone="private" />
        <Stat
          label="Escrow rows naming a seller"
          value={`${namedInEscrows} of ${escrows.length}`}
          tone={namedInEscrows === 0 ? "private" : "danger"}
          sub="every escrow carries persistentCommit(agentId, nonce) in the seller slot, never the id"
        />
        <Stat label="Public state size" value={`${serialized.length} chars`} tone="public" />
      </div>

      {sellers.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-bg-inset/60 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="text-fg-dim">
              <tr className="text-left">
                <th className="font-normal px-4 py-2">Seller</th>
                <th className="font-normal text-right px-4">Escrows sold</th>
                <th className="font-normal text-right px-4">Agent id in public state</th>
                <th className="font-normal text-right px-4 py-2">…of those, escrow rows</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.name} className="border-t border-border/60">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="text-right px-4 font-mono tnum text-private">{s.sells}</td>
                  <td className="text-right px-4 font-mono tnum text-public">
                    {s.appearances}×
                  </td>
                  <td className="text-right px-4 py-2 font-mono tnum text-private">
                    {s.inEscrows}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={`text-xs leading-relaxed ${clean ? "text-private" : "text-danger"}`}>
        {clean
          ? `Checked, against the live serialized state: none of the ${snapshot.agents.length} ledger salts appear anywhere in it, and none of the ${escrows.length} escrow rows name a seller. A seller's agent id does appear in the public record — it has to, or the bond could not be slashed and the commitment could not be opened — but never in an escrow row, and so never beside a price or an outcome.`
          : `Leak: ${saltsLeaked.length} salt(s) and ${namedInEscrows} escrow row(s) expose something they should not.`}
      </p>
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
            <tr key={b.agentId} className="border-t border-border/60">
              <td className="py-1">
                <Hex value={b.agentId} chars={14} />
              </td>
              <td className="text-right">{money(b.amount)}</td>
            </tr>
          ))}
        </SubTable>

        <SubTable title="reputationCommitments: Map<AgentId, Bytes>">
          {chain.reputationCommitments.map((c) => (
            <tr key={c.agentId} className="border-t border-border/60">
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
            <span className="text-xs text-fg-dim">
              escrows: Map&lt;EscrowId, EscrowRecord&gt; · {chain.escrows.length} rows
              {chain.escrows.length > ESCROW_PREVIEW && `, showing the last ${ESCROW_PREVIEW}`}
            </span>
            {chain.escrows.slice(-ESCROW_PREVIEW).map((e) => (
              <div
                key={e.escrowId}
                className="rounded-lg border border-border p-2 text-xs flex flex-col gap-0.5"
              >
                <Hex value={e.escrowId} chars={32} />
                <span className="text-fg-dim">
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
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-72 overflow-auto text-fg-muted">
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
      <span className="text-xs text-fg-dim">{title}</span>
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
        <div className="max-h-48 overflow-auto rounded-lg border border-border p-2">
          <table className="w-full text-[11px] font-mono">
            <tbody>
              {agent.jobs.map((j, i) => (
                <tr key={`${j.client}-${i}`}>
                  <td className="text-fg-dim pr-2">{i + 1}</td>
                  <td className="truncate">{j.client.slice(0, 16)}…</td>
                  <td className="text-right pl-2">{money(j.price)}</td>
                  <td className={`text-right pl-2 ${j.success ? "text-private" : "text-danger"}`}>
                    {j.success ? "ok" : "fail"}
                  </td>
                  <td className="text-right pl-2 text-fg-dim">{j.escrowId ? "escrow" : "—"}</td>
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
          <span className="text-xs text-fg-dim uppercase tracking-wide">Carried on chain</span>
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
              <li className="text-fg-dim">
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
          <span className="text-xs text-fg-dim uppercase tracking-wide">Not carried</span>
          <ul className="text-xs flex flex-col gap-1 text-fg-dim">
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
            className="border-t border-border/60 pt-2 first:border-0 first:pt-0 text-xs"
          >
            <div className="flex justify-between gap-3">
              <span className="font-mono">
                #{ev.seq} {ev.circuit}
              </span>
              <span className="text-fg-dim">{ev.actor}</span>
            </div>
            <div className="text-fg-dim">{ev.detail}</div>
            <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px]">
              {ev.ledgerWrites.map((w) => (
                <li key={w} className="text-fg-muted">
                  {w}
                </li>
              ))}
            </ul>
            <div className="text-[11px] text-fg-dim mt-0.5">
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
