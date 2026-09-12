"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
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
import { useTokenMarket } from "@/lib/useTokenMarket";
import { useProgram } from "@/lib/useProgram";
import { useConfig } from "@/lib/useConfig";
import { useTokenBalance } from "@/lib/useTokenBalance";
import { useTx } from "@/lib/useTx";
import { acceptOffer, prepare, type TxPrep } from "@/lib/program";
import { tokenSymbol, usdValue, formatUsd } from "@/lib/tokens";
import { Explainer } from "@/components/Explainer";
import { TokenBadge } from "@/components/TokenBadge";
import { FreezeWarning } from "@/components/FreezeWarning";
import { EmptyState, Feature, FeeStrip, Icon, PageTitle, Pill, SectionHeading, Stat } from "@/components/ui";

const SURELER = [
  { label: "7 güne kadar", seconds: 7 * 86_400 },
  { label: "14 güne kadar", seconds: 14 * 86_400 },
  { label: "30 güne kadar", seconds: 30 * 86_400 },
];

export default function BorrowPage() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const config = useConfig();
  const tx = useTx();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [collateral, setCollateral] = useState("");
  const [amount, setAmount] = useState("500");
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
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
          setApiError(null);
          setLoaded(true);
        })
        .catch(() => setApiError("Veri sunucusuna ulaşılamıyor. Birazdan tekrar deneyeceğiz."));
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

  const allMints = [collateral, ...offers.map((o) => o.principal_mint), ...offers.map((o) => o.collateral_mint)];
  const mints = useMintInfo(allMints);
  useTokenMarket(allMints);

  const principalMint = offers[0]?.principal_mint;
  const pDec = principalMint ? mints[principalMint]?.decimals ?? 6 : 6;
  const decimalsOf = (mint: string | undefined) => (mint ? mints[mint]?.decimals ?? 0 : 0);
  const cDec = collateral === "__all__" ? 0 : decimalsOf(collateral);

  const collateralBalance = useTokenBalance(collateral === "__all__" ? undefined : collateral, busy);

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
      pairs.set(`${o.principal_mint}:${o.collateral_mint}`, [o.principal_mint, o.collateral_mint]);
    }
    let cancelled = false;
    (async () => {
      for (const [key, [principal, coll]] of pairs) {
        if (preps[key]) continue;
        try {
          const ready = await prepare(program, new PublicKey(principal), new PublicKey(coll));
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
    try {
      const ok = await tx.run({
        pending: "Borç için cüzdanda onay bekleniyor…",
        success: "Borcun açıldı. Teminatın kilitlendi, para cüzdanına geçti.",
        fn: () => acceptOffer(program, publicKey, o, drawRaw, prepFor(o)),
      });
      if (ok) setTick((t) => t + 1);
    } finally {
      setBusy(null);
    }
  }

  const activeCollateral = collateral && collateral !== "__all__" ? collateral : undefined;

  return (
    <div className="space-y-5">
      <FeeStrip />
      <PageTitle title="Borç al." marker={`${offers.length} teklif`} />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        {/* ------------------------------------------------------ main */}
        <div className="space-y-5">
          <section className="card">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="h3">Ne istiyorsun?</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                Tutarı ve teminatı yaz; aşağıdaki teklifler ona göre hesaplanır.
              </p>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="amount">
                  Ne kadar borç almak istiyorsun?
                </label>
                <div className="relative">
                  <input
                    id="amount"
                    className="field-lg num pr-20"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                    inputMode="decimal"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-muted">
                    {tokenSymbol(principalMint)}
                  </span>
                </div>
                <p className="help">Teklifi kabul ettiğin anda cüzdanına geçer.</p>
              </div>
              <div>
                <label className="label" htmlFor="collateral">
                  Neyi teminat göstereceksin?
                </label>
                <select
                  id="collateral"
                  className="field h-[52px]"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                >
                  {markets.length === 0 && <option value="">henüz piyasa yok</option>}
                  {markets.length > 0 && <option value="__all__">Tüm teminatlar</option>}
                  {markets.map((m) => (
                    <option key={m.collateral_mint} value={m.collateral_mint}>
                      {tokenSymbol(m.collateral_mint)} — {m.offer_count} teklif
                    </option>
                  ))}
                </select>
                <p className="help">
                  {collateral === "__all__"
                    ? "Her teminattaki teklifler birlikte listeleniyor."
                    : !activeCollateral
                      ? "Bir teminat seçince kaç teklif olduğu burada görünecek."
                      : collateralBalance === null
                        ? "Cüzdanını bağlayınca bakiyen burada görünecek."
                        : `Cüzdanında ${fromRaw(collateralBalance, cDec)} ${tokenSymbol(collateral)} var.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
              <span className="eyebrow mr-1">Vade</span>
              {SURELER.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setMaxDuration((cur) => (cur === d.seconds ? null : d.seconds))}
                  className={`chip ${maxDuration === d.seconds ? "chip-active" : ""}`}
                >
                  {d.label}
                </button>
              ))}
              {maxDuration !== null && (
                <button
                  onClick={() => setMaxDuration(null)}
                  className="ml-1 text-[12px] font-medium text-muted hover:text-fg"
                >
                  temizle
                </button>
              )}
            </div>
          </section>

          {apiError && (
            <div className="rounded-field border border-bad/20 bg-bad-soft px-4 py-3 text-[13px] text-bad">
              {apiError}
            </div>
          )}

          <section>
            <SectionHeading
              title="Sana para vermeye hazır olanlar"
              right={
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  Sırala
                  <select
                    className="field h-9 w-auto text-[12px]"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                  >
                    <option value="apr">en ucuz önce</option>
                    <option value="newest">en yeni önce</option>
                    <option value="size">en büyük önce</option>
                  </select>
                </label>
              }
            />

            {loaded && offers.length === 0 && (
              <EmptyState
                title="Bu teminat için henüz teklif yok."
                body="Defter iki taraflı: biri para vermeye hazır olana kadar burası boş kalır. İstersen sen açabilirsin."
                action={{ href: "/lend", label: "Teklif aç" }}
              />
            )}

            <div className="space-y-4">
              {offers.map((o) => {
                const oDec = decimalsOf(o.collateral_mint);
                const sym = tokenSymbol(o.principal_mint);
                const need = collateralFor(drawRaw, BigInt(o.principal_total), BigInt(o.collateral_total));
                const interest = interestFor(drawRaw, o.apr_bps, o.duration_seconds);
                const origination = config ? feeOf(interest, config.originationFeeBps) : 0n;
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
                  drawRaw > 0n && drawRaw <= available && (drawRaw >= BigInt(o.min_draw) || drawRaw === available);
                const enoughCollateral =
                  collateral === "__all__" || collateralBalance === null || collateralBalance >= need;
                const usable = enoughLiquidity && enoughCollateral;
                const ready = !!prepFor(o);
                const hasNote =
                  (breakEvenDrop !== undefined && breakEvenDrop > 0) ||
                  !!mints[o.collateral_mint]?.freezeAuthority ||
                  !!mints[o.principal_mint]?.freezeAuthority;

                return (
                  <article key={o.pubkey} className={`card overflow-hidden ${usable ? "" : "opacity-60"}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3">
                      <div className="flex items-center gap-2 text-[13px]">
                        <TokenBadge mint={o.collateral_mint} size="md" />
                        <span className="text-muted">→</span>
                        <TokenBadge mint={o.principal_mint} size="md" />
                      </div>
                      <span className="text-[12px] text-muted">
                        teklif sahibi <span className="num text-fg-2">{shortKey(o.lender)}</span>
                        {o.created_at ? ` · ${timeAgo(o.created_at)}` : ""}
                      </span>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="num font-display text-[20px] font-semibold text-accent">
                          {formatApr(o.apr_bps)}
                        </span>
                        <span className="-ml-2 text-[11px] text-muted">yıllık</span>
                        <Pill>{formatDuration(o.duration_seconds)}</Pill>
                      </div>
                    </div>

                    <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
                      <Stat label="Kilitleyeceğin teminat">
                        {fromRaw(need, oDec)}{" "}
                        <span className="text-[12px] font-medium text-muted">{tokenSymbol(o.collateral_mint)}</span>
                      </Stat>
                      <Stat label="Eline geçecek" tone="accent">
                        {fromRaw(received, pDec)} <span className="text-[12px] font-medium text-muted">{sym}</span>
                      </Stat>
                      <Stat
                        label="Geri ödeyeceğin"
                        hint={`${fromRaw(interest, pDec)} faiz${
                          config ? ` + ${fromRaw(origination, pDec)} açılış ücreti` : ""
                        }`}
                      >
                        {fromRaw(repay, pDec)} <span className="text-[12px] font-medium text-muted">{sym}</span>
                      </Stat>
                    </div>

                    <dl className="grid gap-x-6 gap-y-2 border-t border-line bg-page/60 px-5 py-3.5 text-[12px] sm:grid-cols-3">
                      <div>
                        <dt className="text-muted">Son ödeme tarihi</dt>
                        <dd className="num mt-0.5 font-medium text-fg">{formatDate(dueAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Toplam maliyet</dt>
                        <dd className="num mt-0.5 font-medium text-fg">
                          {fromRaw(totalCost, pDec)} {sym}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Teminat oranı (LTV)</dt>
                        <dd className="num mt-0.5 font-medium text-fg">
                          {ltv === undefined ? (
                            <span className="text-muted">fiyat yok</span>
                          ) : (
                            <>
                              %{ltv.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                              <span className="ml-1.5 font-normal text-muted">{formatUsd(collateralUsd!)} teminat</span>
                            </>
                          )}
                        </dd>
                      </div>
                    </dl>

                    {hasNote && (
                      <div className="border-t border-line px-5 py-4">
                        {breakEvenDrop !== undefined && breakEvenDrop > 0 && (
                          <p className="text-[12px] leading-relaxed text-fg-2">
                            {tokenSymbol(o.collateral_mint)}{" "}
                            <span className="num font-semibold text-fg">
                              %{breakEvenDrop.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                            </span>{" "}
                            düşerse borcun teminatından değerli hale gelir — o noktadan sonra ödememek daha
                            kârlı olur.
                          </p>
                        )}
                        <FreezeWarning mint={o.collateral_mint} role="collateral" info={mints[o.collateral_mint]} />
                        <FreezeWarning mint={o.principal_mint} role="principal" info={mints[o.principal_mint]} />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4">
                      <p className="min-w-[14rem] flex-1 text-[12px] leading-relaxed text-muted">
                        {!enoughLiquidity && drawRaw > available ? (
                          <span className="text-bad">
                            Bu teklifte sadece {fromRaw(available, pDec)} {sym} kaldı. Daha düşük bir tutar dene.
                          </span>
                        ) : !enoughLiquidity && drawRaw > 0n ? (
                          <span className="text-bad">
                            En az {fromRaw(BigInt(o.min_draw), pDec)} {sym} çekilebilir.
                          </span>
                        ) : !enoughCollateral ? (
                          <span className="text-bad">
                            Cüzdanında {fromRaw(need, oDec)} {tokenSymbol(o.collateral_mint)} yok.
                          </span>
                        ) : (
                          <>
                            Ödemezsen {fromRaw(need, oDec)} {tokenSymbol(o.collateral_mint)} teklif sahibine geçer,{" "}
                            {fromRaw(received, pDec)} {sym} sende kalır.
                          </>
                        )}
                      </p>
                      <button
                        className="btn-primary shrink-0"
                        disabled={!usable || !program || !ready || busy !== null}
                        onClick={() => onBorrow(o)}
                        title={!ready && program ? "Zincir bilgileri okunuyor…" : undefined}
                      >
                        {busy === o.pubkey ? "Cüzdanı onayla…" : !ready && program ? "Hazırlanıyor…" : "Borç al"}
                        {Icon.arrow}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {!publicKey && offers.length > 0 && (
              <p className="mt-3 text-center text-[12px] text-muted">
                Teklif kabul etmek için sağ üstten cüzdanını bağla.
              </p>
            )}
          </section>

          <section>
            <SectionHeading title="Sık sorulanlar" />
            <Explainer />
          </section>
        </div>

        {/* ------------------------------------------------------ side */}
        <aside className="space-y-5 lg:sticky lg:top-5">
          <div className="card p-5">
            <p className="eyebrow">Nasıl çalışır</p>
            <h2 className="h2 mt-2">
              Kilitle, nakde çık.
              <br />
              <span className="text-accent">Vade dolunca öde.</span>
            </h2>
            <p className="mt-3 text-[12px] leading-relaxed text-fg-2">
              Token'ın vade boyunca bir kasada durur; fiyat ne yaparsa yapsın kimse dokunamaz. Vade dolmadan
              ödersen geri gelir, ödemezsen teklif sahibine geçer — para sende kalır.
            </p>
            <Timeline />
          </div>

          <div>
            <p className="eyebrow mb-3">Her kredide</p>
            <ul className="space-y-3.5">
              <Feature icon={Icon.clock} title="Sabit vade">
                Ne zaman ödeyeceğin baştan belli. Erken ödeme serbest, uzatma yok.
              </Feature>
              <Feature icon={Icon.shield} title="Likidasyon yok">
                Fiyat düşünce teminatın satılmaz. Tek belirleyici şey zaman.
              </Feature>
              <Feature icon={Icon.eyeOff} title="Fiyat okunmaz">
                Oracle yok. Riski teklif sahibi bir kez fiyatladı; kartta görüyorsun.
              </Feature>
            </ul>
          </div>

          <p className="text-[11px] leading-relaxed text-muted">
            Dolar değerleri ve LTV yalnızca kıyas içindir; zincirde fiyat yoktur. Vadeyi kaçırırsan teminatın
            tamamı gider, fazlası iade edilmez.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** A loan's life on one line: lock, wait, settle. */
function Timeline() {
  return (
    <svg viewBox="0 0 280 64" className="mt-5 w-full" aria-hidden>
      <line x1="16" y1="32" x2="264" y2="32" stroke="#dbe1e9" strokeWidth="2" />
      <line x1="16" y1="32" x2="140" y2="32" stroke="#3564dc" strokeWidth="2" />
      <circle cx="16" cy="32" r="6" fill="#3564dc" />
      <circle cx="140" cy="32" r="6" fill="#ffffff" stroke="#3564dc" strokeWidth="2" />
      <circle cx="264" cy="32" r="6" fill="#ffffff" stroke="#dbe1e9" strokeWidth="2" />
      <text x="16" y="54" fontSize="9" fill="#7b879c" textAnchor="start" fontFamily="inherit">kilit</text>
      <text x="140" y="54" fontSize="9" fill="#3564dc" textAnchor="middle" fontFamily="inherit" fontWeight="600">bugün</text>
      <text x="264" y="54" fontSize="9" fill="#7b879c" textAnchor="end" fontFamily="inherit">vade</text>
      <text x="16" y="18" fontSize="9" fill="#7b879c" textAnchor="start" fontFamily="inherit">nakit cüzdanda</text>
      <text x="264" y="18" fontSize="9" fill="#7b879c" textAnchor="end" fontFamily="inherit">öde ya da bırak</text>
    </svg>
  );
}
