"use client";

import Link from "next/link";

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "border-edge text-fg-2",
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  accent: "border-accent/40 bg-accent/10 text-accent",
};

/** Status at a glance — the word matters less than the colour. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A labelled figure. Values are set in the mono face so columns of them line up. */
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
      <div
        className={`num mt-1 font-medium leading-tight ${color} ${size === "lg" ? "text-2xl" : "text-lg"}`}
      >
        {children}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
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
    <div className="rounded-2xl border border-dashed border-edge-strong px-6 py-12 text-center">
      <p className="font-serif text-2xl">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>}
      {action && (
        <Link href={action.href} className="btn-ghost btn-sm mt-5">
          {action.label} →
        </Link>
      )}
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl leading-tight">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
