"use client";

// agent-commerce — the render half of the `ProofProgress` primitives in
// `src/lib/midnight/proof-server.ts` (the "render component still TODO" in
// pending.md). It renders the whole `prove → pay fees → submit → confirm`
// pipeline, including the phases this build cannot reach, so the UI never
// implies a chain write that did not happen.

import type { ProofPhase, ProofProgress } from "@/lib/midnight";

/** Phases this build actually executes. */
const LIVE_PHASES: ProofPhase[] = ["building", "proving"];

/** Phases `submit.ts` implements but cannot run — see `blockedReason`. */
const BLOCKED_PHASES: ProofPhase[] = ["balancing", "submitting", "confirming"];

// Deliberately not `PHASE_LABELS`: that copy promises a ZK proof and a network
// round-trip. These say what each step is, and the blocked ones say why.
const PHASE_NOTE: Record<string, string> = {
  building: "Assemble circuit inputs",
  proving: "Execute the compiled circuit",
  balancing: "Pay DUST fees (wallet balances the tx)",
  submitting: "Relay to the network",
  confirming: "Poll the indexer for the new state",
};

const BLOCKED_REASON =
  "blocked — TxAssembler: midnight-js-contracts 4.1.1 pins compact-runtime 0.16 against this repo's 0.19";

function rank(phase: ProofPhase): number {
  const order: ProofPhase[] = ["idle", ...LIVE_PHASES, ...BLOCKED_PHASES, "done"];
  return order.indexOf(phase);
}

function Dot({ tone }: { tone: "done" | "active" | "idle" | "blocked" | "error" }) {
  const cls =
    tone === "done"
      ? "bg-green-600"
      : tone === "active"
        ? "bg-blue-600 animate-pulse"
        : tone === "error"
          ? "bg-red-600"
          : tone === "blocked"
            ? "bg-amber-500/60"
            : "bg-zinc-300 dark:bg-zinc-700";
  return <span className={`mt-1.5 size-2 shrink-0 rounded-full ${cls}`} />;
}

export function ProofProgressView({
  progress,
  title = "Circuit call",
}: {
  progress: ProofProgress;
  title?: string;
}) {
  const current = progress.phase;
  const done = current === "done";
  const errored = current === "error";

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/15 p-4 text-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span
          className={
            errored ? "text-red-600" : done ? "text-green-600" : current === "idle" ? "text-zinc-500" : "text-blue-600"
          }
        >
          {errored ? "failed" : done ? "circuit executed" : current === "idle" ? "ready" : current}
        </span>
      </div>

      <ol className="flex flex-col gap-2">
        {LIVE_PHASES.map((phase) => {
          const reached = done || rank(current) > rank(phase);
          const active = current === phase;
          return (
            <li key={phase} className="flex gap-2 items-start">
              <Dot tone={errored && active ? "error" : reached ? "done" : active ? "active" : "idle"} />
              <div className="flex flex-col">
                <span className={reached || active ? "" : "text-zinc-500"}>{PHASE_NOTE[phase]}</span>
                {active && progress.message && (
                  <span className="text-xs text-zinc-500">{progress.message}</span>
                )}
              </div>
            </li>
          );
        })}

        {BLOCKED_PHASES.map((phase) => (
          <li key={phase} className="flex gap-2 items-start">
            <Dot tone="blocked" />
            <div className="flex flex-col">
              <span className="text-zinc-500 line-through decoration-zinc-400/60">{PHASE_NOTE[phase]}</span>
              <span className="text-xs text-amber-700 dark:text-amber-500">{BLOCKED_REASON}</span>
            </div>
          </li>
        ))}
      </ol>

      {progress.error && (
        <p className="text-red-600 border-t border-black/10 dark:border-white/15 pt-2">
          {progress.error}
        </p>
      )}

      <p className="text-xs text-zinc-500 border-t border-black/10 dark:border-white/15 pt-2">
        The two live steps run the compiled circuit in process: asserts fire and public
        ledger state really changes. No ZK proof is generated and nothing is submitted on
        chain.
      </p>
    </div>
  );
}
