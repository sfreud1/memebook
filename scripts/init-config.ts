/**
 * One-time protocol setup on a fresh deployment, signed by the program's
 * upgrade authority (ANCHOR_WALLET).
 *
 *   ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/mainnet-deploy.json \
 *   npx tsx scripts/init-config.ts <ADMIN> <FEE_RECIPIENT> [orig_bps interest_bps default_bps]
 *
 * Point ADMIN at the multisig vault from the start — then there is no admin
 * handover to do afterwards. Fees default to 1000 / 500 / 10 bps: 10% of
 * interest at origination, 5% of interest at repayment, 0.1% of collateral
 * on a default claim. Refuses to run if the config already exists.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../target/idl/memebook.json" assert { type: "json" };

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

async function main() {
  const [adminArg, feeArg, o = "1000", i = "500", d = "10"] = process.argv.slice(2);
  if (!adminArg || !feeArg) throw new Error("usage: init-config.ts <ADMIN> <FEE_RECIPIENT> [orig interest default]");
  const admin = new PublicKey(adminArg);
  const feeRecipient = new PublicKey(feeArg);
  const fees = [o, i, d].map((x) => Number(x));
  if (fees.some((x) => !Number.isInteger(x) || x < 0)) throw new Error("fees must be non-negative integers (bps)");

  const provider = anchor.AnchorProvider.env();
  const connection = new Connection(provider.connection.rpcEndpoint, "confirmed");
  const p = new anchor.AnchorProvider(connection, provider.wallet, { commitment: "confirmed" });
  anchor.setProvider(p);
  const program = new Program(idl as anchor.Idl, p);
  const payer = (p.wallet as anchor.Wallet).payer;
  const programId = program.programId;

  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
  const programData = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE)[0];

  if (await connection.getAccountInfo(configPda)) {
    throw new Error(`config ${configPda.toBase58()} already exists — nothing to do`);
  }

  console.log("program      :", programId.toBase58());
  console.log("signer       :", payer.publicKey.toBase58(), "(must be the upgrade authority)");
  console.log("admin        :", admin.toBase58());
  console.log("fee recipient:", feeRecipient.toBase58());
  console.log("fees (bps)   :", fees.join(" / "));

  const sig = await program.methods
    .initializeConfig(admin, feeRecipient, fees[0], fees[1], fees[2])
    .accountsPartial({
      payer: payer.publicKey,
      config: configPda,
      program: programId,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();
  console.log("initialize_config:", sig);

  const cfg = await (program.account as any).config.fetch(configPda);
  console.log("config       :", configPda.toBase58(), "| version", cfg.version, "| paused", cfg.paused);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
