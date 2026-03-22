"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { firebaseAuthErrorMessageHe, getFirebaseErrorCode } from "@/lib/auth-errors-he";

/**
 * טיפול בקישור איפוס סיסמה כש-Firebase שולח לכאן (או אחרי הגדרת Action URL בתבנית המייל).
 * ברירת המחדל של Firebase: דף ב-*.firebaseapp.com – אם תגדיר בקונסולה Action URL לאתר שלך, הקישור יגיע לכאן.
 */
export default function AuthActionPage() {
  const router = useRouter();
  const [mode, setMode] = useState<string | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    let m = params.get("mode");
    let code = params.get("oobCode");
    if (typeof window !== "undefined" && window.location.hash) {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (!m) m = h.get("mode");
      if (!code) code = h.get("oobCode");
    }
    setMode(m);
    setOobCode(code);

    if (!isFirebaseConfigured()) {
      setError("Firebase לא מוגדר באתר (.env.local).");
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("שגיאת אתחול Firebase.");
      setLoading(false);
      return;
    }
    if (m !== "resetPassword" || !code) {
      setLoading(false);
      return;
    }
    verifyPasswordResetCode(auth, code)
      .then((em) => {
        setEmail(em);
        setVerified(true);
        setLoading(false);
      })
      .catch(() => {
        setError(
          "הקישור לא תקף או פג תוקף. זה קורה לעיתים כשמייל (ג׳ימייל/אאוטלוק) פותח תצוגה מקדימה של הקישור, או לחיצה פעמיים. בקש קישור חדש מדף «שכחתי סיסמה», ופתח את הקישור בחלון גלישה בסתר או העתקה ידנית לכתובת."
        );
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!oobCode) return;
    if (password.length < 6) {
      setError("סיסמה חייבת להיות לפחות 6 תווים (לפי Firebase).");
      return;
    }
    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות.");
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) return;
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      router.push("/login?reset=ok");
    } catch (err: unknown) {
      setError(firebaseAuthErrorMessageHe(getFirebaseErrorCode(err)));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100" dir="rtl">
        <p className="text-slate-600 font-bold">בודק קישור…</p>
      </main>
    );
  }

  if (verified && mode === "resetPassword" && oobCode && email) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-8">
          <h1 className="text-2xl font-black text-slate-800 mb-2">סיסמה חדשה</h1>
          <p className="text-slate-500 text-sm mb-6">חשבון: {email}</p>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">סיסמה חדשה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">אימות סיסמה</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-red-600 text-sm font-bold">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-60"
            >
              {submitting ? "שומר…" : "עדכן סיסמה"}
            </button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="text-blue-600 font-bold">
              חזרה להתחברות
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-8 text-center space-y-4">
        <h1 className="text-xl font-black text-slate-800">איפוס סיסמה</h1>
        <p className="text-slate-600 text-sm leading-relaxed">
          {error ||
            "לא התקבל קישור תקין בכתובת (חסר mode או oobCode). אם לחצת על הקישור במייל וקיבלת שגיאה באנגלית – בקש קישור חדש ופתח בגלישה בסתר."}
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <Link href="/forgot-password" className="text-blue-600 font-bold">
            שליחת קישור איפוס מחדש
          </Link>
          <Link href="/login" className="text-slate-600 font-bold">
            חזרה להתחברות
          </Link>
        </div>
      </div>
    </main>
  );
}
