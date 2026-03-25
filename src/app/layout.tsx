import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { TRPCReactProvider } from "~/trpc/react";

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "Fantasy Finals",
  description: "NBA Fantasy Playoffs — one pick per game",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            style: { background: "#18181b", border: "1px solid #27272a", color: "#fafafa" },
          }}
        />
      </body>
    </html>
  );
}
