/**
 * ניקוי אימייל לפני Auth/Firestore:
 * רווחים, אותיות קטנות, Unicode מנורמל, הסרת תווי כיווניות (לעיתים מודבקים מווטסאפ/מייל).
 */
export function normalizeLoginEmail(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}
