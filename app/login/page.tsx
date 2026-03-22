"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { TERMS_VERSION } from "@/lib/terms";
import { firebaseAuthErrorMessageHe, getFirebaseErrorCode } from "@/lib/auth-errors-he";
import { normalizeLoginEmail } from "@/lib/normalize-email";

/** מונע כפתור "מתחבר…" ללא סוף אם הרשת/Firestore תקועים */
const LOGIN_TIMEOUT_MS = 45_000;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordResetOk, setPasswordResetOk] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("reset") === "ok") {
      setPasswordResetOk(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!agreedToTerms) {
      setError("יש לאשר קריאה והסכמה לתקנון השימוש.");
      return;
    }

    if (!isFirebaseConfigured()) {
      login({ acceptedTerms: true });
      router.push("/");
      return;
    }

    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) {
      setError("הגדרות Firebase חסרות. בדוק קובץ .env.local");
      return;
    }

    const emailNorm = normalizeLoginEmail(email);
    if (!emailNorm) {
      setError("נא להזין אימייל תקין.");
      return;
    }

    setSubmitting(true);
    try {
      const doLogin = async () => {
        const cred = await signInWithEmailAndPassword(auth, emailNorm, password);
        // חובה לשמור terms ב-Firestore – אחרת דף הבית חושב שאין אישור תקנון (נראה כמו "לא מתחבר")
        try {
          await setDoc(
            doc(db, "users", cred.user.uid),
            {
              email: emailNorm,
              termsAcceptedAt: serverTimestamp(),
              termsVersion: TERMS_VERSION,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          console.error("[Yarhi Pro] login – Firestore:", fsErr);
          const fCode = getFirebaseErrorCode(fsErr);
          try {
            await signOut(auth);
          } catch {
            /* ignore */
          }
          setError(
            fCode === "permission-denied"
              ? "ההתחברות ל-Firebase הצליחה, אבל Firestore חסם שמירה (בדרך כלל Rules לא פורסמו). פתח ב-Firebase Console → Firestore → Rules, העתק מקובץ firestore.rules בפרויקט ולחץ Publish, ואז נסה שוב."
              : "ההתחברות הצליחה אבל שמירת הנתונים בענן נכשלה. בדוק חיבור, Rules, ונסה שוב."
          );
          return;
        }
        router.push("/");
      };

      await Promise.race([
        doLogin(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("LOGIN_TIMEOUT")), LOGIN_TIMEOUT_MS);
        }),
      ]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "LOGIN_TIMEOUT") {
        console.error("[Yarhi Pro] login timeout – רשת או Firestore לא הגיבו בזמן");
        try {
          await signOut(auth);
        } catch {
          /* ignore */
        }
        setError(
          "ההתחברות ארכה יותר מדי ונעצרה. בדוק אינטרנט, ש-Firestore Rules פורסמו, ושאין חסימת רשת. אם יש קובץ .env.local – וודא שהוא תואם לפרויקט ב-Firebase Console."
        );
      } else {
        const code = getFirebaseErrorCode(err);
        setError(firebaseAuthErrorMessageHe(code));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-100" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-8">
        <h1 className="text-2xl font-black text-slate-800 mb-2 text-center">כניסה למערכת</h1>
        <p className="text-slate-500 text-sm text-center mb-6">Yarhi Pro – מערכת מקצועית לקבלני אלומיניום</p>

        {passwordResetOk && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 text-center">
            הסיסמה עודכנה בהצלחה. התחבר עם האימייל והסיסמה החדשה.
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="name@company.co.il"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="סיסמה"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <Link href="/forgot-password" className="text-blue-600 font-bold hover:underline">
              שכחתי סיסמה
            </Link>
            <Link href="/register" className="text-slate-700 hover:text-slate-900 font-semibold">
              אין לך חשבון? הרשמה
            </Link>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 rounded accent-blue-600"
            />
            <span className="text-sm text-slate-700">
              קראתי והסכמתי ל
              <Link href="/terms" className="text-blue-600 font-bold underline hover:no-underline" target="_blank">
                תקנון השימוש באתר
              </Link>
              . האתר מוצע ככלי עזר בלבד ואין לראות בו ייעוץ או אחריות מצד המפתחים.
            </span>
          </label>
          {error && <p className="text-red-600 text-sm font-bold">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-md disabled:opacity-60"
          >
            {submitting ? "מתחבר…" : "כניסה"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">בהתחברותך אתה מאשר את תנאי השימוש המחייבים.</p>
      </div>
    </main>
  );
}
