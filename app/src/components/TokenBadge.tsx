"use client";

import { tokenMeta } from "@/lib/tokens";

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" } as const;

export function TokenBadge({
  mint,
  size = "sm",
  withName = false,
}: {
  mint: string | undefined;
  size?: keyof typeof SIZES;
  withName?: boolean;
}) {
  const meta = tokenMeta(mint);
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {meta.logo ? (
        // A plain <img>: these are third-party CDNs and not worth a
        // next/image domain allowlist for a handful of 32px icons.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.logo}
          alt=""
          className={`${SIZES[size]} shrink-0 rounded-full border border-line bg-page object-cover`}
        />
      ) : (
        <span
          className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full border border-line bg-page text-[9px] font-semibold leading-none text-muted`}
        >
          {meta.symbol.slice(0, 1)}
        </span>
      )}
      <span className="font-semibold">{meta.symbol}</span>
      {withName && <span className="text-[12px] text-muted">{meta.name}</span>}
    </span>
  );
}
