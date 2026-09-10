"use client";

// Nightjar — buyer dashboard (plan.md §5).
//
// The buyer's whole view of a counterparty is a hashed agent id and a badge, so
// the escrow lifecycle is the only leverage it has: release when the work is
// good, dispute when it is not and let the arbiter slash the bond.
//
// `markDelivered` is a seller-only circuit (`assert(... == e.seller)`). This is
// a two-persona demo running from one process, so the button here explicitly
// acts as the seller agent rather than pretending the buyer can deliver.

import {
  badgeVerdict,
  useMarket,
  type ChainEscrow,
  type MarketSnapshot,
} from "@/lib/midnight";
import { BadgePill, Button, Hex, Note, Panel, Row, money } from "./market-ui";

const OPEN_STATES = new Set(["FUNDED", "DELIVERED", "DISPUTED"]);

export function BuyerDashboard() {
  const { snapshot, busy, run } = useMarket();
  if (!snapshot) return null;

  const buyer = snapshot.agents.find((a) => a.role === "buyer");
  if (!buyer) return null;

  const mine = snapshot.chain.escrows.filter((e) => e.buyer === buyer.agentId);
  const active = mine.filter((e) => OPEN_STATES.has(e.state));
  const settled = mine.filter((e) => !OPEN_STATES.has(e.state));

  return (
    <div className="flex flex-col gap-5">
      <Panel title={buyer.name} subtitle={buyer.blurb}>
        <Row label="Agent id">
          <Hex value={buyer.agentId} chars={16} />
        </Row>
        <Row label="Jobs in this agent's own private ledger">{buyer.stats.totalJobs}</Row>
        <Row label="Escrows opened">{mine.length}</Row>
        <Note>
          The buyer keeps its own private ledger too — who it hired, for how much, and how it
          went. That ledger is the buyer&apos;s own reputation material and is never
          published.
        </Note>
      </Panel>

      {active.length === 0 && settled.length === 0 && (
        <Panel>
          <p className="text-fg-dim">
            No escrows yet. Hire an agent from the marketplace on its badge alone.
          </p>
        </Panel>
      )}

      {active.length > 0 && (
        <Panel title="Active escrows" subtitle="State comes straight from the contract's escrows map">
          <div className="flex flex-col gap-4">
            {active.map((e) => (
              <EscrowCard
                key={e.escrowId}
                escrow={e}
                snapshot={snapshot}
                busy={busy}
                onAction={run}
              />
            ))}
          </div>
        </Panel>
      )}

      {settled.length > 0 && (
        <Panel title="Settled">
          {settled.map((e) => (
            <div
              key={e.escrowId}
              className="flex items-center justify-between gap-3 border-t border-border/60 pt-2 first:border-0 first:pt-0"
            >
              <Hex value={e.escrowId} chars={20} />
              <span className="text-xs text-fg-dim">
                {money(e.amount)} ·{" "}
                <span className={e.state === "SLASHED" ? "text-danger" : "text-private"}>
                  {e.state}
                </span>
              </span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function EscrowCard({
  escrow,
  snapshot,
  busy,
  onAction,
}: {
  escrow: ChainEscrow;
  snapshot: MarketSnapshot;
  busy: boolean;
  onAction: ReturnType<typeof useMarket>["run"];
}) {
  const seller = snapshot.agents.find((a) => a.agentId === escrow.seller);
  const badge = snapshot.badges.find((b) => b.agentId === escrow.seller);
  const commitment = snapshot.chain.reputationCommitments.find(
    (c) => c.agentId === escrow.seller,
  )?.commitment;

  return (
    <div className="rounded-lg border border-border p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{seller?.name ?? "unknown seller"}</div>
          <Hex value={escrow.escrowId} chars={24} />
        </div>
        <span className="text-xs rounded-full border border-border px-2 py-1">
          {escrow.state}
        </span>
      </div>
      <BadgePill verdict={badgeVerdict(badge, commitment)} />
      <Row label="Amount held in escrow">{money(escrow.amount)}</Row>

      <div className="flex gap-2 flex-wrap pt-1">
        <Button
          variant="ghost"
          disabled={busy || escrow.state !== "FUNDED"}
          onClick={() => onAction({ type: "markDelivered", escrowId: escrow.escrowId })}
        >
          Seller delivers
        </Button>
        <Button
          disabled={busy || escrow.state !== "DELIVERED"}
          onClick={() => onAction({ type: "release", escrowId: escrow.escrowId })}
        >
          Release funds
        </Button>
        <Button
          variant="danger"
          disabled={busy || !(escrow.state === "FUNDED" || escrow.state === "DELIVERED")}
          onClick={() => onAction({ type: "dispute", escrowId: escrow.escrowId })}
        >
          Dispute
        </Button>
        {escrow.state === "DISPUTED" && (
          <>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                onAction({ type: "resolveDispute", escrowId: escrow.escrowId, sellerAtFault: true })
              }
            >
              Arbiter: slash seller
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                onAction({ type: "resolveDispute", escrowId: escrow.escrowId, sellerAtFault: false })
              }
            >
              Arbiter: clear seller
            </Button>
          </>
        )}
      </div>

      <Note>
        &quot;Seller delivers&quot; runs <code>markDelivered</code> as the seller agent — the
        circuit asserts the caller is the seller, so it could not be the buyer. Resolution
        runs as the arbiter whose key was fixed in the constructor.
      </Note>
    </div>
  );
}
