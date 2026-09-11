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
