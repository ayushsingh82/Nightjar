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
import {
  BadgePill,
  Button,
  Hex,
  Note,
  Panel,
  Row,
  VisibilityTag,
  money,
} from "./market-ui";

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
    <div className="flex flex-col gap-6">
      <Panel title={buyer.name} subtitle={buyer.blurb}>
        <Row label="Agent id" tone="public">
          <Hex value={buyer.agentId} chars={16} />
        </Row>
        <Row label="Jobs in this agent's own private ledger" tone="private">
          {buyer.stats.totalJobs}
        </Row>
        <Row label="Escrows opened" tone="public">
          {mine.length}
        </Row>
        <Note>
          The buyer keeps its own private ledger too — who it hired, for how much, and how it
          went. That ledger is the buyer&apos;s own reputation material and is never
          published.
        </Note>
      </Panel>

      {active.length === 0 && settled.length === 0 && (
        <Panel>
          <p className="font-mono text-xs text-fg-dim">
            No escrows yet. Hire an agent from the marketplace on its badge alone.
          </p>
        </Panel>
      )}

      {active.length > 0 && (
        <Panel
          title="Active escrows"
          subtitle="State comes straight from the contract's escrows map"
          right={<VisibilityTag tone="public" />}
        >
          <div className="flex flex-col gap-5">
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
        <Panel title="Settled" right={<VisibilityTag tone="public" />}>
          <div className="border-2 border-border">
            {settled.map((e, i) => (
              <div
                key={e.escrowId}
                className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <Hex value={e.escrowId} chars={20} />
                <span className="flex items-center gap-2">
                  <span className="font-mono tnum text-xs">{money(e.amount)}</span>
                  <span
                    className={`label border-2 border-border px-2 py-1 ${
                      e.state === "SLASHED" ? "bg-danger text-bg" : "bg-bg-inset text-fg"
                    }`}
                  >
                    {e.state}
                  </span>
                </span>
              </div>
            ))}
          </div>
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
    <div className="border-2 border-border bg-bg-raised">
      <div className="flex items-start justify-between gap-3 px-3.5 py-3 border-b-2 border-border bg-bg">
        <div className="min-w-0">
          <div className="font-display text-[15px] uppercase tracking-[0.015em] leading-tight">
            {seller?.name ?? "unknown seller"}
          </div>
          <div className="mt-1.5">
            <Hex value={escrow.escrowId} chars={24} />
          </div>
        </div>
        <span className="label shrink-0 border-2 border-border bg-bg-inset px-2 py-1.5">
          {escrow.state}
        </span>
      </div>

      <div className="px-3.5 py-3 flex flex-col gap-3">
        <BadgePill verdict={badgeVerdict(badge, commitment)} />
        <Row label="Amount held in escrow" tone="public">
          {money(escrow.amount)}
        </Row>

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
    </div>
  );
}
