"use client";

// Nightjar — the marketplace (plan.md §5).
//
// A seller card carries the agent's public id, its on-chain bond, and a ZK
// badge. That is the complete list. No client list, no prices, no job count, no
// history — the buyer hires on a threshold proof and nothing else. Everything
// rendered here is either public ledger state or the single boolean
// `proveReputation` disclosed.

import { useState } from "react";
import { badgeVerdict, useMarket, type PublishedBadge } from "@/lib/midnight";
import { BadgePill, Button, Hex, NumberInput, Note, Panel, Row, money } from "./market-ui";

export function Marketplace({ onHired }: { onHired?: () => void }) {
  const { snapshot, busy, run } = useMarket();
  const [amount, setAmount] = useState("2500");

  if (!snapshot) return null;

  const buyer = snapshot.agents.find((a) => a.role === "buyer");
  const sellers = snapshot.agents.filter((a) => a.role === "seller");
  const badgeOf = (agentId: string): PublishedBadge | undefined =>
    snapshot.badges.find((b) => b.agentId === agentId);
  const commitmentOf = (agentId: string): string | undefined =>
    snapshot.chain.reputationCommitments.find((c) => c.agentId === agentId)?.commitment;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Hire an agent"
        subtitle="Everything on a card below is public: an agent id, a staked bond, and a threshold proof. Nothing else is available to a buyer — by construction, not by policy."
      >
        <div className="flex items-end gap-3 max-w-xs">
          <NumberInput label="Escrow amount" value={amount} onChange={setAmount} suffix="units" />
        </div>
        <Note>
          Opening an escrow discloses the escrow id, both hashed agent ids and the amount —
          that is the contract&apos;s design. The escrow id is 32 fresh CSPRNG bytes so it
          carries no link back to the buyer, the price or a sequence.
        </Note>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        {sellers.map((seller) => {
          const verdict = badgeVerdict(badgeOf(seller.agentId), commitmentOf(seller.agentId));
          const bond = snapshot.chain.bonds.find((b) => b.agentId === seller.agentId)?.amount ?? "0";
          return (
            <Panel key={seller.key} title={seller.name} subtitle={seller.blurb}>
              <div className="py-1">
                <BadgePill verdict={verdict} />
              </div>
              <Row label="Agent id">
                <Hex value={seller.agentId} chars={14} />
              </Row>
              <Row label="Bond staked (on chain)" tone="public">{money(bond)}</Row>
              <Button
                // A disabled primary is a muddy ember bar; an unhireable agent
                // should read as "nothing to act on", not "action greyed out".
                variant={verdict.kind === "verified" ? "primary" : "ghost"}
                full
                disabled={busy || !buyer || verdict.kind !== "verified" || amount === "" || amount === "0"}
                onClick={async () => {
                  if (!buyer) return;
                  await run({ type: "hire", buyer: buyer.key, seller: seller.key, amount });
                  onHired?.();
                }}
              >
                {verdict.kind === "verified" ? `Hire — escrow ${money(amount || "0")}` : "No badge to hire on"}
              </Button>
              {verdict.kind === "stale" && (
                <Note tone="warn">
                  This agent&apos;s ledger changed after it proved. The on-chain commitment no
                  longer matches the one the proof was checked against, so the badge says
                  nothing about the current ledger until the agent re-proves.
                </Note>
              )}
              {verdict.kind === "failed" && (
                <Note tone="warn">
                  <code>proveReputation</code> returned <code>false</code> for these thresholds.
                  The agent cannot display a claim its ledger does not support.
                </Note>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
