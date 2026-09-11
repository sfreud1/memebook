import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
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
} from "./helpers";

/**
 * Regression: the lender and the protocol's fee recipient being the same wallet.
 *
 * That is an ordinary situation — the operator seeding their own book is the
 * obvious case — and it used to make repayment impossible. Both the lender's
 * and the fee recipient's token accounts resolve to one address, Anchor's
 * duplicate-mutable-account guard rejected the instruction, and the borrower
 * was left unable to repay while the lender collected the collateral for free.
 *
 * The behavioural suite never caught it because it always used distinct
 * keypairs for the two roles.
 */
describe("fee recipient / lender collision", () => {
  let provider: anchor.AnchorProvider;
  let connection: Connection;
  let program: Program<Memebook>;
  let payer: Keypair;

  // One wallet wearing both hats. This is the whole point of the test.
  const lenderAndFeeRecipient = Keypair.generate();
  const borrower = Keypair.generate();
  // ...and one wearing all three, which is what the operator testing their own
  // market actually looks like.
  const everyone = lenderAndFeeRecipient;

  let usdc: PublicKey;
  let meme: PublicKey;
  let configPda: PublicKey;

  const pda = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const le = (v: BN) => v.toArrayLike(Buffer, "le", 8);

  before(async function () {
    this.timeout(120_000);
    const env = anchor.AnchorProvider.env();
    connection = new Connection(env.connection.rpcEndpoint, "confirmed");
    provider = new anchor.AnchorProvider(connection, env.wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);
    program = new Program<Memebook>(idl as any, provider);
    payer = (provider.wallet as anchor.Wallet).payer;

    for (const kp of [lenderAndFeeRecipient, borrower]) {
      await fundSol(connection, kp.publicKey, 10);
    }

    usdc = await createMint(connection, payer, 6);
    meme = await createMint(connection, payer, 6);
    await createAtaAndMint(connection, payer, usdc, lenderAndFeeRecipient.publicKey, 10_000_000_000n);
    await createAtaAndMint(connection, payer, meme, lenderAndFeeRecipient.publicKey, 500_000_000_000n);
    await createAtaAndMint(connection, payer, usdc, borrower.publicKey, 10_000_000_000n);
    await createAtaAndMint(connection, payer, meme, borrower.publicKey, 500_000_000_000n);

    configPda = pda([Buffer.from("config")]);
    await program.methods
      .initializeConfig(
        payer.publicKey,
        lenderAndFeeRecipient.publicKey, // fee recipient == the lender below
        1000,
        500,
        10
      )
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  });

  async function openLoan(durationSeconds: number, who: Keypair = borrower) {
    const offerId = new BN(Date.now() + Math.floor(Math.random() * 1000));
    const offer = pda([Buffer.from("offer"), lenderAndFeeRecipient.publicKey.toBuffer(), le(offerId)]);

    await program.methods
      .createOffer(
        offerId,
        new BN(200_000_000),
        new BN(900_000_000),
        new BN(1),
        2000,
        durationSeconds,
        new BN((await nowTs(connection)) + 3600)
      )
      .accountsPartial({
        lender: lenderAndFeeRecipient.publicKey,
        config: configPda,
        offer,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: pda([Buffer.from("offer_vault"), offer.toBuffer()]),
        lenderPrincipalAccount: getAssociatedTokenAddressSync(
          usdc, lenderAndFeeRecipient.publicKey, true, TOKEN_PROGRAM_ID
        ),
        principalTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lenderAndFeeRecipient])
      .rpc();

    const loanId = new BN(Date.now() + 1 + Math.floor(Math.random() * 1000));
    const loan = pda([Buffer.from("loan"), who.publicKey.toBuffer(), le(loanId)]);

    await program.methods
      .acceptOffer(loanId, new BN(100_000_000))
      .accountsPartial({
        borrower: who.publicKey,
        config: configPda,
        offer,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        offerVault: pda([Buffer.from("offer_vault"), offer.toBuffer()]),
        loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()]),
        borrowerCollateralAccount: getAssociatedTokenAddressSync(meme, who.publicKey, true, TOKEN_PROGRAM_ID),
        borrowerPrincipalAccount: getAssociatedTokenAddressSync(usdc, who.publicKey, true, TOKEN_PROGRAM_ID),
        feeRecipient: lenderAndFeeRecipient.publicKey,
        feePrincipalAccount: getAssociatedTokenAddressSync(
          usdc, lenderAndFeeRecipient.publicKey, true, TOKEN_PROGRAM_ID
        ),
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();

    return loan;
  }

  it("opens a loan when the lender is also the fee recipient", async function () {
    this.timeout(120_000);
    const loan = await openLoan(3600);
    const acc: any = await (program.account as any).loan.fetch(loan);
    assert.equal(acc.principalAmount.toString(), "100000000");
  });

  it("lets the borrower repay it", async function () {
    this.timeout(120_000);
    const loan = await openLoan(3600);
    const acc: any = await (program.account as any).loan.fetch(loan);

    const ata = getAssociatedTokenAddressSync(
      usdc, lenderAndFeeRecipient.publicKey, true, TOKEN_PROGRAM_ID
    );
    const before = await tokenBalance(connection, ata);
    const memeBefore = await tokenBalance(
      connection, getAssociatedTokenAddressSync(meme, borrower.publicKey, true, TOKEN_PROGRAM_ID)
    );

    await program.methods
      .repay()
      .accountsPartial({
        borrower: borrower.publicKey,
        lender: lenderAndFeeRecipient.publicKey,
        feeRecipient: lenderAndFeeRecipient.publicKey,
        config: configPda,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()]),
        borrowerPrincipalAccount: getAssociatedTokenAddressSync(usdc, borrower.publicKey, true, TOKEN_PROGRAM_ID),
        borrowerCollateralAccount: getAssociatedTokenAddressSync(meme, borrower.publicKey, true, TOKEN_PROGRAM_ID),
        lenderPrincipalAccount: ata,
        feePrincipalAccount: ata, // the same account, deliberately
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    // Wearing both hats, this wallet receives principal + the whole interest:
    // its own share plus the protocol's cut, which is also its own.
    const expected =
      BigInt(acc.principalAmount.toString()) + BigInt(acc.interestAmount.toString());
    assert.equal((await tokenBalance(connection, ata)) - before, expected);

    // And the borrower's collateral came home.
    const memeAfter = await tokenBalance(
      connection, getAssociatedTokenAddressSync(meme, borrower.publicKey, true, TOKEN_PROGRAM_ID)
    );
    assert.equal(memeAfter - memeBefore, BigInt(acc.collateralAmount.toString()));
    assert.isNull(await connection.getAccountInfo(loan));
  });

  it("opens AND repays when borrower, lender and fee recipient are all one wallet",
    async function () {
    this.timeout(180_000);
    const loan = await openLoan(3600, everyone);
    const acc: any = await (program.account as any).loan.fetch(loan);

    const usdcAta = getAssociatedTokenAddressSync(usdc, everyone.publicKey, true, TOKEN_PROGRAM_ID);
    const memeAta = getAssociatedTokenAddressSync(meme, everyone.publicKey, true, TOKEN_PROGRAM_ID);
    const usdcBefore = await tokenBalance(connection, usdcAta);
    const memeBefore = await tokenBalance(connection, memeAta);

    await program.methods
      .repay()
      .accountsPartial({
        borrower: everyone.publicKey,
        lender: everyone.publicKey,
        feeRecipient: everyone.publicKey,
        config: configPda,
        loan,
        principalMint: usdc,
        collateralMint: meme,
        loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()]),
        borrowerPrincipalAccount: usdcAta,
        borrowerCollateralAccount: memeAta,
        lenderPrincipalAccount: usdcAta, // all three the same, deliberately
        feePrincipalAccount: usdcAta,
        principalTokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([everyone])
      .rpc();

    // Paying yourself nets to zero; the collateral is what actually moves back.
    assert.equal(await tokenBalance(connection, usdcAta), usdcBefore);
    assert.equal(
      (await tokenBalance(connection, memeAta)) - memeBefore,
      BigInt(acc.collateralAmount.toString())
    );
    assert.isNull(await connection.getAccountInfo(loan));
  });

  it("lets the lender claim a defaulted one", async function () {
    this.timeout(180_000);
    const loan = await openLoan(60);
    const acc: any = await (program.account as any).loan.fetch(loan);
    while ((await nowTs(connection)) <= acc.maturityTs.toNumber()) await sleep(2000);

    const memeAta = getAssociatedTokenAddressSync(
      meme, lenderAndFeeRecipient.publicKey, true, TOKEN_PROGRAM_ID
    );
    await program.methods
      .claimDefault()
      .accountsPartial({
        lender: lenderAndFeeRecipient.publicKey,
        borrower: borrower.publicKey,
        feeRecipient: lenderAndFeeRecipient.publicKey,
        config: configPda,
        loan,
        collateralMint: meme,
        loanCollateralVault: pda([Buffer.from("loan_vault"), loan.toBuffer()]),
        lenderCollateralAccount: memeAta,
        feeCollateralAccount: memeAta, // the same account, deliberately
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lenderAndFeeRecipient])
      .rpc();

    // Both the lender's share and the protocol's fee land in the one account.
    assert.equal(
      await tokenBalance(connection, memeAta),
      BigInt(acc.collateralAmount.toString())
    );
  });
});
