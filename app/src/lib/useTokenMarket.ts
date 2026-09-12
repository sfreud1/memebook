"use client";

import { useEffect, useState } from "react";
import { IS_MAINNET } from "./network";
import { hasMeta, learnTokens, setPrices, subscribe } from "./tokens";

/**
 * Names and prices for mainnet mints, from Jupiter's free endpoints. Nothing
 * here touches the chain or the program; it only feeds the loan-to-value and
 * break-even figures a person uses to compare offers. Test clusters skip it —
 * their mints have fixed reference prices in the registry.
 */
const PRICE_URL = "https://lite-api.jup.ag/price/v3?ids=";
const SEARCH_URL = "https://lite-api.jup.ag/tokens/v2/search?query=";
const REFRESH_MS = 60_000;
const MAX_IDS_PER_CALL = 50;

/** Mints already asked about, so a miss is not retried every render. */
const asked = new Set<string>();

interface SearchHit {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
}

async function learn(mints: string[]) {
  await Promise.all(
    mints.map(async (mint) => {
      asked.add(mint);
      try {
        const res = await fetch(SEARCH_URL + encodeURIComponent(mint));
        if (!res.ok) return;
        const hits = (await res.json()) as SearchHit[];
        const hit = hits.find((h) => h.id === mint);
        if (hit) learnTokens({ [mint]: { symbol: hit.symbol, name: hit.name, logo: hit.icon } });
      } catch {
        /* a name is a nicety; the address still renders */
      }
    })
  );
}

async function refreshPrices(mints: string[]) {
  for (let i = 0; i < mints.length; i += MAX_IDS_PER_CALL) {
    const ids = mints.slice(i, i + MAX_IDS_PER_CALL);
    try {
      const res = await fetch(PRICE_URL + ids.join(","));
      if (!res.ok) continue;
      const body = (await res.json()) as Record<string, { usdPrice?: number } | null>;
      const found: Record<string, number> = {};
      for (const [mint, v] of Object.entries(body)) {
        if (typeof v?.usdPrice === "number") found[mint] = v.usdPrice;
      }
      setPrices(found);
    } catch {
      /* stale prices are shown until the next tick; LTV is display-only */
    }
  }
}

/**
 * Keeps names and prices for `mints` fresh while the caller is mounted.
 * Returns a counter that changes whenever something arrived, so a component
 * that renders `usdValue`/`tokenMeta` re-runs.
 */
export function useTokenMarket(mints: (string | undefined)[]): number {
  const [version, setVersion] = useState(0);
  const key = [...new Set(mints.filter(Boolean) as string[])].sort().join(",");

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!IS_MAINNET || !key) return;
    const list = key.split(",");
    let cancelled = false;

    const tick = async () => {
      await learn(list.filter((m) => !hasMeta(m) && !asked.has(m)));
      if (!cancelled) await refreshPrices(list);
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [key]);

  return version;
}
