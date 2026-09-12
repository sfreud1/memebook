import type { Metadata } from "next";
import { Figtree, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const sans = Figtree({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const display = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "memebook — token'ını satmadan nakde çevir",
  description:
    "Vadeli, likidasyonsuz, oracle'sız eşler-arası kredi. Token'ını kilitle, nakit al; vade dolmadan öde, token'ın geri gelsin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${sans.variable} ${display.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-page flex-1 px-5 pb-20 pt-8">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
