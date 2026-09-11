import registry from "./token-registry.json";

export interface TokenMeta {
  symbol: string;
  name: string;
  logo?: string;
  /**
   * Reference price in USD, used only to display a loan-to-value figure.
   *
   * Nothing on chain reads a price — that is the point of the protocol. This
   * exists so a human can compare two offers denominated in different tokens.
   * A real deployment would take these from a price API; the demo mints carry
   * fixed ones because no market quotes them.
   */
  usd?: number;
}

const REGISTRY = registry as Record<string, TokenMeta>;

/**
 * Display metadata for a mint.
 *
 * On a local validator there is no token list to consult, so names come from a
 * registry the seed script writes. Anything unknown falls back to a shortened
 * address, which is at least honest about not knowing.
 */
export function tokenMeta(mint: string | undefined): TokenMeta {
  if (!mint) return { symbol: "—", name: "bilinmiyor" };
  const hit = REGISTRY[mint];
  if (hit) return hit;
  return {
    symbol: `${mint.slice(0, 4)}..${mint.slice(-4)}`,
    name: "bilinmeyen token",
  };
}

export const tokenSymbol = (mint: string | undefined) => tokenMeta(mint).symbol;

export const tokenPrice = (mint: string | undefined): number | undefined =>
  tokenMeta(mint).usd;

/** Raw base units -> USD, when the mint has a reference price. */
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

/** Every mint the app knows how to name, for pickers. */
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
