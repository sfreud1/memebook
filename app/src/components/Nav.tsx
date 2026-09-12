"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/network";

const WalletButton = dynamic(
  () => import("@/components/ConnectButton").then((m) => m.ConnectButton),
  { ssr: false }
);

const TABS = [
  { href: "/", label: "Borç al" },
  { href: "/lend", label: "Borç ver" },
  { href: "/dashboard", label: "Panelim" },
  { href: "/faq", label: "Nasıl çalışır" },
];

/** A coin with a keyhole: a token, locked. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#0d7a6a" />
      <circle cx="12" cy="11.2" r="5.2" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="12" cy="10.4" r="1.4" fill="#fff" />
      <path d="M12 11.6v3.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark />
      <span className="font-display text-[17px] font-bold tracking-[-0.4px] text-fg">memebook</span>
    </span>
  );
}

function NetworkPill() {
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold md:inline-flex ${
        IS_MAINNET ? "border-bad/30 bg-bad-soft text-bad" : "border-line bg-card text-fg-2"
      }`}
      title={IS_MAINNET ? "Gerçek para" : "Test ağı — gerçek para değil"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${IS_MAINNET ? "bg-bad" : "bg-good"}`} />
      {NETWORK_LABEL[NETWORK]}
      {!IS_MAINNET && <span className="font-normal text-muted">· test</span>}
    </span>
  );
}

export function Nav() {
  const path = usePathname();
  const tabs = TABS.map((t) => (
    <Link key={t.href} href={t.href} className={`tab ${path === t.href ? "tab-active" : ""}`}>
      {t.label}
    </Link>
  ));
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-page items-center gap-5 px-5">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        <span className="hidden h-5 w-px bg-line md:block" />
        <nav className="hidden items-center gap-0.5 md:flex">{tabs}</nav>
        <div className="ml-auto flex items-center gap-3">
          <NetworkPill />
          <WalletButton />
        </div>
      </div>
      <nav className="flex items-center gap-0.5 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">{tabs}</nav>
    </header>
  );
}
