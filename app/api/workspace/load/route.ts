import { NextRequest, NextResponse } from "next/server";
import { emailFromCloudTokens, readBothWorkspacesForEmail } from "@/lib/workspace-cloud-admin";
import { mergeWorkspacePayloads } from "@/lib/merge-workspace";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = await emailFromCloudTokens(o);
  if (!email) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const { firebase, supabase } = await readBothWorkspacesForEmail(email);
  const workspace = mergeWorkspacePayloads([firebase, supabase]);
  return NextResponse.json({ ok: true, workspace, email });
}
