/**
 * Populates a local validator with a realistic-looking book so the UI has
 * something to render. Mints stand-in USDC and a memecoin, then posts offers
 * whose terms mirror listings observed on a live fixed-term book: safe
 * collateral gets a high LTV and a low rate, junk gets the opposite.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "../target/idl/memebook.json" assert { type: "json" };
import { writeFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";

const pda = (seeds: (Buffer | Uint8Array)[], programId: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];
const leU64 = (v: number | bigint) => new BN(v.toString()).toArrayLike(Buffer, "le", 8);

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const provider = anchor.AnchorProvider.env();
  const wallet = provider.wallet as anchor.Wallet;
  const payer = wallet.payer;

  const p = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(p);
  const program = new Program(idl as anchor.Idl, p);
  const programId = program.programId;

  const configPda = pda([Buffer.from("config")], programId);

  // Config is a singleton; create it only if this ledger is brand new.
  try {
    await (program.account as any).config.fetch(configPda);
    console.log("config: already initialised");
  } catch {
    await program.methods
      .initializeConfig(payer.publicKey, payer.publicKey, 1000, 500, 10)
      .accountsPartial({ payer: payer.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("config: initialised");
  }

  const usdc = await createMint(connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID);
  const meme = await createMint(connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID);
  console.log("USDC mint:", usdc.toBase58());
  console.log("MEME mint:", meme.toBase58());

  for (const mint of [usdc, meme]) {
    await createAssociatedTokenAccount(connection, payer, mint, payer.publicKey, undefined, TOKEN_PROGRAM_ID);
    await mintTo(
      connection, payer, mint,
      getAssociatedTokenAddressSync(mint, payer.publicKey, true, TOKEN_PROGRAM_ID),
      payer, 10_000_000_000_000n, [], undefined, TOKEN_PROGRAM_ID
    );
  }

  // A local validator has no token list, so hand the frontend the names and
  // logos for the mints we just created. Without this the UI can only show
  // truncated addresses, which nobody can read.
  writeFileSync(
    new URL("../app/src/lib/token-registry.json", import.meta.url),
    JSON.stringify(
      {
        [usdc.toBase58()]: {
          symbol: "USDC",
          name: "USD Coin",
          logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
        },
        [meme.toBase58()]: {
          symbol: "CATCOIN",
          name: "Catcoin",
          logo: "https://cdn.dexscreener.com/cms/images/QLFzvD85Djk0nvgI?width=128&height=128&quality=95&format=auto",
        },
      },
      null,
      2
    ) + "\n"
  );
  console.log("token registry written for the frontend");

  const now = Math.floor(Date.now() / 1000);
  const offers = [
    { label: "tight",   principal: 500_000_000n, collateral: 28_045_000_000n, apr: 1875, days: 30 },
    { label: "loose",   principal: 250_000_000n, collateral: 20_000_000_000n, apr: 4500, days: 14 },
    { label: "cheapest", principal: 1_000_000_000n, collateral: 70_000_000_000n, apr: 1200, days: 7 },
  ];

  for (const o of offers) {
    const offerId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const offer = pda([Buffer.from("offer"), payer.publicKey.toBuffer(), leU64(offerId)], programId);
    await program.methods
      .createOffer(
        new BN(offerId.toString()),
        new BN(o.principal.toString()),
        new BN(o.collateral.toString()),
        new BN(10_000_000),
        o.apr,
        o.days * 86_400,
        new BN(now + 30 * 86_400)
      )
      .accountsPartial({
        lender: payer.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: pda([Buffer.from("offer_vault"), offer.toBuffer()], programId),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(usdc, payer.publicKey, true, TOKEN_PROGRAM_ID),
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`offer[${o.label}]: ${o.apr / 100}% APR, ${o.days}D, ${offer.toBase58()}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
