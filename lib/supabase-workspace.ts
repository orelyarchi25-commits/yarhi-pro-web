import { getSupabase } from "@/lib/supabase";
import {
  parseWorkspaceFromFirestore,
  type UserWorkspaceSnapshot,
} from "@/lib/user-workspace-firestore";

/** טוען workspace של המשתמש המחובר מ-Supabase */
export async function loadWorkspaceFromSupabase(
  userId: string
): Promise<Partial<UserWorkspaceSnapshot> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("workspaces").select("data").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("[Yarhi Pro] Supabase loadWorkspace:", error.message);
    return null;
  }
  if (!data) return null;
  return parseWorkspaceFromFirestore((data as { data: unknown }).data);
}

/** שומר workspace ל-Supabase (upsert) */
export async function saveWorkspaceToSupabase(
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("workspaces").upsert({
    user_id: userId,
    data: payload,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[Yarhi Pro] Supabase saveWorkspace:", error.message);
    throw error;
  }
}
