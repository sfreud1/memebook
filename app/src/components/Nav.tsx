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
];

function NetworkPill() {
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider sm:inline-flex ${
        IS_MAINNET ? "border-bad/40 text-bad" : "border-edge text-muted"
      }`}
      title={IS_MAINNET ? "Gerçek para" : "Test ağı — gerçek para değil"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${IS_MAINNET ? "bg-bad" : "bg-good"}`} />
      {NETWORK_LABEL[NETWORK]}
    </span>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="font-serif italic text-accent">meme</span>
      <span className="font-semibold tracking-tight">book</span>
    </span>
  );
}

export function Nav() {
  const path = usePathname();
  const links = TABS.map((t) => {
    const active = path === t.href;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={`relative px-3 py-2 text-sm transition-colors ${
          active ? "text-fg" : "text-muted hover:text-fg-2"
        }`}
      >
        {t.label}
        {active && (
          <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />
        )}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-ink/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-page items-center gap-6 px-5 py-3">
        <Link href="/" className="text-xl leading-none">
          <Wordmark />
        </Link>
        <nav className="hidden items-center sm:flex">{links}</nav>
        <div className="ml-auto flex items-center gap-3">
          <NetworkPill />
          <WalletButton />
        </div>
      </div>
      <nav className="flex items-center justify-around border-t border-edge sm:hidden">{links}</nav>
    </header>
  );
}
