/**
 * Fills a test cluster with a book that looks like a real one.
 *
 * Creates a spread of fictional collateral tokens, several independent lenders
 * quoting terms that actually reflect how risky each token is, borrowers who
 * draw against them, and a settled history — repayments and a default — so the
 * market table has something to report rather than a row of dashes.
 *
 * Everything here is invented. No real project's name, ticker or artwork is
 * used, because dressing a worthless test mint in a real token's identity
 * misrepresents that project.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint, mintTo, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { writeFileSync } from "node:fs";
import idl from "../target/idl/memebook.json" assert { type: "json" };

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const PAUSE = Number(process.env.PAUSE_MS ?? 400); // public RPCs throttle hard

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pda = (seeds: (Buffer | Uint8Array)[], p: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, p)[0];
const le = (v: BN) => v.toArrayLike(Buffer, "le", 8);
const id = () => new BN(Date.now() * 1000 + Math.floor(Math.random() * 1000));

function logo(bg: string, fg: string, ch: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="32" fill="${bg}"/>` +
    `<text x="32" y="42" font-family="system-ui,sans-serif" font-size="28" ` +
    `font-weight="700" fill="${fg}" text-anchor="middle">${ch}</text></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

/** decimals, price, and how a lender should feel about holding it. */
const TOKENS = {
  tUSD:  { name: "Test Dolar",   dec: 6, usd: 1,        logo: logo("#2775ca", "#fff", "$") },
  tSOL:  { name: "Test SOL",     dec: 9, usd: 98,       logo: logo("#9945ff", "#fff", "S") },
  DOGGO: { name: "Doggo Token",  dec: 6, usd: 0.0509,   logo: logo("#e8a33d", "#1a1207", "D") },
  PEPPY: { name: "Peppy",        dec: 6, usd: 0.00124,  logo: logo("#3fb950", "#08140a", "P") },
  MOONZ: { name: "Moonz",        dec: 6, usd: 0.000091, logo: logo("#a371f7", "#0d0618", "M") },
} as const;
type Sym = keyof typeof TOKENS;

/** Terms a lender would plausibly quote: safe collateral gets a high LTV and a
 *  low rate, junk gets the opposite. */
const BOOK: Array<{ collateral: Sym; ltv: number; apr: number; days: number; size: number }> = [
  { collateral: "tSOL",  ltv: 0.70, apr: 9,     days: 30, size: 2_000 },
  { collateral: "tSOL",  ltv: 0.65, apr: 7.5,   days: 14, size: 1_200 },
  { collateral: "DOGGO", ltv: 0.35, apr: 18.75, days: 30, size: 500 },
  { collateral: "DOGGO", ltv: 0.42, apr: 26,    days: 14, size: 800 },
  { collateral: "DOGGO", ltv: 0.30, apr: 15,    days: 7,  size: 1_500 },
  { collateral: "PEPPY", ltv: 0.28, apr: 45,    days: 14, size: 400 },
  { collateral: "PEPPY", ltv: 0.22, apr: 38,    days: 7,  size: 650 },
  { collateral: "MOONZ", ltv: 0.18, apr: 85,    days: 7,  size: 250 },
  { collateral: "MOONZ", ltv: 0.15, apr: 120,   days: 7,  size: 300 },
];

