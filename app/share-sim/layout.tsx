import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הדמיה ללקוח | Yarhi Pro",
  description: "הדמיה תלת-ממד שנשלחה אליך מהקבלן",
  robots: { index: false, follow: false },
};

export default function ShareSimLayout({ children }: { children: React.ReactNode }) {
  return children;
}
