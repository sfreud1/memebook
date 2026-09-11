import { Connection, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import bs58 from "bs58";
import type { Db } from "./db.js";
import { decodeEvents, plain } from "./decoder.js";
import { applyEvent } from "./projections.js";
import { config } from "./config.js";

const COMMITMENT = "confirmed" as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Public RPC endpoints throttle hard, and one `getTransaction` per signature
 * reaches that ceiling within a few dozen rows. Backs off on 429 rather than
 * letting one rejected request abort a backfill that is otherwise fine.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 5
): Promise<T | null> {
  let delay = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      const throttled = msg.includes("429") || /too many requests/i.test(msg);
      if (!throttled || i === attempts - 1) {
        console.warn(`[ingest] ${label} failed: ${msg.slice(0, 120)}`);
        return null;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
  return null;
}

/**
 * A log notification can arrive carrying the all-zero placeholder signature
 * (`1111…`) rather than a real one — a simulated or not-yet-signed transaction.
 * Projecting those creates loans and offers that exist in the database and
 * nowhere on chain, which is worse than missing them: the UI then shows
 * positions nobody can settle.
 */
function isRealSignature(signature: string): boolean {
  try {
    const raw = bs58.decode(signature);
    return raw.length === 64 && raw.some((b) => b !== 0);
  } catch {
    return false;
  }
}

async function getCursor(db: Db) {
  const rows = await db.query<{ last_slot: string; last_signature: string | null }>(
    `SELECT last_slot, last_signature FROM cursor WHERE id = 1`
  );
  return rows[0] ?? { last_slot: "0", last_signature: null };
}

async function setCursor(db: Db, slot: number, signature: string) {
  await db.query(
    `UPDATE cursor SET last_slot = $1, last_signature = $2, updated_at = now() WHERE id = 1`,
    [slot, signature]
  );
}

/** Persist raw first, then project. Raw rows are the replay source. */
async function ingestTransaction(
  db: Db,
  signature: string,
  slot: number,
  blockTime: number | null,
  logs: string[] | null | undefined
) {
  if (!isRealSignature(signature)) {
    console.warn(`[ingest] ignoring notification with placeholder signature ${signature}`);
    return 0;
  }
  const events = decodeEvents(logs);
  if (events.length === 0) return 0;

  for (const ev of events) {
    const payload = plain(ev.data);
    await db.query(
      `INSERT INTO events (signature, event_index, slot, block_time, kind, payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (signature, event_index) DO NOTHING`,
      [signature, ev.index, slot, blockTime, ev.name, JSON.stringify(payload)]
    );
    await applyEvent(db, { name: ev.name, data: payload, index: ev.index }, {
      signature,
      slot,
      blockTime,
    });
  }
  return events.length;
}

/**
 * Walks history backwards to the last processed signature, then replays forward.
 *
 * This is the portable path and it costs one `getTransaction` per signature. At
 * real volume you would put a Geyser/webhook stream in front of it and keep this
 * only for cold starts and gap repair.
 */
export async function backfill(db: Db, connection: Connection, programId: PublicKey) {
  const { last_signature } = await getCursor(db);
  const pending: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;

  for (;;) {
    const page = await withRetry("getSignaturesForAddress", () =>
      connection.getSignaturesForAddress(
        programId,
        { before, limit: config.signaturePage, until: last_signature ?? undefined },
        COMMITMENT
      )
    );
    if (page === null) {
      console.warn("[backfill] could not list signatures; continuing with what we have");
      break;
    }
    if (page.length === 0) break;
    pending.push(...page);
    before = page[page.length - 1]!.signature;
    if (page.length < config.signaturePage) break;
  }

  if (pending.length === 0) {
    console.log("[backfill] up to date");
    return;
  }

  pending.reverse(); // oldest first, so projections apply in causal order
  console.log(`[backfill] ${pending.length} signature(s) to process`);

  let events = 0;
  let skipped = 0;
  for (const sig of pending) {
    if (sig.err) continue; // failed transactions changed nothing on chain
    const tx = await withRetry(`getTransaction ${sig.signature.slice(0, 8)}`, () =>
      connection.getTransaction(sig.signature, {
        commitment: COMMITMENT,
        maxSupportedTransactionVersion: 0,
      })
    );
    if (tx === null) {
      // Leave the cursor where it is so the next pass retries this signature.
      skipped++;
      continue;
    }
    events += await ingestTransaction(
      db,
      sig.signature,
      tx?.slot ?? sig.slot,
      tx?.blockTime ?? sig.blockTime ?? null,
      tx?.meta?.logMessages
    );
    await setCursor(db, sig.slot, sig.signature);
    await sleep(config.backfillDelayMs);
  }
  console.log(
    `[backfill] done, ${events} event(s) applied` +
      (skipped > 0 ? `, ${skipped} signature(s) deferred to the next pass` : "")
  );
}

/** Live tail. Overlaps the backfill cursor on purpose; ingest is idempotent. */
export function subscribe(db: Db, connection: Connection, programId: PublicKey) {
  const id = connection.onLogs(
    programId,
    async (logs, ctx) => {
      if (logs.err) return;
      try {
        const applied = await ingestTransaction(
          db,
          logs.signature,
          ctx.slot,
          Math.floor(Date.now() / 1000),
          logs.logs
        );
        if (applied > 0) {
          await setCursor(db, ctx.slot, logs.signature);
          console.log(`[live] ${logs.signature.slice(0, 8)}… ${applied} event(s)`);
        }
      } catch (err) {
        // Never let one bad transaction kill the subscription; the next
        // backfill will pick it up again.
        console.error("[live] ingest failed", logs.signature, err);
      }
    },
    COMMITMENT
  );
  console.log(`[live] subscribed to ${programId.toBase58()}`);
  return () => connection.removeOnLogsListener(id);
}
