"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchMarkets, fetchOffers, type Market, type Offer } from "@/lib/api";
import {
  collateralFor,
  formatApr,
  formatDuration,
  fromRaw,
  interestFor,
  shortKey,
  toRaw,
} from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useProgram } from "@/lib/useProgram";
import { acceptOffer } from "@/lib/program";

const DURATIONS = [
  { label: "7d", seconds: 7 * 86_400 },
  { label: "14d", seconds: 14 * 86_400 },
  { label: "30d", seconds: 30 * 86_400 },
];

export default function BorrowPage() {
  const { publicKey } = useWallet();
  const program = useProgram();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [collateral, setCollateral] = useState<string>("");
  const [amount, setAmount] = useState("500");
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetchMarkets()
      .then((m) => {
        setMarkets(m);
        setCollateral((c) => c || m[0]?.collateral_mint || "");
      })
      .catch(() => setNote("indexer unreachable — is it running on :8080?"));
  }, []);

  useEffect(() => {
    if (!collateral) return;
    fetchOffers({
      collateral_mint: collateral,
      max_duration: maxDuration ?? undefined,
      sort: "apr",
    })
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [collateral, maxDuration, busy]);

  const mints = useMintInfo([
    collateral,
    ...offers.map((o) => o.principal_mint),
    ...offers.map((o) => o.collateral_mint),
  ]);

  const principalDecimals = offers[0]
    ? mints[offers[0].principal_mint]?.decimals ?? 6
    : 6;
  const drawRaw = useMemo(() => {
    try {
      return toRaw(amount || "0", principalDecimals);
    } catch {
      return 0n;
    }
  }, [amount, principalDecimals]);

  /** An offer is only usable if it can fund this draw and clears its own floor. */
  const usable = (o: Offer) =>
    drawRaw > 0n &&
    drawRaw <= BigInt(o.principal_available) &&
    (drawRaw >= BigInt(o.min_draw) || drawRaw === BigInt(o.principal_available));

  async function onAccept(o: Offer) {
    if (!program || !publicKey) return;
    setBusy(o.pubkey);
    setNote(null);
    try {
      const sig = await acceptOffer(program, publicKey, o, drawRaw);
      setNote(`loan opened — ${sig.slice(0, 16)}…`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Borrow at a fixed rate,
          <br />
          <span className="text-accent">without liquidations.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Nothing marks your position to market. The term is the only thing that
          can end the loan — repay by maturity and your collateral comes back,
          miss it and the lender keeps it.
        </p>
      </div>

      <div className="panel p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Amount to borrow</label>
            <input
              className="field text-2xl"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="label">Against collateral</label>
            <select
              className="field"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
            >
              {markets.length === 0 && <option value="">no markets yet</option>}
              {markets.map((m) => (
                <option key={m.collateral_mint} value={m.collateral_mint}>
                  {shortKey(m.collateral_mint)} · {m.offer_count} offer
                  {m.offer_count === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted">for</span>
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              onClick={() =>
                setMaxDuration((cur) => (cur === d.seconds ? null : d.seconds))
              }
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                maxDuration === d.seconds
                  ? "bg-accent text-ink font-semibold"
                  : "border border-edge text-muted hover:text-neutral-200"
              }`}
            >
              ≤{d.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted">
            {offers.length} offer{offers.length === 1 ? "" : "s"} · best rate first
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {offers.length === 0 && (
          <div className="panel p-8 text-center text-sm text-muted">
            No offers for this collateral yet.
          </div>
        )}

        {offers.map((o) => {
          const cDec = mints[o.collateral_mint]?.decimals ?? 0;
          const pDec = mints[o.principal_mint]?.decimals ?? 6;
          const need = collateralFor(
            drawRaw,
            BigInt(o.principal_total),
            BigInt(o.collateral_total)
          );
          const cost = interestFor(drawRaw, o.apr_bps, o.duration_seconds);
          const ok = usable(o);

          return (
            <div
              key={o.pubkey}
              className={`panel flex items-center gap-4 p-4 ${ok ? "" : "opacity-45"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{shortKey(o.lender)}</div>
                <div className="mt-0.5 text-xs text-muted">
                  Lock {fromRaw(need, cDec)} {shortKey(o.collateral_mint)}
                  {" · "}
                  up to {fromRaw(o.principal_available, pDec)} available
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-medium">
                  {fromRaw(drawRaw, pDec)}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {formatApr(o.apr_bps)} APR · {formatDuration(o.duration_seconds)} ·
                  costs <span className="text-neutral-200">{fromRaw(cost, pDec)}</span>
                </div>
              </div>

              <button
                className="btn-primary shrink-0"
                disabled={!ok || !program || busy !== null}
                onClick={() => onAccept(o)}
              >
                {busy === o.pubkey ? "…" : "Borrow"}
              </button>
            </div>
          );
        })}
      </div>

      {note && (
        <div className="panel border-accent/30 p-3 text-xs text-muted break-all">
          {note}
        </div>
      )}

      {!publicKey && (
        <p className="text-center text-xs text-muted">
          Connect a wallet to take an offer.
        </p>
      )}
    </div>
  );
}
