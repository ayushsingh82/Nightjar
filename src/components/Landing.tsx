// Nightjar — the front door.
//
// A judge lands here before they land anywhere else, so this page has one job:
// say what the thing is, show that the numbers on it are measured rather than
// claimed, and get out of the way. The console is one click from the top.

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Mark } from "./AppShell";

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

export function Landing() {
  return (
    <div className="flex-1 bg-bg bg-dusk">
      <header className="mx-auto max-w-5xl px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mark className="h-7 w-7 text-fg" />
          <span className="font-display text-lg tracking-tight">{BRAND.name}</span>
        </div>
        <Link
          href="/console"
          className="h-10 px-5 rounded-full border border-border-strong text-sm text-fg-muted hover:text-fg hover:border-fg-dim transition-colors flex items-center"
        >
          Open the console
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-20 animate-rise">
        <p className="text-xs uppercase tracking-[0.18em] text-fg-dim">
          Built on Midnight · Compact 0.23
        </p>
        <h1 className="font-display text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.05] mt-5 max-w-3xl">
          {BRAND.promise}
        </h1>
        <p className="mt-6 text-fg-muted text-lg leading-relaxed max-w-2xl">
          Agents hire and pay each other. Their track record is the asset — and publishing it
          hands every client, price and outcome to a competitor. Nightjar keeps the record on
          the device and puts a zero-knowledge proof about it on the wire instead.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/console"
            className="h-12 px-7 rounded-full bg-accent text-[#0d0b0a] font-semibold text-sm flex items-center hover:brightness-110 transition-all"
          >
            Open the console
          </Link>
          <span className="text-xs text-fg-dim max-w-xs leading-relaxed">
            Runs the marketplace, both dashboards and the chain-vs-private explorer against
            the compiled contract.
          </span>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="rule-fade" />
      </div>

      {/* Measured facts */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {FACTS.map((f) => (
            <div
              key={f.label}
              className="rounded-2xl border border-border/70 bg-bg-raised/50 px-6 py-6"
            >
              <div className="font-display text-4xl text-accent tnum">{f.value}</div>
              <div className="mt-3 text-sm text-fg">{f.label}</div>
              <div className="mt-1 text-xs text-fg-dim">{f.sub}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-fg-dim leading-relaxed max-w-2xl">
          These are timings from{" "}
          <code className="font-mono text-fg-muted">npm run test:prove</code>, which assembles
          real transactions and proves them against a{" "}
          <code className="font-mono text-fg-muted">midnight-proof-server</code> container. No
          part of this page is an estimate.
        </p>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h2 className="font-display text-3xl">How it works</h2>
        <div className="mt-8 grid gap-px bg-border/60 rounded-2xl overflow-hidden border border-border/60">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="bg-bg-raised/70 px-6 py-6 grid gap-4 sm:grid-cols-[3rem_1fr_auto] items-start"
            >
              <span className="font-mono text-xs text-fg-dim pt-1">{s.n}</span>
              <div>
                <h3 className="text-fg">{s.title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted leading-relaxed max-w-2xl">{s.body}</p>
              </div>
              <span
                className={`justify-self-start sm:justify-self-end shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  s.tone === "private"
                    ? "bg-private/10 text-private"
                    : "bg-public/10 text-public"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s.tone === "private" ? "bg-private" : "bg-public"
                  }`}
                />
                {s.tone === "private" ? "Device only" : "On-chain"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* The honest bit */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-2xl border border-border/70 bg-bg-inset/50 px-6 py-6">
          <h2 className="font-display text-xl">What is real, and what is not</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-fg-muted leading-relaxed">
            <li>
              <span className="text-private">Real:</span> the Compact contract, its ten
              circuits and their verifier keys; transaction assembly against the compiled
              contract; proving against a proof server; the wallet session.
            </li>
            <li>
              <span className="text-public">Real, in process:</span> every circuit call the
              console makes. Asserts fire and public ledger state actually changes — the
              explorer reads it back byte for byte.
            </li>
            <li>
              <span className="text-fg-dim">Not yet:</span> submission to a live network.
              Balancing and submission need a funded wallet in a browser, and there is no
              headless wallet for this stack to automate it.
            </li>
          </ul>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-10 border-t border-border/40 text-xs text-fg-dim">
        {BRAND.name} — {BRAND.tagline}. Built for the Midnight Buildathon.
      </footer>
    </div>
  );
}
