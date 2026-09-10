"use client";

// Nightjar — shared UI primitives.
//
// One rule runs through all of it: mint means private (only this device knows),
// sky means public (the ledger knows). If a value is on screen in one of those
// two, it is telling you who can see it. Ember is the brand — focus rings, the
// wordmark, a primary action — and never carries meaning. Nothing else is
// coloured at all.

import type { ReactNode } from "react";
import type { BadgeVerdict } from "@/lib/midnight";

export type Tone = "neutral" | "private" | "public" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  private: "text-private",
  public: "text-public",
  danger: "text-danger",
};

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-border",
  private: "border-private/25",
  public: "border-public/25",
  danger: "border-danger/30",
};

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Panel({
  title,
  subtitle,
  right,
  tone = "neutral",
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border ${TONE_BORDER[tone]} bg-bg-raised/70 backdrop-blur-sm shadow-[0_1px_0_0_#ffffff08_inset,0_16px_40px_-24px_#00000080] ${className}`}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border/60">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[17px] leading-snug">{title}</h2>}
            {subtitle && (
              <p className="text-xs text-fg-dim mt-1.5 leading-relaxed max-w-prose">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className="p-6 flex flex-col gap-4 text-sm">{children}</div>
    </section>
  );
}

/** Labels a whole region as ledger-visible or device-only. */
export function VisibilityTag({ tone }: { tone: "private" | "public" }) {
  const isPrivate = tone === "private";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em] ${
        isPrivate ? "bg-private/10 text-private" : "bg-public/10 text-public"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isPrivate ? "bg-private" : "bg-public"}`} />
      {isPrivate ? "Device only" : "On-chain"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function Row({
  label,
  hint,
  tone = "neutral",
  children,
}: {
  label: ReactNode;
  hint?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-fg-dim shrink-0" title={hint}>
        {label}
      </span>
      <span
        className={`text-right min-w-0 truncate font-mono tnum ${
          tone === "neutral" ? "text-fg" : TONE_TEXT[tone]
        }`}
      >
        {children}
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-bg-inset/70 px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-wider text-fg-dim">{label}</div>
      <div
        className={`mt-1.5 text-[22px] font-mono tnum ${
          tone === "neutral" ? "text-fg" : TONE_TEXT[tone]
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-fg-dim leading-relaxed">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const styles: Record<Tone, string> = {
    neutral: "bg-white/[0.05] text-fg-muted border-border",
    private: "bg-private/10 text-private border-private/25",
    public: "bg-public/10 text-public border-public/25",
    danger: "bg-danger/10 text-danger border-danger/30",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * A hash the reader should recognise as opaque rather than parse. Always
 * monospace, always truncated — it is a pseudonym, not an identifier you look
 * things up by.
 */
export function Hex({
  value,
  chars = 10,
  tone = "public",
}: {
  value: string;
  chars?: number;
  tone?: Tone;
}) {
  return (
    <code className={`font-mono text-xs ${TONE_TEXT[tone]}`} title={value}>
      {value.length > chars ? `${value.slice(0, chars)}…` : value}
    </code>
  );
}

/** A value the ledger cannot see — rendered so it reads as withheld, not missing. */
export function Redacted({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-dim">
      <span className="font-mono text-xs tracking-widest select-none">▓▓▓▓▓▓</span>
      {children && <span className="text-xs">{children}</span>}
    </span>
  );
}

export function money(value: string | bigint): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  return `$${n.toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  title,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "private";
  type?: "button" | "submit";
  title?: string;
  full?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-[#0d0b0a] hover:brightness-110 font-semibold",
    private: "bg-private/12 text-private border border-private/25 hover:bg-private/20",
    ghost:
      "border border-border-strong text-fg-muted hover:text-fg hover:border-fg-dim hover:bg-bg-hover",
    danger: "border border-danger/35 text-danger hover:bg-danger/10",
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-10 px-5 rounded-full text-sm font-medium transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed ${styles} ${
        full ? "w-full" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  suffix,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  disabled?: boolean;
}) {
  const input = (
    <div className="relative">
      <input
        value={value}
        inputMode="numeric"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="w-full h-11 rounded-xl bg-bg-inset border border-border px-3.5 pr-12 font-mono tnum text-sm
                   text-fg outline-none focus:border-accent/60 transition-colors disabled:opacity-50"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-dim pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );

  if (!label) return input;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-dim">{label}</span>
      {input}
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  tone = "accent",
}: {
  options: Array<{ value: T; label: ReactNode; disabled?: boolean; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  tone?: "accent" | "private";
}) {
  const active =
    tone === "private"
      ? "bg-private/12 text-private shadow-[0_0_0_1px_#7ed0b033]"
      : "bg-accent/15 text-accent shadow-[0_0_0_1px_#e6a75f33]";
  return (
    <div className="inline-flex p-1 rounded-xl bg-bg-inset/70 border border-border/70 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={`px-3.5 h-8 rounded-lg text-xs font-medium transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
            value === o.value ? active : "text-fg-dim hover:text-fg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

/**
 * The badge. Its text comes from `badgeVerdict`, which can only see the
 * thresholds the circuit was actually given — see src/lib/midnight/badge.ts.
 */
export function BadgePill({ verdict }: { verdict: BadgeVerdict }) {
  if (verdict.kind === "none") {
    return (
      <span className="self-start inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-fg-dim">
        No reputation proof published
      </span>
    );
  }
  if (verdict.kind === "failed") {
    return (
      <span
        className="self-start inline-flex items-center rounded-full border border-danger/35 bg-danger/[0.07] px-3 py-1 text-xs text-danger"
        title="proveReputation returned false for these thresholds"
      >
        Unproven at {verdict.label}
      </span>
    );
  }
  if (verdict.kind === "stale") {
    return (
      <span
        className="self-start inline-flex items-center rounded-full border border-accent/40 bg-accent/[0.08] px-3 py-1 text-xs text-accent"
        title="The aggregate advanced after this proof; the on-chain commitment no longer matches."
      >
        Stale · {verdict.label}
      </span>
    );
  }
  return (
    <span className="self-start inline-flex items-center gap-1.5 rounded-full border border-private/30 bg-private/10 px-3 py-1 text-xs text-private">
      <span aria-hidden>✓</span> Verified: {verdict.label}
    </span>
  );
}

export function Note({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warn";
}) {
  return (
    <p
      className={`text-xs leading-relaxed border-l-2 pl-3 ${
        tone === "warn" ? "border-accent/40 text-accent/90" : "border-border text-fg-dim"
      }`}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-dim">{children}</p>;
}

export function ErrorNote({
  title,
  children,
  onDismiss,
}: {
  title?: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3">
      <div className="min-w-0">
        {title && <p className="text-sm font-medium text-danger">{title}</p>}
        <p className="text-sm text-fg-muted mt-0.5 break-words">{children}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-danger/60 hover:text-danger text-xs shrink-0"
        >
          dismiss
        </button>
      )}
    </div>
  );
}

export function shortAddress(addr: string, chars = 6): string {
  return addr.length > chars * 2 + 2 ? `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}` : addr;
}
