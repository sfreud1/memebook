import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { WalletBar } from "@/components/WalletBar";

export const metadata: Metadata = {
  title: "memebook",
  description:
    "Token'ını satmadan nakde çevir. Vadeli borçlanma, likidasyon yok.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <Providers>
          <Nav />
          <WalletBar />
          <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
