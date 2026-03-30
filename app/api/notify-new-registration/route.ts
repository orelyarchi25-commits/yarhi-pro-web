import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import {
  canSendRegistrationNotify,
  getNotifyRegistrationMissing,
  getNotifyResendApiKey,
  parseAdminNotifyEmails,
} from "@/lib/notify-registration";

function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "";
}

async function getUserDocWithRetry(
  db: Firestore,
  uid: string,
  attempts = 4,
  delayMs = 350
): Promise<Record<string, unknown> | undefined> {
  for (let i = 0; i < attempts; i++) {
    const snap = await db.doc(`users/${uid}`).get();
    const d = snap.data();
    if (d && (d.email != null || d.businessName != null || d.contractorName != null)) {
      return d;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  const last = await db.doc(`users/${uid}`).get();
  return last.data();
}

export async function POST(request: NextRequest) {
  const missing = getNotifyRegistrationMissing();
  if (!canSendRegistrationNotify()) {
    console.warn("[notify-new-registration] skipped — missing env:", missing.join(", "));
    return NextResponse.json({ ok: true, skipped: true, missing }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const idToken =
    typeof body === "object" &&
    body !== null &&
    "idToken" in body &&
    typeof (body as { idToken: unknown }).idToken === "string"
      ? (body as { idToken: string }).idToken
      : null;

  if (!idToken) {
    return NextResponse.json({ error: "missing idToken" }, { status: 400 });
  }

  try {
    const app = getFirebaseAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const uid = decoded.uid;

    const db = getFirestore(app);
    const raw = await getUserDocWithRetry(db, uid);
    const data = (raw ?? {}) as Record<string, unknown>;

    const businessName = String(data.businessName ?? "");
    const contractorName = String(data.contractorName ?? "");
    const phone = String(data.phone ?? "");
    const email = String(data.email ?? decoded.email ?? "");

    const subject = `רישום קבלן חדש — ${businessName || email || uid}`;

    const base = publicBaseUrl();
    const approveLink = base ? `${base}/admin/approve` : "";

    const text = [
      "נרשם קבלן חדש במערכת Yarhi Pro",
      "",
      "סטטוס: ממתין לאישור.",
      "לאישור + הקצאת תוקף (שבוע / חודש / שנה / תאריך / ללא הגבלה) השתמש בדף המנהל (סיסמה מהשרת):",
      approveLink || "(הגדר NEXT_PUBLIC_APP_URL ב-Vercel כדי שיופיע קישור ישיר)",
      "",
      "או ידנית ב-Firestore: users/" + uid + " — accountApproved=true ו-accessValidUntil (Timestamp) אופציונלי.",
      "",
      `שם עסק: ${businessName || "—"}`,
      `שם קבלן: ${contractorName || "—"}`,
      `טלפון: ${phone || "—"}`,
      `אימייל: ${email || "—"}`,
      `מזהה משתמש (UID): ${uid}`,
    ].join("\n");

    const html = `<pre dir="rtl" style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text.replace(
      /</g,
      "&lt;"
    )}</pre>`;

    const resendApiKey = getNotifyResendApiKey();
    if (!resendApiKey) {
      return NextResponse.json(
        { ok: true, skipped: true, missing: ["resend"] as ("resend")[] },
        { status: 200 }
      );
    }
    const resend = new Resend(resendApiKey);
    const from =
      process.env.EMAIL_FROM?.trim() || "Yarhi Pro <onboarding@resend.dev>";
    const to = parseAdminNotifyEmails();
    if (to.length === 0) {
      return NextResponse.json(
        { ok: true, skipped: true, missing: ["admin_email"] as ("admin_email")[] },
        { status: 200 }
      );
    }

    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });

    if (error) {
      console.error("[notify-new-registration] Resend:", error);
      return NextResponse.json({ error: "email_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notify-new-registration]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
