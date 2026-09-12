"use client";

import type { MintInfo } from "@/lib/useMintInfo";
import { tokenSymbol } from "@/lib/tokens";

/**
 * A classic SPL mint whose issuer kept the freeze authority can freeze any
 * token account of it — the escrow vaults included, at which point neither
 * repayment nor a default claim can move anything. The program cannot refuse
 * such mints without refusing most memecoins, so the risk is stated where the
 * decision is made.
 */
export function FreezeWarning({
  mint,
  role,
  info,
}: {
  mint: string | undefined;
  role: "collateral" | "principal";
  info: MintInfo | undefined;
}) {
  if (!mint || !info?.freezeAuthority) return null;
  const sym = tokenSymbol(mint);
  return (
    <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
      <span className="font-medium">{sym} dondurulabilir bir token.</span>{" "}
      {role === "collateral"
        ? "İhraççısı hesapları dondurma yetkisini elinde tutuyor; dondurursa vade sonunda ne geri ödeme ne teminat talebi çalışır — teminat kilitli kalır."
        : "İhraççısı dondurursa geri ödeme yapılamaz ve kredi temerrüde düşer."}
    </p>
  );
}
