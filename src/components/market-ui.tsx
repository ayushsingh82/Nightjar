"use client";

// Nightjar — shared UI primitives.
//
// One rule runs through all of it: green means private (only this device
// knows), blue means public (the ledger knows). If a value is on screen in one
// of those two, it is telling you who can see it. Signal orange is the brand —
// focus, the wordmark, a primary action — and never carries meaning. Nothing
// else is coloured at all.
//
// The printed grammar, applied without exception: no radius, 2px ink borders
// (3px where a block leads a page), hard 4px offset shadows with no blur,
// uppercase mono for every label and column head, and a hard rule under every
// row so a dense table shows its own grid.

import type { ReactNode } from "react";
import type { BadgeVerdict } from "@/lib/midnight";

export type Tone = "neutral" | "private" | "public" | "danger";

/** Semantic ink as type. All four clear 6:1 on every paper stock in the app. */
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  private: "text-private",
  public: "text-public",
  danger: "text-danger",
};

/**
 * The same semantics reversed out of a solid fill. The hexes were picked so
 * this direction measures the same as the one above — a private block and a
 * public block stay as far apart printed as they are set.
 */
const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-bg text-fg",
  private: "bg-private text-bg",
  public: "bg-public text-bg",
  danger: "bg-danger text-bg",
};

