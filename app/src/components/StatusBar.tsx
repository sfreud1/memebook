"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalances } from "@/lib/useWalletBalances";
import { TokenBadge } from "@/components/TokenBadge";
import { fromRaw } from "@/lib/format";
import { tokenMeta } from "@/lib/tokens";
import { useTokenMarket } from "@/lib/useTokenMarket";
import { IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/network";

const WalletButton = dynamic(
  () => import("@/components/ConnectButton").then((m) => m.ConnectButton),
  { ssr: false }
);

/**
 * The row under the header: what the wallet holds on the left, which network
 * this is and the wallet control on the right. Balances are the numbers a
 * person checks before every action, so they stay on every page.
 */
export function StatusBar() {
  const { publicKey } = useWallet();
  const { sol, tokens } = useWalletBalances();
  useTokenMarket(tokens.map((t) => t.mint));

  // Unknown mints are dust from other experiments; showing them would bury the
  // balances the user actually came to see.
  const known = tokens.filter((t) => tokenMeta(t.mint).name !== "bilinmeyen token");
  const hidden = tokens.length - known.length;

  return (
    <div className="border-b border-line bg-card">
      <div className="mx-auto flex w-full max-w-page items-center gap-4 px-5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
        {publicKey ? (
          <>
            <span className="eyebrow">Cüzdanın</span>
            <span className="inline-flex items-center gap-1.5 text-[13px]">
              <span className="num font-semibold">
                {sol === null ? "…" : sol.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}
              </span>
              <span className="text-muted">SOL</span>
            </span>
            {known.map((t) => (
              <span key={t.mint} className="inline-flex items-center gap-1.5 text-[13px]">
                <span className="num font-semibold">{fromRaw(t.amount, t.decimals, 2)}</span>
                <TokenBadge mint={t.mint} />
              </span>
            ))}
            {known.length === 0 && sol !== null && (
              <span className="text-[12px] text-muted">Bu ağda tanınan bir token bakiyen yok.</span>
            )}
            {hidden > 0 && <span className="text-[12px] text-muted">+{hidden} tanınmayan token</span>}
          </>
        ) : (
          <span className="text-[12px] text-muted">
            <span className="text-fg">Cüzdan</span> <span className="mx-1.5">/</span> Bağlı değil
          </span>
        )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
            title={IS_MAINNET ? "Gerçek para" : "Test ağı — gerçek para değil"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${IS_MAINNET ? "bg-bad" : "bg-good"}`} />
            <span className={IS_MAINNET ? "text-bad" : "text-fg-2"}>{NETWORK_LABEL[NETWORK]}</span>
            {!IS_MAINNET && <span className="font-normal text-muted">· test ağı</span>}
          </span>
          <WalletButton />
        </div>
      </div>
    </div>
  );
}
