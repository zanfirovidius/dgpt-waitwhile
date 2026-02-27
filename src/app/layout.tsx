import { GlobalLayoutWrapper } from "@/components/GlobalLayoutWrapper";
import { auth0 } from "@/lib/auth0";
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
  title: "Waitwhile User Generator | DGPT",
  description: "Bulk create users in Waitwhile from Excel or manual input.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth0.getSession();

  return (
    <html lang="en" data-theme="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-base-300 text-base-content selection:bg-primary selection:text-primary-content`}
      >
        <Providers>
          <GlobalLayoutWrapper sessionUser={session?.user}>
            {children}
          </GlobalLayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
