"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const WalletButton = dynamic(
  () => import("@/components/ConnectButton").then((m) => m.ConnectButton),
  { ssr: false }
);

const TABS = [
  { href: "/", label: "Borç Al" },
  { href: "/lend", label: "Borç Ver" },
  { href: "/dashboard", label: "Panelim" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-edge">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          meme<span className="text-accent">book</span>
        </Link>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = path === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-panel text-neutral-100" : "text-muted hover:text-neutral-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
