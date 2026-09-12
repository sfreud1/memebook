"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchMarkets, type Market } from "@/lib/api";
import {
  feeOf,
  formatApr,
  formatDuration,
  fromRaw,
  interestFor,
  toRaw,
} from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useProgram } from "@/lib/useProgram";
import { useConfig } from "@/lib/useConfig";
import { useTx } from "@/lib/useTx";
import { createOffer } from "@/lib/program";
import { TokenBadge } from "@/components/TokenBadge";
import { knownTokens, defaultPair, suggestCollateral, tokenSymbol, usdValue, formatUsd } from "@/lib/tokens";
import { useTokenMarket } from "@/lib/useTokenMarket";
import { MIN_DURATION_SECONDS } from "@/lib/network";
import { FreezeWarning } from "@/components/FreezeWarning";
import { SectionHeading } from "@/components/ui";

const UNIT_SECONDS: Record<string, number> = {
  dakika: 60,
  saat: 3_600,
  gun: 86_400,
};

/** The program thinks in seconds; the form lets a lender think in whatever
 *  unit suits the loan they have in mind. */
function toSeconds(value: string, unit: string): number {
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * (UNIT_SECONDS[unit] ?? 86_400));
}

function safeRaw(input: string, decimals: number): bigint {
  try {
    return toRaw(input || "0", decimals);
  } catch {
    return 0n;
  }
}

function TokenPicker({
  id,
  value,
  onChange,
  custom,
  onCustom,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  custom: string;
  onCustom: (v: string) => void;
}) {
  return (
    <>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {knownTokens().map((t) => (
          <option key={t.mint} value={t.mint}>
            {t.symbol} — {t.name}
          </option>
        ))}
        <option value="__custom__">Başka bir token (adres gir)…</option>
      </select>
      {value === "__custom__" && (
        <input
          className="field mt-2 font-mono text-xs"
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          placeholder="mint adresi"
          spellCheck={false}
        />
      )}
    </>
  );
}

