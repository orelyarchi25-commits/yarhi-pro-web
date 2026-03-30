/**
 * טיוטה ל־React/Next — לא מיובא מהאפליקציה.
 *
 * תצוגה מקדימה בלי להריץ כלום: פתח בדפדפן את הקובץ
 * `YarhiProPremiumRegisterFlow.preview.html` (אותה תיקיית standalone).
 * בזמן הטמעה באתר: העתק ל־`components/` + `lucide-react` + אופציונלית `next/link` לתקנון.
 */

"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  FileImage,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  User,
} from "lucide-react";

const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp,image/heic,.heic";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function whatsappE164(): string {
  const d = digitsOnly(process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? "");
  return d.length >= 10 ? d : "972522288798";
}

function bitDisplayPhone(): string {
  return (
    process.env.NEXT_PUBLIC_BIT_DISPLAY_PHONE?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ||
    "050-1234567"
  );
}

type PlanId = "monthly" | "annual";

const PLAN_COPY: Record<
  PlanId,
  { title: string; price: string; blurb: string; accent: "amber" | "emerald" }
> = {
  monthly: {
    title: "מסלול חודשי",
    price: "399 ₪ + מע״מ",
    blurb: "ללא התחייבות שנתית.",
    accent: "amber",
  },
  annual: {
    title: "מסלול שנתי משתלם",
    price: "3,990 ₪ + מע״מ",
    blurb: "משלמים על 10 חודשים ומקבלים 12 חודשים מלאים.",
    accent: "emerald",
  },
};

type BankConfig = {
  bankName: string;
  branch: string;
  account: string;
  beneficiary: string;
};

function bankConfig(): BankConfig {
  return {
    bankName: process.env.NEXT_PUBLIC_BANK_NAME?.trim() || "הפועלים (12)",
    branch:
      process.env.NEXT_PUBLIC_BANK_BRANCH?.trim() ||
      "604 קריית שלום ת״א",
    account: process.env.NEXT_PUBLIC_BANK_ACCOUNT?.trim() || "140924",
    beneficiary:
      process.env.NEXT_PUBLIC_BANK_BENEFICIARY?.trim() || "ירחי אוראל",
  };
}

function buildWhatsAppText(opts: {
  plan: PlanId;
  paymentLabel: string;
  businessName: string;
  contractorName: string;
  phone: string;
  email: string;
}): string {
  const planLine =
    opts.plan === "monthly"
      ? "מסלול חודשי — 399 ₪ + מע״מ"
      : "מסלול שנתי — 3,990 ₪ + מע״מ";
  return [
    "הרשמה ל־Yarhi Pro — בקשה לפתיחת חשבון אחרי תשלום.",
    "",
    planLine,
    `אמצעי תשלום: ${opts.paymentLabel}`,
    "",
    "פרטים:",
    `• שם העסק: ${opts.businessName || "—"}`,
    `• שם קבלן / איש קשר: ${opts.contractorName || "—"}`,
    `• טלפון: ${opts.phone || "—"}`,
    `• אימייל: ${opts.email || "—"}`,
    "",
    "(הסיסמה לא נשלחת בווטסאפ מטעמי אבטחה — יוגדר בהמשך במערכת.)",
    "",
    "מצורף צילום מסך של אישור התשלום.",
  ].join("\n");
}

