"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8899";

export function Providers({ children }: { children: React.ReactNode }) {
  // The RPC connection is only ever used to sign and send. Every read goes
  // through the indexer API, so the book stays fast no matter how big it gets.
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
