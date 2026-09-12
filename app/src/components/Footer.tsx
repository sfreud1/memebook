"use client";

import { PROGRAM_ID } from "@/lib/program";
import { addressUrl } from "@/lib/explorer";
import { IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/network";
import { Wordmark } from "@/components/Nav";

const REPO = "https://github.com/sfreud1/memebook";

export function Footer() {
  const pid = PROGRAM_ID.toBase58();
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto grid w-full max-w-page gap-8 px-5 py-10 text-xs text-muted sm:grid-cols-3">
        <div>
          <Wordmark className="text-lg" />
          <p className="mt-2 max-w-xs leading-relaxed">
            Vadeli, oracle'sız, likidasyonsuz eşler-arası kredi. Solana üzerinde çalışır;
            fiyatı okuyan bir mekanizma yoktur, riski insan fiyatlar.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-2">Protokol</p>
          <ul className="space-y-1.5">
            <li>
              Program{" "}
              <a
                href={addressUrl(pid)}
                target="_blank"
                rel="noreferrer"
                className="num text-fg-2 underline decoration-edge underline-offset-4 hover:text-accent"
              >
                {pid.slice(0, 6)}…{pid.slice(-6)}
              </a>
            </li>
            <li>
              Ağ{" "}
              <span className={IS_MAINNET ? "text-bad" : "text-fg-2"}>{NETWORK_LABEL[NETWORK]}</span>
              {!IS_MAINNET && " — gerçek para değil"}
            </li>
            <li>
              <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-accent">
                Kaynak kodu
              </a>
              {" · "}
              <a
                href={`${REPO}/blob/main/docs/audit-2026-09-11.html`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent"
              >
                Güvenlik incelemesi
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-2">Bilmen gerekenler</p>
          <ul className="space-y-1.5 leading-relaxed">
            <li>Vadeyi kaçırırsan teminatın tamamı karşı tarafa geçer; fazlası iade edilmez.</li>
            <li>LTV ve dolar değerleri yalnızca gösterim içindir; zincirde fiyat yok.</li>
            <li>Bu bir yatırım tavsiyesi değildir. Kaybetmeyi göze alamadığın parayı kilitleme.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
