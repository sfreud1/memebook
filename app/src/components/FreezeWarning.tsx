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
    <p className="mt-3 rounded-field border border-warn/20 bg-warn-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-warn">
      <span className="font-semibold">{sym} dondurulabilir bir token.</span>{" "}
      {role === "collateral"
        ? "İhraççısı hesapları dondurma yetkisini elinde tutuyor; dondurursa vade sonunda ne geri ödeme ne teminat talebi çalışır — teminat kilitli kalır."
        : "İhraççısı dondurursa geri ödeme yapılamaz ve kredi temerrüde düşer."}
    </p>
  );
}
