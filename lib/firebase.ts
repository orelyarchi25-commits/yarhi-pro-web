import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";

/**
 * העדף משתני סביבה (.env.local) — לא לשתף בגיט.
 * אם חסרים משתנים, נופלים להגדרה המוטמעת (לפיתוח).
 */
const EMBEDDED_CONFIG: FirebaseOptions = {
  apiKey: "AIzaSyAhIbGxhbr1BLYTzGC78OG5ozom0urN5Lk",
  authDomain: "yarhi-pro-d20d4.firebaseapp.com",
  projectId: "yarhi-pro-d20d4",
  storageBucket: "yarhi-pro-d20d4.firebasestorage.app",
  messagingSenderId: "744940773875",
  appId: "1:744940773875:web:03f5345c994c60f7ba7286",
  measurementId: "G-3WQE088GHX",
};

function getOptionsFromEnv(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

  if (
    !apiKey?.trim() ||
    !authDomain?.trim() ||
    !projectId?.trim() ||
    !appId?.trim()
  ) {
    return null;
  }

  return {
    apiKey: apiKey.trim(),
    authDomain: authDomain.trim(),
    projectId: projectId.trim(),
    storageBucket: storageBucket?.trim() || undefined,
    messagingSenderId: messagingSenderId?.trim() || undefined,
    appId: appId.trim(),
    measurementId: measurementId?.trim() || undefined,
  };
}

function getEffectiveOptions(): FirebaseOptions | null {
  return getOptionsFromEnv() ?? EMBEDDED_CONFIG;
}

export function isFirebaseConfigured(): boolean {
  return getEffectiveOptions() !== null;
}

/** להצגה ב-UI (תמיד מציג projectId אמיתי – מ-.env או מההגדרה המוטמעת) */
export function getFirebaseProjectIdForUi(): string {
  return getEffectiveOptions()?.projectId ?? "?";
}

/** true אם כל השדות הנדרשים מגיעים מ-.env (לא מגיבוי בקוד) */
export function isFirebaseConfigFromEnv(): boolean {
  return getOptionsFromEnv() !== null;
}

export function getFirebaseApp(): FirebaseApp | null {
  const options = getEffectiveOptions();
  if (!options) return null;
  if (!getApps().length) {
    return initializeApp(options);
  }
  return getApp();
}

let firebaseDb: Firestore | null = null;

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (firebaseDb) return firebaseDb;
  try {
    firebaseDb = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch {
    firebaseDb = getFirestore(app);
  }
  return firebaseDb;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}
