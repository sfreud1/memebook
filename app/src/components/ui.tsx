"use client";

import Link from "next/link";
import { useConfig } from "@/lib/useConfig";

type Tone = "neutral" | "good" | "warn" | "bad" | "accent" | "lock";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-page text-fg-2",
  good: "border-good/20 bg-good-soft text-good",
  warn: "border-warn/20 bg-warn-soft text-warn",
  bad: "border-bad/20 bg-bad-soft text-bad",
  accent: "border-accent/20 bg-accent-soft text-accent",
  lock: "border-lock/20 bg-lock-soft text-lock",
};

/** Status at a glance — the word matters less than the colour. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** A labelled figure. Tabular digits so columns of them line up. */
export function Stat({
  label,
  children,
  hint,
  tone = "neutral",
  size = "md",
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "accent" | "bad" | "good" | "lock";
  size?: "md" | "lg";
}) {
  const color = { neutral: "text-fg", accent: "text-accent", bad: "text-bad", good: "text-good", lock: "text-lock" }[tone];
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1.5 font-display font-bold leading-tight ${color} ${size === "lg" ? "text-[24px]" : "text-[18px]"}`}>
        {children}
      </div>
      {hint && <div className="mt-1 text-[11.5px] text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card border-dashed px-6 py-12 text-center shadow-none">
      <p className="h3">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">{body}</p>}
      {action && (
        <Link href={action.href} className="btn-secondary mt-5">
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/** Page title with the one sentence that says what the page is for. */
export function PageHeader({ title, lede, right }: { title: string; lede?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="h1">{title}</h1>
        {lede && <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-fg-2">{lede}</p>}
      </div>
      {right}
    </div>
  );
}

export function SectionHeading({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="h2">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-[12.5px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** One row with an icon square, a bold line and an explanation. */
export function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">{icon}</span>
      <div>
        <p className="text-[13px] font-semibold text-fg">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * The protocol's cut, read from the chain so it can never disagree with what
 * gets charged. Sits beside every form a person can commit money from.
 */
export function FeeCard() {
  const config = useConfig();
  const pct = (bps: number | undefined, digits = 0) =>
    bps === undefined ? "…" : (bps / 100).toLocaleString("tr-TR", { maximumFractionDigits: digits });
  const rows = [
    { v: `%${pct(config?.originationFeeBps)}`, t: "açılış", d: "faizin payı, borçludan, kredi açılırken" },
    { v: `%${pct(config?.interestFeeBps)}`, t: "faiz payı", d: "faizin payı, verenden, geri ödemede" },
    { v: `%${pct(config?.defaultFeeBps, 1)}`, t: "temerrüt", d: "teminatın payı, el koyarken" },
  ];
  return (
    <div className="card">
      <div className="border-b border-line px-5 py-3">
        <p className="eyebrow">Ücretler</p>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.t} className="flex items-baseline gap-3 px-5 py-2.5">
            <span className="num w-14 shrink-0 font-display text-[17px] font-bold text-accent">{r.v}</span>
            <span className="text-[12.5px]">
              <span className="font-semibold text-fg">{r.t}</span>{" "}
              <span className="text-muted">· {r.d}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-2.5 text-[11.5px] leading-relaxed text-muted">
        Zincirden okunur. Tavanlar programda sabittir (%30 / %1); açılmış bir kredinin oranı sonradan değişmez.
      </p>
    </div>
  );
}

/** Grey blocks in the shape of what is loading, so the page does not jump. */
export function SkeletonCard() {
  return (
    <div className="card p-5" aria-hidden>
      <div className="flex items-center justify-between">
        <span className="skeleton h-4 w-40" />
        <span className="skeleton h-5 w-20" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <span className="skeleton block h-2.5 w-24" />
            <span className="skeleton mt-2.5 block h-5 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

export const Icon = {
  clock: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4l5-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  eyeOff: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  split: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  undo: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4L3 7l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 7h6a4 4 0 010 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  coin: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v6M6.5 6.5h2.2a1.2 1.2 0 010 2.4H6.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  arrow: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
