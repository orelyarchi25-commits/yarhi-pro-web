import { getFirebaseAuth } from "@/lib/firebase";
import { getSupabase } from "@/lib/supabase";

export async function getCloudAuthTokens(): Promise<{ idToken: string; accessToken: string }> {
  let idToken = "";
  let accessToken = "";
  try {
    const user = getFirebaseAuth()?.currentUser;
    if (user) idToken = await user.getIdToken();
  } catch {
    /* ignore */
  }
  try {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb.auth.getSession();
      accessToken = data.session?.access_token || "";
    }
  } catch {
    /* ignore */
  }
  return { idToken, accessToken };
}

/** שומר workspace לשני העננים (Firebase + Supabase) לפי האימייל של המחובר. */
export async function persistWorkspaceToBothClouds(
  workspace: Record<string, unknown>
): Promise<void> {
  const { idToken, accessToken } = await getCloudAuthTokens();
  if (!idToken && !accessToken) {
    throw new Error("no session");
  }

  const res = await fetch("/api/workspace/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, idToken, accessToken }),
  });
  if (!res.ok) {
    throw new Error(`workspace save ${res.status}`);
  }
}

export async function loadWorkspaceFromBothClouds(): Promise<Record<string, unknown> | null> {
  const { idToken, accessToken } = await getCloudAuthTokens();
  if (!idToken && !accessToken) return null;
  const res = await fetch("/api/workspace/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, accessToken }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { ok?: boolean; workspace?: Record<string, unknown> };
  if (!json?.ok || !json.workspace || typeof json.workspace !== "object") return null;
  return json.workspace;
}
