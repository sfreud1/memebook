"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchLoans, fetchOffers, type Loan, type Offer } from "@/lib/api";
import {
  formatApr,
  formatDate,
  formatDuration,
  fromRaw,
  shortKey,
  timeLeft,
} from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useProgram } from "@/lib/useProgram";
import { cancelOffer, claimDefault, repayLoan } from "@/lib/program";
import { TokenBadge } from "@/components/TokenBadge";
import { tokenSymbol } from "@/lib/tokens";

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const program = useProgram();

  const [borrowed, setBorrowed] = useState<Loan[]>([]);
  const [lent, setLent] = useState<Loan[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

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
  }, [publicKey]);

  useEffect(() => {
    load().catch(() => setError("Veri sunucusuna ulaşılamıyor."));
  }, [load]);

  // Keep the countdowns honest without a page refresh.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const mints = useMintInfo([
    ...borrowed.flatMap((l) => [l.principal_mint, l.collateral_mint]),
    ...lent.flatMap((l) => [l.principal_mint, l.collateral_mint]),
    ...offers.flatMap((o) => [o.principal_mint, o.collateral_mint]),
  ]);

  async function run(key: string, label: string, fn: () => Promise<string>) {
    setBusy(key);
    setDone(null);
    setError(null);
    try {
      await fn();
      setDone(label);
      setTimeout(() => load().catch(() => {}), 1500);
    } catch (e) {
      setError(
        `İşlem tamamlanamadı: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(null);
    }
  }

  if (!publicKey) {
    return (
      <div className="panel p-12 text-center">
        <p className="text-sm text-muted">
          Pozisyonlarını görmek için sağ üstten cüzdanını bağla.
        </p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const matured = (l: Loan) => l.maturity_ts <= now;
  const activeBorrowed = borrowed.filter((l) => l.status === "active");
  const activeLent = lent.filter((l) => l.status === "active");

  return (
    <div className="space-y-8">
      {error && (
        <div className="panel border-red-500/40 p-4 text-sm text-red-300">{error}</div>
      )}
      {done && (
        <div className="panel border-accent/40 p-4 text-sm text-accent">{done}</div>
      )}

      <section>
        <h2 className="text-sm font-semibold">Aldığın borçlar</h2>
        <p className="mb-3 mt-1 text-xs text-muted">
          Vade dolmadan ödersen teminatın geri gelir. Kaçırırsan teminatın tamamı
          karşı tarafa geçer.
        </p>
        <div className="space-y-2">
          {activeBorrowed.length === 0 && (
            <div className="panel p-8 text-center text-sm text-muted">
              Açık borcun yok.
            </div>
          )}
          {activeBorrowed.map((l) => {
            const pDec = mints[l.principal_mint]?.decimals ?? 6;
            const cDec = mints[l.collateral_mint]?.decimals ?? 0;
            const due = BigInt(l.principal_amount) + BigInt(l.interest_amount);
            const late = matured(l);
            return (
              <article key={l.pubkey} className="panel p-5">
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Ödeyeceğin</dt>
                    <dd className="text-right font-medium sm:py-0.5">
                      {fromRaw(due, pDec)} <TokenBadge mint={l.principal_mint} />
                      <span className="ml-1.5 text-xs text-muted">
                        ({fromRaw(l.principal_amount, pDec)} anapara +{" "}
                        {fromRaw(l.interest_amount, pDec)} faiz)
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Kilitli teminatın</dt>
                    <dd className="text-right sm:py-0.5">
                      {fromRaw(l.collateral_amount, cDec)}{" "}
                      <TokenBadge mint={l.collateral_mint} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Son ödeme</dt>
                    <dd className="text-right sm:py-0.5">
                      {formatDate(l.maturity_ts)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-4 border-t border-edge pt-4">
                  <p className="flex-1 text-xs">
                    {late ? (
                      <span className="text-red-300">
                        Vade doldu. Ödeme yapamazsın; teklif sahibi teminatına
                        istediği an el koyabilir.
                      </span>
                    ) : (
                      <span className="text-muted">{timeLeft(l.maturity_ts)}</span>
                    )}
                  </p>
                  <button
                    className="btn-primary shrink-0"
                    disabled={busy !== null || late}
                    onClick={() =>
                      run(
                        l.pubkey,
                        "Borcun kapandı, teminatın cüzdanına geri döndü.",
                        () => repayLoan(program!, publicKey, l)
                      )
                    }
                  >
                    {busy === l.pubkey ? "İşleniyor…" : "Borcu Öde"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Verdiğin borçlar</h2>
        <p className="mb-3 mt-1 text-xs text-muted">
          Vade dolduğunda karşı taraf ödemediyse teminata el koyabilirsin. Eline
          USDC değil, teminat token'ının kendisi geçer.
        </p>
        <div className="space-y-2">
          {activeLent.length === 0 && (
            <div className="panel p-8 text-center text-sm text-muted">
              Verdiğin açık borç yok.
            </div>
          )}
          {activeLent.map((l) => {
            const pDec = mints[l.principal_mint]?.decimals ?? 6;
            const cDec = mints[l.collateral_mint]?.decimals ?? 0;
            const claimable = matured(l);
            return (
              <article key={l.pubkey} className="panel p-5">
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Verdiğin</dt>
                    <dd className="text-right font-medium sm:py-0.5">
                      {fromRaw(l.principal_amount, pDec)}{" "}
                      <TokenBadge mint={l.principal_mint} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Tuttuğun teminat</dt>
                    <dd className="text-right sm:py-0.5">
                      {fromRaw(l.collateral_amount, cDec)}{" "}
                      <TokenBadge mint={l.collateral_mint} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Borçlu</dt>
                    <dd className="text-right sm:py-0.5">{shortKey(l.borrower)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Vade</dt>
                    <dd className="text-right sm:py-0.5">
                      {formatDate(l.maturity_ts)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-4 border-t border-edge pt-4">
                  <p className="flex-1 text-xs">
                    {claimable ? (
                      <span className="text-accent">
                        Vade doldu ve ödenmedi — teminata el koyabilirsin.
                      </span>
                    ) : (
                      <span className="text-muted">{timeLeft(l.maturity_ts)}</span>
                    )}
                  </p>
                  <button
                    className="btn-ghost shrink-0"
                    disabled={busy !== null || !claimable}
                    onClick={() =>
                      run(
                        l.pubkey,
                        "Teminata el koydun, token cüzdanına geçti.",
                        () => claimDefault(program!, publicKey, l)
                      )
                    }
                  >
                    {busy === l.pubkey ? "İşleniyor…" : "Teminata El Koy"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Açtığın teklifler</h2>
        <p className="mb-3 mt-1 text-xs text-muted">
          İptal edersen sadece henüz çekilmemiş kısım geri döner. Çekilmiş
          krediler etkilenmez.
        </p>
        <div className="space-y-2">
          {offers.length === 0 && (
            <div className="panel p-8 text-center text-sm text-muted">
              Açık teklifin yok.
            </div>
          )}
          {offers.map((o) => {
            const pDec = mints[o.principal_mint]?.decimals ?? 6;
            return (
              <article key={o.pubkey} className="panel flex items-center gap-4 p-5">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">
                    {fromRaw(o.principal_available, pDec)} /{" "}
                    {fromRaw(o.principal_total, pDec)}{" "}
                    {tokenSymbol(o.principal_mint)} çekilmeyi bekliyor
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {tokenSymbol(o.collateral_mint)} teminatına karşılık ·{" "}
                    {formatApr(o.apr_bps)} · {formatDuration(o.duration_seconds)} ·{" "}
                    {o.loans_opened} kredi çekilmiş
                  </div>
                </div>
                <button
                  className="btn-ghost shrink-0"
                  disabled={busy !== null}
                  onClick={() =>
                    run(o.pubkey, "Teklif iptal edildi, kalan paran döndü.", () =>
                      cancelOffer(program!, publicKey, o)
                    )
                  }
                >
                  {busy === o.pubkey ? "İşleniyor…" : "İptal Et"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
