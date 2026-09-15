"use client";

// Nightjar — seller dashboard (plan.md §5).
//
// Three things a seller has: a private job ledger that never leaves the device,
// public collateral + a commitment to that ledger, and the ability to turn the
// ledger into a threshold proof. The stats panel is a *local* preview — it is
// what the agent knows, not what it has proven, and the badge is rendered from
// the thresholds it proved rather than from these numbers.
//
// Every panel on this screen states its own visibility in its header, because
// the whole point of the split is which side of the boundary a block sits on.

import { useState } from "react";
import {
  DEMO_BADGE_THRESHOLDS,
  badgeVerdict,
  formatRateBps,
  useMarket,
  type AgentView,
} from "@/lib/midnight";
import {
  BadgePill,
  Button,
  Hex,
  NumberInput,
  Note,
  Panel,
  Row,
  VisibilityTag,
  money,
} from "./market-ui";

export function SellerDashboard() {
  const { snapshot, busy, run } = useMarket();
  const sellers = snapshot?.agents.filter((a) => a.role === "seller") ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const seller = sellers.find((s) => s.key === selected) ?? sellers[0];

  if (!snapshot || !seller) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="label text-fg-dim">Acting as</span>
        <div className="flex w-fit max-w-full border-2 border-border shadow-hard-sm scroll-x">
          {sellers.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={s.key === seller.key}
              onClick={() => setSelected(s.key)}
              className={`h-10 shrink-0 px-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${
                i > 0 ? "border-l-2 border-border" : ""
              } ${
                s.key === seller.key
                  ? "bg-accent text-fg"
                  : "bg-bg-raised text-fg-dim hover:bg-bg-hover"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <PrivateLedger seller={seller} />
        <div className="min-w-0 flex flex-col gap-6">
          <BondAndCommitment seller={seller} />
          <ProveBadge seller={seller} />
        </div>
      </div>

      <DeliverQueue seller={seller} busy={busy} onDeliver={(escrowId) => run({ type: "markDelivered", escrowId })} />
    </div>
  );
}

/** Column heads, everywhere in the app: mono, uppercase, ruled off underneath. */
const TH = "label text-fg-dim px-2.5 py-2.5 bg-bg-inset border-b-2 border-border sticky top-0";
const TD = "px-2.5 py-2 border-b border-border";

function PrivateLedger({ seller }: { seller: AgentView }) {
  return (
    <Panel
      title="Private job ledger"
      subtitle={`${seller.stats.totalJobs} jobs — local only, and unbounded`}
      right={<VisibilityTag tone="private" />}
    >
      <div className="max-h-80 overflow-y-auto scroll-x border-2 border-border bg-bg-raised">
        <table className="w-full border-separate border-spacing-0 text-xs min-w-[26rem]">
          <thead>
            <tr>
              <th className={`${TH} text-left w-8`}>#</th>
              <th className={`${TH} text-left`}>Client</th>
              <th className={`${TH} text-right`}>Price</th>
              <th className={`${TH} text-right`}>Outcome</th>
              <th className={`${TH} text-right`}>On chain?</th>
            </tr>
          </thead>
          <tbody>
            {seller.jobs.map((job, i) => (
              <tr key={`${job.client}-${i}`}>
                <td className={`${TD} font-mono tnum text-fg-dim`}>{i + 1}</td>
                <td className={TD}>
                  <Hex value={job.client} chars={10} tone="private" />
                </td>
                <td className={`${TD} text-right font-mono tnum`}>{money(job.price)}</td>
                <td
                  className={`${TD} text-right font-mono uppercase tracking-wide ${
                    job.success ? "text-fg" : "text-danger font-bold"
                  }`}
                >
                  {job.success ? "success" : "failed"}
                </td>
                <td className={`${TD} text-right font-mono text-fg-dim`}>
                  {job.escrowId ? (
                    <span title={`settled through escrow ${job.escrowId}`}>escrow row</span>
                  ) : (
                    "no"
                  )}
                </td>
              </tr>
            ))}
            {seller.jobs.length === 0 && (
              <tr>
                <td colSpan={5} className={`${TD} font-mono text-fg-dim`}>
                  No history yet — seed the demo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Row label="Local success rate">{formatRateBps(BigInt(seller.stats.successRateBps))}</Row>
      <Row label="Local volume (successful)">{money(seller.stats.volume)}</Row>
      <Note>
        These rows are the witness input to <code>proveReputation</code>. They are held on
        this device; the chain holds one 32-byte commitment to them. Rows marked
        <span className="mx-1">&quot;escrow row&quot;</span>
        settled through an escrow in this session, so their counterparty, amount and outcome
        are visible in the public escrow record — everything else here is not.
      </Note>
    </Panel>
  );
}

function BondAndCommitment({ seller }: { seller: AgentView }) {
  const { snapshot, busy, run } = useMarket();
  const [amount, setAmount] = useState("5000");
  const bond = snapshot?.chain.bonds.find((b) => b.agentId === seller.agentId)?.amount;
  const commitment = snapshot?.chain.reputationCommitments.find(
    (c) => c.agentId === seller.agentId,
  )?.commitment;

  return (
    <Panel
      title="On-chain position"
      subtitle="Everything the chain holds for this agent"
      right={<VisibilityTag tone="public" />}
    >
      <Row label="Agent id" tone="public">
        <Hex value={seller.agentId} chars={16} />
      </Row>
      <Row label="Bond" tone="public">
        {bond ? money(bond) : "none staked"}
      </Row>
      <Row label="Reputation commitment" tone="public">
        {commitment ? <Hex value={commitment} chars={16} /> : "not published"}
      </Row>
      <div className="flex items-end gap-2">
        <NumberInput label="Stake more collateral" value={amount} onChange={setAmount} />
        <Button
          variant="ghost"
          disabled={busy || !amount || amount === "0"}
          onClick={() => run({ type: "stakeBond", agent: seller.key, amount })}
        >
          Stake
        </Button>
      </div>
      <Button
        variant="ghost"
        full
        disabled={busy}
        onClick={() => run({ type: "commitLedger", agent: seller.key })}
      >
        Re-commit ledger (updateReputation)
      </Button>
      <Note>
        The bond is what a dispute slashes, so it is deliberately public. The commitment is{" "}
        <code>persistentCommit(ledgerHash, salt)</code> — it binds the ledger without
        revealing its size, its clients or its prices.
      </Note>
    </Panel>
  );
}

function ProveBadge({ seller }: { seller: AgentView }) {
  const { snapshot, busy, run } = useMarket();
  const [minJobs, setMinJobs] = useState(DEMO_BADGE_THRESHOLDS.minJobs.toString());
  const [minRatePct, setMinRatePct] = useState((Number(DEMO_BADGE_THRESHOLDS.minRateBps) / 100).toString());
  const [minVolume, setMinVolume] = useState(DEMO_BADGE_THRESHOLDS.minVolume.toString());

  const badge = snapshot?.badges.find((b) => b.agentId === seller.agentId);
  const commitment = snapshot?.chain.reputationCommitments.find(
    (c) => c.agentId === seller.agentId,
  )?.commitment;
  const verdict = badgeVerdict(badge, commitment);
  const hasCommitment = Boolean(commitment);

  return (
    <Panel
      title="Generate reputation proof"
      subtitle="Pick thresholds, run the circuit, publish the badge"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumberInput label="Min jobs" value={minJobs} onChange={setMinJobs} />
        <NumberInput label="Min rate" value={minRatePct} onChange={setMinRatePct} suffix="%" />
        <NumberInput label="Min volume" value={minVolume} onChange={setMinVolume} />
      </div>
      <Button
        full
        disabled={busy || !hasCommitment || !minJobs || !minVolume || minRatePct === ""}
        onClick={() =>
          run({
            type: "proveReputation",
            agent: seller.key,
            minJobs,
            // The circuit takes basis points; the input is a percentage.
            minRateBps: String(Math.round(Number(minRatePct) * 100)),
            minVolume,
          })
        }
      >
        Prove &amp; publish badge
      </Button>
      {!hasCommitment && <Note tone="warn">Commit the ledger first — the circuit checks it.</Note>}

      <div className="border-t-2 border-border pt-4 flex flex-col gap-3">
        <span className="label text-fg-dim">Published badge</span>
        <BadgePill verdict={verdict} />
        {badge && (
          <>
            <Row label="Disclosed value">
              <code>{String(badge.holds)}</code>
            </Row>
            <Row label="Proven against commitment" tone="public">
              <Hex value={badge.commitment} chars={16} />
            </Row>
          </>
        )}
        <Note>
          The badge text is derived from the thresholds passed to the circuit, never from the
          stats on the left. Those thresholds are public inputs bound to the returned bit, so
          proving <code>true</code> at 1 job can only ever render &quot;1+ jobs&quot;.
        </Note>
      </div>
    </Panel>
  );
}

function DeliverQueue({
  seller,
  busy,
  onDeliver,
}: {
  seller: AgentView;
  busy: boolean;
  onDeliver: (escrowId: string) => void;
}) {
  const { snapshot } = useMarket();
  const escrows = (snapshot?.chain.escrows ?? []).filter((e) => e.seller === seller.agentId);
  if (escrows.length === 0) return null;

  return (
    <Panel
      title="Work queue"
      subtitle="Escrows the chain says this agent is the seller on"
      right={<VisibilityTag tone="public" />}
    >
      <div className="border-2 border-border">
        {escrows.map((e, i) => (
          <div
            key={e.escrowId}
            className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <Hex value={e.escrowId} chars={20} />
              <span className="label text-fg-dim">
                {money(e.amount)} · {e.state}
              </span>
            </div>
            <Button
              variant="ghost"
              disabled={busy || e.state !== "FUNDED"}
              onClick={() => onDeliver(e.escrowId)}
            >
              Mark delivered
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