/** Subtitles sit on the header band, so they follow it in or out of reverse. */
const TONE_SUB: Record<Tone, string> = {
  neutral: "text-fg-dim",
  private: "text-bg",
  public: "text-bg",
  danger: "text-bg",
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
    <section className={`min-w-0 border-2 border-border bg-bg-raised shadow-hard ${className}`}>
      {(title || right) && (
        <header
          className={`flex items-start justify-between gap-4 border-b-2 border-border px-5 py-3.5 ${TONE_FILL[tone]}`}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="font-display text-[15px] uppercase tracking-[0.015em] leading-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className={`mt-2 font-mono text-[11px] leading-snug max-w-prose ${TONE_SUB[tone]}`}
              >
                {subtitle}
              </p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className="p-5 flex flex-col gap-4 text-sm">{children}</div>
    </section>
  );
}

/** Labels a whole region as ledger-visible or device-only. */
export function VisibilityTag({ tone }: { tone: "private" | "public" }) {
  const isPrivate = tone === "private";
  return (
    <span
      className={`label inline-flex items-center gap-2 border-2 border-border px-2 py-1.5 ${
        isPrivate ? "bg-private text-bg" : "bg-public text-bg"
      }`}
    >
      {/* A square for held, an outline for published — the shape says it too,
          for anyone who cannot use the hue. */}
      <span
        aria-hidden
        className={`size-2 ${isPrivate ? "bg-bg" : "border-2 border-bg"}`}
      />
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
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
      <span className="label text-fg-dim" title={hint}>
        {label}
      </span>
      <span
        className={`text-right min-w-0 truncate font-mono tnum text-[13px] ${
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
    <div className="min-w-0 border-2 border-border bg-bg-raised px-4 py-3.5 flex flex-col">
      <div className="label text-fg-dim">{label}</div>
      <div
        className={`mt-3 font-mono tnum text-[26px] font-bold leading-none tracking-tight ${
          tone === "neutral" ? "text-fg" : TONE_TEXT[tone]
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-3 text-[11px] text-fg-dim leading-snug">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const styles: Record<Tone, string> = {
    neutral: "bg-bg-inset text-fg",
    private: "bg-private text-bg",
    public: "bg-public text-bg",
    danger: "bg-danger text-bg",
  };
  return (
    <span
      className={`label inline-flex items-center border-2 border-border px-2 py-1.5 ${styles[tone]}`}
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
    <code className={`font-mono text-xs tracking-tight ${TONE_TEXT[tone]}`} title={value}>
      {value.length > chars ? `${value.slice(0, chars)}…` : value}
    </code>
  );
}

/** A value the ledger cannot see — rendered so it reads as withheld, not missing. */
export function Redacted({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-fg-dim">
      {/* A literal redaction bar: the value was here and has been struck out. */}
      <span aria-hidden className="inline-block h-3.5 w-16 bg-fg align-middle select-none" />
      {children && <span className="font-mono text-xs">{children}</span>}
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
  // Branched rather than expressed with `disabled:` variants, so the dead state
  // is a flat grey block with no shadow to press instead of a faded live one.
  const skin = disabled
    ? "bg-bg-inset text-fg-dim border-fg-dim cursor-not-allowed"
    : {
        primary: "bg-accent text-fg border-border",
        private: "bg-private text-bg border-border",
        ghost: "bg-bg-raised text-fg border-border hover:bg-bg-hover",
        danger: "bg-danger text-bg border-border",
      }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`press inline-flex items-center justify-center h-10 px-4 border-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${skin} ${
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
        className="w-full h-11 border-2 border-border bg-bg-raised px-3 pr-12 font-mono tnum text-sm
                   text-fg outline-none disabled:bg-bg-inset disabled:text-fg-dim disabled:border-fg-dim"
      />
      {suffix && (
        <span className="label absolute right-3 top-1/2 -translate-y-1/2 text-fg-dim pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );

  if (!label) return input;
  return (
    <label className="flex flex-col gap-2">
      <span className="label text-fg-dim">{label}</span>
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
  const active = tone === "private" ? "bg-private text-bg" : "bg-accent text-fg";
  return (
    <div className="inline-flex border-2 border-border bg-bg-raised shadow-hard-sm">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={`h-9 px-3.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em]
                      disabled:text-fg-dim disabled:cursor-not-allowed ${
                        i > 0 ? "border-l-2 border-border" : ""
                      } ${value === o.value ? active : "text-fg-dim hover:bg-bg-hover"}`}
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
 *
 * Four verdicts, four printed treatments, and none of them borrows a reserved
 * hue: a verdict is a claim about a track record, not a statement about who can
 * see it. Verified is a stamp — solid ink. Stale is the same stamp with the ink
 * gone, kept only as a 3px outline. Failed is the one that is genuinely bad, so
 * it gets the danger ink. The brand colour appears nowhere here.
 */
export function BadgePill({ verdict }: { verdict: BadgeVerdict }) {
  const base = "label self-start inline-flex items-center gap-2 px-2.5 py-1.5 border-border";

  if (verdict.kind === "none") {
    return (
      <span className={`${base} border-2 bg-bg-inset text-fg-dim`}>
        No reputation proof published
      </span>
    );
  }
  if (verdict.kind === "failed") {
    return (
      <span
        className={`${base} border-2 bg-danger text-bg`}
        title="proveReputation returned false for these thresholds"
      >
        Unproven at {verdict.label}
      </span>
    );
  }
  if (verdict.kind === "stale") {
    return (
      <span
        className={`${base} border-[3px] bg-bg text-fg`}
        title="The aggregate advanced after this proof; the on-chain commitment no longer matches."
      >
        <span aria-hidden>✕</span> Stale · {verdict.label}
      </span>
    );
  }
  return (
    <span className={`${base} border-2 bg-fg text-bg`}>
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
      className={`text-xs leading-relaxed py-0.5 pl-3 [&_code]:bg-bg-inset [&_code]:px-1 ${
        tone === "warn"
          ? "border-l-[6px] border-danger bg-bg-inset py-2 pr-3 text-fg"
          : "border-l-2 border-border text-fg-dim"
      }`}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs text-fg-dim">{children}</p>;
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
    <div className="flex items-start justify-between gap-4 border-2 border-border bg-danger text-bg shadow-hard px-4 py-3">
      <div className="min-w-0">
        {title && <p className="label">{title}</p>}
        <p className="font-mono text-xs leading-relaxed mt-2 break-words">{children}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="label border-2 border-bg px-2 py-1 shrink-0 hover:bg-bg hover:text-danger"
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
