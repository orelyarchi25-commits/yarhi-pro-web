/** סטטוס CRM ללידים ולפרויקטים — קובע גם אם הרשומה נספרת ברשימת חייבים */

export const CRM_STATUS_VALUES = [
  "lead_new",
  "quote_sent",
  "approved_awaiting",
  "in_progress",
  "installed",
  "cancelled",
] as const;

export type CrmStatus = (typeof CRM_STATUS_VALUES)[number];

export const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  lead_new: "ליד חדש (טרם טופל)",
  quote_sent: "נשלחה הצעת מחיר",
  approved_awaiting: "אושר – ממתין לביצוע",
  in_progress: "בעבודה / ייצור",
  installed: "הותקן / הושלם",
  cancelled: "לא רלוונטי / בוטל",
};

/** מחלקת עיצוב לתג סטטוס בטבלאות */
export const CRM_STATUS_UI: Record<CrmStatus, { pill: string; emoji: string }> = {
  lead_new: { pill: "bg-slate-100 text-slate-800 border-slate-200", emoji: "🆕" },
  quote_sent: { pill: "bg-sky-100 text-sky-900 border-sky-200", emoji: "📤" },
  approved_awaiting: { pill: "bg-amber-100 text-amber-950 border-amber-200", emoji: "✅" },
  in_progress: { pill: "bg-violet-100 text-violet-900 border-violet-200", emoji: "🔧" },
  installed: { pill: "bg-emerald-100 text-emerald-900 border-emerald-200", emoji: "🏁" },
  cancelled: { pill: "bg-stone-200 text-stone-700 border-stone-300", emoji: "⛔" },
};

export const CRM_STATUS_SELECT_OPTIONS: { value: CrmStatus; label: string }[] = CRM_STATUS_VALUES.map((value) => ({
  value,
  label: CRM_STATUS_LABELS[value],
}));

/** ברירת מחדל לשמירת פרגולה/גדר ל-CRM — לא מופיע בחייבים עד מעבר ל״אושר – ממתין לביצוע״ */
export const DEFAULT_CRM_STATUS_AFTER_CALC_SAVE: CrmStatus = "quote_sent";

/** סטטוסים שנכנסים לפיננסי / חייבים — חייבים סכום עסקה (>0) כולל מע״מ */
export function crmStatusRequiresPositiveDealIncVat(status: CrmStatus): boolean {
  return status === "approved_awaiting" || status === "in_progress";
}

export function parseCrmStatus(raw: unknown): CrmStatus | undefined {
  if (typeof raw !== "string") return undefined;
  return (CRM_STATUS_VALUES as readonly string[]).includes(raw) ? (raw as CrmStatus) : undefined;
}

/** רשומת ליד מהלוח — ליד השם מציג «לקוח» במקום «ליד» מאושר / בעבודה / הושלם */
export function crmLeadEntryShowsAsClient(status: CrmStatus | string | undefined): boolean {
  const s = parseCrmStatus(status);
  return s === "approved_awaiting" || s === "in_progress" || s === "installed";
}

/** תג ליד/לקוח ליד השם — פרויקטים שנשמרו מהמערכת (לוח / פרגולה / גדר), לא ייבוא חיצוני מפיננסי */
export function crmProjectShowsLifecycleLeadClientPill(project: { isExternal?: boolean }): boolean {
  return project.isExternal !== true;
}

export function getCrmStatusLabel(raw: unknown): string {
  const s = parseCrmStatus(raw);
  if (!s) return "ללא סטטוס (ישן)";
  return CRM_STATUS_LABELS[s];
}

/**
 * רשומות ללא שדה סטטус נחשבות לגזירות קודמות — נשארות כמו קודם בסיכום חוב.
 * עם סטטוס: רק אושר/בעבודה/הותקן נספרים ברולאפ חייבים (כשיש יתרה חיובית).
 */
export function crmProjectEligibleForDebtors(project: { crmStatus?: CrmStatus | string }): boolean {
  const s = parseCrmStatus(project.crmStatus);
  if (s === undefined) return true;
  return s === "approved_awaiting" || s === "in_progress" || s === "installed";
}

/** שעות לפני התרעת מעקב בתוך המערכת (ליד חדש / נשלחה הצעה) */
export const CRM_STALE_ALERT_HOURS = 48;

export type CrmStaleCheckFields = {
  id?: number;
  crmStatus?: CrmStatus | string;
  /** מתי הוגדר הסטטוס הנוכחי (ISO) — חובה למסלול «נשלחה הצעה» כדי לא להתריע על פרויקטים ישנים */
  crmStatusSince?: string;
};

function staleAnchorMs(p: CrmStaleCheckFields): number | null {
  if (p.crmStatusSince) {
    const t = Date.parse(p.crmStatusSince);
    if (Number.isFinite(t)) return t;
  }
  const s = parseCrmStatus(p.crmStatus);
  if (s === "lead_new" && typeof p.id === "number" && p.id > 1e12) return p.id;
  return null;
}

/** התרעת מעקב פנימית — רק ל־lead_new / quote_sent אחרי CRM_STALE_ALERT_HOURS */
export function getCrmStaleAlertMessage(p: CrmStaleCheckFields): string | null {
  const s = parseCrmStatus(p.crmStatus);
  if (s !== "lead_new" && s !== "quote_sent") return null;
  const anchor = staleAnchorMs(p);
  if (anchor == null) return null;
  const hours = (Date.now() - anchor) / (3600 * 1000);
  if (hours < CRM_STALE_ALERT_HOURS) return null;
  if (s === "lead_new") {
    return "נא לשלוח הצעה דחוף! (מעל 48 שעות ב«ליד חדש»)";
  }
  return "מומלץ לבדוק מול הלקוח מה קורה (מעל 48 שעות ב«נשלחה הצעה»)";
}

/** לסיכום בראש לוח הבקרה */
export function countCrmStaleAlerts(projects: CrmStaleCheckFields[]): number {
  return projects.reduce((n, p) => (getCrmStaleAlertMessage(p) ? n + 1 : n), 0);
}
