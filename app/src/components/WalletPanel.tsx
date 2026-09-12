"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalances } from "@/lib/useWalletBalances";
import { TokenBadge } from "@/components/TokenBadge";
import dynamic from "next/dynamic";

// The wallet adapter only knows which wallets exist in the browser, so the
// button's label differs between the server render and the client; render it
// on the client only rather than argue with hydration about it.
const ConnectButton = dynamic(() => import("@/components/ConnectButton").then((m) => m.ConnectButton), {
  ssr: false,
});
import { fromRaw } from "@/lib/format";
import { tokenMeta, usdValue, formatUsd } from "@/lib/tokens";
import { useTokenMarket } from "@/lib/useTokenMarket";
import { addressUrl } from "@/lib/explorer";
import { shortKey } from "@/lib/format";

/**
 * What the connected wallet holds, on the page where it will be spent. The
 * numbers a person checks before every action live next to the action, not
 * in a header they have to look away to.
 */
export function WalletPanel() {
  const { publicKey } = useWallet();
  const { sol, tokens } = useWalletBalances();
  useTokenMarket(tokens.map((t) => t.mint));

  if (!publicKey) {
    return (
      <div className="card p-5">
        <p className="eyebrow">Cüzdanın</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
          Bakiyeni görmek ve işlem yapmak için Phantom'u bağla. İmzalar cüzdanında verilir; site anahtarını görmez.
        </p>
        <div className="mt-4">
          <ConnectButton block />
        </div>
      </div>
    );
  }

  // Unknown mints are dust from other experiments; showing them would bury the
  // balances the user actually came to see.
  const known = tokens.filter((t) => tokenMeta(t.mint).name !== "bilinmeyen token");
  const hidden = tokens.length - known.length;
  const key = publicKey.toBase58();

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="eyebrow">Cüzdanın</p>
        <a
          href={addressUrl(key)}
          target="_blank"
          rel="noreferrer"
          className="num text-[12px] font-medium text-fg-2 hover:text-accent"
          title={key}
        >
          {shortKey(key)} ↗
        </a>
      </div>
      <ul className="divide-y divide-line">
        <li className="flex items-center justify-between px-5 py-2.5">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] text-[8px] font-bold text-white">
              S
            </span>
            SOL
          </span>
          <span className="num text-[13px] font-semibold">
            {sol === null ? "…" : sol.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}
          </span>
        </li>
        {known.map((t) => {
          const usd = usdValue(t.amount, t.decimals, t.mint);
          return (
            <li key={t.mint} className="flex items-center justify-between px-5 py-2.5">
              <TokenBadge mint={t.mint} size="md" />
              <span className="text-right">
                <span className="num block text-[13px] font-semibold">{fromRaw(t.amount, t.decimals, 2)}</span>
                {usd !== undefined && <span className="num block text-[11px] text-muted">{formatUsd(usd)}</span>}
              </span>
            </li>
          );
        })}
        {known.length === 0 && sol !== null && (
          <li className="px-5 py-3 text-[12px] text-muted">Bu ağda tanınan bir token bakiyen yok.</li>
        )}
      </ul>
      {hidden > 0 && (
        <p className="border-t border-line px-5 py-2 text-[11px] text-muted">+{hidden} tanınmayan token gizlendi</p>
      )}
    </div>
  );
}
