import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import { Memebook } from "../target/types/memebook";
import idl from "../target/idl/memebook.json";
import {
  fundSol,
  createMint,
  createAtaAndMint,
  tokenBalance,
  nowTs,
  sleep,
  expectFailure,
  programDataPda,
} from "./helpers";

/**
 * Invariant suite.
 *
 * The tests in `memebook.ts` check that each instruction does what it says.
 * These check the properties that must hold across *every* reachable state,
 * because those are the ones whose violation makes the protocol insolvent
 * rather than merely wrong:
 *
 *   I1  an open offer's vault holds exactly its undrawn principal
 *   I2  an active loan's vault holds exactly its recorded collateral
 *   I3  principal_total == principal_available + everything ever drawn
 *   I4  tokens are conserved: nothing is minted or destroyed by the program
 *
 * They are asserted after every single state transition, not just at the end.
 */

const USDC_DEC = 6;
const MEME_DEC = 6;
const MINTED_PER_ACTOR = 1_000_000_000_000n;

describe("invariants", () => {
  let provider: anchor.AnchorProvider;
  let connection: Connection;
  let program: Program<Memebook>;
  let payer: Keypair;

  const admin = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const lenders = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const borrowers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];

  let usdc: PublicKey;
  let meme: PublicKey;
  let configPda: PublicKey;

  /** Every token account this suite can possibly touch, for the conservation sum. */
  const trackedUsdc: PublicKey[] = [];
  const trackedMeme: PublicKey[] = [];

  /** Model state: principal ever drawn from each offer. Loans get closed on
   *  settlement, so the chain cannot answer this on its own. */
  const drawnByOffer = new Map<string, bigint>();

  let totalUsdcMinted = 0n;
  let totalMemeMinted = 0n;

  const offerPda = (lender: PublicKey, id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), lender.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];
  const offerVaultPda = (offer: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("offer_vault"), offer.toBuffer()],
      program.programId
    )[0];
  const loanPda = (borrower: PublicKey, id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("loan"), borrower.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];
  const loanVaultPda = (loan: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("loan_vault"), loan.toBuffer()],
      program.programId
    )[0];

  let idCounter = 1;
  const nextId = () => new BN(Date.now() * 1000 + idCounter++);

  // ------------------------------------------------------------------ setup

  before(async function () {
    this.timeout(300_000);
    const env = anchor.AnchorProvider.env();
    connection = new Connection(env.connection.rpcEndpoint, "confirmed");
    provider = new anchor.AnchorProvider(connection, env.wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);
    program = new Program<Memebook>(idl as any, provider);
    payer = (provider.wallet as anchor.Wallet).payer;

    for (const kp of [admin, feeRecipient, ...lenders, ...borrowers]) {
      await fundSol(connection, kp.publicKey, 10);
    }

    usdc = await createMint(connection, payer, USDC_DEC);
    meme = await createMint(connection, payer, MEME_DEC);

    for (const kp of [...lenders, ...borrowers]) {
      trackedUsdc.push(
        await createAtaAndMint(connection, payer, usdc, kp.publicKey, MINTED_PER_ACTOR)
      );
      trackedMeme.push(
        await createAtaAndMint(connection, payer, meme, kp.publicKey, MINTED_PER_ACTOR)
      );
      totalUsdcMinted += MINTED_PER_ACTOR;
      totalMemeMinted += MINTED_PER_ACTOR;
    }
    trackedUsdc.push(
      await createAtaAndMint(connection, payer, usdc, feeRecipient.publicKey, 0n)
    );
    trackedMeme.push(
      await createAtaAndMint(connection, payer, meme, feeRecipient.publicKey, 0n)
    );

    configPda = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )[0];

    await program.methods
      .initializeConfig(admin.publicKey, feeRecipient.publicKey, 1000, 500, 10)
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        program: program.programId,
        programData: programDataPda(program.programId),
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  });

  // ------------------------------------------------------------- invariants

  async function checkInvariants(label: string) {
    const offers = await (program.account as any).offer.all();
    const loans = await (program.account as any).loan.all();

    let vaultUsdc = 0n;
    let vaultMeme = 0n;

    // I1 — an open offer's vault holds exactly its undrawn principal.
    for (const o of offers) {
      const vault = offerVaultPda(o.publicKey);
      const bal = await tokenBalance(connection, vault);
      const available = BigInt(o.account.principalAvailable.toString());
      assert.equal(
        bal,
        available,
        `[${label}] I1 offer ${o.publicKey.toBase58().slice(0, 8)}: vault ${bal} != available ${available}`
      );
      vaultUsdc += bal;

      // I3 — nothing has leaked out of the offer's accounting.
      const drawn = drawnByOffer.get(o.publicKey.toBase58()) ?? 0n;
      const total = BigInt(o.account.principalTotal.toString());
      assert.equal(
        available + drawn,
        total,
        `[${label}] I3 offer ${o.publicKey.toBase58().slice(0, 8)}: available ${available} + drawn ${drawn} != total ${total}`
      );
    }

    // I2 — an active loan's vault holds exactly the collateral it recorded.
    for (const l of loans) {
      const vault = loanVaultPda(l.publicKey);
      const bal = await tokenBalance(connection, vault);
      const recorded = BigInt(l.account.collateralAmount.toString());
      assert.equal(
        bal,
        recorded,
        `[${label}] I2 loan ${l.publicKey.toBase58().slice(0, 8)}: vault ${bal} != recorded ${recorded}`
      );
      vaultMeme += bal;
    }

    // I4 — conservation. The program moves tokens; it never creates or burns.
    let sumUsdc = vaultUsdc;
    for (const a of trackedUsdc) sumUsdc += await tokenBalance(connection, a);
    let sumMeme = vaultMeme;
    for (const a of trackedMeme) sumMeme += await tokenBalance(connection, a);

    assert.equal(sumUsdc, totalUsdcMinted, `[${label}] I4 USDC conservation`);
    assert.equal(sumMeme, totalMemeMinted, `[${label}] I4 MEME conservation`);
  }

  // ------------------------------------------------------------- operations

  async function doCreateOffer(
    lender: Keypair,
    principal: bigint,
    collateral: bigint,
    aprBps: number,
    durationSeconds: number
  ) {
    const id = nextId();
    const offer = offerPda(lender.publicKey, id);
    await program.methods
      .createOffer(
        id,
        new BN(principal.toString()),
        new BN(collateral.toString()),
        new BN(1),
        aprBps,
        durationSeconds,
        new BN((await nowTs(connection)) + 3600)
      )
      .accountsPartial({
        lender: lender.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(
          usdc, lender.publicKey, true, TOKEN_PROGRAM_ID
        ),
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();
    drawnByOffer.set(offer.toBase58(), 0n);
    return offer;
  }

  async function doAccept(borrower: Keypair, offer: PublicKey, draw: bigint) {
    const id = nextId();
    const loan = loanPda(borrower.publicKey, id);
    await program.methods
      .acceptOffer(id, new BN(draw.toString()))
      .accountsPartial({
        borrower: borrower.publicKey,
        config: configPda,
        offer,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        loanCollateralVault: loanVaultPda(loan),
        borrowerCollateralAccount: getAssociatedTokenAddressSync(
          meme, borrower.publicKey, true, TOKEN_PROGRAM_ID
        ),
        borrowerPrincipalAccount: getAssociatedTokenAddressSync(
          usdc, borrower.publicKey, true, TOKEN_PROGRAM_ID
        ),
        feeRecipient: feeRecipient.publicKey,
        feePrincipalAccount: getAssociatedTokenAddressSync(
          usdc, feeRecipient.publicKey, true, TOKEN_PROGRAM_ID
        ),
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();
    drawnByOffer.set(
      offer.toBase58(),
      (drawnByOffer.get(offer.toBase58()) ?? 0n) + draw
    );
    return loan;
  }

  async function doRepay(borrower: Keypair, loan: PublicKey) {
    const acc: any = await (program.account as any).loan.fetch(loan);
    await program.methods
      .repay()
      .accountsPartial({
        borrower: borrower.publicKey,
        lender: acc.lender,
        feeRecipient: feeRecipient.publicKey,
        config: configPda,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        loanCollateralVault: loanVaultPda(loan),
        borrowerPrincipalAccount: getAssociatedTokenAddressSync(
          usdc, borrower.publicKey, true, TOKEN_PROGRAM_ID
        ),
        borrowerCollateralAccount: getAssociatedTokenAddressSync(
          meme, borrower.publicKey, true, TOKEN_PROGRAM_ID
        ),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(
          usdc, acc.lender, true, TOKEN_PROGRAM_ID
        ),
        feePrincipalAccount: getAssociatedTokenAddressSync(
          usdc, feeRecipient.publicKey, true, TOKEN_PROGRAM_ID
        ),
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();
  }

  async function doClaim(lender: Keypair, loan: PublicKey) {
    const acc: any = await (program.account as any).loan.fetch(loan);
    await program.methods
      .claimDefault()
      .accountsPartial({
        lender: lender.publicKey,
        borrower: acc.borrower,
        feeRecipient: feeRecipient.publicKey,
        config: configPda,
        loan,
        collateralMint: meme,
        loanCollateralVault: loanVaultPda(loan),
        lenderCollateralAccount: getAssociatedTokenAddressSync(
          meme, lender.publicKey, true, TOKEN_PROGRAM_ID
        ),
        feeCollateralAccount: getAssociatedTokenAddressSync(
          meme, feeRecipient.publicKey, true, TOKEN_PROGRAM_ID
        ),
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();
  }

  async function doCancel(lender: Keypair, offer: PublicKey) {
    await program.methods
      .cancelOffer()
      .accountsPartial({
        lender: lender.publicKey,
        offer,
        principalMint: usdc,
        offerVault: offerVaultPda(offer),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(
          usdc, lender.publicKey, true, TOKEN_PROGRAM_ID
        ),
        principalTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lender])
      .rpc();
    drawnByOffer.delete(offer.toBase58());
  }

  // ------------------------------------------------------------------ tests

  it("holds every invariant through a randomised operation sequence", async function () {
    this.timeout(900_000);

    // Deterministic PRNG so a failure is reproducible from the seed alone.
    // FUZZ_SEED / FUZZ_OPS let CI grind far longer runs than the default.
    let seed = Number(process.env.FUZZ_SEED ?? 0xC0FFEE);
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

    const liveOffers: { key: PublicKey; lender: Keypair }[] = [];
    const liveLoans: { key: PublicKey; borrower: Keypair; lender: Keypair }[] = [];

    await checkInvariants("genesis");

    const OPS = Number(process.env.FUZZ_OPS ?? 40);
    for (let step = 0; step < OPS; step++) {
      const roll = rand();

      if (roll < 0.3 || liveOffers.length === 0) {
        const lender = pick(lenders);
        // Deliberately awkward magnitudes: prime-ish numbers force the
        // pro-rata collateral maths to round rather than divide evenly.
        const principal = BigInt(Math.floor(rand() * 900_000_000) + 100_000_007);
        const collateral = BigInt(Math.floor(rand() * 9_000_000_000) + 1_000_000_013);
        const apr = Math.floor(rand() * 20_000) + 100;
        const offer = await doCreateOffer(lender, principal, collateral, apr, 3600);
        liveOffers.push({ key: offer, lender });
      } else if (roll < 0.65 && liveOffers.length > 0) {
        const idx = Math.floor(rand() * liveOffers.length);
        const o = liveOffers[idx]!;
        const acc: any = await (program.account as any).offer.fetch(o.key).catch(() => null);
        if (!acc) { liveOffers.splice(idx, 1); continue; }
        const available = BigInt(acc.principalAvailable.toString());
        if (available === 0n) continue;
        // Draw a random slice, occasionally the whole remainder.
        const draw = rand() < 0.25
          ? available
          : BigInt(Math.max(1, Math.floor(Number(available) * rand())));
        const borrower = pick(borrowers);
        const loan = await doAccept(borrower, o.key, draw);
        liveLoans.push({ key: loan, borrower, lender: o.lender });
      } else if (roll < 0.9 && liveLoans.length > 0) {
        const idx = Math.floor(rand() * liveLoans.length);
        const l = liveLoans[idx]!;
        await doRepay(l.borrower, l.key);
        liveLoans.splice(idx, 1);
      } else if (liveOffers.length > 0) {
        const idx = Math.floor(rand() * liveOffers.length);
        const o = liveOffers[idx]!;
        await doCancel(o.lender, o.key);
        liveOffers.splice(idx, 1);
      }

      await checkInvariants(`step ${step}`);
    }

    console.log(
      `      ran ${OPS} random operations; ${liveOffers.length} offer(s) and ${liveLoans.length} loan(s) still live`
    );
  });

  it("splitting a draw never buys cheaper collateral", async function () {
    this.timeout(300_000);

    // The classic rounding attack: if pro-rata collateral rounded down, a
    // borrower could slice one draw into many and post less collateral for the
    // same total principal.
    const principal = 1_000_000_007n;
    const collateral = 3_333_333_331n;
    const lender = lenders[0]!;

    const single = await doCreateOffer(lender, principal, collateral, 1500, 3600);
    const wholeLoan = await doAccept(borrowers[0]!, single, principal);
    const whole: any = await (program.account as any).loan.fetch(wholeLoan);
    const wholeCollateral = BigInt(whole.collateralAmount.toString());
    await checkInvariants("split: whole draw");

    const split = await doCreateOffer(lender, principal, collateral, 1500, 3600);
    const slice = principal / 7n;
    let splitCollateral = 0n;
    let remaining = principal;
    for (let i = 0; i < 6; i++) {
      const loan = await doAccept(borrowers[1]!, split, slice);
      const acc: any = await (program.account as any).loan.fetch(loan);
      splitCollateral += BigInt(acc.collateralAmount.toString());
      remaining -= slice;
      await checkInvariants(`split: slice ${i}`);
    }
    const lastLoan = await doAccept(borrowers[1]!, split, remaining);
    const last: any = await (program.account as any).loan.fetch(lastLoan);
    splitCollateral += BigInt(last.collateralAmount.toString());
    await checkInvariants("split: remainder");

    assert.isAtLeast(
      Number(splitCollateral - wholeCollateral),
      0,
      `splitting the draw posted LESS collateral (${splitCollateral} < ${wholeCollateral})`
    );
    console.log(
      `      whole draw: ${wholeCollateral}, split into 7: ${splitCollateral} (+${splitCollateral - wholeCollateral})`
    );
  });

  it("refuses settlement by anyone but the recorded counterparty", async function () {
    this.timeout(300_000);

    const lender = lenders[1]!;
    const borrower = borrowers[0]!;
    const impostor = borrowers[2]!;

    const offer = await doCreateOffer(lender, 200_000_000n, 900_000_000n, 2000, 3600);
    const loan = await doAccept(borrower, offer, 100_000_000n);

    // A different wallet must not be able to repay into someone else's loan
    // and walk off with their collateral.
    await expectFailure(doRepay(impostor, loan), "");
    // Nor may a lender who did not fund it claim the collateral.
    await expectFailure(doClaim(lenders[2]!, loan), "");
    // Nor may a stranger cancel the offer and drain the undrawn principal.
    await expectFailure(doCancel(impostor, offer), "");

    await checkInvariants("after impostor attempts");
  });

  it("keeps the invariants across the maturity boundary", async function () {
    this.timeout(300_000);

    const SHORT = 60;
    const lender = lenders[2]!;
    const borrower = borrowers[2]!;

    const offer = await doCreateOffer(lender, 300_000_000n, 1_200_000_000n, 3000, SHORT);
    const a = await doAccept(borrower, offer, 100_000_000n);
    const b = await doAccept(borrower, offer, 150_000_000n);
    await checkInvariants("pre-maturity");

    // Both loans must be past maturity, not just the first. They are opened a
    // moment apart, so the second matures a moment later — waiting only on the
    // first leaves the claim racing it.
    const accA: any = await (program.account as any).loan.fetch(a);
    const accB: any = await (program.account as any).loan.fetch(b);
    const lastMaturity = Math.max(accA.maturityTs.toNumber(), accB.maturityTs.toNumber());
    while ((await nowTs(connection)) <= lastMaturity) await sleep(2000);

    // Past maturity repayment must be closed and claiming must be open, with
    // no window in which both or neither work.
    await expectFailure(doRepay(borrower, a), "LoanMatured");
    await checkInvariants("post-maturity, unsettled");

    await doClaim(lender, a);
    await checkInvariants("after first claim");
    await doClaim(lender, b);
    await checkInvariants("after second claim");

    // And a claimed loan cannot be claimed twice.
    await expectFailure(doClaim(lender, a), "");
    await checkInvariants("after double-claim attempt");
  });
});
