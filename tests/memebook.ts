import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
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
} from "./helpers";

// ---------------------------------------------------------------------------
// The offer under test is a faithful copy of a live Offerbook listing:
//   "Lock 28,045 TROLL · 35% LTV — 500 USDC — 18.75% APR · 30D · costs 7.71"
// If our interest maths is right, the program must independently arrive at
// 7.70548 USDC of interest for a full draw.
// ---------------------------------------------------------------------------
const USDC_DECIMALS = 6;
const MEME_DECIMALS = 6;

const PRINCIPAL_TOTAL = new BN(500_000_000); // 500 USDC
const COLLATERAL_TOTAL = new BN(28_045_000_000); // 28,045 MEME
const MIN_DRAW = new BN(10_000_000); // 10 USDC
const APR_BPS = 1875; // 18.75%
const DURATION = 2_592_000; // 30 days

const ORIGINATION_FEE_BPS = 1000; // 10% of interest, charged to the borrower
const INTEREST_FEE_BPS = 500; //  5% of interest, skimmed from the lender
const DEFAULT_FEE_BPS = 10; //  0.1% of collateral on default

// Hand-computed expectations for a full 500 USDC draw.
const EXPECTED_INTEREST = 7_705_480n; // ceil(500e6 * 1875 * 2592000 / (1e4 * 31536000))
const EXPECTED_ORIGINATION_FEE = 770_548n;
const EXPECTED_DISBURSED = 499_229_452n;
const EXPECTED_INTEREST_FEE = 385_274n;
const EXPECTED_LENDER_RECEIVED = 507_320_206n;

