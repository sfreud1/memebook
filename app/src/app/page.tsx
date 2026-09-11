"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchMarkets, fetchOffers, type Market, type Offer } from "@/lib/api";
import {
  collateralFor,
  feeOf,
  formatApr,
  formatDate,
  formatDuration,
  fromRaw,
  interestFor,
  shortKey,
  toRaw,
} from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useProgram } from "@/lib/useProgram";
import { useConfig } from "@/lib/useConfig";
import { useTokenBalance } from "@/lib/useTokenBalance";
import { acceptOffer, prepare, type TxPrep } from "@/lib/program";
import { PublicKey } from "@solana/web3.js";
import { Explainer } from "@/components/Explainer";
import { TokenBadge } from "@/components/TokenBadge";
import { tokenSymbol } from "@/lib/tokens";

const SURELER = [
  { label: "7 güne kadar", seconds: 7 * 86_400 },
  { label: "14 güne kadar", seconds: 14 * 86_400 },
  { label: "30 güne kadar", seconds: 30 * 86_400 },
];

export default function BorrowPage() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const config = useConfig();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [collateral, setCollateral] = useState("");
  const [amount, setAmount] = useState("500");
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [prep, setPrep] = useState<TxPrep | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetchMarkets()
        .then((m) => {
          if (stop) return;
          setMarkets(m);
          setCollateral((c) => c || m[0]?.collateral_mint || "");
          setError(null);
        })
        .catch(() =>
          setError("Veri sunucusuna ulaşılamıyor. Arka uç çalışıyor mu?")
        );
    load();
    // Retry on a timer: a first load that lands before the API is up must not
    // leave the page stuck on an empty book forever.
    const id = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [tick]);

  useEffect(() => {
    if (!collateral) return;
    fetchOffers({
      collateral_mint: collateral,
      max_duration: maxDuration ?? undefined,
      sort: "apr",
    })
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [collateral, maxDuration, tick, busy]);

  const mints = useMintInfo([
    collateral,
    ...offers.map((o) => o.principal_mint),
    ...offers.map((o) => o.collateral_mint),
  ]);

  const principalMint = offers[0]?.principal_mint;
  const pDec = principalMint ? mints[principalMint]?.decimals ?? 6 : 6;
  const cDec = collateral ? mints[collateral]?.decimals ?? 0 : 0;

  const collateralBalance = useTokenBalance(collateral, busy);

  // Warm the on-chain lookups now. Doing them inside the click handler costs a
  // couple of seconds, and the wallet's approval popup is suppressed once the
  // browser no longer considers the call part of the user's gesture.
  useEffect(() => {
    let cancelled = false;
    setPrep(null);
    if (!program || !principalMint || !collateral) return;
    prepare(program, new PublicKey(principalMint), new PublicKey(collateral))
      .then((p) => {
        if (!cancelled) setPrep(p);
      })
      .catch(() => {
        if (!cancelled) setError("Zincir bilgileri okunamadı. Ağ bağlantını kontrol et.");
      });
    return () => {
      cancelled = true;
    };
  }, [program, principalMint, collateral]);

  const drawRaw = useMemo(() => {
    try {
      return toRaw(amount || "0", pDec);
    } catch {
      return 0n;
    }
  }, [amount, pDec]);

  async function onBorrow(o: Offer) {
    if (!program || !publicKey) return;
    setBusy(o.pubkey);
    setDone(null);
    setError(null);
    try {
      // If the signature never comes back the button must not spin forever.
      await Promise.race([
        acceptOffer(program, publicKey, o, drawRaw, prep ?? undefined),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Cüzdan yanıt vermedi. Phantom penceresi açıldı mı?")),
            90_000
          )
        ),
      ]);
      setDone(
        "Borcun açıldı. Teminatın kilitlendi, para cüzdanına geçti. Panelinden takip edebilirsin."
      );
      setTick((t) => t + 1);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(
        raw.includes("insufficient") || raw.includes("0x1")
          ? "Cüzdanında yeterli teminat yok gibi görünüyor."
          : `İşlem tamamlanamadı: ${raw}`
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Token'ını satmadan
          <br />
          <span className="text-accent">nakde çevir.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Elindeki token'ı teminat olarak kilitliyorsun, karşılığında nakit
          alıyorsun. Vade dolmadan ödersen token'ın geri geliyor. Fiyat ne
          yaparsa yapsın vade boyunca kimse teminatına dokunamaz —{" "}
          <span className="text-neutral-200">likidasyon yok.</span>
        </p>
      </header>

      <section className="panel p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Ne kadar borç almak istiyorsun?</label>
            <div className="relative">
              <input
                className="field text-2xl"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                {tokenSymbol(principalMint)}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Bu tutar teklif kabul edildiği anda cüzdanına geçer.
            </p>
          </div>

          <div>
            <label className="label">Neyi teminat göstereceksin?</label>
            <select
              className="field"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
            >
              {markets.length === 0 && <option value="">henüz piyasa yok</option>}
              {markets.map((m) => (
                <option key={m.collateral_mint} value={m.collateral_mint}>
                  {tokenSymbol(m.collateral_mint)} — {m.offer_count} teklif
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              {collateralBalance === null
                ? "Cüzdanını bağlayınca bakiyen burada görünecek."
                : `Cüzdanında ${fromRaw(collateralBalance, cDec)} ${tokenSymbol(collateral)} var.`}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-edge pt-4">
          <span className="text-xs text-muted">Vade filtresi:</span>
          {SURELER.map((d) => (
            <button
              key={d.label}
              onClick={() =>
                setMaxDuration((cur) => (cur === d.seconds ? null : d.seconds))
              }
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                maxDuration === d.seconds
                  ? "bg-accent font-semibold text-ink"
                  : "border border-edge text-muted hover:text-neutral-200"
              }`}
            >
              {d.label}
            </button>
          ))}
          {maxDuration !== null && (
            <button
              onClick={() => setMaxDuration(null)}
              className="text-xs text-muted underline hover:text-neutral-200"
            >
              temizle
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="panel border-red-500/40 p-4 text-sm text-red-300">{error}</div>
      )}
      {done && (
        <div className="panel border-accent/40 p-4 text-sm text-accent">{done}</div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            Sana para vermeye hazır olanlar
          </h2>
          <span className="text-xs text-muted">
            {offers.length} teklif · en ucuzdan sıralı
          </span>
        </div>

        {offers.length === 0 && (
          <div className="panel p-10 text-center text-sm text-muted">
            Bu teminat için henüz teklif yok.
          </div>
        )}

        {offers.map((o) => {
          const need = collateralFor(
            drawRaw,
            BigInt(o.principal_total),
            BigInt(o.collateral_total)
          );
          const interest = interestFor(drawRaw, o.apr_bps, o.duration_seconds);
          const origination = config
            ? feeOf(interest, config.originationFeeBps)
            : 0n;
          const totalCost = interest + origination;
          const received = drawRaw - origination;
          const repay = drawRaw + interest;
          const dueAt = Math.floor(Date.now() / 1000) + o.duration_seconds;

          const available = BigInt(o.principal_available);
          const enoughLiquidity =
            drawRaw > 0n &&
            drawRaw <= available &&
            (drawRaw >= BigInt(o.min_draw) || drawRaw === available);
          const enoughCollateral =
            collateralBalance === null || collateralBalance >= need;
          const usable = enoughLiquidity && enoughCollateral;

          return (
            <article
              key={o.pubkey}
              className={`panel p-5 ${usable ? "" : "opacity-60"}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-muted">
                  Teklif sahibi{" "}
                  <span className="text-neutral-200">{shortKey(o.lender)}</span>
                </span>
                <span className="text-xs text-muted">
                  {formatApr(o.apr_bps)} yıllık faiz · {formatDuration(o.duration_seconds)} vade
                </span>
              </div>

              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3 sm:contents">
                  <dt className="text-muted sm:py-0.5">Kilitleyeceğin teminat</dt>
                  <dd className="text-right font-medium sm:py-0.5">
                    {fromRaw(need, cDec)} <TokenBadge mint={o.collateral_mint} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:contents">
                  <dt className="text-muted sm:py-0.5">Eline geçecek</dt>
                  <dd className="text-right font-medium text-accent sm:py-0.5">
                    {fromRaw(received, pDec)} <TokenBadge mint={o.principal_mint} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:contents">
                  <dt className="text-muted sm:py-0.5">Toplam maliyetin</dt>
                  <dd className="text-right sm:py-0.5">
                    {fromRaw(totalCost, pDec)} {tokenSymbol(o.principal_mint)}
                    <span className="ml-1.5 text-xs text-muted">
                      ({fromRaw(interest, pDec)} faiz
                      {config ? ` + ${fromRaw(origination, pDec)} açılış ücreti` : ""})
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:contents">
                  <dt className="text-muted sm:py-0.5">Geri ödeyeceğin</dt>
                  <dd className="text-right font-medium sm:py-0.5">
                    {fromRaw(repay, pDec)} <TokenBadge mint={o.principal_mint} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:contents">
                  <dt className="text-muted sm:py-0.5">Son ödeme tarihi</dt>
                  <dd className="text-right sm:py-0.5">{formatDate(dueAt)}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center gap-4 border-t border-edge pt-4">
                <p className="flex-1 text-xs leading-relaxed text-muted">
                  {!enoughLiquidity && drawRaw > available ? (
                    <span className="text-red-300">
                      Bu teklifte sadece {fromRaw(available, pDec)}{" "}
                      {tokenSymbol(o.principal_mint)} kaldı. Daha düşük bir tutar dene.
                    </span>
                  ) : !enoughCollateral ? (
                    <span className="text-red-300">
                      Cüzdanında {fromRaw(need, cDec)} {tokenSymbol(o.collateral_mint)} yok.
                    </span>
                  ) : (
                    <>
                      Ödemezsen {fromRaw(need, cDec)} {tokenSymbol(o.collateral_mint)}{" "}
                      teklif sahibine geçer, {fromRaw(received, pDec)}{" "}
                      {tokenSymbol(o.principal_mint)} sende kalır.
                    </>
                  )}
                </p>
                <button
                  className="btn-primary shrink-0"
                  disabled={!usable || !program || !prep || busy !== null}
                  onClick={() => onBorrow(o)}
                  title={!prep && program ? "Zincir bilgileri okunuyor…" : undefined}
                >
                  {busy === o.pubkey
                    ? "Cüzdanı onayla…"
                    : !prep && program
                      ? "Hazırlanıyor…"
                      : "Borç Al"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {!publicKey && (
        <p className="text-center text-xs text-muted">
          Teklif kabul etmek için sağ üstten cüzdanını bağla.
        </p>
      )}

      <div className="pt-4">
        <h2 className="mb-3 text-sm font-semibold">Sık sorulanlar</h2>
        <Explainer />
      </div>
    </div>
  );
}
