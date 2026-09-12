/**
 * Which cluster the app is pointed at, derived from the RPC URL so the two can
 * never disagree. Everything network-specific — token registry, price source,
 * the minimum term — keys off this.
 */
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "";

export type Network = "mainnet" | "devnet" | "testnet" | "localnet";

export const NETWORK: Network = /devnet/i.test(RPC)
  ? "devnet"
  : /testnet/i.test(RPC)
    ? "testnet"
    : /127\.0\.0\.1|localhost/.test(RPC)
      ? "localnet"
      : "mainnet";

export const IS_MAINNET = NETWORK === "mainnet";

export const NETWORK_LABEL: Record<Network, string> = {
  mainnet: "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
  localnet: "Localnet",
};

/**
 * The program's floor on a loan's term. The mainnet build enforces an hour;
 * test-cluster builds (`--features short-terms`) a minute. The form mirrors it
 * so a lender is refused here rather than by a failed transaction.
 */
const envMin = Number(process.env.NEXT_PUBLIC_MIN_DURATION_SECONDS);
export const MIN_DURATION_SECONDS =
  Number.isFinite(envMin) && envMin > 0 ? envMin : IS_MAINNET ? 3_600 : 60;
