export const SECONDS_PER_YEAR = 31_536_000;

const TR = "tr-TR";

/** Raw base units -> human string, without floating point in the integer part. */
export function fromRaw(raw: string | bigint, decimals: number, maxFrac = 4): string {
  const v = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const wholeStr = whole.toLocaleString(TR);
  if (frac === 0n) return wholeStr;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  return fracStr ? `${wholeStr},${fracStr}` : wholeStr;
}

export function toRaw(input: string, decimals: number): bigint {
  const normalised = input.trim().replace(/\./g, "").replace(",", ".");
  const [w = "0", f = ""] = normalised.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export const formatApr = (bps: number) =>
  `%${(bps / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}`;

export function formatDuration(seconds: number): string {
  const d = Math.round(seconds / 86_400);
  if (d >= 1) return `${d} gün`;
  const h = Math.round(seconds / 3_600);
  if (h >= 1) return `${h} saat`;
  return `${Math.round(seconds / 60)} dakika`;
}

export function formatDate(unixTs: number): string {
  return new Intl.DateTimeFormat(TR, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixTs * 1000));
}

/** Fixed simple interest, mirroring the on-chain `interest_for` exactly (ceil). */
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

/** Basis points of an amount, floored, mirroring `fee_of`. */
export const feeOf = (amount: bigint, bps: number) => (amount * BigInt(bps)) / 10_000n;

export const shortKey = (k: string) => `${k.slice(0, 4)}..${k.slice(-4)}`;

/** "3 dakika önce" — how long ago something happened. */
export function timeAgo(unixTs: number): string {
  const s = Math.floor(Date.now() / 1000) - unixTs;
  if (s < 60) return "az önce";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dakika önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

export function timeLeft(unixTs: number): string {
  const s = unixTs - Math.floor(Date.now() / 1000);
  if (s <= 0) return "vadesi doldu";
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d} gün ${h} saat kaldı`;
  if (h > 0) return `${h} saat ${m} dakika kaldı`;
  return `${m} dakika kaldı`;
}
