import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "HouseFin — ניהול תקציב משפחתי",
  description: "מעקב הכנסות, הוצאות, יעדים והלוואות. פרימיום מאובטח עם מנוי חודשי.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} antialiased bg-slate-50 text-slate-800`}>{children}</body>
    </html>
  );
}
