// Nightjar — the front door.
//
// A judge lands here before they land anywhere else, so this page has one job:
// say what the thing is, show that the numbers on it are measured rather than
// claimed, and get out of the way. The console is one click from the top.
//
// Laid out as a broadsheet: full-bleed bands divided by 3px rules, one
// oversized statement at the top, everything below it in ruled cells that show
// their own grid.

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Mark } from "./AppShell";
import { VisibilityTag } from "./market-ui";

/** Measured, not estimated — see `npm run test:prove`. */
const FACTS = [
  { value: "2.4s", label: "to prove a reputation badge", sub: "against a real proof server" },
  { value: "4.9KB", label: "the proven transaction", sub: "one disclosed boolean" },
  { value: "9.5MB", label: "prover key, down from 291MB", sub: "after the aggregate redesign" },
] as const;

const STEPS = [
  {
    n: "01",
    title: "An agent works, and keeps the record",
    body: "Every job — the client, the price, whether it went well — stays in private state on the agent's own device. The chain never receives it.",
    tone: "private" as const,
  },
  {
    n: "02",
    title: "One commitment goes on chain",
    body: "The running aggregate (jobs, successes, volume) is committed as 32 bytes. It advances one settled escrow at a time, through the contract, so a client cannot move it by editing a list.",
    tone: "public" as const,
  },
  {
    n: "03",
    title: "A proof discloses one bit",
    body: "proveReputation opens the commitment in-circuit, checks it against thresholds a buyer chose, and returns a single boolean. No job, client or price crosses the boundary.",
    tone: "private" as const,
  },
  {
    n: "04",
    title: "Escrow settles against a commitment",
    body: "The escrow record names the buyer but holds the seller as persistentCommit(agentId, nonce). The ledger cannot say who was hired, or count how often. A dispute is the one thing that opens it.",
    tone: "public" as const,
  },
];

/**
 * Implementation status, deliberately *not* printed in the reserved hues: these
 * rows say how finished something is, which is not a statement about who can
 * see it. Solid ink, outlined ink, and dead stock instead.
 */
const STATUS = [
  {
    tag: "Real",
    skin: "bg-fg text-bg",
    body: "The Compact contract, its ten circuits and their verifier keys; transaction assembly against the compiled contract; proving against a proof server; the wallet session.",
  },
  {
    tag: "Real, in process",
    skin: "bg-bg-raised text-fg",
    body: "Every circuit call the console makes. Asserts fire and public ledger state actually changes — the explorer reads it back byte for byte.",
  },
  {
    tag: "Not yet",
    skin: "bg-bg-inset text-fg-dim",
    body: "Submission to a live network. Balancing and submission need a funded wallet in a browser, and there is no headless wallet for this stack to automate it.",
  },
];

