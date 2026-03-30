import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

// מושכים את הפונט Heebo מגוגל, שמוגדר מראש לתמוך בעברית מושלמת
const heebo = Heebo({ subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "Yarhi Pro | ירחי פרו",
  description: "מערכת הניהול, החישוב וההדמיה לקבלני אלומיניום",
};

/** חובה למובייל: בלי זה Safari מדמה ~980px רוחב ואז נטענת פריסת דסקטופ (סיידבר + שני עמודות) */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
