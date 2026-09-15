"use client";

// Nightjar — the demo script (plan.md §6), runnable from the UI.
//
// Each step is a real circuit call; the runner threads the snapshot from one
// step into the next, so the escrow ids it acts on are the opaque ids the
// contract actually stored. If a circuit assert fires the run stops there and
// the message is shown verbatim.

import { useState } from "react";
import { DEMO_BADGE_THRESHOLDS, useMarket, type MarketAction, type MarketSnapshot } from "@/lib/midnight";
import { Button, Note, Panel } from "./market-ui";

type Step = {
  title: string;
  note: string;
  build: (snap: MarketSnapshot | null) => MarketAction;
};

function agentId(snap: MarketSnapshot | null, key: string): string {
  return snap?.agents.find((a) => a.key === key)?.agentId ?? "";
}

/** The escrow this seller is currently on, as the contract records it. */
function openEscrowFor(snap: MarketSnapshot | null, sellerKey: string): string {
  const seller = agentId(snap, sellerKey);
  const escrow = snap?.chain.escrows.find(
    (e) => e.seller === seller && e.state !== "RELEASED" && e.state !== "SLASHED",
  );
  if (!escrow) throw new Error(`no open escrow for ${sellerKey}`);
  return escrow.escrowId;
}

const badge = {
  minJobs: DEMO_BADGE_THRESHOLDS.minJobs.toString(),
  minRateBps: DEMO_BADGE_THRESHOLDS.minRateBps.toString(),
  minVolume: DEMO_BADGE_THRESHOLDS.minVolume.toString(),
};

const STEPS: Step[] = [
  {
    title: "Deploy a fresh contract",
    note: "constructor fixes the arbiter key; ledger starts empty",
    build: () => ({ type: "reset" }),
  },
  {
    title: "Seed the agents",
    note: "Both sellers *earn* their history: earnHistory() runs 55 real escrows for Atlas and 9 for Nomad, each one a genuine open → deliver → release and a genuine updateReputation. Nothing is handed to them.",
    build: () => ({ type: "seed" }),
  },
  {
    title: "Atlas proves the badge",
    note: "proveReputation(≥50 jobs, ≥95%, ≥$10k) → true. No public state changes.",
    build: () => ({ type: "proveReputation", agent: "atlas", ...badge }),
  },
  {
    title: "Nomad tries the same thresholds",
    note: "→ false. A 9-job ledger cannot claim 50 jobs, and there is no way to display one.",
    build: () => ({ type: "proveReputation", agent: "nomad", ...badge }),
  },
  {
    title: "Orion hires Atlas on the badge alone",
    note: "openEscrow with a 32-byte CSPRNG escrow id, funded at 2,500",
    build: () => ({ type: "hire", buyer: "orion", seller: "atlas", amount: "2500" }),
  },
  {
    title: "Atlas delivers",
    note: "markDelivered — the circuit asserts the caller is the seller",
    build: (snap) => ({ type: "markDelivered", escrowId: openEscrowFor(snap, "atlas") }),
  },
  {
    title: "Orion releases the funds",
    note: "release → both private ledgers gain a row and Atlas re-commits, which strands the old badge",
    build: (snap) => ({ type: "release", escrowId: openEscrowFor(snap, "atlas") }),
  },
  {
    title: "Atlas re-proves against the new commitment",
    note: "the badge is only ever as current as the commitment it was checked against",
    build: () => ({ type: "proveReputation", agent: "atlas", ...badge }),
  },
  {
    title: "Orion hires Nomad, and it goes wrong",
    note: "a second escrow at 500, delivered then disputed",
    build: () => ({ type: "hire", buyer: "orion", seller: "nomad", amount: "500" }),
  },
  {
    title: "Nomad delivers",
    note: "markDelivered",
    build: (snap) => ({ type: "markDelivered", escrowId: openEscrowFor(snap, "nomad") }),
  },
  {
    title: "Orion disputes",
    note: "dispute — buyer-only",
    build: (snap) => ({ type: "dispute", escrowId: openEscrowFor(snap, "nomad") }),
  },
  {
    title: "The arbiter slashes the bond",
    note: "resolveDispute(sellerAtFault) — bond down by the escrow amount, slashedTotal up, and the failed job lands only in Nomad's private ledger",
    build: (snap) => ({
      type: "resolveDispute",
      escrowId: openEscrowFor(snap, "nomad"),
      sellerAtFault: true,
    }),
  },
];

export function DemoRunner({ onFinished }: { onFinished?: () => void }) {
  const { snapshot, busy, run, error } = useMarket();
  const [cursor, setCursor] = useState(-1);
  const [failed, setFailed] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    setFailed(null);
    let current = snapshot;
    for (let i = 0; i < STEPS.length; i++) {
      setCursor(i);
      let action: MarketAction;
      try {
        action = STEPS[i].build(current);
      } catch {
        setFailed(i);
        break;
      }
      const next = await run(action);
      if (!next) {
        setFailed(i);
        break;
      }
      current = next;
    }
    setRunning(false);
    onFinished?.();
  }

  return (
    <Panel
      title="Demo script"
      subtitle="badge → hire → escrow → deliver → release, then a dispute → slash"
      right={
        <Button disabled={busy || running} onClick={() => void runAll()}>
          {running ? "Running…" : "Run the demo"}
        </Button>
      }
    >
      <ol className="border-2 border-border">
        {STEPS.map((step, i) => {
          const state =
            failed === i ? "failed" : i < cursor || (i === cursor && !running) ? "done" : i === cursor ? "active" : "idle";
          // Black is "done", signal orange is "running", red is "stopped here".
          // The two reserved hues are not available for run state.
          const marker = {
            done: "bg-fg text-bg",
            active: "bg-accent text-fg animate-blink",
            failed: "bg-danger text-bg",
            idle: "bg-bg-inset text-fg-dim",
          }[state];
          return (
            <li
              key={step.title}
              className={`flex gap-3 items-start px-3.5 py-3 ${
                i > 0 ? "border-t border-border" : ""
              } ${state === "active" ? "bg-bg-inset" : ""}`}
            >
              <span
                className={`label mt-0.5 size-6 shrink-0 border-2 border-border flex items-center justify-center ${marker}`}
              >
                {state === "done" ? "\u2713" : state === "failed" ? "!" : i + 1}
              </span>
              <div className="flex flex-col gap-1 min-w-0">
                <span className={`text-sm ${state === "idle" ? "text-fg-dim" : "text-fg"}`}>
                  {step.title}
                </span>
                <span className="font-mono text-[11px] text-fg-dim leading-relaxed">
                  {step.note}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {failed !== null && error && <Note tone="warn">Stopped at step {failed + 1}: {error}</Note>}
      <Note>
        Every step above executes the compiled circuit against real contract state. Open the
        Explorer tab afterwards — the numbers there are read back from that state, not from
        this list.
      </Note>
    </Panel>
  );
}
