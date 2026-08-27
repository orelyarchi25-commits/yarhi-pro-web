import { getSupabase } from "@/lib/supabase";
import { getAccountAccessState, type AccountAccessBlockReason } from "@/lib/account-approval";
import { TERMS_VERSION } from "@/lib/terms";

export type ContractorProfile = {
  id: string;
  email: string;
  businessName: string;
  contractorName: string;
  phone: string;
  registrationPlan: string;
  paymentMethod: string;
  paymentProofFileName: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  accountApproved: boolean;
  accessValidUntil: string | null;
};

export type RegisterContractorInput = {
  email: string;
  password: string;
  businessName: string;
  contractorName: string;
  phone: string;
  registrationPlan: string;
  paymentMethod: string;
  paymentProofFileName: string | null;
};

function rowToProfile(row: Record<string, unknown>): ContractorProfile {
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    businessName: String(row.business_name ?? ""),
    contractorName: String(row.contractor_name ?? ""),
    phone: String(row.phone ?? ""),
    registrationPlan: String(row.registration_plan ?? ""),
    paymentMethod: String(row.payment_method ?? ""),
    paymentProofFileName: row.payment_proof_file_name != null ? String(row.payment_proof_file_name) : null,
    termsAcceptedAt: row.terms_accepted_at != null ? String(row.terms_accepted_at) : null,
    termsVersion: row.terms_version != null ? String(row.terms_version) : null,
    accountApproved: row.account_approved === true,
    accessValidUntil: row.access_valid_until != null ? String(row.access_valid_until) : null,
  };
}

/** ממפה פרופיל Supabase לפורמט getAccountAccessState */
export function profileToAccessDoc(profile: ContractorProfile | null): Record<string, unknown> | undefined {
  if (!profile) return undefined;
  return {
    termsAcceptedAt: profile.termsAcceptedAt,
    accountApproved: profile.accountApproved,
    accessValidUntil: profile.accessValidUntil
      ? { seconds: Math.floor(new Date(profile.accessValidUntil).getTime() / 1000) }
      : null,
  };
}

export function getProfileAccess(profile: ContractorProfile | null): {
  terms: boolean;
  approved: boolean;
  blockReason: AccountAccessBlockReason | null;
  accessUntilMillis: number | null;
} {
  const doc = profileToAccessDoc(profile);
  const access = getAccountAccessState(doc);
  return {
    terms: Boolean(profile?.termsAcceptedAt),
    approved: access.allowed,
    blockReason: access.blockReason,
    accessUntilMillis: profile?.accessValidUntil ? new Date(profile.accessValidUntil).getTime() : null,
  };
}

export async function fetchOwnProfile(userId: string): Promise<ContractorProfile | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[Yarhi Pro] Supabase fetchOwnProfile:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToProfile(data as Record<string, unknown>);
}

export async function registerContractorOnSupabase(input: RegisterContractorInput): Promise<{
  userId: string;
  accessToken: string | null;
}> {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  const { data: authData, error: authErr } = await sb.auth.signUp({
    email: input.email,
    password: input.password,
  });
  if (authErr) throw authErr;
  const user = authData.user;
  if (!user) throw new Error("SUPABASE_SIGNUP_NO_USER");

  const nowIso = new Date().toISOString();
  const { error: profileErr } = await sb.from("profiles").insert({
    id: user.id,
    email: input.email,
    business_name: input.businessName,
    contractor_name: input.contractorName,
    phone: input.phone,
    registration_plan: input.registrationPlan,
    payment_method: input.paymentMethod,
    payment_proof_file_name: input.paymentProofFileName,
    terms_accepted_at: nowIso,
    terms_version: TERMS_VERSION,
    account_approved: false,
  });
  if (profileErr) {
    console.error("[Yarhi Pro] Supabase profile insert:", profileErr.message);
    throw profileErr;
  }

  await sb.from("workspaces").upsert({ user_id: user.id, data: {}, updated_at: nowIso });

  return {
    userId: user.id,
    accessToken: authData.session?.access_token ?? null,
  };
}

export async function signInContractorOnSupabase(email: string, password: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("SUPABASE_SIGNIN_NO_USER");

  const nowIso = new Date().toISOString();
  const existing = await fetchOwnProfile(data.user.id);
  if (!existing) {
    const { error: insertErr } = await sb.from("profiles").insert({
      id: data.user.id,
      email,
      terms_accepted_at: nowIso,
      terms_version: TERMS_VERSION,
      account_approved: false,
    });
    if (insertErr) console.error("[Yarhi Pro] Supabase profile bootstrap:", insertErr.message);
  } else {
    const { error: updateErr } = await sb
      .from("profiles")
      .update({
        terms_accepted_at: nowIso,
        terms_version: TERMS_VERSION,
        updated_at: nowIso,
      })
      .eq("id", data.user.id);
    if (updateErr) console.error("[Yarhi Pro] Supabase terms update:", updateErr.message);
  }

  return data.user.id;
}

export async function signOutSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export function supabaseAuthErrorMessageHe(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "אימייל או סיסמה שגויים.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "האימייל כבר רשום. נסה להתחבר או «שכחתי סיסמה».";
  if (m.includes("email not confirmed")) return "יש לאשר את האימייל לפני התחברות (בדוק תיבת דואר).";
  if (m.includes("password")) return "הסיסמה אינה תקינה או חלשה מדי.";
  return message || "שגיאת התחברות. נסה שוב.";
}
