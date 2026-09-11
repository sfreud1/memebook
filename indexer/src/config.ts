import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const IDL = JSON.parse(
  readFileSync(resolve(here, "../../target/idl/memebook.json"), "utf8")
);

export const config = {
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8899",
  wsUrl: process.env.WS_URL,
  programId: process.env.PROGRAM_ID ?? (IDL.address as string),

  /** Unset => embedded PGlite. Set => a real Postgres, same SQL either way. */
  databaseUrl: process.env.DATABASE_URL,
  pgliteDir: process.env.PGLITE_DIR ?? resolve(here, "../.data"),

  port: Number(process.env.PORT ?? 8080),
  /** Pause between backfill transaction fetches. Public RPCs need it. */
  backfillDelayMs: Number(process.env.BACKFILL_DELAY_MS ?? 250),

  /** Backfill page size; RPC caps this at 1000. */
  signaturePage: Number(process.env.SIGNATURE_PAGE ?? 1000),
  /** "*" in dev; set to the frontend origin in production. */
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  /** Cheap in-process cache for the hot book queries. */
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 2_000),
};