describe("memebook", () => {
  let provider: anchor.AnchorProvider;
  let connection: Connection;
  let program: Program<Memebook>;

  let payer: Keypair;
  const admin = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const lender = Keypair.generate();
  const borrower = Keypair.generate();

  let usdc: PublicKey;
  let meme: PublicKey;
  let lenderUsdc: PublicKey;
  let borrowerUsdc: PublicKey;
  let borrowerMeme: PublicKey;
  let feeUsdc: PublicKey;

  let configPda: PublicKey;

  const offerPda = (lenderKey: PublicKey, offerId: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), lenderKey.toBuffer(), offerId.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  const offerVaultPda = (offer: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("offer_vault"), offer.toBuffer()],
      program.programId
    )[0];

  const loanPda = (borrowerKey: PublicKey, loanId: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("loan"), borrowerKey.toBuffer(), loanId.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  const loanVaultPda = (loan: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("loan_vault"), loan.toBuffer()],
      program.programId
    )[0];

  before(async () => {
    // Pin everything to "confirmed". With the default "processed" commitment
    // the balance reads race ahead of the transactions they are meant to check.
    const envProvider = anchor.AnchorProvider.env();
    connection = new Connection(envProvider.connection.rpcEndpoint, "confirmed");
    provider = new anchor.AnchorProvider(connection, envProvider.wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);
    program = new Program<Memebook>(idl as any, provider);
    payer = (provider.wallet as anchor.Wallet).payer;

    for (const kp of [admin, feeRecipient, lender, borrower]) {
      await fundSol(connection, kp.publicKey, 10);
    }

    usdc = await createMint(connection, payer, USDC_DECIMALS);
    meme = await createMint(connection, payer, MEME_DECIMALS);

    lenderUsdc = await createAtaAndMint(connection, payer, usdc, lender.publicKey, 10_000_000_000n);
    borrowerUsdc = await createAtaAndMint(connection, payer, usdc, borrower.publicKey, 10_000_000_000n);
    borrowerMeme = await createAtaAndMint(connection, payer, meme, borrower.publicKey, 500_000_000_000n);
    feeUsdc = await createAtaAndMint(connection, payer, usdc, feeRecipient.publicKey, 0n);

    configPda = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )[0];
  });

  // -------------------------------------------------------------- config ---

  it("initialises config", async () => {
    await program.methods
      .initializeConfig(
        admin.publicKey,
        feeRecipient.publicKey,
        ORIGINATION_FEE_BPS,
        INTEREST_FEE_BPS,
        DEFAULT_FEE_BPS
      )
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(cfg.originationFeeBps, ORIGINATION_FEE_BPS);
    assert.equal(cfg.interestFeeBps, INTEREST_FEE_BPS);
    assert.equal(cfg.defaultFeeBps, DEFAULT_FEE_BPS);
    assert.isFalse(cfg.paused);
  });

  it("refuses an interest fee above the hard cap", async () => {
    // MAX_INTEREST_FEE_BPS is 3000. A compromised admin key must not be able to
    // raise the take rate arbitrarily.
    await expectFailure(
      program.methods
        .setFees(3001, INTEREST_FEE_BPS, DEFAULT_FEE_BPS)
        .accountsPartial({ admin: admin.publicKey, config: configPda })
        .signers([admin])
        .rpc(),
      "FeeTooHigh"
    );
  });

  it("refuses a non-admin fee change", async () => {
    await expectFailure(
      program.methods
        .setFees(100, 100, 1)
        .accountsPartial({ admin: lender.publicKey, config: configPda })
        .signers([lender])
        .rpc(),
      "NotAdmin"
    );
  });

  // --------------------------------------------------------------- offers ---

  it("creates an offer and escrows the principal", async () => {
    const offerId = new BN(1);
    const offer = offerPda(lender.publicKey, offerId);
    const vault = offerVaultPda(offer);
    const expiry = new BN((await nowTs(connection)) + 7 * 24 * 3600);

    const lenderBefore = await tokenBalance(connection, lenderUsdc);

    await program.methods
      .createOffer(offerId, PRINCIPAL_TOTAL, COLLATERAL_TOTAL, MIN_DRAW, APR_BPS, DURATION, expiry)
      .accountsPartial({
        lender: lender.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: vault,
        lenderPrincipalAccount: lenderUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();

    const acc = await program.account.offer.fetch(offer);
    assert.equal(acc.principalTotal.toString(), PRINCIPAL_TOTAL.toString());
    assert.equal(acc.principalAvailable.toString(), PRINCIPAL_TOTAL.toString());
    assert.equal(acc.collateralTotal.toString(), COLLATERAL_TOTAL.toString());
    assert.equal(acc.aprBps, APR_BPS);

    assert.equal(await tokenBalance(connection, vault), BigInt(PRINCIPAL_TOTAL.toString()));
    assert.equal(
      lenderBefore - (await tokenBalance(connection, lenderUsdc)),
      BigInt(PRINCIPAL_TOTAL.toString())
    );
  });

  it("rejects an offer whose principal and collateral mints are the same", async () => {
    const offerId = new BN(99);
    const offer = offerPda(lender.publicKey, offerId);
    await expectFailure(
      program.methods
        .createOffer(offerId, PRINCIPAL_TOTAL, COLLATERAL_TOTAL, MIN_DRAW, APR_BPS, DURATION,
          new BN((await nowTs(connection)) + 3600))
        .accountsPartial({
          lender: lender.publicKey,
          config: configPda,
          offer,
          principalMint: usdc,
          collateralMint: usdc,
          offerVault: offerVaultPda(offer),
          lenderPrincipalAccount: lenderUsdc,
          principalTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lender])
        .rpc(),
      "IdenticalMints"
    );
  });

  // ---------------------------------------------------------------- loans ---

  it("opens a loan with the interest and collateral the real listing quotes", async () => {
    const offerId = new BN(1);
    const loanId = new BN(1);
    const offer = offerPda(lender.publicKey, offerId);
    const loan = loanPda(borrower.publicKey, loanId);

    const borrowerUsdcBefore = await tokenBalance(connection, borrowerUsdc);
    const borrowerMemeBefore = await tokenBalance(connection, borrowerMeme);

    await program.methods
      .acceptOffer(loanId, PRINCIPAL_TOTAL)
      .accountsPartial({
        borrower: borrower.publicKey,
        config: configPda,
        offer,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        loanCollateralVault: loanVaultPda(loan),
        borrowerCollateralAccount: borrowerMeme,
        borrowerPrincipalAccount: borrowerUsdc,
        feeRecipient: feeRecipient.publicKey,
        feePrincipalAccount: feeUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const acc = await program.account.loan.fetch(loan);

    // The headline assertion: 18.75% APR on 500 USDC for 30 days.
    assert.equal(acc.interestAmount.toString(), EXPECTED_INTEREST.toString());
    assert.equal(acc.principalAmount.toString(), PRINCIPAL_TOTAL.toString());
    assert.equal(acc.collateralAmount.toString(), COLLATERAL_TOTAL.toString());
    assert.equal(acc.maturityTs.toNumber() - acc.startTs.toNumber(), DURATION);

    // Borrower received principal minus the origination fee.
    assert.equal(
      (await tokenBalance(connection, borrowerUsdc)) - borrowerUsdcBefore,
      EXPECTED_DISBURSED
    );
    // Collateral left the borrower in full.
    assert.equal(
      borrowerMemeBefore - (await tokenBalance(connection, borrowerMeme)),
      BigInt(COLLATERAL_TOTAL.toString())
    );
    // Protocol took its origination cut.
    assert.equal(await tokenBalance(connection, feeUsdc), EXPECTED_ORIGINATION_FEE);
    // Offer is drained.
    assert.equal((await program.account.offer.fetch(offer)).principalAvailable.toNumber(), 0);
  });

  it("refuses a draw larger than the offer's remaining liquidity", async () => {
    const offer = offerPda(lender.publicKey, new BN(1));
    const loanId = new BN(2);
    const loan = loanPda(borrower.publicKey, loanId);
    await expectFailure(
      program.methods
        .acceptOffer(loanId, new BN(1))
        .accountsPartial({
          borrower: borrower.publicKey,
          config: configPda,
          offer,
          loan,
          principalMint: usdc,
          collateralMint: meme,
          offerVault: offerVaultPda(offer),
          loanCollateralVault: loanVaultPda(loan),
          borrowerCollateralAccount: borrowerMeme,
          borrowerPrincipalAccount: borrowerUsdc,
          feeRecipient: feeRecipient.publicKey,
          feePrincipalAccount: feeUsdc,
          principalTokenProgram: TOKEN_PROGRAM_ID,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc(),
      "InsufficientOfferLiquidity"
    );
  });

  it("repays before maturity: lender made whole, collateral returned", async () => {
    const loanId = new BN(1);
    const loan = loanPda(borrower.publicKey, loanId);
    const lenderAta = getAssociatedTokenAddressSync(usdc, lender.publicKey, true, TOKEN_PROGRAM_ID);

    const lenderBefore = await tokenBalance(connection, lenderAta);
    const feeBefore = await tokenBalance(connection, feeUsdc);
    const borrowerMemeBefore = await tokenBalance(connection, borrowerMeme);

    await program.methods
      .repay()
      .accountsPartial({
        borrower: borrower.publicKey,
        lender: lender.publicKey,
        feeRecipient: feeRecipient.publicKey,
        config: configPda,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        loanCollateralVault: loanVaultPda(loan),
        borrowerPrincipalAccount: borrowerUsdc,
        borrowerCollateralAccount: borrowerMeme,
        lenderPrincipalAccount: lenderAta,
        feePrincipalAccount: feeUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    assert.equal((await tokenBalance(connection, lenderAta)) - lenderBefore, EXPECTED_LENDER_RECEIVED);
    assert.equal((await tokenBalance(connection, feeUsdc)) - feeBefore, EXPECTED_INTEREST_FEE);
    assert.equal(
      (await tokenBalance(connection, borrowerMeme)) - borrowerMemeBefore,
      BigInt(COLLATERAL_TOTAL.toString())
    );

    // Loan and its escrow are gone; rent went back to the borrower.
    assert.isNull(await connection.getAccountInfo(loan));
    assert.isNull(await connection.getAccountInfo(loanVaultPda(loan)));
  });

  // ----------------------------------------------------- partial + rounding ---

  it("rounds partial-draw collateral up, never down", async () => {
    const offerId = new BN(2);
    const offer = offerPda(lender.publicKey, offerId);
    const expiry = new BN((await nowTs(connection)) + 7 * 24 * 3600);

    await program.methods
      .createOffer(offerId, PRINCIPAL_TOTAL, COLLATERAL_TOTAL, MIN_DRAW, APR_BPS, DURATION, expiry)
      .accountsPartial({
        lender: lender.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        lenderPrincipalAccount: lenderUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();

    // One micro-USDC short of the full draw. Exact pro-rata collateral is
    // 28,044,999,943.91 — the program must charge 944, not 943.
    const draw = PRINCIPAL_TOTAL.sub(new BN(1));
    const loanId = new BN(10);
    const loan = loanPda(borrower.publicKey, loanId);

    await program.methods
      .acceptOffer(loanId, draw)
      .accountsPartial({
        borrower: borrower.publicKey,
        config: configPda,
        offer,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        loanCollateralVault: loanVaultPda(loan),
        borrowerCollateralAccount: borrowerMeme,
        borrowerPrincipalAccount: borrowerUsdc,
        feeRecipient: feeRecipient.publicKey,
        feePrincipalAccount: feeUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const acc = await program.account.loan.fetch(loan);
    assert.equal(acc.collateralAmount.toString(), "28044999944");
  });

  // -------------------------------------------------------------- default ---

  it("refuses a default claim before maturity", async () => {
    const loanId = new BN(10);
    const loan = loanPda(borrower.publicKey, loanId);
    const lenderMemeAta = getAssociatedTokenAddressSync(meme, lender.publicKey, true, TOKEN_PROGRAM_ID);
    const feeMemeAta = getAssociatedTokenAddressSync(meme, feeRecipient.publicKey, true, TOKEN_PROGRAM_ID);

    await expectFailure(
      program.methods
        .claimDefault()
        .accountsPartial({
          lender: lender.publicKey,
          borrower: borrower.publicKey,
          feeRecipient: feeRecipient.publicKey,
          config: configPda,
          loan,
          collateralMint: meme,
          loanCollateralVault: loanVaultPda(loan),
          lenderCollateralAccount: lenderMemeAta,
          feeCollateralAccount: feeMemeAta,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lender])
        .rpc(),
      "LoanNotMatured"
    );
  });

  it("refuses repayment after maturity, and hands the collateral to the lender", async () => {
    // A dedicated short-dated offer: the validator clock cannot be warped, so
    // this test genuinely waits out the term.
    const SHORT_DURATION = 60;
    const offerId = new BN(4);
    const offer = offerPda(lender.publicKey, offerId);
    const expiry = new BN((await nowTs(connection)) + 3600);

    await program.methods
      .createOffer(offerId, new BN(50_000_000), new BN(2_800_000_000), MIN_DRAW, APR_BPS, SHORT_DURATION, expiry)
      .accountsPartial({
        lender: lender.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        lenderPrincipalAccount: lenderUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();

    const loanId = new BN(40);
    const loan = loanPda(borrower.publicKey, loanId);
    await program.methods
      .acceptOffer(loanId, new BN(50_000_000))
      .accountsPartial({
        borrower: borrower.publicKey,
        config: configPda,
        offer,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: offerVaultPda(offer),
        loanCollateralVault: loanVaultPda(loan),
        borrowerCollateralAccount: borrowerMeme,
        borrowerPrincipalAccount: borrowerUsdc,
        feeRecipient: feeRecipient.publicKey,
        feePrincipalAccount: feeUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const acc = await program.account.loan.fetch(loan);
    const collateral = BigInt(acc.collateralAmount.toString());

    // Wait past maturity for real.
    while ((await nowTs(connection)) <= acc.maturityTs.toNumber()) {
      await sleep(2000);
    }

    const lenderAta = getAssociatedTokenAddressSync(usdc, lender.publicKey, true, TOKEN_PROGRAM_ID);
    await expectFailure(
      program.methods
        .repay()
        .accountsPartial({
          borrower: borrower.publicKey,
          lender: lender.publicKey,
          feeRecipient: feeRecipient.publicKey,
          config: configPda,
          loan,
          principalMint: usdc,
          collateralMint: meme,
          loanCollateralVault: loanVaultPda(loan),
          borrowerPrincipalAccount: borrowerUsdc,
          borrowerCollateralAccount: borrowerMeme,
          lenderPrincipalAccount: lenderAta,
          feePrincipalAccount: feeUsdc,
          principalTokenProgram: TOKEN_PROGRAM_ID,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc(),
      "LoanMatured"
    );

    const lenderMemeAta = getAssociatedTokenAddressSync(meme, lender.publicKey, true, TOKEN_PROGRAM_ID);
    const feeMemeAta = getAssociatedTokenAddressSync(meme, feeRecipient.publicKey, true, TOKEN_PROGRAM_ID);
    const lenderMemeBefore = await tokenBalance(connection, lenderMemeAta);
    const feeMemeBefore = await tokenBalance(connection, feeMemeAta);

    await program.methods
      .claimDefault()
      .accountsPartial({
        lender: lender.publicKey,
        borrower: borrower.publicKey,
        feeRecipient: feeRecipient.publicKey,
        config: configPda,
        loan,
        collateralMint: meme,
        loanCollateralVault: loanVaultPda(loan),
        lenderCollateralAccount: lenderMemeAta,
        feeCollateralAccount: feeMemeAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();

    const expectedFee = (collateral * BigInt(DEFAULT_FEE_BPS)) / 10_000n;
    assert.equal((await tokenBalance(connection, lenderMemeAta)) - lenderMemeBefore, collateral - expectedFee);
    assert.equal((await tokenBalance(connection, feeMemeAta)) - feeMemeBefore, expectedFee);
    assert.isNull(await connection.getAccountInfo(loan));
  });

  // --------------------------------------------------------------- cancel ---

  it("cancels an offer and returns only the undrawn principal", async () => {
    const offerId = new BN(3);
    const offer = offerPda(lender.publicKey, offerId);
    const vault = offerVaultPda(offer);
    const expiry = new BN((await nowTs(connection)) + 7 * 24 * 3600);

    await program.methods
      .createOffer(offerId, PRINCIPAL_TOTAL, COLLATERAL_TOTAL, MIN_DRAW, APR_BPS, DURATION, expiry)
      .accountsPartial({
        lender: lender.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: vault,
        lenderPrincipalAccount: lenderUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lender])
      .rpc();

    // Draw a slice, leaving the rest undrawn.
    const draw = new BN(200_000_000);
    const loanId = new BN(20);
    const loan = loanPda(borrower.publicKey, loanId);
    await program.methods
      .acceptOffer(loanId, draw)
      .accountsPartial({
        borrower: borrower.publicKey,
        config: configPda,
        offer,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: vault,
        loanCollateralVault: loanVaultPda(loan),
        borrowerCollateralAccount: borrowerMeme,
        borrowerPrincipalAccount: borrowerUsdc,
        feeRecipient: feeRecipient.publicKey,
        feePrincipalAccount: feeUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const lenderBefore = await tokenBalance(connection, lenderUsdc);

    await program.methods
      .cancelOffer()
      .accountsPartial({
        lender: lender.publicKey,
        offer,
        principalMint: usdc,
        offerVault: vault,
        lenderPrincipalAccount: lenderUsdc,
        principalTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lender])
      .rpc();

    // Only the undrawn 300 USDC comes back.
    assert.equal(
      (await tokenBalance(connection, lenderUsdc)) - lenderBefore,
      BigInt(PRINCIPAL_TOTAL.sub(draw).toString())
    );
    assert.isNull(await connection.getAccountInfo(offer));

    // Crucially, the live loan drawn from that offer is untouched: cancelling
    // must never let a lender reach into a borrower's escrowed collateral.
    const stillThere = await program.account.loan.fetch(loan);
    assert.equal(stillThere.principalAmount.toString(), draw.toString());
    const vaultBal = await tokenBalance(connection, loanVaultPda(loan));
    assert.isTrue(vaultBal > 0n);
  });
});
