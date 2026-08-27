import { NextRequest, NextResponse } from "next/server";
import { sendAdminTestEmail } from "@/lib/send-registration-email";

/** שליחת מייל בדיקה למנהל — לוודא ש-Resend עובד */
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_APPROVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
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

  const result = await sendAdminTestEmail();
  if (!result.ok) {
    return NextResponse.json({ error: "email_failed", message: result.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: result.id, to: result.to });
}
