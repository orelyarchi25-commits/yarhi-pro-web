import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";
import { getSupabaseAdmin, hasSupabaseAdminCredentials } from "@/lib/supabase-admin";
import { USER_WORKSPACE_FIELD } from "@/lib/user-workspace-firestore";
import { normalizeLoginEmail } from "@/lib/normalize-email";

export async function emailFromCloudTokens(body: Record<string, unknown>): Promise<string | null> {
  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  if (accessToken && hasSupabaseAdminCredentials()) {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data, error } = await sb.auth.getUser(accessToken);
      if (!error && data.user?.email) return normalizeLoginEmail(data.user.email);
    }
  }

  if (idToken && hasFirebaseAdminCredentials()) {
    try {
      const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(idToken);
      if (decoded.email) return normalizeLoginEmail(decoded.email);
    } catch {
      /* ignore */
    }
  }

  return null;
}

export async function readBothWorkspacesForEmail(email: string): Promise<{
  firebase: Record<string, unknown> | null;
  supabase: Record<string, unknown> | null;
  firebaseUid: string | null;
  supabaseUserId: string | null;
}> {
  let firebase: Record<string, unknown> | null = null;
  let supabase: Record<string, unknown> | null = null;
  let firebaseUid: string | null = null;
  let supabaseUserId: string | null = null;

  if (hasFirebaseAdminCredentials()) {
    try {
      const app = getFirebaseAdminApp();
      const user = await getAuth(app).getUserByEmail(email);
      firebaseUid = user.uid;
      const snap = await getFirestore(app).collection("users").doc(user.uid).get();
      const raw = snap.data()?.[USER_WORKSPACE_FIELD];
      if (raw && typeof raw === "object") firebase = raw as Record<string, unknown>;
    } catch {
      /* אין משתמש Firebase */
    }
  }

  if (hasSupabaseAdminCredentials()) {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data: profile } = await sb.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (profile?.id) {
        supabaseUserId = profile.id;
        const { data: ws } = await sb.from("workspaces").select("data").eq("user_id", profile.id).maybeSingle();
        const raw = ws && (ws as { data?: unknown }).data;
        if (raw && typeof raw === "object") supabase = raw as Record<string, unknown>;
      }
    }
  }

  return { firebase, supabase, firebaseUid, supabaseUserId };
}

export async function writeBothWorkspacesForEmail(
  email: string,
  payload: Record<string, unknown>
): Promise<{ firebase: boolean; supabase: boolean }> {
  const wrote = { firebase: false, supabase: false };
  const ids = await readBothWorkspacesForEmail(email);

  if (hasFirebaseAdminCredentials() && ids.firebaseUid) {
    try {
      await getFirestore(getFirebaseAdminApp())
        .collection("users")
        .doc(ids.firebaseUid)
        .set({ [USER_WORKSPACE_FIELD]: payload, email, updatedAt: new Date().toISOString() }, { merge: true });
      wrote.firebase = true;
    } catch (err) {
      console.error("[workspace] firebase write:", err);
    }
  }

  if (hasSupabaseAdminCredentials() && ids.supabaseUserId) {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { error } = await sb.from("workspaces").upsert({
        user_id: ids.supabaseUserId,
        data: payload,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("[workspace] supabase write:", error.message);
      else wrote.supabase = true;
    }
  }

  return wrote;
}
