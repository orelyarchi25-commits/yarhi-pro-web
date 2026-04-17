const ADMIN_EMAILS = new Set<string>(["yarchialuminum@gmail.com"]);

export function normalizeEmailForAccess(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.has(normalizeEmailForAccess(email));
}
