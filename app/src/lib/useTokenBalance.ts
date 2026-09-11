"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/**
 * The connected wallet's balance of one mint, so the UI can refuse a borrow the
 * chain would reject anyway rather than sending the user into a failed
 * transaction and a wasted fee.
 */
export function useTokenBalance(mint: string | undefined, refreshKey?: unknown) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mint || !publicKey) {
        setBalance(null);
        return;
      }
      try {
        const mintKey = new PublicKey(mint);
        const info = await connection.getAccountInfo(mintKey);
        const program = info?.owner.equals(TOKEN_2022_PROGRAM_ID)
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID;
        const ata = getAssociatedTokenAddressSync(mintKey, publicKey, true, program);
        const acc = await getAccount(connection, ata, "confirmed", program);
        if (!cancelled) setBalance(acc.amount);
      } catch {
        // No token account yet means no balance, which is a real answer.
        if (!cancelled) setBalance(0n);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mint, publicKey, connection, refreshKey]);

  return balance;
}
