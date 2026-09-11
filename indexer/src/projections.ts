import type { Db } from "./db.js";
import type { DecodedEvent } from "./decoder.js";

export interface EventMeta {
  signature: string;
  slot: number;
  blockTime: number | null;
}

/** Anchor has flip-flopped between snake_case and camelCase in decoded events. */
function f(data: Record<string, any>, name: string): any {
  if (name in data) return data[name];
  const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  if (camel in data) return data[camel];
  const snake = name.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  return data[snake];
}

const s = (v: any) => (v === undefined || v === null ? null : String(v));
const n = (v: any) => (v === undefined || v === null ? null : Number(v));

/**
 * Applies one event to the projected tables.
 *
 * Every statement is idempotent: the same event replayed must not double-count.
 * That matters because RPC backfill and the live subscription overlap around
 * the cursor, and because a projection bug is fixed by replaying `events`.
 */
export async function applyEvent(db: Db, ev: DecodedEvent, meta: EventMeta): Promise<void> {
  const d = ev.data as Record<string, any>;
  const ts = n(f(d, "ts")) ?? meta.blockTime ?? 0;

  switch (ev.name) {
    case "OfferCreated":
    case "offerCreated": {
      await db.query(
        `INSERT INTO offers (
           pubkey, lender, principal_mint, collateral_mint,
           principal_total, principal_available, collateral_total, min_draw,
           apr_bps, duration_seconds, expiry_ts, status,
           created_slot, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,'open',$11,$12,$12)
         -- A cancelled offer's account is closed, and the same lender may
         -- derive that address again with the same id. Skipping the insert
         -- would leave the stale, settled row standing in for a live offer.
         ON CONFLICT (pubkey) DO UPDATE SET
           lender = EXCLUDED.lender,
           principal_mint = EXCLUDED.principal_mint,
           collateral_mint = EXCLUDED.collateral_mint,
           principal_total = EXCLUDED.principal_total,
           principal_available = EXCLUDED.principal_available,
           collateral_total = EXCLUDED.collateral_total,
           min_draw = EXCLUDED.min_draw,
           apr_bps = EXCLUDED.apr_bps,
           duration_seconds = EXCLUDED.duration_seconds,
           expiry_ts = EXCLUDED.expiry_ts,
           status = 'open',
           loans_opened = 0,
           created_slot = EXCLUDED.created_slot,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at
         WHERE offers.status <> 'open'`,
        [
          s(f(d, "offer")), s(f(d, "lender")),
          s(f(d, "principal_mint")), s(f(d, "collateral_mint")),
          s(f(d, "principal_total")), s(f(d, "collateral_total")), s(f(d, "min_draw")),
          n(f(d, "apr_bps")), n(f(d, "duration_seconds")), n(f(d, "expiry_ts")),
          meta.slot, ts,
        ]
      );
      return;
    }

    case "OfferCancelled":
    case "offerCancelled": {
      await db.query(
        `UPDATE offers
            SET status = 'cancelled', principal_available = 0, updated_at = $2
          WHERE pubkey = $1 AND status <> 'cancelled'`,
        [s(f(d, "offer")), ts]
      );
      return;
    }

    case "LoanOpened":
    case "loanOpened": {
      const loan = s(f(d, "loan"));
      const offer = s(f(d, "offer"));
      const principal = s(f(d, "principal_amount"));

      await db.query(
        `INSERT INTO loans (
           pubkey, offer, borrower, lender, principal_mint, collateral_mint,
           principal_amount, collateral_amount, interest_amount, origination_fee,
           start_ts, maturity_ts, status, created_slot, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,$11)
         -- Settled loans are closed on chain, freeing the address for the same
         -- borrower to reuse with the same id. Without this the second loan is
         -- dropped and the interface keeps showing the first one, settled.
         ON CONFLICT (pubkey) DO UPDATE SET
           offer = EXCLUDED.offer,
           borrower = EXCLUDED.borrower,
           lender = EXCLUDED.lender,
           principal_mint = EXCLUDED.principal_mint,
           collateral_mint = EXCLUDED.collateral_mint,
           principal_amount = EXCLUDED.principal_amount,
           collateral_amount = EXCLUDED.collateral_amount,
           interest_amount = EXCLUDED.interest_amount,
           origination_fee = EXCLUDED.origination_fee,
           start_ts = EXCLUDED.start_ts,
           maturity_ts = EXCLUDED.maturity_ts,
           status = 'active',
           settled_ts = NULL,
           lender_received = NULL,
           collateral_claimed = NULL,
           created_slot = EXCLUDED.created_slot,
           updated_at = EXCLUDED.updated_at
         WHERE loans.status <> 'active'`,
        [
          loan, offer, s(f(d, "borrower")), s(f(d, "lender")),
          s(f(d, "principal_mint")), s(f(d, "collateral_mint")),
          principal, s(f(d, "collateral_amount")), s(f(d, "interest_amount")),
          s(f(d, "origination_fee")),
          n(f(d, "start_ts")), n(f(d, "maturity_ts")),
          meta.slot,
        ]
      );

      // Draw down the offer. Guarded on the loan insert having been new, which
      // `xmax = 0`-style checks cannot express portably, so instead recompute
      // availability from the loans actually recorded against this offer.
      // Scoped to loans opened since this offer was created. A cancelled offer
      // is closed on chain and the same lender can re-derive the address with
      // the same id; loans from the earlier incarnation must not count against
      // the new one's liquidity.
      await db.query(
        `UPDATE offers o
            SET principal_available = GREATEST(
                  o.principal_total - COALESCE(
                    (SELECT SUM(l.principal_amount) FROM loans l
                      WHERE l.offer = o.pubkey AND l.created_slot >= o.created_slot), 0), 0),
                loans_opened = COALESCE(
                  (SELECT COUNT(*) FROM loans l
                    WHERE l.offer = o.pubkey AND l.created_slot >= o.created_slot), 0),
                updated_at = $2
          WHERE o.pubkey = $1`,
        [offer, n(f(d, "start_ts")) ?? ts]
      );
      await db.query(
        `UPDATE offers SET status = 'drained'
          WHERE pubkey = $1 AND status = 'open' AND principal_available = 0`,
        [offer]
      );
      return;
    }

    case "LoanRepaid":
    case "loanRepaid": {
      await db.query(
        `UPDATE loans
            SET status = 'repaid', settled_ts = $2, lender_received = $3, updated_at = $2
          WHERE pubkey = $1 AND status = 'active'`,
        [s(f(d, "loan")), ts, s(f(d, "lender_received"))]
      );
      return;
    }

    case "LoanDefaulted":
    case "loanDefaulted": {
      await db.query(
        `UPDATE loans
            SET status = 'defaulted', settled_ts = $2, collateral_claimed = $3, updated_at = $2
          WHERE pubkey = $1 AND status = 'active'`,
        [s(f(d, "loan")), ts, s(f(d, "collateral_claimed"))]
      );
      return;
    }

    default:
      return; // unknown event: already persisted raw in `events`
  }
}
