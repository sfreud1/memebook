import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getMint, mintTo, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

/** Mints one token to one wallet. For patching up what a throttled run missed. */
async function main() {
  const [owner, symbol, whole] = process.argv.slice(2);
  if (!owner || !symbol || !whole) throw new Error("usage: top-up.ts <wallet> <SYMBOL> <amount>");

  const reg = JSON.parse(
    readFileSync(new URL("../app/src/lib/token-registry.json", import.meta.url), "utf8")
  );
  const entry = Object.entries(reg).find(([, m]: any) => m.symbol === symbol);
  if (!entry) throw new Error(`registry'de ${symbol} yok`);

  const c = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
  );
  const mint = new PublicKey(entry[0]);
  const info = await getMint(c, mint, "confirmed", TOKEN_PROGRAM_ID);
  const ata = getAssociatedTokenAddressSync(mint, new PublicKey(owner), true, TOKEN_PROGRAM_ID);
  await mintTo(c, payer, mint, ata, payer,
    BigInt(Math.round(Number(whole) * 10 ** info.decimals)), [], undefined, TOKEN_PROGRAM_ID);
  console.log(`${symbol} ${Number(whole).toLocaleString("tr-TR")} -> ${owner.slice(0, 8)}…`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
