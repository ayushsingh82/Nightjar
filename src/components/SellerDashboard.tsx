"use client";

// agent-commerce — seller dashboard (plan.md §5).
//
// Three things a seller has: a private job ledger that never leaves the device,
// public collateral + a commitment to that ledger, and the ability to turn the
// ledger into a threshold proof. The stats panel is a *local* preview — it is
// what the agent knows, not what it has proven, and the badge is rendered from
// the thresholds it proved rather than from these numbers.

import { useState } from "react";
import {
  DEMO_BADGE_THRESHOLDS,
  badgeVerdict,
  formatRateBps,
  useMarket,
  type AgentView,
} from "@/lib/midnight";
import { BadgePill, Button, Hex, NumberInput, Note, Panel, Row, money } from "./market-ui";

export function SellerDashboard() {
  const { snapshot, busy, run } = useMarket();
  const sellers = snapshot?.agents.filter((a) => a.role === "seller") ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const seller = sellers.find((s) => s.key === selected) ?? sellers[0];

  if (!snapshot || !seller) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2 flex-wrap">
        {sellers.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSelected(s.key)}
            className={`h-9 px-4 rounded-full text-sm border ${
              s.key === seller.key
                ? "border-foreground"
                : "border-black/10 dark:border-white/15 text-zinc-500"
            }`}
          >
            Acting as {s.name}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PrivateLedger seller={seller} />
        <div className="flex flex-col gap-5">
          <BondAndCommitment seller={seller} />
          <ProveBadge seller={seller} />
        </div>
      </div>

      <DeliverQueue seller={seller} busy={busy} onDeliver={(escrowId) => run({ type: "markDelivered", escrowId })} />
    </div>
  );
}

function PrivateLedger({ seller }: { seller: AgentView }) {
  return (
    <Panel
      title="Private job ledger"
      subtitle={`${seller.stats.totalJobs} of ${seller.ledgerCap} slots used — local only`}
    >
      <div className="max-h-80 overflow-auto -mx-1 px-1">
        <table className="w-full text-xs">
          <thead className="text-zinc-500 sticky top-0 bg-background">
            <tr className="text-left">
              <th className="font-normal py-1">#</th>
              <th className="font-normal">Client</th>
              <th className="font-normal text-right">Price</th>
              <th className="font-normal text-right">Outcome</th>
              <th className="font-normal text-right">On chain?</th>
            </tr>
          </thead>
          <tbody>
            {seller.jobs.map((job, i) => (
              <tr key={`${job.client}-${i}`} className="border-t border-black/5 dark:border-white/10">
                <td className="py-1 text-zinc-500">{i + 1}</td>
                <td>
                  <Hex value={job.client} chars={10} />
                </td>
                <td className="text-right">{money(job.price)}</td>
                <td className={`text-right ${job.success ? "text-green-600" : "text-red-600"}`}>
                  {job.success ? "success" : "failed"}
                </td>
                <td className="text-right text-zinc-500">
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
                <td colSpan={5} className="py-3 text-zinc-500">
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
    <Panel title="On-chain position" subtitle="Everything the chain holds for this agent">
      <Row label="Agent id">
        <Hex value={seller.agentId} chars={16} />
      </Row>
      <Row label="Bond">{bond ? money(bond) : "none staked"}</Row>
      <Row label="Reputation commitment">
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
      <div className="grid grid-cols-3 gap-2">
        <NumberInput label="Min jobs" value={minJobs} onChange={setMinJobs} />
        <NumberInput label="Min rate" value={minRatePct} onChange={setMinRatePct} suffix="%" />
        <NumberInput label="Min volume" value={minVolume} onChange={setMinVolume} />
      </div>
      <Button
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

      <div className="border-t border-black/10 dark:border-white/15 pt-3 flex flex-col gap-2">
        <span className="text-xs text-zinc-500">Published badge</span>
        <BadgePill verdict={verdict} />
        {badge && (
          <>
            <Row label="Disclosed value">
              <code>{String(badge.holds)}</code>
            </Row>
            <Row label="Proven against commitment">
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
    <Panel title="Work queue" subtitle="Escrows the chain says this agent is the seller on">
      {escrows.map((e) => (
        <div
          key={e.escrowId}
          className="flex items-center justify-between gap-3 border-t border-black/5 dark:border-white/10 pt-2 first:border-0 first:pt-0"
        >
          <div className="flex flex-col min-w-0">
            <Hex value={e.escrowId} chars={20} />
            <span className="text-xs text-zinc-500">
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
    </Panel>
  );
}
