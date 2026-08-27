import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseAdminCredentials } from "@/lib/supabase-admin";

export type PendingContractor = {
  id: string;
  email: string;
  businessName: string;
  contractorName: string;
  phone: string;
  registrationPlan: string;
  createdAt: string | null;
};

/** רשימת קבלנים ממתינים לאישור (Supabase) — דורש סיסמת מנהל */
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_APPROVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured", hint: "ADMIN_APPROVE_SECRET" }, { status: 503 });
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

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("profiles")
    .select(
      "id, email, business_name, contractor_name, phone, registration_plan, created_at, account_approved, payment_proof_file_name, account_rejected"
    )
    .eq("account_approved", false)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = await (async () => {
    if (!error) return data ?? [];
    const missingRejectedCol =
      /account_rejected/i.test(error.message) || /schema cache/i.test(error.message);
    if (!missingRejectedCol) {
      console.error("[pending-contractors]", error.message);
      return null;
    }
    const retry = await sb
      .from("profiles")
      .select(
        "id, email, business_name, contractor_name, phone, registration_plan, created_at, account_approved, payment_proof_file_name"
      )
      .eq("account_approved", false)
      .order("created_at", { ascending: false })
      .limit(80);
    if (retry.error) {
      console.error("[pending-contractors]", retry.error.message);
      return null;
    }
    return retry.data ?? [];
  })();

  if (rows == null) {
    return NextResponse.json({ error: "server_error", message: error?.message || "pending failed" }, { status: 500 });
  }

  const REJECTED_MARKER = "__admin_rejected__";
  const pending: PendingContractor[] = rows
    .filter((row) => {
      const r = row as Record<string, unknown>;
      if (r.account_rejected === true) return false;
      if (String(r.payment_proof_file_name ?? "") === REJECTED_MARKER) return false;
      return true;
    })
    .map((row) => ({
      id: String(row.id),
      email: String(row.email ?? ""),
      businessName: String(row.business_name ?? ""),
      contractorName: String(row.contractor_name ?? ""),
      phone: String(row.phone ?? ""),
      registrationPlan: String(row.registration_plan ?? ""),
      createdAt: row.created_at != null ? String(row.created_at) : null,
    }));

  return NextResponse.json({ ok: true, pending });
}
