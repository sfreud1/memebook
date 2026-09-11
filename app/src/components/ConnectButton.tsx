"use client";

import { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletName } from "@solana/wallet-adapter-phantom";

/**
 * Connects straight to Phantom.
 *
 * The adapter's modal lists every Wallet Standard wallet the browser exposes —
 * MetaMask's Solana snap included — which is noise when the app only expects
 * one. Selecting and connecting directly skips the picker entirely.
 */
export function ConnectButton() {
  const { publicKey, wallets, select, connect, disconnect, connecting } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const phantomReady = useMemo(
    () =>
      wallets.some(
        (w) => w.adapter.name === PhantomWalletName && w.readyState !== "NotDetected"
      ),
    [wallets]
  );

  const onClick = useCallback(async () => {
    setError(null);
    if (publicKey) {
      await disconnect().catch(() => {});
      return;
    }
    if (!phantomReady) {
      window.open("https://phantom.app/download", "_blank", "noopener,noreferrer");
      return;
    }
    try {
      select(PhantomWalletName);
      // `select` lands in state before connect can use it, so give React a tick.
      await new Promise((r) => setTimeout(r, 0));
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject/i.test(msg) ? "Bağlantı reddedildi." : msg);
    }
  }, [publicKey, phantomReady, select, connect, disconnect]);

  const label = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}..${publicKey.toBase58().slice(-4)}`
    : connecting
      ? "Bağlanıyor…"
      : phantomReady
        ? "Phantom'a Bağlan"
        : "Phantom Kur";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        title={publicKey ? "Bağlantıyı kes" : undefined}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent/80"
      >
        {label}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
