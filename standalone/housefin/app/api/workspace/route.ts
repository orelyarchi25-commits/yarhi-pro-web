import { NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase/server";
import { isPremiumStatus } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_400_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabase();
  const [{ data: workspace }, { data: sub }, { data: profile }] = await Promise.all([
    supabase.from("workspaces").select("data").eq("user_id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("status, current_period_end").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("family_name").eq("id", user.id).maybeSingle(),
  ]);

  const data = asRecord(workspace?.data);
  if (!data.familyName && profile?.family_name) {
    data.familyName = profile.family_name;
  }

  return NextResponse.json({
    data,
    isPremium: isPremiumStatus(sub?.status),
    email: user.email,
    subscriptionStatus: sub?.status || "none",
    currentPeriodEnd: sub?.current_period_end || null,
  });
}

export async function PUT(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const incoming = asRecord(asRecord(body).data);
  const encoded = JSON.stringify(incoming);
  if (encoded.length > MAX_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const supabase = await createServerSupabase();
  const [{ data: existing }, { data: sub }] = await Promise.all([
    supabase.from("workspaces").select("data").eq("user_id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle(),
  ]);

  const prev = asRecord(existing?.data);
  const premium = isPremiumStatus(sub?.status);

  const saved: Record<string, unknown> = {
    ...incoming,
    familyName: String(incoming.familyName || prev.familyName || "המשפחה שלי").slice(0, 80),
  };

  if (!premium) {
    saved.loans = prev.loans || [];
    saved.accounts =
      Array.isArray(prev.accounts) && prev.accounts.length > 0 ? prev.accounts : incoming.accounts;
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ data: saved, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const familyName = String(saved.familyName || "המשפחה שלי");
  await supabase.from("profiles").update({ family_name: familyName, updated_at: new Date().toISOString() }).eq("id", user.id);

  return NextResponse.json({ ok: true, isPremium: premium });
}
