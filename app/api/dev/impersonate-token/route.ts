import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";

const DEFAULT_DEV_EMAIL = "yarchialuminum@gmail.com";

/**
 * רק ב־next dev: מחזיר Custom Token להתחברות כמשתמש קבוע (ברירת מחדל: מנהל).
 * דורש FIREBASE_SERVICE_ACCOUNT_JSON או FIREBASE_SERVICE_ACCOUNT_PATH ב־.env.local
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasFirebaseAdminCredentials()) {
    return NextResponse.json({ error: "No admin credentials" }, { status: 503 });
  }

  const email = (process.env.DEV_IMPERSONATE_EMAIL?.trim() || DEFAULT_DEV_EMAIL).toLowerCase();

  try {
    const auth = getAuth(getFirebaseAdminApp());
    const user = await auth.getUserByEmail(email);
    const customToken = await auth.createCustomToken(user.uid);
    return NextResponse.json({ customToken, email: user.email });
  } catch (err) {
    console.error("[api/dev/impersonate-token]", email, err);
    return NextResponse.json({ error: "getUserByEmail or createCustomToken failed" }, { status: 404 });
  }
}
