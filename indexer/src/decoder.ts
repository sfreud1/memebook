import { BorshEventCoder } from "@coral-xyz/anchor";
import { IDL } from "./config.js";

const coder = new BorshEventCoder(IDL as any);

export interface DecodedEvent {
  name: string;
  data: Record<string, unknown>;
  index: number;
}

/**
 * Anchor's `emit!` writes a base64 blob on a `Program data:` log line. Other
 * programs in the same transaction write those too, so we lean on the event
 * discriminator: `decode` returns null for anything that is not ours.
 */
export function decodeEvents(logs: string[] | null | undefined): DecodedEvent[] {
  if (!logs) return [];
  const out: DecodedEvent[] = [];
  let i = 0;
  for (const line of logs) {
    const m = /^Program data: (.+)$/.exec(line);
    if (!m || !m[1]) continue;
    let decoded: { name: string; data: any } | null = null;
    try {
      decoded = coder.decode(m[1]);
    } catch {
      continue; // not a well-formed Anchor event; ignore
    }
    if (decoded) out.push({ name: decoded.name, data: decoded.data, index: i++ });
  }
  return out;
}

/** Anchor hands back BN / PublicKey objects; flatten them for JSON + SQL. */
export function plain(value: unknown): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    const anyV = value as any;
    if (typeof anyV.toBase58 === "function") return anyV.toBase58();
    if (typeof anyV.toString === "function" && anyV.constructor?.name === "BN") {
      return anyV.toString();
    }
    if (Array.isArray(value)) return value.map(plain);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(anyV)) out[k] = plain(v);
    return out;
  }
  return value;
}
