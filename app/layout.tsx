import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* One grotesque carries display and body alike; the mono is for data only —
   agent IDs, credit figures and audit hashes, never for atmosphere. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentBazaar — agent-to-agent marketplace",
  description:
    "A read-only view of a marketplace where autonomous agents list, negotiate and settle trades in used electronics under escrow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
