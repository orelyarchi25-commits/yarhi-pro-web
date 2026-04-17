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
  const [showPassword, setShowPassword] = useState(false);
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
              // נדרש ליצירת מסמך חדש לפי Firestore Rules.
              accountApproved: false,
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
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_55%,#000_100%)] p-4 text-slate-100"
      dir="rtl"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <div className="w-full rounded-[2rem] border border-white/10 bg-[#0b0f1a]/95 p-8 shadow-2xl shadow-black/40">
          <h1 className="mb-2 text-center text-2xl font-extrabold text-white">כניסה למערכת</h1>
          <p className="mb-6 text-center text-sm font-medium text-slate-400">Yarhi Pro – מערכת מקצועית לקבלני אלומיניום</p>

          {passwordResetOk && (
            <div className="mb-4 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.1] px-4 py-3 text-center text-sm font-bold text-emerald-300">
              הסיסמה עודכנה בהצלחה. התחבר עם האימייל והסיסמה החדשה.
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-300">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="name@company.co.il"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-300">סיסמה</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3 pl-12 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="סיסמה"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                  title={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Link href="/forgot-password" className="font-bold text-blue-400 hover:underline">
                שכחתי סיסמה
              </Link>
              <Link href="/register" className="font-semibold text-slate-300 hover:text-white">
                אין לך חשבון? הרשמה
              </Link>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#060910]/80 p-3.5">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 rounded accent-blue-600"
              />
              <span className="text-sm leading-6 text-slate-300">
                קראתי והסכמתי ל
                <Link href="/terms" className="font-bold text-blue-400 underline hover:no-underline" target="_blank">
                  תקנון השימוש באתר
                </Link>
                . האתר מוצע ככלי עזר בלבד ואין לראות בו ייעוץ או אחריות מצד המפתחים.
              </span>
            </label>
            {error && <p className="text-sm font-bold text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "מתחבר…" : "כניסה"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs font-medium text-slate-500">בהתחברותך אתה מאשר את תנאי השימוש המחייבים.</p>
        </div>
      </div>
    </main>
  );
}
