"use client";

// agent-commerce — the console that hosts §5's four surfaces plus the §6 demo.
//
// One `MarketProvider` for all tabs, so the marketplace, the dashboards and the
// explorer are all looking at the same contract state at the same moment —
// which is the point: hire on the badge in one tab, then read the ledger in
// another and see that it says nothing about why.

import { useState } from "react";
import { MarketProvider, circuitLabel, useMarket } from "@/lib/midnight";
import { BuyerDashboard } from "./BuyerDashboard";
import { DemoRunner } from "./DemoRunner";
import { ExplorerPanel } from "./ExplorerPanel";
import { Marketplace } from "./Marketplace";
import { ProofProgressView } from "./ProofProgressView";
import { SellerDashboard } from "./SellerDashboard";
import { WalletPanel } from "./WalletPanel";
import { Button, Note, Panel } from "./market-ui";

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
    <div className="w-full max-w-6xl mx-auto p-6 flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">agent-commerce console</h1>
          <p className="text-xs text-zinc-500">
            Private agent-to-agent commerce + reputation on Midnight
          </p>
        </div>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => run({ type: "reset" })}
        >
          Reset session
        </Button>
      </header>

      <nav className="flex gap-1 flex-wrap border-b border-black/10 dark:border-white/15">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 h-9 text-sm -mb-px border-b-2 ${
              t === tab
                ? "border-foreground"
                : "border-transparent text-zinc-500 hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <ExecutionNotice />

      {error && (
        <div className="rounded-xl border border-red-600/40 p-4 text-sm flex items-start justify-between gap-4">
          <div>
            <span className="font-medium text-red-700 dark:text-red-400">Circuit rejected the call</span>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">{error}</p>
          </div>
          <Button variant="ghost" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {progress.phase !== "idle" && (
        <ProofProgressView
          progress={progress}
          title={pending ? `Circuit call — ${circuitLabel(pending)}` : "Circuit call"}
        />
      )}

      {loading && <Panel><p className="text-zinc-500">Loading contract state…</p></Panel>}

      {!loading && snapshot && (
        <>
          {tab === "Demo" && <DemoRunner onFinished={() => setTab("Explorer")} />}
          {tab === "Marketplace" && <Marketplace onHired={() => setTab("Buyer")} />}
          {tab === "Seller" && <SellerDashboard />}
          {tab === "Buyer" && <BuyerDashboard />}
          {tab === "Explorer" && <ExplorerPanel />}
          {tab === "Wallet" && (
            <div className="flex flex-col gap-4 items-start">
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
  );
}

function ExecutionNotice() {
  const { snapshot } = useMarket();
  const [open, setOpen] = useState(false);
  if (!snapshot) return null;
  const { execution } = snapshot;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-start justify-between gap-4 text-left"
      >
        <span>
          <span className="font-medium">How this runs: {execution.mode}.</span>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">{execution.source}</span>
        </span>
        <span className="text-xs text-zinc-500 shrink-0">{open ? "hide" : "details"}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-400 border-t border-amber-500/30 pt-2">
          {execution.caveats.map((c) => (
            <li key={c}>— {c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
