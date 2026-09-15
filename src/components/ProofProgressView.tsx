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

/**
 * A ruled square, not a dot — and the running one blinks on a step function
 * rather than breathing. Two states, no in-between.
 *
 * Completed steps are filled in black, not in the private green they used to
 * borrow: "this step finished" is not a statement about who can see anything,
 * and the two reserved hues are not available for status.
 */
function Dot({ tone }: { tone: "done" | "active" | "idle" | "offpath" | "error" }) {
  const cls = {
    done: "bg-fg border-border",
    active: "bg-accent border-border animate-blink",
    error: "bg-danger border-border",
    offpath: "bg-bg-inset border-fg-dim",
    idle: "bg-bg-inset border-border",
  }[tone];
  return <span aria-hidden className={`mt-0.5 size-3 shrink-0 border-2 ${cls}`} />;
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

  const status = errored
    ? "failed"
    : done
      ? "circuit executed"
      : current === "idle"
        ? "ready"
        : current;

  return (
    <div className="border-2 border-border bg-bg-raised shadow-hard">
      <div
        className={`label flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-border ${
          errored ? "bg-danger text-bg" : "bg-fg text-bg"
        }`}
      >
        <span className="truncate">{title}</span>
        <span className="shrink-0">{status}</span>
      </div>

      <ol className="px-4 py-1">
        {LIVE_PHASES.map((phase, i) => {
          const reached = done || rank(current) > rank(phase);
          const active = current === phase;
          return (
            <li
              key={phase}
              className={`flex gap-3 items-start py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <Dot tone={errored && active ? "error" : reached ? "done" : active ? "active" : "idle"} />
              <div className="flex flex-col gap-1 min-w-0">
                <span className={`text-sm ${reached || active ? "text-fg" : "text-fg-dim"}`}>
                  {PHASE_NOTE[phase]}
                </span>
                {active && progress.message && (
                  <span className="font-mono text-[11px] text-fg-dim">{progress.message}</span>
                )}
              </div>
            </li>
          );
        })}

        {OFF_PATH_PHASES.map((phase) => (
          <li key={phase} className="flex gap-3 items-start py-2.5 border-t border-border">
            <Dot tone="offpath" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm text-fg-dim">{PHASE_NOTE[phase]}</span>
              <span className="font-mono text-[11px] text-fg-dim">{OFF_PATH}</span>
            </div>
          </li>
        ))}
      </ol>

      {progress.error && (
        <p className="border-t-2 border-border bg-danger text-bg font-mono text-xs leading-relaxed px-4 py-3">
          {progress.error}
        </p>
      )}

      <p className="border-t-2 border-border px-4 py-3 font-mono text-[11px] text-fg-dim leading-relaxed [&_code]:bg-bg-inset [&_code]:px-1">
        The two live steps run the compiled circuit in process: asserts fire and public ledger
        state really changes. No ZK proof is generated here and nothing is submitted on chain —{" "}
        <code>npm run test:prove</code> does that part against a real proof server.
      </p>
    </div>
  );
}
