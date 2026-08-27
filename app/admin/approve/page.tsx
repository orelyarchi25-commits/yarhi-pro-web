"use client";

import { useState } from "react";

type Preset = "week" | "month" | "year" | "unlimited" | "custom";

type PendingRow = {
  id: string;
  email: string;
  businessName: string;
  contractorName: string;
  phone: string;
  registrationPlan: string;
  createdAt: string | null;
};

function approveErrorHe(data: Record<string, unknown>, status: number): string {
  const code = typeof data.error === "string" ? data.error : "";
  const hint = typeof data.hint === "string" ? data.hint : "";
  const message = typeof data.message === "string" ? data.message : "";

  if (code === "unauthorized") return "סיסמת מנהל שגויה.";
  if (code === "user_not_found") return "לא נמצא משתמש עם האימייל או ה-UID הזה (לא ב-Supabase ולא ב-Firebase).";
  if (code === "server_misconfigured") {
    return hint || "חסרה הגדרה בשרת. ב-Vercel הוסף SUPABASE_SERVICE_ROLE_KEY ו-ADMIN_APPROVE_SECRET.";
  }
  if (code === "invalid accessPreset") return "בחירת תוקף לא תקינה.";
  if (code === "invalid customUntilIso") return "תאריך מותאם לא תקין.";
  if (code === "missing emailOrUid") return "חסר אימייל או UID.";
  if (message) return message;
  if (hint) return hint;
  if (code) return `שגיאה: ${code} (${status})`;
  return `שגיאה מהשרת (${status}). בדוק משתני סביבה ב-Vercel.`;
}

function planLabel(plan: string): string {
  if (plan === "monthly") return "חודשי";
  if (plan === "annual") return "שנתי";
  if (plan === "trial_7d") return "ניסיון";
  return plan || "—";
}

