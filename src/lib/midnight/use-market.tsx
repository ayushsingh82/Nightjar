"use client";

// Nightjar — React context for the market session (plan.md §5).
//
// Companion to `use-wallet.tsx`: same shape, different subject. The wallet hook
// owns the DApp Connector session; this one owns the contract session.
//
// Circuits cannot run in the browser — the generated contract loads its WASM
// through Node `fs` — so this hook is a thin client over `/api/market`, where
// `demo-market.ts` executes them. It is type-only coupled to that module
// (`import type` is erased), so nothing server-side reaches the bundle.
//
// Every mutation is driven through the owner's `runWithProgress` phase machine
// so the escrow and reputation flows render one progress component.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MarketAction, MarketSnapshot } from "./market-types";
import { runWithProgress, type ProofProgress } from "./proof-server";

const ENDPOINT = "/api/market";

export type MarketContextValue = {
  snapshot: MarketSnapshot | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  progress: ProofProgress;
  /** The action currently in flight, for labelling the progress panel. */
  pending: MarketAction | null;
  refresh: () => Promise<void>;
  run: (action: MarketAction) => Promise<MarketSnapshot | null>;
  clearError: () => void;
};

const MarketContext = createContext<MarketContextValue | null>(null);

export function circuitLabel(action: MarketAction): string {
  switch (action.type) {
    case "reset":
      return "constructor";
    case "seed":
      return "stakeBond + updateReputation";
    case "commitLedger":
      return "updateReputation";
    case "hire":
      return "openEscrow";
    default:
      return action.type;
  }
}

async function post(action: MarketAction): Promise<MarketSnapshot> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
    cache: "no-store",
  });
  const body = (await res.json()) as MarketSnapshot | { error: string };
  if (!res.ok) throw new Error("error" in body ? body.error : `market call failed (HTTP ${res.status})`);
  return body as MarketSnapshot;
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<MarketAction | null>(null);
  const [progress, setProgress] = useState<ProofProgress>({ phase: "idle" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error(`market read failed (HTTP ${res.status})`);
      setSnapshot((await res.json()) as MarketSnapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The contract session lives in the server process — an external system.
    // Pull the first snapshot from a callback, not from the effect body.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const run = useCallback(async (action: MarketAction): Promise<MarketSnapshot | null> => {
    setBusy(true);
    setError(null);
    setPending(action);
    let next: MarketSnapshot | null = null;
    try {
      await runWithProgress(
        [
          {
            phase: "building",
            run: async () => ({ message: `Assembling ${circuitLabel(action)} inputs` }),
          },
          {
            phase: "proving",
            run: async () => {
              next = await post(action);
              // Deliberately overrides PHASE_LABELS.proving: no proof is
              // generated here (see EXECUTION_NOTICE in demo-market.ts).
              return { message: "Circuit executed in-process — real ledger write, unproven" };
            },
          },
        ],
        setProgress,
      );
      if (next) setSnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
    return next;
  }, []);

  const value = useMemo<MarketContextValue>(
    () => ({
      snapshot,
      loading,
      busy,
      error,
      progress,
      pending,
      refresh,
      run,
      clearError: () => setError(null),
    }),
    [snapshot, loading, busy, error, progress, pending, refresh, run],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used inside <MarketProvider>");
  return ctx;
}
