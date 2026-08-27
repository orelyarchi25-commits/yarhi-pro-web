/** איחוד רשימות CRM / תנועות ממחשב, טלפון ו-Firebase/Supabase בלי לאבד שורות. */

type NamedRow = {
  id?: unknown;
  customer?: unknown;
  date?: unknown;
  sellingPriceInc?: unknown;
  amount?: unknown;
  isLead?: unknown;
  isFence?: unknown;
  isBundle?: unknown;
  crmStatusSince?: unknown;
  formState?: unknown;
  description?: unknown;
};

function fingerprint(p: NamedRow): string {
  const fs = p.formState && typeof p.formState === "object" ? (p.formState as Record<string, unknown>) : {};
  return [
    String(p.customer ?? p.description ?? "").trim(),
    String(p.date ?? ""),
    String(p.sellingPriceInc ?? p.amount ?? ""),
    p.isBundle ? "B" : p.isFence ? "F" : p.isLead ? "L" : "P",
    String(fs.lengthWall ?? ""),
    String(fs.exitWidth ?? ""),
  ].join("|");
}

function recency(p: NamedRow): number {
  const t = Date.parse(String(p.crmStatusSince ?? ""));
  if (Number.isFinite(t)) return t;
  return typeof p.id === "number" ? p.id : 0;
}

function richness(p: NamedRow): number {
  try {
    return JSON.stringify(p.formState ?? {}).length;
  } catch {
    return 0;
  }
}

function pickBetter<T extends NamedRow>(a: T, b: T): T {
  const rb = recency(b) - recency(a);
  if (rb > 0) return b;
  if (rb < 0) return a;
  return richness(b) >= richness(a) ? b : a;
}

export function mergeNamedRows<T extends NamedRow>(lists: Array<T[] | null | undefined>): T[] {
  const byId = new Map<string, T>();
  const byFp = new Map<string, T>();

  const consider = (p: T) => {
    const fp = fingerprint(p);
    const idKey = p.id != null && String(p.id) !== "" ? String(p.id) : "";
    if (idKey && byId.has(idKey)) {
      byId.set(idKey, pickBetter(byId.get(idKey)!, p));
      return;
    }
    for (const [key, existing] of Array.from(byId.entries())) {
      if (fingerprint(existing) === fp) {
        byId.set(key, pickBetter(existing, p));
        return;
      }
    }
    if (byFp.has(fp)) {
      byFp.set(fp, pickBetter(byFp.get(fp)!, p));
      return;
    }
    if (idKey) byId.set(idKey, p);
    else byFp.set(fp, p);
  };

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row && typeof row === "object") consider(row);
    }
  }

  const out = [...Array.from(byId.values()), ...Array.from(byFp.values())];
  out.sort((a, b) => recency(b) - recency(a));
  return out;
}

export function mergeWorkspacePayloads(
  parts: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const defined = parts.filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object"));
  const crm = mergeNamedRows(defined.map((p) => p.crmProjects as NamedRow[]));
  const txs = mergeNamedRows(defined.map((p) => p.businessTransactions as NamedRow[]));
  const newest = defined[defined.length - 1] || {};
  const withSettings = [...defined].reverse().find((p) => p.businessSettings && typeof p.businessSettings === "object");
  const withLogo = [...defined].reverse().find((p) => typeof p.logoDataUrl === "string" && p.logoDataUrl);
  const withPergola = [...defined].reverse().find((p) => p.pergolaCalcDraft && typeof p.pergolaCalcDraft === "object");
  const withFence = [...defined].reverse().find((p) => p.fenceCalcDraft && typeof p.fenceCalcDraft === "object");
  const schedule = mergeNamedRows(defined.map((p) => p.scheduleJobs as NamedRow[]));
  const windows = mergeNamedRows(defined.map((p) => p.fieldWindowRecords as NamedRow[]));

  return {
    ...newest,
    crmProjects: crm,
    businessTransactions: txs,
    scheduleJobs: schedule,
    fieldWindowRecords: windows,
    ...(withSettings ? { businessSettings: withSettings.businessSettings } : {}),
    ...(withLogo ? { logoDataUrl: withLogo.logoDataUrl } : {}),
    ...(withPergola ? { pergolaCalcDraft: withPergola.pergolaCalcDraft } : {}),
    ...(withFence ? { fenceCalcDraft: withFence.fenceCalcDraft } : {}),
  };
}
