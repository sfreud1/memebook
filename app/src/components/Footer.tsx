"use client";

import { PROGRAM_ID } from "@/lib/program";
import { addressUrl } from "@/lib/explorer";
import { IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/network";
import { Wordmark } from "@/components/Nav";

const REPO = "https://github.com/sfreud1/memebook";

export function Footer() {
  const pid = PROGRAM_ID.toBase58();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 text-[12px] text-muted">
        <Wordmark className="scale-90 origin-left" />
        <span>Vadeli, oracle'sız, likidasyonsuz kredi.</span>
        <span className={IS_MAINNET ? "font-semibold text-bad" : ""}>
          {NETWORK_LABEL[NETWORK]}
          {!IS_MAINNET && " · gerçek para değil"}
        </span>
        <nav className="ml-auto flex items-center gap-5">
          <a href={REPO} target="_blank" rel="noreferrer" className="font-semibold text-fg-2 hover:text-accent">
            GitHub ↗
          </a>
          <a
            href={`${REPO}/blob/main/docs/audit-2026-09-11.html`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fg-2 hover:text-accent"
          >
            Denetim ↗
          </a>
          <a
            href={addressUrl(pid)}
            target="_blank"
            rel="noreferrer"
            className="num font-semibold text-fg-2 hover:text-accent"
            title={pid}
          >
            Program ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
