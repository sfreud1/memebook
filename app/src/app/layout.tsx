import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "memebook",
  description: "Fixed-term lending against long-tail Solana tokens. No oracles, no liquidations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
