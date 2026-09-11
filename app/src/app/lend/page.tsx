"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchMarkets, type Market } from "@/lib/api";
import { formatApr, formatDuration, fromRaw, shortKey, toRaw } from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useProgram } from "@/lib/useProgram";
import { createOffer } from "@/lib/program";

export default function LendPage() {
  const { publicKey } = useWallet();
  const program = useProgram();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    principalMint: "",
    collateralMint: "",
    principalTotal: "500",
    collateralTotal: "28045",
    minDraw: "10",
    apr: "18,75",
    durationDays: "30",
    expiryDays: "7",
  });

  const load = () =>
    fetchMarkets()
      .then((m) => {
        setMarkets(m);
        setError(null);
      })
      .catch(() => setError("Veri sunucusuna ulaşılamıyor."));

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const mints = useMintInfo([
    form.principalMint,
    form.collateralMint,
    ...markets.map((m) => m.collateral_mint),
  ]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onCreate() {
    if (!program || !publicKey) return;
    setBusy(true);
    setDone(null);
    setError(null);
    try {
      const pDec = mints[form.principalMint]?.decimals ?? 6;
      const cDec = mints[form.collateralMint]?.decimals ?? 6;
      await createOffer(program, publicKey, {
        principalMint: new PublicKey(form.principalMint),
        collateralMint: new PublicKey(form.collateralMint),
        principalTotal: toRaw(form.principalTotal, pDec),
        collateralTotal: toRaw(form.collateralTotal, cDec),
        minDraw: toRaw(form.minDraw, pDec),
        aprBps: Math.round(Number(form.apr.replace(",", ".")) * 100),
        durationSeconds: Math.round(Number(form.durationDays) * 86_400),
        expiryTs:
          Math.floor(Date.now() / 1000) +
          Math.round(Number(form.expiryDays) * 86_400),
      });
      setDone(
        "Teklifin yayında. Paran kilitlendi, biri çekene kadar orada bekleyecek. İstediğin an iptal edip geri alabilirsin."
      );
      setTimeout(load, 1500);
    } catch (e) {
      setError(
        `Teklif açılamadı: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Paranı <span className="text-accent">faize ver.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Riski bir kez, teklifi yazarken fiyatlıyorsun. Sonrasında hiçbir şey
          takip edilmiyor. Borçlu ödemezse eline USDC değil,{" "}
          <span className="text-neutral-200">teminat token'ının kendisi</span>{" "}
          geçer — onu satmak senin işin ve zararına satman mümkün.
        </p>
      </header>

      {error && (
        <div className="panel border-red-500/40 p-4 text-sm text-red-300">{error}</div>
      )}
      {done && (
        <div className="panel border-accent/40 p-4 text-sm text-accent">{done}</div>
      )}

      <section className="panel overflow-hidden">
        <div className="border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold">Piyasalar</h2>
          <p className="mt-0.5 text-xs text-muted">
            Hangi token'a ne kadar faizle borç veriliyor, ne kadarı çekilmiş.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-2 font-normal">Teminat</th>
                <th className="px-5 py-2 font-normal">Ortalama faiz</th>
                <th className="px-5 py-2 font-normal">Bekleyen para</th>
                <th className="px-5 py-2 font-normal">Açık kredi</th>
                <th className="px-5 py-2 font-normal">Kullanım</th>
                <th className="px-5 py-2 font-normal">Ödenmeyen</th>
              </tr>
            </thead>
            <tbody>
              {markets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted">
                    Henüz piyasa yok.
                  </td>
                </tr>
              )}
              {markets.map((m) => (
                <tr key={m.collateral_mint} className="border-t border-edge">
                  <td className="px-5 py-3">
                    <button
                      className="underline decoration-edge underline-offset-4 hover:text-accent"
                      onClick={() =>
                        setForm((f) => ({ ...f, collateralMint: m.collateral_mint }))
                      }
                      title="aşağıdaki formda teminat olarak kullan"
                    >
                      {shortKey(m.collateral_mint)}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    {m.apr_median === null ? "—" : formatApr(Math.round(m.apr_median))}
                  </td>
                  <td className="px-5 py-3">{fromRaw(m.ask_total, 6)} USDC</td>
                  <td className="px-5 py-3">{m.active_loans}</td>
                  <td className="px-5 py-3">
                    %{(m.utilization_bps / 100).toFixed(1).replace(".", ",")}
                  </td>
                  <td className="px-5 py-3">
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

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Teklif aç</h2>
        <p className="mb-4 mt-1 text-xs text-muted">
          Şartları sen belirliyorsun. Pazarlık yok — biri kabul eder ya da etmez.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Vereceğin paranın adresi</label>
            <input
              className="field font-mono text-xs"
              value={form.principalMint}
              onChange={set("principalMint")}
              placeholder="USDC mint adresi"
            />
            <p className="mt-1.5 text-xs text-muted">
              Borçluya ödeyeceğin token. Genelde USDC.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Kabul edeceğin teminatın adresi</label>
            <input
              className="field font-mono text-xs"
              value={form.collateralMint}
              onChange={set("collateralMint")}
              placeholder="memecoin mint adresi"
            />
            <p className="mt-1.5 text-xs text-muted">
              Borçlunun kilitleyeceği token. Ödenmezse bu sana kalır — o yüzden
              satabileceğin bir şey olmasına dikkat et.
            </p>
          </div>

          <div>
            <label className="label">Vereceğin toplam tutar</label>
            <input className="field" value={form.principalTotal} onChange={set("principalTotal")} />
            <p className="mt-1.5 text-xs text-muted">
              Teklifi açar açmaz kilitlenir. Birden fazla kişi parça parça çekebilir.
            </p>
          </div>

          <div>
            <label className="label">Karşılığında isteyeceğin teminat</label>
            <input className="field" value={form.collateralTotal} onChange={set("collateralTotal")} />
            <p className="mt-1.5 text-xs text-muted">
              Tamamı çekilirse bu kadar teminat istersin. Parça çekimlerde oranlı
              hesaplanır.
            </p>
          </div>

          <div>
            <label className="label">En az çekim tutarı</label>
            <input className="field" value={form.minDraw} onChange={set("minDraw")} />
            <p className="mt-1.5 text-xs text-muted">
              Çok küçük kredilerle uğraşmamak için alt sınır.
            </p>
          </div>

          <div>
            <label className="label">Yıllık faiz (%)</label>
            <input className="field" value={form.apr} onChange={set("apr")} />
            <p className="mt-1.5 text-xs text-muted">
              Token ne kadar riskliyse o kadar yüksek istemelisin.
            </p>
          </div>

          <div>
            <label className="label">Kredi vadesi (gün)</label>
            <input className="field" value={form.durationDays} onChange={set("durationDays")} />
            <p className="mt-1.5 text-xs text-muted">
              Paran bu süre boyunca kilitli kalır, erken çıkamazsın.
            </p>
          </div>

          <div>
            <label className="label">Teklifin geçerlilik süresi (gün)</label>
            <input className="field" value={form.expiryDays} onChange={set("expiryDays")} />
            <p className="mt-1.5 text-xs text-muted">
              Bu sürede kimse çekmezse teklif kapanır.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-4 border-t border-edge pt-4">
          <p className="flex-1 text-xs leading-relaxed text-muted">
            Teklifi açtığın anda paran kilitlenir. Çekilmeyen kısmı istediğin an
            iptal edip geri alabilirsin; çekilmiş krediler vadesine kadar devam eder.
          </p>
          <button
            className="btn-primary shrink-0"
            disabled={busy || !program || !form.principalMint || !form.collateralMint}
            onClick={onCreate}
          >
            {busy ? "Açılıyor…" : "Teklifi Yayınla"}
          </button>
        </div>

        {!publicKey && (
          <p className="mt-3 text-center text-xs text-muted">
            Teklif açmak için sağ üstten cüzdanını bağla.
          </p>
        )}
      </section>
    </div>
  );
}
