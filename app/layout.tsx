import type { Metadata, Viewport } from "next";
import { GameProvider } from "../hooks/useGame";
import { generalSans, geistMono } from "./fonts";
import "./globals.css";

const TITLE = "MATIZ — Lee el color a ciegas";
const DESCRIPTION =
  "Juego de percepción cromática. Recibes una pista y encuentras su color exacto en una carta de tonalidades.";

export const metadata: Metadata = {
  // Placeholder — Sprint 5 compra el dominio real y lo sustituye aquí.
  metadataBase: new URL("https://matiz.example"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: "MATIZ",
    description: "Lee el color a ciegas.",
    type: "website",
    locale: "es_ES",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#14161A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${generalSans.variable} ${geistMono.variable} antialiased`}>
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
