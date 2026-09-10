const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";

export interface Offer {
  pubkey: string;
  lender: string;
  principal_mint: string;
  collateral_mint: string;
  principal_total: string;
  principal_available: string;
  collateral_total: string;
  min_draw: string;
  apr_bps: number;
  duration_seconds: number;
  expiry_ts: number;
  status: string;
  loans_opened: number;
}

export interface Loan {
  pubkey: string;
  offer: string;
  borrower: string;
  lender: string;
  principal_mint: string;
  collateral_mint: string;
  principal_amount: string;
  collateral_amount: string;
  interest_amount: string;
  origination_fee: string;
  start_ts: number;
  maturity_ts: number;
  status: "active" | "repaid" | "defaulted";
  lender_received: string | null;
  collateral_claimed: string | null;
}

export interface Market {
  collateral_mint: string;
  offer_count: number;
  ask_total: string;
  apr_min: number | null;
  apr_median: number | null;
  duration_median: number | null;
  active_loans: number;
  principal_outstanding: string;
  repaid_count: number;
  defaulted_count: number;
  utilization_bps: number;
  default_rate_bps: number | null;
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchOffers = (p?: Record<string, string | number | undefined>) =>
  get<{ offers: Offer[]; count: number }>("/offers", p).then((r) => r.offers);

export const fetchLoans = (p?: Record<string, string | number | undefined>) =>
  get<{ loans: Loan[]; count: number }>("/loans", p).then((r) => r.loans);

export const fetchMarkets = () =>
  get<{ markets: Market[] }>("/markets").then((r) => r.markets);

export const fetchClaimable = () =>
  get<{ loans: Loan[] }>("/claimable").then((r) => r.loans);

export const fetchStats = () => get<Record<string, string | number>>("/stats");
