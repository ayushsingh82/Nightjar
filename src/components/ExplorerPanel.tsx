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
//
// This is the one screen where the colour rule has to do real work, so every
// block declares its side of the boundary in its own header, and the serialized
// state is printed reversed out in black — it is the public record, and it
// should look like a different document from the ones around it.

import {
  useMarket,
  type AgentView,
  type ChainEscrow,
  type MarketSnapshot,
} from "@/lib/midnight";
import { Hex, Note, Panel, Row, Stat, VisibilityTag, money } from "./market-ui";

/** A real run settles well over a hundred escrows; the panel shows the tail. */
const ESCROW_PREVIEW = 12;

/** Column heads, everywhere in the app: mono, uppercase, ruled off underneath. */
const TH = "label text-fg-dim px-3 py-2.5 bg-bg-inset border-b-2 border-border";
const TD = "px-3 py-2 border-b border-border";

export function ExplorerPanel() {
  const { snapshot } = useMarket();
  if (!snapshot) return null;

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="What the chain sees vs. what stays private"
        subtitle="Both columns are read from live state — the left from the contract's public ledger, the right from the agents' witness data."
      >
        <LeakCheck snapshot={snapshot} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
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
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="border-2 border-border bg-bg-raised scroll-x">
          <table className="w-full border-separate border-spacing-0 text-xs min-w-[34rem]">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Seller</th>
                <th className={`${TH} text-right`}>Escrows sold</th>
                <th className={`${TH} text-right`}>Agent id in public state</th>
                <th className={`${TH} text-right`}>…of those, escrow rows</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.name}>
                  <td className={`${TD} font-mono`}>{s.name}</td>
                  <td className={`${TD} text-right font-mono tnum text-private`}>{s.sells}</td>
                  <td className={`${TD} text-right font-mono tnum text-public`}>
                    {s.appearances}×
                  </td>
                  <td className={`${TD} text-right font-mono tnum text-private`}>{s.inEscrows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 border-2 border-border p-4">
        <span
          className={`label shrink-0 self-start inline-flex items-center justify-center border-2 border-border px-2 py-2 sm:w-[9rem] ${
            clean ? "bg-private text-bg" : "bg-danger text-bg"
          }`}
        >
          {clean ? "No leak" : "Leak"}
        </span>
        <p className="text-xs leading-relaxed text-fg-muted">
          {clean
            ? `Checked, against the live serialized state: none of the ${snapshot.agents.length} ledger salts appear anywhere in it, and none of the ${escrows.length} escrow rows name a seller. A seller's agent id does appear in the public record — it has to, or the bond could not be slashed and the commitment could not be opened — but never in an escrow row, and so never beside a price or an outcome.`
            : `${saltsLeaked.length} salt(s) and ${namedInEscrows} escrow row(s) expose something they should not.`}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChainColumn({ snapshot }: { snapshot: MarketSnapshot }) {
  const { chain } = snapshot;

  return (
    <div className="min-w-0 flex flex-col gap-6">
      <Panel
        title="What the chain sees"
        subtitle="marketplace.compact — public ledger state"
        right={<VisibilityTag tone="public" />}
      >
        <Row label="arbiterPk" tone="public">
          <Hex value={chain.arbiterPk} chars={16} />
        </Row>
        <Row label="escrowCount" tone="public">
          {chain.escrowCount}
        </Row>
        <Row label="slashedTotal" tone="public">
          {money(chain.slashedTotal)}
        </Row>

        <SubTable title="bonds: Map<AgentId, Uint>">
          {chain.bonds.map((b) => (
            <tr key={b.agentId}>
              <td className={TD}>
                <Hex value={b.agentId} chars={14} />
              </td>
              <td className={`${TD} text-right font-mono tnum`}>{money(b.amount)}</td>
            </tr>
          ))}
        </SubTable>

        <SubTable title="reputationCommitments: Map<AgentId, Bytes>">
          {chain.reputationCommitments.map((c) => (
            <tr key={c.agentId}>
              <td className={TD}>
                <Hex value={c.agentId} chars={14} />
              </td>
              <td className={`${TD} text-right`}>
                <Hex value={c.commitment} chars={16} />
              </td>
            </tr>
          ))}
        </SubTable>

        {chain.escrows.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="label text-fg-dim">
              escrows: Map&lt;EscrowId, EscrowRecord&gt; · {chain.escrows.length} rows
              {chain.escrows.length > ESCROW_PREVIEW && `, last ${ESCROW_PREVIEW}`}
            </span>
            <div className="border-2 border-border">
              {chain.escrows.slice(-ESCROW_PREVIEW).map((e, i) => (
                <div
                  key={e.escrowId}
                  className={`px-3 py-2 text-xs flex flex-col gap-1 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <Hex value={e.escrowId} chars={32} />
                  <span className="text-fg-dim font-mono text-[11px]">
                    buyer <Hex value={e.buyer} chars={10} /> · seller{" "}
                    <Hex value={e.sellerCommit} chars={10} /> (commitment) · {money(e.amount)} ·{" "}
                    {e.state}
                  </span>
                </div>
              ))}
            </div>
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
        right={<VisibilityTag tone="public" />}
      >
        {/* Reversed out: this is the published record, and it should not look
            like the private ledgers printed beside it. */}
        <pre className="border-2 border-border bg-fg text-bg font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-72 overflow-auto p-3">
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
    <div className="flex flex-col gap-2">
      <span className="label text-fg-dim">{title}</span>
      <div className="border-2 border-border scroll-x">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PrivateColumn({ snapshot }: { snapshot: MarketSnapshot }) {
  return (
    <div className="min-w-0 flex flex-col gap-6">
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
      right={<VisibilityTag tone="private" />}
    >
      <Row label="Jobs" tone="private">
        {agent.stats.totalJobs}
      </Row>
      <Row label="Successful" tone="private">
        {agent.stats.successfulJobs}
      </Row>
      <Row label="Distinct counterparties" tone="private">
        {counterparties}
      </Row>
      <Row label="Volume" tone="private">
        {money(agent.stats.volume)}
      </Row>
      <Row label="ledgerSalt (commitment opening)" tone="private">
        <Hex value={agent.ledgerSalt} chars={16} tone="private" />
      </Row>
      {agent.jobs.length > 0 && (
        <div className="max-h-48 overflow-y-auto scroll-x border-2 border-border">
          <table className="w-full border-separate border-spacing-0 text-[11px] font-mono">
            <tbody>
              {agent.jobs.map((j, i) => (
                <tr key={`${j.client}-${i}`}>
                  <td className={`${TD} text-fg-dim tnum w-8`}>{i + 1}</td>
                  <td className={`${TD} truncate text-private`}>{j.client.slice(0, 16)}…</td>
                  <td className={`${TD} text-right tnum`}>{money(j.price)}</td>
                  <td className={`${TD} text-right ${j.success ? "text-fg" : "text-danger font-bold"}`}>
                    {j.success ? "ok" : "fail"}
                  </td>
                  <td className={`${TD} text-right text-fg-dim`}>{j.escrowId ? "escrow" : "—"}</td>
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
      <div className="grid gap-px sm:grid-cols-2 border-2 border-border bg-border">
        <div className="bg-bg-raised p-4 flex flex-col gap-3">
          <VisibilityTag tone="public" />
          <span className="label text-fg-dim">Carried on chain</span>
          <ul className="text-xs flex flex-col gap-2 leading-relaxed">
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
        <div className="bg-bg-raised p-4 flex flex-col gap-3">
          <VisibilityTag tone="private" />
          <span className="label text-fg-dim">Not carried</span>
          <ul className="text-xs flex flex-col gap-2 leading-relaxed text-fg-muted">
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
    <Panel
      title="Ledger writes"
      subtitle="Actual before/after diff of public state, per circuit call"
      right={<VisibilityTag tone="public" />}
    >
      <div className="border-2 border-border max-h-96 overflow-y-auto">
        {[...snapshot.events].reverse().map((ev, i) => (
          <div key={ev.seq} className={`px-3 py-3 text-xs ${i > 0 ? "border-t border-border" : ""}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <span className="font-mono font-bold tnum">
                #{ev.seq} {ev.circuit}
              </span>
              <span className="label text-fg-dim">{ev.actor}</span>
            </div>
            <div className="text-fg-dim mt-1.5 leading-relaxed">{ev.detail}</div>
            <ul className="mt-2 flex flex-col gap-1 font-mono text-[11px] border-l-2 border-border pl-3">
              {ev.ledgerWrites.map((w) => (
                <li key={w} className="text-fg-muted break-all">
                  {w}
                </li>
              ))}
            </ul>
            <div className="label text-fg-dim mt-2.5">
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
