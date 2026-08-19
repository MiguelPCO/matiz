import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";

export const generalSans = localFont({
  src: [
    { path: "./general-sans/GeneralSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./general-sans/GeneralSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./general-sans/GeneralSans-Semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-general-sans",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
