"use client";

// Nightjar — dapp chrome: mark, nav, network state, wallet.
//
// The chrome is two stacked bands separated by hard rules, not a floating bar:
// identity on top, the tab strip under it, the page below that. Nothing is
// translucent and nothing is blurred, so the header is a printed masthead
// rather than glass over content.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/midnight";
import { DEFAULT_NETWORK } from "@/lib/midnight/config";
import { BRAND } from "@/lib/brand";
import { WalletPanel } from "./WalletPanel";
import { Pill, shortAddress } from "./market-ui";

/**
 * A bird over a setting sun, printed as a stamp: ruled frame, flat signal-orange
 * disc, square caps. No gradient — there is no light in this system to graduate.
 */
export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* the frame: the mark is stamped on, not floated over */}
      <rect x="1" y="1" width="22" height="22" stroke="currentColor" strokeWidth="2" />
      {/* the sun, most of the way down — one flat block of the brand colour */}
      <path d="M7 18a5 5 0 0 1 10 0Z" fill="var(--accent)" />
      {/* the horizon it is going behind */}
      <path d="M3.5 18h17" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      {/* The bird, still up. Drawn as two mitred chevrons rather than a curve:
          at 36px a 2.4px stroke swallows a shallow arc, and angles survive. */}
      <path
        d="M4.5 10.5 8.25 7 12 10 15.75 7 19.5 10.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 group min-w-0">
      <Mark className="h-9 w-9 shrink-0 text-fg" />
      <span className="min-w-0 leading-none">
        <span className="font-display block text-[20px] uppercase tracking-[-0.02em] leading-none group-hover:bg-accent">
          {BRAND.name}
        </span>
        <span className="label block mt-2 text-fg-dim truncate">{BRAND.tagline}</span>
      </span>
    </Link>
  );
}

function WalletButton() {
  const { status, address, availableWallets } = useWallet();
  const [open, setOpen] = useState(false);

  const label =
    status === "connected" && address
      ? shortAddress(address, 5)
      : status === "connecting"
        ? "Connecting…"
        : "Connect wallet";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={
          status === "connected"
            ? (address ?? "")
            : availableWallets.length === 0
              ? "No Midnight wallet extension detected — the console runs without one"
              : availableWallets.map((w) => w.name).join(", ")
        }
        // Connected is printed in solid black, not in the brand colour: a
        // connection state is a fact about the session, and the brand is not
        // allowed to state facts.
        className={`press h-10 px-3 border-2 border-border font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${
          status === "connected" ? "bg-fg text-bg" : "bg-bg-raised text-fg"
        }`}
      >
        {label}
      </button>
      {open && (
        <>
          {/* Click-away layer, so the panel closes like a real menu. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-3 z-20 w-[min(22rem,calc(100vw-2rem))]">
            <WalletPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell<T extends string>({
  tabs,
  tab,
  onTab,
  right,
  footer,
  children,
}: {
  tabs: readonly T[];
  tab: T;
  onTab: (t: T) => void;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex-1 bg-bg flex flex-col">
      <header className="sticky top-0 z-20 border-b-[3px] border-border bg-bg">
        <div className="mx-auto max-w-6xl px-4 md:px-6 h-[72px] flex items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Pill>{DEFAULT_NETWORK}</Pill>
            </span>
            {right}
            <WalletButton />
          </div>
        </div>

        {/* The tab strip is a full-width band of ruled cells — one row at every
            width, scrolling sideways rather than reflowing into a menu. */}
        <nav className="border-t-2 border-border bg-bg-raised">
          <div className="mx-auto max-w-6xl px-4 md:px-6 flex scroll-x">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={`h-11 shrink-0 px-5 border-r-2 border-border first:border-l-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${
                  tab === t ? "bg-accent text-fg" : "text-fg-dim hover:bg-bg-hover"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="w-full mx-auto max-w-6xl px-4 md:px-6 py-8">{children}</main>

      {footer && (
        <footer className="mt-auto border-t-[3px] border-border bg-bg-raised">
          <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 font-mono text-[11px] text-fg-dim leading-relaxed [&_code]:bg-bg-inset [&_code]:px-1">
            {footer}
          </div>
        </footer>
      )}
    </div>
  );
}
