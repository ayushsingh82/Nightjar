"use client";

// agent-commerce — shared presentation bits for the marketplace, dashboards and
// explorer. Same visual language as WalletPanel (rounded-xl / border-black-10 /
// zinc text), kept in one place so the panels stay consistent.

import type { ReactNode } from "react";
import type { BadgeVerdict } from "@/lib/midnight";

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-black/10 dark:border-white/15 p-5 text-sm flex flex-col gap-3 ${className}`}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-medium">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-right min-w-0 truncate">{children}</span>
    </div>
  );
}

/** Truncated hex with the full value on hover — agent ids and commitments are 32 bytes. */
export function Hex({ value, chars = 10 }: { value: string; chars?: number }) {
  return (
    <code className="font-mono text-xs" title={value}>
      {value.length > chars ? `${value.slice(0, chars)}…` : value}
    </code>
  );
}

export function money(value: string | bigint): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  return `$${n.toLocaleString("en-US")}`;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const base = "h-9 px-4 rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed";
  const skin =
    variant === "primary"
      ? "bg-foreground text-background"
      : variant === "danger"
        ? "border border-red-600/40 text-red-700 dark:text-red-400"
        : "border border-black/10 dark:border-white/15";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${skin}`}>
      {children}
    </button>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      {label}
      <span className="flex items-center gap-1">
        <input
          value={value}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-full h-9 px-3 rounded-lg border border-black/10 dark:border-white/15 bg-transparent text-sm text-foreground"
        />
        {suffix && <span className="text-xs">{suffix}</span>}
      </span>
    </label>
  );
}

/**
 * The badge. Its text comes from `badgeVerdict`, which can only see the
 * thresholds the circuit was actually given — see src/lib/midnight/badge.ts.
 */
export function BadgePill({ verdict }: { verdict: BadgeVerdict }) {
  if (verdict.kind === "none") {
    return (
      <span className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 px-3 py-1 text-xs text-zinc-500">
        No reputation proof published
      </span>
    );
  }
  if (verdict.kind === "failed") {
    return (
      <span
        className="inline-flex items-center rounded-full border border-red-600/40 px-3 py-1 text-xs text-red-700 dark:text-red-400"
        title="proveReputation returned false for these thresholds"
      >
        Unproven at {verdict.label}
      </span>
    );
  }
  if (verdict.kind === "stale") {
    return (
      <span
        className="inline-flex items-center rounded-full border border-amber-500/50 px-3 py-1 text-xs text-amber-700 dark:text-amber-500"
        title="The ledger changed after this proof; the on-chain commitment no longer matches."
      >
        Stale · {verdict.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-600/40 bg-green-600/10 px-3 py-1 text-xs text-green-700 dark:text-green-400">
      <span aria-hidden>✓</span> Verified: {verdict.label}
    </span>
  );
}

export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" }) {
  return (
    <p
      className={`text-xs border-t border-black/10 dark:border-white/15 pt-2 ${
        tone === "warn" ? "text-amber-700 dark:text-amber-500" : "text-zinc-500"
      }`}
    >
      {children}
    </p>
  );
}
