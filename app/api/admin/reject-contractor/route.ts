import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseAdminCredentials } from "@/lib/supabase-admin";

/** סימון פנימי אם עמודת account_rejected עדיין לא קיימת ב-Supabase */
const REJECTED_MARKER = "__admin_rejected__";

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_APPROVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured", hint: "הגדר ADMIN_APPROVE_SECRET בשרת" }, { status: 503 });
  }
  if (!hasSupabaseAdminCredentials()) {
    return NextResponse.json(
      { error: "server_misconfigured", hint: "חסר SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
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

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  let userId: string | null = null;
  if (emailOrUid.includes("@")) {
    const emailLower = emailOrUid.toLowerCase();
    const { data: byEmail } = await sb.from("profiles").select("id").ilike("email", emailLower).maybeSingle();
    userId = byEmail?.id ?? null;
    if (!userId) {
      const { data: listed } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      userId = listed?.users.find((u) => (u.email ?? "").toLowerCase() === emailLower)?.id ?? null;
    }
  } else {
    userId = emailOrUid;
  }

  if (!userId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const withColumn = await sb
    .from("profiles")
    .update({
      account_rejected: true,
      account_approved: false,
      payment_proof_file_name: REJECTED_MARKER,
      updated_at: now,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (withColumn.error) {
    const fallback = await sb
      .from("profiles")
      .update({
        account_approved: false,
        payment_proof_file_name: REJECTED_MARKER,
        updated_at: now,
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (fallback.error) {
      console.error("[reject-contractor]", fallback.error.message);
      return NextResponse.json({ error: "server_error", message: fallback.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, uid: userId });
}
