import testRegistry from "./token-registry.json";
import mainnetRegistry from "./token-registry.mainnet.json";
import { IS_MAINNET } from "./network";

export interface TokenMeta {
  symbol: string;
  name: string;
  logo?: string;
  /**
   * Reference price in USD, used only to display a loan-to-value figure.
   *
   * Nothing on chain reads a price — that is the point of the protocol. This
   * exists so a human can compare two offers denominated in different tokens.
   * Test clusters carry fixed ones because no market quotes their mints; on
   * mainnet prices arrive live (see `useTokenMarket`) and this field is unset.
   */
  usd?: number;
}

/**
 * The curated list: what the pickers offer and what the wallet bar names.
 *
 * Mainnet's is deliberately short. The program is permissionless — anyone can
 * post an offer in any mint — but the frontend only *suggests* tokens the
 * operator has looked at. Anything else still renders, named from a token
 * API, but nobody is nudged towards it.
 */
const REGISTRY = (IS_MAINNET ? mainnetRegistry : testRegistry) as Record<string, TokenMeta>;

/** Names learned at runtime for mints the registry does not carry. */
const LEARNED = new Map<string, TokenMeta>();
/** Live prices, keyed by mint. */
const PRICES = new Map<string, number>();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Components subscribe so a price or name arriving re-renders them. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const hasMeta = (mint: string) => mint in REGISTRY || LEARNED.has(mint);

export function learnTokens(metas: Record<string, TokenMeta>) {
  for (const [mint, meta] of Object.entries(metas)) LEARNED.set(mint, meta);
  notify();
}

export function setPrices(prices: Record<string, number>) {
  for (const [mint, usd] of Object.entries(prices)) PRICES.set(mint, usd);
  notify();
}

/**
 * Display metadata for a mint: the curated registry first, then whatever a
 * token API taught us, then a shortened address, which is at least honest
 * about not knowing.
 */
export function tokenMeta(mint: string | undefined): TokenMeta {
  if (!mint) return { symbol: "—", name: "bilinmiyor" };
  const hit = REGISTRY[mint] ?? LEARNED.get(mint);
  if (hit) return hit;
  return {
    symbol: `${mint.slice(0, 4)}..${mint.slice(-4)}`,
    name: "bilinmeyen token",
  };
}

export const tokenSymbol = (mint: string | undefined) => tokenMeta(mint).symbol;

export function tokenPrice(mint: string | undefined): number | undefined {
  if (!mint) return undefined;
  return PRICES.get(mint) ?? REGISTRY[mint]?.usd;
}

/** Raw base units -> USD, when the mint has a price. */
export function usdValue(
  raw: bigint,
  decimals: number,
  mint: string | undefined
): number | undefined {
  const price = tokenPrice(mint);
  if (price === undefined) return undefined;
  return (Number(raw) / 10 ** decimals) * price;
}

export const formatUsd = (v: number) =>
  v.toLocaleString("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Every mint the app vouches for, for pickers. */
export function knownTokens(): Array<TokenMeta & { mint: string }> {
  return Object.entries(REGISTRY).map(([mint, meta]) => ({ mint, ...meta }));
}

/**
 * The mint a lender most likely wants to hand out, and the one they most
 * likely want to hold as collateral. Stablecoins lend; everything else is
 * what gets locked.
 */
export function defaultPair(): { principal?: string; collateral?: string } {
  const all = knownTokens();
  const stable = all.find((t) => /^t?USD/i.test(t.symbol));
  const other = all.find((t) => t.mint !== stable?.mint);
  return { principal: stable?.mint, collateral: other?.mint };
}
