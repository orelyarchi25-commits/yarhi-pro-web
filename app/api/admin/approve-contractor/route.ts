import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";
import { getSupabaseAdmin, hasSupabaseAdminCredentials } from "@/lib/supabase-admin";

type AccessPreset = "week" | "month" | "year" | "unlimited" | "custom";

function computeValidUntil(preset: AccessPreset, customIso: string | undefined): Date | "unlimited" | null {
  if (preset === "unlimited") return "unlimited";
  if (preset === "custom") {
    if (!customIso?.trim()) return null;
    const d = new Date(customIso.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date();
  if (preset === "week") d.setDate(d.getDate() + 7);
  else if (preset === "month") d.setMonth(d.getMonth() + 1);
  else if (preset === "year") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d;
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_APPROVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured", hint: "הגדר ADMIN_APPROVE_SECRET בשרת" }, { status: 503 });
  }
  if (!hasFirebaseAdminCredentials() && !hasSupabaseAdminCredentials()) {
    return NextResponse.json(
      { error: "server_misconfigured", hint: "חסר FIREBASE_SERVICE_ACCOUNT או SUPABASE_SERVICE_ROLE_KEY" },
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

  const emailOrUid = typeof o.emailOrUid === "string" ? o.emailOrUid.trim() : "";
  if (!emailOrUid) {
    return NextResponse.json({ error: "missing emailOrUid" }, { status: 400 });
  }

  const preset = o.accessPreset as AccessPreset;
  const allowed: AccessPreset[] = ["week", "month", "year", "unlimited", "custom"];
  if (!allowed.includes(preset)) {
    return NextResponse.json({ error: "invalid accessPreset" }, { status: 400 });
  }

  const customUntilIso = typeof o.customUntilIso === "string" ? o.customUntilIso : undefined;
  const until = computeValidUntil(preset, customUntilIso);
  if (until === null) {
    return NextResponse.json({ error: "invalid customUntilIso" }, { status: 400 });
  }

  try {
    // קודם מנסים Supabase (קבלנים חדשים), ואז Firebase (קיימים)
    if (hasSupabaseAdminCredentials()) {
      const sb = getSupabaseAdmin();
      if (sb) {
        let userId: string | null = null;
        let lookupErr: string | null = null;

        if (emailOrUid.includes("@")) {
          const emailLower = emailOrUid.toLowerCase();
          const { data: byEmail, error: profileLookupErr } = await sb
            .from("profiles")
            .select("id")
            .ilike("email", emailLower)
            .maybeSingle();
          if (profileLookupErr) {
            lookupErr = profileLookupErr.message;
            console.error("[approve-contractor] supabase profile lookup:", profileLookupErr.message);
          }
          userId = byEmail?.id ?? null;

          if (!userId) {
            const { data: listed, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
            if (error) {
              lookupErr = error.message;
              console.error("[approve-contractor] supabase listUsers:", error.message);
            } else if (listed?.users) {
              const found = listed.users.find((u) => (u.email ?? "").toLowerCase() === emailLower);
              userId = found?.id ?? null;
            }
          }
        } else {
          userId = emailOrUid;
        }

        if (userId) {
          const untilIso = until === "unlimited" ? null : until.toISOString();
          const now = new Date().toISOString();
          const patchFull: Record<string, unknown> = {
            account_approved: true,
            account_rejected: false,
            payment_proof_file_name: null,
            updated_at: now,
            access_valid_until: untilIso,
          };
          let updErrMsg: string | null = null;
          const first = await sb.from("profiles").update(patchFull).eq("id", userId).select("id").maybeSingle();
          let updated = first.data;
          if (first.error) {
            updErrMsg = first.error.message;
            const patchMin: Record<string, unknown> = {
              account_approved: true,
              payment_proof_file_name: null,
              updated_at: now,
              access_valid_until: untilIso,
            };
            const second = await sb.from("profiles").update(patchMin).eq("id", userId).select("id").maybeSingle();
            if (second.error) {
              console.error("[approve-contractor] supabase update:", second.error.message);
              return NextResponse.json(
                { error: "server_error", message: `Supabase: ${second.error.message}` },
                { status: 500 }
              );
            }
            updated = second.data;
            updErrMsg = null;
          }
          if (updErrMsg && !updated) {
            console.error("[approve-contractor] supabase update:", updErrMsg);
          }
          if (!updated) {
            // אין שורת profiles — ניצור מינימלית ואז נאשר
            const { error: insertErr } = await sb.from("profiles").upsert({
              id: userId,
              email: emailOrUid.includes("@") ? emailOrUid.toLowerCase() : "",
              account_approved: true,
              access_valid_until: until === "unlimited" ? null : until.toISOString(),
              updated_at: new Date().toISOString(),
            });
            if (insertErr) {
              console.error("[approve-contractor] supabase upsert:", insertErr.message);
              return NextResponse.json(
                { error: "server_error", message: `Supabase: ${insertErr.message}` },
                { status: 500 }
              );
            }
          }
          return NextResponse.json({
            ok: true,
            backend: "supabase",
            uid: userId,
            accessValidUntil: until === "unlimited" ? null : { iso: until.toISOString(), preset },
          });
        }

        // יש שגיאת חיבור/מפתח ל-Supabase — לא נופלים ל-Firebase עם הודעה מבלבלת
        if (lookupErr) {
          return NextResponse.json(
            {
              error: "server_error",
              message: `Supabase: ${lookupErr}. בדוק SUPABASE_SERVICE_ROLE_KEY ב-Vercel.`,
            },
            { status: 500 }
          );
        }
        // משתמש לא נמצא ב-Supabase — ננסה Firebase למשתמשים ישנים
      }
    }

    if (!hasFirebaseAdminCredentials()) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    let app;
    try {
      app = getFirebaseAdminApp();
    } catch (initErr: unknown) {
      const msg = initErr instanceof Error ? initErr.message : String(initErr);
      return NextResponse.json(
        {
          error: "server_error",
          message: `Firebase Admin לא נטען: ${msg}`,
        },
        { status: 500 }
      );
    }
    const auth = getAuth(app);
    const db = getFirestore(app);

    let uid: string;
    if (emailOrUid.includes("@")) {
      const u = await auth.getUserByEmail(emailOrUid);
      uid = u.uid;
    } else {
      await auth.getUser(emailOrUid);
      uid = emailOrUid;
    }

    const ref = db.doc(`users/${uid}`);
    const patch: Record<string, unknown> = {
      accountApproved: true,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (until === "unlimited") {
      patch.accessValidUntil = FieldValue.delete();
    } else {
      patch.accessValidUntil = Timestamp.fromDate(until);
    }

    await ref.set(patch, { merge: true });

    return NextResponse.json({
      ok: true,
      backend: "firebase",
      uid,
      accessValidUntil:
        until === "unlimited" ? null : { iso: until.toISOString(), preset },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[approve-contractor]", e);
    if (code === "auth/user-not-found") {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
