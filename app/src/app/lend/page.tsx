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
  const [note, setNote] = useState<string | null>(null);

  const [form, setForm] = useState({
    principalMint: "",
    collateralMint: "",
    principalTotal: "500",
    collateralTotal: "28045",
    minDraw: "10",
    apr: "18.75",
    durationDays: "30",
    expiryDays: "7",
  });

  const load = () =>
    fetchMarkets()
      .then(setMarkets)
      .catch(() => setNote("indexer unreachable — is it running on :8080?"));

  useEffect(() => {
    load();
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
    setNote(null);
    try {
      const pMint = new PublicKey(form.principalMint);
      const cMint = new PublicKey(form.collateralMint);
      const pDec = mints[form.principalMint]?.decimals ?? 6;
      const cDec = mints[form.collateralMint]?.decimals ?? 6;

      const sig = await createOffer(program, publicKey, {
        principalMint: pMint,
        collateralMint: cMint,
        principalTotal: toRaw(form.principalTotal, pDec),
        collateralTotal: toRaw(form.collateralTotal, cDec),
        minDraw: toRaw(form.minDraw, pDec),
        aprBps: Math.round(Number(form.apr) * 100),
        durationSeconds: Math.round(Number(form.durationDays) * 86_400),
        expiryTs:
          Math.floor(Date.now() / 1000) + Math.round(Number(form.expiryDays) * 86_400),
      });
      setNote(`offer posted — ${sig.slice(0, 16)}…`);
      setTimeout(load, 1500);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Lend against <span className="text-accent">any token.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          You price the risk once, when you write the offer. Nothing is monitored
          afterwards — if the borrower walks, you receive the collateral token
          itself and selling it is your problem.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-edge px-5 py-3 text-xs uppercase tracking-wide text-muted">
          Markets
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-normal">Collateral</th>
                <th className="px-5 py-2 font-normal">APR (median)</th>
                <th className="px-5 py-2 font-normal">Ask</th>
                <th className="px-5 py-2 font-normal">Open loans</th>
                <th className="px-5 py-2 font-normal">Utilisation</th>
                <th className="px-5 py-2 font-normal">Defaults</th>
              </tr>
            </thead>
            <tbody>
              {markets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted">
                    No markets yet.
                  </td>
                </tr>
              )}
              {markets.map((m) => (
                <tr key={m.collateral_mint} className="border-t border-edge">
                  <td className="px-5 py-3">
                    <button
                      className="hover:text-accent"
                      onClick={() =>
                        setForm((f) => ({ ...f, collateralMint: m.collateral_mint }))
                      }
                      title="use as collateral in the form below"
                    >
                      {shortKey(m.collateral_mint)}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    {m.apr_median === null ? "—" : formatApr(Math.round(m.apr_median))}
                  </td>
                  <td className="px-5 py-3">{fromRaw(m.ask_total, 6)}</td>
                  <td className="px-5 py-3">{m.active_loans}</td>
                  <td className="px-5 py-3">
                    {(m.utilization_bps / 100).toFixed(2)}%
                  </td>
                  <td className="px-5 py-3">
                    {m.default_rate_bps === null
                      ? "—"
                      : `${(m.default_rate_bps / 100).toFixed(0)}% (${m.defaulted_count})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 text-sm font-semibold">Post an offer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Principal mint (what you lend)</label>
            <input className="field font-mono text-xs" value={form.principalMint}
                   onChange={set("principalMint")} placeholder="USDC mint address" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Collateral mint (what you accept)</label>
            <input className="field font-mono text-xs" value={form.collateralMint}
                   onChange={set("collateralMint")} placeholder="memecoin mint address" />
          </div>
          <div>
            <label className="label">Principal offered</label>
            <input className="field" value={form.principalTotal} onChange={set("principalTotal")} />
          </div>
          <div>
            <label className="label">Collateral demanded (for the full draw)</label>
            <input className="field" value={form.collateralTotal} onChange={set("collateralTotal")} />
          </div>
          <div>
            <label className="label">Minimum draw</label>
            <input className="field" value={form.minDraw} onChange={set("minDraw")} />
          </div>
          <div>
            <label className="label">APR %</label>
            <input className="field" value={form.apr} onChange={set("apr")} />
          </div>
          <div>
            <label className="label">Loan duration (days)</label>
            <input className="field" value={form.durationDays} onChange={set("durationDays")} />
          </div>
          <div>
            <label className="label">Offer expires in (days)</label>
            <input className="field" value={form.expiryDays} onChange={set("expiryDays")} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={busy || !program || !form.principalMint || !form.collateralMint}
            onClick={onCreate}
          >
            {busy ? "Posting…" : "Post offer"}
          </button>
          <span className="text-xs text-muted">
            The principal is escrowed immediately. Cancel any time to reclaim
            whatever is still undrawn.
          </span>
        </div>
      </section>

      {note && (
        <div className="panel border-accent/30 p-3 text-xs text-muted break-all">{note}</div>
      )}
    </div>
  );
}
