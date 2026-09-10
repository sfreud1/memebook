export const SECONDS_PER_YEAR = 31_536_000;

/** Raw base units -> human string, without floating point in the integer part. */
export function fromRaw(raw: string | bigint, decimals: number, maxFrac = 4): string {
  const v = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fracStr ? "." + fracStr : ""}`;
}

export function toRaw(input: string, decimals: number): bigint {
  const [w = "0", f = ""] = input.trim().split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export const formatApr = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;

export function formatDuration(seconds: number): string {
  const d = Math.round(seconds / 86_400);
  if (d >= 1) return `${d}D`;
  const h = Math.round(seconds / 3_600);
  if (h >= 1) return `${h}H`;
  return `${Math.round(seconds / 60)}M`;
}

/**
 * Fixed simple interest, mirroring the on-chain formula exactly (ceil).
 * Kept in sync by hand — if the program's `interest_for` changes, change this.
 */
export function interestFor(principal: bigint, aprBps: number, durationSeconds: number): bigint {
  const num = principal * BigInt(aprBps) * BigInt(durationSeconds);
  const den = 10_000n * BigInt(SECONDS_PER_YEAR);
  return (num + den - 1n) / den;
}

/** Pro-rata collateral for a partial draw (ceil), mirroring `collateral_for`. */
export function collateralFor(drawn: bigint, principalTotal: bigint, collateralTotal: bigint): bigint {
  if (principalTotal === 0n) return 0n;
  return (drawn * collateralTotal + principalTotal - 1n) / principalTotal;
}

export const shortKey = (k: string) => `${k.slice(0, 4)}..${k.slice(-4)}`;

export function timeLeft(unixTs: number): string {
  const s = unixTs - Math.floor(Date.now() / 1000);
  if (s <= 0) return "matured";
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
