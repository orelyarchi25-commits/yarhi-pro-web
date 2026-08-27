"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div dir="rtl" className="min-h-screen grid place-items-center">טוען...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError("אימייל או סיסמה שגויים");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/app");
      router.refresh();
    } catch {
      setError("לא ניתן להתחבר כרגע");
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
        <h1 className="text-2xl font-bold mb-1">כניסה</h1>
        <p className="text-sm text-slate-500 mb-5">הנתונים שלכם נשמרים רק אצל החשבון הזה.</p>
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 mb-4 w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "נכנסים..." : "כניסה"}
        </button>
        <p className="text-sm text-slate-500 text-center mt-4">
          אין חשבון?{" "}
          <Link href="/register" className="text-indigo-600 font-semibold">
            הרשמה
          </Link>
        </p>
      </form>
    </div>
  );
}
