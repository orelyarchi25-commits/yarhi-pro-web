"use client";

import { useState } from "react";

type Preset = "week" | "month" | "year" | "unlimited" | "custom";

export default function AdminApprovePage() {
  const [secret, setSecret] = useState("");
  const [emailOrUid, setEmailOrUid] = useState("");
  const [preset, setPreset] = useState<Preset>("month");
  const [customLocal, setCustomLocal] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    if (preset === "custom" && !customLocal.trim()) {
      setErr("בחר תאריך ושעה לסיום (מצב תאריך מותאם).");
      return;
    }
    const customUntilIso =
      preset === "custom" && customLocal ? new Date(customLocal).toISOString() : undefined;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/approve-contractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          emailOrUid: emailOrUid.trim(),
          accessPreset: preset,
          customUntilIso,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        if (data.error === "unauthorized") setErr("סיסמת מנהל שגויה.");
        else if (data.error === "user_not_found") setErr("לא נמצא משתמש עם האימייל או ה-UID הזה.");
        else setErr(typeof data.message === "string" ? data.message : "שגיאה — בדוק לוג שרת.");
        return;
      }

      const until = data.accessValidUntil as { iso?: string } | null | undefined;
      setMsg(
        until?.iso
          ? `אושר. תוקף עד ${new Date(until.iso).toLocaleString("he-IL")} (שעון מקומי בדפדפן).`
          : "אושר ללא הגבלת זמן (הוסר accessValidUntil)."
      );
    } catch {
      setErr("בעיית רשת או שרת.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white py-10 px-4" dir="rtl">
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-600 bg-slate-800/90 p-8 shadow-xl">
        <h1 className="text-2xl font-black text-emerald-300 mb-2">אישור קבלן + תוקף</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          דף למנהל בלבד. הסיסמה אינה נשמרת באתר — מוזנת כאן בכל פעם. ב-Vercel יש להגדיר{" "}
          <code className="text-slate-200">ADMIN_APPROVE_SECRET</code> ו-
          <code className="text-slate-200">FIREBASE_SERVICE_ACCOUNT_JSON</code>.
        </p>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">סיסמת מנהל (מהשרת)</label>
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white"
              placeholder="ADMIN_APPROVE_SECRET"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">אימייל משתמש או UID</label>
            <input
              type="text"
              value={emailOrUid}
              onChange={(e) => setEmailOrUid(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white"
              placeholder="name@company.co.il"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">תוקף גישה מהאישור</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white"
            >
              <option value="week">שבוע מהיום</option>
              <option value="month">חודש מהיום</option>
              <option value="year">שנה מהיום</option>
              <option value="unlimited">ללא הגבלה (מוחק תאריך תפוגה)</option>
              <option value="custom">תאריך ושעת סיום מדויקים</option>
            </select>
          </div>
          {preset === "custom" && (
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">סיום גישה</label>
              <input
                type="datetime-local"
                value={customLocal}
                onChange={(e) => setCustomLocal(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white"
              />
            </div>
          )}
          {err && <p className="text-red-400 text-sm font-bold">{err}</p>}
          {msg && <p className="text-emerald-400 text-sm font-bold">{msg}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "שומר…" : "אשר והקצה תוקף"}
          </button>
        </form>
      </div>
    </main>
  );
}
