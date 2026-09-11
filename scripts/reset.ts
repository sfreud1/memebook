/**
 * Clears the book: repays or claims every loan the deployer can settle, then
 * cancels every offer it owns. Leaves the program, the config and the mints in
 * place so the next run starts from an empty order book rather than a fresh
 * deployment.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "../target/idl/memebook.json" assert { type: "json" };

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";

const pda = (seeds: (Buffer | Uint8Array)[], programId: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];
const le = (v: BN) => v.toArrayLike(Buffer, "le", 8);

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    anchor.AnchorProvider.env().wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);
  const me = (provider.wallet as anchor.Wallet).payer as Keypair;
  const P = program.programId;
  const configPda = pda([Buffer.from("config")], P);
  const cfg: any = await (program.account as any).config.fetch(configPda);

  const loans = await (program.account as any).loan.all();
  console.log(`${loans.length} kredi bulundu`);
  const now = Math.floor(Date.now() / 1000);

  for (const { publicKey: loan, account: l } of loans) {
    const mine = l.borrower.equals(me.publicKey);
    const lender = l.lender.equals(me.publicKey);
    const matured = l.maturityTs.toNumber() <= now;
    try {
      if (mine && !matured) {
        await program.methods.repay().accountsPartial({
          borrower: me.publicKey, lender: l.lender, feeRecipient: cfg.feeRecipient,
          config: configPda, loan, principalMint: l.principalMint, collateralMint: l.collateralMint,
          loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()], P),
          borrowerPrincipalAccount: getAssociatedTokenAddressSync(l.principalMint, me.publicKey, true, TOKEN_PROGRAM_ID),
          borrowerCollateralAccount: getAssociatedTokenAddressSync(l.collateralMint, me.publicKey, true, TOKEN_PROGRAM_ID),
          lenderPrincipalAccount: getAssociatedTokenAddressSync(l.principalMint, l.lender, true, TOKEN_PROGRAM_ID),
          feePrincipalAccount: getAssociatedTokenAddressSync(l.principalMint, cfg.feeRecipient, true, TOKEN_PROGRAM_ID),
          principalTokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        }).rpc();
        console.log(`  ödendi   ${loan.toBase58().slice(0, 8)}…`);
      } else if (lender && matured) {
        await program.methods.claimDefault().accountsPartial({
          lender: me.publicKey, borrower: l.borrower, feeRecipient: cfg.feeRecipient,
          config: configPda, loan, collateralMint: l.collateralMint,
          loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()], P),
          lenderCollateralAccount: getAssociatedTokenAddressSync(l.collateralMint, me.publicKey, true, TOKEN_PROGRAM_ID),
          feeCollateralAccount: getAssociatedTokenAddressSync(l.collateralMint, cfg.feeRecipient, true, TOKEN_PROGRAM_ID),
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        }).rpc();
        console.log(`  el konuldu ${loan.toBase58().slice(0, 8)}…`);
      } else {
        console.log(`  atlandı  ${loan.toBase58().slice(0, 8)}… (başkasının, vadesi dolmamış)`);
      }
    } catch (e: any) {
      console.log(`  HATA     ${loan.toBase58().slice(0, 8)}… ${String(e.message ?? e).slice(0, 70)}`);
    }
  }

  const offers = await (program.account as any).offer.all();
  console.log(`\n${offers.length} teklif bulundu`);
  for (const { publicKey: offer, account: o } of offers) {
    if (!o.lender.equals(me.publicKey)) {
      console.log(`  atlandı  ${offer.toBase58().slice(0, 8)}… (başkasının)`);
      continue;
    }
    try {
      await program.methods.cancelOffer().accountsPartial({
        lender: me.publicKey, offer, principalMint: o.principalMint,
        offerVault: pda([Buffer.from("offer_vault"), offer.toBuffer()], P),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(o.principalMint, me.publicKey, true, TOKEN_PROGRAM_ID),
        principalTokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
      console.log(`  iptal    ${offer.toBase58().slice(0, 8)}…`);
    } catch (e: any) {
      console.log(`  HATA     ${offer.toBase58().slice(0, 8)}… ${String(e.message ?? e).slice(0, 70)}`);
    }
  }

  console.log(`\nkalan: ${(await (program.account as any).loan.all()).length} kredi, ${(await (program.account as any).offer.all()).length} teklif`);
}

main().catch((e) => { console.error(e); process.exit(1); });
