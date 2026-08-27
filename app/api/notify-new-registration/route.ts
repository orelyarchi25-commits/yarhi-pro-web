import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import {
  canSendRegistrationNotify,
  getNotifyRegistrationMissing,
  hasFirebaseAdminForNotify,
} from "@/lib/notify-registration";
import { sendAdminRegistrationEmail } from "@/lib/send-registration-email";

function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "https://yarhi-pro-web.vercel.app";
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

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const idToken = typeof o.idToken === "string" ? o.idToken : null;
  const supabaseAccessToken = typeof o.supabaseAccessToken === "string" ? o.supabaseAccessToken : null;
  const profilePayload =
    o.profile && typeof o.profile === "object" ? (o.profile as Record<string, unknown>) : null;

  if (!idToken && !supabaseAccessToken && !profilePayload) {
    return NextResponse.json({ error: "missing idToken" }, { status: 400 });
  }

  try {
    let uid = "";
    let businessName = "";
    let contractorName = "";
    let phone = "";
    let email = "";
    let registrationPlan = "";
    let paymentMethod = "";
    let paymentProofFileName = "";
    let backendNote = "";

    if (supabaseAccessToken || (profilePayload && !idToken)) {
      try {
        const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
        const admin = getSupabaseAdmin();
        if (supabaseAccessToken && admin) {
          const { data: userData, error } = await admin.auth.getUser(supabaseAccessToken);
          if (!error && userData.user) {
            uid = userData.user.id;
            email = userData.user.email ?? "";
          }
        }
      } catch (e) {
        console.warn("[notify-new-registration] supabase token check skipped:", e);
      }
      businessName = String(profilePayload?.businessName ?? "");
      contractorName = String(profilePayload?.contractorName ?? "");
      phone = String(profilePayload?.phone ?? "");
      email = email || String(profilePayload?.email ?? "");
      registrationPlan = String(profilePayload?.registrationPlan ?? "");
      paymentMethod = String(profilePayload?.paymentMethod ?? "");
      paymentProofFileName = String(profilePayload?.paymentProofFileName ?? "");
      uid = uid || "supabase-new";
      backendNote = "מקור: Supabase (profiles). לאישור: " + publicBaseUrl() + "/admin/approve";
    } else {
      if (!hasFirebaseAdminForNotify()) {
        return NextResponse.json(
          {
            error: "server_misconfigured",
            message: "חסר FIREBASE_SERVICE_ACCOUNT לאימות הרשמת Firebase",
          },
          { status: 503 }
        );
      }
      const app = getFirebaseAdminApp();
      const decoded = await getAuth(app).verifyIdToken(idToken!);
      uid = decoded.uid;

      const db = getFirestore(app);
      const raw = await getUserDocWithRetry(db, uid);
      const data = (raw ?? {}) as Record<string, unknown>;

      businessName = String(data.businessName ?? "");
      contractorName = String(data.contractorName ?? "");
      phone = String(data.phone ?? "");
      email = String(data.email ?? decoded.email ?? "");
      registrationPlan = String(data.registrationPlan ?? "");
      paymentMethod = String(data.paymentMethod ?? "");
      paymentProofFileName = String(data.paymentProofFileName ?? "");
      backendNote =
        "או ידנית ב-Firestore: users/" +
        uid +
        " — accountApproved=true. דף אישור: " +
        publicBaseUrl() +
        "/admin/approve";
    }

    const mail = await sendAdminRegistrationEmail({
      uid,
      email,
      businessName,
      contractorName,
      phone,
      registrationPlan,
      paymentMethod,
      paymentProofFileName: paymentProofFileName || undefined,
      backendNote,
    });

    if (!mail.ok) {
      if (mail.skipped) {
        return NextResponse.json({ ok: true, skipped: true, missing: mail.missing }, { status: 200 });
      }
      return NextResponse.json({ error: "email_failed", message: mail.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: mail.id });
  } catch (e) {
    console.error("[notify-new-registration]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
