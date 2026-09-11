/**
 * Tops up a wallet on the local validator so a human can actually drive the UI:
 * SOL for fees, principal tokens to repay with, collateral tokens to lock.
 *
 * Usage: npx tsx scripts/fund.ts <wallet-address> [usdc-mint] [meme-mint]
 * The mints default to whatever the running indexer is currently serving.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const API = process.env.API_URL ?? "http://127.0.0.1:8080";

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("usage: fund.ts <wallet-address> [usdc-mint] [meme-mint]");
  const owner = new PublicKey(target);

  const connection = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))
    )
  );

  let usdcMint = process.argv[3];
  let memeMint = process.argv[4];
  if (!usdcMint || !memeMint) {
    const res = await fetch(`${API}/offers`);
    const { offers } = (await res.json()) as any;
    if (!offers?.length) throw new Error("no offers in the book; run scripts/seed.ts first");
    usdcMint ??= offers[0].principal_mint;
    memeMint ??= offers[0].collateral_mint;
  }

  // A local validator hands out SOL freely. Devnet's faucet is rate limited to
  // the point of being unusable, so fall back to transferring from the wallet
  // that funded the deployment.
  const requested = Number(process.env.SOL_AMOUNT ?? 0) || (RPC.includes("127.0.0.1") ? 100 : 0.3);
  let funded = false;
  try {
    const sig = await connection.requestAirdrop(owner, requested * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(
      { signature: sig, ...(await connection.getLatestBlockhash()) },
      "confirmed"
    );
    funded = true;
    console.log(`SOL      ${requested}  (airdrop)`);
  } catch {
    /* fall through to a transfer */
  }
  if (!funded) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: owner,
        lamports: Math.round(requested * LAMPORTS_PER_SOL),
      })
    );
    await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log(`SOL      ${requested}  (transfer from ${payer.publicKey.toBase58().slice(0, 8)}…)`);
  }

  for (const [label, mintStr, whole] of [
    ["USDC", usdcMint!, 100_000n],
    ["MEME", memeMint!, 100_000_000n],
  ] as const) {
    const mint = new PublicKey(mintStr);
    const info = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
    const amount = whole * 10n ** BigInt(info.decimals);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection, payer, mint, owner, true, "confirmed", undefined, TOKEN_PROGRAM_ID
    );
    await mintTo(
      connection, payer, mint, ata.address, payer, amount, [], undefined, TOKEN_PROGRAM_ID
    );
    console.log(`${label}     ${whole.toLocaleString("en-US")}   (${mintStr})`);
  }

  console.log(`\nfunded ${owner.toBase58()}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
