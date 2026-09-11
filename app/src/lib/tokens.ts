import registry from "./token-registry.json";

export interface TokenMeta {
  symbol: string;
  name: string;
  logo?: string;
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
