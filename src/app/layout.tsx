import { GlobalLayoutWrapper } from "@/components/GlobalLayoutWrapper";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Platformă Operațională DGPT",
  description: "Administrare proiecte, cabinete, voluntari și fluxuri operaționale DGPT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro" data-theme="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-base-300 text-base-content selection:bg-primary selection:text-primary-content`}
      >
        <Providers>
          <GlobalLayoutWrapper>
            {children}
          </GlobalLayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
