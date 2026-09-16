"use client";

// Nightjar — the console that hosts the four product surfaces plus the guided
// walkthrough.
//
// One `MarketProvider` for all tabs, so the marketplace, the dashboards and the
// explorer are all looking at the same contract state at the same moment —
// which is the point: hire on the badge in one tab, then read the ledger in
// another and see that it says nothing about why.

import { useState } from "react";
import { MarketProvider, circuitLabel, useMarket } from "@/lib/midnight";
import { BRAND } from "@/lib/brand";
import { AppShell } from "./AppShell";
import { BuyerDashboard } from "./BuyerDashboard";
import { DemoRunner } from "./DemoRunner";
import { ExplorerPanel } from "./ExplorerPanel";
import { Marketplace } from "./Marketplace";
import { ProofProgressView } from "./ProofProgressView";
import { SellerDashboard } from "./SellerDashboard";
import { WalletPanel } from "./WalletPanel";
import { Empty, ErrorNote, Note, Panel } from "./market-ui";

const TABS = ["Walkthrough", "Marketplace", "Seller", "Buyer", "Explorer", "Wallet"] as const;
type Tab = (typeof TABS)[number];

export function MarketConsole() {
  return (
    <MarketProvider>
      <Console />
    </MarketProvider>
  );
}

function Console() {
  const { snapshot, loading, error, progress, busy, pending, run, clearError } = useMarket();
  const [tab, setTab] = useState<Tab>("Walkthrough");

  return (
    <AppShell
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      right={
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ type: "reset" })}
          className={`press hidden sm:inline-flex items-center justify-center h-10 px-3 border-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${
            busy
              ? "bg-bg-inset text-fg-dim border-fg-dim cursor-not-allowed"
              : "bg-bg-raised text-fg border-border"
          }`}
        >
          Reset session
        </button>
      }
      footer={
        <>
          {BRAND.name} — {BRAND.tagline}. Every action in this console runs the compiled
          Compact contract: asserts fire and public ledger state really changes.
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {error && (
          <ErrorNote title="Circuit rejected the call" onDismiss={clearError}>
            {error}
          </ErrorNote>
        )}

        {progress.phase !== "idle" && (
          <ProofProgressView
            progress={progress}
            title={pending ? `Circuit call — ${circuitLabel(pending)}` : "Circuit call"}
          />
        )}

        {loading && (
          <Panel>
            <Empty>Loading contract state…</Empty>
          </Panel>
        )}

        {!loading && snapshot && (
          <>
            {tab === "Walkthrough" && <DemoRunner onFinished={() => setTab("Explorer")} />}
            {tab === "Marketplace" && <Marketplace onHired={() => setTab("Buyer")} />}
            {tab === "Seller" && <SellerDashboard />}
            {tab === "Buyer" && <BuyerDashboard />}
            {tab === "Explorer" && <ExplorerPanel />}
            {tab === "Wallet" && (
              <div className="flex flex-col gap-4 max-w-md">
                <WalletPanel />
                <Note>
                  The wallet session is real: DApp Connector enumeration, unshielded address,
                  DUST balance and a proof-server health check. It is not what drives the tabs
                  above.
                </Note>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
