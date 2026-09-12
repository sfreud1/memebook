"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { fetchLoans, fetchOffers, type Loan, type Offer } from "@/lib/api";
import { formatApr, formatDate, formatDuration, fromRaw, shortKey, timeLeft } from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useTokenMarket } from "@/lib/useTokenMarket";
import { useProgram } from "@/lib/useProgram";
import { useTx } from "@/lib/useTx";
import { cancelOffer, claimDefault, repayLoan, prepare, type TxPrep } from "@/lib/program";
import { TokenBadge } from "@/components/TokenBadge";
import { tokenSymbol, usdValue, formatUsd } from "@/lib/tokens";
import { EmptyState, Pill, SectionHeading, Stat } from "@/components/ui";

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const tx = useTx();

  const [borrowed, setBorrowed] = useState<Loan[]>([]);
  const [lent, setLent] = useState<Loan[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [preps, setPreps] = useState<Record<string, TxPrep>>({});

  const load = useCallback(async () => {
    if (!publicKey) return;
    const me = publicKey.toBase58();
    const [b, l, o] = await Promise.all([
      fetchLoans({ borrower: me }),
      fetchLoans({ lender: me }),
      fetchOffers({ lender: me, mine: "1" }),
    ]);
    setBorrowed(b);
    setLent(l);
    setOffers(o.filter((x) => x.status === "open"));
    setApiError(null);
  }, [publicKey]);

  useEffect(() => {
    load().catch(() => setApiError("Veri sunucusuna ulaşılamıyor."));
  }, [load]);

  // Keep the countdowns honest without a page refresh.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const allMints = [
    ...borrowed.flatMap((l) => [l.principal_mint, l.collateral_mint]),
    ...lent.flatMap((l) => [l.principal_mint, l.collateral_mint]),
    ...offers.flatMap((o) => [o.principal_mint, o.collateral_mint]),
  ];
  const mints = useMintInfo(allMints);
  useTokenMarket(allMints);

  // Same reason as the borrow screen: the wallet popup only opens reliably when
  // the click handler has nothing left to await before asking for a signature.
  useEffect(() => {
    if (!program) return;
    const pairs = new Map<string, [string, string]>();
    for (const l of [...borrowed, ...lent]) {
      pairs.set(`${l.principal_mint}:${l.collateral_mint}`, [l.principal_mint, l.collateral_mint]);
    }
    let cancelled = false;
    (async () => {
      for (const [key, [p, c]] of pairs) {
        if (preps[key]) continue;
        try {
          const prep = await prepare(program, new PublicKey(p), new PublicKey(c));
          if (!cancelled) setPreps((cur) => ({ ...cur, [key]: prep }));
        } catch {
          /* leave it unprepared; the action falls back to loading on demand */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, borrowed, lent]);

  const prepFor = (l: { principal_mint: string; collateral_mint: string }) =>
    preps[`${l.principal_mint}:${l.collateral_mint}`];

  async function run(key: string, pending: string, success: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      const ok = await tx.run({ pending, success, fn });
      if (ok) setTimeout(() => load().catch(() => {}), 1500);
    } finally {
      setBusy(null);
    }
  }

  if (!publicKey) {
    return (
      <div className="space-y-10">
        <section>
          <p className="eyebrow">Panelim</p>
          <h1 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight">Pozisyonların</h1>
        </section>
        <EmptyState
          title="Cüzdanını bağla."
          body="Aldığın borçlar, verdiklerin ve açık ilanların burada görünür. Sağ üstten Phantom'a bağlan."
        />
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const matured = (l: Loan) => l.maturity_ts <= now;
  const activeBorrowed = borrowed.filter((l) => l.status === "active");
  const activeLent = lent.filter((l) => l.status === "active");
  const history = [
    ...borrowed.filter((l) => l.status !== "active").map((l) => ({ l, role: "Borçlu" as const })),
    ...lent.filter((l) => l.status !== "active").map((l) => ({ l, role: "Verdin" as const })),
  ].sort((a, b) => b.l.maturity_ts - a.l.maturity_ts);

  const decimals = (mint: string, fallback: number) => mints[mint]?.decimals ?? fallback;

  return (
    <div className="space-y-14">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Panelim</p>
          <h1 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight">Pozisyonların</h1>
        </div>
        <dl className="grid grid-cols-3 gap-6">
          <Stat label="Açık borç">{activeBorrowed.length}</Stat>
          <Stat label="Verdiğin">{activeLent.length}</Stat>
          <Stat label="İlanın">{offers.length}</Stat>
        </dl>
      </section>

      {apiError && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {apiError}
        </div>
      )}

      {/* ------------------------------------------------------- borrowed */}
      <section>
        <SectionHeading
          title="Aldığın borçlar"
          sub="Vade dolmadan ödersen teminatın geri gelir. Kaçırırsan teminatın tamamı karşı tarafa geçer."
        />
        {activeBorrowed.length === 0 && (
          <EmptyState
            title="Açık borcun yok."
            body="Bir teklif kabul ettiğinde geri sayımı ve ödeme düğmesi burada olur."
            action={{ href: "/", label: "Teklifleri gör" }}
          />
        )}
        <div className="space-y-4">
          {activeBorrowed.map((l) => {
            const pDec = decimals(l.principal_mint, 6);
            const cDec = decimals(l.collateral_mint, 0);
            const due = BigInt(l.principal_amount) + BigInt(l.interest_amount);
            const late = matured(l);
            // Display-only: the program holds no price feed, this is here so a
            // borrower can see where their position stands.
            const collUsd = usdValue(BigInt(l.collateral_amount), cDec, l.collateral_mint);
            const dueUsd = usdValue(due, pDec, l.principal_mint);
            const ltv =
              collUsd && collUsd > 0 && dueUsd !== undefined ? (dueUsd / collUsd) * 100 : undefined;
            const underwater = ltv !== undefined && ltv >= 100;
            return (
              <article key={l.pubkey} className="panel overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-raised/50 px-5 py-3">
                  <Pill tone={late ? "bad" : "good"}>{late ? "Vade doldu" : "Aktif"}</Pill>
                  <span className={`num text-sm ${late ? "text-bad" : "text-fg-2"}`}>
                    {timeLeft(l.maturity_ts)}
                  </span>
                  <span className="ml-auto text-xs text-muted">
                    alacaklı <span className="num text-fg-2">{shortKey(l.lender)}</span>
                  </span>
                </div>
                <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
                  <Stat
                    label="Ödeyeceğin"
                    tone="accent"
                    hint={`${fromRaw(l.principal_amount, pDec)} anapara + ${fromRaw(l.interest_amount, pDec)} faiz`}
                  >
                    {fromRaw(due, pDec)}{" "}
                    <span className="text-sm text-muted">{tokenSymbol(l.principal_mint)}</span>
                  </Stat>
                  <Stat label="Kilitli teminatın" hint={collUsd !== undefined ? formatUsd(collUsd) : undefined}>
                    {fromRaw(l.collateral_amount, cDec)}{" "}
                    <span className="text-sm text-muted">{tokenSymbol(l.collateral_mint)}</span>
                  </Stat>
                  <Stat label="Son ödeme" hint={ltv !== undefined ? `LTV %${ltv.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : undefined} tone={underwater ? "bad" : "neutral"}>
                    <span className="text-base">{formatDate(l.maturity_ts)}</span>
                  </Stat>
                </div>
                {underwater && (
                  <p className="mx-5 mb-4 rounded-xl bg-ink/60 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                    Teminatın artık borcundan az değerli. Ödemeyip teminatı bırakmak matematiksel
                    olarak daha kârlı — karar senin.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-4 border-t border-edge px-5 py-4">
                  <p className="min-w-[14rem] flex-1 text-xs leading-relaxed text-muted">
                    {late
                      ? "Vade doldu. Artık ödeme yapamazsın; alacaklı teminatına istediği an el koyabilir."
                      : "Ödeyince teminatın aynı işlemde cüzdanına döner."}
                  </p>
                  <button
                    className="btn-primary shrink-0"
                    disabled={busy !== null || late}
                    onClick={() =>
                      run(
                        l.pubkey,
                        "Geri ödeme için cüzdanda onay bekleniyor…",
                        "Borcun kapandı, teminatın cüzdanına döndü.",
                        () => repayLoan(program!, publicKey, l, prepFor(l))
                      )
                    }
                  >
                    {busy === l.pubkey ? "Cüzdanı onayla…" : "Borcu öde"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ----------------------------------------------------------- lent */}
      <section>
        <SectionHeading
          title="Verdiğin borçlar"
          sub="Vade dolduğunda karşı taraf ödemediyse teminata el koyabilirsin. Eline nakit değil, teminat token'ının kendisi geçer."
        />
        {activeLent.length === 0 && (
          <EmptyState
            title="Verdiğin açık borç yok."
            body="Biri teklifinden çektiğinde kredi burada görünür."
            action={{ href: "/lend", label: "Teklif aç" }}
          />
        )}
        <div className="space-y-4">
          {activeLent.map((l) => {
            const pDec = decimals(l.principal_mint, 6);
            const cDec = decimals(l.collateral_mint, 0);
            const claimable = matured(l);
            const owed = BigInt(l.principal_amount) + BigInt(l.interest_amount);
            const collUsd = usdValue(BigInt(l.collateral_amount), cDec, l.collateral_mint);
            const owedUsd = usdValue(owed, pDec, l.principal_mint);
            // How much collateral stands behind what is owed. Under 100% the
            // lender is already underwater if the borrower walks.
            const cover =
              owedUsd && owedUsd > 0 && collUsd !== undefined ? (collUsd / owedUsd) * 100 : undefined;
            return (
              <article key={l.pubkey} className="panel overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-raised/50 px-5 py-3">
                  <Pill tone={claimable ? "accent" : "neutral"}>
                    {claimable ? "Talep edilebilir" : "Sürüyor"}
                  </Pill>
                  <span className="num text-sm text-fg-2">{timeLeft(l.maturity_ts)}</span>
                  <span className="ml-auto text-xs text-muted">
                    borçlu <span className="num text-fg-2">{shortKey(l.borrower)}</span>
                  </span>
                </div>
                <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
                  <Stat label="Alacağın" hint={`${fromRaw(l.principal_amount, pDec)} anapara + ${fromRaw(l.interest_amount, pDec)} faiz`}>
                    {fromRaw(owed, pDec)}{" "}
                    <span className="text-sm text-muted">{tokenSymbol(l.principal_mint)}</span>
                  </Stat>
                  <Stat
                    label="Tuttuğun teminat"
                    tone={cover !== undefined && cover < 100 ? "bad" : "neutral"}
                    hint={
                      cover !== undefined
                        ? `alacağın %${cover.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}'i kadar (${formatUsd(collUsd!)})`
                        : undefined
                    }
                  >
                    {fromRaw(l.collateral_amount, cDec)}{" "}
                    <span className="text-sm text-muted">{tokenSymbol(l.collateral_mint)}</span>
                  </Stat>
                  <Stat label="Vade">
                    <span className="text-base">{formatDate(l.maturity_ts)}</span>
                  </Stat>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-edge px-5 py-4">
                  <p className="min-w-[14rem] flex-1 text-xs leading-relaxed text-muted">
                    {claimable
                      ? "Vade doldu ve ödenmedi — teminata el koyabilirsin. Küçük bir protokol payı düşülür."
                      : "Vade dolana kadar beklemekten başka yapacak bir şey yok; borçlu erken ödeyebilir."}
                  </p>
                  <button
                    className={`${claimable ? "btn-primary" : "btn-ghost"} shrink-0`}
                    disabled={busy !== null || !claimable}
                    onClick={() =>
                      run(
                        l.pubkey,
                        "Teminat talebi için cüzdanda onay bekleniyor…",
                        "Teminata el koydun, token cüzdanına geçti.",
                        () => claimDefault(program!, publicKey, l)
                      )
                    }
                  >
                    {busy === l.pubkey ? "Cüzdanı onayla…" : "Teminata el koy"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- offers */}
      <section>
        <SectionHeading
          title="Açtığın ilanlar"
          sub="İptal edersen sadece henüz çekilmemiş kısım geri döner. Çekilmiş krediler etkilenmez."
        />
        {offers.length === 0 && (
          <EmptyState title="Açık ilanın yok." action={{ href: "/lend", label: "Teklif aç" }} />
        )}
        <div className="space-y-3">
          {offers.map((o) => {
            const pDec = decimals(o.principal_mint, 6);
            const total = BigInt(o.principal_total);
            const left = BigInt(o.principal_available);
            const drawnPct = total > 0n ? Number(((total - left) * 100n) / total) : 0;
            return (
              <article key={o.pubkey} className="panel flex flex-wrap items-center gap-5 px-5 py-4">
                <div className="min-w-[16rem] flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="num font-semibold">
                      {fromRaw(left, pDec)} / {fromRaw(total, pDec)}
                    </span>
                    <TokenBadge mint={o.principal_mint} />
                    <span className="text-muted">·</span>
                    <TokenBadge mint={o.collateral_mint} /> <span className="text-xs text-muted">teminatına</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-edge">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${drawnPct}%` }} />
                  </div>
                  <div className="mt-1.5 text-xs text-muted">
                    %{drawnPct} çekildi · {formatApr(o.apr_bps)} · {formatDuration(o.duration_seconds)} ·{" "}
                    {o.loans_opened} kredi · {formatDate(o.expiry_ts)} tarihine kadar geçerli
                  </div>
                </div>
                <button
                  className="btn-danger btn-sm shrink-0"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      o.pubkey,
                      "İptal için cüzdanda onay bekleniyor…",
                      "İlan iptal edildi, kalan paran döndü.",
                      () => cancelOffer(program!, publicKey, o)
                    )
                  }
                >
                  {busy === o.pubkey ? "İşleniyor…" : "İptal et"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------------- history */}
      {history.length > 0 && (
        <section>
          <SectionHeading title="Geçmiş" sub="Kapanmış krediler — ödenenler ve temerrüde düşenler." />
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Anapara</th>
                  <th>Teminat</th>
                  <th>Sonuç</th>
                  <th className="r">Vade</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ l, role }) => (
                  <tr key={l.pubkey}>
                    <td className="text-muted">{role}</td>
                    <td className="num">
                      {fromRaw(l.principal_amount, decimals(l.principal_mint, 6))}{" "}
                      <span className="font-sans text-muted">{tokenSymbol(l.principal_mint)}</span>
                    </td>
                    <td className="num">
                      {fromRaw(l.collateral_amount, decimals(l.collateral_mint, 0))}{" "}
                      <span className="font-sans text-muted">{tokenSymbol(l.collateral_mint)}</span>
                    </td>
                    <td>
                      <Pill tone={l.status === "repaid" ? "good" : "bad"}>
                        {l.status === "repaid" ? "Ödendi" : "Temerrüt"}
                      </Pill>
                    </td>
                    <td className="r num">{formatDate(l.maturity_ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
