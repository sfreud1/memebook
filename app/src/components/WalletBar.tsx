"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalances } from "@/lib/useWalletBalances";
import { TokenBadge } from "@/components/TokenBadge";
import { fromRaw } from "@/lib/format";
import { tokenMeta } from "@/lib/tokens";
import { useTokenMarket } from "@/lib/useTokenMarket";
import { IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/network";

export function WalletBar() {
  const { publicKey } = useWallet();
  const { sol, tokens } = useWalletBalances();
  useTokenMarket(tokens.map((t) => t.mint));

  if (!publicKey) return null;

  // Unknown mints are dust from other experiments; showing them would bury the
  // two balances the user actually came to see.
  const known = tokens.filter((t) => tokenMeta(t.mint).name !== "bilinmeyen token");
  const hidden = tokens.length - known.length;

  return (
    <div className="border-b border-edge bg-panel/40">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 text-sm">
        <span className="text-xs uppercase tracking-wide text-muted">Cüzdanın</span>

        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] text-[8px] font-bold text-ink">
            S
          </span>
          <span className="font-medium">
            {sol === null ? "…" : sol.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}
          </span>
          <span className="text-muted">SOL</span>
        </span>

        {known.map((t) => (
          <span key={t.mint} className="inline-flex items-center gap-1.5">
            <span className="font-medium">{fromRaw(t.amount, t.decimals, 2)}</span>
            <TokenBadge mint={t.mint} />
          </span>
        ))}

        {known.length === 0 && sol !== null && (
          <span className="text-xs text-muted">Bu ağda token bakiyen yok.</span>
        )}

        {hidden > 0 && (
          <span className="text-xs text-muted">+{hidden} tanınmayan token</span>
        )}

        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              IS_MAINNET ? "bg-red-400" : "bg-accent"
            }`}
          />
          {NETWORK_LABEL[NETWORK]}
        </span>
      </div>
    </div>
  );
}
