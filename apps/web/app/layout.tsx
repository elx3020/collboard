import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { WebSocketProvider } from "@/lib/websocket-provider";
import { Providers } from "@/lib/providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Collboard",
  description: "Real-time collaborative Kanban board",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>
          <Providers>
            <WebSocketProvider>
              {children}
            </WebSocketProvider>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  );
}
