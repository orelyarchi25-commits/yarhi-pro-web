import { NextRequest, NextResponse } from "next/server";
import { emailFromCloudTokens, readBothWorkspacesForEmail, writeBothWorkspacesForEmail } from "@/lib/workspace-cloud-admin";
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
  const workspace = o.workspace;
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    return NextResponse.json({ ok: false, reason: "invalid_workspace" }, { status: 400 });
  }

  const email = await emailFromCloudTokens(o);
  if (!email) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const existing = await readBothWorkspacesForEmail(email);
  const payload = mergeWorkspacePayloads([
    existing.firebase,
    existing.supabase,
    workspace as Record<string, unknown>,
  ]);
  payload.cloudSavedAt = new Date().toISOString();

  const wrote = await writeBothWorkspacesForEmail(email, payload);
  if (!wrote.firebase && !wrote.supabase) {
    return NextResponse.json({ ok: false, reason: "write_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...wrote });
}
