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
  timeAgo,
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
import { tokenSymbol, usdValue, formatUsd } from "@/lib/tokens";

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
  const [preps, setPreps] = useState<Record<string, TxPrep>>({});
  const [sort, setSort] = useState<"apr" | "newest" | "size">("apr");

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetchMarkets()
        .then((all) => {
          if (stop) return;
          // Markets with nothing on offer and nothing outstanding are history.
          const m = all.filter((x) => x.offer_count > 0 || x.active_loans > 0);
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
    // "__all__" is a view, not a mint — skip the balance and decimals lookups
    // that assume a single collateral.
    fetchOffers({
      collateral_mint: collateral === "__all__" ? undefined : collateral,
      max_duration: maxDuration ?? undefined,
      sort,
    })
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [collateral, maxDuration, sort, tick, busy]);

  const mints = useMintInfo([
    collateral,
    ...offers.map((o) => o.principal_mint),
    ...offers.map((o) => o.collateral_mint),
  ]);

  const principalMint = offers[0]?.principal_mint;
  const pDec = principalMint ? mints[principalMint]?.decimals ?? 6 : 6;
  const decimalsOf = (mint: string | undefined) =>
    mint ? mints[mint]?.decimals ?? 0 : 0;
  const cDec = collateral === "__all__" ? 0 : decimalsOf(collateral);

  const collateralBalance = useTokenBalance(
    collateral === "__all__" ? undefined : collateral,
    busy
  );

  // Warm the on-chain lookups now, one set per token pair on screen.
  //
  // Doing them inside the click handler costs a couple of seconds, and a wallet
  // extension's approval popup is suppressed once the browser stops treating
  // the call as part of the user's gesture. The all-collaterals view can list
  // several pairs at once, so they are keyed rather than held singly.
  useEffect(() => {
    if (!program || offers.length === 0) return;
    const pairs = new Map<string, [string, string]>();
    for (const o of offers) {
      pairs.set(`${o.principal_mint}:${o.collateral_mint}`, [
        o.principal_mint,
        o.collateral_mint,
      ]);
    }
    let cancelled = false;
    (async () => {
      for (const [key, [principal, coll]] of pairs) {
        if (preps[key]) continue;
        try {
          const ready = await prepare(
            program,
            new PublicKey(principal),
            new PublicKey(coll)
          );
          if (!cancelled) setPreps((cur) => ({ ...cur, [key]: ready }));
        } catch {
          // Leave it unprepared; accepting falls back to loading on demand.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, offers]);

  const prepFor = (o: Offer) => preps[`${o.principal_mint}:${o.collateral_mint}`];

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
        acceptOffer(program, publicKey, o, drawRaw, prepFor(o)),
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
              {markets.length > 0 && (
                <option value="__all__">Tüm teminatlar</option>
              )}
              {markets.map((m) => (
                <option key={m.collateral_mint} value={m.collateral_mint}>
                  {tokenSymbol(m.collateral_mint)} — {m.offer_count} teklif
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              {collateral === "__all__"
                ? "Her teminattaki teklifler birlikte listeleniyor."
                : collateralBalance === null
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Sana para vermeye hazır olanlar
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{offers.length} teklif</span>
            <span>·</span>
            <label htmlFor="sort" className="sr-only">
              Sıralama
            </label>
            <select
              id="sort"
              className="rounded-lg border border-edge bg-ink px-2 py-1 text-xs outline-none focus:border-accent/60"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="apr">en ucuz önce</option>
              <option value="newest">en yeni önce</option>
              <option value="size">en büyük önce</option>
            </select>
          </div>
        </div>

        {offers.length === 0 && (
          <div className="panel p-10 text-center text-sm text-muted">
            Bu teminat için henüz teklif yok.
          </div>
        )}

        {offers.map((o) => {
          const oDec = decimalsOf(o.collateral_mint);
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

          // Display-only. The program never reads a price; this exists so two
          // offers denominated in different tokens can be compared by eye.
          const collateralUsd = usdValue(need, oDec, o.collateral_mint);
          const repayUsd = usdValue(repay, pDec, o.principal_mint);
          const ltv =
            collateralUsd && collateralUsd > 0 && repayUsd !== undefined
              ? (usdValue(drawRaw, pDec, o.principal_mint)! / collateralUsd) * 100
              : undefined;
          // Below this the debt exceeds the collateral, and walking away is the
          // cheaper choice — the number a borrower actually needs.
          const breakEvenDrop =
            collateralUsd && collateralUsd > 0 && repayUsd !== undefined
              ? ((collateralUsd - repayUsd) / collateralUsd) * 100
              : undefined;

          const available = BigInt(o.principal_available);
          const enoughLiquidity =
            drawRaw > 0n &&
            drawRaw <= available &&
            (drawRaw >= BigInt(o.min_draw) || drawRaw === available);
          const enoughCollateral =
            collateral === "__all__" ||
            collateralBalance === null ||
            collateralBalance >= need;
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
                  {o.created_at ? ` · ${timeAgo(o.created_at)}` : ""}
                </span>
              </div>

              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3 sm:contents">
                  <dt className="text-muted sm:py-0.5">Kilitleyeceğin teminat</dt>
                  <dd className="text-right font-medium sm:py-0.5">
                    {fromRaw(need, oDec)} <TokenBadge mint={o.collateral_mint} />
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
                {ltv !== undefined && (
                  <div className="flex justify-between gap-3 sm:contents">
                    <dt className="text-muted sm:py-0.5">Teminat oranı (LTV)</dt>
                    <dd className="text-right sm:py-0.5">
                      %{ltv.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                      <span className="ml-1.5 text-xs text-muted">
                        ({formatUsd(collateralUsd!)} teminat)
                      </span>
                    </dd>
                  </div>
                )}
              </dl>

              {breakEvenDrop !== undefined && breakEvenDrop > 0 && (
                <p className="mt-3 rounded-lg bg-ink/60 px-3 py-2 text-xs leading-relaxed text-muted">
                  {tokenSymbol(o.collateral_mint)}{" "}
                  <span className="font-medium text-neutral-200">
                    %{breakEvenDrop.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                  </span>{" "}
                  düşerse borcun teminatından değerli hale gelir — o noktadan
                  sonra ödememek daha kârlı olur.
                </p>
              )}

              <div className="mt-4 flex items-center gap-4 border-t border-edge pt-4">
                <p className="flex-1 text-xs leading-relaxed text-muted">
                  {!enoughLiquidity && drawRaw > available ? (
                    <span className="text-red-300">
                      Bu teklifte sadece {fromRaw(available, pDec)}{" "}
                      {tokenSymbol(o.principal_mint)} kaldı. Daha düşük bir tutar dene.
                    </span>
                  ) : !enoughCollateral ? (
                    <span className="text-red-300">
                      Cüzdanında {fromRaw(need, oDec)} {tokenSymbol(o.collateral_mint)} yok.
                    </span>
                  ) : (
                    <>
                      Ödemezsen {fromRaw(need, oDec)} {tokenSymbol(o.collateral_mint)}{" "}
                      teklif sahibine geçer, {fromRaw(received, pDec)}{" "}
                      {tokenSymbol(o.principal_mint)} sende kalır.
                    </>
                  )}
                </p>
                <button
                  className="btn-primary shrink-0"
                  disabled={!usable || !program || !prepFor(o) || busy !== null}
                  onClick={() => onBorrow(o)}
                  title={
                    !prepFor(o) && program ? "Zincir bilgileri okunuyor…" : undefined
                  }
                >
                  {busy === o.pubkey
                    ? "Cüzdanı onayla…"
                    : !prepFor(o) && program
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
