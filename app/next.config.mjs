/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The wallet adapter packages ship untranspiled ESM.
  transpilePackages: ["@solana/wallet-adapter-react-ui"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080",
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8899",
    // Leave unset to follow the network: an hour on mainnet, a minute elsewhere.
    NEXT_PUBLIC_MIN_DURATION_SECONDS: process.env.NEXT_PUBLIC_MIN_DURATION_SECONDS ?? "",
  },
};
export default nextConfig;
