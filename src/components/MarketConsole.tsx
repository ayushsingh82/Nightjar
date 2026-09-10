"use client";

// Nightjar — the console that hosts the four product surfaces plus the demo.
//
// One `MarketProvider` for all tabs, so the marketplace, the dashboards and the
// explorer are all looking at the same contract state at the same moment —
// which is the point: hire on the badge in one tab, then read the ledger in
// another and see that it says nothing about why.

import { useState } from "react";
import { MarketProvider, circuitLabel, useMarket } from "@/lib/midnight";
import { AppShell } from "./AppShell";
import { BuyerDashboard } from "./BuyerDashboard";
import { DemoRunner } from "./DemoRunner";
import { ExplorerPanel } from "./ExplorerPanel";
import { Marketplace } from "./Marketplace";
import { ProofProgressView } from "./ProofProgressView";
import { SellerDashboard } from "./SellerDashboard";
import { WalletPanel } from "./WalletPanel";
import { Empty, ErrorNote, Note, Panel } from "./market-ui";

const TABS = ["Demo", "Marketplace", "Seller", "Buyer", "Explorer", "Wallet"] as const;
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
  const [tab, setTab] = useState<Tab>("Demo");

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
          className="hidden sm:flex items-center justify-center h-10 px-4 rounded-full border border-border-strong text-xs font-medium text-fg-muted hover:text-fg hover:border-fg-dim transition-colors disabled:opacity-40"
        >
          Reset session
        </button>
      }
      footer={
        <>
          Every circuit call in this console runs the compiled Compact contract in process:
          asserts fire and public ledger state really changes. Proving is exercised separately
          against a real proof server —{" "}
          <code className="font-mono">npm run proof-server:up && npm run test:prove</code>.
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ExecutionNotice />

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
            {tab === "Demo" && <DemoRunner onFinished={() => setTab("Explorer")} />}
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
                  above — see the execution notice.
                </Note>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * What is actually executing, stated at the top of every tab. A demo that
 * overstates itself is worth less than one that does not, so this is deliberately
 * the first thing on the page.
 */
function ExecutionNotice() {
  const { snapshot } = useMarket();
  const [open, setOpen] = useState(false);
  if (!snapshot) return null;
  const { execution } = snapshot;

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.05] px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <span className="text-sm">
          <span className="text-accent font-medium">How this runs: {execution.mode}.</span>{" "}
          <span className="text-fg-muted">{execution.source}</span>
        </span>
        <span className="text-xs text-fg-dim shrink-0 pt-0.5">{open ? "hide" : "details"}</span>
      </button>
      {open && (
        <ul className="mt-3 flex flex-col gap-2 text-xs text-fg-muted leading-relaxed border-t border-accent/20 pt-3">
          {execution.caveats.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-fg-dim shrink-0">—</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
