/**
 * אישור גישה על ידי מנהל (Firestore: users/{uid}).
 * - accountApproved: false = ממתין לאישור.
 * - true / חסר (legacy) = מאושר מבחינת אישור, אם לא חלף תוקף.
 * - accessValidUntil: Timestamp אופציונלי — אחרי המועץ אין גישה (חידוש רק ע"י מנהל ב-Console).
 */

export type AccountAccessBlockReason = "pending" | "expired";

function timestampToMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const sec = o.seconds ?? o._seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) return sec * 1000;
  }
  return null;
}

/** מחזיר millis לסוף תוקף, או null אם אין מגבלה (גישה בלתי מוגבלת בזמן). */
export function accessValidUntilMillis(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  return timestampToMillis(data.accessValidUntil);
}

export function getAccountAccessState(data: Record<string, unknown> | undefined): {
  allowed: boolean;
  blockReason: AccountAccessBlockReason | null;
} {
  if (!data) return { allowed: false, blockReason: "pending" };
  if (data.accountApproved === false) return { allowed: false, blockReason: "pending" };

  const until = accessValidUntilMillis(data);
  if (until != null && Date.now() > until) return { allowed: false, blockReason: "expired" };

  return { allowed: true, blockReason: null };
}

export function isAccountApprovedFromUserDoc(data: Record<string, unknown> | undefined): boolean {
  return getAccountAccessState(data).allowed;
}
