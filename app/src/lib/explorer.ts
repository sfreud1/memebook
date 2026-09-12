import { NETWORK } from "./network";

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "";

function cluster(): string {
  if (NETWORK === "mainnet") return "";
  if (NETWORK === "localnet") return `?cluster=custom&customUrl=${encodeURIComponent(RPC)}`;
  return `?cluster=${NETWORK}`;
}

export const txUrl = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}${cluster()}`;

export const addressUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}${cluster()}`;
