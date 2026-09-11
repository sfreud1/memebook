"use client";

import { useEffect, useState } from "react";
import { BorshAccountsCoder } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { configPda } from "./program";
import idl from "./idl.json";

export interface ProtocolConfig {
  originationFeeBps: number;
  interestFeeBps: number;
  defaultFeeBps: number;
  feeRecipient: string;
  paused: boolean;
}

/** Anchor's account coder returns IDL field names verbatim, which are snake_case. */
function field<T>(obj: Record<string, any>, snake: string): T | undefined {
  if (snake in obj) return obj[snake];
  const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return obj[camel];
}

/**
 * Reads the on-chain fee configuration without a connected wallet, so the borrow
 * screen can show the *real* cost of a loan — interest plus the origination fee
 * — before anyone signs anything.
 */
export function useConfig(): ProtocolConfig | null {
  const { connection } = useConnection();
  const [cfg, setCfg] = useState<ProtocolConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await connection.getAccountInfo(configPda());
        if (!info) {
          console.warn("[memebook] config account not found on this cluster");
          return;
        }

        const coder = new BorshAccountsCoder(idl as never);
        let decoded: Record<string, any> | null = null;
        let lastError: unknown = null;
        // Anchor has used both casings for the account name across versions.
        for (const name of ["Config", "config"]) {
          try {
            decoded = coder.decode(name, info.data);
            break;
          } catch (e) {
            lastError = e;
          }
        }
        if (!decoded) throw lastError ?? new Error("config decode failed");

        const recipient = field<{ toBase58(): string }>(decoded, "fee_recipient");
        const next: ProtocolConfig = {
          originationFeeBps: Number(field(decoded, "origination_fee_bps") ?? 0),
          interestFeeBps: Number(field(decoded, "interest_fee_bps") ?? 0),
          defaultFeeBps: Number(field(decoded, "default_fee_bps") ?? 0),
          feeRecipient: recipient ? recipient.toBase58() : "",
          paused: Boolean(field(decoded, "paused")),
        };
        if (!cancelled) setCfg(next);
      } catch (e) {
        // Surfaced rather than swallowed: a silent failure here quietly
        // understates what a loan costs, which is the one thing this screen
        // must never do.
        console.error("[memebook] could not read protocol config", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  return cfg;
}