export default function LendPage() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const config = useConfig();
  const tx = useTx();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [customPrincipal, setCustomPrincipal] = useState("");
  const [customCollateral, setCustomCollateral] = useState("");

  const [form, setForm] = useState(() => {
    const pair = defaultPair();
    return {
      principalMint: pair.principal ?? "",
      collateralMint: pair.collateral ?? "",
      principalTotal: "500",
      collateralTotal: String(suggestCollateral(pair.principal, 500, pair.collateral) ?? 28045),
      minDraw: "10",
      apr: "18,75",
      duration: "30",
      durationUnit: "gun",
      expiry: "7",
      expiryUnit: "gun",
    };
  });

  /** Picking a different collateral makes the old amount meaningless; restate
   *  it in the new token at the default LTV when prices allow. */
  const pickCollateral = (mint: string) =>
    setForm((f) => {
      const suggested =
        mint === "__custom__"
          ? undefined
          : suggestCollateral(f.principalMint, Number(f.principalTotal.replace(",", ".")), mint);
      return {
        ...f,
        collateralMint: mint,
        collateralTotal: suggested !== undefined ? String(suggested) : f.collateralTotal,
      };
    });

  const load = () =>
    fetchMarkets()
      .then((m) => {
        // A market with neither an open offer nor a live loan is a leftover
        // from history and only adds noise to a page about where to lend now.
        setMarkets(m.filter((x) => x.offer_count > 0 || x.active_loans > 0));
        setApiError(null);
      })
      .catch(() => setApiError("Veri sunucusuna ulaşılamıyor."));

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const principalPick =
    form.principalMint === "__custom__" ? customPrincipal.trim() : form.principalMint;
  const collateralPick =
    form.collateralMint === "__custom__" ? customCollateral.trim() : form.collateralMint;

  const mints = useMintInfo([principalPick, collateralPick, ...markets.map((m) => m.collateral_mint)]);
  useTokenMarket([principalPick, collateralPick, ...markets.map((m) => m.collateral_mint)]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setUnit = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const sameToken = !!principalPick && principalPick === collateralPick;
  // Lending out something that is not a stablecoin is allowed but unusual, and
  // is what picking the wrong dropdown looks like.
  const oddPrincipal = !!principalPick && !/^t?usd/i.test(tokenSymbol(principalPick));

  const durationSeconds = toSeconds(form.duration, form.durationUnit);
  // Mirrors the program's own bounds so the form refuses what the chain would.
  const durationValid =
    durationSeconds >= MIN_DURATION_SECONDS && durationSeconds <= 365 * 86_400;
  // A one-minute term only exists on test clusters; do not offer the unit
  // where the program would refuse every value of it.
  const minuteTerms = MIN_DURATION_SECONDS < 3_600;

  // ---------------------------------------------------------------- summary
  const pDec = mints[principalPick]?.decimals ?? 6;
  const cDec = mints[collateralPick]?.decimals ?? 6;
  const principalRaw = safeRaw(form.principalTotal, pDec);
  const collateralRaw = safeRaw(form.collateralTotal, cDec);
  const aprBps = Math.round(Number(form.apr.replace(",", ".")) * 100) || 0;
  // What a full draw earns over the term, and what the protocol keeps of it.
  const interest = interestFor(principalRaw, aprBps, durationSeconds || 0);
  const protocolCut = config ? feeOf(interest, config.interestFeeBps) : 0n;
  const net = interest - protocolCut;
  const periodYield = principalRaw > 0n ? Number((net * 10_000n) / principalRaw) / 100 : 0;
  // Display-only, from reference prices: how much room the collateral has.
  const principalUsd = usdValue(principalRaw, pDec, principalPick);
  const collateralUsd = usdValue(collateralRaw, cDec, collateralPick);
  const owedUsd = usdValue(principalRaw + interest, pDec, principalPick);
  const ltv =
    principalUsd !== undefined && collateralUsd && collateralUsd > 0
      ? (principalUsd / collateralUsd) * 100
      : undefined;
  const cushion =
    collateralUsd && collateralUsd > 0 && owedUsd !== undefined
      ? ((collateralUsd - owedUsd) / collateralUsd) * 100
      : undefined;

  const canPublish =
    !busy &&
    !!program &&
    !!principalPick &&
    !!collateralPick &&
    durationValid &&
    !sameToken &&
    principalRaw > 0n &&
    collateralRaw > 0n &&
    aprBps > 0;

  async function onCreate() {
    if (!program || !publicKey) return;
    setBusy(true);
    try {
      const ok = await tx.run({
        pending: "Teklif için cüzdanda onay bekleniyor…",
        success: "Teklifin yayında. Paran kilitlendi; biri çekene kadar orada bekler.",
        fn: () =>
          createOffer(program, publicKey, {
            principalMint: new PublicKey(principalPick),
            collateralMint: new PublicKey(collateralPick),
            principalTotal: principalRaw,
            collateralTotal: collateralRaw,
            minDraw: safeRaw(form.minDraw, pDec),
            aprBps,
            durationSeconds,
            expiryTs: Math.floor(Date.now() / 1000) + toSeconds(form.expiry, form.expiryUnit),
          }),
      });
      if (ok) setTimeout(load, 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-14">
      <section>
        <p className="eyebrow">Borç ver</p>
        <h1 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl">
          Paranı <em className="text-accent">faize ver.</em>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-2">
          Riski bir kez, teklifi yazarken fiyatlıyorsun. Sonrasında hiçbir şey takip
          edilmiyor. Borçlu ödemezse eline nakit değil,{" "}
          <span className="text-fg">teminat token'ının kendisi</span> geçer — onu satmak
          senin işin, zararına satman mümkün.
        </p>
      </section>

      {apiError && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {apiError}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ------------------------------------------------------ form */}
        <div className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <h2 className="mb-5 flex items-baseline gap-3 text-base font-semibold">
              <span className="num text-xs text-muted">01</span> Ne veriyorsun
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="principal">
                  Vereceğin para
                </label>
                <TokenPicker
                  id="principal"
                  value={form.principalMint}
                  onChange={(v) => setForm((f) => ({ ...f, principalMint: v }))}
                  custom={customPrincipal}
                  onCustom={setCustomPrincipal}
                />
                <p className="help">Borçluya ödeyeceğin token. Genelde bir stablecoin.</p>
              </div>
              <div>
                <label className="label" htmlFor="principalTotal">
                  Toplam tutar
                </label>
                <input
                  id="principalTotal"
                  className="field num"
                  inputMode="decimal"
                  value={form.principalTotal}
                  onChange={set("principalTotal")}
                />
                <p className="help">
                  Teklifi açar açmaz kilitlenir. Birden fazla kişi parça parça çekebilir.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="minDraw">
                  En az çekim
                </label>
                <input
                  id="minDraw"
                  className="field num"
                  inputMode="decimal"
                  value={form.minDraw}
                  onChange={set("minDraw")}
                />
                <p className="help">Çok küçük kredilerle uğraşmamak için alt sınır.</p>
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="mb-5 flex items-baseline gap-3 text-base font-semibold">
              <span className="num text-xs text-muted">02</span> Karşılığında ne istiyorsun
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="collateral">
                  Kabul edeceğin teminat
                </label>
                <TokenPicker
                  id="collateral"
                  value={form.collateralMint}
                  onChange={pickCollateral}
                  custom={customCollateral}
                  onCustom={setCustomCollateral}
                />
                <p className="help">
                  Ödenmezse bu sana kalır — satabileceğin bir şey olmasına dikkat et.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="collateralTotal">
                  Tam çekim için istediğin teminat
                </label>
                <input
                  id="collateralTotal"
                  className="field num"
                  inputMode="decimal"
                  value={form.collateralTotal}
                  onChange={set("collateralTotal")}
                />
                <p className="help">Parça çekimlerde oranlı hesaplanır, hep yukarı yuvarlanır.</p>
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="mb-5 flex items-baseline gap-3 text-base font-semibold">
              <span className="num text-xs text-muted">03</span> Şartlar
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="apr">
                  Yıllık faiz (%)
                </label>
                <input
                  id="apr"
                  className="field num"
                  inputMode="decimal"
                  value={form.apr}
                  onChange={set("apr")}
                />
                <p className="help">Token ne kadar riskliyse o kadar yüksek istemelisin.</p>
              </div>
              <div>
                <label className="label" htmlFor="duration">
                  Kredi vadesi
                </label>
                <div className="flex gap-2">
                  <input
                    id="duration"
                    className="field num min-w-0 flex-1"
                    inputMode="decimal"
                    value={form.duration}
                    onChange={set("duration")}
                  />
                  <select
                    className="field w-28 shrink-0"
                    value={form.durationUnit}
                    onChange={setUnit("durationUnit")}
                    aria-label="Vade birimi"
                  >
                    {minuteTerms && <option value="dakika">dakika</option>}
                    <option value="saat">saat</option>
                    <option value="gun">gün</option>
                  </select>
                </div>
                <p className={`help ${durationValid ? "" : "!text-bad"}`}>
                  {durationValid
                    ? "Paran bu süre boyunca kilitli kalır, erken çıkamazsın."
                    : `Vade en az ${formatDuration(MIN_DURATION_SECONDS)}, en çok 365 gün olabilir.`}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="expiry">
                  Teklif geçerlilik
                </label>
                <div className="flex gap-2">
                  <input
                    id="expiry"
                    className="field num min-w-0 flex-1"
                    inputMode="decimal"
                    value={form.expiry}
                    onChange={set("expiry")}
                  />
                  <select
                    className="field w-28 shrink-0"
                    value={form.expiryUnit}
                    onChange={setUnit("expiryUnit")}
                    aria-label="Geçerlilik birimi"
                  >
                    <option value="dakika">dakika</option>
                    <option value="saat">saat</option>
                    <option value="gun">gün</option>
                  </select>
                </div>
                <p className="help">Bu sürede kimse çekmezse teklif kendiliğinden kapanır.</p>
              </div>
            </div>
          </section>
        </div>

        {/* --------------------------------------------------- summary */}
        <aside className="panel-raised lg:sticky lg:top-20">
          <div className="border-b border-edge px-5 py-4">
            <p className="eyebrow">Teklif özeti</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
              <span className="num font-semibold">{form.principalTotal || "0"}</span>
              <TokenBadge mint={principalPick} />
              <span className="text-muted">→</span>
              <span className="num font-semibold">{form.collateralTotal || "0"}</span>
              <TokenBadge mint={collateralPick} />
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatApr(aprBps)} yıllık · {formatDuration(durationSeconds || 0)} vade
            </p>
          </div>

          <dl className="space-y-3 px-5 py-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Teminat oranı (LTV)</dt>
              <dd className="num font-medium">
                {ltv === undefined ? (
                  <span className="text-muted">fiyat yok</span>
                ) : ltv < 0.1 ? (
                  "<%0,1"
                ) : (
                  `%${ltv.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
                )}
              </dd>
            </div>
            {cushion !== undefined && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Teminat tamponu</dt>
                <dd className={`num font-medium ${cushion < 0 ? "text-bad" : ""}`}>
                  {cushion < 0
                    ? "alacak teminatı aşıyor"
                    : `%${cushion.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} düşebilir`}
                </dd>
              </div>
            )}
            <div className="border-t border-edge pt-3">
              <p className="eyebrow mb-2">Tamamı çekilirse</p>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Faiz geliri</dt>
                <dd className="num">
                  {fromRaw(interest, pDec)} {tokenSymbol(principalPick)}
                </dd>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <dt className="text-muted">
                  Protokol payı{config ? ` (%${config.interestFeeBps / 100})` : ""}
                </dt>
                <dd className="num text-muted">
                  −{fromRaw(protocolCut, pDec)} {tokenSymbol(principalPick)}
                </dd>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <dt className="font-medium">Net getirin</dt>
                <dd className="num font-semibold text-accent">
                  {fromRaw(net, pDec)} {tokenSymbol(principalPick)}
                  <span className="ml-1.5 font-sans text-xs font-normal text-muted">
                    %{periodYield.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / dönem
                  </span>
                </dd>
              </div>
            </div>
          </dl>

          <div className="px-5 pb-1">
            {sameToken && (
              <p className="rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-xs text-bad">
                Verdiğin para ile teminat aynı token. Biri diğerinden farklı olmalı.
              </p>
            )}
            {!sameToken && oddPrincipal && (
              <p className="rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
                {tokenSymbol(principalPick)} dağıtıyorsun, stablecoin değil. İki kutuyu
                karıştırmış olabilir misin?
              </p>
            )}
            <FreezeWarning mint={collateralPick} role="collateral" info={mints[collateralPick]} />
            <FreezeWarning mint={principalPick} role="principal" info={mints[principalPick]} />
          </div>

          <div className="space-y-3 px-5 pb-5 pt-4">
            <button className="btn-primary w-full" disabled={!canPublish} onClick={onCreate}>
              {busy ? "Cüzdanı onayla…" : "Teklifi yayınla"}
            </button>
            <p className="text-xs leading-relaxed text-muted">
              {publicKey
                ? "Yayınladığın anda paran kilitlenir. Çekilmeyen kısmı istediğin an iptal edip geri alabilirsin; çekilmiş krediler vadesine kadar sürer."
                : "Teklif açmak için sağ üstten cüzdanını bağla."}
            </p>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------------- markets */}
      <section>
        <SectionHeading
          title="Piyasalar"
          sub="Hangi token'a ne kadar faizle borç veriliyor, ne kadarı çekilmiş. Satıra tıkla, formda teminat olsun."
        />
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Teminat</th>
                <th className="r">Ortalama faiz</th>
                <th className="r">Bekleyen para</th>
                <th className="r">Açık kredi</th>
                <th className="r">Kullanım</th>
                <th className="r">Ödenmeyen</th>
              </tr>
            </thead>
            <tbody>
              {markets.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted">
                    Henüz piyasa yok — ilk teklifi sen açabilirsin.
                  </td>
                </tr>
              )}
              {markets.map((m) => (
                <tr
                  key={m.collateral_mint}
                  className="cursor-pointer transition-colors hover:bg-raised/60"
                  onClick={() => pickCollateral(m.collateral_mint)}
                  title="Formda teminat olarak kullan"
                >
                  <td>
                    <TokenBadge mint={m.collateral_mint} size="md" withName />
                  </td>
                  <td className="r num">
                    {m.apr_median === null ? "—" : formatApr(Math.round(m.apr_median))}
                  </td>
                  <td className="r num">{fromRaw(m.ask_total, 6)}</td>
                  <td className="r num">{m.active_loans}</td>
                  <td className="r num">%{(m.utilization_bps / 100).toFixed(1).replace(".", ",")}</td>
                  <td className="r num">
                    {m.default_rate_bps === null
                      ? "—"
                      : `%${(m.default_rate_bps / 100).toFixed(0)} (${m.defaulted_count})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
