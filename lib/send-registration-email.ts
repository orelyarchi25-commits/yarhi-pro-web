import { Resend } from "resend";
import {
  canSendRegistrationNotify,
  getNotifyRegistrationMissing,
  getNotifyResendApiKey,
  parseAdminNotifyEmails,
} from "@/lib/notify-registration";

export type RegistrationEmailInput = {
  uid: string;
  email: string;
  businessName: string;
  contractorName: string;
  phone: string;
  registrationPlan: string;
  paymentMethod: string;
  paymentProofFileName?: string;
  backendNote?: string;
};

function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "https://yarhi-pro-web.vercel.app";
}

export async function sendAdminRegistrationEmail(
  input: RegistrationEmailInput
): Promise<{ ok: true; id: string | null } | { ok: false; skipped?: boolean; missing?: string[]; message: string }> {
  if (!canSendRegistrationNotify()) {
    const missing = getNotifyRegistrationMissing();
    return {
      ok: false,
      skipped: true,
      missing,
      message: "חסרים משתני סביבה: " + missing.join(", "),
    };
  }

  const resendApiKey = getNotifyResendApiKey();
  const to = parseAdminNotifyEmails();
  if (!resendApiKey || to.length === 0) {
    return { ok: false, skipped: true, missing: ["resend", "admin_email"], message: "חסר Resend או כתובת מנהל" };
  }

  const subject = `רישום קבלן חדש — ${input.businessName || input.email || input.uid}`;
  const approveLink = `${publicBaseUrl()}/admin/approve`;
  const planLabel =
    input.registrationPlan === "monthly"
      ? "חודשי"
      : input.registrationPlan === "annual"
        ? "שנתי"
        : input.registrationPlan === "trial_7d"
          ? "ניסיון 7 ימים"
          : "—";

  const text = [
    "נרשם קבלן חדש במערכת Yarhi Pro",
    "",
    "סטטוס: ממתין לאישור.",
    "לאישור היכנס לדף המנהל:",
    approveLink,
    "",
    input.backendNote || "מקור: Supabase.",
    "",
    `שם עסק: ${input.businessName || "—"}`,
    `שם קבלן: ${input.contractorName || "—"}`,
    `טלפון: ${input.phone || "—"}`,
    `אימייל: ${input.email || "—"}`,
    `מסלול: ${planLabel}`,
    `אמצעי תשלום שדווח: ${
      input.paymentMethod === "bank" ? "העברה בנקאית" : input.paymentMethod === "bit" ? "ביט (Bit)" : "—"
    }`,
    `צילום אישור תשלום: ${input.paymentProofFileName || "לא צורף"}`,
    `מזהה משתמש (UID): ${input.uid}`,
  ].join("\n");

  const html = `<pre dir="rtl" style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text.replace(
    /</g,
    "&lt;"
  )}</pre>`;

  const resend = new Resend(resendApiKey);
  const from = process.env.EMAIL_FROM?.trim() || "Yarhi Pro <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
  });

  if (error) {
    const detail =
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    console.error("[sendAdminRegistrationEmail] Resend:", detail);
    return { ok: false, message: detail };
  }

  console.info("[sendAdminRegistrationEmail] sent", { to, id: data?.id, email: input.email });
  return { ok: true, id: data?.id ?? null };
}

/** מייל בדיקה למנהל — לוודא ש-Resend עובד */
export async function sendAdminTestEmail(): Promise<
  { ok: true; id: string | null; to: string[] } | { ok: false; message: string }
> {
  if (!canSendRegistrationNotify()) {
    return { ok: false, message: "חסרים: " + getNotifyRegistrationMissing().join(", ") };
  }
  const resendApiKey = getNotifyResendApiKey();
  const to = parseAdminNotifyEmails();
  const resend = new Resend(resendApiKey);
  const from = process.env.EMAIL_FROM?.trim() || "Yarhi Pro <onboarding@resend.dev>";
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "בדיקת התראות Yarhi Pro",
    text:
      "זה מייל בדיקה מ-Yarhi Pro.\nאם קיבלת אותו — התראות רישום אמורות להגיע לכתובת הזו.\n\nדף אישור: " +
      publicBaseUrl() +
      "/admin/approve",
  });
  if (error) {
    const detail =
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    return { ok: false, message: detail };
  }
  return { ok: true, id: data?.id ?? null, to };
}
