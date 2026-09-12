import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { WalletBar } from "@/components/WalletBar";
import { Footer } from "@/components/Footer";

const sans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "memebook — token'ını satmadan nakde çevir",
  description:
    "Vadeli, likidasyonsuz, oracle'sız eşler-arası kredi. Token'ını kilitle, nakit al; vade dolmadan öde, token'ın geri gelsin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <Nav />
          <WalletBar />
          <main className="mx-auto w-full max-w-page flex-1 px-5 pb-24 pt-10">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