export default function AdminApprovePage() {
  const [secret, setSecret] = useState("");
  const [emailOrUid, setEmailOrUid] = useState("");
  const [preset, setPreset] = useState<Preset>("month");
  const [customLocal, setCustomLocal] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingErr, setPendingErr] = useState("");

  const loadPending = async () => {
    setPendingErr("");
    setPendingLoading(true);
    try {
      const res = await fetch("/api/admin/pending-contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setPendingErr(approveErrorHe(data, res.status));
        setPending([]);
        return;
      }
      const list = Array.isArray(data.pending) ? (data.pending as PendingRow[]) : [];
      setPending(list);
      if (list.length === 0) setPendingErr("");
    } catch {
      setPendingErr("בעיית רשת בטעינת ממתינים.");
    } finally {
      setPendingLoading(false);
    }
  };

  const sendTestEmail = async () => {
    setMsg("");
    setErr("");
    if (!secret.trim()) {
      setErr("הזן סיסמת מנהל קודם.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/test-notify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setErr(approveErrorHe(data, res.status));
        return;
      }
      const to = Array.isArray(data.to) ? (data.to as string[]).join(", ") : "";
      setMsg(to ? `מייל בדיקה נשלח אל: ${to}. בדוק גם בספאם.` : "מייל בדיקה נשלח. בדוק גם בספאם.");
    } catch {
      setErr("בעיית רשת בשליחת מייל בדיקה.");
    } finally {
      setLoading(false);
    }
  };

  const approveOne = async (targetEmail: string) => {
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
          emailOrUid: targetEmail.trim(),
          accessPreset: preset,
          customUntilIso,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        setErr(approveErrorHe(data, res.status));
        return;
      }

      const until = data.accessValidUntil as { iso?: string } | null | undefined;
      const backend = typeof data.backend === "string" ? data.backend : "";
      const backendLabel = backend === "supabase" ? "Supabase" : backend === "firebase" ? "Firebase" : backend;
      setMsg(
        until?.iso
          ? `אושר ${targetEmail}${backendLabel ? ` (${backendLabel})` : ""}. תוקף עד ${new Date(until.iso).toLocaleString("he-IL")}.`
          : `אושר ${targetEmail}${backendLabel ? ` (${backendLabel})` : ""} ללא הגבלת זמן.`
      );
      setEmailOrUid(targetEmail);
      await loadPending();
    } catch {
      setErr("בעיית רשת או שרת.");
    } finally {
      setLoading(false);
    }
  };

  const rejectOne = async (targetEmail: string, displayName: string) => {
    setMsg("");
    setErr("");
    if (!secret.trim()) {
      setErr("הזן סיסמת מנהל קודם.");
      return;
    }
    if (typeof window !== "undefined") {
      const who = displayName.trim() || targetEmail;
      if (!window.confirm(`לדחות את ${who}?\n\nהוא ייעלם מרשימת הממתינים ולא יאושר.`)) return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reject-contractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, emailOrUid: targetEmail.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setErr(approveErrorHe(data, res.status));
        return;
      }
      setMsg(`נדחה: ${targetEmail}. הוסר מרשימת הממתינים.`);
      await loadPending();
    } catch {
      setErr("בעיית רשת בדחייה.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await approveOne(emailOrUid);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white py-10 px-4" dir="rtl">
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-600 bg-slate-800/90 p-8 shadow-xl space-y-8">
        <div>
          <h1 className="text-2xl font-black text-emerald-300 mb-2">אישור קבלן + תוקף</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            הזן סיסמה ← טען ממתינים ← אשר או דחה בלחיצה. דחייה מורידה מהרשימה בלי לתת גישה.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-400 mb-1">סיסמת מנהל (מהשרת)</label>
          <input
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white"
            placeholder="ADMIN_APPROVE_SECRET"
          />
          <button
            type="button"
            disabled={pendingLoading || !secret.trim()}
            onClick={() => void loadPending()}
            className="w-full rounded-xl bg-sky-600 py-3 font-black text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {pendingLoading ? "טוען…" : "הצג קבלנים ממתינים"}
          </button>
          <button
            type="button"
            disabled={!secret.trim() || loading}
            onClick={() => void sendTestEmail()}
            className="w-full rounded-xl border border-amber-500/50 bg-amber-500/10 py-3 font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            שלח מייל בדיקה אליי
          </button>
          {pendingErr && <p className="text-red-400 text-sm font-bold">{pendingErr}</p>}
          {pending.length > 0 && (
            <ul className="space-y-3">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-slate-600 bg-slate-900/80 p-4 text-sm space-y-2"
                >
                  <p className="font-black text-white">{p.businessName || p.email || "ללא שם עסק"}</p>
                  <p className="text-slate-300">{p.contractorName || "—"} · {p.phone || "ללא טלפון"}</p>
                  <p className="font-mono text-slate-400 text-xs">{p.email}</p>
                  <p className="text-slate-500 text-xs">
                    {planLabel(p.registrationPlan)}
                    {p.createdAt ? ` · ${new Date(p.createdAt).toLocaleString("he-IL")}` : ""}
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void approveOne(p.email)}
                      className="rounded-lg bg-emerald-600 py-2 font-bold hover:bg-emerald-500 disabled:opacity-50"
                    >
                      אשר ({preset === "month" ? "חודש" : preset === "week" ? "שבוע" : preset === "year" ? "שנה" : preset === "unlimited" ? "ללא הגבלה" : "מותאם"})
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void rejectOne(p.email, p.contractorName || p.businessName || p.email)}
                      className="rounded-lg bg-red-600 py-2 font-bold hover:bg-red-500 disabled:opacity-50"
                    >
                      דחה
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!pendingLoading && pending.length === 0 && secret && !pendingErr && (
            <p className="text-slate-500 text-sm text-center">אין ממתינים ב-Supabase (או עדיין לא נטען).</p>
          )}
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4 border-t border-slate-700 pt-6">
          <p className="text-xs font-bold text-slate-400">אישור ידני לפי אימייל</p>
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
          {err && <p className="text-red-400 text-sm font-bold whitespace-pre-wrap">{err}</p>}
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
