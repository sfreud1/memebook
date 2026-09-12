/**
 * Hands the Config admin to a Squads (v3) multisig, in two steps.
 *
 *   npx tsx scripts/transfer-admin.ts propose <MULTISIG>
 *     — the current admin (ANCHOR_WALLET, also a multisig member) proposes the
 *       Squad's vault as the new admin, then opens a multisig transaction that
 *       calls accept_admin, activates it and casts this member's approval.
 *
 *   npx tsx scripts/transfer-admin.ts execute <MULTISIG> <TX_PDA>
 *     — once the other member(s) approved in the Squads UI, executes it.
 *
 * ANCHOR_PROVIDER_URL / ANCHOR_WALLET as usual.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import Squads, { Wallet, getAuthorityPDA, DEFAULT_MULTISIG_PROGRAM_ID } from "@sqds/sdk";
import BN from "bn.js";
import idl from "../target/idl/memebook.json" assert { type: "json" };

/** Squads v3 calls its default vault "authority index 1". */
const VAULT_INDEX = 1;

async function main() {
  const [cmd, multisigArg, txArg] = process.argv.slice(2);
  if (!cmd || !multisigArg) throw new Error("usage: propose <MULTISIG> | execute <MULTISIG> <TX_PDA>");

  const provider = anchor.AnchorProvider.env();
  const rpc = provider.connection.rpcEndpoint;
  const connection = new Connection(rpc, "confirmed");
  const p = new anchor.AnchorProvider(connection, provider.wallet, { commitment: "confirmed" });
  anchor.setProvider(p);
  const program = new Program(idl as anchor.Idl, p);
  const payer = (p.wallet as anchor.Wallet).payer;

  const msPDA = new PublicKey(multisigArg);
  const [vault] = getAuthorityPDA(msPDA, new BN(VAULT_INDEX), DEFAULT_MULTISIG_PROGRAM_ID);
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const cfg = async () => (program.account as any).config.fetch(configPda);
  const squads = Squads.endpoint(rpc, new Wallet(payer), { commitmentOrConfig: "confirmed" });

  const ms = await squads.getMultisig(msPDA);
  console.log("multisig :", msPDA.toBase58(), `(${ms.threshold}/${ms.keys.length})`);
  console.log("vault    :", vault.toBase58(), "(this becomes the admin)");
  console.log("config   :", configPda.toBase58());
  if (!ms.keys.some((k: PublicKey) => k.equals(payer.publicKey))) {
    throw new Error(`${payer.publicKey.toBase58()} is not a member of this multisig`);
  }

  if (cmd === "propose") {
    const before = await cfg();
    console.log("admin now:", before.admin.toBase58(), "| pending:", before.pendingAdmin.toBase58());
    if (!before.admin.equals(payer.publicKey)) throw new Error("wallet is not the current admin");

    if (before.pendingAdmin.equals(vault)) {
      console.log("propose_admin: already pending for the vault");
    } else {
      const sig = await program.methods
        .proposeAdmin(vault)
        .accountsPartial({ admin: payer.publicKey, config: configPda })
        .signers([payer])
        .rpc();
      console.log("propose_admin:", sig);
    }

    // accept_admin has to be signed by the vault, so it goes through the multisig.
    const acceptIx = await program.methods
      .acceptAdmin()
      .accountsPartial({ pendingAdmin: vault, config: configPda })
      .instruction();

    const tx = await squads.createTransaction(msPDA, VAULT_INDEX);
    console.log("multisig tx:", tx.publicKey.toBase58(), "| index", tx.transactionIndex);
    await squads.addInstruction(tx.publicKey, acceptIx);
    await squads.activateTransaction(tx.publicKey);
    await squads.approveTransaction(tx.publicKey);
    const after = await squads.getTransaction(tx.publicKey);
    console.log("approved by:", after.approved.map((k: PublicKey) => k.toBase58()).join(", "));
    console.log("status     :", JSON.stringify(after.status));
    console.log("\nNext: the other member approves it in the Squads UI (Transactions), then run:");
    console.log(`  npx tsx scripts/transfer-admin.ts execute ${msPDA.toBase58()} ${tx.publicKey.toBase58()}`);
    return;
  }

  if (cmd === "execute") {
    if (!txArg) throw new Error("execute needs the multisig transaction PDA");
    const txPDA = new PublicKey(txArg);
    const t = await squads.getTransaction(txPDA);
    console.log("status before:", JSON.stringify(t.status), "| approvals:", t.approved.length, "/", ms.threshold);
    const sig = await squads.executeTransaction(txPDA);
    console.log("executed:", sig);
    const after = await cfg();
    console.log("admin now:", after.admin.toBase58(), "| pending:", after.pendingAdmin.toBase58());
    console.log(after.admin.equals(vault) ? "OK — the Squad vault is the admin" : "admin did NOT change");
    return;
  }
  throw new Error(`unknown command ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
