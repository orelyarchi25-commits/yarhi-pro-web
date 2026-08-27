"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password.length < 8) {
      setError("הסיסמה חייבת להיות לפחות 8 תווים");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { family_name: familyName.trim() || "המשפחה שלי" },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError) {
        setError(authError.message === "User already registered" ? "האימייל כבר רשום" : "ההרשמה נכשלה");
        return;
      }
      if (data.session) {
        router.replace("/app");
        router.refresh();
        return;
      }
      setInfo("נשלח מייל אימות. אחרי האישור אפשר להתחבר.");
    } catch {
      setError("לא ניתן להירשם כרגע");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 grid place-items-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <div className="flex items-center gap-2 font-extrabold text-indigo-700 mb-6">
          <Wallet className="w-5 h-5" /> HouseFin
        </div>
        <h1 className="text-2xl font-bold mb-1">הרשמה</h1>
        <p className="text-sm text-slate-500 mb-5">מסלול חינמי מיד. פרימיום מתווסף רק אחרי תשלום.</p>
        <label className="text-sm font-medium">שם המשפחה בחשבון</label>
        <input
          type="text"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          placeholder="משפחת כהן"
          className="mt-1 mb-3 w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <label className="text-sm font-medium">אימייל</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 mb-3 w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <label className="text-sm font-medium">סיסמה</label>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 mb-4 w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        {info && <p className="text-sm text-emerald-700 mb-3">{info}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "יוצרים חשבון..." : "צרו חשבון"}
        </button>
        <p className="text-sm text-slate-500 text-center mt-4">
          כבר רשומים?{" "}
          <Link href="/login" className="text-indigo-600 font-semibold">
            כניסה
          </Link>
        </p>
      </form>
    </div>
  );
}
