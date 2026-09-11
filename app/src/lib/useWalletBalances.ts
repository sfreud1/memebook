"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface TokenBalance {
  mint: string;
  amount: bigint;
  decimals: number;
}

export interface WalletBalances {
  sol: number | null;
  tokens: TokenBalance[];
  refresh: () => void;
}

/**
 * Everything the connected wallet holds: SOL for fees, plus every SPL balance
 * across both token programs. Polled rather than subscribed — the balances
 * change only when the user acts, and a websocket per mint is not worth it.
 */
export function useWalletBalances(pollMs = 15_000): WalletBalances {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [sol, setSol] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!publicKey) {
      setSol(null);
      setTokens([]);
      return;
    }

    const load = async () => {
      try {
        const lamports = await connection.getBalance(publicKey, "confirmed");
        if (!cancelled) setSol(lamports / LAMPORTS_PER_SOL);

        const found: TokenBalance[] = [];
        for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
          const res = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId },
            "confirmed"
          );
          for (const { account } of res.value) {
            const info = (account.data as any).parsed?.info;
            if (!info) continue;
            found.push({
              mint: info.mint,
              amount: BigInt(info.tokenAmount.amount),
              decimals: info.tokenAmount.decimals,
            });
          }
        }
        if (!cancelled) {
          // Largest first, so the balances that matter lead.
          found.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
          setTokens(found);
        }
      } catch {
        /* a transient RPC failure should not blank the bar */
      }
    };

    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [publicKey, connection, pollMs, nonce]);

  return { sol, tokens, refresh };
}
