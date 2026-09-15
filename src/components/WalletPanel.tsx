"use client";

// Nightjar — connect / status / DUST / proof-server panel.
//
// The wallet session here is real: DApp Connector enumeration, the unshielded
// address, the DUST balance the fees would come out of, and a proof-server
// health check. What it is *not* is what drives the console tabs — see the
// execution notice there.
//
// Connection state and proof-server health are printed in ink, not in the
// reserved hues: neither of them says anything about who can see a value. The
// values that do — the address and the DUST balance — are ledger-visible, and
// are printed in the public ink to say so.

import { useWallet } from "@/lib/midnight";
import { Button, Note, Panel, Row, VisibilityTag, shortAddress } from "./market-ui";

export function WalletPanel({ onClose }: { onClose?: () => void }) {
  const {
    status,
    address,
    error,
    dust,
    proofServer,
    availableWallets,
    connect,
    disconnect,
    refresh,
  } = useWallet();

  const statusSkin =
    status === "connected"
      ? "bg-fg text-bg"
      : status === "error"
        ? "bg-danger text-bg"
        : "bg-bg-inset text-fg-dim";

  return (
    <Panel
      title="Midnight wallet"
      right={
        <span className="inline-flex items-center gap-2">
          <span className={`label border-2 border-border px-2 py-1.5 ${statusSkin}`}>{status}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="label size-8 border-2 border-border bg-bg-raised text-fg flex items-center justify-center hover:bg-bg-hover"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </span>
      }
    >
      {status !== "connected" ? (
        <>
          <p className="text-sm text-fg-muted leading-relaxed">
            {availableWallets.length === 0
              ? "No Midnight wallet detected — install an extension and refresh. The console runs without one."
              : `Detected: ${availableWallets.map((w) => w.name).join(", ")}`}
          </p>
          <Button
            full
            disabled={status === "connecting"}
            onClick={() => void connect()}
          >
            {status === "connecting" ? "Connecting…" : "Connect wallet"}
          </Button>
          {error && (
            <p className="border-2 border-border bg-danger text-bg font-mono text-xs px-3 py-2 break-words">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <VisibilityTag tone="public" />
          </div>
          <Row label="Address" tone="public">
            <span title={address ?? ""}>{address ? shortAddress(address, 6) : "—"}</span>
          </Row>
          <Row label="DUST (fees)" tone="public">
            {dust ? `${dust.balance} / cap ${dust.cap}` : "—"}
          </Row>
          <Row label="Proof server" tone={proofServer?.ok ? "neutral" : "danger"}>
            {proofServer ? proofServer.detail : "checking…"}
          </Row>
          <Note>
            Settlement is paid in DUST by the wallet as a relayer — the on-chain fee
            transaction does not carry the buyer↔seller edge.
          </Note>
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button variant="ghost" full onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
