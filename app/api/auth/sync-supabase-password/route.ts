import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";
import { getSupabaseAdmin, hasSupabaseAdminCredentials } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * אחרי כניסה מוצלחת ל-Firebase: מעתיק את אותה סיסמה לחשבון Supabase
 * כדי שהקבלן ייכנס רגיל בלי «שכחתי סיסמה».
 */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials() || !hasSupabaseAdminCredentials()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const idToken = typeof o.idToken === "string" ? o.idToken.trim() : "";
  const password = typeof o.password === "string" ? o.password : "";
  if (!idToken || password.length < 6) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  let email = "";
  try {
    const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(idToken);
    email = String(decoded.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "no_email" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data: profile } = await sb.from("profiles").select("id").ilike("email", email).maybeSingle();
  let userId = profile?.id ?? null;
  if (!userId) {
    const { data: listed, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      console.error("[sync-supabase-password] listUsers:", error.message);
      return NextResponse.json({ ok: false, reason: "lookup_failed" }, { status: 500 });
    }
    userId = listed?.users.find((u) => (u.email || "").toLowerCase() === email)?.id ?? null;
  }
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_supabase_user" }, { status: 404 });
  }

  const { error: updErr } = await sb.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (updErr) {
    console.error("[sync-supabase-password] updateUser:", updErr.message);
    return NextResponse.json({ ok: false, reason: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