export default function YarhiProPremiumRegisterFlow() {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"bit" | "bank">("bit");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [shareHint, setShareHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadId = useId();

  const [formData, setFormData] = useState({
    businessName: "",
    contractorName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formError, setFormError] = useState("");

  const passwordChecks = useMemo(
    () => ({
      minLen: formData.password.length >= 8,
      hasUpper: /[A-Z]/.test(formData.password),
      hasLower: /[a-z]/.test(formData.password),
      hasDigit: /\d/.test(formData.password),
    }),
    [formData.password]
  );

  const isPasswordStrong =
    passwordChecks.minLen &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasDigit;

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const validateStep2 = (): boolean => {
    setFormError("");
    if (!formData.businessName.trim() || !formData.contractorName.trim()) {
      setFormError("נא למלא שם עסק ושם קבלן.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setFormError("נא להזין אימייל תקין.");
      return false;
    }
    if (!agreedToTerms) {
      setFormError("יש לאשר את תקנון השימוש כדי להמשיך.");
      return false;
    }
    if (!isPasswordStrong) {
      setFormError("הסיסמה לא עומדת בדרישות האבטחה.");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setFormError("אימות הסיסמה אינו תואם.");
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setFileError("נא להעלות קובץ תמונה בלבד.");
      e.target.value = "";
      return;
    }
    if (f.size > PROOF_MAX_BYTES) {
      setFileError("הקובץ גדול מדי (מקס׳ 5MB).");
      e.target.value = "";
      return;
    }
    setProofFile(f);
  };

  const tryWhatsAppWithProof = async () => {
    setShareHint(null);
    const paymentLabel =
      paymentMethod === "bit" ? "ביט (Bit)" : "העברה בנקאית";
    const message = buildWhatsAppText({
      plan,
      paymentLabel,
      businessName: formData.businessName.trim(),
      contractorName: formData.contractorName.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
    });
    const wa = `https://wa.me/${whatsappE164()}?text=${encodeURIComponent(message)}`;

    if (
      proofFile &&
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function"
    ) {
      try {
        const payload: ShareData = { text: message, files: [proofFile] };
        if (navigator.canShare(payload)) {
          await navigator.share(payload);
          setStep(4);
          setShareHint("אם נפתחה לך רשת השיתוף — בחר בווטסאפ ושלח לירחי.");
          return;
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") return;
      }
    }

    window.open(wa, "_blank", "noopener,noreferrer");
    setStep(4);
    setShareHint(
      "נפתח ווטסאפ עם טקסט מוכן. צרף ידנית את צילום ההעברה מהגלריה (במחשב זה בדרך כך הנורמה)."
    );
  };

  const bank = bankConfig();

  return (
    <div
      className="min-h-screen bg-[#060910] text-slate-300 font-sans p-6 md:p-12 flex flex-col items-center justify-center"
      dir="rtl"
    >
      <div className="mb-10 text-center max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black italic text-white text-2xl shadow-lg shadow-blue-600/30">
            Y
          </div>
          <h1 className="text-3xl font-black italic text-white tracking-tighter">
            YARHI <span className="text-blue-500">PRO</span>
          </h1>
        </div>
        <h2 className="text-xl md:text-2xl font-black text-white mb-2">
          הרשמה למערכת Yarhi Pro
        </h2>
        <p className="text-slate-400 font-bold text-sm md:text-base leading-relaxed">
          חשבון קבלן מקצועי עם תנאי שימוש מחייבים ואבטחה מוגברת.
        </p>
      </div>

      {step < 4 && (
        <div
          className="flex items-center justify-center gap-2 sm:gap-4 mb-10 w-full max-w-xl px-2"
          role="list"
          aria-label="התקדמות בשלבים"
        >
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                role="listitem"
                className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center font-black text-sm transition-all ${
                  step >= s
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "bg-[#0b0f1a] border border-white/10 text-slate-500"
                }`}
              >
                {step > s ? <Check size={18} aria-hidden /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-1 min-w-[16px] rounded-full transition-all ${
                    step > s
                      ? "bg-blue-600"
                      : "bg-[#0b0f1a] border border-white/5"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="w-full max-w-2xl space-y-6">
          <p className="text-center text-slate-500 text-sm font-bold">
            בחרו מסלול — ניתן לשנות לפני התשלום
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["monthly", "annual"] as PlanId[]).map((pid) => {
              const p = PLAN_COPY[pid];
              const selected = plan === pid;
              const ring =
                p.accent === "amber"
                  ? selected
                    ? "ring-2 ring-amber-400/70 border-amber-500/40"
                    : "border-amber-500/20 hover:border-amber-500/35"
                  : selected
                    ? "ring-2 ring-emerald-400/70 border-emerald-500/40"
                    : "border-emerald-500/20 hover:border-emerald-500/35";
              const bg =
                p.accent === "amber"
                  ? "bg-amber-500/[0.07]"
                  : "bg-emerald-500/[0.07]";
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setPlan(pid)}
                  className={`rounded-[1.5rem] border p-6 text-right transition-all ${bg} ${ring} backdrop-blur-sm`}
                >
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400 mb-1">
                    {p.title}
                  </p>
                  <p className="text-3xl font-black text-white italic tracking-tight">
                    {p.price}
                  </p>
                  <p className="text-sm text-slate-400 mt-2 font-bold leading-snug">
                    {p.blurb}
                  </p>
                  {selected && (
                    <p className="mt-3 text-xs font-black text-blue-400 flex items-center gap-1">
                      <Check size={14} /> נבחר
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full max-w-md mx-auto block bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black italic flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all"
          >
            המשך לפרטים <ArrowRight size={18} className="rotate-180" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-[#0b0f1a] border border-white/10 p-6 md:p-8 rounded-[2rem] w-full max-w-2xl shadow-2xl">
          <h3 className="text-2xl font-black italic text-white mb-6 text-center">
            פרטי החשבון
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1">
              <label className="block text-[11px] font-black text-slate-500 uppercase italic mb-2">
                שם העסק
              </label>
              <div className="relative">
                <Building2
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  size={18}
                  aria-hidden
                />
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleInputChange}
                  className="w-full bg-[#060910] border border-white/5 rounded-2xl py-3 pr-12 pl-4 text-sm focus:ring-2 ring-blue-600 outline-none text-white transition-all"
                  placeholder="ירחי אלומיניום בע״מ"
                  autoComplete="organization"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase italic mb-2">
                שם קבלן / איש קשר
              </label>
              <div className="relative">
                <User
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  size={18}
                  aria-hidden
                />
                <input
                  type="text"
                  name="contractorName"
                  value={formData.contractorName}
                  onChange={handleInputChange}
                  className="w-full bg-[#060910] border border-white/5 rounded-2xl py-3 pr-12 pl-4 text-sm focus:ring-2 ring-blue-600 outline-none text-white transition-all"
                  placeholder="ישראל ישראלי"
                  autoComplete="name"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase italic mb-2">
                מספר טלפון
              </label>
              <div className="relative">
                <Phone
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  size={18}
                  aria-hidden
                />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full bg-[#060910] border border-white/5 rounded-2xl py-3 pr-12 pl-4 text-sm focus:ring-2 ring-blue-600 outline-none text-white transition-all"
                  placeholder="05X-XXXXXXX"
                  autoComplete="tel"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase italic mb-2">
                אימייל
              </label>
              <div className="relative">
                <Mail
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  size={18}
                  aria-hidden
                />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full bg-[#060910] border border-white/5 rounded-2xl py-3 pr-12 pl-4 text-sm focus:ring-2 ring-blue-600 outline-none text-white transition-all"
                  placeholder="name@company.co.il"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase italic mb-2">
                סיסמה
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full bg-[#060910] border border-white/5 rounded-2xl py-3 px-4 text-sm focus:ring-2 ring-blue-600 outline-none text-white transition-all"
                placeholder="לפחות 8 תווים"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase italic mb-2">
                אימות סיסמה
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="w-full bg-[#060910] border border-white/5 rounded-2xl py-3 px-4 text-sm focus:ring-2 ring-blue-600 outline-none text-white transition-all"
                placeholder="הקלד שוב"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-4">
            <p className="font-black text-amber-200/90 text-sm mb-2">
              דרישות סיסמה:
            </p>
            <ul className="space-y-1.5 text-sm text-slate-300 font-bold">
              <li className="flex items-center gap-2">
                {passwordChecks.minLen ? "✅" : "⬜"} לפחות 8 תווים
              </li>
              <li className="flex items-center gap-2">
                {passwordChecks.hasUpper ? "✅" : "⬜"} אות גדולה באנגלית
              </li>
              <li className="flex items-center gap-2">
                {passwordChecks.hasLower ? "✅" : "⬜"} אות קטנה באנגלית
              </li>
              <li className="flex items-center gap-2">
                {passwordChecks.hasDigit ? "✅" : "⬜"} לפחות ספרה אחת
              </li>
            </ul>
          </div>

          <label className="mt-6 flex items-start gap-3 cursor-pointer rounded-2xl border border-white/10 p-4 bg-[#060910]/80">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 rounded accent-blue-600 shrink-0"
            />
            <span className="text-sm text-slate-400 leading-relaxed font-bold">
              קראתי והבנתי את{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                תקנון השימוש
              </a>
              , ואני מאשר את התנאים כדי להמשיך בתהליך.
            </span>
          </label>

          {formError && (
            <p className="mt-4 text-red-400 text-sm font-bold" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-6 py-4 rounded-2xl font-black italic text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              חזור
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateStep2()) setStep(3);
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black italic flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all"
            >
              המשך לתשלום <ArrowRight size={18} className="rotate-180" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-[#0b0f1a] border border-white/10 p-6 md:p-8 rounded-[2rem] w-full max-w-md shadow-2xl">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-black italic text-white mb-2">
              תשלום והוכחה
            </h3>
            <p className="text-sm text-slate-400 font-bold">
              מסלול:{" "}
              <span className="text-white">{PLAN_COPY[plan].title}</span> —{" "}
              <span className="text-white">{PLAN_COPY[plan].price}</span>
            </p>
          </div>

          <div className="flex gap-2 mb-6 bg-[#060910] p-1.5 rounded-2xl border border-white/5">
            <button
              type="button"
              onClick={() => setPaymentMethod("bit")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
                paymentMethod === "bit"
                  ? "bg-[#0b0f1a] text-white shadow-md border border-white/10"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Smartphone size={16} aria-hidden /> ביט (Bit)
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("bank")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
                paymentMethod === "bank"
                  ? "bg-[#0b0f1a] text-white shadow-md border border-white/10"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <CreditCard size={16} aria-hidden /> העברה בנקאית
            </button>
          </div>

          <div className="mb-6">
            {paymentMethod === "bit" ? (
              <div className="flex flex-col items-center text-center p-6 border border-white/5 bg-[#060910] rounded-2xl">
                <div className="w-16 h-16 bg-teal-500/10 rounded-2xl flex items-center justify-center mb-4 text-teal-400">
                  <Smartphone size={32} aria-hidden />
                </div>
                <p className="text-sm font-bold text-slate-300 mb-2">
                  העבר באמצעות אפליקציית ביט למספר:
                </p>
                <p className="text-2xl font-black italic text-white mb-4 tracking-wider select-all">
                  {bitDisplayPhone()}
                </p>
                <p className="text-[11px] text-slate-500 bg-white/5 p-3 rounded-xl">
                  בהערה בביט:{" "}
                  <span className="text-white font-bold">
                    {formData.businessName.trim() || "שם העסק"}
                  </span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col p-6 border border-white/5 bg-[#060910] rounded-2xl space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="text-blue-500 shrink-0" size={24} aria-hidden />
                  <span className="font-black italic text-white">
                    פרטי חשבון להעברה
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-right">
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                      בנק
                    </span>
                    <span className="text-sm text-white font-black">
                      {bank.bankName}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                      סניף
                    </span>
                    <span className="text-sm text-white font-black">
                      {bank.branch}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                      מספר חשבון
                    </span>
                    <span className="text-xl text-white font-black tracking-widest select-all">
                      {bank.account}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                      שם המוטב
                    </span>
                    <span className="text-sm text-white font-black">
                      {bank.beneficiary}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mb-6">
            <label
              htmlFor={uploadId}
              className="block text-[11px] font-black text-slate-400 uppercase italic mb-3"
            >
              העלאת צילום מסך של אישור התשלום
            </label>
            <input
              id={uploadId}
              type="file"
              accept={ACCEPT_IMAGES}
              className="sr-only"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {!proofFile ? (
              <label
                htmlFor={uploadId}
                className="border-2 border-dashed border-white/10 hover:border-blue-500/50 bg-[#060910] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group"
              >
                <span className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-3 text-blue-500 group-hover:scale-110 transition-transform">
                  <UploadCloud size={24} aria-hidden />
                </span>
                <span className="text-sm font-bold text-slate-300">
                  לחץ לבחירת קובץ
                </span>
                <span className="text-[11px] text-slate-500 mt-1">
                  JPG, PNG, WebP (עד 5MB)
                </span>
              </label>
            ) : (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 shrink-0">
                    <FileImage size={20} aria-hidden />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-white truncate">
                      {proofFile.name}
                    </span>
                    <span className="text-[11px] text-emerald-400">מוכן לשליחה</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProofFile(null);
                    setFileError("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-[11px] font-black italic text-slate-500 hover:text-red-400 shrink-0"
                >
                  החלף
                </button>
              </div>
            )}
            {fileError && (
              <p className="mt-2 text-red-400 text-xs font-bold" role="alert">
                {fileError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 justify-center mb-4 text-emerald-400/90">
            <ShieldCheck size={16} aria-hidden />
            <span className="text-[11px] font-bold">
              במובייל ננסה לפתוח שיתוף עם הקובץ; אחרת תצרף ידנית בווטסאפ
            </span>
          </div>

          <button
            type="button"
            onClick={() => void tryWhatsAppWithProof()}
            disabled={!proofFile}
            className={`w-full py-4 rounded-2xl font-black italic flex items-center justify-center gap-2 shadow-xl transition-all ${
              proofFile
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                : "bg-white/5 text-slate-500 cursor-not-allowed"
            }`}
          >
            <MessageCircle size={18} aria-hidden /> שליחה לווטסאפ עם ההוכחה
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full mt-3 py-3 rounded-2xl font-black italic text-slate-400 hover:text-white transition-all text-sm"
          >
            חזור לפרטים
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="bg-[#0b0f1a] border border-white/10 p-8 md:p-10 rounded-[2rem] w-full max-w-md shadow-2xl text-center">
          <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 size={48} aria-hidden />
          </div>
          <h3 className="text-2xl font-black italic text-white mb-4">כמעט סיימנו</h3>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed font-bold">
            וודאו שההודעה (והתמונה, אם נשלחה) הגיעו אל ירחי. אחרי אישור התשלום
            יש לשלים פתיחת משתמש במערכת באמצעות אותו אימייל וסיסמה שבחרתם.
          </p>
          {shareHint && (
            <p className="text-xs text-blue-300/90 font-bold mb-6 leading-relaxed">
              {shareHint}
            </p>
          )}
          <div className="p-4 bg-[#060910] border border-white/5 rounded-2xl mb-6">
            <p className="text-[12px] font-bold text-slate-500 mb-2">לא נפתח ווטסאפ?</p>
            <button
              type="button"
              onClick={() => void tryWhatsAppWithProof()}
              className="text-blue-500 font-black italic hover:text-blue-400 text-sm inline-flex items-center justify-center gap-1"
            >
              נסה שוב <ArrowRight size={14} className="rotate-180" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 font-bold">
            תמיכה: {bitDisplayPhone()}
          </p>
        </div>
      )}
    </div>
  );
}
