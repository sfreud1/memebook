"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Borç al" },
  { href: "/lend", label: "Borç ver" },
  { href: "/dashboard", label: "Panelim" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent font-display text-[13px] font-bold text-white">
        m
      </span>
      <span className="font-display text-[17px] font-bold tracking-[-0.5px] text-fg">memebook</span>
    </span>
  );
}

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex h-14 w-full max-w-page items-center px-5">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="mx-auto flex items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`tab ${path === t.href ? "tab-active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <span className="hidden w-[120px] shrink-0 sm:block" aria-hidden />
      </div>
    </header>
  );
}
