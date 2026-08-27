import Link from "next/link";
import { CheckCircle2, Lock, Sparkles, Wallet } from "lucide-react";

const PREMIUM_PRICE = "24.90";

export default function LandingPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="text-white" style={{ background: "var(--hf-header)" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <Wallet className="w-5 h-5" /> HouseFin
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="hover:underline">
              כניסה
            </Link>
            <Link href="/register" className="bg-white text-indigo-700 font-bold px-4 py-2 rounded-xl">
              הרשמה
            </Link>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-24">
          <p className="text-indigo-100 text-sm font-medium mb-3">SaaS משפחתי מאובטח</p>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight max-w-2xl">
            תקציב הבית, במקום אחד — עם מנוי פרימיום אמיתי
          </h1>
          <p className="mt-4 text-indigo-100 max-w-xl text-lg">
            הכנסות, הוצאות, יעדים והלוואות. כל משפחה רואה רק את הנתונים שלה.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="bg-white text-indigo-700 font-bold px-6 py-3 rounded-xl">
              התחילו בחינם
            </Link>
            <Link href="/login" className="bg-white/10 border border-white/20 px-6 py-3 rounded-xl font-semibold">
              יש לי חשבון
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-14 grid md:grid-cols-3 gap-4">
        {[
          { title: "חשבון אישי", text: "התחברות באימייל. הנתונים נשמרים בענן עם הרשאות RLS." },
          { title: "מסלול חינמי", text: "תנועות, יעדים, תקציבים וקטגוריות — בלי כרטיס אשראי." },
          { title: "פרימיום ₪24.90", text: "חשבונות מרובים, הלוואות, שווי נטו ודוח חודשי." },
        ].map((item) => (
          <div key={item.title} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h2 className="font-bold mb-1">{item.title}</h2>
            <p className="text-sm text-slate-500">{item.text}</p>
          </div>
        ))}
      </main>

      <section className="max-w-lg mx-auto px-4 pb-20">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold">HouseFin פרימיום</h2>
          </div>
          <p className="text-3xl font-extrabold mb-4">
            ₪{PREMIUM_PRICE}
            <span className="text-sm font-normal text-slate-400"> / לחודש</span>
          </p>
          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            {[
              "ריבוי חשבונות ויתרות",
              "מעקב הלוואות וסילוקין",
              "שווי נטו + מגמה",
              "דוח חודשי להדפסה",
              "ביטול בכל עת דרך Stripe",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {line}
              </li>
            ))}
          </ul>
          <Link
            href="/register"
            className="block text-center bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500"
          >
            צרו חשבון והמשיכו לפרימיום
          </Link>
          <p className="text-[11px] text-slate-400 text-center mt-3 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" /> התשלום לא רץ אצלנו — רק אצל Stripe
          </p>
        </div>
      </section>
    </div>
  );
}
