import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "foco. — timer de estudos",
  description:
    "foco. é um timer Pomodoro minimalista com cronômetro, anotações, lembretes, progresso e integração com o Google Calendar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes altera a classe do <html> antes da hidratação (anti-FOUC)
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
