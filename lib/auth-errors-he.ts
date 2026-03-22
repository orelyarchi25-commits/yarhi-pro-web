/** קוד שגיאה מ-Firebase Auth / Firestore / כללית */
export function getFirebaseErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const c = (err as { code?: string }).code;
  return typeof c === "string" ? c : undefined;
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
