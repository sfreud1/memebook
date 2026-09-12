"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export interface MintInfo {
  decimals: number;
  tokenProgram: PublicKey;
  /**
   * Whoever holds this can freeze any token account of the mint, the escrow
   * vaults included. The program lets such mints through — refusing them
   * would refuse most memecoins — so the UI has to say it out loud instead.
   */
  freezeAuthority: string | null;
}

const cache = new Map<string, MintInfo>();

/** Decimals are needed to render any amount, and the chain is the only source. */
export function useMintInfo(mints: (string | undefined)[]) {
  const { connection } = useConnection();
  const [info, setInfo] = useState<Record<string, MintInfo>>(() =>
    Object.fromEntries(cache)
  );

  const key = mints.filter(Boolean).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wanted = [...new Set(mints.filter(Boolean) as string[])].filter(
        (m) => !cache.has(m)
      );
      if (wanted.length === 0) return;

      await Promise.all(
        wanted.map(async (m) => {
          try {
            const pk = new PublicKey(m);
            const acc = await connection.getAccountInfo(pk);
            const program = acc?.owner.equals(TOKEN_2022_PROGRAM_ID)
              ? TOKEN_2022_PROGRAM_ID
              : TOKEN_PROGRAM_ID;
            const mint = await getMint(connection, pk, "confirmed", program);
            cache.set(m, {
              decimals: mint.decimals,
              tokenProgram: program,
              freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
            });
          } catch {
            cache.set(m, { decimals: 0, tokenProgram: TOKEN_PROGRAM_ID, freezeAuthority: null });
          }
        })
      );
      if (!cancelled) setInfo(Object.fromEntries(cache));
    })();
    return () => {
      cancelled = true;
    };
  }, [key, connection]);

  return info;
}