/** Public devnet throttles and lags; one rejected request should not end the run. */
async function retry<T>(label: string, fn: () => Promise<T>, attempts = 6): Promise<T> {
  let delay = 600;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1) throw e;
      const msg = String((e as Error)?.message ?? e).slice(0, 60);
      console.log(`    ${label} yeniden deneniyor (${msg})`);
      await sleep(delay);
      delay = Math.min(delay * 2, 8_000);
    }
  }
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(connection, env.wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);
  const P = program.programId;
  const payer = (provider.wallet as anchor.Wallet).payer as Keypair;
  const configPda = pda([Buffer.from("config")], P);
  const cfg: any = await (program.account as any).config.fetch(configPda);

  // ---- mints ----
  console.log("mint'ler oluşturuluyor…");
  const mint: Record<string, PublicKey> = {};
  for (const [sym, t] of Object.entries(TOKENS)) {
    mint[sym] = await retry(`createMint ${sym}`, () =>
      createMint(connection, payer, payer.publicKey, null, t.dec,
        undefined, undefined, TOKEN_PROGRAM_ID));
    console.log(`  ${sym.padEnd(6)} ${mint[sym]!.toBase58()}`);
    await sleep(PAUSE);
  }

  writeFileSync(
    new URL("../app/src/lib/token-registry.json", import.meta.url),
    JSON.stringify(
      Object.fromEntries(Object.entries(TOKENS).map(([sym, t]) => [
        mint[sym]!.toBase58(),
        { symbol: sym, name: t.name, logo: t.logo, usd: t.usd },
      ])), null, 2) + "\n"
  );
  console.log("token defteri yazıldı");

  /**
   * Creates the token account and mints into it without reading it back.
   *
   * `getOrCreateAssociatedTokenAccount` writes then immediately reads, and a
   * load-balanced public RPC will happily serve that read from a node that has
   * not caught up yet — reporting the account missing moments after creating
   * it. Deriving the address and using the idempotent instruction sidesteps the
   * read entirely.
   */
  const give = async (owner: PublicKey, sym: Sym, whole: number) => {
    const t = TOKENS[sym];
    const ata = getAssociatedTokenAddressSync(mint[sym]!, owner, true, TOKEN_PROGRAM_ID);
    await retry(`ata ${sym}`, async () => {
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey, ata, owner, mint[sym]!, TOKEN_PROGRAM_ID
        )
      );
      await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    });
    await retry(`mint ${sym}`, () =>
      mintTo(connection, payer, mint[sym]!, ata, payer,
        BigInt(Math.round(whole * 10 ** t.dec)), [], undefined, TOKEN_PROGRAM_ID)
    );
    await sleep(PAUSE);
  };

  const fundSol = async (to: PublicKey, sol: number) => {
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: payer.publicKey, toPubkey: to,
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    }));
    await retry("fundSol", () =>
      sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" }));
    await sleep(PAUSE);
  };

  // ---- cast ----
  const lenders = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const borrowers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  console.log("\ncüzdanlar hazırlanıyor…");
  for (const k of lenders) {
    await fundSol(k.publicKey, 0.06);
    await give(k.publicKey, "tUSD", 20_000);
  }
  for (const k of borrowers) {
    await fundSol(k.publicKey, 0.06);
    await give(k.publicKey, "tUSD", 5_000);
    for (const s of ["tSOL", "DOGGO", "PEPPY", "MOONZ"] as Sym[]) {
      await give(k.publicKey, s, s === "tSOL" ? 500 : 50_000_000);
    }
  }
  console.log(`  ${lenders.length} lender, ${borrowers.length} borçlu`);

  // ---- offers ----
  console.log("\nteklifler açılıyor…");
  const opened: Array<{ offer: PublicKey; collateral: Sym; lender: Keypair; size: number }> = [];
  for (let i = 0; i < BOOK.length; i++) {
    const b = BOOK[i]!;
    const lender = lenders[i % lenders.length]!;
    const t = TOKENS[b.collateral];
    const principal = BigInt(Math.round(b.size * 10 ** TOKENS.tUSD.dec));
    // Collateral worth `size / ltv` in dollars, expressed in the token.
    const collateralWhole = b.size / b.ltv / t.usd;
    const collateral = BigInt(Math.round(collateralWhole * 10 ** t.dec));

    const offerId = id();
    const offer = pda([Buffer.from("offer"), lender.publicKey.toBuffer(), le(offerId)], P);
    await program.methods.createOffer(
      offerId, new BN(principal.toString()), new BN(collateral.toString()),
      new BN(10 * 10 ** TOKENS.tUSD.dec), Math.round(b.apr * 100), b.days * 86_400,
      new BN(Math.floor(Date.now() / 1000) + 30 * 86_400)
    ).accountsPartial({
      lender: lender.publicKey, config: configPda, offer,
      principalMint: mint.tUSD!, collateralMint: mint[b.collateral]!,
      offerVault: pda([Buffer.from("offer_vault"), offer.toBuffer()], P),
      lenderPrincipalAccount: getAssociatedTokenAddressSync(mint.tUSD!, lender.publicKey, true, TOKEN_PROGRAM_ID),
      principalTokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).signers([lender]).rpc();
    opened.push({ offer, collateral: b.collateral, lender, size: b.size });
    console.log(`  ${b.collateral.padEnd(6)} %${(b.ltv * 100).toFixed(0)} LTV · %${b.apr} · ${b.days}g · ${b.size} tUSD`);
    await sleep(PAUSE);
  }

  // ---- draws ----
  const draw = async (o: typeof opened[number], who: Keypair, part: number) => {
    const acc: any = await (program.account as any).offer.fetch(o.offer);
    const amount = BigInt(Math.floor(Number(acc.principalAvailable) * part));
    if (amount <= 0n) return null;
    const loanId = id();
    const loan = pda([Buffer.from("loan"), who.publicKey.toBuffer(), le(loanId)], P);
    await program.methods.acceptOffer(loanId, new BN(amount.toString())).accountsPartial({
      borrower: who.publicKey, config: configPda, offer: o.offer, loan,
      principalMint: acc.principalMint, collateralMint: acc.collateralMint,
      offerVault: pda([Buffer.from("offer_vault"), o.offer.toBuffer()], P),
      loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()], P),
      borrowerCollateralAccount: getAssociatedTokenAddressSync(acc.collateralMint, who.publicKey, true, TOKEN_PROGRAM_ID),
      borrowerPrincipalAccount: getAssociatedTokenAddressSync(acc.principalMint, who.publicKey, true, TOKEN_PROGRAM_ID),
      feeRecipient: cfg.feeRecipient,
      feePrincipalAccount: getAssociatedTokenAddressSync(acc.principalMint, cfg.feeRecipient, true, TOKEN_PROGRAM_ID),
      principalTokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).signers([who]).rpc();
    await sleep(PAUSE);
    return loan;
  };

  console.log("\nkrediler çekiliyor…");
  const live: Array<{ loan: PublicKey; who: Keypair }> = [];
  for (const [i, o] of opened.entries()) {
    if (i % 3 === 2) continue; // leave a third of the book untouched
    const who = borrowers[i % borrowers.length]!;
    const loan = await draw(o, who, i % 2 === 0 ? 0.6 : 0.35);
    if (loan) {
      live.push({ loan, who });
      console.log(`  ${o.collateral} çekildi`);
    }
  }

  // ---- history: two repayments ----
  console.log("\ngeçmiş oluşturuluyor…");
  for (const { loan, who } of live.slice(0, 2)) {
    const l: any = await (program.account as any).loan.fetch(loan);
    await program.methods.repay().accountsPartial({
      borrower: who.publicKey, lender: l.lender, feeRecipient: cfg.feeRecipient,
      config: configPda, loan, principalMint: l.principalMint, collateralMint: l.collateralMint,
      loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()], P),
      borrowerPrincipalAccount: getAssociatedTokenAddressSync(l.principalMint, who.publicKey, true, TOKEN_PROGRAM_ID),
      borrowerCollateralAccount: getAssociatedTokenAddressSync(l.collateralMint, who.publicKey, true, TOKEN_PROGRAM_ID),
      lenderPrincipalAccount: getAssociatedTokenAddressSync(l.principalMint, l.lender, true, TOKEN_PROGRAM_ID),
      feePrincipalAccount: getAssociatedTokenAddressSync(l.principalMint, cfg.feeRecipient, true, TOKEN_PROGRAM_ID),
      principalTokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).signers([who]).rpc();
    console.log("  bir kredi ödendi");
    await sleep(PAUSE);
  }

  // ---- history: one default, so the table can show a real rate ----
  const junk = opened.find((o) => o.collateral === "MOONZ")!;
  const shortId = id();
  const shortOffer = pda([Buffer.from("offer"), junk.lender.publicKey.toBuffer(), le(shortId)], P);
  const t = TOKENS.MOONZ;
  await program.methods.createOffer(
    shortId, new BN(100 * 10 ** TOKENS.tUSD.dec),
    new BN(Math.round((100 / 0.15 / t.usd) * 10 ** t.dec).toString()),
    new BN(10 * 10 ** TOKENS.tUSD.dec), 12_000, 60,
    new BN(Math.floor(Date.now() / 1000) + 86_400)
  ).accountsPartial({
    lender: junk.lender.publicKey, config: configPda, offer: shortOffer,
    principalMint: mint.tUSD!, collateralMint: mint.MOONZ!,
    offerVault: pda([Buffer.from("offer_vault"), shortOffer.toBuffer()], P),
    lenderPrincipalAccount: getAssociatedTokenAddressSync(mint.tUSD!, junk.lender.publicKey, true, TOKEN_PROGRAM_ID),
    principalTokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).signers([junk.lender]).rpc();

  const defaulter = borrowers[0]!;
  const badLoan = await draw(
    { offer: shortOffer, collateral: "MOONZ", lender: junk.lender, size: 100 }, defaulter, 1);
  console.log("  60 saniyelik kredi açıldı, vadesi bekleniyor…");
  await sleep(66_000);

  const bl: any = await (program.account as any).loan.fetch(badLoan!);
  await program.methods.claimDefault().accountsPartial({
    lender: junk.lender.publicKey, borrower: bl.borrower, feeRecipient: cfg.feeRecipient,
    config: configPda, loan: badLoan!, collateralMint: bl.collateralMint,
    loanCollateralVault: pda([Buffer.from("loan_vault"), badLoan!.toBuffer()], P),
    lenderCollateralAccount: getAssociatedTokenAddressSync(bl.collateralMint, junk.lender.publicKey, true, TOKEN_PROGRAM_ID),
    feeCollateralAccount: getAssociatedTokenAddressSync(bl.collateralMint, cfg.feeRecipient, true, TOKEN_PROGRAM_ID),
    collateralTokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).signers([junk.lender]).rpc();
  console.log("  bir kredi temerrüde düştü, teminata el konuldu");

  const offers = await (program.account as any).offer.all();
  const loans = await (program.account as any).loan.all();
  console.log(`\nbitti: ${offers.length} açık teklif, ${loans.length} açık kredi`);
}

main().catch((e) => { console.error(e); process.exit(1); });
