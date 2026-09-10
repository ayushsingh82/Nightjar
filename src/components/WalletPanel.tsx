"use client";

// Nightjar — connect / status / DUST / proof-server panel.
//
// The wallet session here is real: DApp Connector enumeration, the unshielded
// address, the DUST balance the fees would come out of, and a proof-server
// health check. What it is *not* is what drives the console tabs — see the
// execution notice there.

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

  const statusTone =
    status === "connected"
      ? "text-private"
      : status === "error"
        ? "text-danger"
        : "text-fg-dim";

  return (
    <Panel
      title="Midnight wallet"
      right={
        <span className={`text-xs font-mono ${statusTone}`}>
          {status}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-3 text-fg-dim hover:text-fg-muted"
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
          <p className="text-sm text-fg-muted">
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
          {error && <p className="text-xs text-danger">{error}</p>}
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <VisibilityTag tone="public" />
          </div>
          <Row label="Address">
            <span title={address ?? ""}>{address ? shortAddress(address, 6) : "—"}</span>
          </Row>
          <Row label="DUST (fees)" tone="public">
            {dust ? `${dust.balance} / cap ${dust.cap}` : "—"}
          </Row>
          <Row label="Proof server" tone={proofServer?.ok ? "private" : "danger"}>
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
