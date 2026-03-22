import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";

function isConfigured(): boolean {
  return Boolean(
    hasFirebaseAdminCredentials() &&
      process.env.RESEND_API_KEY?.trim() &&
      process.env.ADMIN_NOTIFY_EMAIL?.trim()
  );
}

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
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
    const snap = await db.doc(`users/${uid}`).get();
    const data = snap.data() ?? {};

    const businessName = String(data.businessName ?? "");
    const contractorName = String(data.contractorName ?? "");
    const phone = String(data.phone ?? "");
    const email = String(data.email ?? "");

    const subject = `רישום קבלן חדש — ${businessName || email || uid}`;

    const text = [
      "נרשם קבלן חדש במערכת Yarhi Pro",
      "",
      "סטטוס: ממתין לאישור — ב-Firestore שדה accountApproved=false עד שתאשר (הגדר true במסמך users/" +
        uid +
        ").",
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

    const resend = new Resend(process.env.RESEND_API_KEY!);
    const from =
      process.env.EMAIL_FROM?.trim() || "Yarhi Pro <onboarding@resend.dev>";
    const to = process.env.ADMIN_NOTIFY_EMAIL!.trim();

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
