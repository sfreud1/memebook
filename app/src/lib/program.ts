import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl.json";

export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);

export const getProgram = (provider: AnchorProvider) =>
  new Program(idl as Idl, provider);

const u64 = (v: bigint | number) => new BN(v.toString());
const leU64 = (v: bigint | number) => u64(v).toArrayLike(Buffer, "le", 8);

export const configPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

export const offerPda = (lender: PublicKey, offerId: bigint) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), lender.toBuffer(), leU64(offerId)],
    PROGRAM_ID
  )[0];

export const offerVaultPda = (offer: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("offer_vault"), offer.toBuffer()],
    PROGRAM_ID
  )[0];

export const loanPda = (borrower: PublicKey, loanId: bigint) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("loan"), borrower.toBuffer(), leU64(loanId)],
    PROGRAM_ID
  )[0];

export const loanVaultPda = (loan: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("loan_vault"), loan.toBuffer()],
    PROGRAM_ID
  )[0];

/** A mint's owning program tells us which token program to route CPIs through. */
export async function tokenProgramFor(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`mint not found: ${mint.toBase58()}`);
  return info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export const ata = (mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);

/** Random enough that two tabs will not collide on the same PDA. */
export const randomId = (): bigint =>
  (BigInt(Date.now()) << 20n) | BigInt(Math.floor(Math.random() * 1_048_576));

export async function fetchConfig(program: Program) {
  return (program.account as any).config.fetch(configPda());
}

// --------------------------------------------------------------------------

export async function createOffer(
  program: Program,
  lender: PublicKey,
  args: {
    principalMint: PublicKey;
    collateralMint: PublicKey;
    principalTotal: bigint;
    collateralTotal: bigint;
    minDraw: bigint;
    aprBps: number;
    durationSeconds: number;
    expiryTs: number;
  }
) {
  const connection = program.provider.connection;
  const offerId = randomId();
  const offer = offerPda(lender, offerId);
  const principalTokenProgram = await tokenProgramFor(connection, args.principalMint);

  return program.methods
    .createOffer(
      u64(offerId),
      u64(args.principalTotal),
      u64(args.collateralTotal),
      u64(args.minDraw),
      args.aprBps,
      args.durationSeconds,
      new BN(args.expiryTs)
    )
    .accountsPartial({
      lender,
      config: configPda(),
      offer,
      principalMint: args.principalMint,
      collateralMint: args.collateralMint,
      offerVault: offerVaultPda(offer),
      lenderPrincipalAccount: ata(args.principalMint, lender, principalTokenProgram),
      principalTokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function acceptOffer(
  program: Program,
  borrower: PublicKey,
  offer: {
    pubkey: string;
    principal_mint: string;
    collateral_mint: string;
  },
  drawAmount: bigint
) {
  const connection = program.provider.connection;
  const cfg = await fetchConfig(program);
  const principalMint = new PublicKey(offer.principal_mint);
  const collateralMint = new PublicKey(offer.collateral_mint);
  const offerKey = new PublicKey(offer.pubkey);

  const principalTokenProgram = await tokenProgramFor(connection, principalMint);
  const collateralTokenProgram = await tokenProgramFor(connection, collateralMint);

  const loanId = randomId();
  const loan = loanPda(borrower, loanId);

  return program.methods
    .acceptOffer(u64(loanId), u64(drawAmount))
    .accountsPartial({
      borrower,
      config: configPda(),
      offer: offerKey,
      loan,
      principalMint,
      collateralMint,
      offerVault: offerVaultPda(offerKey),
      loanCollateralVault: loanVaultPda(loan),
      borrowerCollateralAccount: ata(collateralMint, borrower, collateralTokenProgram),
      borrowerPrincipalAccount: ata(principalMint, borrower, principalTokenProgram),
      feeRecipient: cfg.feeRecipient,
      feePrincipalAccount: ata(principalMint, cfg.feeRecipient, principalTokenProgram),
      principalTokenProgram,
      collateralTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function repayLoan(
  program: Program,
  borrower: PublicKey,
  loan: {
    pubkey: string;
    lender: string;
    principal_mint: string;
    collateral_mint: string;
  }
) {
  const connection = program.provider.connection;
  const cfg = await fetchConfig(program);
  const principalMint = new PublicKey(loan.principal_mint);
  const collateralMint = new PublicKey(loan.collateral_mint);
  const lender = new PublicKey(loan.lender);
  const loanKey = new PublicKey(loan.pubkey);

  const principalTokenProgram = await tokenProgramFor(connection, principalMint);
  const collateralTokenProgram = await tokenProgramFor(connection, collateralMint);

  return program.methods
    .repay()
    .accountsPartial({
      borrower,
      lender,
      feeRecipient: cfg.feeRecipient,
      config: configPda(),
      loan: loanKey,
      principalMint,
      collateralMint,
      loanCollateralVault: loanVaultPda(loanKey),
      borrowerPrincipalAccount: ata(principalMint, borrower, principalTokenProgram),
      borrowerCollateralAccount: ata(collateralMint, borrower, collateralTokenProgram),
      lenderPrincipalAccount: ata(principalMint, lender, principalTokenProgram),
      feePrincipalAccount: ata(principalMint, cfg.feeRecipient, principalTokenProgram),
      principalTokenProgram,
      collateralTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function claimDefault(
  program: Program,
  lender: PublicKey,
  loan: { pubkey: string; borrower: string; collateral_mint: string }
) {
  const connection = program.provider.connection;
  const cfg = await fetchConfig(program);
  const collateralMint = new PublicKey(loan.collateral_mint);
  const borrower = new PublicKey(loan.borrower);
  const loanKey = new PublicKey(loan.pubkey);
  const collateralTokenProgram = await tokenProgramFor(connection, collateralMint);

  return program.methods
    .claimDefault()
    .accountsPartial({
      lender,
      borrower,
      feeRecipient: cfg.feeRecipient,
      config: configPda(),
      loan: loanKey,
      collateralMint,
      loanCollateralVault: loanVaultPda(loanKey),
      lenderCollateralAccount: ata(collateralMint, lender, collateralTokenProgram),
      feeCollateralAccount: ata(collateralMint, cfg.feeRecipient, collateralTokenProgram),
      collateralTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function cancelOffer(
  program: Program,
  lender: PublicKey,
  offer: { pubkey: string; principal_mint: string }
) {
  const connection = program.provider.connection;
  const principalMint = new PublicKey(offer.principal_mint);
  const offerKey = new PublicKey(offer.pubkey);
  const principalTokenProgram = await tokenProgramFor(connection, principalMint);

  return program.methods
    .cancelOffer()
    .accountsPartial({
      lender,
      offer: offerKey,
      principalMint,
      offerVault: offerVaultPda(offerKey),
      lenderPrincipalAccount: ata(principalMint, lender, principalTokenProgram),
      principalTokenProgram,
    })
    .rpc();
}
