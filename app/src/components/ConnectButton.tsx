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

  if (publicKey) {
    const k = publicKey.toBase58();
    return (
      <button
        onClick={onClick}
        title="Bağlantıyı kes"
        className="btn-ghost btn-sm gap-2 font-mono text-xs"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        {k.slice(0, 4)}…{k.slice(-4)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={onClick} className="btn-primary btn-sm">
        {connecting ? "Bağlanıyor…" : phantomReady ? "Phantom'a bağlan" : "Phantom kur"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
