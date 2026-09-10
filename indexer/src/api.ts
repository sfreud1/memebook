import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Db } from "./db.js";
import { config } from "./config.js";

/**
 * Read-only projection API. The frontend talks to this and never to an RPC
 * node: `getProgramAccounts` over a growing offer book is exactly the query
 * that falls over under traffic.
 */
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.cacheTtlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

const clampLimit = (v: unknown, max = 200) =>
  Math.min(Math.max(Number(v) || 50, 1), max);

export async function buildApi(db: Db) {
  const app = Fastify({ logger: false });

  // Read-only public data, so a permissive origin policy costs nothing. Narrow
  // this to the deployed frontend's origin before shipping.
  await app.register(cors, { origin: config.corsOrigin });

  app.get("/health", async () => {
    const rows = await db.query<{ last_slot: string }>(
      `SELECT last_slot FROM cursor WHERE id = 1`
    );
    return { ok: true, lastSlot: Number(rows[0]?.last_slot ?? 0) };
  });

  /** The borrow book: who will lend against this mint, cheapest first. */
  app.get("/offers", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = clampLimit(q.limit);
    const now = Math.floor(Date.now() / 1000);

    // `mine=1` is the lender's own view: keep expired and drained offers so they
    // can still be cancelled. The public book hides both.
    const ownerView = q.mine === "1";
    const where: string[] = ownerView
      ? [`$1 > 0`]
      : [`status = 'open'`, `principal_available > 0`, `expiry_ts > $1`];
    const params: unknown[] = [now];

    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };
    if (q.collateral_mint) add(`collateral_mint = ?`, q.collateral_mint);
    if (q.principal_mint) add(`principal_mint = ?`, q.principal_mint);
    if (q.lender) add(`lender = ?`, q.lender);
    if (q.min_duration) add(`duration_seconds >= ?`, Number(q.min_duration));
    if (q.max_duration) add(`duration_seconds <= ?`, Number(q.max_duration));
    if (q.min_available) add(`principal_available >= ?`, q.min_available);

    const order =
      q.sort === "duration" ? `duration_seconds ASC, apr_bps ASC`
      : q.sort === "size" ? `principal_available DESC`
      : q.sort === "newest" ? `created_at DESC`
      : `apr_bps ASC, principal_available DESC`; // best rate is the default view

    params.push(limit);
    const rows = await cached(`offers:${JSON.stringify([where, params])}`, () =>
      db.query(
        `SELECT * FROM offers WHERE ${where.join(" AND ")}
          ORDER BY ${order} LIMIT $${params.length}`,
        params
      )
    );
    return { offers: rows, count: rows.length };
  });

  app.get("/loans", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = clampLimit(q.limit);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };
    if (q.borrower) add(`borrower = ?`, q.borrower);
    if (q.lender) add(`lender = ?`, q.lender);
    if (q.collateral_mint) add(`collateral_mint = ?`, q.collateral_mint);
    if (q.status) add(`status = ?`, q.status);

    params.push(limit);
    const rows = await db.query(
      `SELECT * FROM loans ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY start_ts DESC LIMIT $${params.length}`,
      params
    );
    return { loans: rows, count: rows.length };
  });

  /** Loans past maturity and still unclaimed — the keeper's work queue. */
  app.get("/claimable", async () => {
    const now = Math.floor(Date.now() / 1000);
    const rows = await db.query(
      `SELECT * FROM loans WHERE status = 'active' AND maturity_ts < $1
        ORDER BY maturity_ts ASC LIMIT 500`,
      [now]
    );
    return { loans: rows, count: rows.length };
  });

  /** Per-collateral rollup: the lend-side market table. */
  app.get("/markets", async () => {
    const now = Math.floor(Date.now() / 1000);
    return cached("markets", async () => {
      const rows = await db.query(
        `WITH open_offers AS (
           SELECT collateral_mint,
                  COUNT(*)                          AS offer_count,
                  SUM(principal_available)          AS ask_total,
                  MIN(apr_bps)                      AS apr_min,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY apr_bps) AS apr_median,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds) AS duration_median
             FROM offers
            WHERE status = 'open' AND principal_available > 0 AND expiry_ts > $1
            GROUP BY collateral_mint
         ),
         active_loans AS (
           SELECT collateral_mint,
                  COUNT(*)                  AS loan_count,
                  SUM(principal_amount)     AS principal_outstanding
             FROM loans WHERE status = 'active'
            GROUP BY collateral_mint
         ),
         history AS (
           SELECT collateral_mint,
                  COUNT(*) FILTER (WHERE status = 'repaid')    AS repaid_count,
                  COUNT(*) FILTER (WHERE status = 'defaulted') AS defaulted_count
             FROM loans GROUP BY collateral_mint
         )
         SELECT COALESCE(o.collateral_mint, a.collateral_mint, h.collateral_mint) AS collateral_mint,
                COALESCE(o.offer_count, 0)           AS offer_count,
                COALESCE(o.ask_total, 0)             AS ask_total,
                o.apr_min, o.apr_median, o.duration_median,
                COALESCE(a.loan_count, 0)            AS active_loans,
                COALESCE(a.principal_outstanding, 0) AS principal_outstanding,
                COALESCE(h.repaid_count, 0)          AS repaid_count,
                COALESCE(h.defaulted_count, 0)       AS defaulted_count
           FROM open_offers o
           FULL OUTER JOIN active_loans a ON a.collateral_mint = o.collateral_mint
           FULL OUTER JOIN history      h ON h.collateral_mint = COALESCE(o.collateral_mint, a.collateral_mint)
          ORDER BY principal_outstanding DESC`,
        [now]
      );

      // Utilisation is what share of committed capital is actually working.
      return {
        markets: rows.map((m: any) => {
          const outstanding = BigInt(m.principal_outstanding ?? 0);
          const idle = BigInt(m.ask_total ?? 0);
          const total = outstanding + idle;
          const settled = Number(m.repaid_count) + Number(m.defaulted_count);
          return {
            ...m,
            utilization_bps: total === 0n ? 0 : Number((outstanding * 10_000n) / total),
            default_rate_bps: settled === 0 ? null
              : Math.round((Number(m.defaulted_count) / settled) * 10_000),
          };
        }),
      };
    });
  });

  app.get("/stats", async () =>
    cached("stats", async () => {
      const [offers] = await db.query<any>(
        `SELECT COUNT(*) FILTER (WHERE status='open') AS open_offers,
                COALESCE(SUM(principal_available) FILTER (WHERE status='open'),0) AS idle_capital
           FROM offers`
      );
      const [loans] = await db.query<any>(
        `SELECT COUNT(*) AS total_loans,
                COUNT(*) FILTER (WHERE status='active')    AS active_loans,
                COUNT(*) FILTER (WHERE status='repaid')    AS repaid_loans,
                COUNT(*) FILTER (WHERE status='defaulted') AS defaulted_loans,
                COALESCE(SUM(principal_amount),0)          AS cumulative_principal
           FROM loans`
      );
      return { ...offers, ...loans };
    })
  );

  return app;
}
