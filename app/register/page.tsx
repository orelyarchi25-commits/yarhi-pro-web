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
const REGISTER_TIMEOUT_MS = 45_000;
const WHATSAPP_E164 = "972522288798";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual" | "trial_7d">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"bit" | "bank">("bit");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofErr, setProofErr] = useState("");
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

  const buildWhatsAppMessage = () => {
    const planLabel =
      selectedPlan === "monthly" ? "מסלול חודשי — 399 ₪ + מע\"מ"
      : selectedPlan === "annual" ? "מסלול שנתי — 3,990 ₪ + מע\"מ"
      : "מסלול ניסיון — 7 ימים חינם";
    const paymentLabel = paymentMethod === "bank" ? "העברה בנקאית" : "ביט (Bit)";
    const lines = [
      "הרשמה חדשה ל-Yarhi Pro",
      "",
      `מסלול: ${planLabel}`,
      `אמצעי תשלום: ${paymentLabel}`,
      "",
      "פרטי לקוח:",
      `• שם העסק: ${businessName.trim() || "—"}`,
      `• שם קבלן: ${contractorName.trim() || "—"}`,
      `• טלפון: ${phone.trim() || "—"}`,
      `• אימייל: ${email.trim() || "—"}`,
      `• צילום שצורף: ${proofFile?.name || "לא צורף"}`,
      "",
      "נא לאשר את ההרשמה.",
    ];
    return lines.join("\n");
  };

  const openWhatsAppWithDetails = () => {
    const url = `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

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
    if (selectedPlan !== "trial_7d" && !proofFile) {
      setError("במסלול בתשלום יש לצרף צילום אישור תשלום (ביט/העברה).");
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
        let notifySuffix = "";
        try {
          await setDoc(doc(db, "users", cred.user.uid), {
            businessName: businessName.trim(),
            contractorName: contractorName.trim(),
            phone: phone.trim(),
            email: emailNorm,
            registrationPlan: selectedPlan,
            paymentMethod,
            paymentProofFileName: proofFile?.name ?? null,
            termsAcceptedAt: serverTimestamp(),
            termsVersion: TERMS_VERSION,
            /** עד שמנהל יאשר ב-Firestore (accountApproved: true) — אין גישה לאפליקציה */
            accountApproved: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const idToken = await cred.user.getIdToken(true);
          try {
            const notifyRes = await fetch("/api/notify-new-registration", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken }),
            });
            const nj = (await notifyRes.json()) as {
              skipped?: boolean;
              missing?: string[];
              error?: string;
            };
            if (notifyRes.ok && nj.skipped && nj.missing?.length) {
              notifySuffix =
                " שימו לב: לא נשלח מייל התראה — חסרים משתני סביבה בשרת: " + nj.missing.join(", ") + ".";
            } else if (!notifyRes.ok) {
              notifySuffix =
                " שימו לב: מייל התראה למנהל לא נשלח (בדוק Resend, כתובת שולח מאומתת, ולוג Vercel).";
            }
          } catch (notifyErr) {
            console.error("[Yarhi Pro] הודעת מנהל אחרי הרשמה:", notifyErr);
            notifySuffix = " שימו לב: לא ניתן היה לוודא שליחת מייל התראה.";
          }
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
        setOkMsg(
          "ההרשמה נשמרה. החשבון ממתין לאישור מנהל — מעביר לדף הבית…" + notifySuffix
        );
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
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_55%,#000_100%)] px-4 py-10 text-slate-100"
      dir="rtl"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 text-center">
          <h1 className="text-3xl font-extrabold text-white md:text-4xl">הרשמה למערכת Yarhi Pro</h1>
          <p className="mt-2 text-base font-medium text-slate-300">
            חשבון קבלן מקצועי עם אישור מנהל ותנאי שימוש מחייבים.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setSelectedPlan("monthly")}
            className={
              "rounded-2xl border p-4 text-right shadow-lg shadow-black/20 transition-all " +
              (selectedPlan === "monthly"
                ? "border-amber-500/60 bg-amber-500/[0.14] ring-2 ring-amber-400/70"
                : "border-amber-500/35 bg-amber-500/[0.08] hover:border-amber-400/60")
            }
          >
            <p className="mb-1 text-xs font-semibold tracking-wide text-amber-200">מסלול חודשי</p>
            <p className="text-2xl font-extrabold text-white">399 ₪ + מע&quot;מ</p>
            <p className="mt-1 text-sm font-medium text-slate-300">ללא התחייבות שנתית.</p>
            {selectedPlan === "monthly" && (
              <p className="mt-3 text-sm font-semibold text-blue-300">נבחר ✓</p>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedPlan("annual")}
            className={
              "rounded-2xl border p-4 text-right shadow-lg shadow-black/20 transition-all " +
              (selectedPlan === "annual"
                ? "border-emerald-500/60 bg-emerald-500/[0.14] ring-2 ring-emerald-400/70"
                : "border-emerald-500/35 bg-emerald-500/[0.08] hover:border-emerald-400/60")
            }
          >
            <p className="mb-1 text-xs font-semibold tracking-wide text-emerald-200">מסלול שנתי משתלם</p>
            <p className="text-2xl font-extrabold text-white">3,990 ₪ + מע&quot;מ</p>
            <p className="mt-1 text-sm font-medium text-slate-300">משלמים על 10 חודשים ומקבלים 12 חודשים מלאים.</p>
            {selectedPlan === "annual" && (
              <p className="mt-3 text-sm font-semibold text-blue-300">נבחר ✓</p>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedPlan("trial_7d")}
            className={
              "rounded-2xl border p-4 text-right shadow-lg shadow-black/20 transition-all " +
              (selectedPlan === "trial_7d"
                ? "border-sky-500/60 bg-sky-500/[0.14] ring-2 ring-sky-400/70"
                : "border-sky-500/35 bg-sky-500/[0.08] hover:border-sky-400/60")
            }
          >
            <p className="mb-1 text-xs font-semibold tracking-wide text-sky-200">מסלול ניסיון</p>
            <p className="text-2xl font-extrabold text-white">7 ימים חינם</p>
            <p className="mt-1 text-sm font-medium text-slate-300">לאחר אישור מנהל, ללא חיוב.</p>
            {selectedPlan === "trial_7d" && (
              <p className="mt-3 text-sm font-semibold text-blue-300">נבחר ✓</p>
            )}
          </button>
        </div>

        <div className="mb-7 rounded-2xl border border-white/10 bg-[#0b0f1a]/95 p-5 shadow-2xl shadow-black/35">
          <p className="mb-2 text-sm font-bold text-slate-200">פרטי תשלום למסלולים בתשלום</p>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="font-semibold text-slate-200">Bit</p>
              <p className="mt-1 text-base font-bold text-white">052-2288798</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-slate-300">
              <p className="font-semibold text-slate-200">העברה בנקאית</p>
              <p className="mt-1">פרטי העברה יישלחו באופן פרטי לאחר יצירת קשר.</p>
            </div>
          </div>
        </div>

        <div className="mb-7 rounded-2xl border border-white/10 bg-[#0b0f1a]/95 p-5 shadow-2xl shadow-black/35">
          <p className="mb-2 text-sm font-bold text-slate-200">אמצעי תשלום לציון בהרשמה</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("bit")}
              className={
                "rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all " +
                (paymentMethod === "bit"
                  ? "border-blue-500/60 bg-blue-600 text-white"
                  : "border-white/10 bg-[#060910] text-slate-300 hover:border-blue-500/40")
              }
            >
              ביט (Bit)
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("bank")}
              className={
                "rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all " +
                (paymentMethod === "bank"
                  ? "border-blue-500/60 bg-blue-600 text-white"
                  : "border-white/10 bg-[#060910] text-slate-300 hover:border-blue-500/40")
              }
            >
              העברה בנקאית
            </button>
          </div>
          <label className="mb-2 block text-sm font-semibold text-slate-300">
            העלאת צילום אישור תשלום {selectedPlan === "trial_7d" ? "(אופציונלי לניסיון)" : "(חובה למסלול בתשלום)"}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setProofErr("");
              const f = e.target.files?.[0] ?? null;
              if (!f) {
                setProofFile(null);
                return;
              }
              if (f.size > 5 * 1024 * 1024) {
                setProofFile(null);
                setProofErr("קובץ גדול מדי. גודל מקסימלי: 5MB.");
                return;
              }
              setProofFile(f);
            }}
            className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3 text-sm text-slate-300 file:ml-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700"
          />
          {proofFile && <p className="mt-2 text-xs font-semibold text-emerald-400">נבחר קובץ: {proofFile.name}</p>}
          {proofErr && <p className="mt-2 text-xs font-semibold text-red-400">{proofErr}</p>}
          <p className="mt-2 text-xs text-slate-500">הצילום נשמר לצורכי אימות רישום (שם הקובץ בלבד), ולשליחה מלאה מומלץ גם בווטסאפ.</p>
          <button
            type="button"
            onClick={openWhatsAppWithDetails}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            שליחה ישירה לווטסאפ עם פרטי הלקוח
          </button>
          <p className="mt-2 text-xs text-slate-500">
            ווטסאפ לא מאפשר לצרף קובץ אוטומטית מהדפדפן — אחרי פתיחת הצ&apos;אט יש לצרף ידנית את התמונה מהגלריה.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-[#0b0f1a]/95 p-7 shadow-2xl shadow-black/40 md:p-8">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-300">שם העסק</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3.5 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="ירחי אלומיניום בע״מ"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-300">שם קבלן / איש קשר</label>
                <input
                  type="text"
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3.5 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="ישראל ישראלי"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-300">מספר טלפון</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3.5 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="05X-XXXXXXX"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-300">אימייל</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3.5 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="name@company.co.il"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-300">סיסמה</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3.5 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="לפחות 8 תווים"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-300">אימות סיסמה</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#060910] px-4 py-3.5 text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="הקלד שוב"
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-100">
              <p className="mb-2 font-bold text-amber-200">דרישות סיסמה:</p>
              <ul className="space-y-1.5 font-medium">
                <li>{passwordChecks.minLen ? "✅" : "⬜"} לפחות 8 תווים</li>
                <li>{passwordChecks.hasUpper ? "✅" : "⬜"} אות גדולה באנגלית</li>
                <li>{passwordChecks.hasLower ? "✅" : "⬜"} אות קטנה באנגלית</li>
                <li>{passwordChecks.hasDigit ? "✅" : "⬜"} לפחות ספרה אחת</li>
              </ul>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#060910]/80 p-4">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 rounded accent-blue-600"
              />
              <span className="text-sm leading-6 text-slate-300">
                קראתי, הבנתי ואני מאשר באופן בלתי חוזר את{" "}
                <Link href="/terms" target="_blank" className="font-bold text-blue-400 underline hover:no-underline">
                  תקנון השימוש המחייב
                </Link>
                , לרבות סעיפי הגבלת אחריות, ויתור טענות ושיפוי. ידוע לי כי המערכת הינה כלי עזר בלבד, והאחריות הבלעדית לאימות הנתונים,
                החישובים, המידות, החיתוכים, התמחור והביצוע בפועל חלה עליי בלבד.
              </span>
            </label>

            {error && <p className="text-sm font-bold text-red-400">{error}</p>}
            {okMsg && <p className="text-sm font-bold text-emerald-400">{okMsg}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-lg font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "נרשם…" : "הרשמה למערכת"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-400">
            כבר רשום?{" "}
            <Link href="/login" className="font-bold text-blue-400 hover:underline">
              מעבר להתחברות
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
