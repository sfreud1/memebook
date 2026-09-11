import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { backfill, subscribe } from "./ingest.js";
import { buildApi } from "./api.js";

async function main() {
  const backfillOnly = process.argv.includes("--backfill-only");
  const programId = new PublicKey(config.programId);

  const db = await openDb();
  console.log(
    `[db] ${config.databaseUrl ? "postgres" : `pglite ${config.pgliteDir}`} ready`
  );

  const connection = new Connection(config.rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: config.wsUrl,
  });

  try {
    await backfill(db, connection, programId);
  } catch (err) {
    // The live tail and the API are still useful with an incomplete history,
    // and the next pass will fill the gap.
    console.error("[backfill] aborted:", (err as Error)?.message ?? err);
  }
  if (backfillOnly) {
    await db.close();
    return;
  }

  const unsubscribe = subscribe(db, connection, programId);

  const app = await buildApi(db);
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[api] listening on :${config.port}`);

  const shutdown = async () => {
    unsubscribe();
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
