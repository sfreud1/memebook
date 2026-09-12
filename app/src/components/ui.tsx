"use client";

import Link from "next/link";
import { useConfig } from "@/lib/useConfig";

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-page text-fg-2",
  good: "border-good/20 bg-good-soft text-good",
  warn: "border-warn/20 bg-warn-soft text-warn",
  bad: "border-bad/20 bg-bad-soft text-bad",
  accent: "border-accent/20 bg-accent-soft text-accent",
};

/** Status at a glance — the word matters less than the colour. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}
    >
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
  tone?: "neutral" | "accent" | "bad" | "good";
  size?: "md" | "lg";
}) {
  const color =
    tone === "accent" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-fg";
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1.5 font-semibold leading-tight ${color} ${size === "lg" ? "text-[24px]" : "text-[18px]"}`}>
        {children}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
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
    <div className="card px-6 py-12 text-center">
      <p className="h3">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">{body}</p>}
      {action && (
        <Link href={action.href} className="btn-pill mt-5">
          {action.label} ↗
        </Link>
      )}
    </div>
  );
}

/** Page title row: the name of the page on the left, a small marker on the right. */
export function PageTitle({ title, marker }: { title: string; marker?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h1 className="h1">{title}</h1>
      {marker && <span className="eyebrow">{marker}</span>}
    </div>
  );
}

export function SectionHeading({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="h2">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-[12px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** One row with an icon square, a bold line and an explanation — the reference's "built in" list. */
export function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-card text-accent">
        {icon}
      </span>
      <div>
        <p className="text-[13px] font-semibold text-fg">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * The protocol's cut, stated up front on every page a person can commit money
 * from. Read from the chain, so it can never disagree with what gets charged.
 */
export function FeeStrip() {
  const config = useConfig();
  const pct = (bps: number | undefined, digits = 0) =>
    bps === undefined ? "…" : (bps / 100).toLocaleString("tr-TR", { maximumFractionDigits: digits });
  return (
    <div className="card grid grid-cols-1 divide-y divide-line sm:grid-cols-[1.2fr_1fr_1fr_1fr] sm:divide-x sm:divide-y-0">
      <div className="px-5 py-4">
        <p className="eyebrow">Her kredide</p>
        <p className="mt-1 text-[13px] font-semibold">Tek şeffaf kesinti.</p>
      </div>
      <div className="flex items-baseline gap-2 px-5 py-4">
        <span className="num font-display text-[22px] font-semibold text-accent">%{pct(config?.originationFeeBps)}</span>
        <span className="text-[12px] text-fg-2">
          açılış <span className="text-muted">· faizin payı, borçludan</span>
        </span>
      </div>
      <div className="flex items-baseline gap-2 px-5 py-4">
        <span className="num font-display text-[22px] font-semibold text-accent">%{pct(config?.interestFeeBps)}</span>
        <span className="text-[12px] text-fg-2">
          faiz payı <span className="text-muted">· verenden</span>
        </span>
      </div>
      <div className="flex items-baseline gap-2 px-5 py-4">
        <span className="num font-display text-[22px] font-semibold text-accent">%{pct(config?.defaultFeeBps, 1)}</span>
        <span className="text-[12px] text-fg-2">
          temerrüt <span className="text-muted">· teminattan</span>
        </span>
      </div>
    </div>
  );
}

export const Icon = {
  clock: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4l5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  eyeOff: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  split: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  undo: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4L3 7l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 7h6a4 4 0 010 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  coin: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v6M6.5 6.5h2.2a1.2 1.2 0 010 2.4H6.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  arrow: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 12L12 4M6 4h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
