"use client";

// Nightjar — dapp chrome: mark, nav, network state, wallet.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/midnight";
import { DEFAULT_NETWORK } from "@/lib/midnight/config";
import { BRAND } from "@/lib/brand";
import { WalletPanel } from "./WalletPanel";
import { Pill, shortAddress } from "./market-ui";

/** A bird over a setting sun — the mark for a protocol named after a dusk hunter. */
export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="nj-ember" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#e6a75f" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f0bd7f" />
        </linearGradient>
      </defs>
      {/* the sun, most of the way down */}
      <path d="M5.6 18.2a6.4 6.4 0 0 1 12.8 0Z" fill="url(#nj-ember)" />
      {/* the horizon it is going behind */}
      <path
        d="M1.8 18.2h20.4"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* the bird, still up */}
      <path
        d="M4.8 8.6c2.2-2.8 4.4-2.9 5.5-1 1.1-1.9 3.3-1.8 5.5 1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 group">
      <Mark className="h-7 w-7 text-fg" />
      <div className="leading-none">
        <div className="font-display text-lg tracking-tight group-hover:text-accent transition-colors">
          {BRAND.name}
        </div>
        <div className="text-[10px] text-fg-dim mt-1 tracking-wide">{BRAND.tagline}</div>
      </div>
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
        className={`h-10 px-4 rounded-full border text-xs font-medium transition-colors ${
          status === "connected"
            ? "border-accent/30 bg-accent/10 text-accent font-mono"
            : "border-border-strong text-fg-muted hover:text-fg hover:border-fg-dim"
        }`}
      >
        {label}
      </button>
      {open && (
        <>
          {/* Click-away layer, so the panel closes like a real menu. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-20 w-[22rem]">
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
    <div className="min-h-screen flex-1 bg-bg bg-dusk">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-4">
          <Logo />

          <nav className="hidden md:flex items-center gap-0.5 p-1 rounded-xl bg-bg-inset/70 border border-border/70">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTab(t)}
                className={`px-4 h-8 rounded-lg text-xs font-medium transition-all ${
                  tab === t
                    ? "bg-accent/15 text-accent shadow-[0_0_0_1px_#e6a75f33]"
                    : "text-fg-dim hover:text-fg-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Pill>{DEFAULT_NETWORK}</Pill>
            {right}
            <WalletButton />
          </div>
        </div>

        {/* Mobile tabs */}
        <nav className="md:hidden border-t border-border/60 flex overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              className={`flex-1 min-w-[5rem] h-10 text-xs font-medium transition-colors ${
                tab === t ? "text-fg border-b-2 border-accent" : "text-fg-dim"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 animate-rise">{children}</main>

      {footer && (
        <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-fg-dim leading-relaxed border-t border-border/40 mt-10">
          {footer}
        </footer>
      )}
    </div>
  );
}
