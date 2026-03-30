import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";

type AccessPreset = "week" | "month" | "year" | "unlimited" | "custom";

function computeValidUntil(preset: AccessPreset, customIso: string | undefined): Date | "unlimited" | null {
  if (preset === "unlimited") return "unlimited";
  if (preset === "custom") {
    if (!customIso?.trim()) return null;
    const d = new Date(customIso.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date();
  if (preset === "week") d.setDate(d.getDate() + 7);
  else if (preset === "month") d.setMonth(d.getMonth() + 1);
  else if (preset === "year") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d;
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_APPROVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured", hint: "הגדר ADMIN_APPROVE_SECRET בשרת" }, { status: 503 });
  }
  if (!hasFirebaseAdminCredentials()) {
    return NextResponse.json({ error: "server_misconfigured", hint: "חסר FIREBASE_SERVICE_ACCOUNT_JSON / PATH" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof o.secret === "string" ? o.secret : "";
  if (token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const emailOrUid = typeof o.emailOrUid === "string" ? o.emailOrUid.trim() : "";
  if (!emailOrUid) {
    return NextResponse.json({ error: "missing emailOrUid" }, { status: 400 });
  }

  const preset = o.accessPreset as AccessPreset;
  const allowed: AccessPreset[] = ["week", "month", "year", "unlimited", "custom"];
  if (!allowed.includes(preset)) {
    return NextResponse.json({ error: "invalid accessPreset" }, { status: 400 });
  }

  const customUntilIso = typeof o.customUntilIso === "string" ? o.customUntilIso : undefined;
  const until = computeValidUntil(preset, customUntilIso);
  if (until === null) {
    return NextResponse.json({ error: "invalid customUntilIso" }, { status: 400 });
  }

  try {
    const app = getFirebaseAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    let uid: string;
    if (emailOrUid.includes("@")) {
      const u = await auth.getUserByEmail(emailOrUid);
      uid = u.uid;
    } else {
      await auth.getUser(emailOrUid);
      uid = emailOrUid;
    }

    const ref = db.doc(`users/${uid}`);
    const patch: Record<string, unknown> = {
      accountApproved: true,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (until === "unlimited") {
      patch.accessValidUntil = FieldValue.delete();
    } else {
      patch.accessValidUntil = Timestamp.fromDate(until);
    }

    await ref.set(patch, { merge: true });

    return NextResponse.json({
      ok: true,
      uid,
      accessValidUntil:
        until === "unlimited" ? null : { iso: until.toISOString(), preset },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[approve-contractor]", e);
    if (code === "auth/user-not-found") {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
