/**
 * Tops up a wallet so a human can drive the UI: SOL for fees, plus a balance in
 * every token the frontend knows how to name.
 *
 * Usage: npx tsx scripts/fund.ts <wallet-address> [<wallet-address> …]
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getMint, mintTo,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Public RPCs rate-limit per call; slow the loop down rather than fail it. */
const PAUSE = Number(process.env.PAUSE_MS ?? (RPC.includes("127.0.0.1") ? 300 : 1_500));

const registry: Record<string, { symbol: string; usd?: number }> = JSON.parse(
  readFileSync(new URL("../app/src/lib/token-registry.json", import.meta.url), "utf8")
);

/** Roughly a few thousand dollars of each, so nothing is the limiting factor. */
function amountFor(usd: number | undefined): number {
  if (!usd || usd <= 0) return 1_000_000;
  return Math.max(1, Math.round(5_000 / usd));
}

async function retry<T>(label: string, fn: () => Promise<T>, attempts = 10): Promise<T> {
  let delay = 1_000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1) throw e;
      console.log(`  ${label}: retry ${i + 1}/${attempts - 1}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 15_000);
    }
  }
}

async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) throw new Error("usage: fund.ts <wallet-address> …");

  // A public devnet RPC throttles hard and its websocket drops under 429s, so
  // confirmations poll over HTTP and get a long window to land.
  const connection = new Connection(RPC, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 120_000,
    disableRetryOnRateLimit: false,
  });
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
  );
  const local = RPC.includes("127.0.0.1") || RPC.includes("localhost");
  const sol = Number(process.env.SOL_AMOUNT ?? (local ? 100 : 0.2));

  for (const target of targets) {
    const owner = new PublicKey(target);
    console.log(`\n${owner.toBase58()}`);

    // A local validator gives SOL away; devnet's faucet does not, so the
    // deployer covers it instead.
    let funded = false;
    if (local) {
      try {
        const sig = await connection.requestAirdrop(owner, sol * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(
          { signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
        funded = true;
      } catch { /* fall through */ }
    }
    if (!funded) {
      await retry("sol", () =>
        sendAndConfirmTransaction(
          connection,
          new Transaction().add(SystemProgram.transfer({
            fromPubkey: payer.publicKey, toPubkey: owner,
            lamports: Math.round(sol * LAMPORTS_PER_SOL),
          })),
          [payer], { commitment: "confirmed" }
        )
      );
    }
    console.log(`  SOL    ${sol}`);

    for (const [mintStr, meta] of Object.entries(registry)) {
      const mint = new PublicKey(mintStr);
      const info = await retry(`mint ${meta.symbol}`, () =>
        getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID));
      const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);
      const whole = amountFor(meta.usd);

      // Create then mint without reading the account back: a load-balanced RPC
      // will serve that read from a node that has not caught up yet.
      await retry(`ata ${meta.symbol}`, () =>
        sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            createAssociatedTokenAccountIdempotentInstruction(
              payer.publicKey, ata, owner, mint, TOKEN_PROGRAM_ID)
          ),
          [payer], { commitment: "confirmed" }
        )
      );
      await retry(`send ${meta.symbol}`, () =>
        mintTo(connection, payer, mint, ata, payer,
          BigInt(Math.round(whole * 10 ** info.decimals)), [], undefined, TOKEN_PROGRAM_ID)
      );
      console.log(`  ${meta.symbol.padEnd(6)} ${whole.toLocaleString("tr-TR")}`);
      await sleep(PAUSE);
    }
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
