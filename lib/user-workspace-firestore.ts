import type { CrmProject, Transaction } from "@/app/components/BusinessView";

/** מפתח אחד תחת users/{uid} — לא לדרוס שדות פרופיל בשורש */
export const USER_WORKSPACE_FIELD = "yarhiWorkspace";

export type FenceSegmentDraft = { id: number; L: number; H: number; P?: number };

/** שדות מסך «הגדרות עסק» – נשמרים בענן יחד עם שאר ה-workspace */
export const BUSINESS_SETTINGS_KEYS = [
  "sysContractorName",
  "sysCompanyId",
  "sysPhone",
  "sysAddress",
  "sysEmail",
  "simCaption",
  "sysInstallPriceSqm",
  "sysTransportPrice",
  "sysSantafPrice",
  "sysLedPrice",
  "sysScrewPrice",
  "sysDripEdgePrice",
  "pricePerKg",
  "sellPricePerSqm",
  "sysFencePriceSqm",
  "sysFenceSetPrice",
  "sysJumboPrice",
] as const;

export type BusinessSettingsRecord = Partial<Record<(typeof BUSINESS_SETTINGS_KEYS)[number], string>>;

export type UserWorkspaceSnapshot = {
  crmProjects: CrmProject[];
  pergolaCalcDraft: Record<string, unknown>;
  fenceCalcDraft: {
    fenceCustName: string;
    fenceCustPhone: string;
    fenceCustAddress: string;
    fenceSegments: FenceSegmentDraft[];
    fenceInGround: boolean;
    fenceSlat: string;
    fenceGap: string;
    fenceColor: string;
    fenceSlatColor: string;
  };
  businessTransactions: Transaction[];
  logoDataUrl: string | null;
  businessSettings?: BusinessSettingsRecord;
};

/** מגבלת אורך ל־data URL של לוגו (Firestore + מסמך שלם ≤ 1MB) */
export const MAX_LOGO_CHARS = 280_000;

/** מסיר ערכים undefined לפני Firestore */
export function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function trimWorkspaceForSize(ws: Record<string, unknown>): Record<string, unknown> {
  const logo = ws.logoDataUrl;
  if (typeof logo === "string" && logo.length > MAX_LOGO_CHARS) {
    const { logoDataUrl: _, ...rest } = ws;
    return { ...rest, logoDataUrl: null, logoOmitted: true };
  }
  return ws;
}

export function parseWorkspaceFromFirestore(raw: unknown): Partial<UserWorkspaceSnapshot> | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const out: Partial<UserWorkspaceSnapshot> = {};
  if (Array.isArray(w.crmProjects)) out.crmProjects = w.crmProjects as CrmProject[];
  if (w.pergolaCalcDraft && typeof w.pergolaCalcDraft === "object")
    out.pergolaCalcDraft = w.pergolaCalcDraft as Record<string, unknown>;
  if (w.fenceCalcDraft && typeof w.fenceCalcDraft === "object")
    out.fenceCalcDraft = w.fenceCalcDraft as UserWorkspaceSnapshot["fenceCalcDraft"];
  if (Array.isArray(w.businessTransactions)) out.businessTransactions = w.businessTransactions as Transaction[];
  if ("logoDataUrl" in w) {
    out.logoDataUrl = typeof w.logoDataUrl === "string" ? w.logoDataUrl : null;
  }
  if (w.businessSettings && typeof w.businessSettings === "object")
    out.businessSettings = w.businessSettings as BusinessSettingsRecord;
  return out;
}