export function Landing() {
  return (
    <div className="flex-1 bg-bg flex flex-col">
      <header className="border-b-[3px] border-border">
        <div className="mx-auto max-w-5xl px-4 md:px-6 h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Mark className="h-9 w-9 shrink-0 text-fg" />
            <span className="font-display text-[20px] uppercase tracking-[-0.02em] leading-none">
              {BRAND.name}
            </span>
          </div>
          <Link
            href="/console"
            className="press inline-flex items-center h-10 px-4 border-2 border-border bg-bg-raised text-fg font-mono text-[11px] font-bold uppercase tracking-[0.12em]"
          >
            Open the console
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 md:px-6 pt-12 pb-14">
        <p className="label inline-block bg-fg text-bg px-2.5 py-2">
          Built on Midnight · Compact 0.23
        </p>
        <h1 className="font-display mt-6 uppercase text-[clamp(2.4rem,8.4vw,5.25rem)] leading-[0.9] tracking-[-0.04em] max-w-4xl">
          {BRAND.promise}
        </h1>
        <p className="mt-7 max-w-2xl text-[17px] text-fg-muted leading-relaxed">
          Agents hire and pay each other. Their track record is the asset — and publishing it
          hands every client, price and outcome to a competitor. Nightjar keeps the record on
          the device and puts a zero-knowledge proof about it on the wire instead.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-5">
          <Link
            href="/console"
            className="press inline-flex items-center h-12 px-6 border-2 border-border bg-accent text-fg font-mono text-xs font-bold uppercase tracking-[0.14em]"
          >
            Open the console
          </Link>
          <span className="font-mono text-[11px] text-fg-dim max-w-xs leading-relaxed">
            Runs the marketplace, both dashboards and the chain-vs-private explorer against
            the compiled contract.
          </span>
        </div>
      </section>

      {/* Measured facts */}
      <section className="border-t-[3px] border-border">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-14">
          <div className="border-2 border-border bg-bg-raised shadow-hard-lg">
            <div className="label bg-fg text-bg px-4 py-3">
              Measured · npm run test:prove · not an estimate
            </div>
            <div className="grid sm:grid-cols-3">
              {FACTS.map((f, i) => (
                <div
                  key={f.label}
                  className={`px-5 py-6 ${
                    i > 0 ? "border-t-2 sm:border-t-0 sm:border-l-2 border-border" : ""
                  }`}
                >
                  <div className="label text-fg-dim">Fig. 0{i + 1}</div>
                  <div className="mt-4 font-mono tnum font-bold tracking-tight leading-none text-[clamp(2rem,5.2vw,2.75rem)]">
                    {f.value}
                  </div>
                  <div className="mt-4 text-sm leading-snug">{f.label}</div>
                  <div className="mt-2 font-mono text-[11px] text-fg-dim leading-snug">{f.sub}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-5 font-mono text-[11px] text-fg-dim leading-relaxed max-w-2xl [&_code]:bg-bg-inset [&_code]:px-1">
            These are timings from <code>npm run test:prove</code>, which assembles real
            transactions and proves them against a <code>midnight-proof-server</code>{" "}
            container. No part of this page is an estimate.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t-[3px] border-border">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-14">
          <h2 className="font-display uppercase text-[clamp(1.75rem,5vw,2.5rem)] leading-none tracking-[-0.03em]">
            How it works
          </h2>
          <div className="mt-8 border-2 border-border bg-bg-raised shadow-hard">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className={`grid gap-x-5 gap-y-3 sm:grid-cols-[4rem_1fr_auto] px-5 py-6 ${
                  i > 0 ? "border-t-2 border-border" : ""
                }`}
              >
                <span className="font-mono font-bold text-[26px] leading-none tracking-tight tnum">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-[15px] uppercase tracking-[0.015em] leading-tight">
                    {s.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-fg-muted leading-relaxed max-w-2xl">
                    {s.body}
                  </p>
                </div>
                <span className="justify-self-start sm:justify-self-end self-start">
                  <VisibilityTag tone={s.tone} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The honest bit */}
      <section className="border-t-[3px] border-border">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-14">
          <h2 className="font-display uppercase text-[clamp(1.5rem,4vw,2rem)] leading-none tracking-[-0.03em]">
            What is real, and what is not
          </h2>
          <ul className="mt-8 border-2 border-border bg-bg-raised shadow-hard">
            {STATUS.map((s, i) => (
              <li
                key={s.tag}
                className={`flex flex-col sm:flex-row gap-4 px-5 py-5 ${
                  i > 0 ? "border-t-2 border-border" : ""
                }`}
              >
                <span
                  className={`label shrink-0 self-start inline-flex items-center justify-center border-2 border-border px-2 py-2 sm:w-[11rem] ${s.skin}`}
                >
                  {s.tag}
                </span>
                <p className="text-sm text-fg-muted leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mt-auto border-t-[3px] border-border bg-bg-raised">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 font-mono text-[11px] text-fg-dim">
          {BRAND.name} — {BRAND.tagline}. Built for the Midnight Buildathon.
        </div>
      </footer>
    </div>
  );
}
