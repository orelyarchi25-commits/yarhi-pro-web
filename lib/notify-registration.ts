/** משתני סביבה להתראת מייל על רישום — לשימוש ב-route ובלקוח (הודעות שגיאה). */

export type NotifyRegistrationMissing = "firebase_admin" | "resend" | "admin_email";

function envAny(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

function unquoteEnvValue(value: string): string {
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

export function getNotifyResendApiKey(): string {
  return unquoteEnvValue(envAny("RESEND_API_KEY", "RESEND_KEY"));
}

export function getNotifyAdminEmailRaw(): string {
  return unquoteEnvValue(envAny("ADMIN_NOTIFY_EMAIL", "ADMIN_EMAIL"));
}

export function hasFirebaseAdminForNotify(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  );
}

/** מה חסר כדי לשלוח מייל (Resend + כתובת מנהל). Firebase לא חובה להרשמת Supabase. */
export function getNotifyRegistrationMissing(): NotifyRegistrationMissing[] {
  const missing: NotifyRegistrationMissing[] = [];
  if (!getNotifyResendApiKey()) missing.push("resend");
  if (!getNotifyAdminEmailRaw()) missing.push("admin_email");
  return missing;
}

export function parseAdminNotifyEmails(): string[] {
  const raw = getNotifyAdminEmailRaw();
  return raw
    .split(/[,;]+/)
    .map((s) => unquoteEnvValue(s))
    .filter(Boolean);
}

export function canSendRegistrationNotify(): boolean {
  return getNotifyRegistrationMissing().length === 0;
}
