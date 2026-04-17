/** קוד שגיאה מ-Firebase Auth / Firestore / כללית */
export function getFirebaseErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;

  const msg = (err as { message?: string }).message;
  if (typeof msg === "string") {
    const msgLower = msg.toLowerCase();
    if (msgLower.includes("has-been-suspended")) return "auth/api-key-suspended";
    if (msgLower.includes("api key not valid")) return "auth/invalid-api-key";
  }

  const c = (err as { code?: string }).code;
  if (typeof c === "string") return c;

  if (typeof msg === "string") {
    const m = msg.match(/(auth\/[a-z0-9-]+)/i);
    if (m?.[1]) return m[1].toLowerCase();
  }

  return undefined;
}

/** הודעות שגיאה בעברית ל-Firebase Auth */
export function firebaseAuthErrorMessageHe(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-email":
      return "כתובת האימייל אינה תקינה.";
    case "auth/user-disabled":
      return "החשבון הושבת. פנה לתמיכה.";
    case "auth/user-not-found":
      return "לא נמצא משתמש עם האימייל הזה.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "אימייל או סיסמה שגויים. אם החשבון קיים – נסה »שכחתי סיסמה« או ודא שאין רווחים באימייל.";
    case "permission-denied":
      return "אין הרשאה לעדכן נתונים בענן (Firestore Rules). ההתחברות אמורה לעבוד – נסה לרענן; אם נתקע, בדוק Rules ב-Firebase.";
    case "auth/too-many-requests":
      return "יותר מדי ניסיונות. נסה שוב מאוחר יותר.";
    case "auth/email-already-in-use":
      return "האימייל כבר רשום. אי אפשר לפתוח חשבון שני באותה כתובת. עבור ל«התחברות», או ל«שכחתי סיסמה» אם לא זוכר את הסיסמה.";
    case "auth/weak-password":
      return "הסיסמה חלשה מדי לפי Firebase.";
    case "auth/network-request-failed":
      return "בעיית רשת. בדוק חיבור לאינטרנט.";
    case "auth/operation-not-allowed":
      return "שיטת ההתחברות לא הופעלה בקונסולת Firebase.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
    case "auth/api-key-suspended":
      return "מפתח ה-API של Firebase לא תקין או הושעה. צור מפתח חדש ב-Firebase Console, עדכן אותו ב-.env.local (NEXT_PUBLIC_FIREBASE_API_KEY), ואז הפעל מחדש את האתר.";
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "קישור האיפוס פג תוקף או כבר שומש. בקש מייל חדש מ«שכחתי סיסמה» ופתח את הקישור פעם אחת בלבד (עדיף בגלישה בסתר).";
    case "auth/missing-email":
      return "חסר אימייל.";
    default:
      return code
        ? `שגיאה (${code}). נסה שוב או פנה לתמיכה.`
        : "אירעה שגיאה. נסה שוב או פנה לתמיכה.";
  }
}
