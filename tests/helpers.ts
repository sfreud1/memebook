import { AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint as splCreateMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export async function fundSol(
  connection: Connection,
  pubkey: PublicKey,
  sol = 10
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

export async function createMint(
  connection: Connection,
  payer: Keypair,
  decimals: number
): Promise<PublicKey> {
  return splCreateMint(connection, payer, payer.publicKey, null, decimals, undefined, undefined, TOKEN_PROGRAM_ID);
}

export async function createAtaAndMint(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint
): Promise<PublicKey> {
  const ata = await createAssociatedTokenAccount(
    connection, payer, mint, owner, undefined, TOKEN_PROGRAM_ID
  );
  if (amount > 0n) {
    await mintTo(connection, payer, mint, ata, payer, amount, [], undefined, TOKEN_PROGRAM_ID);
  }
  return ata;
}

/** Raw token balance. Returns 0n when the account does not exist yet. */
export async function tokenBalance(
  connection: Connection,
  address: PublicKey
): Promise<bigint> {
  try {
    const acc = await getAccount(connection, address, "confirmed", TOKEN_PROGRAM_ID);
    return acc.amount;
  } catch {
    return 0n;
  }
}

export async function nowTs(connection: Connection): Promise<number> {
  const slot = await connection.getSlot();
  return (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Assert that a transaction fails, and that the error mentions `needle`. */
export async function expectFailure(p: Promise<unknown>, needle: string) {
  try {
    await p;
  } catch (e: any) {
    const msg =
      JSON.stringify(e?.logs ?? "") +
      String(e?.message ?? e) +
      String(e?.error?.errorCode?.code ?? "");
    if (!msg.includes(needle)) {
      throw new Error(`expected failure containing "${needle}", got: ${msg}`);
    }
    return;
  }
  throw new Error(`expected failure containing "${needle}", but it succeeded`);
}
