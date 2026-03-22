"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { TERMS_VERSION } from "@/lib/terms";
import { firebaseAuthErrorMessageHe, getFirebaseErrorCode } from "@/lib/auth-errors-he";
import { normalizeLoginEmail } from "@/lib/normalize-email";
import { FirebaseConnectionHint } from "@/components/FirebaseConnectionHint";

const REGISTER_TIMEOUT_MS = 45_000;

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordChecks = useMemo(
    () => ({
      minLen: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasDigit: /\d/.test(password),
    }),
    [password]
  );

  const isPasswordStrong = passwordChecks.minLen && passwordChecks.hasUpper && passwordChecks.hasLower && passwordChecks.hasDigit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOkMsg("");

    if (!agreedToTerms) {
      setError("לא ניתן להשלים הרשמה ללא אישור מפורש של התקנון.");
      return;
    }
    if (!isPasswordStrong) {
      setError("הסיסמה לא עומדת בדרישות האבטחה.");
      return;
    }
    if (password !== confirmPassword) {
      setError("אימות הסיסמה אינו תואם.");
      return;
    }

    if (!isFirebaseConfigured()) {
      setOkMsg("ההרשמה בוצעה בהצלחה (מצב לוקאלי ללא ענן). מעביר…");
      login({ acceptedTerms: true });
      setTimeout(() => router.push("/"), 500);
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
      const doRegister = async () => {
        const cred = await createUserWithEmailAndPassword(auth, emailNorm, password);
        try {
          await setDoc(doc(db, "users", cred.user.uid), {
            businessName: businessName.trim(),
            contractorName: contractorName.trim(),
            phone: phone.trim(),
            email: emailNorm,
            termsAcceptedAt: serverTimestamp(),
            termsVersion: TERMS_VERSION,
            /** עד שמנהל יאשר ב-Firestore (accountApproved: true) — אין גישה לאפליקציה */
            accountApproved: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const idToken = await cred.user.getIdToken();
          void fetch("/api/notify-new-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          }).catch((notifyErr) => {
            console.error("[Yarhi Pro] הודעת מנהל אחרי הרשמה:", notifyErr);
          });
        } catch (fsErr) {
          console.error("[Yarhi Pro] הרשמה – שמירת Firestore נכשלה:", fsErr);
          try {
            await deleteUser(cred.user);
          } catch (delErr) {
            console.error("[Yarhi Pro] מחיקת משתמש אחרי כשל Firestore:", delErr);
          }
          const fCode = getFirebaseErrorCode(fsErr);
          setError(
            fCode === "permission-denied"
              ? "הרשמת Auth הצליחה אבל Firestore חסם את השמירה (Rules). פרסם את firestore.rules בקונסולה, ואז נסה להירשם שוב. אם האימייל נחסם – השתמש ב«שכחתי סיסמה» אחרי שתיקנת את ה-Rules."
              : "לא נשמר פרופיל בענן. בדוק חיבור ו-Rules, ונסה שוב."
          );
          return;
        }
        setOkMsg("ההרשמה נשמרה. החשבון ממתין לאישור מנהל — מעביר לדף הבית…");
        router.push("/");
      };

      await Promise.race([
        doRegister(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("REGISTER_TIMEOUT")), REGISTER_TIMEOUT_MS);
        }),
      ]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "REGISTER_TIMEOUT") {
        console.error("[Yarhi Pro] הרשמה timeout");
        const u = auth.currentUser;
        if (u) {
          try {
            await deleteUser(u);
          } catch (delErr) {
            console.error("[Yarhi Pro] אחרי timeout – מחיקת משתמש:", delErr);
          }
        }
        setError(
          "ההרשמה ארכה יותר מדי. בדוק אינטרנט ו-Firestore Rules. אם נוצר חשבון חלקי – נסה «שכחתי סיסמה» אחרי שתיקנת את ההגדרות."
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
    <main className="min-h-screen bg-slate-100 py-10 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto rounded-3xl bg-white border border-slate-200 shadow-xl p-8 md:p-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-800">הרשמה למערכת Yarhi Pro</h1>
          <p className="text-slate-500 mt-2">
            חשבון קבלן מקצועי עם תנאי שימוש מחייבים ואבטחה מוגברת.
          </p>
        </div>

        <div className="mb-6">
          <FirebaseConnectionHint />
        </div>
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-black text-amber-900">מסלול חודשי</p>
            <p className="text-2xl font-black text-amber-700 mt-1">399 ₪ + מע&quot;מ</p>
            <p className="text-xs text-amber-800 mt-1">ללא התחייבות שנתית.</p>
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-xs font-black text-emerald-900">מסלול שנתי משתלם</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">3,990 ₪ + מע&quot;מ</p>
            <p className="text-xs text-emerald-800 mt-1">משלמים על 10 חודשים ומקבלים 12 חודשים מלאים.</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">שם העסק</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="ירחי אלומיניום בע״מ"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">שם קבלן / איש קשר</label>
              <input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="ישראל ישראלי"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">מספר טלפון</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="05X-XXXXXXX"
                required
              />
            </div>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="לפחות 8 תווים"
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">אימות סיסמה</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="הקלד שוב"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-black mb-2">דרישות סיסמה:</p>
            <ul className="space-y-1">
              <li>{passwordChecks.minLen ? "✅" : "⬜"} לפחות 8 תווים</li>
              <li>{passwordChecks.hasUpper ? "✅" : "⬜"} אות גדולה באנגלית</li>
              <li>{passwordChecks.hasLower ? "✅" : "⬜"} אות קטנה באנגלית</li>
              <li>{passwordChecks.hasDigit ? "✅" : "⬜"} לפחות ספרה אחת</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 p-4 bg-slate-50">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 rounded accent-blue-600"
            />
            <span className="text-sm text-slate-700 leading-6">
              קראתי, הבנתי ואני מאשר באופן בלתי חוזר את{" "}
              <Link href="/terms" target="_blank" className="text-blue-600 font-bold underline hover:no-underline">
                תקנון השימוש המחייב
              </Link>
              , לרבות סעיפי הגבלת אחריות, ויתור טענות ושיפוי. ידוע לי כי המערכת הינה כלי עזר בלבד, והאחריות הבלעדית לאימות הנתונים,
              החישובים, המידות, החיתוכים, התמחור והביצוע בפועל חלה עליי בלבד.
            </span>
          </label>

          {error && <p className="text-red-600 font-bold text-sm">{error}</p>}
          {okMsg && <p className="text-emerald-700 font-bold text-sm">{okMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 transition shadow-md disabled:opacity-60"
          >
            {submitting ? "נרשם…" : "הרשמה למערכת"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          כבר רשום?{" "}
          <Link href="/login" className="text-blue-600 font-bold hover:underline">
            מעבר להתחברות
          </Link>
        </div>
      </div>
    </main>
  );
}
