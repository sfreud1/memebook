"use client";

import { useCallback } from "react";
import { useToast } from "@/components/Toaster";
import { txUrl } from "./explorer";

/** If the signature never comes back the button must not spin forever. */
const WALLET_TIMEOUT_MS = 90_000;

/** Turn what the wallet or the program said into something a person can act on. */
export function humanizeError(raw: string): string {
  if (/user rejected|rejected the request|declined/i.test(raw)) {
    return "İmzayı reddettin; işlem gönderilmedi.";
  }
  if (/insufficient|0x1\b/.test(raw)) return "Cüzdanında bu işlem için yeterli bakiye yok.";
  if (/Cüzdan yanıt vermedi/.test(raw)) return raw;
  const anchorMsg = raw.match(/Error Message: ([^.]+)\.?/);
  if (anchorMsg) return anchorMsg[1];
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

/**
 * Runs a signed transaction with the feedback a person needs: a "confirm in
 * your wallet" notice while waiting, then either a success with an explorer
 * link or an error that stays until dismissed.
 */
export function useTx() {
  const toast = useToast();

  const run = useCallback(
    async (opts: { pending: string; success: string; fn: () => Promise<unknown> }): Promise<boolean> => {
      const id = toast.push({
        kind: "info",
        title: opts.pending,
        body: "Phantom penceresi açılmadıysa tarayıcıdaki eklenti ikonuna tıkla.",
        sticky: true,
      });
      try {
        const result = await Promise.race([
          opts.fn(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Cüzdan yanıt vermedi. Phantom penceresi açıldı mı?")),
              WALLET_TIMEOUT_MS
            )
          ),
        ]);
        const sig = typeof result === "string" ? result : undefined;
        toast.update(id, {
          kind: "success",
          title: opts.success,
          body: undefined,
          sticky: false,
          href: sig ? txUrl(sig) : undefined,
          hrefLabel: sig ? "İşlemi explorer'da gör" : undefined,
        });
        return true;
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        toast.update(id, {
          kind: "error",
          title: "İşlem tamamlanamadı",
          body: humanizeError(raw),
          sticky: true,
        });
        return false;
      }
    },
    [toast]
  );

  return { run };
}
