import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";

/**
 * האם מוגדרים פרטי Firebase Admin (JSON או נתיב לקובץ).
 * לשימוש ב-route לפני קריאה ל-getFirebaseAdminApp.
 */
export function hasFirebaseAdminCredentials(): boolean {
  const j = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  return Boolean(j || p);
}

function resolveServiceAccountJson(): string {
  const jsonFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const pathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (jsonFromEnv) {
    return jsonFromEnv;
  }

  if (pathFromEnv) {
    const abs =
      pathFromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathFromEnv)
        ? pathFromEnv
        : join(process.cwd(), pathFromEnv.replace(/^\.\//, ""));
    if (!existsSync(abs)) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH: הקובץ לא נמצא: ${abs}`);
    }
    return readFileSync(abs, "utf8");
  }

  throw new Error(
    "הגדר FIREBASE_SERVICE_ACCOUNT_JSON או FIREBASE_SERVICE_ACCOUNT_PATH (ראה .env.local.example)"
  );
}

/** מפרק JSON של service account גם אם עטוף פעמיים / עם תווים עודפים ב-Vercel */
export function parseServiceAccountJson(raw: string): ServiceAccount {
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (!s) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON ריק");
  }

  // אם כל הערך עטוף כמחרוזת JSON אחת: "{\"type\":...}"
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const unwrapped = JSON.parse(s);
      if (typeof unwrapped === "string") s = unwrapped.trim();
      else if (unwrapped && typeof unwrapped === "object") return unwrapped as ServiceAccount;
    } catch {
      /* ממשיכים לניסוי הבא */
    }
  }

  const tryParse = (text: string): ServiceAccount | null => {
    try {
      let v: unknown = JSON.parse(text);
      if (typeof v === "string") {
        v = JSON.parse(v);
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as ServiceAccount;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(s);
  if (direct) return direct;

  // חותכים לאובייקט JSON הראשון `{ ... }` (מתקן trailing garbage אחרי JSON)
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = tryParse(s.slice(start, end + 1));
    if (sliced) return sliced;
  }

  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT_JSON לא תקין ב-Vercel (JSON שבור). עדכן את המשתנה או השתמש ב-Supabase לאישור קבלנים חדשים."
  );
}

/**
 * Firebase Admin (שרת בלבד).
 */
export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }
  const raw = resolveServiceAccountJson();
  const serviceAccount = parseServiceAccountJson(raw);
  return initializeApp({
    credential: cert(serviceAccount),
  });
}
