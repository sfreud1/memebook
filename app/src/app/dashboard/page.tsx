"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchLoans, fetchOffers, type Loan, type Offer } from "@/lib/api";
import { formatApr, formatDuration, fromRaw, shortKey, timeLeft } from "@/lib/format";
import { useMintInfo } from "@/lib/useMintInfo";
import { useProgram } from "@/lib/useProgram";
import { cancelOffer, claimDefault, repayLoan } from "@/lib/program";

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const program = useProgram();

  const [borrowed, setBorrowed] = useState<Loan[]>([]);
  const [lent, setLent] = useState<Loan[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
    load().catch(() => setNote("indexer unreachable — is it running on :8080?"));
  }, [load]);

  const mints = useMintInfo([
    ...borrowed.flatMap((l) => [l.principal_mint, l.collateral_mint]),
    ...lent.flatMap((l) => [l.principal_mint, l.collateral_mint]),
    ...offers.flatMap((o) => [o.principal_mint, o.collateral_mint]),
  ]);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setNote(null);
    try {
      const sig = await fn();
      setNote(`done — ${sig.slice(0, 16)}…`);
      setTimeout(() => load().catch(() => {}), 1500);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!publicKey) {
    return (
      <div className="panel p-10 text-center text-sm text-muted">
        Connect a wallet to see your positions.
      </div>
    );
  }

  const matured = (l: Loan) => l.maturity_ts <= Math.floor(Date.now() / 1000);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Borrowed</h2>
        <div className="space-y-2">
          {borrowed.filter((l) => l.status === "active").length === 0 && (
            <div className="panel p-6 text-center text-sm text-muted">
              No open loans.
            </div>
          )}
          {borrowed
            .filter((l) => l.status === "active")
            .map((l) => {
              const pDec = mints[l.principal_mint]?.decimals ?? 6;
              const cDec = mints[l.collateral_mint]?.decimals ?? 0;
              const due = BigInt(l.principal_amount) + BigInt(l.interest_amount);
              const late = matured(l);
              return (
                <div key={l.pubkey} className="panel flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      Repay {fromRaw(due, pDec)}{" "}
                      <span className="text-muted">
                        ({fromRaw(l.principal_amount, pDec)} +{" "}
                        {fromRaw(l.interest_amount, pDec)} interest)
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {fromRaw(l.collateral_amount, cDec)}{" "}
                      {shortKey(l.collateral_mint)} locked ·{" "}
                      {late ? (
                        <span className="text-red-400">
                          matured — lender can claim at any moment
                        </span>
                      ) : (
                        <>due in {timeLeft(l.maturity_ts)}</>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-primary shrink-0"
                    disabled={busy !== null || late}
                    onClick={() => run(l.pubkey, () => repayLoan(program!, publicKey, l))}
                  >
                    {busy === l.pubkey ? "…" : "Repay"}
                  </button>
                </div>
              );
            })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Lent</h2>
        <div className="space-y-2">
          {lent.filter((l) => l.status === "active").length === 0 && (
            <div className="panel p-6 text-center text-sm text-muted">
              No outstanding loans.
            </div>
          )}
          {lent
            .filter((l) => l.status === "active")
            .map((l) => {
              const pDec = mints[l.principal_mint]?.decimals ?? 6;
              const cDec = mints[l.collateral_mint]?.decimals ?? 0;
              const claimable = matured(l);
              return (
                <div key={l.pubkey} className="panel flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {fromRaw(l.principal_amount, pDec)} out to {shortKey(l.borrower)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {fromRaw(l.collateral_amount, cDec)} {shortKey(l.collateral_mint)}{" "}
                      held ·{" "}
                      {claimable ? (
                        <span className="text-accent">matured unpaid — claimable</span>
                      ) : (
                        <>matures in {timeLeft(l.maturity_ts)}</>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-ghost shrink-0"
                    disabled={busy !== null || !claimable}
                    onClick={() =>
                      run(l.pubkey, () => claimDefault(program!, publicKey, l))
                    }
                  >
                    {busy === l.pubkey ? "…" : "Claim collateral"}
                  </button>
                </div>
              );
            })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">My offers</h2>
        <div className="space-y-2">
          {offers.length === 0 && (
            <div className="panel p-6 text-center text-sm text-muted">
              No live offers.
            </div>
          )}
          {offers.map((o) => {
            const pDec = mints[o.principal_mint]?.decimals ?? 6;
            return (
              <div key={o.pubkey} className="panel flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {fromRaw(o.principal_available, pDec)} undrawn of{" "}
                    {fromRaw(o.principal_total, pDec)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    vs {shortKey(o.collateral_mint)} · {formatApr(o.apr_bps)} ·{" "}
                    {formatDuration(o.duration_seconds)} · {o.loans_opened} loan
                    {o.loans_opened === 1 ? "" : "s"} drawn
                  </div>
                </div>
                <button
                  className="btn-ghost shrink-0"
                  disabled={busy !== null}
                  onClick={() => run(o.pubkey, () => cancelOffer(program!, publicKey, o))}
                >
                  {busy === o.pubkey ? "…" : "Cancel"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {note && (
        <div className="panel border-accent/30 p-3 text-xs text-muted break-all">{note}</div>
      )}
    </div>
  );
}
