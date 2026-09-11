/**
 * Rewrites the Config singleton from the pre-version-byte layout to the
 * current one. Signed by the program's upgrade authority (ANCHOR_WALLET).
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx tsx scripts/migrate-config.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../target/idl/memebook.json" assert { type: "json" };

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

async function main() {
  const provider = anchor.AnchorProvider.env();
  const connection = new Connection(provider.connection.rpcEndpoint, "confirmed");
  const p = new anchor.AnchorProvider(connection, provider.wallet, { commitment: "confirmed" });
  anchor.setProvider(p);
  const program = new Program(idl as anchor.Idl, p);
  const programId = program.programId;
  const payer = (p.wallet as anchor.Wallet).payer;

  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
  const programData = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE)[0];

  const before = await connection.getAccountInfo(configPda);
  if (!before) throw new Error("config account does not exist — run seed/initialize instead");
  console.log(`config ${configPda.toBase58()}: ${before.data.length} bytes before`);

  const sig = await program.methods
    .migrateConfig()
    .accountsPartial({
      payer: payer.publicKey,
      config: configPda,
      program: programId,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();
  console.log("migrate_config:", sig);

  const after = await connection.getAccountInfo(configPda);
  const cfg = await (program.account as any).config.fetch(configPda);
  console.log(`after: ${after?.data.length} bytes, version ${cfg.version}`);
  console.log("admin:", cfg.admin.toBase58(), "| fee recipient:", cfg.feeRecipient.toBase58());
  console.log("fees (bps):", cfg.originationFeeBps, cfg.interestFeeBps, cfg.defaultFeeBps, "| paused:", cfg.paused);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
