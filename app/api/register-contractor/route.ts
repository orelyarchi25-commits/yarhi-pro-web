import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseAdminCredentials } from "@/lib/supabase-admin";
import { sendAdminRegistrationEmail } from "@/lib/send-registration-email";
import { TERMS_VERSION } from "@/lib/terms";

/**
 * הרשמת קבלן בשרת (Supabase Admin) + שליחת מייל למנהל מיד.
 * אמין יותר מקריאה מהדפדפן אחרי signUp.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseAdminCredentials()) {
    return NextResponse.json(
      { error: "server_misconfigured", message: "חסר SUPABASE_SERVICE_ROLE_KEY בשרת" },
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
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
  const password = typeof o.password === "string" ? o.password : "";
  const businessName = typeof o.businessName === "string" ? o.businessName.trim() : "";
  const contractorName = typeof o.contractorName === "string" ? o.contractorName.trim() : "";
  const phone = typeof o.phone === "string" ? o.phone.trim() : "";
  const registrationPlan = typeof o.registrationPlan === "string" ? o.registrationPlan : "";
  const paymentMethod = typeof o.paymentMethod === "string" ? o.paymentMethod : "";
  const paymentProofFileName =
    typeof o.paymentProofFileName === "string" ? o.paymentProofFileName : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  try {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        business_name: businessName,
        contractor_name: contractorName,
      },
    });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "create_user_failed";
      const lower = msg.toLowerCase();
      if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
        return NextResponse.json({ error: "email_exists", message: msg }, { status: 409 });
      }
      return NextResponse.json({ error: "auth_failed", message: msg }, { status: 400 });
    }

    const userId = created.user.id;
    const nowIso = new Date().toISOString();

    const { error: profileErr } = await sb.from("profiles").upsert({
      id: userId,
      email,
      business_name: businessName,
      contractor_name: contractorName,
      phone,
      registration_plan: registrationPlan,
      payment_method: paymentMethod,
      payment_proof_file_name: paymentProofFileName,
      terms_accepted_at: nowIso,
      terms_version: TERMS_VERSION,
      account_approved: false,
      updated_at: nowIso,
    });

    if (profileErr) {
      console.error("[register-contractor] profile:", profileErr.message);
      return NextResponse.json({ error: "profile_failed", message: profileErr.message }, { status: 500 });
    }

    await sb.from("workspaces").upsert({ user_id: userId, data: {}, updated_at: nowIso });

    const mail = await sendAdminRegistrationEmail({
      uid: userId,
      email,
      businessName,
      contractorName,
      phone,
      registrationPlan,
      paymentMethod,
      paymentProofFileName: paymentProofFileName ?? undefined,
      backendNote: "מקור: Supabase (הרשמה בשרת). לאישור: /admin/approve",
    });

    return NextResponse.json({
      ok: true,
      userId,
      email,
      notify: mail.ok
        ? { sent: true, id: mail.id }
        : {
            sent: false,
            skipped: "skipped" in mail ? mail.skipped : false,
            missing: "missing" in mail ? mail.missing : undefined,
            message: mail.message,
          },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[register-contractor]", e);
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
