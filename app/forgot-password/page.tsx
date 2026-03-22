"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth, getFirebaseProjectIdForUi, isFirebaseConfigured } from "@/lib/firebase";
import { firebaseAuthErrorMessageHe, getFirebaseErrorCode } from "@/lib/auth-errors-he";
import { normalizeLoginEmail } from "@/lib/normalize-email";
import { FirebaseConnectionHint } from "@/components/FirebaseConnectionHint";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");

    if (!email.trim()) {
      setError("נא להזין כתובת אימייל.");
      return;
    }

    if (!isFirebaseConfigured()) {
      setError("Firebase לא מוגדר. הוסף קובץ .env.local לפי .env.local.example");
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      setError("שגיאת אתחול Firebase.");
      return;
    }

    const emailNorm = normalizeLoginEmail(email);
    if (!emailNorm) {
      setError("נא להזין אימייל תקין.");
      return;
    }

    setSubmitting(true);
    try {
      const origin = window.location.origin;
      await sendPasswordResetEmail(auth, emailNorm, {
        // אחרי איפוס Firebase מפנה ל-login; אפשר גם /auth/action אם תגדיר תבנית מייל בקונסולה
        url: `${origin}/login`,
        handleCodeInApp: false,
      });
      const pid = getFirebaseProjectIdForUi();
      setMsg(
        `הבקשה נרשמה. אם האימייל רשום בפרויקט Firebase הזה (${pid}) – אמור להגיע מייל עם קישור. אם לא מגיע כלום: בדוק ספאם/דואר לא רצוי, וב־Firebase Console → Authentication → Users – האם האימייל מופיע שם? אם לא – צור משתמש ב«הרשמה» או בקונסולה (חשבון מפרויקט אחר לא עובר אוטומטית). פתח את הקישור מהמייל פעם אחת בלבד (תצוגה מקדימה לפעמים «שורפת» את הקישור).`
      );
    } catch (err: unknown) {
      const code = getFirebaseErrorCode(err);
      setError(firebaseAuthErrorMessageHe(code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-8">
        <h1 className="text-2xl font-black text-slate-800 text-center mb-2">שכחתי סיסמה</h1>
        <p className="text-slate-500 text-sm text-center mb-6">
          הזן את האימייל של החשבון ונשלח קישור לאיפוס.
        </p>

        <div className="mb-6">
          <FirebaseConnectionHint />
        </div>

        <form onSubmit={(e) => void handleReset(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="name@company.co.il"
              required
              autoComplete="email"
            />
          </div>
          {error && <p className="text-red-600 text-sm font-bold">{error}</p>}
          {msg && <p className="text-emerald-700 text-sm font-bold">{msg}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-md disabled:opacity-60"
          >
            {submitting ? "שולח…" : "שלח בקשת איפוס"}
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 text-right leading-relaxed space-y-2">
          <p className="font-bold">אם מופיעה באנגלית: «expired or already been used»</p>
          <ul className="list-disc list-inside space-y-1">
            <li>בקש איפוס שוב, ואז פתח את המייל בדפדפן אחר או גלישה בסתר.</li>
            <li>ב-Firebase Console → Authentication → Settings → Authorized domains – ודא שמופיע הדומיין שלך (כולל localhost לפיתוח).</li>
            <li>ב-Google Cloud → APIs → Credentials – אם הגבלת את מפתח ה-API, ודא ש-Firebase Auth לא חסום.</li>
          </ul>
        </div>

        <div className="mt-4 text-center text-sm">
          <Link href="/login" className="text-blue-600 font-bold hover:underline">
            חזרה להתחברות
          </Link>
        </div>
      </div>
    </main>
  );
}
