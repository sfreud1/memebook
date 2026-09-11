import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";

const idl = JSON.parse(readFileSync(new URL("../target/idl/memebook.json", import.meta.url), "utf8"));
const reg = JSON.parse(readFileSync(new URL("../app/src/lib/token-registry.json", import.meta.url), "utf8"));
const P = new PublicKey(idl.address);
const LOAN = new PublicKey("FDJVZ3U8NSTmbMGtNnWcuVnvW3TwtYzSnG1WNMXrHfmo");
const LENDER = new PublicKey("HKcahG2rq9Dr1b8GTkBWQEK8p3FeyX66UQGR53fudY7M");
const BORROWER = new PublicKey("FAEkA2KyfmZYt6URMBARtm4F5WQ7ApBN9EyGwx1XeE1f");

async function main() {
  const c = new Connection("https://api.devnet.solana.com", "confirmed");

  const loan = await c.getAccountInfo(LOAN);
  console.log("  kredi hesabı :", loan ? "HÂLÂ VAR" : "kapanmış ✓");

  const vault = PublicKey.findProgramAddressSync(
    [Buffer.from("loan_vault"), LOAN.toBuffer()], P)[0];
  const v = await c.getAccountInfo(vault);
  console.log("  escrow kasası:", v ? "HÂLÂ VAR" : "kapanmış ✓");

  for (const [label, who] of [["lender (HKcah)", LENDER], ["borçlu (FAEk)", BORROWER]] as const) {
    const r = await c.getParsedTokenAccountsByOwner(who, { programId: TOKEN_PROGRAM_ID });
    const bal: Record<string, string> = {};
    for (const { account } of r.value) {
      const i = (account.data as any).parsed.info;
      if (reg[i.mint]) bal[reg[i.mint].symbol] = i.tokenAmount.uiAmountString;
    }
    console.log(`  ${label}: DOGGO=${Number(bal.DOGGO ?? 0).toLocaleString("tr-TR")}  tUSD=${Number(bal.tUSD ?? 0).toLocaleString("tr-TR")}`);
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
