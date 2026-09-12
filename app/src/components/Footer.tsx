"use client";

import Link from "next/link";
import { PROGRAM_ID } from "@/lib/program";
import { addressUrl } from "@/lib/explorer";
import { IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/network";
import { Wordmark } from "@/components/Nav";

const REPO = "https://github.com/sfreud1/memebook";

export function Footer() {
  const pid = PROGRAM_ID.toBase58();
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto grid w-full max-w-page gap-8 px-5 py-10 text-[12.5px] text-muted md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm leading-relaxed">
            Token'ını satmadan nakde çevir. Vadeli, oracle'sız, likidasyonsuz eşler-arası kredi — Solana üzerinde.
          </p>
          <p className={`mt-3 inline-flex items-center gap-1.5 font-semibold ${IS_MAINNET ? "text-bad" : "text-fg-2"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${IS_MAINNET ? "bg-bad" : "bg-good"}`} />
            {NETWORK_LABEL[NETWORK]}
            {!IS_MAINNET && <span className="font-normal text-muted">— gerçek para değil</span>}
          </p>
        </div>
        <div>
          <p className="eyebrow mb-3">Ürün</p>
          <ul className="space-y-2">
            <li><Link href="/" className="hover:text-accent">Borç al</Link></li>
            <li><Link href="/lend" className="hover:text-accent">Borç ver</Link></li>
            <li><Link href="/dashboard" className="hover:text-accent">Panelim</Link></li>
            <li><Link href="/faq" className="hover:text-accent">Nasıl çalışır · SSS</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3">Protokol</p>
          <ul className="space-y-2">
            <li><a href={REPO} target="_blank" rel="noreferrer" className="hover:text-accent">Kaynak kodu ↗</a></li>
            <li><a href={`${REPO}/blob/main/docs/audit-2026-09-11.html`} target="_blank" rel="noreferrer" className="hover:text-accent">Güvenlik incelemesi ↗</a></li>
            <li>
              <a href={addressUrl(pid)} target="_blank" rel="noreferrer" className="num hover:text-accent" title={pid}>
                Program {pid.slice(0, 4)}…{pid.slice(-4)} ↗
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-page px-5 py-4 text-[11.5px] leading-relaxed text-muted">
          Vadeyi kaçırırsan teminatın tamamı karşı tarafa geçer; fazlası iade edilmez. Dolar değerleri ve LTV yalnızca
          gösterim içindir. Bu bir yatırım tavsiyesi değildir.
        </p>
      </div>
    </footer>
  );
}
