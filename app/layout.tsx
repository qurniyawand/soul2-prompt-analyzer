import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soul 2 Prompt Analyzer",
  description: "Analisa foto jadi prompt siap pakai untuk Higgsfield Soul 2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-paper text-ink min-h-screen">{children}</body>
    </html>
  );
}
