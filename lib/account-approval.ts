/**
 * אישור גישה על ידי מנהל (Firestore: users/{uid}.accountApproved).
 * - false = חשבון ממתין — אין גישה לאפליקציה עד אישור ב-Firestore Console (או עריכה ידנית).
 * - true = אושר.
 * - חסר (משתמשים ישנים לפני התכונה) = נחשב כאושר כדי לא לנעול רישומים קיימים.
 */
export function isAccountApprovedFromUserDoc(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.accountApproved === false) return false;
  return true;
}
