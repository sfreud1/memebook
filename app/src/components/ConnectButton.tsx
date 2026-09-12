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
export function ConnectButton({ block = false }: { block?: boolean }) {
  const { publicKey, wallets, select, connect, disconnect, connecting } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const phantomReady = useMemo(
    () => wallets.some((w) => w.adapter.name === PhantomWalletName && w.readyState !== "NotDetected"),
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
      <button onClick={onClick} title="Bağlantıyı kes" className={`btn-pill num ${block ? "w-full justify-center" : ""}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        {k.slice(0, 4)}…{k.slice(-4)}
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${block ? "" : "items-end"}`}>
      <button onClick={onClick} className={block ? "btn-block" : "btn-primary py-2"}>
        <span className="inline-flex items-center gap-2">
          <WalletIcon />
          {connecting ? "Bağlanıyor…" : phantomReady ? "Cüzdanı bağla" : "Phantom kur"}
        </span>
        {block && <span aria-hidden>→</span>}
      </button>
      {error && <span className="text-[11.5px] text-bad">{error}</span>}
    </div>
  );
}

function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10.5" cy="8" r="0.9" fill="currentColor" />
    </svg>
  );
}
