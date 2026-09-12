/**
 * Posts (or cancels) one offer from the CLI wallet — for checking the book
 * renders, not for seeding it.
 *
 *   npx tsx scripts/post-offer.ts post <PRINCIPAL_MINT> <COLLATERAL_MINT> \
 *       <principal> <collateral> <apr%> <days> [minDraw] [expiryDays]
 *   npx tsx scripts/post-offer.ts cancel <OFFER_PUBKEY>
 *
 * Amounts are in whole tokens; decimals are read from the mints.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "../target/idl/memebook.json" assert { type: "json" };

const pda = (seeds: (Buffer | Uint8Array)[], programId: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];
const leU64 = (v: bigint) => new BN(v.toString()).toArrayLike(Buffer, "le", 8);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const provider = anchor.AnchorProvider.env();
  const connection = new Connection(provider.connection.rpcEndpoint, "confirmed");
  const p = new anchor.AnchorProvider(connection, provider.wallet, { commitment: "confirmed" });
  anchor.setProvider(p);
  const program = new Program(idl as anchor.Idl, p);
  const programId = program.programId;
  const lender = (p.wallet as anchor.Wallet).payer.publicKey;

  const tokenProgramFor = async (mint: PublicKey) => {
    const acc = await connection.getAccountInfo(mint);
    return acc?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  };

  if (cmd === "post") {
    const [pm, cm, principal, collateral, apr, days, minDraw = "10", expiryDays = "1"] = rest;
    if (!pm || !cm || !principal || !collateral || !apr || !days) {
      throw new Error("usage: post <PRINCIPAL_MINT> <COLLATERAL_MINT> <principal> <collateral> <apr%> <days> [minDraw] [expiryDays]");
    }
    const principalMint = new PublicKey(pm);
    const collateralMint = new PublicKey(cm);
    const ptp = await tokenProgramFor(principalMint);
    const pDec = (await getMint(connection, principalMint, "confirmed", ptp)).decimals;
    const cDec = (await getMint(connection, collateralMint, "confirmed", await tokenProgramFor(collateralMint))).decimals;
    const raw = (v: string, dec: number) => BigInt(Math.round(Number(v) * 10 ** dec));

    const offerId = (BigInt(Date.now()) << 20n) | BigInt(Math.floor(Math.random() * 1_048_576));
    const offer = pda([Buffer.from("offer"), lender.toBuffer(), leU64(offerId)], programId);
    const offerVault = pda([Buffer.from("offer_vault"), offer.toBuffer()], programId);

    const sig = await program.methods
      .createOffer(
        new BN(offerId.toString()),
        new BN(raw(principal, pDec).toString()),
        new BN(raw(collateral, cDec).toString()),
        new BN(raw(minDraw, pDec).toString()),
        Math.round(Number(apr) * 100),
        Math.round(Number(days) * 86_400),
        new BN(Math.floor(Date.now() / 1000) + Math.round(Number(expiryDays) * 86_400))
      )
      .accountsPartial({
        lender,
        config: pda([Buffer.from("config")], programId),
        offer,
        principalMint,
        collateralMint,
        offerVault,
        lenderPrincipalAccount: getAssociatedTokenAddressSync(principalMint, lender, false, ptp),
        principalTokenProgram: ptp,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("offer :", offer.toBase58());
    console.log("tx    :", sig);
    return;
  }

  if (cmd === "cancel") {
    const [offerArg] = rest;
    if (!offerArg) throw new Error("usage: cancel <OFFER_PUBKEY>");
    const offer = new PublicKey(offerArg);
    const acc: any = await (program.account as any).offer.fetch(offer);
    const principalMint: PublicKey = acc.principalMint ?? acc.principal_mint;
    const ptp = await tokenProgramFor(principalMint);
    const sig = await program.methods
      .cancelOffer()
      .accountsPartial({
        lender,
        offer,
        principalMint,
        offerVault: pda([Buffer.from("offer_vault"), offer.toBuffer()], programId),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(principalMint, lender, false, ptp),
        principalTokenProgram: ptp,
      })
      .rpc();
    console.log("cancelled:", sig);
    return;
  }
  throw new Error("usage: post … | cancel <OFFER_PUBKEY>");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
