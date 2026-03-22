import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

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

/**
 * Firebase Admin (שרת בלבד).
 */
export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }
  const raw = resolveServiceAccountJson();
  const serviceAccount = JSON.parse(raw.trim());
  return initializeApp({
    credential: cert(serviceAccount),
  });
}
