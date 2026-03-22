"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/40 text-emerald-300 text-sm font-bold">
          מיוחד לקבלני אלומיניום
        </div>
        <div className="mt-3 text-xs text-amber-300 font-bold">גרסת נחיתה מעודכנת: 399₪ + מע&quot;מ</div>
        <h1 className="mt-6 text-4xl md:text-6xl font-black leading-tight">
          Yarhi Pro
          <br />
          מערכת מלאה לחישוב, הדמיה וניהול פרויקטים
        </h1>
        <p className="mt-5 text-slate-300 max-w-3xl mx-auto text-lg">
          הדמיות 3D לפרגולות וגדרות, חישובי חומר וחיתוכים, דוחות ייצור וניהול פיננסי - הכל במערכת אחת.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto px-8 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-lg shadow-lg transition"
          >
            הרשמה למערכת
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-8 py-3 rounded-full border border-slate-500 hover:border-slate-300 hover:bg-slate-800/70 font-bold text-lg transition"
          >
            כניסה לתוכנה
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <h3 className="font-black text-lg mb-2">🎨 הדמיות 3D</h3>
            <p className="text-slate-300 text-sm">הצגה מקצועית ללקוח לפני סגירת עסקה.</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <h3 className="font-black text-lg mb-2">✂️ חישובים ודוחות</h3>
            <p className="text-slate-300 text-sm">מפרטי חיתוך, חומרים והוראות ייצור בלחיצת כפתור.</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <h3 className="font-black text-lg mb-2">💼 ניהול עסקי</h3>
            <p className="text-slate-300 text-sm">מעקב פרויקטים, תמחור, גבייה ודשבורד פיננסי.</p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-5 text-right">
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/5 p-6">
            <p className="inline-block px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-xs font-black mb-3">
              חבילה אחת - הכל כלול
            </p>
            <h2 className="text-2xl font-black text-amber-300">מנוי Yarhi Pro מלא</h2>
            <p className="text-slate-300 mt-2">חישובים, הדמיות, דוחות וניהול פיננסי במקום אחד.</p>
            <p className="mt-4 text-4xl font-black text-amber-300">399 ₪ + מע&quot;מ</p>
            <p className="text-slate-400 text-sm">מסלול חודשי גמיש</p>
            <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
              <p className="text-emerald-200 font-black">מסלול שנתי משתלם במיוחד</p>
              <p className="text-2xl font-black text-emerald-300 mt-1">3,990 ₪ + מע&quot;מ לשנה</p>
              <p className="text-sm text-slate-200 mt-1">משלמים על 10 חודשים ומקבלים 12 חודשים מלאים (2 חודשי מתנה).</p>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <Link href="/register" className="text-center py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-black transition">
                אני רוצה להצטרף למנוי המלא
              </Link>
              <Link href="/" className="text-center py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition">
                כניסה לתוכנה
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/5 p-6">
            <p className="inline-block px-3 py-1 rounded-full bg-emerald-500 text-emerald-50 text-xs font-black mb-3">
              הטבת שותפים
            </p>
            <h2 className="text-2xl font-black text-emerald-300">🚚 הזמנת קיט מירחי אלומיניום</h2>
            <p className="text-slate-300 mt-2">
              מזמינים <span className="font-black text-white">8 קיטים ומעלה</span> באורך
              <span className="font-black text-white"> 15 מטר ומעלה בחודש</span>?
            </p>
            <p className="mt-3 text-lg font-black text-emerald-200">
              מקבלים את תוכנת Yarhi Pro ללא עלות.
            </p>
            <ul className="mt-4 text-sm text-slate-300 space-y-1 list-disc pr-5">
              <li>הזמנה מהירה וישירה מול ירחי אלומיניום</li>
              <li>תמריץ חודשי ברור לקבלנים פעילים</li>
              <li>הטבה משתלמת במיוחד להיקפי עבודה</li>
            </ul>
            <a
              href="https://wa.me/?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%20%D7%90%D7%A0%D7%99%20%D7%A8%D7%95%D7%A6%D7%94%20%D7%94%D7%96%D7%9E%D7%A0%D7%94%20%D7%9E%D7%94%D7%99%D7%A8%D7%94%20%D7%A9%D7%9C%20%D7%A7%D7%99%D7%98%D7%99%D7%9D%20%D7%9E%D7%99%D7%A8%D7%97%D7%99%20%D7%90%D7%9C%D7%95%D7%9E%D7%99%D7%A0%D7%99%D7%95%D7%9D"
              className="mt-5 block text-center py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition"
            >
              ⚡ הזמנה מהירה לירחי אלומיניום
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

