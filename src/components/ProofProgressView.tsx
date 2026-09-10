"use client";

// Nightjar — the render half of the `ProofProgress` primitives in
// `src/lib/midnight/proof-server.ts`. It renders the whole
// `build → prove → pay fees → submit → confirm` pipeline, including the phases
// this console does not reach, so the UI never implies a chain write that did
// not happen.

import type { ProofPhase, ProofProgress } from "@/lib/midnight";

/** Phases the in-process console actually executes. */
const LIVE_PHASES: ProofPhase[] = ["building", "proving"];

/** Phases `live.ts` implements but the console does not drive — see `OFF_PATH`. */
const OFF_PATH_PHASES: ProofPhase[] = ["balancing", "submitting", "confirming"];

// Deliberately not `PHASE_LABELS`: that copy promises a ZK proof and a network
// round-trip. These say what each step is, and the off-path ones say why.
const PHASE_NOTE: Record<string, string> = {
  building: "Assemble circuit inputs",
  proving: "Execute the compiled circuit",
  balancing: "Pay DUST fees (wallet balances the tx)",
  submitting: "Relay to the network",
  confirming: "Poll the indexer for the new state",
};

// The honest version of what used to say "blocked". Assembly and proving are
// implemented and tested (`tx-assembler.ts`, `npm run test:prove`); what is
// missing is a funded wallet, and there is no headless one for this stack.
const OFF_PATH =
  "implemented in live.ts — needs a funded wallet in a browser, which this console does not drive";

function rank(phase: ProofPhase): number {
  const order: ProofPhase[] = ["idle", ...LIVE_PHASES, ...OFF_PATH_PHASES, "done"];
  return order.indexOf(phase);
}

function Dot({ tone }: { tone: "done" | "active" | "idle" | "offpath" | "error" }) {
  const cls = {
    done: "bg-private",
    active: "bg-accent animate-breathe",
    error: "bg-danger",
    offpath: "bg-fg-dim/40",
    idle: "bg-border-strong",
  }[tone];
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
    <div className="rounded-2xl border border-border bg-bg-raised/70 px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-[15px]">{title}</span>
        <span
          className={`text-xs font-mono ${
            errored
              ? "text-danger"
              : done
                ? "text-private"
                : current === "idle"
                  ? "text-fg-dim"
                  : "text-accent"
          }`}
        >
          {errored ? "failed" : done ? "circuit executed" : current === "idle" ? "ready" : current}
        </span>
      </div>

      <ol className="flex flex-col gap-2">
        {LIVE_PHASES.map((phase) => {
          const reached = done || rank(current) > rank(phase);
          const active = current === phase;
          return (
            <li key={phase} className="flex gap-2.5 items-start">
              <Dot tone={errored && active ? "error" : reached ? "done" : active ? "active" : "idle"} />
              <div className="flex flex-col">
                <span className={`text-sm ${reached || active ? "text-fg" : "text-fg-dim"}`}>
                  {PHASE_NOTE[phase]}
                </span>
                {active && progress.message && (
                  <span className="text-xs text-fg-dim">{progress.message}</span>
                )}
              </div>
            </li>
          );
        })}

        {OFF_PATH_PHASES.map((phase) => (
          <li key={phase} className="flex gap-2.5 items-start">
            <Dot tone="offpath" />
            <div className="flex flex-col">
              <span className="text-sm text-fg-dim">{PHASE_NOTE[phase]}</span>
              <span className="text-xs text-fg-dim/80">{OFF_PATH}</span>
            </div>
          </li>
        ))}
      </ol>

      {progress.error && (
        <p className="text-sm text-danger border-t border-border/60 pt-2">{progress.error}</p>
      )}

      <p className="text-xs text-fg-dim leading-relaxed border-t border-border/60 pt-2">
        The two live steps run the compiled circuit in process: asserts fire and public ledger
        state really changes. No ZK proof is generated here and nothing is submitted on chain —{" "}
        <code className="font-mono">npm run test:prove</code> does that part against a real
        proof server.
      </p>
    </div>
  );
}
