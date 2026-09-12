"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalances } from "@/lib/useWalletBalances";
import { TokenBadge } from "@/components/TokenBadge";
import { fromRaw } from "@/lib/format";
import { tokenMeta } from "@/lib/tokens";
import { useTokenMarket } from "@/lib/useTokenMarket";

export function WalletBar() {
  const { publicKey } = useWallet();
  const { sol, tokens } = useWalletBalances();
  useTokenMarket(tokens.map((t) => t.mint));

  if (!publicKey) return null;

  // Unknown mints are dust from other experiments; showing them would bury the
  // balances the user actually came to see.
  const known = tokens.filter((t) => tokenMeta(t.mint).name !== "bilinmeyen token");
  const hidden = tokens.length - known.length;

  return (
    <div className="border-b border-edge bg-panel/60">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2 text-sm">
        <span className="eyebrow">Cüzdanın</span>

        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] text-[8px] font-bold text-ink">
            S
          </span>
          <span className="num font-medium">
            {sol === null ? "…" : sol.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}
          </span>
          <span className="text-xs text-muted">SOL</span>
        </span>

        {known.map((t) => (
          <span key={t.mint} className="inline-flex items-center gap-1.5">
            <span className="num font-medium">{fromRaw(t.amount, t.decimals, 2)}</span>
            <TokenBadge mint={t.mint} />
          </span>
        ))}

        {known.length === 0 && sol !== null && (
          <span className="text-xs text-muted">Bu ağda tanınan bir token bakiyen yok.</span>
        )}
        {hidden > 0 && (
          <span className="text-xs text-muted">+{hidden} tanınmayan token</span>
        )}
      </div>
    </div>
  );
}
