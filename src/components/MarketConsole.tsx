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
          Every circuit call in this console runs the compiled Compact contract in process:
          asserts fire and public ledger state really changes. Proving is exercised separately
          against a real proof server — <code>npm run proof-server:up && npm run test:prove</code>.
        </>
      }
    >
      <div className="flex flex-col gap-6">
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
 * the first thing on the page — and it is printed in black rather than in the
 * brand colour, because the brand is not allowed to make a claim.
 */
function ExecutionNotice() {
  const { snapshot } = useMarket();
  const [open, setOpen] = useState(false);
  if (!snapshot) return null;
  const { execution } = snapshot;

  return (
    <div className="border-2 border-border bg-bg-raised shadow-hard">
      <div className="label bg-fg text-bg px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <span>How this runs</span>
        <span>{execution.mode}</span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 text-left px-4 py-4 hover:bg-bg-hover"
      >
        <span className="text-sm text-fg-muted leading-relaxed">{execution.source}</span>
        <span className="label shrink-0 border-2 border-border px-2 py-1.5 text-fg">
          {open ? "Hide" : "Details"}
        </span>
      </button>
      {open && (
        <ul className="border-t-2 border-border px-4 py-4 flex flex-col gap-3 text-xs text-fg-muted leading-relaxed">
          {execution.caveats.map((c) => (
            <li key={c} className="flex gap-3">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-fg" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
