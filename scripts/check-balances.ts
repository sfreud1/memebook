import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("/Users/dogantopcu/Desktop/memebook/app/src/lib/token-registry.json", "utf8"));
const c = new Connection("https://api.devnet.solana.com", "confirmed");
const W: Record<string, string> = {
  FAEk: "FAEkA2KyfmZYt6URMBARtm4F5WQ7ApBN9EyGwx1XeE1f",
  HKcah: "HKcahG2rq9Dr1b8GTkBWQEK8p3FeyX66UQGR53fudY7M",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (const [label, addr] of Object.entries(W)) {
    const r = await c.getParsedTokenAccountsByOwner(new PublicKey(addr), { programId: TOKEN_PROGRAM_ID });
    const have = new Map<string, string>();
    for (const { account } of r.value) {
      const i = (account.data as any).parsed.info;
      if (reg[i.mint]) have.set(reg[i.mint].symbol, i.tokenAmount.uiAmountString);
    }
    const missing = Object.values(reg).map((m: any) => m.symbol).filter((s) => !have.has(s));
    console.log(`${label}: ` + [...have.entries()].map(([k, v]) => `${k}=${Number(v).toLocaleString("tr-TR")}`).join("  "));
    console.log(`   eksik: ${missing.length ? missing.join(", ") : "(yok)"}`);
    await sleep(2000);
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
