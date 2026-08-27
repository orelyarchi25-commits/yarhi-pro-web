"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import BusinessView, { loadTransactions, type CrmProject, type Transaction } from "@/app/components/BusinessView";
import FieldWindowsView from "@/app/components/FieldWindowsView";
import ProductProjectBar from "@/app/components/ProductProjectBar";
import ScheduleView from "@/app/components/ScheduleView";
import { useAuth } from "@/components/AuthProvider";
import { ProfileIcon } from "@/components/ProfileIcon";
import { useSearchString } from "@/hooks/useSearchString";
import { getFirebaseDb } from "@/lib/firebase";
import { loadWorkspaceFromSupabase, saveWorkspaceToSupabase } from "@/lib/supabase-workspace";
import { persistWorkspaceToBothClouds } from "@/lib/workspace-cloud-save";
import { isAdminEmail } from "@/lib/admin-access";
import {
  BUSINESS_SETTINGS_KEYS,
  parseWorkspaceFromFirestore,
  sanitizeForFirestore,
  trimWorkspaceForSize,
  USER_WORKSPACE_FIELD,
  type ScheduleJob,
  type FieldWindowRecord,
} from "@/lib/user-workspace-firestore";
import {
  fieldWindowsLocalStorageKey,
  formatFieldWindowDate,
  getFieldWindowRecordIdFromProject,
  newFieldWindowRecordId,
  readFieldWindowsFromLocal,
} from "@/lib/field-windows";
import {
  buildBundleCustomerQuoteHtml,
  getActiveBundleUnitLabel,
} from "@/lib/bundle-customer-quote";
import { buildContractorSignatureHtml } from "@/lib/quote-signature";
import {
  newProjectUnitId,
  projectIsBundle,
  recalcBundleTotals,
  defaultFenceBundleFormState,
  defaultPergolaBundleFormState,
  fenceFormHasSegments,
  fenceResultFromSavedUnit,
  pergolaFormHasDimensions,
  pergolaResultFromSavedUnit,
  unitTypeForProductView,
  viewForUnitType,
  type BundleFormState,
  type ProjectUnit,
  type ProjectUnitType,
} from "@/lib/project-bundle";
import type { CrmStatus } from "@/lib/crm-status";
import {
  CRM_STATUS_LABELS,
  CRM_STATUS_SELECT_OPTIONS,
  CRM_STATUS_UI,
  DEFAULT_CRM_STATUS_AFTER_CALC_SAVE,
  countCrmStaleAlerts,
  crmLeadEntryShowsAsClient,
  crmProjectShowsLifecycleLeadClientPill,
  crmStatusRequiresPositiveDealIncVat,
  getCrmStaleAlertMessage,
  getCrmStatusLabel,
  parseCrmStatus,
} from "@/lib/crm-status";
import { compressImageFileToDataUrl } from "@/lib/compress-logo";
import {
  exVatFromIncVat,
  formatBusinessVatPercentLabel,
  incVatFromExVat,
  parseBusinessVatPercentString,
  vatFromIncVat,
} from "@/lib/vat";
import { EMPTY_FENCE_RESULT, type FenceCalcResult } from "@/lib/types/fence-calc";
import { EMPTY_PERGOLA_RESULT, type PergolaCalcResult } from "@/lib/types/pergola-calc";
import {
  appendPergolaShareUrlParams,
  buildDividerAccessoryStates,
  buildSimWhatsAppUrl,
  createShortShareUrl,
  encodeDividerStatesParam,
  ledToneFromColor,
  mergePergolaShareWithLive,
  openSimWhatsApp,
  requestLiveSimConfig,
  type LiveSimConfig,
  type ShareFenceConfig,
  type SharePergolaConfig,
  normPergolaShareEnv,
  normFenceShareEnv,
  normFenceShareGate,
} from "@/lib/share-sim";

type ViewId = "dashboard" | "data" | "fences" | "field-windows" | "3d" | "fence-3d" | "schedule" | "settings" | "business";
const VIEW_IDS: ViewId[] = ["dashboard", "data", "fences", "field-windows", "3d", "fence-3d", "schedule", "settings", "business"];
function parseView(v: string | null): ViewId {
  return (VIEW_IDS.includes(v as ViewId) ? v : "dashboard") as ViewId;
}
/** שינוי הערך אחרי עדכון public/sim.html — שובר מטמון דפדפן/CDN */
const SIM_VERSION = "fence-zigzag-v12";

type FenceSide = "left" | "right";
type FenceSegRow = {
  id: number;
  L: number;
  H: number;
  P?: number;
  connected?: boolean;
  corner?: boolean;
  /** צד בחצר — רק למקטע ראשי (לא פינה/המשך) */
  side?: FenceSide;
};

/** פינה 90° — connected בלי corner:false (תאימות לאחור) */
function fenceSegIsCorner(s: { connected?: boolean; corner?: boolean }) {
  return !!s.connected && s.corner !== false;
}
/** המשך באותו כיוון — גובה/אורך משתנים בלי סיבוב */
function fenceSegIsContinue(s: { connected?: boolean; corner?: boolean }) {
  return !!s.connected && s.corner === false;
}

function emptyFenceFronts(): FenceSegRow[] {
  return [{ id: Date.now(), L: 0, H: 0, side: "left" }];
}

function fenceRunRootIndex(segs: { connected?: boolean }[], index: number): number {
  let root = index;
  while (root > 0 && segs[root]?.connected) root -= 1;
  return root;
}

/** צד המקטע בהדמיה — לפי בחירה, או ברירת מחדל (ראשון=שמאל) */
function fenceSegSideOf(
  segs: { connected?: boolean; side?: FenceSide }[],
  index: number
): FenceSide {
  const root = fenceRunRootIndex(segs, index);
  const explicit = segs[root]?.side;
  if (explicit === "left" || explicit === "right") return explicit;
  let rootsBefore = 0;
  for (let i = 0; i < root; i++) {
    if (!segs[i]?.connected) rootsBefore += 1;
  }
  return rootsBefore === 0 ? "left" : "right";
}

function defaultSideForNewRoot(segs: { connected?: boolean; side?: FenceSide }[]): FenceSide {
  let hasLeft = false;
  let hasRight = false;
  segs.forEach((s, i) => {
    if (s.connected) return;
    const side = fenceSegSideOf(segs, i);
    if (side === "left") hasLeft = true;
    else hasRight = true;
  });
  if (!hasLeft) return "left";
  if (!hasRight) return "right";
  return "right";
}

type FenceSegLabel = {
  title: string;
  hint: string;
  tone: "left" | "right" | "front" | "side" | "continue" | "corner";
  runIdx: number;
  seq: number;
};

/** תיוג לפי בחירת שמאל/ימין (לא לפי סדר בלבד) */
function fenceSegLabel(
  segs: { connected?: boolean; corner?: boolean; side?: FenceSide }[],
  index: number,
  env: "villa" | "garden" = "villa"
): FenceSegLabel {
  const side = fenceSegSideOf(segs, index);
  const sideHeb = side === "left" ? "שמאל" : "ימין";
  let fronts = 0;
  let i = 0;
  let seq = 0;
  while (i < segs.length) {
    const runIdx = fronts;
    seq += 1;
    if (i === index) {
      if (env === "garden") {
        return {
          title: runIdx === 0 ? "חזית" : `חזית ${runIdx + 1}`,
          hint: "מקטע בחזית",
          tone: "front",
          runIdx,
          seq,
        };
      }
      return {
        title: side === "left" ? "צד שמאל" : "צד ימין",
        hint: "לחץ שמאל או ימין למטה",
        tone: side,
        runIdx,
        seq,
      };
    }
    fronts += 1;
    i += 1;
    let sideInRun = 0;
    let continueInRun = 0;
    while (i < segs.length && segs[i]?.connected) {
      seq += 1;
      if (i === index) {
        if (fenceSegIsContinue(segs[i]!)) {
          return {
            title: `המשך · ${sideHeb}`,
            hint: "אותו כיוון · עמוד משותף",
            tone: "continue",
            runIdx,
            seq,
          };
        }
        if (sideInRun === 0) {
          return {
            title: `פינה · ${sideHeb} לבית`,
            hint: "סיבוב 90° לכיוון הבית",
            tone: "side",
            runIdx,
            seq,
          };
        }
        return {
          title: `פינה · ${sideHeb}`,
          hint: "המשך לאורך הבית",
          tone: "corner",
          runIdx,
          seq,
        };
      }
      if (fenceSegIsContinue(segs[i]!)) continueInRun += 1;
      else sideInRun += 1;
      i += 1;
    }
  }
  return { title: `מקטע ${index + 1}`, hint: "", tone: "front", runIdx: 0, seq: index + 1 };
}

function fenceSegTitle(
  segs: { connected?: boolean; corner?: boolean; side?: FenceSide }[],
  index: number,
  env: "villa" | "garden" = "villa"
): string {
  return fenceSegLabel(segs, index, env).title;
}

function fenceSegToneClass(tone: FenceSegLabel["tone"]): string {
  switch (tone) {
    case "left":
      return "border-sky-400 bg-sky-50";
    case "right":
      return "border-amber-400 bg-amber-50";
    case "side":
      return "border-violet-300 bg-violet-50";
    case "continue":
      return "border-sky-300 bg-white";
    case "corner":
      return "border-emerald-300 bg-white";
    default:
      return "border-slate-200 bg-white";
  }
}

function withFenceSide(s: FenceSegRow): Partial<FenceSegRow> {
  if (s.connected) return {};
  if (s.side === "left" || s.side === "right") return { side: s.side };
  return {};
}

function fenceSegsForApi(segs: FenceSegRow[]) {
  return segs
    .filter((s) => s.L > 0 && s.H > 0 && (s.P ?? 0) >= 0)
    .map((s) => ({
      L: s.L,
      H: s.H,
      P: typeof s.P === "number" ? s.P : undefined,
      ...(s.connected ? { connected: true as const } : {}),
      ...(fenceSegIsContinue(s) ? { corner: false as const } : {}),
      ...(s.connected && s.corner === true ? { corner: true as const } : {}),
      ...withFenceSide(s),
    }));
}

function fenceSegsForSim(segs: FenceSegRow[]) {
  return segs
    .map((s, idx) => ({
      s,
      side: !s.connected ? fenceSegSideOf(segs, idx) : undefined,
    }))
    .filter(({ s }) => (s.L ?? 0) > 0 && (s.H ?? 0) > 0)
    .map(({ s, side }) => ({
      L: s.L,
      H: s.H,
      P: typeof s.P === "number" ? s.P : 0,
      connected: !!s.connected,
      ...(fenceSegIsContinue(s) ? { corner: false as const } : {}),
      ...(fenceSegIsCorner(s) ? { corner: true as const } : {}),
      ...(side ? { side } : {}),
    }));
}

function fenceSegsForFormState(segs: FenceSegRow[]) {
  return segs
    .filter((s) => s.L > 0 && s.H > 0)
    .map((s) => ({
      L: s.L,
      H: s.H,
      P: s.P,
      ...(s.connected ? { connected: true as const } : {}),
      ...(fenceSegIsContinue(s) ? { corner: false as const } : {}),
      ...(s.connected && s.corner === true ? { corner: true as const } : {}),
      ...withFenceSide(s),
    }));
}

function scheduleLocalStorageKey(uid: string) {
  return `yarhi_schedule_${uid}`;
}

function readScheduleJobsFromLocal(uid: string): ScheduleJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scheduleLocalStorageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ScheduleJob[]) : [];
  } catch {
    return [];
  }
}

/** עדיפות לענן; אם בענן ריק — לא לדרוס נתונים מקומיים */
function resolveScheduleJobsOnLoad(uid: string, rawWs: unknown, parsed: ReturnType<typeof parseWorkspaceFromFirestore>): ScheduleJob[] {
  const fromCloud = Array.isArray((rawWs as Record<string, unknown> | undefined)?.scheduleJobs)
    ? ((rawWs as Record<string, unknown>).scheduleJobs as ScheduleJob[])
    : parsed?.scheduleJobs;
  const fromLocal = readScheduleJobsFromLocal(uid);
  if (fromCloud && fromCloud.length > 0) return fromCloud;
  if (fromLocal.length > 0) return fromLocal;
  return fromCloud ?? [];
}

function resolveFieldWindowsOnLoad(
  uid: string,
  rawWs: unknown,
  parsed: ReturnType<typeof parseWorkspaceFromFirestore>
): FieldWindowRecord[] {
  const fromCloud = Array.isArray((rawWs as Record<string, unknown> | undefined)?.fieldWindowRecords)
    ? ((rawWs as Record<string, unknown>).fieldWindowRecords as FieldWindowRecord[])
    : parsed?.fieldWindowRecords;
  const fromLocal = readFieldWindowsFromLocal(uid);
  if (fromCloud && fromCloud.length > 0) return fromCloud;
  if (fromLocal.length > 0) return fromLocal;
  return fromCloud ?? [];
}

// --- Constants: RAL colors (same order as original) ---
const RAL_OPTIONS = [
  "RAL 9016", "RAL 9010", "RAL 1013", "RAL 1015", "RAL 9006", "RAL 9007", "RAL 7035", "RAL 7037", "RAL 7040",
  "RAL 7016", "RAL 7021", "RAL 7024", "RAL 9005", "RAL 8011", "RAL 8014", "RAL 8017", "RAL 8028", "RAL 6005",
  "RAL 6009", "RAL 5010", "RAL 5014", "RAL 5024", "RAL 3005", "RAL 3020", "RAL 1001", "RAL 1019", "RAL 4005",
  "RAL 6019", "RAL 7006", "RAL 7032", "RAL 7039", "RAL 9001", "RAL 9002", "עץ", "ברזל בלגי (Iron)",
];

const RAL_LABELS: Record<string, string> = {
  "RAL 9016": "RAL 9016 - לבן תעבורה",
  "RAL 9010": "RAL 9010 - לבן טהור",
  "RAL 1013": "RAL 1013 - לבן צדף",
  "RAL 1015": "RAL 1015 - שנהב בהיר",
  "RAL 9006": "RAL 9006 - אלומיניום לבן",
  "RAL 9007": "RAL 9007 - אפור אלומיניום",
  "RAL 7035": "RAL 7035 - אפור בהיר",
  "RAL 7037": "RAL 7037 - אפור אבק",
  "RAL 7040": "RAL 7040 - אפור חלון",
  "RAL 7016": "RAL 7016 - אפור אנטרציט",
  "RAL 7021": "RAL 7021 - אפור שחור",
  "RAL 7024": "RAL 7024 - אפור גרפיט",
  "RAL 9005": "RAL 9005 - שחור ג'ט",
  "RAL 8011": "RAL 8011 - חום אגוז",
  "RAL 8014": "RAL 8014 - חום ספיה",
  "RAL 8017": "RAL 8017 - חום שוקולד",
  "RAL 8028": "RAL 8028 - חום טרה",
  "RAL 6005": "RAL 6005 - ירוק טחב",
  "RAL 6009": "RAL 6009 - ירוק אשוח",
  "RAL 5010": "RAL 5010 - כחול ג'נטיאנה",
  "RAL 5014": "RAL 5014 - כחול יונה",
  "RAL 5024": "RAL 5024 - כחול פסטל",
  "RAL 3005": "RAL 3005 - אדום יין",
  "RAL 3020": "RAL 3020 - אדום תעבורה",
  "RAL 1001": "RAL 1001 - בז'",
  "RAL 1019": "RAL 1019 - אפור בז'",
  "RAL 4005": "RAL 4005 - לילך כחול",
  "RAL 6019": "RAL 6019 - ירוק פסטל",
  "RAL 7006": "RAL 7006 - אפור בז'",
  "RAL 7032": "RAL 7032 - אפור גס",
  "RAL 7039": "RAL 7039 - אפור קוורץ",
  "RAL 9001": "RAL 9001 - קרם",
  "RAL 9002": "RAL 9002 - אפור לבן",
  "עץ": "עץ - עיצוב עץ",
  "ברזל בלגי (Iron)": "ברזל בלגי (Iron)",
};
function getRalLabel(ral: string): string {
  return RAL_LABELS[ral] ?? ral;
}

/** טלפון לקוח מטיוטה — לא למלא בדוגמה ישנה מהממשק / אחסון */
function draftCustomerPhoneFromStorage(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (digits === "0522288798" || digits === "522288798" || digits === "972522288798") return "";
  return s;
}

type VitrineProfile = "7000" | "9000";
type VitrineOpening = {
  id: number;
  widthCm: string;
  heightCm: string;
  profile: VitrineProfile;
  note: string;
};

function createVitrineOpening(idSeed = Date.now()): VitrineOpening {
  return { id: idSeed, widthCm: "", heightCm: "", profile: "7000", note: "" };
}

/** אם בלוח המקומי יש לקוחות שהענן לא מכיר — לא לדרוס אותם (פיתוח מול אתר חי). */
function isRicherCrmList(local: unknown, cloud: unknown): boolean {
  if (!Array.isArray(local) || local.length === 0) return false;
  if (!Array.isArray(cloud)) return true;
  if (local.length > cloud.length) return true;
  const cloudNames = new Set(
    cloud.map((p) => String((p as { customer?: string })?.customer || "").trim()).filter(Boolean)
  );
  return local.some((p) => {
    const name = String((p as { customer?: string })?.customer || "").trim();
    return name.length > 0 && !cloudNames.has(name);
  });
}

function readLocalCrmList(): unknown[] {
  try {
    const raw = localStorage.getItem("yarhi_crm_data");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalTxList(): unknown[] {
  try {
    const raw = localStorage.getItem("yarchiTransactions");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** טלפון לקוח לחיפוש בטבלת CRM (ליד / פרגולה / גדר) */
function getCrmProjectPhoneForSearch(p: CrmProject): string {
  const fs = (p.formState ?? {}) as Record<string, unknown>;
  if (p.isLead) return String(fs.leadPhone ?? "");
  if (p.isFence) return String(fs.fenceCustPhone ?? "");
  return String(fs.custPhone ?? "");
}

/** טקסט חופשי לתוך HTML בהצעת מחיר (מניעת שבירת מבנה) */
function escapeHtmlForQuote(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** ערך לתוך מרכאות כפולות ב-attribute (href וכו׳) */
function escapeHtmlAttrForQuote(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const PERGOLA_IDS = [
  "custName", "custPhone", "custAddress", "custInternalNotes", "lengthWall", "exitWidth", "isLShape", "lWallWidth", "lWallDepth", "lShapeSide",
  "colorSelect", "shadeColorSelect", "frameType", "dividerSize", "dividerSmoothCount", "dividerLedCount", "shadingProfile",
  "spacing", "pricePerKg", "hasLed", "ledCount", "ledColor", "hasFan", "fanCount", "hasSantaf", "santafColor", "dripEdgeType",
  "sellPricePerSqm", "postCount", "postCountFront", "postCountRight", "postCountLeft", "postCountBack", "postHeight", "postType", "tensionerCount", "tensionerColor",
];

/** שער ללא useSearchParams – מונע תקיעת Suspense לפני אתחול Auth (Next.js) */
function HomeGate() {
  const {
    isLoggedIn,
    hasAcceptedTerms,
    accountApproved,
    accountBlockReason,
    authReady,
    profileLoading,
    firebaseUser,
    supabaseUser,
    logout,
    refreshAccountAccess,
    cloudBackend,
  } = useAuth();

  const accountEmail = supabaseUser?.email ?? firebaseUser?.email ?? null;
  const hasCloudAccount = Boolean(supabaseUser || firebaseUser);

  if (!authReady || (isLoggedIn && profileLoading)) {
    const isDev = process.env.NODE_ENV === "development";
    return (
      <main
        className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-4 p-6"
        style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc" }}
        dir="rtl"
      >
        <div
          className="h-10 w-10 rounded-full border-2 border-slate-600 border-t-blue-400 animate-spin"
          aria-hidden
        />
        <p className="text-xl font-bold">טוען…</p>
        <p className="text-sm text-slate-400 text-center max-w-sm leading-relaxed">
          {isLoggedIn && profileLoading
            ? "טוען את פרטי החשבון מהענן…"
            : "מאמתים התחברות…"}
        </p>
        {isDev && (
          <p className="text-xs text-slate-500 text-center max-w-md leading-relaxed border border-slate-700 rounded-xl px-4 py-2 bg-slate-800/50">
            מצב פיתוח: אחרי שינוי קוד, ה־bundler של Next.js צריך לקמפל מחדש – פעם ראשונה זה יכול לקחת כמה שניות.
            בפרודקשן האתר נטען מהר יותר.
          </p>
        )}
      </main>
    );
  }

  if (isLoggedIn && hasAcceptedTerms && !accountApproved && hasCloudAccount) {
    const expired = accountBlockReason === "expired";
    return (
      <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6" dir="rtl">
        <div
          className={`w-full max-w-xl rounded-3xl border shadow-2xl p-8 md:p-10 text-center space-y-4 bg-slate-800/95 ${
            expired ? "border-amber-600/50" : "border-sky-600/50"
          }`}
        >
          <h1 className={`text-2xl md:text-3xl font-black ${expired ? "text-amber-300" : "text-sky-300"}`}>
            {expired ? "פג תוקף הגישה" : "החשבון ממתין לאישור"}
          </h1>
          {expired ? (
            <>
              <p className="text-slate-200 text-sm leading-relaxed">
                תוקף הגישה לחשבון הסתיים. לחידוש גישה יש לפנות למנהל המערכת.
              </p>
              <p className="text-slate-400 text-xs leading-relaxed">
                לאחר החידוש, רענן את הדף או התחבר מחדש.
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-200 text-sm leading-relaxed">
                ההרשמה התקבלה. <strong>הגישה למערכת תיפתח</strong> לאחר אישור ידני על ידי המנהל (לאחר תשלום / בדיקה).
              </p>
              <p className="text-slate-400 text-xs leading-relaxed">
                לאחר האישור, רענן את הדף או התחבר מחדש.
              </p>
            </>
          )}
          <p className="text-slate-500 text-xs">
            אימייל: <span className="font-mono text-slate-300">{accountEmail ?? "—"}</span>
            {cloudBackend ? (
              <span className="block mt-1 text-slate-600">מקור: {cloudBackend}</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => void refreshAccountAccess()}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 font-black text-white transition"
          >
            בדוק שוב אם אושרתי
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-black text-white transition"
          >
            התנתק
          </button>
        </div>
      </main>
    );
  }

  if (!isLoggedIn || !hasAcceptedTerms) {
    if (isLoggedIn && !hasAcceptedTerms && hasCloudAccount) {
      return (
        <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6" dir="rtl">
          <div className="w-full max-w-xl rounded-3xl border border-amber-600/50 bg-slate-800/95 shadow-2xl p-8 md:p-10 text-center space-y-4">
            <h1 className="text-2xl md:text-3xl font-black text-amber-300">מחובר – אבל אין אישור תקנון בענן</h1>
            <p className="text-slate-200 text-sm leading-relaxed">
              ההתחברות הצליחה, אבל כרגע לא ניתן להשלים את הגישה לחשבון.
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              נסה להתנתק ולהתחבר שוב בעוד רגע. אם הבעיה נמשכת, פנה לתמיכה.
            </p>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 font-black text-white transition"
            >
              התנתק ונסה שוב
            </button>
            <Link href="/login" className="block text-blue-300 font-bold hover:underline">
              מעבר לדף התחברות
            </Link>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-800/90 shadow-2xl p-8 md:p-10 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-blue-400 mb-3">Yarhi Pro</h1>
          <p className="text-slate-200 text-lg md:text-xl font-bold mb-2">גישה למערכת מותנית בהרשמה / התחברות ואישור תקנון מחייב</p>
          <p className="text-slate-400 text-sm md:text-base mb-8">ללא השלמת התהליך לא ניתן להמשיך לתוכנה.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link href="/login" className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 transition font-black">
              🔐 התחברות
            </Link>
            <Link href="/register" className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition font-black">
              📝 הרשמה
            </Link>
          </div>
          <div className="mt-4">
            <Link href="/terms" target="_blank" className="text-blue-300 underline hover:no-underline font-bold">
              צפייה בתקנון המחייב
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <AuthenticatedPageContent />;
}

export default function Page() {
  return <HomeGate />;
}

function AuthenticatedPageContent() {
  const router = useRouter();
  const searchString = useSearchString();
  const { logout, firebaseUser, supabaseUser, cloudUserId, cloudBackend, isAdmin } = useAuth();
  const isManagerUser = isAdmin || isAdminEmail(supabaseUser?.email ?? firebaseUser?.email);
  const currentView = parseView(new URLSearchParams(searchString).get("view"));
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const fenceSimIframeRef = useRef<HTMLIFrameElement | null>(null);
  const pergolaSimIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastLiveSimConfigRef = useRef<LiveSimConfig | null>(null);
  const lastUidRef = useRef<string | null>(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [hiddenCostsBox, setHiddenCostsBox] = useState(false);
  const [showPergolaPriceCompare, setShowPergolaPriceCompare] = useState(false);
  const [showFencePriceCompare, setShowFencePriceCompare] = useState(false);
  const [fenceHiddenCostsBox, setFenceHiddenCostsBox] = useState(false);
  const [kitOrderModal, setKitOrderModal] = useState<null | { kind: "pergola" | "fence" }>(null);
  const [pergolaSimLoaded, setPergolaSimLoaded] = useState(false);
  const [fenceSimLoaded, setFenceSimLoaded] = useState(false);
  const [pergolaSimEnv, setPergolaSimEnv] = useState<"villa" | "balcony" | "garden">("villa");
  const [fenceSimEnv, setFenceSimEnv] = useState<"villa" | "garden">("villa");
  const [fenceSimGate, setFenceSimGate] = useState<"none" | "single" | "double">("none");
  /** הסתרת פאנל מידות בהדמיית גדר (כמו «הסתר תפריט» בפרגולה) */
  const [fenceSimPanelVisible, setFenceSimPanelVisible] = useState(true);
  /** במובייל: גיליון "עוד" (הגדרות / פיננסי / התנתקות) */
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Pergola form state
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  /** תזכורות התקנה / חומר לביקור הבא — פנימי בלבד, לא בהצעת מחיר */
  const [custInternalNotes, setCustInternalNotes] = useState("");
  const [lengthWall, setLengthWall] = useState("");
  const [exitWidth, setExitWidth] = useState("");
  const [isLShape, setIsLShape] = useState(false);
  const [lWallWidth, setLWallWidth] = useState("");
  const [lWallDepth, setLWallDepth] = useState("");
  const [lShapeSide, setLShapeSide] = useState<"right" | "left">("right");
  const [colorSelect, setColorSelect] = useState("RAL 9016");
  const [shadeColorSelect, setShadeColorSelect] = useState("RAL 9016");
  const [frameType, setFrameType] = useState("doubleT");
  const [dividerSize, setDividerSize] = useState("120");
  const [dividerSmoothCount, setDividerSmoothCount] = useState("");
  const [dividerLedCount, setDividerLedCount] = useState("");
  const [shadingProfile, setShadingProfile] = useState("20x40");
  const [spacing, setSpacing] = useState("2");
  const [hasSantaf, setHasSantaf] = useState(false);
  const [santafColor, setSantafColor] = useState("שקוף");
  const [dripEdgeType, setDripEdgeType] = useState("wave2.5");
  const [hasLed, setHasLed] = useState(false);
  const [ledCount, setLedCount] = useState("");
  const [ledColor, setLedColor] = useState("לבן חם");
  const [hasFan, setHasFan] = useState(false);
  const [fanCount, setFanCount] = useState("");
  const [postCount, setPostCount] = useState("");
  const [postCountFront, setPostCountFront] = useState("");
  const [postCountRight, setPostCountRight] = useState("");
  const [postCountLeft, setPostCountLeft] = useState("");
  const [postCountBack, setPostCountBack] = useState("");
  const [postHeight, setPostHeight] = useState("");
  const [postType, setPostType] = useState("100");
  const [tensionerCount, setTensionerCount] = useState("");
  const [tensionerColor, setTensionerColor] = useState("");
  const [hasVitrines, setHasVitrines] = useState(false);
  const [vitrineOpenings, setVitrineOpenings] = useState<VitrineOpening[]>([createVitrineOpening(1)]);

  // Settings (used in calc)
  const [pricePerKg, setPricePerKg] = useState("");
  const [sellPricePerSqm, setSellPricePerSqm] = useState("");
  const [sysInstallPriceSqm, setSysInstallPriceSqm] = useState("");
  const [sysTransportPrice, setSysTransportPrice] = useState("");
  const [sysSantafPrice, setSysSantafPrice] = useState("");
  const [sysLedPrice, setSysLedPrice] = useState("");
  const [sysScrewPrice, setSysScrewPrice] = useState("");
  const [sysDripEdgePrice, setSysDripEdgePrice] = useState("");
  const [sysContractorName, setSysContractorName] = useState("");
  const [sysCompanyId, setSysCompanyId] = useState("");
  const [sysPhone, setSysPhone] = useState("");
  const [sysAddress, setSysAddress] = useState("");
  const [sysEmail, setSysEmail] = useState("");
  const showManagerBadge = isManagerUser || isAdminEmail(sysEmail);
  const [simCaption, setSimCaption] = useState("");
  const [sysFencePriceSqm, setSysFencePriceSqm] = useState("");
  const [sysFenceSetPrice, setSysFenceSetPrice] = useState("");
  const [sysJumboPrice, setSysJumboPrice] = useState("");
  const [sysVitrine7000PriceSqm, setSysVitrine7000PriceSqm] = useState("");
  const [sysVitrine9000PriceSqm, setSysVitrine9000PriceSqm] = useState("");
  /** אחוז מע״מ (ברירת מחדל 18) — משפיע על תמחור ללקוח ועל פיננסי */
  const [sysVatPercent, setSysVatPercent] = useState("18");
  /** תנאי הצעת מחיר: זמן אספקה דינמי (ימים) */
  const [sysQuoteDeliveryDays, setSysQuoteDeliveryDays] = useState("X");
  /** תנאי הצעת מחיר: שנות אחריות דינמיות */
  const [sysWorkWarrantyYears, setSysWorkWarrantyYears] = useState("X");
  /** תנאי הצעת מחיר: אחוזי תשלום דינמיים */
  const [sysPaymentStage1Percent, setSysPaymentStage1Percent] = useState("50");
  const [sysPaymentStage2Percent, setSysPaymentStage2Percent] = useState("40");
  const [sysPaymentStage3Percent, setSysPaymentStage3Percent] = useState("10");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const businessVatDecimal = useMemo(() => parseBusinessVatPercentString(sysVatPercent), [sysVatPercent]);
  const vatPercentLabelUi = useMemo(() => formatBusinessVatPercentLabel(businessVatDecimal), [businessVatDecimal]);
  const [pergolaResult, setPergolaResult] = useState<PergolaCalcResult>(EMPTY_PERGOLA_RESULT);
  const [fenceResult, setFenceResult] = useState<FenceCalcResult>(EMPTY_FENCE_RESULT);

  // Fence form state
  const [fenceCustName, setFenceCustName] = useState("");
  const [fenceCustPhone, setFenceCustPhone] = useState("");
  const [fenceCustAddress, setFenceCustAddress] = useState("");
  const [fenceCustInternalNotes, setFenceCustInternalNotes] = useState("");
  const [fenceSegments, setFenceSegments] = useState<FenceSegRow[]>(emptyFenceFronts());
  const [fenceSegDrafts, setFenceSegDrafts] = useState<Record<number, Partial<Record<"L" | "H" | "P", string>>>>({});
  const [fenceInGround, setFenceInGround] = useState(false);
  const [fenceSlat, setFenceSlat] = useState("100");
  const [fenceGap, setFenceGap] = useState("2");
  const [fenceColor, setFenceColor] = useState("RAL 9016");
  const [fenceSlatColor, setFenceSlatColor] = useState("RAL 9016");

  const [crmData, setCrmData] = useState<CrmProject[]>([]);
  /** כשטוענים פרויקט פרגולה מ-CRM — שמירה מעדכנת את אותה שורה (בלי כפילות) ומסנכרנת הערות פנימיות */
  const [pergolaCrmEditId, setPergolaCrmEditId] = useState<number | null>(null);
  /** כשטוענים פרויקט גדר מ-CRM — סיכום ללקוח משתמש במחיר העסקה השמור (כולל אחרי «ערוך מחיר») */
  const [fenceCrmEditId, setFenceCrmEditId] = useState<number | null>(null);
  /** פרויקט משולב — לקוח עם כמה מוצרים */
  const [bundleProjectId, setBundleProjectId] = useState<number | null>(null);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const snapshotActiveUnitRef = useRef<(unit: ProjectUnit) => ProjectUnit>((unit) => unit);
  const handleFieldWindowRecordsChangeRef = useRef<(records: FieldWindowRecord[]) => void>(() => {});
  const bundleSyncingRef = useRef(false);
  const lastLoadedBundleUnitRef = useRef<string | null>(null);
  /** מודל ליד חדש / עריכת ליד מלוח הבקרה */
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [leadEditId, setLeadEditId] = useState<number | null>(null);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadAddress, setLeadAddress] = useState("");
  const [leadService, setLeadService] = useState("");
  const [leadCrmStatus, setLeadCrmStatus] = useState<CrmStatus>("lead_new");
  const [leadSellingIncRaw, setLeadSellingIncRaw] = useState("");
  const [leadSellingExRaw, setLeadSellingExRaw] = useState("");
  const [crmSearchQuery, setCrmSearchQuery] = useState("");
  /** מודל להזנת סכום כשמעבירים לפיננסי בלי סכום */
  const [crmDealAmountModal, setCrmDealAmountModal] = useState<null | {
    projectId: number;
    nextStatus: CrmStatus;
    customerName: string;
  }>(null);
  const [crmDealAmountRaw, setCrmDealAmountRaw] = useState("");
  const [crmPriceEditModal, setCrmPriceEditModal] = useState<null | {
    projectId: number;
    customerName: string;
  }>(null);
  const [crmPriceEditRaw, setCrmPriceEditRaw] = useState("");
  const [businessTransactions, setBusinessTransactions] = useState<Transaction[]>([]);
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJob[]>([]);
  const [fieldWindowRecords, setFieldWindowRecords] = useState<FieldWindowRecord[]>([]);
  const [fieldWindowsOpenRecordId, setFieldWindowsOpenRecordId] = useState<string | null>(null);
  /** אחרי טעינה ראשונה מ-Firestore (או אם אין ענן) – מאפשר שמירה ללא דריסת נתונים לפני הטעינה */
  const [workspaceCloudHydrated, setWorkspaceCloudHydrated] = useState(false);
  const scheduleJobsRef = useRef<ScheduleJob[]>([]);
  const scheduleJobsCloudRef = useRef<ScheduleJob[]>([]);
  const fieldWindowRecordsRef = useRef<FieldWindowRecord[]>([]);
  const fieldWindowRecordsCloudRef = useRef<FieldWindowRecord[]>([]);
  const persistWorkspaceNowRef = useRef<() => Promise<void>>(async () => {});

  const crmStaleFollowUpCount = useMemo(() => countCrmStaleAlerts(crmData), [crmData]);

  const crmDashboardFiltered = useMemo(() => {
    const q = crmSearchQuery.trim().toLowerCase();
    if (!q) return crmData;
    const qDigits = q.replace(/\D/g, "");
    return crmData.filter((p) => {
      if ((p.customer ?? "").toLowerCase().includes(q)) return true;
      const phoneRaw = getCrmProjectPhoneForSearch(p);
      if (phoneRaw.toLowerCase().includes(q)) return true;
      if (qDigits.length >= 2 && phoneRaw.replace(/\D/g, "").includes(qDigits)) return true;
      return false;
    });
  }, [crmData, crmSearchQuery]);

  const paymentTermsTotalPercent = useMemo(() => {
    const p1 = parseFloat(sysPaymentStage1Percent) || 0;
    const p2 = parseFloat(sysPaymentStage2Percent) || 0;
    const p3 = parseFloat(sysPaymentStage3Percent) || 0;
    return p1 + p2 + p3;
  }, [sysPaymentStage1Percent, sysPaymentStage2Percent, sysPaymentStage3Percent]);

  const showAlert = useCallback((msg: string) => {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(""), 3000);
  }, []);

  const openKitGuide = useCallback(() => {
    if (!isManagerUser) return;
    const width = parseFloat(lengthWall) || pergolaResult.L || 0;
    const projection = parseFloat(exitWidth) || pergolaResult.W || 0;
    const frameTypeLabels: Record<string, string> = {
      doubleT: "דאבל טי 140/40",
      doubleTHiTech140: "דאבל טי הייטק 140/40",
      doubleTHiTech120: "דאבל טי הייטק 120/40",
      smooth: "פרופיל חלק 120/40",
    };
    const pFront = parseInt(postCountFront, 10) || 0;
    const pRight = parseInt(postCountRight, 10) || 0;
    const pLeft = parseInt(postCountLeft, 10) || 0;
    const pBack = parseInt(postCountBack, 10) || 0;
    const pLegacy = parseInt(postCount, 10) || 0;
    const postsCount = pFront + pRight + pLeft + pBack > 0 ? pFront + pRight + pLeft + pBack : pLegacy;
    const tensionersCount = parseInt(tensionerCount, 10) || 0;
    const supportMode =
      postsCount > 0 && tensionersCount > 0
        ? "both"
        : tensionersCount > 0
          ? "tensioners"
          : "posts";
    const dividers =
      (parseInt(dividerSmoothCount, 10) || 0) +
      (parseInt(dividerLedCount, 10) || 0) ||
      Math.max(0, pergolaResult.nDividersTotal ?? 0);
    const params = new URLSearchParams({
      customerName: custName || "לקוח",
      phone: custPhone || "",
      address: custAddress || "",
      orderDate: new Date().toLocaleDateString("he-IL"),
      width: String(Math.round(width)),
      projection: String(Math.round(projection)),
      profileType: frameTypeLabels[frameType] || frameType,
      color: colorSelect,
      hasSantuf: hasSantaf ? "1" : "0",
      postsCount: String(postsCount),
      tensionersCount: String(tensionersCount),
      tensionerColor: tensionerColor || "",
      supportMode,
      partitionsCount: String(dividers),
      fieldsCount: String(Math.max(1, dividers + 1)),
      shadingType: shadingProfile,
      supportType: "עמודי תמיכה",
    });
    const w = window.open(`/kit-install-guide.html?${params.toString()}`, "_blank");
    if (!w) showAlert("הדפדפן חסם את פתיחת החוברת. אשר חלונות קופצים ונסה שוב.");
  }, [
    isManagerUser,
    custName,
    custPhone,
    custAddress,
    lengthWall,
    exitWidth,
    pergolaResult.L,
    pergolaResult.W,
    pergolaResult.nDividersTotal,
    frameType,
    colorSelect,
    hasSantaf,
    postCount,
    postCountFront,
    postCountRight,
    postCountLeft,
    postCountBack,
    tensionerCount,
    tensionerColor,
    dividerSmoothCount,
    dividerLedCount,
    shadingProfile,
    showAlert,
  ]);

  const vitrineQuote = useMemo(() => {
    const price7000 = Math.max(0, parseFloat(sysVitrine7000PriceSqm) || 0);
    const price9000 = Math.max(0, parseFloat(sysVitrine9000PriceSqm) || 0);
    const rows = vitrineOpenings.map((opening) => {
      const widthCm = parseFloat(opening.widthCm) || 0;
      const heightCm = parseFloat(opening.heightCm) || 0;
      const sqm = widthCm > 0 && heightCm > 0 ? (widthCm / 100) * (heightCm / 100) : 0;
      const unitPrice = opening.profile === "9000" ? price9000 : price7000;
      return {
        ...opening,
        widthCm,
        heightCm,
        sqm,
        unitPrice,
        exVat: sqm * unitPrice,
      };
    });
    const sum7000 = rows.filter((r) => r.profile === "7000").reduce((sum, r) => sum + r.sqm, 0);
    const sum9000 = rows.filter((r) => r.profile === "9000").reduce((sum, r) => sum + r.sqm, 0);
    const exVat = rows.reduce((sum, r) => sum + r.exVat, 0);
    const incVat = incVatFromExVat(exVat, businessVatDecimal);
    return {
      rows,
      sum7000,
      sum9000,
      exVat,
      incVat,
      vatAmount: incVat - exVat,
      validOpenings: rows.filter((r) => r.sqm > 0).length,
    };
  }, [vitrineOpenings, sysVitrine7000PriceSqm, sysVitrine9000PriceSqm, businessVatDecimal]);

  const totalPergolaWithVitrines = useMemo(() => {
    const exVat = pergolaResult.exVat + (hasVitrines ? vitrineQuote.exVat : 0);
    const incVat = incVatFromExVat(exVat, businessVatDecimal);
    return { exVat, incVat, vatAmount: incVat - exVat };
  }, [pergolaResult.exVat, hasVitrines, vitrineQuote.exVat, businessVatDecimal]);

  /** מחיר ללקוח במסך: עדיפות למחיר CRM אחרי «ערוך מחיר», עם אפשרות להשוות למחיר המחושב */
  const pergolaCustomerPriceDisplay = useMemo(() => {
    const liveEx = Math.round(totalPergolaWithVitrines.exVat);
    const liveInc = Math.round(totalPergolaWithVitrines.incVat);
    let dealInc = liveInc;
    let dealEx = liveEx;
    let fromCrm = false;

    if (bundleProjectId != null && activeUnitId) {
      const unit = crmData.find((p) => p.id === bundleProjectId)?.units?.find((u) => u.id === activeUnitId);
      if (unit?.type === "pergola" && Number(unit.sellingPriceInc) > 0) {
        dealInc = Math.round(Number(unit.sellingPriceInc));
        dealEx = Math.round(Number(unit.incomeExVat) || exVatFromIncVat(dealInc, businessVatDecimal));
        fromCrm = true;
      }
    } else if (pergolaCrmEditId != null) {
      const proj = crmData.find((p) => p.id === pergolaCrmEditId);
      if (proj && Number(proj.sellingPriceInc) > 0) {
        dealInc = Math.round(Number(proj.sellingPriceInc));
        dealEx = Math.round(Number(proj.incomeExVat) || exVatFromIncVat(dealInc, businessVatDecimal));
        fromCrm = true;
      }
    }

    const useDeal = fromCrm && dealInc > 0;
    const hasOverride = useDeal && dealInc !== liveInc && liveInc > 0;
    return {
      displayInc: useDeal ? dealInc : liveInc,
      displayEx: useDeal ? dealEx : liveEx,
      liveInc,
      liveEx,
      hasOverride,
      isDiscount: hasOverride && dealInc < liveInc,
    };
  }, [
    totalPergolaWithVitrines.exVat,
    totalPergolaWithVitrines.incVat,
    bundleProjectId,
    activeUnitId,
    crmData,
    pergolaCrmEditId,
    businessVatDecimal,
  ]);

  useEffect(() => {
    setShowPergolaPriceCompare(false);
  }, [pergolaCrmEditId, bundleProjectId, activeUnitId]);

  useEffect(() => {
    setShowFencePriceCompare(false);
  }, [fenceCrmEditId, bundleProjectId, activeUnitId]);

  const fenceCustomerPriceDisplay = useMemo(() => {
    const liveInc = Math.round(Number(fenceResult.sellIncVat) || 0);
    const liveEx = Math.round(Number(fenceResult.sellExVat) || 0);
    let dealInc = liveInc;
    let dealEx = liveEx;
    let fromCrm = false;

    if (bundleProjectId != null && activeUnitId) {
      const unit = crmData.find((p) => p.id === bundleProjectId)?.units?.find((u) => u.id === activeUnitId);
      if (unit?.type === "fence" && Number(unit.sellingPriceInc) > 0) {
        dealInc = Math.round(Number(unit.sellingPriceInc));
        dealEx = Math.round(Number(unit.incomeExVat) || exVatFromIncVat(dealInc, businessVatDecimal));
        fromCrm = true;
      }
    } else if (fenceCrmEditId != null) {
      const proj = crmData.find((p) => p.id === fenceCrmEditId);
      if (proj && Number(proj.sellingPriceInc) > 0) {
        dealInc = Math.round(Number(proj.sellingPriceInc));
        dealEx = Math.round(Number(proj.incomeExVat) || exVatFromIncVat(dealInc, businessVatDecimal));
        fromCrm = true;
      }
    }

    const useDeal = fromCrm && dealInc > 0;
    const hasOverride = useDeal && dealInc !== liveInc && liveInc > 0;
    return {
      displayInc: useDeal ? dealInc : liveInc,
      displayEx: useDeal ? dealEx : liveEx,
      liveInc,
      liveEx,
      hasOverride,
      isDiscount: hasOverride && dealInc < liveInc,
    };
  }, [fenceResult.sellIncVat, fenceResult.sellExVat, bundleProjectId, activeUnitId, crmData, fenceCrmEditId, businessVatDecimal]);

  const openNewLeadModal = useCallback(() => {
    setLeadEditId(null);
    setLeadName("");
    setLeadPhone("");
    setLeadAddress("");
    setLeadService("");
    setLeadCrmStatus("lead_new");
    setLeadSellingIncRaw("");
    setLeadSellingExRaw("");
    setLeadModalOpen(true);
  }, []);

  const openLeadEditor = useCallback(
    (proj: CrmProject) => {
      setLeadEditId(proj.id);
      setLeadName(proj.customer ?? "");
      const fs = (proj.formState ?? {}) as Record<string, unknown>;
      setLeadPhone(String(fs.leadPhone ?? ""));
      setLeadAddress(String(fs.leadAddress ?? ""));
      setLeadService(String(fs.leadServiceNotes ?? ""));
      setLeadCrmStatus(parseCrmStatus(proj.crmStatus) ?? "lead_new");
      const inc = Math.round(Number(proj.sellingPriceInc) || 0);
      const exStored = proj.incomeExVat != null ? Math.round(Number(proj.incomeExVat)) : 0;
      const ex = inc > 0 ? (exStored > 0 ? exStored : Math.round(exVatFromIncVat(inc, businessVatDecimal))) : 0;
      setLeadSellingIncRaw(inc > 0 ? String(inc) : "");
      setLeadSellingExRaw(inc > 0 && ex > 0 ? String(ex) : "");
      setLeadModalOpen(true);
    },
    [businessVatDecimal]
  );

  const handleLeadSellingExInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/[^0-9]/g, "");
      setLeadSellingExRaw(digits);
      if (digits === "") {
        setLeadSellingIncRaw("");
        return;
      }
      const ex = Number(digits) || 0;
      const inc = Math.round(incVatFromExVat(ex, businessVatDecimal));
      setLeadSellingIncRaw(String(inc));
    },
    [businessVatDecimal]
  );

  const handleLeadSellingIncInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/[^0-9]/g, "");
      setLeadSellingIncRaw(digits);
      if (digits === "") {
        setLeadSellingExRaw("");
        return;
      }
      const inc = Number(digits) || 0;
      const ex = Math.round(exVatFromIncVat(inc, businessVatDecimal));
      setLeadSellingExRaw(String(ex));
    },
    [businessVatDecimal]
  );

  const saveLeadFromModal = useCallback(() => {
    if (!leadName.trim()) return showAlert("הזן שם לקוח");
    let incEarly = Number(leadSellingIncRaw.replace(/[^0-9]/g, "")) || 0;
    const exEarly = Number(leadSellingExRaw.replace(/[^0-9]/g, "")) || 0;
    if (incEarly <= 0 && exEarly > 0) {
      incEarly = Math.round(incVatFromExVat(exEarly, businessVatDecimal));
    }
    if (crmStatusRequiresPositiveDealIncVat(leadCrmStatus) && incEarly <= 0) {
      return showAlert("להעברה ל«אושר – ממתין לביצוע» או «בעבודה / ייצור» יש להזין סכום עסקה כולל מע״מ");
    }
    if (typeof window !== "undefined" && leadEditId != null) {
      const prev = crmData.find((p) => p.id === leadEditId);
      const oldS = parseCrmStatus(prev?.crmStatus);
      if (leadCrmStatus === "installed" && oldS !== "installed") {
        if (
          !window.confirm(
            "מעבירים לסטטוס «הותקן / הושלם».\n\n" +
              "האם עדיין יש חשבון או יתרה פתוחה אצל הלקוח?\n\n" +
              "אם כן — הפרויקט ימשיך להופיע בחייבים עד סגירה ידנית.\n" +
              "אם סיימת לגבות — וודא שרישמת את כל התשלומים בקופה."
          )
        )
          return;
      }
    }
    const inc = incEarly;
    const base = exVatFromIncVat(inc, businessVatDecimal);
    const vat = vatFromIncVat(inc, businessVatDecimal);
    const formState = { leadPhone: leadPhone.trim(), leadAddress: leadAddress.trim(), leadServiceNotes: leadService.trim() };
    if (leadEditId != null) {
      setCrmData((prev) =>
        prev.map((p) =>
          p.id === leadEditId
            ? {
                ...p,
                customer: leadName.trim(),
                sellingPriceInc: inc,
                income: inc,
                incomeExVat: base,
                vatAmount: vat,
                crmStatus: leadCrmStatus,
                crmStatusSince:
                  parseCrmStatus(p.crmStatus) !== leadCrmStatus
                    ? new Date().toISOString()
                    : (p.crmStatusSince ??
                      (typeof p.id === "number" && p.id > 1e12 ? new Date(p.id).toISOString() : new Date().toISOString())),
                isLead: true,
                formState: { ...(typeof p.formState === "object" && p.formState !== null ? (p.formState as object) : {}), ...formState },
              }
            : p
        )
      );
      showAlert("הליד עודכן");
    } else {
      const newProject: CrmProject = {
        id: Date.now(),
        date: new Date().toLocaleDateString("he-IL"),
        customer: leadName.trim(),
        sellingPriceInc: inc,
        income: inc,
        incomeExVat: base,
        vatAmount: vat,
        estExpense: 0,
        isLead: true,
        crmStatus: leadCrmStatus,
        crmStatusSince: new Date().toISOString(),
        formState,
      };
      setCrmData((prev) => [newProject, ...prev]);
      showAlert("הליד נשמר ב-CRM");
    }
    setLeadModalOpen(false);
  }, [leadName, leadPhone, leadAddress, leadService, leadCrmStatus, leadSellingIncRaw, leadSellingExRaw, leadEditId, crmData, showAlert, businessVatDecimal]);

  const updateCrmProjectStatus = useCallback(
    (projectId: number, next: CrmStatus) => {
      const prev = crmData.find((x) => x.id === projectId);
      if (!prev) return;
      const dealInc = Number(prev.sellingPriceInc) || 0;
      if (crmStatusRequiresPositiveDealIncVat(next) && dealInc <= 0 && parseCrmStatus(prev.crmStatus) !== next) {
        setCrmDealAmountRaw("");
        setCrmDealAmountModal({
          projectId,
          nextStatus: next,
          customerName: prev.customer ?? "",
        });
        return;
      }
      const oldS = parseCrmStatus(prev.crmStatus);
      if (next === "installed" && oldS !== "installed") {
        if (
          typeof window !== "undefined" &&
          !window.confirm(
            "מעבירים לסטטוס «הותקן / הושלם».\n\n" +
              "האם עדיין יש חשבון או יתרה פתוחה אצל הלקוח?\n\n" +
              "אם כן — הפרויקט ימשיך להופיע בחייבים עד סגירה ידנית.\n" +
              "אם סיימת לגבות — וודא שרישמת את כל התשלומים בקופה."
          )
        )
          return;
      }
      setCrmData((list) =>
        list.map((x) => {
          if (x.id !== projectId) return x;
          if (parseCrmStatus(x.crmStatus) === next) return x;
          return { ...x, crmStatus: next, crmStatusSince: new Date().toISOString() };
        })
      );
      showAlert("הסטטוס עודכן");
    },
    [crmData, showAlert]
  );

  const applyCrmStatusWithDealAmount = useCallback(() => {
    if (!crmDealAmountModal) return;
    const incVat = Number(crmDealAmountRaw.replace(/[^0-9]/g, "")) || 0;
    if (incVat <= 0) {
      showAlert("הזן סכום עסקה חיובי (כולל מע״מ)");
      return;
    }
    const { projectId, nextStatus } = crmDealAmountModal;
    const base = exVatFromIncVat(incVat, businessVatDecimal);
    const vat = vatFromIncVat(incVat, businessVatDecimal);
    const oldS = parseCrmStatus(crmData.find((x) => x.id === projectId)?.crmStatus);
    if (nextStatus === "installed" && oldS !== "installed") {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "מעבירים לסטטוס «הותקן / הושלם».\n\n" +
            "האם עדיין יש חשבון או יתרה פתוחה אצל הלקוח?\n\n" +
            "אם כן — הפרויקט ימשיך להופיע בחייבים עד סגירה ידנית.\n" +
            "אם סיימת לגבות — וודא שרישמת את כל התשלומים בקופה."
        )
      )
        return;
    }
    setCrmData((list) =>
      list.map((x) =>
        x.id === projectId
          ? {
              ...x,
              sellingPriceInc: incVat,
              income: incVat,
              incomeExVat: base,
              vatAmount: vat,
              crmStatus: nextStatus,
              crmStatusSince: new Date().toISOString(),
            }
          : x
      )
    );
    setCrmDealAmountModal(null);
    setCrmDealAmountRaw("");
    showAlert("הסטטוס והסכום עודכנו");
  }, [crmDealAmountModal, crmDealAmountRaw, crmData, showAlert, businessVatDecimal]);

  const openCrmPriceEdit = useCallback((p: CrmProject) => {
    const inc = Math.round(Number(p.sellingPriceInc) || 0);
    setCrmPriceEditRaw(inc > 0 ? String(inc) : "");
    setCrmPriceEditModal({
      projectId: p.id,
      customerName: p.customer ?? "",
    });
  }, []);

  const applyCrmPriceEdit = useCallback(() => {
    if (!crmPriceEditModal) return;
    const incVat = Number(crmPriceEditRaw.replace(/[^0-9]/g, "")) || 0;
    if (incVat <= 0) {
      showAlert("הזן סכום עסקה חיובי (כולל מע״מ)");
      return;
    }
    const { projectId } = crmPriceEditModal;
    const base = Math.round(exVatFromIncVat(incVat, businessVatDecimal));
    const vat = Math.round(vatFromIncVat(incVat, businessVatDecimal));

    setCrmData((list) =>
      list.map((x) => {
        if (x.id !== projectId) return x;

        const oldTotal = Math.round(Number(x.sellingPriceInc) || 0);
        const prevList = Math.round(Number(x.quoteListPriceInc) || 0);
        const listAnchor = Math.max(prevList, oldTotal);
        const nextListPrice = incVat < listAnchor && listAnchor > 0 ? listAnchor : undefined;

        if (projectIsBundle(x) && Array.isArray(x.units) && x.units.length > 0) {
          let units = x.units;
          if (oldTotal > 0) {
            const ratio = incVat / oldTotal;
            units = x.units.map((u) => {
              const uInc = Math.max(0, Math.round((Number(u.sellingPriceInc) || 0) * ratio));
              const uEx = Math.round(exVatFromIncVat(uInc, businessVatDecimal));
              return {
                ...u,
                sellingPriceInc: uInc,
                incomeExVat: uEx,
                vatAmount: uInc - uEx,
              };
            });
            const sumInc = units.reduce((s, u) => s + (Number(u.sellingPriceInc) || 0), 0);
            const diff = incVat - sumInc;
            if (diff !== 0) {
              const lastIdx = units.length - 1;
              const last = units[lastIdx]!;
              const fixedInc = Math.max(0, (Number(last.sellingPriceInc) || 0) + diff);
              const fixedEx = Math.round(exVatFromIncVat(fixedInc, businessVatDecimal));
              units = units.map((u, i) =>
                i === lastIdx
                  ? { ...u, sellingPriceInc: fixedInc, incomeExVat: fixedEx, vatAmount: fixedInc - fixedEx }
                  : u
              );
            }
          } else {
            const per = Math.floor(incVat / x.units.length);
            let remainder = incVat - per * x.units.length;
            units = x.units.map((u) => {
              const uInc = per + (remainder > 0 ? 1 : 0);
              if (remainder > 0) remainder -= 1;
              const uEx = Math.round(exVatFromIncVat(uInc, businessVatDecimal));
              return {
                ...u,
                sellingPriceInc: uInc,
                incomeExVat: uEx,
                vatAmount: uInc - uEx,
              };
            });
          }
          const next: CrmProject = {
            ...x,
            units,
            ...recalcBundleTotals(units),
          };
          if (nextListPrice != null) next.quoteListPriceInc = nextListPrice;
          else delete next.quoteListPriceInc;
          return next;
        }

        const next: CrmProject = {
          ...x,
          sellingPriceInc: incVat,
          income: incVat,
          incomeExVat: base,
          vatAmount: vat,
        };
        if (nextListPrice != null) next.quoteListPriceInc = nextListPrice;
        else delete next.quoteListPriceInc;
        return next;
      })
    );

    setCrmPriceEditModal(null);
    setCrmPriceEditRaw("");
    showAlert("מחיר העסקה עודכן — יופיע גם בסיכום ללקוח (טען את הפרויקט אם עדיין לא)");
  }, [crmPriceEditModal, crmPriceEditRaw, showAlert, businessVatDecimal]);

  useEffect(() => {
    if (!crmDealAmountModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [crmDealAmountModal]);

  useEffect(() => {
    if (!crmPriceEditModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [crmPriceEditModal]);

  useEffect(() => {
    if (!leadModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [leadModalOpen]);

  const persistTransactions = useCallback((next: Transaction[]) => {
    setBusinessTransactions(next);
    try {
      localStorage.setItem("yarchiTransactions", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBusinessTransactions(loadTransactions());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("yarhi_crm_data");
      if (raw) setCrmData(JSON.parse(raw));
    } catch {}
  }, []);

  /** מונע ערבוב נתונים בין קבלנים באותו דפדפן (localStorage). */
  useEffect(() => {
    const uid = cloudUserId ?? null;
    if (!uid) {
      lastUidRef.current = uid;
      return;
    }

    if (lastUidRef.current && lastUidRef.current !== uid) {
      // לא מוחקים CRM/הכנסות — אותו קבלן יכול לעבור Firebase→Supabase עם uid שונה
      try {
        localStorage.removeItem("yarhi_current_calc");
        localStorage.removeItem("yarhi_logoDataUrl");
        for (const key of BUSINESS_SETTINGS_KEYS) localStorage.removeItem("yarhi_" + key);
      } catch {}

      setScheduleJobs([]);
      setLogoDataUrl(null);

      setSysContractorName("");
      setSysCompanyId("");
      setSysPhone("");
      setSysAddress("");
      setSysEmail("");
      setSimCaption("");
      setPricePerKg("");
      setSellPricePerSqm("");
      setSysInstallPriceSqm("");
      setSysTransportPrice("");
      setSysSantafPrice("");
      setSysLedPrice("");
      setSysScrewPrice("");
      setSysDripEdgePrice("");
      setSysFencePriceSqm("");
      setSysFenceSetPrice("");
      setSysJumboPrice("");
      setSysVitrine7000PriceSqm("");
      setSysVitrine9000PriceSqm("");
      setSysVatPercent("18");
      setSysQuoteDeliveryDays("X");
      setSysWorkWarrantyYears("X");
      setSysPaymentStage1Percent("50");
      setSysPaymentStage2Percent("40");
      setSysPaymentStage3Percent("10");
    }

    lastUidRef.current = uid;
  }, [cloudUserId]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const keys: string[] = ["sysContractorName", "sysCompanyId", "sysPhone", "sysAddress", "sysEmail", "simCaption", "sysInstallPriceSqm", "sysTransportPrice", "sysSantafPrice", "sysLedPrice", "sysScrewPrice", "sysDripEdgePrice", "pricePerKg", "sellPricePerSqm", "sysFencePriceSqm", "sysFenceSetPrice", "sysJumboPrice", "sysVitrine7000PriceSqm", "sysVitrine9000PriceSqm", "sysVatPercent", "sysQuoteDeliveryDays", "sysWorkWarrantyYears", "sysPaymentStage1Percent", "sysPaymentStage2Percent", "sysPaymentStage3Percent"];
      keys.forEach((k) => {
        const v = localStorage.getItem("yarhi_" + k);
        if (v !== null) {
          if (k === "sysContractorName") setSysContractorName(v);
          else if (k === "sysCompanyId") setSysCompanyId(v);
          else if (k === "sysPhone") setSysPhone(v);
          else if (k === "sysAddress") setSysAddress(v);
          else if (k === "sysEmail") setSysEmail(v);
          else if (k === "simCaption") setSimCaption(v);
          else if (k === "sysInstallPriceSqm") setSysInstallPriceSqm(v);
          else if (k === "sysTransportPrice") setSysTransportPrice(v);
          else if (k === "sysSantafPrice") setSysSantafPrice(v);
          else if (k === "sysLedPrice") setSysLedPrice(v);
          else if (k === "sysScrewPrice") setSysScrewPrice(v);
          else if (k === "sysDripEdgePrice") setSysDripEdgePrice(v);
          else if (k === "pricePerKg") setPricePerKg(v);
          else if (k === "sellPricePerSqm") setSellPricePerSqm(v);
          else if (k === "sysFencePriceSqm") setSysFencePriceSqm(v);
          else if (k === "sysFenceSetPrice") setSysFenceSetPrice(v);
          else if (k === "sysJumboPrice") setSysJumboPrice(v);
          else if (k === "sysVitrine7000PriceSqm") setSysVitrine7000PriceSqm(v);
          else if (k === "sysVitrine9000PriceSqm") setSysVitrine9000PriceSqm(v);
          else if (k === "sysVatPercent") setSysVatPercent(v);
          else if (k === "sysQuoteDeliveryDays") setSysQuoteDeliveryDays(v);
          else if (k === "sysWorkWarrantyYears") setSysWorkWarrantyYears(v);
          else if (k === "sysPaymentStage1Percent") setSysPaymentStage1Percent(v);
          else if (k === "sysPaymentStage2Percent") setSysPaymentStage2Percent(v);
          else if (k === "sysPaymentStage3Percent") setSysPaymentStage3Percent(v);
        }
      });
      const logo = localStorage.getItem("yarhi_logoDataUrl");
      if (logo) setLogoDataUrl(logo);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("yarhi_current_calc");
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;
      if (s.custName !== undefined) setCustName(String(s.custName));
      if (s.custPhone !== undefined) setCustPhone(draftCustomerPhoneFromStorage(s.custPhone));
      if (s.custAddress !== undefined) setCustAddress(String(s.custAddress));
      if (s.custInternalNotes !== undefined) setCustInternalNotes(String(s.custInternalNotes));
      if (s.lengthWall !== undefined) setLengthWall(String(s.lengthWall));
      if (s.exitWidth !== undefined) setExitWidth(String(s.exitWidth));
      if (s.isLShape !== undefined) setIsLShape(Boolean(s.isLShape));
      if (s.lWallWidth !== undefined) setLWallWidth(String(s.lWallWidth));
      if (s.lWallDepth !== undefined) setLWallDepth(String(s.lWallDepth));
      if (s.lShapeSide !== undefined) setLShapeSide((s.lShapeSide as "left" | "right") || "right");
      if (s.colorSelect !== undefined) setColorSelect(String(s.colorSelect));
      if (s.shadeColorSelect !== undefined) setShadeColorSelect(String(s.shadeColorSelect));
      if (s.frameType !== undefined) setFrameType(String(s.frameType));
      if (s.dividerSize !== undefined) setDividerSize(String(s.dividerSize));
      if (s.dividerSmoothCount !== undefined) setDividerSmoothCount(String(s.dividerSmoothCount));
      if (s.dividerLedCount !== undefined) setDividerLedCount(String(s.dividerLedCount));
      if (s.shadingProfile !== undefined) setShadingProfile(String(s.shadingProfile));
      if (s.spacing !== undefined) setSpacing(String(s.spacing));
      if (s.pricePerKg !== undefined) setPricePerKg(String(s.pricePerKg));
      if (s.hasLed !== undefined) setHasLed(Boolean(s.hasLed));
      if (s.ledCount !== undefined) setLedCount(String(s.ledCount));
      if (s.ledColor !== undefined) setLedColor(String(s.ledColor));
      if (s.hasFan !== undefined) setHasFan(Boolean(s.hasFan));
      if (s.fanCount !== undefined) setFanCount(String(s.fanCount));
      if (s.hasSantaf !== undefined) setHasSantaf(Boolean(s.hasSantaf));
      if (s.santafColor !== undefined) setSantafColor(String(s.santafColor));
      if (s.dripEdgeType !== undefined) setDripEdgeType(String(s.dripEdgeType));
      if (s.sellPricePerSqm !== undefined) setSellPricePerSqm(String(s.sellPricePerSqm));
      if (s.postCount !== undefined) {
        setPostCount(String(s.postCount));
        if (s.postCountFront === undefined) setPostCountFront(String(s.postCount));
      }
      if (s.postCountFront !== undefined) setPostCountFront(String(s.postCountFront));
      if (s.postCountRight !== undefined) setPostCountRight(String(s.postCountRight));
      if (s.postCountLeft !== undefined) setPostCountLeft(String(s.postCountLeft));
      if (s.postCountBack !== undefined) setPostCountBack(String(s.postCountBack));
      if (s.postHeight !== undefined) setPostHeight(String(s.postHeight));
      if (s.postType !== undefined) setPostType(String(s.postType));
      if (s.tensionerCount !== undefined) setTensionerCount(String(s.tensionerCount));
      if (s.tensionerColor !== undefined) setTensionerColor(String(s.tensionerColor));
      if (s.hasVitrines !== undefined) setHasVitrines(Boolean(s.hasVitrines));
      if (Array.isArray(s.vitrineOpenings)) {
        const parsedOpenings = s.vitrineOpenings
          .map((item, i) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const profile = row.profile === "9000" ? "9000" : "7000";
            return {
              id: typeof row.id === "number" ? row.id : Date.now() + i,
              widthCm: String(row.widthCm ?? ""),
              heightCm: String(row.heightCm ?? ""),
              profile: profile as VitrineProfile,
              note: String(row.note ?? ""),
            };
          })
          .filter((row): row is VitrineOpening => Boolean(row));
        setVitrineOpenings(parsedOpenings.length > 0 ? parsedOpenings : [createVitrineOpening(1)]);
      }
    } catch {}
  }, []);

  /** טעינת טיוטות + CRM + תנועות מהענן (דורס localStorage אם יש yarhiWorkspace) */
  useEffect(() => {
    setWorkspaceCloudHydrated(false);
    const uid = cloudUserId;
    if (!uid) {
      setWorkspaceCloudHydrated(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let parsed: ReturnType<typeof parseWorkspaceFromFirestore> = null;
        let rawWs: unknown = undefined;
        if (cloudBackend === "supabase") {
          parsed = await loadWorkspaceFromSupabase(uid);
          rawWs = parsed ?? undefined;
        } else {
          const db = getFirebaseDb();
          if (!db) {
            if (!cancelled) setWorkspaceCloudHydrated(true);
            return;
          }
          const snap = await getDoc(doc(db, "users", uid));
          if (cancelled) return;
          rawWs = snap.exists() ? snap.data()?.[USER_WORKSPACE_FIELD] : undefined;
          parsed = parseWorkspaceFromFirestore(rawWs);
        }
        if (cancelled) return;
        if (!parsed) {
          // משתמש חדש (או בלי yarhiWorkspace בכלל): מנקים מקומית כדי שלא יישארו נתוני משתמש קודם
          try {
            localStorage.removeItem("yarhi_crm_data");
            localStorage.removeItem("yarchiTransactions");
            localStorage.removeItem("yarhi_current_calc");
            localStorage.removeItem("yarhi_logoDataUrl");
            for (const key of BUSINESS_SETTINGS_KEYS) localStorage.removeItem("yarhi_" + key);
          } catch {}

          setCrmData([]);
          setBusinessTransactions([]);
          {
            const localSchedule = readScheduleJobsFromLocal(uid);
            scheduleJobsCloudRef.current = localSchedule;
            scheduleJobsRef.current = localSchedule;
            setScheduleJobs(localSchedule);
          }
          {
            const localFieldWindows = readFieldWindowsFromLocal(uid);
            fieldWindowRecordsCloudRef.current = localFieldWindows;
            fieldWindowRecordsRef.current = localFieldWindows;
            setFieldWindowRecords(localFieldWindows);
          }
          setLogoDataUrl(null);

          setSysContractorName("");
          setSysCompanyId("");
          setSysPhone("");
          setSysAddress("");
          setSysEmail("");
          setSimCaption("");
          setPricePerKg("");
          setSellPricePerSqm("");
          setSysInstallPriceSqm("");
          setSysTransportPrice("");
          setSysSantafPrice("");
          setSysLedPrice("");
          setSysScrewPrice("");
          setSysDripEdgePrice("");
          setSysFencePriceSqm("");
          setSysFenceSetPrice("");
          setSysJumboPrice("");
          setSysVitrine7000PriceSqm("");
          setSysVitrine9000PriceSqm("");
          setSysVatPercent("18");

          setWorkspaceCloudHydrated(true);
          return;
        }
        const hasWorkspaceChunk =
          parsed.crmProjects !== undefined ||
          parsed.pergolaCalcDraft !== undefined ||
          parsed.fenceCalcDraft !== undefined ||
          parsed.businessTransactions !== undefined ||
          parsed.scheduleJobs !== undefined ||
          parsed.fieldWindowRecords !== undefined ||
          parsed.businessSettings !== undefined ||
          Object.prototype.hasOwnProperty.call(parsed, "logoDataUrl");
        if (!hasWorkspaceChunk) {
          // משתמש חדש (או בלי yarhiWorkspace): נרצה שהגדרות העסק יהיו ריקות כברירת מחדל
          try {
            localStorage.removeItem("yarhi_crm_data");
            localStorage.removeItem("yarchiTransactions");
            localStorage.removeItem("yarhi_current_calc");
            localStorage.removeItem("yarhi_logoDataUrl");
            for (const key of BUSINESS_SETTINGS_KEYS) {
              localStorage.removeItem("yarhi_" + key);
            }
          } catch {}

          setCrmData([]);
          setBusinessTransactions([]);
          {
            const localSchedule = readScheduleJobsFromLocal(uid);
            scheduleJobsCloudRef.current = localSchedule;
            scheduleJobsRef.current = localSchedule;
            setScheduleJobs(localSchedule);
          }
          {
            const localFieldWindows = readFieldWindowsFromLocal(uid);
            fieldWindowRecordsCloudRef.current = localFieldWindows;
            fieldWindowRecordsRef.current = localFieldWindows;
            setFieldWindowRecords(localFieldWindows);
          }
          setLogoDataUrl(null);

          setSysContractorName("");
          setSysCompanyId("");
          setSysPhone("");
          setSysAddress("");
          setSysEmail("");
          setSimCaption("");
          setPricePerKg("");
          setSellPricePerSqm("");
          setSysInstallPriceSqm("");
          setSysTransportPrice("");
          setSysSantafPrice("");
          setSysLedPrice("");
          setSysScrewPrice("");
          setSysDripEdgePrice("");
          setSysFencePriceSqm("");
          setSysFenceSetPrice("");
          setSysJumboPrice("");
          setSysVitrine7000PriceSqm("");
          setSysVitrine9000PriceSqm("");
          setSysVatPercent("18");
          setWorkspaceCloudHydrated(true);
          return;
        }
        if (parsed.crmProjects !== undefined) {
          const localCrm = readLocalCrmList();
          if (isRicherCrmList(localCrm, parsed.crmProjects)) {
            setCrmData(localCrm as CrmProject[]);
          } else {
            setCrmData(parsed.crmProjects);
          }
        }
        if (parsed.businessTransactions !== undefined) {
          const localTx = readLocalTxList();
          if (isRicherCrmList(localTx, parsed.businessTransactions)) {
            setBusinessTransactions(localTx as Transaction[]);
          } else {
            setBusinessTransactions(parsed.businessTransactions);
          }
        }
        {
          const loadedSchedule = resolveScheduleJobsOnLoad(uid, rawWs, parsed);
          scheduleJobsCloudRef.current = loadedSchedule;
          scheduleJobsRef.current = loadedSchedule;
          setScheduleJobs(loadedSchedule);
          if (loadedSchedule.length > 0) {
            try {
              localStorage.setItem(scheduleLocalStorageKey(uid), JSON.stringify(loadedSchedule));
            } catch {}
          }
        }
        {
          const loadedFieldWindows = resolveFieldWindowsOnLoad(uid, rawWs, parsed);
          fieldWindowRecordsCloudRef.current = loadedFieldWindows;
          fieldWindowRecordsRef.current = loadedFieldWindows;
          setFieldWindowRecords(loadedFieldWindows);
          if (loadedFieldWindows.length > 0) {
            try {
              localStorage.setItem(fieldWindowsLocalStorageKey(uid), JSON.stringify(loadedFieldWindows));
            } catch {}
          }
        }
        if (Object.prototype.hasOwnProperty.call(parsed, "logoDataUrl")) {
          setLogoDataUrl(parsed.logoDataUrl ?? null);
        }
        const s = parsed.pergolaCalcDraft;
        if (s && typeof s === "object") {
          if (s.custName !== undefined) setCustName(String(s.custName));
          if (s.custPhone !== undefined) setCustPhone(draftCustomerPhoneFromStorage(s.custPhone));
          if (s.custAddress !== undefined) setCustAddress(String(s.custAddress));
          if (s.custInternalNotes !== undefined) setCustInternalNotes(String(s.custInternalNotes));
          if (s.lengthWall !== undefined) setLengthWall(String(s.lengthWall));
          if (s.exitWidth !== undefined) setExitWidth(String(s.exitWidth));
          if (s.isLShape !== undefined) setIsLShape(Boolean(s.isLShape));
          if (s.lWallWidth !== undefined) setLWallWidth(String(s.lWallWidth));
          if (s.lWallDepth !== undefined) setLWallDepth(String(s.lWallDepth));
          if (s.lShapeSide !== undefined) setLShapeSide((s.lShapeSide as "left" | "right") || "right");
          if (s.colorSelect !== undefined) setColorSelect(String(s.colorSelect));
          if (s.shadeColorSelect !== undefined) setShadeColorSelect(String(s.shadeColorSelect));
          if (s.frameType !== undefined) setFrameType(String(s.frameType));
          if (s.dividerSize !== undefined) setDividerSize(String(s.dividerSize));
          if (s.dividerSmoothCount !== undefined) setDividerSmoothCount(String(s.dividerSmoothCount));
          if (s.dividerLedCount !== undefined) setDividerLedCount(String(s.dividerLedCount));
          if (s.shadingProfile !== undefined) setShadingProfile(String(s.shadingProfile));
          if (s.spacing !== undefined) setSpacing(String(s.spacing));
          if (s.pricePerKg !== undefined) setPricePerKg(String(s.pricePerKg));
          if (s.hasLed !== undefined) setHasLed(Boolean(s.hasLed));
          if (s.ledCount !== undefined) setLedCount(String(s.ledCount));
          if (s.ledColor !== undefined) setLedColor(String(s.ledColor));
          if (s.hasFan !== undefined) setHasFan(Boolean(s.hasFan));
          if (s.fanCount !== undefined) setFanCount(String(s.fanCount));
          if (s.hasSantaf !== undefined) setHasSantaf(Boolean(s.hasSantaf));
          if (s.santafColor !== undefined) setSantafColor(String(s.santafColor));
          if (s.dripEdgeType !== undefined) setDripEdgeType(String(s.dripEdgeType));
          if (s.sellPricePerSqm !== undefined) setSellPricePerSqm(String(s.sellPricePerSqm));
          if (s.postCount !== undefined) {
            setPostCount(String(s.postCount));
            if (s.postCountFront === undefined) setPostCountFront(String(s.postCount));
          }
          if (s.postCountFront !== undefined) setPostCountFront(String(s.postCountFront));
          if (s.postCountRight !== undefined) setPostCountRight(String(s.postCountRight));
          if (s.postCountLeft !== undefined) setPostCountLeft(String(s.postCountLeft));
          if (s.postCountBack !== undefined) setPostCountBack(String(s.postCountBack));
          if (s.postHeight !== undefined) setPostHeight(String(s.postHeight));
          if (s.postType !== undefined) setPostType(String(s.postType));
          if (s.tensionerCount !== undefined) setTensionerCount(String(s.tensionerCount));
          if (s.tensionerColor !== undefined) setTensionerColor(String(s.tensionerColor));
          if (s.hasVitrines !== undefined) setHasVitrines(Boolean(s.hasVitrines));
          if (Array.isArray(s.vitrineOpenings)) {
            const parsedOpenings = s.vitrineOpenings
              .map((item, i) => {
                if (!item || typeof item !== "object") return null;
                const row = item as Record<string, unknown>;
                const profile = row.profile === "9000" ? "9000" : "7000";
                return {
                  id: typeof row.id === "number" ? row.id : Date.now() + i,
                  widthCm: String(row.widthCm ?? ""),
                  heightCm: String(row.heightCm ?? ""),
                  profile: profile as VitrineProfile,
                  note: String(row.note ?? ""),
                };
              })
              .filter((row): row is VitrineOpening => Boolean(row));
            setVitrineOpenings(parsedOpenings.length > 0 ? parsedOpenings : [createVitrineOpening(1)]);
          }
        }
        const f = parsed.fenceCalcDraft;
        if (f && typeof f === "object") {
          if (f.fenceCustName !== undefined) setFenceCustName(String(f.fenceCustName));
          if (f.fenceCustPhone !== undefined) setFenceCustPhone(draftCustomerPhoneFromStorage(f.fenceCustPhone));
          if (f.fenceCustAddress !== undefined) setFenceCustAddress(String(f.fenceCustAddress));
          if (f.fenceCustInternalNotes !== undefined) setFenceCustInternalNotes(String(f.fenceCustInternalNotes));
          setFenceInGround(false);
          if (f.fenceSlat !== undefined) setFenceSlat(String(f.fenceSlat));
          if (f.fenceGap !== undefined) setFenceGap(String(f.fenceGap));
          if (f.fenceColor !== undefined) setFenceColor(String(f.fenceColor));
          if (f.fenceSlatColor !== undefined) setFenceSlatColor(String(f.fenceSlatColor));
          if (Array.isArray(f.fenceSegments) && f.fenceSegments.length > 0) {
            setFenceSegments(
              (() => {
                let rootN = 0;
                return f.fenceSegments.map((seg, i) => {
                  const connected = !!seg.connected;
                  const rawSide = (seg as { side?: string }).side;
                  let side: FenceSide | undefined;
                  if (!connected) {
                    if (rawSide === "left" || rawSide === "right") side = rawSide;
                    else side = rootN === 0 ? "left" : "right";
                    rootN += 1;
                  }
                  return {
                    id: typeof seg.id === "number" ? seg.id : Date.now() + i,
                    L: Number(seg.L) || 0,
                    H: Number(seg.H) || 0,
                    P: typeof seg.P === "number" ? seg.P : undefined,
                    connected,
                    ...(connected && seg.corner === false ? { corner: false as const } : {}),
                    ...(connected && seg.corner === true ? { corner: true as const } : {}),
                    ...(side ? { side } : {}),
                  };
                });
              })()
            );
          }
          if (f.fenceSimGate !== undefined) setFenceSimGate(normFenceShareGate(f.fenceSimGate));
        }
        const bs = parsed.businessSettings;
        if (bs && typeof bs === "object") {
          for (const key of BUSINESS_SETTINGS_KEYS) {
            const v = bs[key];
            if (typeof v !== "string") continue;
            try {
              localStorage.setItem("yarhi_" + key, v);
            } catch {
              /* ignore */
            }
            if (key === "sysContractorName") setSysContractorName(v);
            else if (key === "sysCompanyId") setSysCompanyId(v);
            else if (key === "sysPhone") setSysPhone(v);
            else if (key === "sysAddress") setSysAddress(v);
            else if (key === "sysEmail") setSysEmail(v);
            else if (key === "simCaption") setSimCaption(v);
            else if (key === "sysInstallPriceSqm") setSysInstallPriceSqm(v);
            else if (key === "sysTransportPrice") setSysTransportPrice(v);
            else if (key === "sysSantafPrice") setSysSantafPrice(v);
            else if (key === "sysLedPrice") setSysLedPrice(v);
            else if (key === "sysScrewPrice") setSysScrewPrice(v);
            else if (key === "sysDripEdgePrice") setSysDripEdgePrice(v);
            else if (key === "pricePerKg") setPricePerKg(v);
            else if (key === "sellPricePerSqm") setSellPricePerSqm(v);
            else if (key === "sysFencePriceSqm") setSysFencePriceSqm(v);
            else if (key === "sysFenceSetPrice") setSysFenceSetPrice(v);
            else if (key === "sysJumboPrice") setSysJumboPrice(v);
            else if (key === "sysVitrine7000PriceSqm") setSysVitrine7000PriceSqm(v);
            else if (key === "sysVitrine9000PriceSqm") setSysVitrine9000PriceSqm(v);
            else if (key === "sysVatPercent") setSysVatPercent(v);
            else if (key === "sysQuoteDeliveryDays") setSysQuoteDeliveryDays(v);
            else if (key === "sysWorkWarrantyYears") setSysWorkWarrantyYears(v);
            else if (key === "sysPaymentStage1Percent") setSysPaymentStage1Percent(v);
            else if (key === "sysPaymentStage2Percent") setSysPaymentStage2Percent(v);
            else if (key === "sysPaymentStage3Percent") setSysPaymentStage3Percent(v);
          }
        } else {
          // אם אין businessSettings ב-Firestore: מנקים localStorage כדי לא "לרשת" ברירות מחדל ממישהו אחר
          try {
            for (const key of BUSINESS_SETTINGS_KEYS) {
              localStorage.removeItem("yarhi_" + key);
            }
          } catch {}
          setSysContractorName("");
          setSysCompanyId("");
          setSysPhone("");
          setSysAddress("");
          setSysEmail("");
          setSimCaption("");
          setPricePerKg("");
          setSellPricePerSqm("");
          setSysInstallPriceSqm("");
          setSysTransportPrice("");
          setSysSantafPrice("");
          setSysLedPrice("");
          setSysScrewPrice("");
          setSysDripEdgePrice("");
          setSysFencePriceSqm("");
          setSysFenceSetPrice("");
          setSysJumboPrice("");
          setSysVitrine7000PriceSqm("");
          setSysVitrine9000PriceSqm("");
          setSysVatPercent("18");
          setSysQuoteDeliveryDays("X");
          setSysWorkWarrantyYears("X");
          setSysPaymentStage1Percent("50");
          setSysPaymentStage2Percent("40");
          setSysPaymentStage3Percent("10");
        }
        try {
          if (parsed.crmProjects !== undefined) {
            const localCrm = readLocalCrmList();
            const keepLocal = isRicherCrmList(localCrm, parsed.crmProjects);
            localStorage.setItem(
              "yarhi_crm_data",
              JSON.stringify(keepLocal ? localCrm : parsed.crmProjects)
            );
          }
          if (parsed.businessTransactions !== undefined) {
            const localTx = readLocalTxList();
            const keepLocal = isRicherCrmList(localTx, parsed.businessTransactions);
            localStorage.setItem(
              "yarchiTransactions",
              JSON.stringify(keepLocal ? localTx : parsed.businessTransactions)
            );
          }
          if (Object.prototype.hasOwnProperty.call(parsed, "logoDataUrl")) {
            if (typeof parsed.logoDataUrl === "string" && parsed.logoDataUrl.length > 0) {
              localStorage.setItem("yarhi_logoDataUrl", parsed.logoDataUrl);
            } else {
              localStorage.removeItem("yarhi_logoDataUrl");
            }
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        console.error("[Yarhi Pro] טעינת yarhiWorkspace:", e);
      } finally {
        if (!cancelled) setWorkspaceCloudHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudUserId, cloudBackend]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const map: Record<string, string> = {
        sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption,
        sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice,
        pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice, sysVitrine7000PriceSqm, sysVitrine9000PriceSqm, sysVatPercent,
      };
      Object.entries(map).forEach(([k, v]) => localStorage.setItem("yarhi_" + k, String(v)));
    } catch {}
  }, [sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption, sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice, pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice, sysVitrine7000PriceSqm, sysVitrine9000PriceSqm, sysVatPercent]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              type: "pergola",
              vatPercent: sysVatPercent,
              pergola: {
                lengthWall,
                exitWidth,
                isLShape,
                lWallWidth,
                lWallDepth,
                lShapeSide,
                colorSelect,
                shadeColorSelect,
                frameType,
                dividerSize,
                dividerSmoothCount,
                dividerLedCount,
                shadingProfile,
                spacing,
                hasSantaf,
                santafColor,
                dripEdgeType,
                hasLed,
                ledCount,
                ledColor,
                hasFan,
                fanCount,
                postCount,
                postCountFront,
                postCountRight,
                postCountLeft,
                postCountBack,
                postHeight,
                postType,
                tensionerCount,
                tensionerColor,
              },
              settings: {
                pricePerKg,
                sellPricePerSqm,
                sysInstallPriceSqm,
                sysTransportPrice,
                sysSantafPrice,
                sysLedPrice,
                sysScrewPrice,
                sysDripEdgePrice,
              },
            }),
          });
          if (!res.ok) {
            if (!controller.signal.aborted) setPergolaResult(EMPTY_PERGOLA_RESULT);
            return;
          }
          const data = (await res.json()) as { pergola?: PergolaCalcResult };
          if (!controller.signal.aborted && data.pergola) setPergolaResult(data.pergola);
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          if (!controller.signal.aborted) setPergolaResult(EMPTY_PERGOLA_RESULT);
        }
      })();
    }, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    lengthWall,
    exitWidth,
    isLShape,
    lWallWidth,
    lWallDepth,
    lShapeSide,
    colorSelect,
    shadeColorSelect,
    frameType,
    dividerSize,
    dividerSmoothCount,
    dividerLedCount,
    shadingProfile,
    spacing,
    hasSantaf,
    santafColor,
    dripEdgeType,
    hasLed,
    ledCount,
    ledColor,
    hasFan,
    fanCount,
    postCount,
    postCountFront,
    postCountRight,
    postCountLeft,
    postCountBack,
    postHeight,
    postType,
    tensionerCount,
    tensionerColor,
    pricePerKg,
    sellPricePerSqm,
    sysInstallPriceSqm,
    sysTransportPrice,
    sysSantafPrice,
    sysLedPrice,
    sysScrewPrice,
    sysDripEdgePrice,
    sysVatPercent,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const segs = fenceSegsForApi(fenceSegments);
          const res = await fetch("/api/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              type: "fence",
              vatPercent: sysVatPercent,
              fence: {
                segments: segs,
                fenceSlat,
                fenceGap,
                fenceInGround,
                fenceColor,
                fenceSlatColor,
              },
              settings: {
                pricePerKg,
                sysFencePriceSqm,
                sysFenceSetPrice,
                sysJumboPrice,
                sysInstallPriceSqm,
                sysTransportPrice,
              },
            }),
          });
          if (!res.ok) {
            if (!controller.signal.aborted) setFenceResult(EMPTY_FENCE_RESULT);
            return;
          }
          const data = (await res.json()) as { fence?: FenceCalcResult };
          if (!controller.signal.aborted && data.fence) setFenceResult(data.fence);
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          if (!controller.signal.aborted) setFenceResult(EMPTY_FENCE_RESULT);
        }
      })();
    }, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    fenceSegments,
    fenceGap,
    fenceSlat,
    fenceInGround,
    fenceColor,
    fenceSlatColor,
    pricePerKg,
    sysFencePriceSqm,
    sysFenceSetPrice,
    sysJumboPrice,
    sysInstallPriceSqm,
    sysTransportPrice,
    sysVatPercent,
  ]);

  const addFenceSeg = useCallback(
    () =>
      setFenceSegments((prev) => {
        const last = prev[prev.length - 1];
        return [
          ...prev,
          {
            id: Date.now(),
            L: 0,
            H: last?.H ?? 0,
            P: 2,
            side: defaultSideForNewRoot(prev),
          },
        ];
      }),
    []
  );
  const insertFenceAfter = useCallback((afterId: number, kind: "continue" | "corner") => {
    setFenceSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === afterId);
      const base = idx >= 0 ? prev[idx] : prev[prev.length - 1];
      const row: FenceSegRow = {
        id: Date.now(),
        L: 0,
        H: base?.H ?? 0,
        P: 2,
        connected: true,
        corner: kind === "corner",
      };
      if (idx < 0) return [...prev, row];
      return [...prev.slice(0, idx + 1), row, ...prev.slice(idx + 1)];
    });
  }, []);
  const addFenceContinue = useCallback(() => {
    setFenceSegments((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [{ id: Date.now(), L: 0, H: 0, P: 2, connected: true, corner: false }];
      return [
        ...prev,
        { id: Date.now(), L: 0, H: last.H ?? 0, P: 2, connected: true, corner: false },
      ];
    });
  }, []);
  const addFenceCorner = useCallback(() => {
    setFenceSegments((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [{ id: Date.now(), L: 0, H: 0, P: 2, connected: true, corner: true }];
      return [
        ...prev,
        { id: Date.now(), L: 0, H: last.H ?? 0, P: 2, connected: true, corner: true },
      ];
    });
  }, []);
  const removeFenceSeg = useCallback((id: number) => {
    setFenceSegments((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : emptyFenceFronts();
    });
    setFenceSegDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const updateFenceSeg = useCallback((id: number, field: "L" | "H" | "P", value: number | undefined) => setFenceSegments((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))), []);
  const setFenceSegSide = useCallback((id: number, side: FenceSide) => {
    setFenceSegments((prev) =>
      prev.map((s) => (s.id === id && !s.connected ? { ...s, side } : s))
    );
  }, []);
  const getFenceSegInputValue = useCallback((seg: FenceSegRow, field: "L" | "H" | "P") => {
    const draft = fenceSegDrafts[seg.id]?.[field];
    if (draft !== undefined) return draft;
    const current = seg[field];
    if (typeof current !== "number" || current === 0) return "";
    return String(current);
  }, [fenceSegDrafts]);
  const setFenceSegDraft = useCallback((id: number, field: "L" | "H" | "P", rawValue: string) => {
    const normalized = rawValue.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(normalized)) return;
    setFenceSegDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: normalized },
    }));
  }, []);
  const commitFenceSegDraft = useCallback((id: number, field: "L" | "H" | "P") => {
    const raw = fenceSegDrafts[id]?.[field];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === "") {
      updateFenceSeg(id, field, field === "P" ? undefined : 0);
    } else if (field === "P") {
      updateFenceSeg(id, field, parseInt(trimmed, 10) || 0);
    } else {
      updateFenceSeg(id, field, parseFloat(trimmed) || 0);
    }
    setFenceSegDrafts((prev) => {
      if (!prev[id]) return prev;
      const entry = { ...prev[id] };
      delete entry[field];
      const next = { ...prev };
      if (Object.keys(entry).length === 0) delete next[id];
      else next[id] = entry;
      return next;
    });
  }, [fenceSegDrafts, updateFenceSeg]);

  const getLogoHtml = useCallback(() => {
    if (!logoDataUrl) return "";
    return `<div style="text-align:center; margin-bottom:20px;"><img src="${logoDataUrl}" alt="לוגו" style="max-height:70px; max-width:220px; object-fit:contain;"></div>`;
  }, [logoDataUrl]);

  const resolveActiveBundleUnitLabel = useCallback(() => {
    if (bundleProjectId == null) return "";
    const units = crmData.find((p) => p.id === bundleProjectId)?.units;
    return getActiveBundleUnitLabel(bundleProjectId, activeUnitId, units);
  }, [activeUnitId, bundleProjectId, crmData]);

  const resetFenceForm = useCallback(() => {
    if (typeof window !== "undefined" && !(window as unknown as { confirm: (s: string) => boolean }).confirm("לאפס טופס?")) return;
    setFenceCustName(""); setFenceCustPhone(""); setFenceCustAddress(""); setFenceCustInternalNotes("");
    setFenceSegments(emptyFenceFronts());
    setFenceSimGate("none");
    setFenceResult(EMPTY_FENCE_RESULT);
    showAlert("טופס אופס");
  }, [showAlert]);

  const saveFenceToCRM = useCallback(() => {
    if (bundleProjectId != null && activeUnitId) {
      const proj = crmData.find((p) => p.id === bundleProjectId);
      const unit = proj?.units?.find((u) => u.id === activeUnitId);
      if (!unit || unit.type !== "fence") return showAlert("בחר מוצר מסוג גדר בפרויקט המשולב");
      if (!fenceResult.sqm) return showAlert("אין נתוני גדר לשמירה");
      setCrmData((prev) =>
        prev.map((p) => {
          if (p.id !== bundleProjectId || !p.units) return p;
          const units = p.units.map((u) => (u.id === activeUnitId ? snapshotActiveUnitRef.current(u) : u));
          return { ...p, units, ...recalcBundleTotals(units) };
        })
      );
      showAlert("גדר נשמרה בפרויקט המשולב");
      return;
    }
    if (!fenceCustName.trim()) return showAlert("הזן שם לקוח לשמירה");
    if (!fenceResult.sqm) return showAlert("אין נתוני גדר לשמירה");
    const v = fenceResult.sellIncVat;
    const base = exVatFromIncVat(v, businessVatDecimal);
    const vat = vatFromIncVat(v, businessVatDecimal);
    const totalLen = fenceSegments.filter((s) => s.L > 0).reduce((sum, s) => sum + s.L, 0);
    const fenceState = {
      fenceCustName,
      fenceCustPhone,
      fenceCustAddress,
      fenceCustInternalNotes,
      fenceSlat,
      fenceGap,
      fenceColor,
      fenceSlatColor,
      fenceInGround,
      segs: fenceSegsForFormState(fenceSegments),
      fenceSimGate,
    };
    const newProject: CrmProject = {
      id: Date.now(),
      date: new Date().toLocaleDateString("he-IL"),
      customer: fenceCustName.trim() + " (גדר)",
      sellingPriceInc: v,
      income: v,
      incomeExVat: base,
      vatAmount: vat,
      estExpense: 0,
      isFence: true,
      totalLength: totalLen,
      formState: fenceState,
      crmStatus: DEFAULT_CRM_STATUS_AFTER_CALC_SAVE,
      crmStatusSince: new Date().toISOString(),
    };
    setCrmData((prev) => {
      const next = [newProject, ...prev];
      try {
        localStorage.setItem("yarhi_crm_data", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    showAlert("נשמר ב-CRM");

    setFenceCustName("");
    setFenceCustPhone("");
    setFenceCustAddress("");
    setFenceCustInternalNotes("");
    setFenceSegments(emptyFenceFronts());
    setFenceSimGate("none");
  }, [fenceCustName, fenceResult, fenceSegments, fenceCustPhone, fenceCustAddress, fenceCustInternalNotes, fenceSlat, fenceGap, fenceColor, fenceSlatColor, fenceInGround, fenceSimGate, showAlert, businessVatDecimal, bundleProjectId, activeUnitId, crmData]);

  const printFenceReport = useCallback(() => {
    if (!fenceResult.sqm) return showAlert("אנא הזן מידות לפני הדפסת דוח ייצור לגדר");
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון.");
    w.document.write(`<html dir="rtl" lang="he"><head><title>דוח ייצור גדרות - ${fenceCustName || "לקוח"}</title><style>body{font-family:Assistant,sans-serif;padding:30px;direction:rtl;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #cbd5e1;padding:8px;text-align:center;} th{background:#f1f5f9;} td svg,th svg{width:22px!important;height:22px!important;max-width:22px!important;max-height:22px!important;vertical-align:middle;} @media print{td svg,th svg{width:18px!important;height:18px!important;}}</style></head><body>${getLogoHtml()}<div style="border-bottom:3px solid #0f172a;padding-bottom:15px;margin-bottom:20px;"><h1 style="margin:0;font-size:24px;font-weight:800;">דוח ייצור למפעל - גדרות</h1><p style="margin:5px 0 0 0;color:#475569;">${sysContractorName}</p></div><div style="text-align:left;"><strong>לקוח:</strong> ${fenceCustName || "-"}<br><strong>תאריך:</strong> ${new Date().toLocaleDateString("he-IL")}</div><h2>✂️ רשימת חיתוכים (ס"מ)</h2><table><thead><tr><th>פרופיל / ייעוד</th><th>כמות</th><th>מידה לחיתוך</th></tr></thead><tbody>${fenceResult.cuttingHtml}</tbody></table><h2 style="margin-top:30px;">📦 משיכת חומר מהמחסן</h2><table><thead><tr><th>סוג פרופיל</th><th>כמות מוטות</th></tr></thead><tbody>${fenceResult.bomHtml}</tbody></table><h2 style="margin-top:30px;">🔩 פירזול</h2><div style="background:#f8fafc;padding:15px;border-radius:8px;">${fenceResult.hardwareHtml}</div><h2 style="margin-top:30px;">📐 מפרט שדות והוראות</h2><div>${fenceResult.instructionsHtml}</div><script>setTimeout(function(){window.print();},500);<\/script></body></html>`);
    w.document.close();
  }, [fenceResult, fenceCustName, sysContractorName, getLogoHtml, showAlert]);

  const buildPergolaShareConfig = useCallback((): SharePergolaConfig => {
    const L = pergolaResult.L || parseFloat(lengthWall) || 0;
    const W = pergolaResult.W || parseFloat(exitWidth) || 0;
    const ledN = hasLed
      ? Math.max(1, parseInt(ledCount, 10) || parseInt(dividerLedCount, 10) || pergolaResult.autoLedBase || 1)
      : 0;
    // אם סומן מאוורר בלי כמות — לפחות 1, אחרת הוא נעלם בהדמיה
    const fanN = hasFan ? Math.max(1, parseInt(fanCount, 10) || 1) : 0;
    const tensionN = Math.max(0, parseInt(tensionerCount, 10) || 0);
    let dividers = Math.max(0, Math.min(8, pergolaResult.nDividersTotal ?? 0));
    const want = ledN + fanN;
    if (want > 0) dividers = Math.min(8, Math.max(dividers, want));
    const dividerStates = buildDividerAccessoryStates({
      dividers,
      hasLed,
      hasFan,
      ledCount: ledN,
      fanCount: fanN,
    });
    const pFront = parseInt(postCountFront, 10) || 0;
    const pRight = parseInt(postCountRight, 10) || 0;
    const pLeft = parseInt(postCountLeft, 10) || 0;
    const pBack = parseInt(postCountBack, 10) || 0;
    const sidePostsTotal = pFront + pRight + pLeft + pBack;
    const legacyPosts = parseInt(postCount, 10) || 0;
    // אם מילאו רק «כמות עמודים» הכללית — שמים בחזית
    let postsFront = sidePostsTotal > 0 ? pFront : legacyPosts;
    let postsRight = sidePostsTotal > 0 ? pRight : 0;
    let postsLeft = sidePostsTotal > 0 ? pLeft : 0;
    let postsBack = sidePostsTotal > 0 ? pBack : 0;
    // אם יש גובה עמודים אבל בלי כמות — מניחים לפחות 2 בחזית (סטנדרט בהדמיה)
    if (postsFront + postsRight + postsLeft + postsBack <= 0 && String(postHeight || "").trim()) {
      postsFront = 2;
    }
    const hasPosts = postsFront + postsRight + postsLeft + postsBack > 0;
    return {
      L,
      W,
      gap: parseFloat(spacing) || 0,
      dividers: Math.max(dividers, dividerStates.length > 1 || want > 0 ? dividerStates.length : dividers),
      ...(hasPosts
        ? { postsFront, postsRight, postsLeft, postsBack, hasPosts: true as const }
        : {}),
      isLShape,
      lWallWidth: isLShape ? parseFloat(lWallWidth) || 0 : 0,
      lWallDepth: isLShape ? parseFloat(lWallDepth) || 0 : 0,
      lShapeSide,
      frameHex: pergolaResult.frameHex,
      slatHex: pergolaResult.shadeHex,
      santafHex: pergolaResult.santafHex || (hasSantaf ? "#7ec8e3" : "#888888"),
      hasSantaf,
      frameType,
      captionText: simCaption || "",
      hasLed,
      hasFan,
      ledCount: ledN,
      fanCount: fanN,
      ledTone: ledToneFromColor(ledColor),
      dividerStates,
      hasTensioners: tensionN > 0,
      tensionerCount: tensionN,
      env: pergolaSimEnv,
    };
  }, [
    pergolaResult.L,
    pergolaResult.W,
    pergolaResult.nDividersTotal,
    pergolaResult.autoLedBase,
    pergolaResult.frameHex,
    pergolaResult.shadeHex,
    pergolaResult.santafHex,
    lengthWall,
    exitWidth,
    spacing,
    postCountFront,
    postCountRight,
    postCountLeft,
    postCountBack,
    postCount,
    postHeight,
    isLShape,
    lWallWidth,
    lWallDepth,
    lShapeSide,
    hasSantaf,
    frameType,
    simCaption,
    hasLed,
    hasFan,
    ledCount,
    dividerLedCount,
    fanCount,
    ledColor,
    tensionerCount,
    pergolaSimEnv,
  ]);

  const buildFenceShareConfig = useCallback((): ShareFenceConfig | null => {
    const segments = fenceSegsForSim(fenceSegments);
    if (!segments.length) return null;
    return {
      segments,
      gapCm: parseFloat(fenceGap) || 0,
      slatProfile: fenceSlat,
      frameHex: fenceResult.frameHex,
      slatHex: fenceResult.slatHex,
      spacerHex: fenceResult.spacerHex,
      inGround: fenceInGround,
      env: fenceSimEnv,
      gate: fenceSimGate,
    };
  }, [
    fenceSegments,
    fenceGap,
    fenceSlat,
    fenceResult.frameHex,
    fenceResult.slatHex,
    fenceResult.spacerHex,
    fenceInGround,
    fenceSimEnv,
    fenceSimGate,
  ]);

  const sendPergolaSimToWhatsApp = useCallback(() => {
    const config = buildPergolaShareConfig();
    if (!(config.L > 0 && config.W > 0)) {
      showAlert("הזן מידות פרגולה לפני שליחת ההדמיה");
      return;
    }

    const withDefaultPosts = (c: SharePergolaConfig): SharePergolaConfig =>
      c.hasPosts
        ? c
        : { ...c, postsFront: 2, postsRight: 0, postsLeft: 0, postsBack: 0, hasPosts: true };

    const finish = (finalConfig: SharePergolaConfig) => {
      void openSimWhatsApp(custPhone, sysContractorName, {
        k: "p",
        n: sysContractorName.trim() || "הקבלן שלך",
        p: withDefaultPosts(finalConfig),
      });
    };

    void (async () => {
      const liveFromIframe = await requestLiveSimConfig(pergolaSimIframeRef.current?.contentWindow ?? null);
      const live = liveFromIframe ?? lastLiveSimConfigRef.current;
      const merged = mergePergolaShareWithLive(config, live);
      finish({
        ...merged,
        env: normPergolaShareEnv(liveFromIframe?.env) || pergolaSimEnv,
      });
    })();
  }, [buildPergolaShareConfig, custPhone, sysContractorName, showAlert, pergolaSimEnv]);

  const sendFenceSimToWhatsApp = useCallback(() => {
    const config = buildFenceShareConfig();
    if (!config) {
      showAlert("הזן אורך וגובה במקטע אחד לפחות כדי לשלוח הדמיה");
      return;
    }
    void (async () => {
      const live = await requestLiveSimConfig(fenceSimIframeRef.current?.contentWindow ?? null);
      const env = normFenceShareEnv(live?.env) || fenceSimEnv;
      const liveGate = live && "gate" in live ? normFenceShareGate((live as { gate?: unknown }).gate) : undefined;
      const gate = liveGate ?? fenceSimGate;
      void openSimWhatsApp(fenceCustPhone, sysContractorName, {
        k: "f",
        n: sysContractorName.trim() || "הקבלן שלך",
        f: { ...config, env, gate },
      });
    })();
  }, [buildFenceShareConfig, fenceCustPhone, sysContractorName, showAlert, fenceSimEnv, fenceSimGate]);

  const printFenceQuote = useCallback(async () => {
    if (!fenceResult.sqm) return showAlert("הזן מידות תחילה");
    const activeBundleUnitLabel = resolveActiveBundleUnitLabel();
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון.");
    const segmentsForSim = fenceSegsForSim(fenceSegments);

    const totalLenCm = segmentsForSim.reduce((sum, s) => sum + (s.L || 0), 0);
    const maxHeightCm = segmentsForSim.reduce((m, s) => Math.max(m, s.H || 0), 0);
    const totalPosts = fenceSegments.reduce((sum, s, i) => {
      const pVal = typeof s.P === "number" ? s.P : 0;
      return sum + (i > 0 && s.connected ? Math.max(0, pVal - 1) : pVal);
    }, 0);
    const fieldsTotal = fenceSegments.reduce((sum, s) => {
      const pVal = typeof s.P === "number" ? s.P : 0;
      return sum + Math.max(0, pVal - 1);
    }, 0);

    const gapCmNum = parseFloat(fenceGap) || 0;

    const frameHex = fenceResult.frameHex;
    const slatHex = fenceResult.slatHex;
    const spacerHex = fenceResult.spacerHex;
    let basicQuoteExVat = fenceResult.basicQuoteExVat;
    let installExVat = fenceResult.installExVat;
    let transportExVat = fenceResult.transportExVat;
    let vatAmount = fenceResult.vatAmount;
    let sellIncVatQuote = fenceResult.sellIncVat;
    const liveFenceIncVat = Math.round(Number(fenceResult.sellIncVat) || 0);
    const slatLabel = fenceResult.slatLabel;

    const crmFencePrice = (() => {
      if (bundleProjectId != null && activeUnitId) {
        const unit = crmData.find((p) => p.id === bundleProjectId)?.units?.find((u) => u.id === activeUnitId);
        if (unit?.type === "fence" && Number(unit.sellingPriceInc) > 0) {
          const inc = Math.round(Number(unit.sellingPriceInc));
          const ex = Math.round(Number(unit.incomeExVat) || exVatFromIncVat(inc, businessVatDecimal));
          return { inc, ex, vat: Math.round(Number(unit.vatAmount) || inc - ex) };
        }
      }
      if (fenceCrmEditId != null) {
        const proj = crmData.find((p) => p.id === fenceCrmEditId);
        if (proj && Number(proj.sellingPriceInc) > 0) {
          const inc = Math.round(Number(proj.sellingPriceInc));
          const ex = Math.round(Number(proj.incomeExVat) || exVatFromIncVat(inc, businessVatDecimal));
          return { inc, ex, vat: Math.round(Number(proj.vatAmount) || inc - ex) };
        }
      }
      return null;
    })();
    if (crmFencePrice) {
      const liveEx = Math.round(Number(fenceResult.sellExVat) || 0);
      const ratioEx = liveEx > 0 ? crmFencePrice.ex / liveEx : 1;
      basicQuoteExVat = Math.round(fenceResult.basicQuoteExVat * ratioEx);
      installExVat = Math.round(fenceResult.installExVat * ratioEx);
      transportExVat = Math.round(fenceResult.transportExVat * ratioEx);
      const lines = basicQuoteExVat + installExVat + transportExVat;
      if (lines !== crmFencePrice.ex) basicQuoteExVat += crmFencePrice.ex - lines;
      sellIncVatQuote = crmFencePrice.inc;
      vatAmount = crmFencePrice.vat;
    }
    const fenceDealIncRounded = Math.round(sellIncVatQuote);
    const showFenceCustomerDiscountOption = liveFenceIncVat > 0 && fenceDealIncRounded > 0 && fenceDealIncRounded < liveFenceIncVat;
    const fenceCustomerDiscountSaved = showFenceCustomerDiscountOption ? liveFenceIncVat - fenceDealIncRounded : 0;

    const deliveryDaysTerm = String(sysQuoteDeliveryDays || "").trim() || "X";
    const warrantyYearsTerm = String(sysWorkWarrantyYears || "").trim() || "X";
    const paymentStage1Term = String(sysPaymentStage1Percent || "").trim() || "50";
    const paymentStage2Term = String(sysPaymentStage2Percent || "").trim() || "40";
    const paymentStage3Term = String(sysPaymentStage3Percent || "").trim() || "10";
    const rawFencePhone = String(fenceCustPhone || "").trim();
    const fencePhoneDigits = rawFencePhone.replace(/\D/g, "");
    const fenceWaPhone =
      fencePhoneDigits.startsWith("972")
        ? fencePhoneDigits
        : fencePhoneDigits.startsWith("0")
          ? `972${fencePhoneDigits.slice(1)}`
          : fencePhoneDigits;
    const canSendFenceToCustomer = fenceWaPhone.length >= 9;
    const fenceWaText = encodeURIComponent(
      `שלום ${fenceCustName || ""}, מצורף סיכום הגדר שלך מ-${sysContractorName || "Yarhi Pro"}.`
    );
    const fenceWaHref = canSendFenceToCustomer ? `https://wa.me/${fenceWaPhone}?text=${fenceWaText}` : "";
    const fenceSimShareCfg = buildFenceShareConfig();
    const liveFenceEnv = normFenceShareEnv(
      (await requestLiveSimConfig(fenceSimIframeRef.current?.contentWindow ?? null))?.env
    ) || fenceSimEnv;
    const fenceSimShareCfgWithEnv = fenceSimShareCfg ? { ...fenceSimShareCfg, env: liveFenceEnv } : null;
    const fenceSimShareUrl = fenceSimShareCfgWithEnv
      ? await createShortShareUrl({ k: "f", n: sysContractorName.trim() || "הקבלן שלך", f: fenceSimShareCfgWithEnv })
      : "";
    const fenceSimWaHref = fenceSimShareUrl
      ? buildSimWhatsAppUrl(fenceCustPhone, sysContractorName, fenceSimShareUrl)
      : "";

    w.document.write(`
      <html dir="rtl" lang="he"><head><title>הצעת מחיר - ${fenceCustName || "לקוח"}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;700;800&display=swap');
        body{font-family:'Assistant',sans-serif;padding:40px;background:#f8fafc;color:#0f172a;margin:0;}
        .print-container{max-width:900px;margin:0 auto;background:white;padding:40px;box-shadow:0 10px 25px rgba(0,0,0,0.1);border-radius:16px;border:1px solid #e2e8f0;}
        .header{border-bottom:4px solid #2563eb;padding-bottom:20px;margin-bottom:30px;display:flex;justify-content:space-between;align-items:flex-start;}
        .title-box{background:#eff6ff;padding:15px;border-radius:12px;border:1px solid #bfdbfe;text-align:left;}
        .spec-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;background:#f8fafc;padding:25px;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:30px;}
        .spec-full{grid-column:1/-1;border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:10px;}
        .price-box{margin-top:30px;padding:25px;background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;display:flex;justify-content:space-between;align-items:center;}
        .terms-box{margin-top:18px;padding:16px 18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;}
        .signatures{margin-top:60px;display:flex;justify-content:space-between;padding:0 40px;}
        .sig-line{border-top:1px solid #000;padding-top:10px;width:30%;text-align:center;font-weight:bold;}
        .no-print{display:block;}
        @media print{
          @page{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
          *,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          .no-print{display:none!important;}
          body{background:#fff!important;padding:0}
          .print-container{box-shadow:none;padding:0;border:none;background:#fff!important}
          .header{border-bottom:4px solid #2563eb!important}
          .title-box{background:linear-gradient(180deg,#eff6ff,#eff6ff)!important;border:1px solid #bfdbfe!important}
          .price-box{background:linear-gradient(180deg,#eff6ff,#eff6ff)!important;border:1px solid #bfdbfe!important}
          .spec-grid{background:linear-gradient(180deg,#f8fafc,#f8fafc)!important;border:1px solid #e2e8f0!important}
          h1,h2,h3,p,li,span,div{color:inherit!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }
      </style></head><body>
      <div class="print-container">
      ${getLogoHtml()}
      <div class="header">
        <div>
          <h1 style="font-size:32px;font-weight:800;color:#1e3a8a;margin:0 0 5px 0;">${sysContractorName}</h1>
          ${sysCompanyId ? `<p style="margin:0;font-size:14px;font-weight:bold;color:#475569;">ח.פ / עוסק מורשה: ${sysCompanyId}</p>` : ""}
          <div style="margin-top:10px;font-size:14px;color:#475569;">
            ${sysPhone ? `<span>📞 ${sysPhone}</span> &nbsp;|&nbsp; ` : ""}${sysAddress ? `<span>📍 ${sysAddress}</span> &nbsp;|&nbsp; ` : ""}${sysEmail ? `<span>✉️ ${sysEmail}</span>` : ""}
          </div>
        </div>
        <div class="title-box">
          <h2 style="font-size:20px;font-weight:bold;color:#1e40af;margin:0;">הצעת מחיר</h2>
          <p style="font-weight:bold;color:#2563eb;margin:5px 0 0 0;">${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>

      <div class="spec-grid">
        <div class="spec-full">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0 0 5px 0;">פרטי לקוח</h3>
          <p style="margin:3px 0;"><strong>שם הלקוח:</strong> ${fenceCustName || "-"}</p>
          <p style="margin:3px 0;"><strong>כתובת הלקוח:</strong> ${fenceCustAddress || "-"}</p>
          <p style="margin:3px 0;"><strong>מספר טלפון:</strong> ${fenceCustPhone || "-"}</p>
          ${activeBundleUnitLabel ? `<p style="margin:3px 0;"><strong>מיקום במבנה:</strong> ${escapeHtmlForQuote(activeBundleUnitLabel)}</p>` : ""}
        </div>

        <div class="spec-full" style="border:none;margin:0;padding:0;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:10px 0 5px 0;">מפרט הגדר${activeBundleUnitLabel ? ` — ${escapeHtmlForQuote(activeBundleUnitLabel)}` : ""}</h3>
        </div>

        <div><p style="margin:5px 0;"><strong>מידות:</strong> אורך כולל: ${totalLenCm || 0} ס"מ | גובה מרבי: ${maxHeightCm || 0} ס"מ</p></div>
        <div><p style="margin:5px 0;"><strong>סוג מסגרת:</strong> ללא (גדר ללא "מסגרת")</p></div>
        <div><p style="margin:5px 0;"><strong>גוון עמוד:</strong> ${fenceColor || "-"}</p></div>
        <div><p style="margin:5px 0;"><strong>גוון שדה:</strong> ${fenceSlatColor || "-"}</p></div>
        <div><p style="margin:5px 0;"><strong>מספר שדות:</strong> ${
          fieldsTotal === 0 ? "ללא" : fieldsTotal + " יחידות"
        }</p></div>
        <div><p style="margin:5px 0;"><strong>עמודי גדר:</strong> ${totalPosts > 0 ? totalPosts + " עמודים" : "ללא"}</p></div>
        <div><p style="margin:5px 0;"><strong>פרופיל שדה:</strong> ${slatLabel}</p></div>
        <div><p style="margin:5px 0;"><strong>מרווח שלבים:</strong> ${gapCmNum} ס"מ</p></div>
      </div>

      <div id="sim-section" style="margin-bottom:30px;page-break-inside:avoid;">
        <div class="no-print" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0;">הדמיה (לפי הנתונים שהוזנו)</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${
              fenceSimWaHref
                ? `<a id="btn-whatsapp-sim" href="${fenceSimWaHref}" target="_self" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#0d9488;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🎥 שלח הדמיה בוואטסאפ</a>`
                : ""
            }
            ${
              canSendFenceToCustomer
                ? `<a id="btn-whatsapp-quote" href="${fenceWaHref}" target="_self" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#16a34a;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">📲 שלח בוואטסאפ ללקוח</a>`
                : `<button id="btn-whatsapp-quote" style="background:#94a3b8;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:not-allowed;border:none;" disabled>📲 שלח בוואטסאפ ללקוח</button>`
            }
            <button id="btn-close-quote" style="background:#334155;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">✖️ סגור</button>
            <button id="btn-print-quote" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🖨️ הדפס סיכום</button>
          </div>
        </div>
        <iframe id="quote-sim-iframe" title="הדמיה תלת-ממד גדרות" src="/fence-sim.html?rev=${SIM_VERSION}&env=${liveFenceEnv}" style="width:100%;height:380px;border:1px solid #e2e8f0;border-radius:12px;background:#f1f5f9;" referrerPolicy="no-referrer"></iframe>
      </div>

      <script>
      (function(){
        var btn=document.getElementById('btn-print-quote');
        var closeBtn=document.getElementById('btn-close-quote');
        var waBtn=document.getElementById('btn-whatsapp-quote');
        var simWaBtn=document.getElementById('btn-whatsapp-sim');
        var waUrl=${JSON.stringify(fenceWaHref)};
        var simWaUrl=${JSON.stringify(fenceSimWaHref)};
        var simShareText=${JSON.stringify(fenceSimShareUrl ? `הדמיה מאת ${sysContractorName.trim() || "הקבלן שלך"}\n${fenceSimShareUrl}` : "")};
        if(!btn)return;
        var iframe=document.getElementById('quote-sim-iframe');
        // Apply live config into fence-sim.html (3D)
        var applyCfg=function(){
          try{
            if(!iframe||!iframe.contentWindow) return;
            iframe.contentWindow.postMessage({ type:'applyExternalConfig', config: {
              segments: ${JSON.stringify(segmentsForSim)},
              gapCm: ${gapCmNum},
              slatProfile: '${fenceSlat}',
              frameHex: '${frameHex}',
              slatHex: '${slatHex}',
              spacerHex: '${spacerHex}',
              inGround: ${fenceInGround ? "true" : "false"},
              env: ${JSON.stringify(liveFenceEnv)},
              gate: ${JSON.stringify(fenceSimGate)}
            } }, '*');
          }catch(e){}
        };
        if (iframe) iframe.onload = function(){ setTimeout(applyCfg, 150); };
        setTimeout(applyCfg, 600);
        if (closeBtn) {
          closeBtn.onclick=function(){
            try { window.close(); } catch(e) {}
            setTimeout(function(){
              if(!window.closed){
                try { window.location.href = '/'; } catch(e) {}
              }
            }, 120);
          };
        }
        if (waBtn) {
          var goWhatsApp = function(ev){
            if(ev && ev.preventDefault) ev.preventDefault();
            if(!waUrl){ alert('לא נמצא מספר טלפון לקוח תקין בפרטים.'); return; }
            var wapp = null;
            try { wapp = window.open(waUrl, '_blank'); } catch(e) {}
            if (!wapp) {
              try { window.location.href = waUrl; } catch(e) {}
            }
          };
          waBtn.onclick = goWhatsApp;
          waBtn.addEventListener('touchend', goWhatsApp, { passive: false });
        }
        if (simWaBtn && simWaUrl) {
          var goSimWhatsApp = function(ev){
            if(ev && ev.preventDefault) ev.preventDefault();
            if (simShareText && navigator.clipboard && navigator.clipboard.writeText) {
              try { navigator.clipboard.writeText(simShareText); } catch(e) {}
            }
            var wapp = null;
            try { wapp = window.open(simWaUrl, '_blank'); } catch(e) {}
            if (!wapp) {
              try { window.location.href = simWaUrl; } catch(e) {}
            }
          };
          simWaBtn.onclick = goSimWhatsApp;
          simWaBtn.addEventListener('touchend', goSimWhatsApp, { passive: false });
        }
        var discOn=false;
        var bindDiscountToggle=function(){
          var discBtn=document.getElementById('btn-toggle-discount');
          var discOrig=document.getElementById('discount-original-wrap');
          var discSaved=document.getElementById('discount-saved-line');
          if(!discBtn || !discOrig || discBtn.getAttribute('data-bound')==='1') return;
          discBtn.setAttribute('data-bound','1');
          discBtn.onclick=function(){
            discOn=!discOn;
            discOrig.style.display=discOn?'block':'none';
            if(discSaved) discSaved.style.display=discOn?'block':'none';
            discBtn.textContent=discOn?'🏷️ הסתר מחיר מקורי':'🏷️ הצג הנחה ללקוח';
          };
        };
        setTimeout(bindDiscountToggle, 0);
        btn.onclick=function(){
          btn.disabled=true;btn.textContent='מדפיס...';
          setTimeout(function(){window.print();btn.disabled=false;btn.textContent='🖨️ הדפס סיכום';},50);
        };
      })();
      <\/script>

      <div class="price-box">
        <div>
          <h3 style="font-weight:bold;color:#334155;margin:0 0 10px 0;border-bottom:1px solid #bfdbfe;padding-bottom:5px;">פירוט עלויות:</h3>
          <ul style="margin:0;padding-right:20px;font-size:14px;color:#475569;line-height:1.6;">
            <li>עלות גדר (${fenceResult.sqm.toFixed(1)} מ"ר): <strong>₪${Math.round(basicQuoteExVat).toLocaleString()}</strong></li>
            ${installExVat + transportExVat > 0 ? `<li>התקנה והובלה: <strong>₪${Math.round(installExVat + transportExVat).toLocaleString()}</strong></li>` : ""}
            <li>מע\"מ (${vatPercentLabelUi}): <strong>₪${Math.round(vatAmount).toLocaleString()}</strong></li>
          </ul>
        </div>
        <div style="text-align:left;">
          ${
            showFenceCustomerDiscountOption
              ? `<button id="btn-toggle-discount" type="button" class="no-print" style="display:inline-block;margin:0 0 10px 0;background:#b45309;color:white;padding:8px 12px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:13px;">🏷️ הצג הנחה ללקוח</button>
                <div id="discount-original-wrap" style="display:none;margin-bottom:8px;">
                  <p style="margin:0;font-size:18px;font-weight:700;color:#94a3b8;text-decoration:line-through;">₪ ${liveFenceIncVat.toLocaleString()}</p>
                  <p style="margin:4px 0 0 0;font-size:13px;font-weight:800;color:#b45309;">מחיר אחרי הנחה</p>
                </div>`
              : ""
          }
          <p style="font-weight:bold;color:#1d4ed8;margin:0 0 5px 0;">סה\"כ לתשלום (כולל מע\"מ):</p>
          <h3 style="font-size:42px;font-weight:900;color:#1e3a8a;margin:0;">₪ ${fenceDealIncRounded.toLocaleString()}</h3>
          ${
            showFenceCustomerDiscountOption
              ? `<p id="discount-saved-line" style="display:none;margin:8px 0 0 0;font-size:13px;font-weight:800;color:#047857;">חיסכון ללקוח: ₪ ${fenceCustomerDiscountSaved.toLocaleString()}</p>`
              : ""
          }
        </div>
      </div>
      <div class="terms-box">
        <h4 style="margin:0 0 8px 0;font-size:16px;font-weight:800;color:#0f172a;">תנאים כלליים</h4>
        <ul style="margin:0;padding-right:18px;font-size:13px;line-height:1.55;color:#334155;">
          <li>תוקף ההצעה: 14 ימים. אספקה: עד ${escapeHtmlForQuote(deliveryDaysTerm)} ימי עסקים לאחר מקדמה ומדידה בשטח.</li>
          <li>תנאי תשלום: ${escapeHtmlForQuote(paymentStage1Term)}% מקדמה | ${escapeHtmlForQuote(paymentStage2Term)}% באספקת חומרים/תחילת התקנה | ${escapeHtmlForQuote(paymentStage3Term)}% בסיום העבודה.</li>
          <li>הסחורה נשארת בבעלות החברה עד לפירעון מלא של התשלום.</li>
          <li>המחיר אינו כולל: חשמל, היתרים, תשתיות/פינוי, מנוף/במה לפי צורך.</li>
          <li>אחריות: ${escapeHtmlForQuote(warrantyYearsTerm)} שנים על טיב ההתקנה (צבע ופרזול לפי תנאי יצרן).</li>
          <li>תחילת עבודה בכפוף לאישור ההצעה ותשלום מקדמה.</li>
        </ul>
      </div>

      <div class="signatures">
        <div class="sig-line">חתימת לקוח</div>
        ${buildContractorSignatureHtml(sysContractorName, escapeHtmlForQuote)}
      </div>
      </div></body></html>
    `);
    w.document.close();
  }, [
    fenceResult,
    fenceSegments,
    fenceGap,
    fenceSlat,
    fenceColor,
    fenceSlatColor,
    fenceInGround,
    fenceCustName,
    fenceCustPhone,
    fenceCustAddress,
    sysContractorName,
    sysCompanyId,
    sysPhone,
    sysAddress,
    sysEmail,
    getLogoHtml,
    showAlert,
    vatPercentLabelUi,
    sysQuoteDeliveryDays,
    sysWorkWarrantyYears,
    sysPaymentStage1Percent,
    sysPaymentStage2Percent,
    sysPaymentStage3Percent,
    resolveActiveBundleUnitLabel,
    bundleProjectId,
    activeUnitId,
    crmData,
    fenceCrmEditId,
    businessVatDecimal,
    buildFenceShareConfig,
    fenceSimEnv,
    fenceSimGate,
  ]);

  const printLeadQuote = useCallback(
    (p: CrmProject) => {
      if (typeof window === "undefined" || !p.isLead) return;
      const fs = (p.formState ?? {}) as Record<string, unknown>;
      const custName = (p.customer ?? "").trim();
      const custPhone = String(fs.leadPhone ?? "").trim();
      const custAddress = String(fs.leadAddress ?? "").trim();
      const serviceNotes = String(fs.leadServiceNotes ?? "").trim();
      const incNum =
        typeof p.sellingPriceInc === "string"
          ? Number(String(p.sellingPriceInc).replace(/[^0-9.]/g, "")) || 0
          : Number(p.sellingPriceInc) || 0;
      const exNum = Math.round(Number(p.incomeExVat) || 0);
      const vatNum = Math.round(Number(p.vatAmount) || 0);
      const deliveryDaysTerm = String(sysQuoteDeliveryDays || "").trim() || "X";
      const warrantyYearsTerm = String(sysWorkWarrantyYears || "").trim() || "X";
      const paymentStage1Term = String(sysPaymentStage1Percent || "").trim() || "50";
      const paymentStage2Term = String(sysPaymentStage2Percent || "").trim() || "40";
      const paymentStage3Term = String(sysPaymentStage3Percent || "").trim() || "10";
      const rawPhone = custPhone.replace(/\D/g, "");
      const customerWaPhone =
        rawPhone.startsWith("972") ? rawPhone : rawPhone.startsWith("0") ? `972${rawPhone.slice(1)}` : rawPhone;
      const canSendToCustomer = customerWaPhone.length >= 9;
      const customerWaText = encodeURIComponent(`שלום ${custName || ""}, מצורפת הצעת המחיר מ-${sysContractorName || "Yarhi Pro"}.`);
      const customerWaHref = canSendToCustomer ? `https://wa.me/${customerWaPhone}?text=${customerWaText}` : "";
      const workBlock =
        serviceNotes.trim().length > 0
          ? `<div style="white-space:pre-wrap;font-size:14px;color:#475569;line-height:1.6;margin:0;">${escapeHtmlForQuote(serviceNotes)}</div>`
          : `<p style="margin:0;font-size:14px;color:#94a3b8;font-style:italic;">לא הוזן פירוט עבודה</p>`;

      const E = escapeHtmlForQuote;
      const logoBlock = getLogoHtml();
      const companyLine = sysCompanyId
        ? `<p style="margin:0;font-size:14px;font-weight:bold;color:#475569;">ח.פ / עוסק מורשה: ${E(String(sysCompanyId))}</p>`
        : "";
      const contactLine = [
        sysPhone ? `<span>📞 ${E(String(sysPhone))}</span> &nbsp;|&nbsp; ` : "",
        sysAddress ? `<span>📍 ${E(String(sysAddress))}</span> &nbsp;|&nbsp; ` : "",
        sysEmail ? `<span>✉️ ${E(String(sysEmail))}</span>` : "",
      ].join("");
      const waBtnHtml = canSendToCustomer
        ? `<a id="btn-whatsapp-lead-quote" href="${escapeHtmlAttrForQuote(customerWaHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#16a34a;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">📲 שלח בוואטסאפ ללקוח</a>`
        : `<button id="btn-whatsapp-lead-quote" type="button" style="background:#94a3b8;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:not-allowed;border:none;" disabled>📲 שלח בוואטסאפ ללקוח</button>`;

      const nowStr = `${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
      const html =
        "<!DOCTYPE html>\n" +
        `<html dir="rtl" lang="he"><head><meta charset="utf-8"/><title>הצעת מחיר - ${E(custName || "לקוח")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;700;800&display=swap');
  body{font-family:'Assistant',sans-serif;padding:40px;background:#f8fafc;color:#0f172a;margin:0;}
  .print-container{max-width:900px;margin:0 auto;background:white;padding:40px;box-shadow:0 10px 25px rgba(0,0,0,0.1);border-radius:16px;border:1px solid #e2e8f0;}
  .header{border-bottom:4px solid #2563eb;padding-bottom:20px;margin-bottom:30px;display:flex;justify-content:space-between;align-items:flex-start;}
  .title-box{background:#eff6ff;padding:15px;border-radius:12px;border:1px solid #bfdbfe;text-align:left;}
  .spec-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;background:#f8fafc;padding:25px;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:20px;}
  .spec-full{grid-column:1/-1;border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:10px;}
  .price-box{margin-top:10px;padding:25px;background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;}
  .terms-box{margin-top:18px;padding:16px 18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;}
  .signatures{margin-top:60px;display:flex;justify-content:space-between;padding:0 40px;}
  .sig-line{border-top:1px solid #000;padding-top:10px;width:30%;text-align:center;font-weight:bold;}
  .no-print{display:block;}
  @media print{
    @page{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
    *,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .no-print{display:none!important;}
    body{background:#fff!important;padding:0}
    .print-container{box-shadow:none;padding:0;border:none;background:#fff!important}
    .header{border-bottom:4px solid #2563eb!important}
    .title-box{background:linear-gradient(180deg,#eff6ff,#eff6ff)!important;border:1px solid #bfdbfe!important}
    .price-box{background:linear-gradient(180deg,#eff6ff,#eff6ff)!important;border:1px solid #bfdbfe!important}
    .spec-grid{background:linear-gradient(180deg,#f8fafc,#f8fafc)!important;border:1px solid #e2e8f0!important}
    h1,h2,h3,p,li,span,div{color:inherit!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  }
</style></head><body>
<div class="print-container">
${logoBlock}
<div class="header">
  <div>
    <h1 style="font-size:32px;font-weight:800;color:#1e3a8a;margin:0 0 5px 0;">${E(sysContractorName || "")}</h1>
    ${companyLine}
    <div style="margin-top:10px;font-size:14px;color:#475569;">${contactLine}</div>
  </div>
  <div class="title-box">
    <h2 style="font-size:20px;font-weight:bold;color:#1e40af;margin:0;">הצעת מחיר</h2>
    <p style="font-weight:bold;color:#2563eb;margin:5px 0 0 0;">${E(nowStr)}</p>
  </div>
</div>

<div class="spec-grid">
  <div class="spec-full" style="border:none;padding-bottom:0;margin-bottom:0;">
    <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0 0 8px 0;">פרטי לקוח</h3>
    <p style="margin:3px 0;"><strong>שם הלקוח:</strong> ${E(custName || "-")}</p>
    <p style="margin:3px 0;"><strong>כתובת הלקוח:</strong> ${E(custAddress || "-")}</p>
    <p style="margin:3px 0;"><strong>מספר טלפון:</strong> ${E(custPhone || "-")}</p>
  </div>
  <div class="spec-full" style="border:none;margin:0;padding:12px 0 0 0;">
    <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0 0 8px 0;">פירוט העבודה</h3>
    ${workBlock}
  </div>
</div>

<div class="no-print" style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
  ${waBtnHtml}
  <button id="btn-close-lead-quote" type="button" style="background:#334155;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">✖️ סגור</button>
  <button id="btn-print-lead-quote" type="button" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🖨️ הדפס / PDF</button>
</div>

<script>
(function(){
  var btn=document.getElementById('btn-print-lead-quote');
  var closeBtn=document.getElementById('btn-close-lead-quote');
  var waBtn=document.getElementById('btn-whatsapp-lead-quote');
  var waUrl=${JSON.stringify(customerWaHref)};
  if(closeBtn){
    closeBtn.onclick=function(){
      try { window.close(); } catch(e) {}
      setTimeout(function(){
        if(!window.closed){
          try { window.location.href = 'about:blank'; } catch(e) {}
        }
      }, 120);
    };
  }
  if(waBtn && waUrl){
    var goWhatsApp = function(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      var wapp = null;
      try { wapp = window.open(waUrl, '_blank', 'noopener,noreferrer'); } catch(e) {}
      if (!wapp) {
        try { window.location.href = waUrl; } catch(e) {}
      }
    };
    waBtn.onclick = goWhatsApp;
    waBtn.addEventListener('touchend', goWhatsApp, { passive: false });
  }
  if(btn){
    btn.onclick=function(){
      btn.disabled=true;btn.textContent='מדפיס...';
      setTimeout(function(){window.print();btn.disabled=false;btn.textContent='🖨️ הדפס / PDF';},50);
    };
  }
})();
<\/script>

<div class="price-box">
  <div>
    <h3 style="font-weight:bold;color:#334155;margin:0 0 10px 0;border-bottom:1px solid #bfdbfe;padding-bottom:5px;">פירוט מחיר:</h3>
    <ul style="margin:0;padding-right:20px;font-size:14px;color:#475569;line-height:1.6;">
      <li>מחיר לפני מע&quot;מ: <strong>₪${exNum.toLocaleString()}</strong></li>
      <li>מע&quot;מ (${vatPercentLabelUi}): <strong>₪${vatNum.toLocaleString()}</strong></li>
    </ul>
  </div>
  <div style="text-align:left;">
    <p style="font-weight:bold;color:#1d4ed8;margin:0 0 5px 0;">סה&quot;כ לתשלום (כולל מע&quot;מ):</p>
    <h3 style="font-size:42px;font-weight:900;color:#1e3a8a;margin:0;">₪ ${Math.round(incNum).toLocaleString()}</h3>
    <p style="font-size:13px;color:#64748b;margin:8px 0 0 0;font-weight:600;">₪ ${exNum.toLocaleString()} לפני מע&quot;מ</p>
  </div>
</div>
<div class="terms-box">
  <h4 style="margin:0 0 8px 0;font-size:16px;font-weight:800;color:#0f172a;">תנאים כלליים</h4>
  <ul style="margin:0;padding-right:18px;font-size:13px;line-height:1.55;color:#334155;">
    <li>תוקף ההצעה: 14 ימים. אספקה: עד ${E(deliveryDaysTerm)} ימי עסקים לאחר מקדמה ומדידה בשטח.</li>
    <li>תנאי תשלום: ${E(paymentStage1Term)}% מקדמה | ${E(paymentStage2Term)}% באספקת חומרים/תחילת התקנה | ${E(paymentStage3Term)}% בסיום העבודה.</li>
    <li>הסחורה נשארת בבעלות החברה עד לפירעון מלא של התשלום.</li>
    <li>המחיר אינו כולל: חשמל, היתרים, תשתיות/פינוי, מנוף/במה לפי צורך.</li>
    <li>אחריות: ${E(warrantyYearsTerm)} שנים על טיב ההתקנה (צבע ופרזול לפי תנאי יצרן).</li>
    <li>תחילת עבודה בכפוף לאישור ההצעה ותשלום מקדמה.</li>
  </ul>
</div>

<div class="signatures">
  <div class="sig-line">חתימת לקוח</div>
  ${buildContractorSignatureHtml(sysContractorName, E)}
</div>
</div></body></html>`;

      try {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        // בלי noopener ב-features: בכרום זה עלול להחזיר null גם כשהחלון נפתח, ואז נבטל בטעות את ה-blob.
        const w = window.open(url, "_blank");
        if (!w) {
          URL.revokeObjectURL(url);
          showAlert("הדפדפן חסם את פתיחת החלון.");
          return;
        }
        const revokeLater = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            /* ignore */
          }
        };
        window.setTimeout(revokeLater, 120_000);
      } catch {
        showAlert("לא ניתן להפיק את מסמך ההצעה. נסה דפדפן אחר או בטל חסימת חלונות קופצים.");
      }
    },
    [getLogoHtml, showAlert, sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, vatPercentLabelUi, sysQuoteDeliveryDays, sysWorkWarrantyYears, sysPaymentStage1Percent, sysPaymentStage2Percent, sysPaymentStage3Percent]
  );

  const saveCurrentState = useCallback(() => {
    if (typeof window === "undefined") return;
    const totalPostsBySide = (parseInt(postCountFront) || 0) + (parseInt(postCountRight) || 0) + (parseInt(postCountLeft) || 0) + (parseInt(postCountBack) || 0);
    const state: Record<string, unknown> = {
      custName, custPhone, custAddress, custInternalNotes, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide,
      colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile,
      spacing, pricePerKg, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType,
      sellPricePerSqm, postCount: totalPostsBySide > 0 ? totalPostsBySide : postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor,
      hasVitrines,
      vitrineOpenings: vitrineOpenings.map((opening) => ({
        id: opening.id,
        widthCm: opening.widthCm,
        heightCm: opening.heightCm,
        profile: opening.profile,
        note: opening.note,
      })),
    };
    try { localStorage.setItem("yarhi_current_calc", JSON.stringify(state)); } catch {}
  }, [custName, custPhone, custAddress, custInternalNotes, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide, colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile, spacing, pricePerKg, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType, sellPricePerSqm, postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor, hasVitrines, vitrineOpenings]);

  const addVitrineOpening = useCallback(() => {
    setVitrineOpenings((prev) => [...prev, createVitrineOpening(Date.now())]);
    saveCurrentState();
  }, [saveCurrentState]);

  const removeVitrineOpening = useCallback((id: number) => {
    setVitrineOpenings((prev) => {
      if (prev.length <= 1) return [createVitrineOpening(1)];
      return prev.filter((opening) => opening.id !== id);
    });
    saveCurrentState();
  }, [saveCurrentState]);

  const updateVitrineOpening = useCallback(
    (id: number, patch: Partial<VitrineOpening>) => {
      setVitrineOpenings((prev) => prev.map((opening) => (opening.id === id ? { ...opening, ...patch } : opening)));
      saveCurrentState();
    },
    [saveCurrentState]
  );

  const resetCurrentForm = useCallback(() => {
    if (typeof window !== "undefined" && !(window as unknown as { confirm: (s: string) => boolean }).confirm("האם לאפס את כל השדות בטופס הנוכחי?")) return;
    setPergolaCrmEditId(null);
    setFenceCrmEditId(null);
    setCustName(""); setCustPhone(""); setCustAddress(""); setCustInternalNotes(""); setLengthWall(""); setExitWidth("");
    setLWallWidth(""); setLWallDepth(""); setLShapeSide("right"); setDividerSmoothCount(""); setDividerLedCount("");
    setPostCount(""); setPostCountFront(""); setPostCountRight(""); setPostCountLeft(""); setPostCountBack(""); setPostHeight(""); setTensionerCount(""); setTensionerColor(""); setLedCount(""); setFanCount("");
    setColorSelect("RAL 9016"); setShadeColorSelect("RAL 9016"); setFrameType("doubleT"); setDividerSize("120");
    setShadingProfile("20x40"); setSpacing("2"); setPostType("100"); setLedColor("לבן חם"); setSantafColor("שקוף"); setDripEdgeType("wave2.5");
    setIsLShape(false); setHasSantaf(false); setHasLed(false); setHasFan(false);
    setHasVitrines(false); setVitrineOpenings([createVitrineOpening(1)]);
    try { localStorage.removeItem("yarhi_current_calc"); } catch {}
    showAlert("הטופס אופס בהצלחה");
  }, [showAlert]);

  const saveProjectToCRM = useCallback(() => {
    if (!custName.trim() && bundleProjectId == null) return showAlert("הזן שם לקוח לשמירה");
    if (bundleProjectId != null && activeUnitId) {
      const proj = crmData.find((p) => p.id === bundleProjectId);
      const unit = proj?.units?.find((u) => u.id === activeUnitId);
      if (!unit || unit.type !== "pergola") return showAlert("בחר מוצר מסוג פרגולה בפרויקט המשולב");
      setCrmData((prev) =>
        prev.map((p) => {
          if (p.id !== bundleProjectId || !p.units) return p;
          const units = p.units.map((u) => (u.id === activeUnitId ? snapshotActiveUnitRef.current(u) : u));
          return { ...p, units, ...recalcBundleTotals(units) };
        })
      );
      showAlert("פרגולה נשמרה בפרויקט המשולב");
      return;
    }
    if (!custName.trim()) return showAlert("הזן שם לקוח לשמירה");
    const vitrineExVat = hasVitrines ? vitrineQuote.exVat : 0;
    const exVat = pergolaResult.exVat + vitrineExVat;
    const incVat = incVatFromExVat(exVat, businessVatDecimal);
    const vatAmount = incVat - exVat;
    const matCost = pergolaResult.materialCost;
    const instCost = pergolaResult.installCost;
    const totalPostsBySide = (parseInt(postCountFront) || 0) + (parseInt(postCountRight) || 0) + (parseInt(postCountLeft) || 0) + (parseInt(postCountBack) || 0);
    const currentState: Record<string, unknown> = {
      custName, custPhone, custAddress, custInternalNotes, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide,
      colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile,
      spacing, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType,
      postCount: totalPostsBySide > 0 ? totalPostsBySide : postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor,
      hasVitrines,
      vitrineOpenings: vitrineOpenings.map((opening) => ({
        id: opening.id,
        widthCm: opening.widthCm,
        heightCm: opening.heightCm,
        profile: opening.profile,
        note: opening.note,
      })),
    };
    const editId = pergolaCrmEditId;
    const canUpdateExisting =
      editId != null && crmData.some((p) => p.id === editId && !p.isLead && !p.isFence && !projectIsBundle(p));

    if (canUpdateExisting) {
      setCrmData((prev) =>
        prev.map((p) =>
          p.id === editId && !p.isLead && !p.isFence && !projectIsBundle(p)
            ? {
                ...p,
                date: new Date().toLocaleDateString("he-IL"),
                customer: custName.trim(),
                sellingPriceInc: incVat,
                income: incVat,
                incomeExVat: exVat,
                vatAmount,
                estExpense: matCost + instCost,
                formState: currentState,
              }
            : p
        )
      );
      showAlert("הפרויקט עודכן ב-CRM");
      return;
    }

    const newProject: CrmProject = {
      id: Date.now(),
      date: new Date().toLocaleDateString("he-IL"),
      customer: custName.trim(),
      sellingPriceInc: incVat,
      income: incVat,
      incomeExVat: exVat,
      vatAmount,
      estExpense: matCost + instCost,
      formState: currentState,
      crmStatus: DEFAULT_CRM_STATUS_AFTER_CALC_SAVE,
      crmStatusSince: new Date().toISOString(),
    };
    setCrmData((prev) => [newProject, ...prev]);
    setPergolaCrmEditId(null);
    showAlert("הפרויקט נשמר בהצלחה!");

    // איפוס לקוח + מידות לפרויקט הבא (שומרים העדפות צבע/פרופיל/מחירים)
    setCustName("");
    setCustPhone("");
    setCustAddress("");
    setCustInternalNotes("");
    setLengthWall("");
    setExitWidth("");
    setIsLShape(false);
    setLWallWidth("");
    setLWallDepth("");
    setLShapeSide("right");
    setDividerSmoothCount("");
    setDividerLedCount("");
    setPostCount("");
    setPostCountFront("");
    setPostCountRight("");
    setPostCountLeft("");
    setPostCountBack("");
    setPostHeight("");
    setTensionerCount("");
    setTensionerColor("");
    setLedCount("");
    setFanCount("");
    setHasVitrines(false);
    setVitrineOpenings([createVitrineOpening(1)]);
    try {
      const state: Record<string, unknown> = {
        custName: "",
        custPhone: "",
        custAddress: "",
        custInternalNotes: "",
        lengthWall: "",
        exitWidth: "",
        isLShape: false,
        lWallWidth: "",
        lWallDepth: "",
        lShapeSide: "right",
        colorSelect,
        shadeColorSelect,
        frameType,
        dividerSize,
        dividerSmoothCount: "",
        dividerLedCount: "",
        shadingProfile,
        spacing,
        pricePerKg,
        hasLed,
        ledCount: "",
        ledColor,
        hasFan,
        fanCount: "",
        hasSantaf,
        santafColor,
        dripEdgeType,
        sellPricePerSqm,
        postCount: "",
        postCountFront: "",
        postCountRight: "",
        postCountLeft: "",
        postCountBack: "",
        postHeight: "",
        postType,
        tensionerCount: "",
        tensionerColor: "",
        hasVitrines: false,
        vitrineOpenings: [createVitrineOpening(1)],
      };
      localStorage.setItem("yarhi_current_calc", JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [
    custName,
    custPhone,
    custAddress,
    custInternalNotes,
    lengthWall,
    exitWidth,
    isLShape,
    lWallWidth,
    lWallDepth,
    lShapeSide,
    pergolaCrmEditId,
    crmData,
    pergolaResult,
    showAlert,
    colorSelect,
    shadeColorSelect,
    frameType,
    dividerSize,
    shadingProfile,
    spacing,
    pricePerKg,
    hasLed,
    ledCount,
    ledColor,
    hasFan,
    hasSantaf,
    hasVitrines,
    santafColor,
    dripEdgeType,
    sellPricePerSqm,
    postType,
    businessVatDecimal,
    postCount,
    postCountFront,
    postCountRight,
    postCountLeft,
    postCountBack,
    postHeight,
    dividerSmoothCount,
    dividerLedCount,
    fanCount,
    tensionerCount,
    tensionerColor,
    vitrineOpenings,
    vitrineQuote.exVat,
    bundleProjectId,
    activeUnitId,
  ]);

  const printFactoryReport = useCallback(() => {
    const L = pergolaResult.L; const W = pergolaResult.W;
    if (!L || !W) return showAlert("אנא הזן מידות לפני הדפסת דוח ייצור");
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון. אנא אשר חלונות קופצים.");
    w.document.write(`
      <html dir="rtl" lang="he"><head><title>דוח ייצור - ${custName || "לקוח"}</title>
      <style>body{font-family:Assistant,sans-serif;padding:30px;direction:rtl;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #cbd5e1;padding:8px;text-align:center;} th{background:#f1f5f9;} td svg,th svg{width:22px!important;height:22px!important;max-width:22px!important;max-height:22px!important;vertical-align:middle;} @media print{td svg,th svg{width:18px!important;height:18px!important;max-width:18px!important;max-height:18px!important;}}</style></head><body>
      ${getLogoHtml()}
      <div style="border-bottom:3px solid #0f172a;padding-bottom:15px;margin-bottom:20px;">
        <h1 style="margin:0;font-size:24px;font-weight:800;">דוח ייצור למפעל</h1>
        <p style="margin:5px 0 0 0;color:#475569;">${sysContractorName}</p>
      </div>
      <div style="background:#f8fafc;padding:15px;border-radius:8px;margin-bottom:20px;"><strong>מידות ברוטו לייצור:</strong> חזית ${L} ס"מ על ${W} ס"מ</div>
      <h2>רשימת חיתוכים</h2><table><thead><tr><th>פרופיל</th><th>ייעוד</th><th>כמות</th><th>מידה לחיתוך (ס"מ)</th><th>מוט</th></tr></thead><tbody>${pergolaResult.cuttingHtml}</tbody></table>
      ${pergolaResult.shadeSlatPlanHtml ? `<h2 style="margin-top:24px;color:#1e40af;">שלבי הצללה — תוכנית חיתוך (מוט 6 מ׳)</h2>${pergolaResult.shadeSlatPlanHtml}` : ""}
      <h2 style="margin-top:30px;">משיכת חומר מהמחסן</h2><table><thead><tr><th>סוג פרופיל</th><th>כמות מוטות</th><th>אורך מוט</th></tr></thead><tbody>${pergolaResult.bomHtml}</tbody></table>
      <h2 style="margin-top:30px;">פירזול</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${pergolaResult.hardwareHtml}</div>
      <div style="page-break-before:always;margin-top:40px;"></div><h2 style="color:#ea580c;">סקיצה והוראות הרכבה</h2><div>${pergolaResult.instructionsHtml}</div>
      <script>setTimeout(function(){window.print();},500);<\/script></body></html>`);
    w.document.close();
  }, [pergolaResult, custName, sysContractorName, getLogoHtml, showAlert]);

  const printCustomerQuote = useCallback(async () => {
    if (!pergolaResult.sqm) return showAlert("אנא הזן מידות לפני הדפסת סיכום");
    const activeBundleUnitLabel = resolveActiveBundleUnitLabel();
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון.");

    const L = pergolaResult.L;
    const W = pergolaResult.W;
    const inputL = parseFloat(lengthWall) || 0;
    const lW = isLShape ? parseFloat(lWallWidth) || 0 : 0;
    const nDividersTotal = pergolaResult.nDividersTotal;
    const divSizeStr = dividerSize === "100" ? "100/40" : "120/40";
    const frameTypeLabels: Record<string, string> = { doubleT: "דאבל טי 140/40", doubleTHiTech140: "דאבל טי הייטק 140/40", doubleTHiTech120: "דאבל טי הייטק 120/40", smooth: "פרופיל חלק 120/40" };
    const frameLabel = frameTypeLabels[frameType] || frameType;
    const shadingLabels: Record<string, string> = { "20x40": "20/40", "20x70": "20/70", "mix": "משולב (70+40+40)", "none": "ללא (סנטף בלבד)" };
    const shadingLabel = shadingLabels[shadingProfile] || shadingProfile;
    const pFront = parseInt(postCountFront) || 0;
    const pRight = parseInt(postCountRight) || 0;
    const pLeft = parseInt(postCountLeft) || 0;
    const pBack = parseInt(postCountBack) || 0;
    const pCountLegacy = parseInt(postCount) || 0;
    const pSidesTotal = pFront + pRight + pLeft + pBack;
    const pCount = pSidesTotal > 0 ? pSidesTotal : pCountLegacy;
    const postsStr = pCount > 0
      ? (pSidesTotal > 0
          ? `${pCount} עמודים (חזית: ${pFront}, ימין: ${pRight}, שמאל: ${pLeft}, סוף: ${pBack}) מסוג ${postType}/${postType}`
          : `${pCount} עמודים מסוג ${postType}/${postType}`)
      : "ללא";
    const ledLabel = hasLed ? `${ledCount || dividerLedCount || pergolaResult.autoLedBase} פסים (${ledColor})` : "ללא";
    const fanCountNum = parseInt(fanCount) || 0;
    const fansStr = hasFan && fanCountNum > 0 ? `${fanCountNum} יח'` : "ללא";
    const hasSantafStr = hasSantaf ? `כולל (גוון ${santafColor})` : "לא כולל";
    const deliveryDaysTerm = String(sysQuoteDeliveryDays || "").trim() || "X";
    const warrantyYearsTerm = String(sysWorkWarrantyYears || "").trim() || "X";
    const paymentStage1Term = String(sysPaymentStage1Percent || "").trim() || "50";
    const paymentStage2Term = String(sysPaymentStage2Percent || "").trim() || "40";
    const paymentStage3Term = String(sysPaymentStage3Percent || "").trim() || "10";
    let basicQuoteExVat = pergolaResult.exVat - pergolaResult.installCost;
    let installCostQuote = pergolaResult.installCost;
    let vitrineExVat = hasVitrines ? vitrineQuote.exVat : 0;
    let totalExVat = pergolaResult.exVat + vitrineExVat;
    let totalIncVat = incVatFromExVat(totalExVat, businessVatDecimal);
    let vatAmount = totalIncVat - totalExVat;
    const liveTotalIncVat = Math.round(totalIncVat);

    const crmPergolaPrice = (() => {
      if (bundleProjectId != null && activeUnitId) {
        const unit = crmData.find((p) => p.id === bundleProjectId)?.units?.find((u) => u.id === activeUnitId);
        if (unit?.type === "pergola" && Number(unit.sellingPriceInc) > 0) {
          const inc = Math.round(Number(unit.sellingPriceInc));
          const ex = Math.round(Number(unit.incomeExVat) || exVatFromIncVat(inc, businessVatDecimal));
          return { inc, ex, vat: Math.round(Number(unit.vatAmount) || inc - ex) };
        }
      }
      if (pergolaCrmEditId != null) {
        const proj = crmData.find((p) => p.id === pergolaCrmEditId);
        if (proj && Number(proj.sellingPriceInc) > 0) {
          const inc = Math.round(Number(proj.sellingPriceInc));
          const ex = Math.round(Number(proj.incomeExVat) || exVatFromIncVat(inc, businessVatDecimal));
          return { inc, ex, vat: Math.round(Number(proj.vatAmount) || inc - ex) };
        }
      }
      return null;
    })();
    if (crmPergolaPrice) {
      const liveEx = totalExVat;
      const ratioEx = liveEx > 0 ? crmPergolaPrice.ex / liveEx : 1;
      basicQuoteExVat = Math.round(basicQuoteExVat * ratioEx);
      installCostQuote = Math.round(installCostQuote * ratioEx);
      vitrineExVat = Math.round(vitrineExVat * ratioEx);
      const lines = basicQuoteExVat + installCostQuote + vitrineExVat;
      if (lines !== crmPergolaPrice.ex) basicQuoteExVat += crmPergolaPrice.ex - lines;
      totalExVat = crmPergolaPrice.ex;
      totalIncVat = crmPergolaPrice.inc;
      vatAmount = crmPergolaPrice.vat;
    }
    const dealIncRounded = Math.round(totalIncVat);
    const showCustomerDiscountOption = liveTotalIncVat > 0 && dealIncRounded > 0 && dealIncRounded < liveTotalIncVat;
    const customerDiscountSaved = showCustomerDiscountOption ? liveTotalIncVat - dealIncRounded : 0;

    const vitrineRowsForQuote = hasVitrines
      ? vitrineQuote.rows.filter((row) => row.sqm > 0)
      : [];
    const vitrineRowsHtml =
      vitrineRowsForQuote.length > 0
        ? vitrineRowsForQuote
            .map((row, i) => {
              const note = row.note.trim();
              return `<tr>
                <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${i + 1}</td>
                <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${row.widthCm} × ${row.heightCm}</td>
                <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${row.profile}</td>
                <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${row.sqm.toFixed(2)}</td>
                <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">₪${Math.round(row.exVat).toLocaleString()}</td>
                <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;">${note ? escapeHtmlForQuote(note) : "-"}</td>
              </tr>`;
            })
            .join("")
        : "";
    const dimensionsText = isLShape ? `חזית: ${inputL + lW} ס"מ | יציאה: ${W} ס"מ` : `חזית: ${L} ס"מ | יציאה: ${W} ס"מ`;
    const frameHex = pergolaResult.frameHex;
    const shadeHex = pergolaResult.shadeHex;
    const santafHexQuote = pergolaResult.santafHex;
    const rawPhone = String(custPhone || "").trim();
    const phoneDigits = rawPhone.replace(/\D/g, "");
    const customerWaPhone =
      phoneDigits.startsWith("972")
        ? phoneDigits
        : phoneDigits.startsWith("0")
          ? `972${phoneDigits.slice(1)}`
          : phoneDigits;
    const canSendToCustomer = customerWaPhone.length >= 9;
    const customerWaText = encodeURIComponent(
      `שלום ${custName || ""}, מצורף סיכום הפרגולה שלך מ-${sysContractorName || "Yarhi Pro"}.`
    );
    const customerWaHref = canSendToCustomer ? `https://wa.me/${customerWaPhone}?text=${customerWaText}` : "";
    const liveFromIframe = await requestLiveSimConfig(pergolaSimIframeRef.current?.contentWindow ?? null);
    const liveSimForShare = liveFromIframe ?? lastLiveSimConfigRef.current;
    const pergolaSimShareCfg = {
      ...mergePergolaShareWithLive(buildPergolaShareConfig(), liveSimForShare),
      env: normPergolaShareEnv(liveFromIframe?.env) || pergolaSimEnv,
    };
    const pergolaSimShareUrl = await createShortShareUrl({
      k: "p",
      n: sysContractorName.trim() || "הקבלן שלך",
      p: pergolaSimShareCfg,
    });
    const pergolaSimWaHref = buildSimWhatsAppUrl(custPhone, sysContractorName, pergolaSimShareUrl);

    w.document.write(`
      <html dir="rtl" lang="he"><head><title>הצעת מחיר - ${custName || "לקוח"}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;700;800&display=swap');
        body{font-family:'Assistant',sans-serif;padding:40px;background:#f8fafc;color:#0f172a;margin:0;}
        .print-container{max-width:900px;margin:0 auto;background:white;padding:40px;box-shadow:0 10px 25px rgba(0,0,0,0.1);border-radius:16px;border:1px solid #e2e8f0;}
        .header{border-bottom:4px solid #2563eb;padding-bottom:20px;margin-bottom:30px;display:flex;justify-content:space-between;align-items:flex-start;}
        .title-box{background:#eff6ff;padding:15px;border-radius:12px;border:1px solid #bfdbfe;text-align:left;}
        .spec-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;background:#f8fafc;padding:25px;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:30px;}
        .spec-full{grid-column:1/-1;border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:10px;}
        .price-box{margin-top:30px;padding:25px;background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;display:flex;justify-content:space-between;align-items:center;}
        .signatures{margin-top:60px;display:flex;justify-content:space-between;padding:0 40px;}
        .sig-line{border-top:1px solid #000;padding-top:10px;width:30%;text-align:center;font-weight:bold;}
        .no-print{display:block;}
        @media print{
          @page{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
          *,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          .no-print{display:none!important;}
          body{background:#fff!important;padding:0}
          .print-container{box-shadow:none;padding:0;border:none;background:#fff!important}
          .header{border-bottom:4px solid #2563eb!important}
          .title-box{background:linear-gradient(180deg,#eff6ff,#eff6ff)!important;border:1px solid #bfdbfe!important}
          .price-box{background:linear-gradient(180deg,#eff6ff,#eff6ff)!important;border:1px solid #bfdbfe!important}
          .spec-grid{background:linear-gradient(180deg,#f8fafc,#f8fafc)!important;border:1px solid #e2e8f0!important}
          h1,h2,h3,p,li,span,div{color:inherit!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }
      </style></head><body>
      <div class="print-container">
      ${getLogoHtml()}
      <div class="header">
        <div>
          <h1 style="font-size:32px;font-weight:800;color:#1e3a8a;margin:0 0 5px 0;">${sysContractorName}</h1>
          ${sysCompanyId ? `<p style="margin:0;font-size:14px;font-weight:bold;color:#475569;">ח.פ / עוסק מורשה: ${sysCompanyId}</p>` : ""}
          <div style="margin-top:10px;font-size:14px;color:#475569;">
            ${sysPhone ? `<span>📞 ${sysPhone}</span> &nbsp;|&nbsp; ` : ""}${sysAddress ? `<span>📍 ${sysAddress}</span> &nbsp;|&nbsp; ` : ""}${sysEmail ? `<span>✉️ ${sysEmail}</span>` : ""}
          </div>
        </div>
        <div class="title-box">
          <h2 style="font-size:20px;font-weight:bold;color:#1e40af;margin:0;">הצעת מחיר</h2>
          <p style="font-weight:bold;color:#2563eb;margin:5px 0 0 0;">${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>
      <div class="spec-grid">
        <div class="spec-full">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0 0 5px 0;">פרטי לקוח</h3>
          <p style="margin:3px 0;"><strong>שם הלקוח:</strong> ${custName || "-"}</p>
          <p style="margin:3px 0;"><strong>כתובת הלקוח:</strong> ${custAddress || "-"}</p>
          <p style="margin:3px 0;"><strong>מספר טלפון:</strong> ${custPhone || "-"}</p>
          ${activeBundleUnitLabel ? `<p style="margin:3px 0;"><strong>מיקום במבנה:</strong> ${escapeHtmlForQuote(activeBundleUnitLabel)}</p>` : ""}
        </div>
        <div class="spec-full" style="border:none;margin:0;padding:0;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:10px 0 5px 0;">מפרט הפרגולה${activeBundleUnitLabel ? ` — ${escapeHtmlForQuote(activeBundleUnitLabel)}` : ""}</h3>
        </div>
        <div><p style="margin:5px 0;"><strong>מידות:</strong> ${dimensionsText}</p></div>
        <div><p style="margin:5px 0;"><strong>סוג מסגרת:</strong> ${frameLabel}</p></div>
        <div><p style="margin:5px 0;"><strong>גוון מסגרת:</strong> ${pergolaResult.viewColorDisplay.split("|")[0]?.replace("מסגרת: ", "")?.trim() || colorSelect}</p></div>
        <div><p style="margin:5px 0;"><strong>גוון הצללה:</strong> ${pergolaResult.viewColorDisplay.split("|")[1]?.replace("הצללה: ", "")?.trim() || shadeColorSelect}</p></div>
        <div><p style="margin:5px 0;"><strong>חציצים (${divSizeStr}):</strong> ${nDividersTotal === 0 ? "ללא" : nDividersTotal + " יחידות"}</p></div>
        <div><p style="margin:5px 0;"><strong>עמודי תמיכה:</strong> ${postsStr}</p></div>
        <div><p style="margin:5px 0;"><strong>פרופיל הצללה:</strong> ${shadingLabel}</p></div>
        <div><p style="margin:5px 0;"><strong>מרווח שלבים:</strong> ${spacing} ס"מ</p></div>
        <div><p style="margin:5px 0;"><strong>תאורת לד:</strong> ${ledLabel}</p></div>
        <div><p style="margin:5px 0;"><strong>מאווררים:</strong> ${fansStr}</p></div>
        <div class="spec-full" style="border:none;padding:0;margin-top:5px;"><p style="margin:0;"><strong>קירוי סנטף BH פלרם:</strong> ${hasSantafStr}</p></div>
        <div class="spec-full" style="border:none;padding:0;margin-top:8px;">
          <p style="margin:0;"><strong>סגירת ויטרינות:</strong> ${hasVitrines ? `כן (${vitrineRowsForQuote.length} פתחים)` : "לא"}</p>
        </div>
      </div>
      ${
        hasVitrines && vitrineRowsForQuote.length > 0
          ? `<div style="margin:22px 0 30px 0;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;">
              <div style="background:#ecfeff;padding:10px 14px;font-weight:800;color:#0f766e;">פירוט ויטרינות</div>
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead style="background:#f8fafc;">
                  <tr>
                    <th style="padding:6px;border:1px solid #cbd5e1;">#</th>
                    <th style="padding:6px;border:1px solid #cbd5e1;">מידות (ס"מ)</th>
                    <th style="padding:6px;border:1px solid #cbd5e1;">פרופיל</th>
                    <th style="padding:6px;border:1px solid #cbd5e1;">מ״ר</th>
                    <th style="padding:6px;border:1px solid #cbd5e1;">מחיר לפני מע"מ</th>
                    <th style="padding:6px;border:1px solid #cbd5e1;">הערה</th>
                  </tr>
                </thead>
                <tbody>${vitrineRowsHtml}</tbody>
              </table>
            </div>`
          : ""
      }
      <div id="sim-section" style="margin-bottom:30px;page-break-inside:avoid;">
        <div class="no-print" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0;">הדמיה (לפי הנתונים שהוזנו)</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${
              pergolaSimWaHref
                ? `<a id="btn-whatsapp-sim" href="${pergolaSimWaHref}" target="_self" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#0d9488;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🎥 שלח הדמיה בוואטסאפ</a>`
                : ""
            }
            ${
              canSendToCustomer
                ? `<a id="btn-whatsapp-quote" href="${customerWaHref}" target="_self" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#16a34a;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">📲 שלח בוואטסאפ ללקוח</a>`
                : `<button id="btn-whatsapp-quote" style="background:#94a3b8;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:not-allowed;border:none;" disabled>📲 שלח בוואטסאפ ללקוח</button>`
            }
            <button id="btn-close-quote" style="background:#334155;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">✖️ סגור</button>
            <button id="btn-print-quote" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🖨️ הדפס סיכום</button>
          </div>
        </div>
        <iframe id="quote-sim-iframe" title="הדמיה תלת-ממד פרגולה" src="/sim.html?rev=${SIM_VERSION}&env=${pergolaSimShareCfg.env || "villa"}" style="width:100%;height:380px;border:1px solid #e2e8f0;border-radius:12px;background:#f1f5f9;" referrerPolicy="no-referrer"></iframe>
      </div>
      <script>
      (function(){
        var btn=document.getElementById('btn-print-quote');
        var closeBtn=document.getElementById('btn-close-quote');
        var waBtn=document.getElementById('btn-whatsapp-quote');
        var simWaBtn=document.getElementById('btn-whatsapp-sim');
        var waUrl=${JSON.stringify(customerWaHref)};
        var simWaUrl=${JSON.stringify(pergolaSimWaHref)};
        var simShareText=${JSON.stringify(`הדמיה מאת ${sysContractorName.trim() || "הקבלן שלך"}\n${pergolaSimShareUrl}`)};
        var hasManualVitrineOpenings=${vitrineRowsForQuote.length > 0 ? "true" : "false"};
        if(!btn)return;
        var iframe=document.getElementById('quote-sim-iframe');
        // Apply live config into sim.html (3D)
        var applyCfg=function(){
          try{
            if(!iframe||!iframe.contentWindow) return;
            iframe.contentWindow.postMessage({ type:'applyExternalConfig', config: ${JSON.stringify({
              ...pergolaSimShareCfg,
            })} }, '*');
          }catch(e){}
        };
        if (iframe) iframe.onload = function(){ setTimeout(applyCfg, 150); };
        setTimeout(applyCfg, 600);
        if (closeBtn) {
          closeBtn.onclick=function(){
            try { window.close(); } catch(e) {}
            setTimeout(function(){
              if(!window.closed){
                try { window.location.href = '/'; } catch(e) {}
              }
            }, 120);
          };
        }
        if (waBtn) {
          var goWhatsApp = function(ev){
            if(ev && ev.preventDefault) ev.preventDefault();
            if(!waUrl){ alert('לא נמצא מספר טלפון לקוח תקין בפרטים.'); return; }
            var wapp = null;
            try { wapp = window.open(waUrl, '_blank'); } catch(e) {}
            if (!wapp) {
              try { window.location.href = waUrl; } catch(e) {}
            }
          };
          waBtn.onclick = goWhatsApp;
          waBtn.addEventListener('touchend', goWhatsApp, { passive: false });
        }
        if (simWaBtn && simWaUrl) {
          var goSimWhatsApp = function(ev){
            if(ev && ev.preventDefault) ev.preventDefault();
            if (simShareText && navigator.clipboard && navigator.clipboard.writeText) {
              try { navigator.clipboard.writeText(simShareText); } catch(e) {}
            }
            var wapp = null;
            try { wapp = window.open(simWaUrl, '_blank'); } catch(e) {}
            if (!wapp) {
              try { window.location.href = simWaUrl; } catch(e) {}
            }
          };
          simWaBtn.onclick = goSimWhatsApp;
          simWaBtn.addEventListener('touchend', goSimWhatsApp, { passive: false });
        }
        var discOn=false;
        var bindDiscountToggle=function(){
          var discBtn=document.getElementById('btn-toggle-discount');
          var discOrig=document.getElementById('discount-original-wrap');
          var discSaved=document.getElementById('discount-saved-line');
          if(!discBtn || !discOrig || discBtn.getAttribute('data-bound')==='1') return;
          discBtn.setAttribute('data-bound','1');
          discBtn.onclick=function(){
            discOn=!discOn;
            discOrig.style.display=discOn?'block':'none';
            if(discSaved) discSaved.style.display=discOn?'block':'none';
            discBtn.textContent=discOn?'🏷️ הסתר מחיר מקורי':'🏷️ הצג הנחה ללקוח';
          };
        };
        setTimeout(bindDiscountToggle, 0);
        var simHasVitrines=function(){
          try{
            if(!iframe || !iframe.contentWindow || !iframe.contentWindow.document) return false;
            var doc=iframe.contentWindow.document;
            var front=doc.getElementById('input-vitrine-front');
            var right=doc.getElementById('input-vitrine-right');
            var left=doc.getElementById('input-vitrine-left');
            var vals=[front,right,left]
              .map(function(el){ return el && typeof el.value==='string' ? el.value : 'none'; });
            return vals.some(function(v){ return v && v !== 'none'; });
          }catch(e){
            return false;
          }
        };
        btn.onclick=function(){
          if(simHasVitrines() && !hasManualVitrineOpenings){
            alert('זוהתה סגירת ויטרינות בהדמיה, אבל לא הוזנו מידות פתחים להצעת המחיר. יש להזין מידות בפרגולות > סגירה / ויטרינות ואז להדפיס שוב.');
            return;
          }
          btn.disabled=true;btn.textContent='מדפיס...';
          setTimeout(function(){window.print();btn.disabled=false;btn.textContent='🖨️ הדפס סיכום';},50);
        };
      })();
      <\/script>
      <div class="price-box">
        <div>
          <h3 style="font-weight:bold;color:#334155;margin:0 0 10px 0;border-bottom:1px solid #bfdbfe;padding-bottom:5px;">פירוט עלויות:</h3>
          <ul style="margin:0;padding-right:20px;font-size:14px;color:#475569;line-height:1.6;">
            <li>עלות פרגולה (${pergolaResult.sqm.toFixed(1)} מ"ר): <strong>₪${Math.round(basicQuoteExVat).toLocaleString()}</strong></li>
            ${installCostQuote > 0 ? `<li>התקנה והובלה: <strong>₪${Math.round(installCostQuote).toLocaleString()}</strong></li>` : ""}
            ${vitrineExVat > 0 ? `<li>סגירת ויטרינות: <strong>₪${Math.round(vitrineExVat).toLocaleString()}</strong></li>` : ""}
            <li>מע"מ (${vatPercentLabelUi}): <strong>₪${Math.round(vatAmount).toLocaleString()}</strong></li>
          </ul>
        </div>
        <div style="text-align:left;">
          ${
            showCustomerDiscountOption
              ? `<button id="btn-toggle-discount" type="button" class="no-print" style="display:inline-block;margin:0 0 10px 0;background:#b45309;color:white;padding:8px 12px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:13px;">🏷️ הצג הנחה ללקוח</button>
                <div id="discount-original-wrap" style="display:none;margin-bottom:8px;">
                  <p style="margin:0;font-size:18px;font-weight:700;color:#94a3b8;text-decoration:line-through;">₪ ${liveTotalIncVat.toLocaleString()}</p>
                  <p style="margin:4px 0 0 0;font-size:13px;font-weight:800;color:#b45309;">מחיר אחרי הנחה</p>
                </div>`
              : ""
          }
          <p style="font-weight:bold;color:#1d4ed8;margin:0 0 5px 0;">סה"כ לתשלום (כולל מע"מ):</p>
          <h3 style="font-size:42px;font-weight:900;color:#1e3a8a;margin:0;">₪ ${dealIncRounded.toLocaleString()}</h3>
          ${
            showCustomerDiscountOption
              ? `<p id="discount-saved-line" style="display:none;margin:8px 0 0 0;font-size:13px;font-weight:800;color:#047857;">חיסכון ללקוח: ₪ ${customerDiscountSaved.toLocaleString()}</p>`
              : ""
          }
        </div>
      </div>
      <div class="terms-box">
        <h4 style="margin:0 0 8px 0;font-size:16px;font-weight:800;color:#0f172a;">תנאים כלליים</h4>
        <ul style="margin:0;padding-right:18px;font-size:13px;line-height:1.55;color:#334155;">
          <li>תוקף ההצעה: 14 ימים. אספקה: עד ${escapeHtmlForQuote(deliveryDaysTerm)} ימי עסקים לאחר מקדמה ומדידה בשטח.</li>
          <li>תנאי תשלום: ${escapeHtmlForQuote(paymentStage1Term)}% מקדמה | ${escapeHtmlForQuote(paymentStage2Term)}% באספקת חומרים/תחילת התקנה | ${escapeHtmlForQuote(paymentStage3Term)}% בסיום העבודה.</li>
          <li>הסחורה נשארת בבעלות החברה עד לפירעון מלא של התשלום.</li>
          <li>המחיר אינו כולל: חשמל, היתרים, תשתיות/פינוי, מנוף/במה לפי צורך.</li>
          <li>אחריות: ${escapeHtmlForQuote(warrantyYearsTerm)} שנים על טיב ההתקנה (צבע ופרזול לפי תנאי יצרן).</li>
          <li>תחילת עבודה בכפוף לאישור ההצעה ותשלום מקדמה.</li>
        </ul>
      </div>
      <div class="signatures">
        <div class="sig-line">חתימת לקוח</div>
        ${buildContractorSignatureHtml(sysContractorName, escapeHtmlForQuote)}
      </div>
      </div></body></html>`);
    w.document.close();
  }, [pergolaResult, custName, custPhone, custAddress, sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, getLogoHtml, showAlert, lengthWall, exitWidth, isLShape, lWallWidth, dividerSize, dividerSmoothCount, dividerLedCount, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, frameType, shadingProfile, spacing, postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postType, colorSelect, shadeColorSelect, simCaption, vatPercentLabelUi, hasVitrines, vitrineQuote, businessVatDecimal, sysQuoteDeliveryDays, sysWorkWarrantyYears, sysPaymentStage1Percent, sysPaymentStage2Percent,     sysPaymentStage3Percent, resolveActiveBundleUnitLabel, bundleProjectId, activeUnitId, crmData, pergolaCrmEditId]);

  const printBundleCustomerQuote = useCallback(() => {
    if (bundleProjectId == null) {
      showAlert("פתח פרויקט משולב תחילה");
      return;
    }
    const proj = crmData.find((p) => p.id === bundleProjectId);
    if (!proj || !projectIsBundle(proj)) return;

    let units = (proj.units ?? []).map((u) => ({ ...u }));
    if (activeUnitId) {
      const idx = units.findIndex((u) => u.id === activeUnitId);
      if (idx >= 0) units[idx] = snapshotActiveUnitRef.current(units[idx]);
    }
    if (units.length === 0) {
      showAlert("הוסף לפחות מוצר אחד לפרויקט");
      return;
    }

    const snapProj = { ...proj, units, ...recalcBundleTotals(units) };
    setCrmData((prev) => prev.map((p) => (p.id === bundleProjectId ? snapProj : p)));

    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון.");

    const deliveryDaysTerm = String(sysQuoteDeliveryDays || "").trim() || "X";
    const warrantyYearsTerm = String(sysWorkWarrantyYears || "").trim() || "X";
    const paymentStage1Term = String(sysPaymentStage1Percent || "").trim() || "50";
    const paymentStage2Term = String(sysPaymentStage2Percent || "").trim() || "40";
    const paymentStage3Term = String(sysPaymentStage3Percent || "").trim() || "10";

    w.document.write(
      buildBundleCustomerQuoteHtml(snapProj, {
        contractorName: sysContractorName,
        companyId: sysCompanyId,
        phone: sysPhone,
        address: sysAddress,
        email: sysEmail,
        logoHtml: getLogoHtml(),
        vatPercentLabel: vatPercentLabelUi,
        deliveryDays: deliveryDaysTerm,
        warrantyYears: warrantyYearsTerm,
        paymentStage1: paymentStage1Term,
        paymentStage2: paymentStage2Term,
        paymentStage3: paymentStage3Term,
        vitrine7000PriceSqm: Math.max(0, parseFloat(sysVitrine7000PriceSqm) || 0),
        vitrine9000PriceSqm: Math.max(0, parseFloat(sysVitrine9000PriceSqm) || 0),
        vatDecimal: businessVatDecimal,
      })
    );
    w.document.close();
  }, [
    activeUnitId,
    bundleProjectId,
    crmData,
    getLogoHtml,
    showAlert,
    sysAddress,
    sysCompanyId,
    sysContractorName,
    sysEmail,
    sysPaymentStage1Percent,
    sysPaymentStage2Percent,
    sysPaymentStage3Percent,
    sysPhone,
    sysQuoteDeliveryDays,
    sysWorkWarrantyYears,
    vatPercentLabelUi,
    sysVitrine7000PriceSqm,
    sysVitrine9000PriceSqm,
    businessVatDecimal,
    buildPergolaShareConfig,
    pergolaSimEnv,
  ]);

  const handleWhatsAppOrder = useCallback((kind: "pergola" | "fence") => {
    const contractorHeader =
      "פרטי הקבלן (שולח ההזמנה):\n" +
      `אימייל: ${sysEmail || "-"}\n`;

    const fenceSegmentsForMessage = fenceSegments.filter((s) => s.L > 0 && s.H > 0);
    const fenceSegmentsLines =
      fenceSegmentsForMessage.length > 0
        ? fenceSegmentsForMessage
            .map((s, i) => {
              const title = fenceSegTitle(fenceSegmentsForMessage, i, fenceSimEnv);
              const corner = fenceSegIsContinue(s)
                ? " | המשך באותו כיוון"
                : fenceSegIsCorner(s)
                  ? " | פינה 90°"
                  : "";
              return `• ${title}: אורך ${s.L} ס"מ | גובה ${s.H} ס"מ${corner}`;
            })
            .join("\n")
        : "• לא הוזנו מקטעים תקינים";

    const message =
      kind === "fence"
        ? "סיכום הזמנת קיט גדר - ירחי אלומיניום\n" +
          "\n" +
          contractorHeader +
          "\n" +
          "פרטי לקוח הקצה:\n" +
          `שם: ${fenceCustName || "-"}\n` +
          "\n" +
          "מפרט טכני - גדר:\n" +
          "מקטעים:\n" +
          `${fenceSegmentsLines}\n` +
          `סוג שלב: ${fenceSlat}\n` +
          `מרווח בין שלבים: ${fenceGap} ס\"מ\n` +
          `צבע מסגרת: ${fenceColor}\n` +
          `צבע שלבים: ${fenceSlatColor}\n` +
          `מספר מקטעים: ${fenceSegments.filter((s) => s.L > 0 && s.H > 0).length}\n` +
          `סה\"כ אורך: ${fenceSegments.filter((s) => s.L > 0).reduce((sum, s) => sum + s.L, 0)} ס\"מ`
        : "סיכום הזמנת קיט פרגולה - ירחי אלומיניום\n" +
          "\n" +
          contractorHeader +
          "\n" +
          "פרטי לקוח הקצה:\n" +
          `שם: ${custName}\n` +
          "\n" +
          "מפרט טכני - פרגולה:\n" +
          `מידות: רוחב ${lengthWall} ס\"מ | יציאה ${exitWidth} ס\"מ\n` +
          `פרגולת ר': ${
            isLShape
              ? "כן - רוחב קיר: " + lWallWidth + ", עומק: " + lWallDepth + ", צד: " + lShapeSide
              : "לא"
          }\n` +
          `צבע מסגרת: ${colorSelect}\n` +
          `צבע הצללה: ${shadeColorSelect}\n` +
          `סוג מסגרת (היקפי): ${frameType}\n` +
          `פרופיל חלוקה/קסטות: ${dividerSize}\n` +
          `פרופיל הצללה (חציצים): ${shadingProfile}\n` +
          `מרווח בין חציצים: ${spacing} ס\"מ\n` +
          "\n" +
          "תוספות וקירוי:\n" +
          `סנטף: ${hasSantaf ? "כן, צבע: " + santafColor : "ללא"}\n` +
          `אף מים: ${hasSantaf ? dripEdgeType : "ללא"}\n` +
          `תאורת לד: ${hasLed ? "כן, כמות: " + ledCount + ", צבע: " + ledColor : "ללא"}\n` +
          `מאוורר: ${hasFan ? "כן, כמות: " + fanCount : "ללא"}\n` +
          `עמודים: ${
            Number(postCount) > 0
              ? postCount + " עמודים, סוג: " + postType + ", גובה: " + postHeight + " ס\"מ"
              : "ללא עמודים"
          }\n` +
          `מותחנים: ${
            Number(tensionerCount) > 0
              ? tensionerCount + " מותחנים, צבע: " + tensionerColor
              : "ללא מותחנים"
          }`;

    const encodedMessage = encodeURIComponent(message);
    window.open("https://wa.me/972522288798?text=" + encodedMessage, "_blank");
  }, [
    sysEmail,
    custName,
    fenceCustName,
    fenceSlat,
    fenceGap,
    fenceColor,
    fenceSlatColor,
    fenceInGround,
    fenceSegments,
    fenceSimEnv,
    lengthWall,
    exitWidth,
    isLShape,
    lWallWidth,
    lWallDepth,
    lShapeSide,
    colorSelect,
    shadeColorSelect,
    frameType,
    dividerSize,
    shadingProfile,
    spacing,
    hasSantaf,
    santafColor,
    dripEdgeType,
    hasLed,
    ledCount,
    ledColor,
    hasFan,
    fanCount,
    postCount,
    postCountFront,
    postCountRight,
    postCountLeft,
    postCountBack,
    postType,
    postHeight,
    tensionerCount,
    tensionerColor,
  ]);

  const switchView = useCallback((view: ViewId) => {
    router.push("/?view=" + view);
    requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }, [router]);

  const saveSysSettings = useCallback(() => {
    if (typeof window === "undefined") return;
    const map: Record<string, string> = {
      sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption,
      sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice,
      pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice, sysVitrine7000PriceSqm, sysVitrine9000PriceSqm, sysVatPercent, sysQuoteDeliveryDays, sysWorkWarrantyYears,
      sysPaymentStage1Percent, sysPaymentStage2Percent, sysPaymentStage3Percent,
    };
    Object.entries(map).forEach(([k, v]) => localStorage.setItem("yarhi_" + k, String(v)));
    void persistWorkspaceNowRef.current();
  }, [sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption, sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice, pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice, sysVitrine7000PriceSqm, sysVitrine9000PriceSqm, sysVatPercent, sysQuoteDeliveryDays, sysWorkWarrantyYears, sysPaymentStage1Percent, sysPaymentStage2Percent, sysPaymentStage3Percent]);

  const bundleProject = useMemo(
    () => (bundleProjectId != null ? crmData.find((p) => p.id === bundleProjectId) : undefined),
    [bundleProjectId, crmData]
  );

  const bundleCustomerPreview = useMemo(() => {
    if (currentView === "data") return custName;
    if (currentView === "fences") return fenceCustName;
    if (fieldWindowsOpenRecordId) {
      const rec = fieldWindowRecords.find((r) => r.id === fieldWindowsOpenRecordId);
      return rec?.title ?? "";
    }
    return fieldWindowRecords[0]?.title ?? "";
  }, [currentView, custName, fenceCustName, fieldWindowsOpenRecordId, fieldWindowRecords]);

  const isProductView = currentView === "data" || currentView === "fences" || currentView === "field-windows";

  const capturePergolaFormState = useCallback((): Record<string, unknown> => {
    const totalPostsBySide =
      (parseInt(postCountFront, 10) || 0) +
      (parseInt(postCountRight, 10) || 0) +
      (parseInt(postCountLeft, 10) || 0) +
      (parseInt(postCountBack, 10) || 0);
    return {
      custName,
      custPhone,
      custAddress,
      custInternalNotes,
      lengthWall,
      exitWidth,
      isLShape,
      lWallWidth,
      lWallDepth,
      lShapeSide,
      colorSelect,
      shadeColorSelect,
      frameType,
      dividerSize,
      dividerSmoothCount,
      dividerLedCount,
      shadingProfile,
      spacing,
      hasLed,
      ledCount,
      ledColor,
      hasFan,
      fanCount,
      hasSantaf,
      santafColor,
      dripEdgeType,
      postCount: totalPostsBySide > 0 ? totalPostsBySide : postCount,
      postCountFront,
      postCountRight,
      postCountLeft,
      postCountBack,
      postHeight,
      postType,
      tensionerCount,
      tensionerColor,
      hasVitrines,
      vitrineOpenings: vitrineOpenings.map((opening) => ({
        id: opening.id,
        widthCm: opening.widthCm,
        heightCm: opening.heightCm,
        profile: opening.profile,
        note: opening.note,
      })),
    };
  }, [
    custName, custPhone, custAddress, custInternalNotes, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide,
    colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile, spacing,
    hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType, postCount, postCountFront,
    postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor, hasVitrines, vitrineOpenings,
  ]);

  const applyPergolaFormState = useCallback((state: Record<string, unknown>) => {
    PERGOLA_IDS.forEach((fieldKey) => {
      const v = state[fieldKey];
      if (v === undefined) return;
      if (fieldKey === "custName") setCustName(String(v));
      else if (fieldKey === "custPhone") setCustPhone(String(v));
      else if (fieldKey === "custAddress") setCustAddress(String(v));
      else if (fieldKey === "custInternalNotes") setCustInternalNotes(String(v));
      else if (fieldKey === "lengthWall") setLengthWall(String(v));
      else if (fieldKey === "exitWidth") setExitWidth(String(v));
      else if (fieldKey === "isLShape") setIsLShape(Boolean(v));
      else if (fieldKey === "lWallWidth") setLWallWidth(String(v));
      else if (fieldKey === "lWallDepth") setLWallDepth(String(v));
      else if (fieldKey === "lShapeSide") setLShapeSide((v as "left") || "right");
      else if (fieldKey === "colorSelect") setColorSelect(String(v));
      else if (fieldKey === "shadeColorSelect") setShadeColorSelect(String(v));
      else if (fieldKey === "frameType") setFrameType(String(v));
      else if (fieldKey === "dividerSize") setDividerSize(String(v));
      else if (fieldKey === "dividerSmoothCount") setDividerSmoothCount(String(v));
      else if (fieldKey === "dividerLedCount") setDividerLedCount(String(v));
      else if (fieldKey === "shadingProfile") setShadingProfile(String(v));
      else if (fieldKey === "spacing") setSpacing(String(v));
      else if (fieldKey === "hasLed") setHasLed(Boolean(v));
      else if (fieldKey === "ledCount") setLedCount(String(v));
      else if (fieldKey === "ledColor") setLedColor(String(v));
      else if (fieldKey === "hasFan") setHasFan(Boolean(v));
      else if (fieldKey === "fanCount") setFanCount(String(v));
      else if (fieldKey === "hasSantaf") setHasSantaf(Boolean(v));
      else if (fieldKey === "santafColor") setSantafColor(String(v));
      else if (fieldKey === "dripEdgeType") setDripEdgeType(String(v));
      else if (fieldKey === "postCount") {
        setPostCount(String(v));
        setPostCountFront(String(v));
      } else if (fieldKey === "postCountFront") setPostCountFront(String(v));
      else if (fieldKey === "postCountRight") setPostCountRight(String(v));
      else if (fieldKey === "postCountLeft") setPostCountLeft(String(v));
      else if (fieldKey === "postCountBack") setPostCountBack(String(v));
      else if (fieldKey === "postHeight") setPostHeight(String(v));
      else if (fieldKey === "postType") setPostType(String(v));
      else if (fieldKey === "tensionerCount") setTensionerCount(String(v));
      else if (fieldKey === "tensionerColor") setTensionerColor(String(v));
    });
    setHasVitrines(Boolean(state.hasVitrines));
    if (Array.isArray(state.vitrineOpenings)) {
      const parsedOpenings = state.vitrineOpenings
        .map((item, i) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const profile = row.profile === "9000" ? "9000" : "7000";
          return {
            id: typeof row.id === "number" ? row.id : Date.now() + i,
            widthCm: String(row.widthCm ?? ""),
            heightCm: String(row.heightCm ?? ""),
            profile: profile as VitrineProfile,
            note: String(row.note ?? ""),
          };
        })
        .filter((row): row is VitrineOpening => Boolean(row));
      setVitrineOpenings(parsedOpenings.length > 0 ? parsedOpenings : [createVitrineOpening(1)]);
    } else {
      setVitrineOpenings([createVitrineOpening(1)]);
    }
  }, []);

  const applyFenceFormState = useCallback((state: Record<string, unknown>) => {
    const s = state as {
      fenceCustName?: string;
      fenceCustPhone?: string;
      fenceCustAddress?: string;
      fenceCustInternalNotes?: string;
      fenceSlat?: string;
      fenceGap?: string;
      fenceColor?: string;
      fenceSlatColor?: string;
      fenceInGround?: boolean;
      segs?: { L: number; H: number; P: number; connected?: boolean; corner?: boolean }[];
      fenceSimGate?: "none" | "single" | "double";
    };
    setFenceCustName(s.fenceCustName ?? "");
    setFenceCustPhone(s.fenceCustPhone ?? "");
    setFenceCustAddress(s.fenceCustAddress ?? "");
    setFenceCustInternalNotes(s.fenceCustInternalNotes ?? "");
    setFenceSlat(s.fenceSlat ?? "100");
    setFenceGap(s.fenceGap ?? "2");
    setFenceColor(s.fenceColor ?? "RAL 9016");
    setFenceSlatColor(s.fenceSlatColor ?? "RAL 9016");
    setFenceInGround(false);
    if (s.segs && s.segs.length > 0) setFenceSegments(s.segs.map((seg, i) => ({ id: Date.now() + i, ...seg })));
    else setFenceSegments(emptyFenceFronts());
    setFenceSimGate(normFenceShareGate(s.fenceSimGate));
  }, []);

  const snapshotActiveUnit = useCallback(
    (unit: ProjectUnit): ProjectUnit => {
      if (unit.type === "pergola") {
        const formState = capturePergolaFormState();
        const vitrineExVat = hasVitrines ? vitrineQuote.exVat : 0;
        const liveExVat = pergolaResult.exVat + vitrineExVat;
        const liveIncVat = incVatFromExVat(liveExVat, businessVatDecimal);
        const calcPending =
          liveIncVat <= 0 && pergolaFormHasDimensions(formState) && (unit.sellingPriceInc ?? 0) > 0;
        if (calcPending) {
          return { ...unit, formState };
        }
        return {
          ...unit,
          formState,
          sellingPriceInc: liveIncVat,
          incomeExVat: liveExVat,
          vatAmount: liveIncVat - liveExVat,
          estExpense: pergolaResult.materialCost + pergolaResult.installCost,
        };
      }
      if (unit.type === "fence") {
        const formState = {
          fenceCustName,
          fenceCustPhone,
          fenceCustAddress,
          fenceCustInternalNotes,
          fenceSlat,
          fenceGap,
          fenceColor,
          fenceSlatColor,
          fenceInGround,
          segs: fenceSegsForFormState(fenceSegments),
          fenceSimGate,
        };
        const liveIncVat = fenceResult.sellIncVat;
        const calcPending =
          liveIncVat <= 0 && fenceFormHasSegments(formState) && (unit.sellingPriceInc ?? 0) > 0;
        if (calcPending) {
          return { ...unit, formState };
        }
        const base = exVatFromIncVat(liveIncVat, businessVatDecimal);
        const vat = vatFromIncVat(liveIncVat, businessVatDecimal);
        const totalLen = fenceSegments.filter((s) => s.L > 0).reduce((sum, s) => sum + s.L, 0);
        return {
          ...unit,
          formState,
          sellingPriceInc: liveIncVat,
          incomeExVat: base,
          vatAmount: vat,
          estExpense: 0,
          totalLength: totalLen,
        };
      }
      return {
        ...unit,
        fieldWindowRecordId: unit.fieldWindowRecordId,
        formState: { fieldWindowRecordId: unit.fieldWindowRecordId },
      };
    },
    [
      hasVitrines,
      vitrineQuote.exVat,
      pergolaResult,
      businessVatDecimal,
      capturePergolaFormState,
      fenceResult.sellIncVat,
      fenceSegments,
      fenceCustName,
      fenceCustPhone,
      fenceCustAddress,
      fenceCustInternalNotes,
      fenceSlat,
      fenceGap,
      fenceColor,
      fenceSlatColor,
      fenceInGround,
      fenceSimGate,
    ]
  );

  snapshotActiveUnitRef.current = snapshotActiveUnit;

  const loadBundleUnitIntoForms = useCallback(
    (unit: ProjectUnit, proj: CrmProject, options?: { skipViewSwitch?: boolean }) => {
      const bundleFs = (proj.formState ?? {}) as BundleFormState;
      setPergolaCrmEditId(null);
      lastLoadedBundleUnitRef.current = unit.id;
      if (unit.type === "pergola") {
        const fs = {
          ...defaultPergolaBundleFormState(proj.customer, bundleFs),
          ...((unit.formState ?? {}) as Record<string, unknown>),
        };
        applyPergolaFormState(fs);
        const saved = pergolaResultFromSavedUnit(unit);
        setPergolaResult(
          saved
            ? { ...EMPTY_PERGOLA_RESULT, incVat: saved.incVat, exVat: saved.exVat, materialCost: saved.estExpense }
            : EMPTY_PERGOLA_RESULT
        );
        if (!options?.skipViewSwitch) switchView("data");
        return;
      }
      if (unit.type === "fence") {
        const fs = {
          ...defaultFenceBundleFormState(proj.customer, bundleFs),
          ...((unit.formState ?? {}) as Record<string, unknown>),
        };
        applyFenceFormState(fs);
        const saved = fenceResultFromSavedUnit(unit);
        setFenceResult(
          saved
            ? { ...EMPTY_FENCE_RESULT, sellIncVat: saved.sellIncVat, sellExVat: saved.sellExVat, vatAmount: saved.vatAmount }
            : EMPTY_FENCE_RESULT
        );
        if (!options?.skipViewSwitch) switchView("fences");
        return;
      }
      setFieldWindowsOpenRecordId(unit.fieldWindowRecordId ?? null);
      if (!options?.skipViewSwitch) switchView("field-windows");
    },
    [applyFenceFormState, applyPergolaFormState, switchView]
  );

  const prepBundleCategoryShell = useCallback(
    (proj: CrmProject, unitType: ProjectUnitType) => {
      const bundleFs = (proj.formState ?? {}) as BundleFormState;
      if (unitType === "pergola") {
        applyPergolaFormState(defaultPergolaBundleFormState(proj.customer, bundleFs));
        setPergolaResult(EMPTY_PERGOLA_RESULT);
        return;
      }
      if (unitType === "fence") {
        applyFenceFormState(defaultFenceBundleFormState(proj.customer, bundleFs));
        setFenceResult(EMPTY_FENCE_RESULT);
        return;
      }
      setFieldWindowsOpenRecordId(null);
    },
    [applyFenceFormState, applyPergolaFormState]
  );

  const switchBundleUnit = useCallback(
    (unitId: string, options?: { skipViewSwitch?: boolean }) => {
      if (bundleProjectId == null) return;
      const proj = crmData.find((p) => p.id === bundleProjectId);
      if (!proj?.units) return;

      let units = proj.units.map((u) => ({ ...u }));
      if (activeUnitId && activeUnitId !== unitId) {
        const idx = units.findIndex((u) => u.id === activeUnitId);
        if (idx >= 0) units[idx] = snapshotActiveUnitRef.current(units[idx]);
      }
      const nextProj = { ...proj, units, ...recalcBundleTotals(units) };
      const targetUnit = units.find((u) => u.id === unitId);
      if (!targetUnit) return;

      bundleSyncingRef.current = true;
      setCrmData((prev) => prev.map((p) => (p.id === bundleProjectId ? nextProj : p)));
      setActiveUnitId(unitId);
      loadBundleUnitIntoForms(targetUnit, nextProj, options);
      queueMicrotask(() => {
        bundleSyncingRef.current = false;
      });
    },
    [activeUnitId, bundleProjectId, crmData, loadBundleUnitIntoForms]
  );

  const syncBundleWithProductView = useCallback(() => {
    if (bundleProjectId == null || bundleSyncingRef.current) return;
    const proj = crmData.find((p) => p.id === bundleProjectId);
    if (!proj || !projectIsBundle(proj)) return;
    if (currentView !== "data" && currentView !== "fences" && currentView !== "field-windows") return;

    const wantType = unitTypeForProductView(currentView);
    const units = proj.units ?? [];
    const active = activeUnitId ? units.find((u) => u.id === activeUnitId) : undefined;

    if (active?.type === wantType) {
      if (lastLoadedBundleUnitRef.current === active.id) return;
      bundleSyncingRef.current = true;
      loadBundleUnitIntoForms(active, proj, { skipViewSwitch: true });
      queueMicrotask(() => {
        bundleSyncingRef.current = false;
      });
      return;
    }

    const ofType = units.filter((u) => u.type === wantType);
    if (ofType.length > 0) {
      switchBundleUnit(ofType[ofType.length - 1].id, { skipViewSwitch: true });
      return;
    }

    if (activeUnitId && active) {
      const unitsSnap = units.map((u) => (u.id === activeUnitId ? snapshotActiveUnitRef.current(u) : u));
      const nextProj = { ...proj, units: unitsSnap, ...recalcBundleTotals(unitsSnap) };
      setCrmData((prev) => prev.map((p) => (p.id === bundleProjectId ? nextProj : p)));
      prepBundleCategoryShell(nextProj, wantType);
      return;
    }

    prepBundleCategoryShell(proj, wantType);
  }, [
    activeUnitId,
    bundleProjectId,
    crmData,
    currentView,
    loadBundleUnitIntoForms,
    prepBundleCategoryShell,
    switchBundleUnit,
  ]);

  const syncBundleWithProductViewRef = useRef(syncBundleWithProductView);
  syncBundleWithProductViewRef.current = syncBundleWithProductView;

  useEffect(() => {
    if (bundleProjectId == null) return;
    if (currentView !== "data" && currentView !== "fences" && currentView !== "field-windows") return;
    syncBundleWithProductViewRef.current();
  }, [bundleProjectId, currentView]);

  /** Keep bundle tab prices in sync when live calculation finishes */
  useEffect(() => {
    if (bundleProjectId == null || !activeUnitId || bundleSyncingRef.current) return;
    const proj = crmData.find((p) => p.id === bundleProjectId);
    const unit = proj?.units?.find((u) => u.id === activeUnitId);
    if (!unit) return;

    if (unit.type === "pergola" && currentView === "data" && pergolaResult.incVat > 0) {
      const vitrineExVat = hasVitrines ? vitrineQuote.exVat : 0;
      const exVat = pergolaResult.exVat + vitrineExVat;
      const incVat = incVatFromExVat(exVat, businessVatDecimal);
      const vatAmount = incVat - exVat;
      const estExpense = pergolaResult.materialCost + pergolaResult.installCost;
      if (
        unit.sellingPriceInc === incVat &&
        unit.incomeExVat === exVat &&
        unit.vatAmount === vatAmount &&
        unit.estExpense === estExpense
      ) {
        return;
      }
      setCrmData((prev) =>
        prev.map((p) => {
          if (p.id !== bundleProjectId || !p.units) return p;
          const units = p.units.map((u) =>
            u.id === activeUnitId
              ? {
                  ...u,
                  sellingPriceInc: incVat,
                  incomeExVat: exVat,
                  vatAmount,
                  estExpense,
                  formState: capturePergolaFormState(),
                }
              : u
          );
          return { ...p, units, ...recalcBundleTotals(units) };
        })
      );
      return;
    }

    if (unit.type === "fence" && currentView === "fences" && fenceResult.sellIncVat > 0) {
      const incVat = fenceResult.sellIncVat;
      const exVat = exVatFromIncVat(incVat, businessVatDecimal);
      const vatAmount = vatFromIncVat(incVat, businessVatDecimal);
      const totalLen = fenceSegments.filter((s) => s.L > 0).reduce((sum, s) => sum + s.L, 0);
      if (unit.sellingPriceInc === incVat && unit.incomeExVat === exVat && unit.vatAmount === vatAmount) {
        return;
      }
      setCrmData((prev) =>
        prev.map((p) => {
          if (p.id !== bundleProjectId || !p.units) return p;
          const units = p.units.map((u) =>
            u.id === activeUnitId
              ? {
                  ...u,
                  sellingPriceInc: incVat,
                  incomeExVat: exVat,
                  vatAmount,
                  totalLength: totalLen,
                  formState: {
                    fenceCustName,
                    fenceCustPhone,
                    fenceCustAddress,
                    fenceCustInternalNotes,
                    fenceSlat,
                    fenceGap,
                    fenceColor,
                    fenceSlatColor,
                    fenceInGround,
                    segs: fenceSegsForFormState(fenceSegments),
                    fenceSimGate,
                  },
                }
              : u
          );
          return { ...p, units, ...recalcBundleTotals(units) };
        })
      );
    }
  }, [
    activeUnitId,
    bundleProjectId,
    businessVatDecimal,
    capturePergolaFormState,
    crmData,
    currentView,
    fenceColor,
    fenceCustAddress,
    fenceCustInternalNotes,
    fenceCustName,
    fenceCustPhone,
    fenceGap,
    fenceInGround,
    fenceSimGate,
    fenceResult.sellIncVat,
    fenceSegments,
    fenceSlat,
    fenceSlatColor,
    hasVitrines,
    pergolaResult,
    vitrineQuote.exVat,
  ]);

  const startBundleWithCurrentProduct = useCallback(
    (label: string) => {
      const unitType: ProjectUnitType =
        currentView === "fences" ? "fence" : currentView === "field-windows" ? "field-windows" : "pergola";

      let customer = "";
      let phone = "";
      let address = "";

      if (unitType === "pergola") {
        customer = custName.trim();
        phone = custPhone.trim();
        address = custAddress.trim();
      } else if (unitType === "fence") {
        customer = fenceCustName.trim();
        phone = fenceCustPhone.trim();
        address = fenceCustAddress.trim();
      } else {
        const openId = fieldWindowsOpenRecordId;
        const rec = openId ? fieldWindowRecordsRef.current.find((r) => r.id === openId) : fieldWindowRecordsRef.current[0];
        customer = rec?.title?.trim() ?? "";
        phone = rec?.clientPhone?.trim() ?? "";
        address = rec?.clientAddress?.trim() ?? "";
      }

      if (!customer) {
        showAlert(
          unitType === "field-windows"
            ? "הזן שם לקוח / פרויקט במסך מידות חלונות לפני התחלת פרויקט משולב"
            : "הזן שם לקוח בטופס לפני התחלת פרויקט משולב"
        );
        return;
      }

      const id = Date.now();
      const unitId = newProjectUnitId();
      let fieldRecordId: string | undefined;

      if (unitType === "field-windows") {
        const openId = fieldWindowsOpenRecordId;
        if (openId) {
          fieldRecordId = openId;
          const nextRecords = fieldWindowRecordsRef.current.map((r) =>
            r.id === openId ? { ...r, title: label, clientPhone: phone || r.clientPhone, clientAddress: address || r.clientAddress } : r
          );
          fieldWindowRecordsRef.current = nextRecords;
          setFieldWindowRecords(nextRecords);
          handleFieldWindowRecordsChangeRef.current(nextRecords);
        } else {
          fieldRecordId = newFieldWindowRecordId();
          const record: FieldWindowRecord = {
            id: fieldRecordId,
            title: label,
            clientPhone: phone || undefined,
            clientAddress: address || undefined,
            items: [],
            createdAt: formatFieldWindowDate(),
            updatedAt: formatFieldWindowDate(),
          };
          const nextRecords = [record, ...fieldWindowRecordsRef.current];
          fieldWindowRecordsRef.current = nextRecords;
          setFieldWindowRecords(nextRecords);
          handleFieldWindowRecordsChangeRef.current(nextRecords);
          setFieldWindowsOpenRecordId(fieldRecordId);
        }
      }

      const draftUnit: ProjectUnit = {
        id: unitId,
        type: unitType,
        label,
        fieldWindowRecordId: fieldRecordId,
        sellingPriceInc: 0,
        incomeExVat: 0,
        vatAmount: 0,
        estExpense: 0,
      };
      const snappedUnit = snapshotActiveUnitRef.current(draftUnit);
      const units = [snappedUnit];
      const project: CrmProject = {
        id,
        date: new Date().toLocaleDateString("he-IL"),
        customer,
        isBundle: true,
        units,
        formState: { bundleCustomerPhone: phone, bundleCustomerAddress: address },
        crmStatus: DEFAULT_CRM_STATUS_AFTER_CALC_SAVE,
        crmStatusSince: new Date().toISOString(),
        ...recalcBundleTotals(units),
      };

      setCrmData((prev) => [project, ...prev]);
      setBundleProjectId(id);
      setActiveUnitId(unitId);
      lastLoadedBundleUnitRef.current = unitId;
      setPergolaCrmEditId(null);
      requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
      showAlert(`פרויקט משולב נפתח — מיקום: ${label}`);
    },
    [
      currentView,
      custName,
      custPhone,
      custAddress,
      fenceCustName,
      fenceCustPhone,
      fenceCustAddress,
      fieldWindowsOpenRecordId,
      showAlert,
    ]
  );

  const addBundleUnit = useCallback(
    (type: ProjectUnitType, label: string) => {
      if (bundleProjectId == null) return;
      let proj = crmData.find((p) => p.id === bundleProjectId);
      if (!proj) return;

      let units = [...(proj.units ?? [])];
      if (activeUnitId) {
        const idx = units.findIndex((u) => u.id === activeUnitId);
        if (idx >= 0) units[idx] = snapshotActiveUnitRef.current(units[idx]);
        proj = { ...proj, units, ...recalcBundleTotals(units) };
      }

      const bundleFs = (proj.formState ?? {}) as BundleFormState;
      const unitId = newProjectUnitId();
      let fieldRecordId: string | undefined;
      if (type === "field-windows") {
        fieldRecordId = newFieldWindowRecordId();
        const record: FieldWindowRecord = {
          id: fieldRecordId,
          title: label,
          clientPhone: bundleFs.bundleCustomerPhone,
          clientAddress: bundleFs.bundleCustomerAddress,
          items: [],
          createdAt: formatFieldWindowDate(),
          updatedAt: formatFieldWindowDate(),
        };
        const nextRecords = [record, ...fieldWindowRecordsRef.current];
        fieldWindowRecordsRef.current = nextRecords;
        setFieldWindowRecords(nextRecords);
        handleFieldWindowRecordsChangeRef.current(nextRecords);
      }
      const unit: ProjectUnit = {
        id: unitId,
        type,
        label,
        formState:
          type === "pergola"
            ? defaultPergolaBundleFormState(proj.customer, bundleFs)
            : type === "fence"
              ? defaultFenceBundleFormState(proj.customer, bundleFs)
              : { fieldWindowRecordId: fieldRecordId },
        fieldWindowRecordId: fieldRecordId,
        sellingPriceInc: 0,
        incomeExVat: 0,
        vatAmount: 0,
        estExpense: 0,
      };
      const nextUnits = [...(proj.units ?? []), unit];
      const nextProj = { ...proj, units: nextUnits, ...recalcBundleTotals(nextUnits) };
      setCrmData((prev) => prev.map((p) => (p.id === bundleProjectId ? nextProj : p)));
      setActiveUnitId(unitId);
      bundleSyncingRef.current = true;
      loadBundleUnitIntoForms(unit, nextProj);
      requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
      queueMicrotask(() => {
        bundleSyncingRef.current = false;
      });
      showAlert(`מוצר חדש: ${label} — הזן מידות`);
    },
    [activeUnitId, bundleProjectId, crmData, loadBundleUnitIntoForms, showAlert]
  );

  const removeBundleUnit = useCallback(
    (unitId: string) => {
      if (bundleProjectId == null) return;
      const proj = crmData.find((p) => p.id === bundleProjectId);
      if (!proj) return;

      let units = (proj.units ?? []).map((u) => ({ ...u }));
      if (activeUnitId && activeUnitId !== unitId) {
        const idx = units.findIndex((u) => u.id === activeUnitId);
        if (idx >= 0) units[idx] = snapshotActiveUnitRef.current(units[idx]);
      }
      const remaining = units.filter((u) => u.id !== unitId);
      const nextProj = { ...proj, units: remaining, ...recalcBundleTotals(remaining) };

      setCrmData((prev) => prev.map((p) => (p.id === bundleProjectId ? nextProj : p)));

      if (activeUnitId === unitId) {
        const next = remaining[0];
        setActiveUnitId(next?.id ?? null);
        if (next) {
          bundleSyncingRef.current = true;
          loadBundleUnitIntoForms(next, nextProj);
          queueMicrotask(() => {
            bundleSyncingRef.current = false;
          });
        }
      }

      showAlert("המוצר נמחק מהפרויקט");
    },
    [activeUnitId, bundleProjectId, crmData, loadBundleUnitIntoForms, showAlert]
  );

  const exitBundleMode = useCallback(() => {
    if (bundleProjectId != null && activeUnitId) {
      setCrmData((prev) =>
        prev.map((p) => {
          if (p.id !== bundleProjectId || !p.units) return p;
          const units = p.units.map((u) => (u.id === activeUnitId ? snapshotActiveUnitRef.current(u) : u));
          return { ...p, units, ...recalcBundleTotals(units) };
        })
      );
    }
    setBundleProjectId(null);
    setActiveUnitId(null);
    lastLoadedBundleUnitRef.current = null;
    showAlert("פרויקט משולב נסגר — הנתונים נשמרו ב-CRM");
  }, [activeUnitId, bundleProjectId, showAlert]);

  const loadProject = useCallback((id: number) => {
    const proj = crmData.find((p) => p.id === id);
    if (!proj) return;
    if (projectIsBundle(proj)) {
      setBundleProjectId(proj.id);
      setPergolaCrmEditId(null);
      setFenceCrmEditId(null);
      const first = proj.units?.[0];
      if (first) {
        setActiveUnitId(first.id);
        loadBundleUnitIntoForms(first, proj);
        switchView(viewForUnitType(first.type));
      } else {
        setActiveUnitId(null);
        switchView("data");
      }
      return;
    }
    setBundleProjectId(null);
    setActiveUnitId(null);
    if (proj.isLead) {
      setPergolaCrmEditId(null);
      setFenceCrmEditId(null);
      setHasVitrines(false);
      setVitrineOpenings([createVitrineOpening(1)]);
      openLeadEditor(proj);
      return;
    }
    const state = (proj.formState || {}) as Record<string, unknown>;
    if (proj.isFence) {
      setPergolaCrmEditId(null);
      setFenceCrmEditId(proj.id);
      setHasVitrines(false);
      setVitrineOpenings([createVitrineOpening(1)]);
      const s = state as {
        fenceCustName?: string;
        fenceCustPhone?: string;
        fenceCustAddress?: string;
        fenceCustInternalNotes?: string;
        fenceSlat?: string;
        fenceGap?: string;
        fenceColor?: string;
        fenceSlatColor?: string;
        fenceInGround?: boolean;
        segs?: { L: number; H: number; P: number; connected?: boolean; corner?: boolean }[];
        fenceSimGate?: "none" | "single" | "double";
      };
      setFenceCustName(s.fenceCustName ?? "");
      setFenceCustPhone(s.fenceCustPhone ?? "");
      setFenceCustAddress(s.fenceCustAddress ?? "");
      setFenceCustInternalNotes(s.fenceCustInternalNotes ?? "");
      setFenceSlat(s.fenceSlat ?? "100");
      setFenceGap(s.fenceGap ?? "2");
      setFenceColor(s.fenceColor ?? "RAL 9016");
      setFenceSlatColor(s.fenceSlatColor ?? "RAL 9016");
      setFenceInGround(false);
      if (s.segs && s.segs.length > 0) setFenceSegments(s.segs.map((seg, i) => ({ id: Date.now() + i, ...seg })));
      setFenceSimGate(normFenceShareGate(s.fenceSimGate));
      {
        const inc = Math.round(Number(proj.sellingPriceInc) || 0);
        const ex = Math.round(Number(proj.incomeExVat) || (inc > 0 ? exVatFromIncVat(inc, businessVatDecimal) : 0));
        if (inc > 0) {
          setFenceResult((prev) => ({
            ...prev,
            sellIncVat: inc,
            sellExVat: ex,
            vatAmount: inc - ex,
          }));
        }
      }
      switchView("fences");
      return;
    }
    const fieldRecordId = getFieldWindowRecordIdFromProject(state);
    if (proj.isFieldWindows || fieldRecordId) {
      setPergolaCrmEditId(null);
      setFenceCrmEditId(null);
      setHasVitrines(false);
      setVitrineOpenings([createVitrineOpening(1)]);
      setFieldWindowsOpenRecordId(fieldRecordId);
      switchView("field-windows");
      return;
    }
    setFenceCrmEditId(null);
    setPergolaCrmEditId(proj.id);
    PERGOLA_IDS.forEach((fieldKey) => {
      const v = state[fieldKey];
      if (v === undefined) return;
      if (fieldKey === "custName") setCustName(String(v));
      else if (fieldKey === "custPhone") setCustPhone(String(v));
      else if (fieldKey === "custAddress") setCustAddress(String(v));
      else if (fieldKey === "custInternalNotes") setCustInternalNotes(String(v));
      else if (fieldKey === "lengthWall") setLengthWall(String(v));
      else if (fieldKey === "exitWidth") setExitWidth(String(v));
      else if (fieldKey === "isLShape") setIsLShape(Boolean(v));
      else if (fieldKey === "lWallWidth") setLWallWidth(String(v));
      else if (fieldKey === "lWallDepth") setLWallDepth(String(v));
      else if (fieldKey === "lShapeSide") setLShapeSide((v as "left") || "right");
      else if (fieldKey === "colorSelect") setColorSelect(String(v));
      else if (fieldKey === "shadeColorSelect") setShadeColorSelect(String(v));
      else if (fieldKey === "frameType") setFrameType(String(v));
      else if (fieldKey === "dividerSize") setDividerSize(String(v));
      else if (fieldKey === "dividerSmoothCount") setDividerSmoothCount(String(v));
      else if (fieldKey === "dividerLedCount") setDividerLedCount(String(v));
      else if (fieldKey === "shadingProfile") setShadingProfile(String(v));
      else if (fieldKey === "spacing") setSpacing(String(v));
      else if (fieldKey === "hasSantaf") setHasSantaf(Boolean(v));
      else if (fieldKey === "santafColor") setSantafColor(String(v));
      else if (fieldKey === "dripEdgeType") setDripEdgeType(String(v));
      else if (fieldKey === "hasLed") setHasLed(Boolean(v));
      else if (fieldKey === "ledCount") setLedCount(String(v));
      else if (fieldKey === "ledColor") setLedColor(String(v));
      else if (fieldKey === "hasFan") setHasFan(Boolean(v));
      else if (fieldKey === "fanCount") setFanCount(String(v));
      else if (fieldKey === "postCount") {
        setPostCount(String(v));
        setPostCountFront(String(v));
      }
      else if (fieldKey === "postCountFront") setPostCountFront(String(v));
      else if (fieldKey === "postCountRight") setPostCountRight(String(v));
      else if (fieldKey === "postCountLeft") setPostCountLeft(String(v));
      else if (fieldKey === "postCountBack") setPostCountBack(String(v));
      else if (fieldKey === "postHeight") setPostHeight(String(v));
      else if (fieldKey === "postType") setPostType(String(v));
      else if (fieldKey === "tensionerCount") setTensionerCount(String(v));
      else if (fieldKey === "tensionerColor") setTensionerColor(String(v));
    });
    setHasVitrines(Boolean(state.hasVitrines));
    if (Array.isArray(state.vitrineOpenings)) {
      const parsedOpenings = state.vitrineOpenings
        .map((item, i) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const profile = row.profile === "9000" ? "9000" : "7000";
          return {
            id: typeof row.id === "number" ? row.id : Date.now() + i,
            widthCm: String(row.widthCm ?? ""),
            heightCm: String(row.heightCm ?? ""),
            profile: profile as VitrineProfile,
            note: String(row.note ?? ""),
          };
        })
        .filter((row): row is VitrineOpening => Boolean(row));
      setVitrineOpenings(parsedOpenings.length > 0 ? parsedOpenings : [createVitrineOpening(1)]);
    } else {
      setVitrineOpenings([createVitrineOpening(1)]);
    }
    switchView("data");
  }, [crmData, openLeadEditor, switchView, loadBundleUnitIntoForms, businessVatDecimal]);

  /** הערות התקנה פנימיות: מעדכן את כרטיס ה-CRM בלי לחיצה נוספת על «שמור ב-CRM» */
  useEffect(() => {
    if (pergolaCrmEditId == null) return;
    const t = window.setTimeout(() => {
      setCrmData((prev) =>
        prev.map((p) => {
          if (p.id !== pergolaCrmEditId || p.isLead || p.isFence) return p;
          const fs = (p.formState ?? {}) as Record<string, unknown>;
          if (String(fs.custInternalNotes ?? "") === custInternalNotes) return p;
          return { ...p, formState: { ...fs, custInternalNotes } };
        })
      );
    }, 500);
    return () => window.clearTimeout(t);
  }, [pergolaCrmEditId, custInternalNotes]);

  const deleteProject = useCallback((id: number) => {
    if (typeof window === "undefined" || !(window as unknown as { confirm: (s: string) => boolean }).confirm("האם למחוק פרויקט זה מהמערכת?")) return;
    setPergolaCrmEditId((cur) => (cur === id ? null : cur));
    setFenceCrmEditId((cur) => (cur === id ? null : cur));
    setBundleProjectId((cur) => (cur === id ? null : cur));
    if (bundleProjectId === id) setActiveUnitId(null);
    setCrmData((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try { localStorage.setItem("yarhi_crm_data", JSON.stringify(next)); } catch {}
      return next;
    });
    showAlert("הפרויקט נמחק");
  }, [showAlert, bundleProjectId]);

  useEffect(() => {
    try { localStorage.setItem("yarhi_crm_data", JSON.stringify(crmData)); } catch {}
  }, [crmData]);

  /** שמירת טיוטות פרגולה/גדר + CRM + תנועות לענן (debounce) */
  useEffect(() => {
    const uid = cloudUserId;
    if (!uid || !workspaceCloudHydrated) return;
    const totalPostsBySide =
        (parseInt(postCountFront, 10) || 0) +
        (parseInt(postCountRight, 10) || 0) +
        (parseInt(postCountLeft, 10) || 0) +
        (parseInt(postCountBack, 10) || 0);
      const pergolaCalcDraft: Record<string, unknown> = {
        custName,
        custPhone,
        custAddress,
        custInternalNotes,
        lengthWall,
        exitWidth,
        isLShape,
        lWallWidth,
        lWallDepth,
        lShapeSide,
        colorSelect,
        shadeColorSelect,
        frameType,
        dividerSize,
        dividerSmoothCount,
        dividerLedCount,
        shadingProfile,
        spacing,
        pricePerKg,
        hasLed,
        ledCount,
        ledColor,
        hasFan,
        fanCount,
        hasSantaf,
        santafColor,
        dripEdgeType,
        sellPricePerSqm,
        postCount: totalPostsBySide > 0 ? totalPostsBySide : postCount,
        postCountFront,
        postCountRight,
        postCountLeft,
        postCountBack,
        postHeight,
        postType,
        tensionerCount,
        tensionerColor,
        hasVitrines,
        vitrineOpenings: vitrineOpenings.map((opening) => ({
          id: opening.id,
          widthCm: opening.widthCm,
          heightCm: opening.heightCm,
          profile: opening.profile,
          note: opening.note,
        })),
      };
      const fenceCalcDraft = {
        fenceCustName,
        fenceCustPhone,
        fenceCustAddress,
        fenceCustInternalNotes,
        fenceSegments: fenceSegments.map((seg) => ({
          id: seg.id,
          L: seg.L,
          H: seg.H,
          P: seg.P,
          ...(seg.connected ? { connected: true as const } : {}),
          ...(fenceSegIsContinue(seg) ? { corner: false as const } : {}),
          ...(seg.connected && seg.corner === true ? { corner: true as const } : {}),
          ...withFenceSide(seg),
        })),
        fenceInGround,
        fenceSlat,
        fenceGap,
        fenceColor,
        fenceSlatColor,
        fenceSimGate,
      };
      const businessSettings: Record<string, string> = {
        sysContractorName,
        sysCompanyId,
        sysPhone,
        sysAddress,
        sysEmail,
        simCaption,
        sysInstallPriceSqm,
        sysTransportPrice,
        sysSantafPrice,
        sysLedPrice,
        sysScrewPrice,
        sysDripEdgePrice,
        pricePerKg,
        sellPricePerSqm,
        sysFencePriceSqm,
        sysFenceSetPrice,
        sysJumboPrice,
        sysVitrine7000PriceSqm,
        sysVitrine9000PriceSqm,
        sysVatPercent,
        sysQuoteDeliveryDays,
        sysWorkWarrantyYears,
        sysPaymentStage1Percent,
        sysPaymentStage2Percent,
        sysPaymentStage3Percent,
      };
      const base = sanitizeForFirestore({
        crmProjects: crmData,
        pergolaCalcDraft,
        fenceCalcDraft,
        businessTransactions,
        scheduleJobs:
          scheduleJobsRef.current.length > 0
            ? scheduleJobsRef.current
            : scheduleJobsCloudRef.current.length > 0
              ? scheduleJobsCloudRef.current
              : scheduleJobs,
        fieldWindowRecords:
          fieldWindowRecordsRef.current.length > 0
            ? fieldWindowRecordsRef.current
            : fieldWindowRecordsCloudRef.current.length > 0
              ? fieldWindowRecordsCloudRef.current
              : fieldWindowRecords,
        logoDataUrl,
        businessSettings,
      }) as Record<string, unknown>;
      const trimmed = trimWorkspaceForSize(base);
      const writeCloud = async () => {
        try {
          await persistWorkspaceToBothClouds({ ...trimmed });
          return;
        } catch (err) {
          console.error("[Yarhi Pro] שמירת workspace (שני עננים):", err);
        }
        if (cloudBackend === "supabase") {
          await saveWorkspaceToSupabase(uid, { ...trimmed, cloudSavedAt: new Date().toISOString() });
          return;
        }
        const db = getFirebaseDb();
        if (!db) return;
        const payload = { ...trimmed, cloudSavedAt: serverTimestamp() };
        await updateDoc(doc(db, "users", uid), { [USER_WORKSPACE_FIELD]: payload });
      };
    persistWorkspaceNowRef.current = writeCloud;
    const t = window.setTimeout(() => {
      void writeCloud().catch((err) => console.error("[Yarhi Pro] שמירת yarhiWorkspace:", err));
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    workspaceCloudHydrated,
    cloudUserId,
    cloudBackend,
    crmData,
    businessTransactions,
    scheduleJobs,
    fieldWindowRecords,
    logoDataUrl,
    custName,
    custPhone,
    custAddress,
    custInternalNotes,
    lengthWall,
    exitWidth,
    isLShape,
    lWallWidth,
    lWallDepth,
    lShapeSide,
    colorSelect,
    shadeColorSelect,
    frameType,
    dividerSize,
    dividerSmoothCount,
    dividerLedCount,
    shadingProfile,
    spacing,
    pricePerKg,
    hasLed,
    ledCount,
    ledColor,
    hasFan,
    fanCount,
    hasSantaf,
    santafColor,
    dripEdgeType,
    sellPricePerSqm,
    postCount,
    postCountFront,
    postCountRight,
    postCountLeft,
    postCountBack,
    postHeight,
    postType,
    tensionerCount,
    tensionerColor,
    hasVitrines,
    vitrineOpenings,
    fenceCustName,
    fenceCustPhone,
    fenceCustAddress,
    fenceCustInternalNotes,
    fenceSegments,
    fenceInGround,
    fenceSimGate,
    fenceSlat,
    fenceGap,
    fenceColor,
    fenceSlatColor,
    sysContractorName,
    sysCompanyId,
    sysPhone,
    sysAddress,
    sysEmail,
    simCaption,
    sysInstallPriceSqm,
    sysTransportPrice,
    sysSantafPrice,
    sysLedPrice,
    sysScrewPrice,
    sysDripEdgePrice,
    sysFencePriceSqm,
    sysFenceSetPrice,
    sysJumboPrice,
    sysVitrine7000PriceSqm,
    sysVitrine9000PriceSqm,
    sysVatPercent,
    sysQuoteDeliveryDays,
    sysWorkWarrantyYears,
    sysPaymentStage1Percent,
    sysPaymentStage2Percent,
    sysPaymentStage3Percent,
  ]);

  useEffect(() => {
    const flush = () => {
      void persistWorkspaceNowRef.current();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    if (currentView !== "fence-3d") {
      setFenceSimLoaded(false);
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView !== "fence-3d") return;
    if (!fenceSimLoaded) return;
    const iframe = fenceSimIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;

    const segments = fenceSegsForSim(fenceSegments);
    if (!segments.length) return;

    const gapCm = parseFloat(fenceGap) || 0;
    const config = {
      segments,
      gapCm,
      slatProfile: fenceSlat,
      frameHex: fenceResult.frameHex,
      slatHex: fenceResult.slatHex,
      spacerHex: fenceResult.spacerHex,
      inGround: fenceInGround,
      env: fenceSimEnv,
      gate: fenceSimGate,
    };

    const post = () => {
      try {
        win.postMessage({ type: "applyExternalConfig", config }, "*");
      } catch {
        /* ignore */
      }
    };
    post();
    const t1 = window.setTimeout(post, 200);
    const t2 = window.setTimeout(post, 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [currentView, fenceSimLoaded, fenceSegments, fenceGap, fenceSlat, fenceInGround, fenceResult.frameHex, fenceResult.slatHex, fenceResult.spacerHex, fenceSimEnv, fenceSimGate]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === "simReady" && ev.data.k === "f") {
        setFenceSimLoaded(true);
        return;
      }
      if (ev.data?.type === "simEnv") {
        if (ev.data.k === "p") {
          const env = normPergolaShareEnv(ev.data.env);
          if (env) setPergolaSimEnv(env);
        } else if (ev.data.k === "f") {
          const env = normFenceShareEnv(ev.data.env);
          if (env) setFenceSimEnv(env);
        }
        return;
      }
      if (!ev.data || ev.data.type !== "simConfig" || !ev.data.config) return;
      if (ev.data.config.kind === "f") return;
      lastLiveSimConfigRef.current = ev.data.config as LiveSimConfig;
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (currentView !== "3d" || !pergolaSimLoaded) return;
    const iframe = pergolaSimIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;

    win.postMessage(
      {
        type: "applyExternalConfig",
        config: (() => {
          const full = buildPergolaShareConfig();
          const {
            dividerStates: _ds,
            hasLed: _hl,
            hasFan: _hf,
            ledCount: _lc,
            fanCount: _fc,
            env: _env,
            frameHex: _fh,
            slatHex: _sh,
            ...structural
          } = full;
          return structural;
        })(),
      },
      "*"
    );
    void requestLiveSimConfig(win).then((cfg) => {
      if (cfg) lastLiveSimConfigRef.current = cfg;
    });
  }, [
    currentView,
    pergolaSimLoaded,
    buildPergolaShareConfig,
  ]);

  scheduleJobsRef.current = scheduleJobs;

  fieldWindowRecordsRef.current = fieldWindowRecords;

  const applyFieldWindowRecords = useCallback(
    (records: FieldWindowRecord[]) => {
      setFieldWindowRecords(records);
      fieldWindowRecordsRef.current = records;
      fieldWindowRecordsCloudRef.current = records;
      const uid = cloudUserId;
      if (!uid) return;
      try {
        localStorage.setItem(fieldWindowsLocalStorageKey(uid), JSON.stringify(records));
      } catch {}
    },
    [cloudUserId]
  );

  const persistFieldWindowRecordsToCloud = useCallback(
    async (records: FieldWindowRecord[]) => {
      const uid = cloudUserId;
      if (!uid) return;
      if (cloudBackend === "supabase") {
        fieldWindowRecordsCloudRef.current = records;
        return;
      }
      const db = getFirebaseDb();
      if (!db) return;
      const cleaned = sanitizeForFirestore(records);
      const userRef = doc(db, "users", uid);
      try {
        await updateDoc(userRef, {
          [`${USER_WORKSPACE_FIELD}.fieldWindowRecords`]: cleaned,
        });
        fieldWindowRecordsCloudRef.current = records;
        return;
      } catch {
        /* yarhiWorkspace עדיין לא קיים */
      }
      try {
        const snap = await getDoc(userRef);
        const existingWs = snap.exists() ? snap.data()?.[USER_WORKSPACE_FIELD] : undefined;
        const base =
          existingWs && typeof existingWs === "object" && !Array.isArray(existingWs)
            ? (existingWs as Record<string, unknown>)
            : {};
        await updateDoc(userRef, {
          [USER_WORKSPACE_FIELD]: sanitizeForFirestore({ ...base, fieldWindowRecords: cleaned }),
        });
        fieldWindowRecordsCloudRef.current = records;
      } catch (err) {
        console.error("[Yarhi Pro] שמירת fieldWindowRecords לענן:", err);
      }
    },
    [cloudUserId, cloudBackend]
  );

  const handleFieldWindowRecordsChange = useCallback(
    (records: FieldWindowRecord[]) => {
      applyFieldWindowRecords(records);
      void persistFieldWindowRecordsToCloud(records);
    },
    [applyFieldWindowRecords, persistFieldWindowRecordsToCloud]
  );

  handleFieldWindowRecordsChangeRef.current = handleFieldWindowRecordsChange;

  const handleFieldWindowCrmLink = useCallback(
    (recordId: string, project: CrmProject) => {
      if (bundleProjectId != null) {
        const proj = crmData.find((p) => p.id === bundleProjectId);
        const unit = proj?.units?.find(
          (u) => u.type === "field-windows" && (u.fieldWindowRecordId === recordId || u.id === activeUnitId)
        );
        if (unit) {
          const inc = typeof project.sellingPriceInc === "number" ? project.sellingPriceInc : 0;
          setCrmData((prev) =>
            prev.map((p) => {
              if (p.id !== bundleProjectId || !p.units) return p;
              const units = p.units.map((u) =>
                u.id === unit.id
                  ? {
                      ...u,
                      sellingPriceInc: inc,
                      incomeExVat: project.incomeExVat ?? 0,
                      vatAmount: project.vatAmount ?? 0,
                    }
                  : u
              );
              return { ...p, units, ...recalcBundleTotals(units) };
            })
          );
          handleFieldWindowRecordsChange(
            fieldWindowRecordsRef.current.map((r) =>
              r.id === recordId ? { ...r, crmProjectId: bundleProjectId } : r
            )
          );
          showAlert("מחיר עודכן בפרויקט המשולב");
          return;
        }
      }
      setCrmData((prev) => [project, ...prev]);
      handleFieldWindowRecordsChange(
        fieldWindowRecordsRef.current.map((r) =>
          r.id === recordId ? { ...r, crmProjectId: project.id } : r
        )
      );
    },
    [activeUnitId, bundleProjectId, crmData, handleFieldWindowRecordsChange, showAlert]
  );

  const applyScheduleJobs = useCallback(
    (jobs: ScheduleJob[]) => {
      setScheduleJobs(jobs);
      scheduleJobsRef.current = jobs;
      scheduleJobsCloudRef.current = jobs;
      const uid = cloudUserId;
      if (!uid) return;
      try {
        localStorage.setItem(scheduleLocalStorageKey(uid), JSON.stringify(jobs));
      } catch {}
    },
    [cloudUserId]
  );

  const persistScheduleJobsToCloud = useCallback(
    async (jobs: ScheduleJob[]) => {
      const uid = cloudUserId;
      if (!uid) return;
      if (cloudBackend === "supabase") {
        scheduleJobsCloudRef.current = jobs;
        return;
      }
      const db = getFirebaseDb();
      if (!db) return;
      if (jobs.length === 0) return;
      const cleaned = sanitizeForFirestore(jobs);
      const userRef = doc(db, "users", uid);
      try {
        await updateDoc(userRef, {
          [`${USER_WORKSPACE_FIELD}.scheduleJobs`]: cleaned,
        });
        scheduleJobsCloudRef.current = jobs;
        return;
      } catch {
        /* yarhiWorkspace עדיין לא קיים — מיזוג מלא בלי למחוק שדות אחרים */
      }
      try {
        const snap = await getDoc(userRef);
        const existingWs = snap.exists() ? snap.data()?.[USER_WORKSPACE_FIELD] : undefined;
        const base =
          existingWs && typeof existingWs === "object" && !Array.isArray(existingWs)
            ? (existingWs as Record<string, unknown>)
            : {};
        await updateDoc(userRef, {
          [USER_WORKSPACE_FIELD]: sanitizeForFirestore({ ...base, scheduleJobs: cleaned }),
        });
        scheduleJobsCloudRef.current = jobs;
      } catch (err) {
        console.error("[Yarhi Pro] שמירת scheduleJobs לענן:", err);
      }
    },
    [cloudUserId, cloudBackend]
  );

  const handleScheduleJobsChange = useCallback(
    (jobs: ScheduleJob[]) => {
      applyScheduleJobs(jobs);
      void persistScheduleJobsToCloud(jobs);
    },
    [applyScheduleJobs, persistScheduleJobsToCloud]
  );

  useEffect(() => {
    const uid = cloudUserId;
    if (!uid || fieldWindowRecords.length === 0) return;
    try {
      localStorage.setItem(fieldWindowsLocalStorageKey(uid), JSON.stringify(fieldWindowRecords));
    } catch {}
  }, [fieldWindowRecords, cloudUserId]);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [searchString]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMoreOpen]);

  const navCls = (view: ViewId) =>
    `flex items-center gap-2 md:gap-3 py-2.5 px-3 md:py-4 md:px-6 rounded-xl font-semibold text-sm md:text-base transition text-right w-full cursor-pointer ${currentView === view ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`;

  const mobileTabCls = (view: ViewId) => {
    const on = currentView === view;
    return `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 px-0.5 text-[10px] font-bold leading-tight transition sm:text-[11px] ${
      on ? "bg-blue-600 text-white shadow-md" : "text-slate-400 active:bg-slate-800"
    }`;
  };
  const pergolaSyncToken = [
    parseFloat(lengthWall) || 0,
    parseFloat(exitWidth) || 0,
    isLShape ? 1 : 0,
    isLShape ? parseFloat(lWallWidth) || 0 : 0,
    isLShape ? parseFloat(lWallDepth) || 0 : 0,
    lShapeSide,
    parseFloat(spacing) || 0,
    pergolaResult.nDividersTotal ?? 0,
    pergolaResult.frameHex || "",
    pergolaResult.shadeHex || "",
    pergolaResult.santafHex || "",
    postCount || "",
    postCountFront || "",
    postCountRight || "",
    postCountLeft || "",
    postCountBack || "",
    hasSantaf ? 1 : 0,
    hasLed ? 1 : 0,
    hasFan ? 1 : 0,
    ledCount || "",
    fanCount || "",
    ledColor || "",
    tensionerCount || "",
    simCaption || "",
    frameType || "",
  ].join("|");
  const pergolaSimSrc = (() => {
    const shareCfg = buildPergolaShareConfig();
    const params = new URLSearchParams();
    params.set("rev", SIM_VERSION);
    params.set("L", String(shareCfg.L || 0));
    params.set("W", String(shareCfg.W || 0));
    params.set("gap", String(shareCfg.gap || 0));
    params.set("dividers", String(shareCfg.dividers || 0));
    params.set("postsFront", String(shareCfg.postsFront || 0));
    params.set("postsRight", String(shareCfg.postsRight || 0));
    params.set("postsLeft", String(shareCfg.postsLeft || 0));
    params.set("postsBack", String(shareCfg.postsBack || 0));
    params.set("hasPosts", shareCfg.hasPosts ? "1" : "0");
    params.set("frameType", shareCfg.frameType || "");
    params.set("frameHex", shareCfg.frameHex || "#888888");
    params.set("slatHex", shareCfg.slatHex || "#888888");
    params.set("santafHex", shareCfg.santafHex || (shareCfg.hasSantaf ? "#7ec8e3" : "#888888"));
    params.set("captionText", shareCfg.captionText || "");
    params.set("isLShape", shareCfg.isLShape ? "1" : "0");
    params.set("lWallWidth", String(shareCfg.lWallWidth || 0));
    params.set("lWallDepth", String(shareCfg.lWallDepth || 0));
    params.set("lShapeSide", shareCfg.lShapeSide || "right");
    if (shareCfg.hasSantaf) params.set("hasSantaf", "1");
    if (shareCfg.hasLed) params.set("hasLed", "1");
    if (shareCfg.hasFan) params.set("hasFan", "1");
    if (shareCfg.hasLed) params.set("ledCount", String(shareCfg.ledCount || 1));
    if (shareCfg.hasFan) params.set("fanCount", String(shareCfg.fanCount || 1));
    params.set("ledTone", shareCfg.ledTone || "white");
    if (shareCfg.hasTensioners) {
      params.set("hasTensioners", "1");
      params.set("tensionerCount", String(shareCfg.tensionerCount || 2));
    }
    const ds = encodeDividerStatesParam(shareCfg.dividerStates);
    if (ds) params.set("ds", ds);
    appendPergolaShareUrlParams(params, shareCfg);
    params.delete("env");
    params.set("sync", encodeURIComponent(pergolaSyncToken));
    return `/sim.html?${params.toString()}`;
  })();

  return (
    <div dir="rtl" className="flex h-dvh max-h-dvh w-full max-w-[100vw] overflow-hidden bg-slate-900">
      {/* סיידבר — רק ממסך בינוני ומעלה; במובייל הניווט בתחתית המסך */}
      <aside
        id="app-side-nav"
        className="no-print relative z-20 box-border hidden h-full w-[280px] shrink-0 flex-col border-l border-slate-600 bg-slate-800 text-white lg:flex"
      >
        <div className="border-b border-slate-700 px-2 pt-8 pb-10 text-center">
          <h1 className="text-3xl font-black text-blue-400 tracking-wider">Yarhi PRO</h1>
          <p className="mt-1 text-sm font-bold text-slate-200">{sysContractorName || "שם העסק לא הוגדר"}</p>
          {showManagerBadge && <p className="mt-1 text-sm font-black text-amber-300">מנהל 👑</p>}
          <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-400">Advanced Pergola System</p>
          <p className="mt-1 text-[10px] text-slate-500">© כל הזכויות שמורות</p>
        </div>
        <nav className="mt-6 flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-4" role="navigation">
          <Link href="/?view=dashboard" className={navCls("dashboard")}>
            <span className="text-xl">📊</span>לוח בקרה
          </Link>
          <Link href="/?view=data" className={navCls("data")}>
            <span className="text-xl">📏</span>פרגולות
          </Link>
          <Link href="/?view=fences" className={navCls("fences")}>
            <span className="text-xl">🪟</span>גדרות
          </Link>
          <Link href="/?view=field-windows" className={navCls("field-windows")}>
            <span className="text-xl">📐</span>מידות שטח חלונות
          </Link>
          <Link href="/?view=3d" className={navCls("3d")}>
            <span className="text-xl">🎨</span>הדמיית פרגולה
          </Link>
          <Link href="/?view=fence-3d" className={navCls("fence-3d")}>
            <span className="text-xl">🧱</span>הדמיית גדר
          </Link>
          <Link href="/?view=schedule" className={navCls("schedule")}>
            <span className="text-xl">📅</span>ניהול לו&quot;ז
          </Link>
          <Link href="/?view=settings" className={navCls("settings")}>
            <span className="text-xl">⚙️</span>הגדרות עסק
          </Link>
          <Link href="/?view=business" className={navCls("business") + " border border-indigo-500/30 bg-indigo-900/40"}>
            <span className="text-xl">💼</span>ניהול פיננסי וגבייה
          </Link>
        </nav>
        <div className="shrink-0 border-t border-slate-700 px-3 py-3 text-center text-[10px] leading-relaxed text-slate-500">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                await logout();
                router.push("/login");
              })();
            }}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600/90 py-2 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600"
          >
            <span className="text-base leading-none" aria-hidden>🚪</span>
            התנתקות
          </button>
          גרסת מערכת 3.0.1 (PRO)
          <br />
          פותח עבור ירחי אלומיניום
        </div>
      </aside>
      <main
        ref={mainScrollRef}
        className={
          "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] lg:pb-0 " +
          (currentView === "3d" || currentView === "fence-3d" || currentView === "schedule" ? "overflow-hidden" : "overflow-y-auto")
        }
      >
        {alertMsg && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[10000] -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-800 px-7 py-3 font-bold text-white shadow-lg lg:bottom-8">
            {alertMsg}
          </div>
        )}

        {isProductView && (
          <ProductProjectBar
            currentView={currentView}
            project={bundleProject && projectIsBundle(bundleProject) ? bundleProject : null}
            activeUnitId={activeUnitId}
            customerPreview={bundleCustomerPreview}
            onStartProject={startBundleWithCurrentProduct}
            onSelectUnit={switchBundleUnit}
            onAddUnit={addBundleUnit}
            onRemoveUnit={removeBundleUnit}
            onExit={exitBundleMode}
            onPrintBundleQuote={printBundleCustomerQuote}
          />
        )}

        {leadModalOpen && (
          <div
            className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-none bg-slate-900/60 p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-modal-title"
          >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="סגור" onClick={() => setLeadModalOpen(false)} />
            <div className="relative z-10 my-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
                <h2 id="lead-modal-title" className="text-xl font-black text-slate-800">
                  {leadEditId == null ? "ליד חדש" : "עריכת ליד"}
                </h2>
                <button
                  type="button"
                  onClick={() => setLeadModalOpen(false)}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">שם *</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="שם לקוח"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-bold text-slate-700">טלפון</label>
                    <input
                      dir="ltr"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-right outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      placeholder="05x-xxxxxxx"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-bold text-slate-700">כתובת</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                      value={leadAddress}
                      onChange={(e) => setLeadAddress(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">סוג שירות / פירוט חופשי</label>
                  <textarea
                    rows={3}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    value={leadService}
                    onChange={(e) => setLeadService(e.target.value)}
                    placeholder="לדוגמה: פרגולה חשמלית, תריסים…"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">סטטוס במעקב</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    value={leadCrmStatus}
                    onChange={(e) => setLeadCrmStatus(e.target.value as CrmStatus)}
                  >
                    {CRM_STATUS_SELECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="mb-2 text-xs font-bold text-slate-500">סכומי הצעה (אופציונלי) — לפי מע״מ {vatPercentLabelUi} מההגדרות; אפשר לערוך כל שדה ידנית (למשל אחרי הנחה).</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">לפני מע״מ (₪)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-right font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        value={leadSellingExRaw ? Number(leadSellingExRaw.replace(/[^0-9]/g, "")).toLocaleString("en-US") : ""}
                        onChange={handleLeadSellingExInputChange}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">כולל מע״מ (₪)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-right font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        value={leadSellingIncRaw ? Number(leadSellingIncRaw.replace(/[^0-9]/g, "")).toLocaleString("en-US") : ""}
                        onChange={handleLeadSellingIncInputChange}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setLeadModalOpen(false)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 font-bold text-slate-700 transition hover:bg-slate-50 sm:w-auto sm:px-6"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={saveLeadFromModal}
                    className="w-full flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white shadow-md transition hover:bg-blue-700"
                  >
                    שמור ל-CRM
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {crmDealAmountModal ? (
          <div
            className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto overscroll-none bg-slate-900/60 p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-deal-modal-title"
          >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="סגור" onClick={() => setCrmDealAmountModal(null)} />
            <div className="relative z-10 my-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
                <h2 id="crm-deal-modal-title" className="text-xl font-black text-slate-800">
                  סכום עסקה נדרש
                </h2>
                <button
                  type="button"
                  onClick={() => setCrmDealAmountModal(null)}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <p className="text-sm font-medium leading-relaxed text-slate-600">
                  כדי להעביר את <span className="font-bold text-slate-800">{crmDealAmountModal.customerName || "הלקוח"}</span> לסטטוס{" "}
                  <span className="font-bold text-slate-800">
                    «{CRM_STATUS_LABELS[crmDealAmountModal.nextStatus]}»
                  </span>{" "}
                  (מעקב פיננסי), יש להזין את <strong>סכום העסקה כולל מע״מ</strong>.
                </p>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">סכום כולל מע״מ (₪)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-right text-lg font-black outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    value={crmDealAmountRaw ? Number(crmDealAmountRaw.replace(/[^0-9]/g, "")).toLocaleString("en-US") : ""}
                    onChange={(e) => setCrmDealAmountRaw(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setCrmDealAmountModal(null)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 font-bold text-slate-700 transition hover:bg-slate-50 sm:w-auto sm:px-6"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={applyCrmStatusWithDealAmount}
                    className="w-full flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white shadow-md transition hover:bg-blue-700"
                  >
                    שמור והמשך
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {crmPriceEditModal ? (
          <div
            className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto overscroll-none bg-slate-900/60 p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-price-edit-modal-title"
          >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="סגור" onClick={() => setCrmPriceEditModal(null)} />
            <div className="relative z-10 my-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
                <h2 id="crm-price-edit-modal-title" className="text-xl font-black text-slate-800">
                  עריכת מחיר עסקה
                </h2>
                <button
                  type="button"
                  onClick={() => setCrmPriceEditModal(null)}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <p className="text-sm font-medium leading-relaxed text-slate-600">
                  עדכון סכום העסקה עבור{" "}
                  <span className="font-bold text-slate-800">{crmPriceEditModal.customerName || "הלקוח"}</span>{" "}
                  (כולל מע״מ). השינוי יתעדכן בלוח, בניהול העסק ובהצעות שמבוססות על מחיר העסקה השמור.
                </p>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">סכום כולל מע״מ (₪)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-right text-lg font-black outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    value={crmPriceEditRaw ? Number(crmPriceEditRaw.replace(/[^0-9]/g, "")).toLocaleString("en-US") : ""}
                    onChange={(e) => setCrmPriceEditRaw(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                  />
                </div>
                <p className="text-[11px] font-semibold text-slate-500">
                  שינוי מידות בהמשך יחזיר חישוב לפי מטר כמו היום — ואפשר לערוך שוב ידנית מכאן.
                </p>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setCrmPriceEditModal(null)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 font-bold text-slate-700 transition hover:bg-slate-50 sm:w-auto sm:px-6"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={applyCrmPriceEdit}
                    className="w-full flex-1 rounded-xl bg-amber-600 py-3 font-bold text-white shadow-md transition hover:bg-amber-700"
                  >
                    שמור מחיר
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* VIEW: DASHBOARD */}
        {currentView === "dashboard" && (
          <section className="w-full max-w-none px-3 py-4 sm:px-4 md:px-5 lg:px-6">
            <div className="bg-gradient-to-r from-blue-900 to-slate-800 rounded-3xl p-10 text-white shadow-xl mb-8 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-5xl font-black mb-2">שלום, {sysContractorName}</h2>
                <p className="text-blue-200 text-xl">ניהול לקוחות, הפקת הצעות מחיר ודו&quot;חות ייצור למפעל.</p>
              </div>
              <div className="absolute -left-10 -bottom-10 opacity-10 text-[150px]">🏗️</div>
            </div>
            <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
              <h3 className="text-2xl font-bold text-slate-800">פרויקטים אחרונים (CRM)</h3>
              <button type="button" onClick={openNewLeadModal} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-md transition">
                + ליד חדש
              </button>
            </div>
            {crmStaleFollowUpCount > 0 ? (
              <div
                className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 shadow-sm"
                role="status"
              >
                <span className="text-lg leading-none shrink-0" aria-hidden>
                  ⚠️
                </span>
                <p className="leading-snug">
                  יש {crmStaleFollowUpCount}{" "}
                  {crmStaleFollowUpCount === 1 ? "פריט שדורש מעקב" : "פריטים שדורשים מעקב"}: מעל 48 שעות ב«ליד חדש» או ב«נשלחה הצעה» — פרטים בעמודת הסטטוס.
                </p>
              </div>
            ) : null}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-5">
                <label htmlFor="crm-dashboard-search" className="mb-2 block text-sm font-bold text-slate-700">
                  חיפוש לקוח
                </label>
                <div className="flex max-w-2xl items-center gap-2">
                  <span className="text-lg text-slate-400 shrink-0" aria-hidden>
                    🔍
                  </span>
                  <input
                    id="crm-dashboard-search"
                    type="search"
                    value={crmSearchQuery}
                    onChange={(e) => setCrmSearchQuery(e.target.value)}
                    placeholder="שם לקוח או מספר טלפון…"
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {crmSearchQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setCrmSearchQuery("")}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                    >
                      נקה
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-center text-[11px] font-semibold text-slate-500 md:hidden">
                גלילה למעלה/למטה על הטבלה · גלילה הצידה לכל העמודות
              </p>
              <div className="overflow-x-auto overscroll-x-contain touch-manipulation [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]">
                <table className="w-full min-w-[52rem] text-right">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                    <th className="p-4">תאריך</th>
                    <th className="p-4">שם הלקוח</th>
                    <th className="p-4">סטטוס</th>
                    <th className="p-4">מידות / פירוט</th>
                    <th className="p-4">מכירה (כולל מע&quot;מ)</th>
                    <th className="p-4 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {crmData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
                        <div className="text-4xl mb-3">📁</div>
                        <div className="text-lg font-bold">אין פרויקטים שמורים עדיין</div>
                        <p className="text-sm">הפרויקטים שתשמור במסך &apos;מידות ונתונים&apos; יופיעו כאן.</p>
                      </td>
                    </tr>
                  )}
                  {crmData.length > 0 && crmDashboardFiltered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500">
                        <p className="text-lg font-bold text-slate-700">לא נמצאו תוצאות</p>
                        <p className="mt-1 text-sm">נסה שם אחר או חלק ממספר הטלפון (עם או בלי מקפים).</p>
                      </td>
                    </tr>
                  )}
                  {crmDashboardFiltered.map((p) => {
                    const fs = (p.formState ?? {}) as Record<string, unknown>;
                    const lw = fs.lengthWall ?? "-";
                    const ew = fs.exitWidth ?? "-";
                    let dimStr = p.isFence ? (p.totalLength ? `גדר, אורך ${p.totalLength} ס"מ` : "גדר") : `${lw}x${ew}`;
                    if (projectIsBundle(p)) {
                      dimStr = `פרויקט משולב · ${p.units?.length ?? 0} מוצרים`;
                    }
                    const st = parseCrmStatus(p.crmStatus);
                    if (p.isLead) {
                      const note = String(fs.leadServiceNotes ?? "").trim();
                      const leadFallback = crmLeadEntryShowsAsClient(p.crmStatus) ? "לקוח" : "ליד";
                      dimStr = note ? (note.length > 48 ? `${note.slice(0, 48)}…` : note) : leadFallback;
                    }
                    const staleFollowUpMsg = getCrmStaleAlertMessage(p);
                    return (
                      <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-100 transition">
                        <td className="p-4 text-slate-500">{p.date}</td>
                        <td className="p-4 font-bold text-slate-800">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {p.customer}
                            {projectIsBundle(p) ? (
                              <span className="text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 border border-indigo-200">פרויקט משולב</span>
                            ) : null}
                            {crmProjectShowsLifecycleLeadClientPill(p) ? (
                              crmLeadEntryShowsAsClient(p.crmStatus) ? (
                                <span className="text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5 border border-emerald-200">לקוח</span>
                              ) : (
                                <span className="text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 border border-indigo-200">ליד</span>
                              )
                            ) : null}
                          </span>
                        </td>
                        <td className="p-4 align-middle">
                          <label className="sr-only">סטטוס CRM עבור {p.customer}</label>
                          <select
                            className="w-full min-w-[11rem] max-w-[16rem] rounded-xl border border-slate-200 bg-white py-2 pe-2 ps-2 text-[11px] font-bold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
                            value={st ?? ""}
                            title={getCrmStatusLabel(p.crmStatus)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) return;
                              updateCrmProjectStatus(p.id, v as CrmStatus);
                            }}
                          >
                            {st == null ? <option value="">— בחר סטטוס —</option> : null}
                            {CRM_STATUS_SELECT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {CRM_STATUS_UI[o.value].emoji} {o.label}
                              </option>
                            ))}
                          </select>
                          {staleFollowUpMsg ? (
                            <p
                              className="mt-2 rounded-lg border border-amber-400 bg-amber-50 px-2 py-1.5 text-[10px] font-bold leading-snug text-amber-950"
                              role="status"
                            >
                              ⚠️ {staleFollowUpMsg}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-4 text-slate-600 max-w-[220px]"><span className="line-clamp-2">{dimStr}</span></td>
                        <td className="p-4 font-black text-blue-600">{typeof p.sellingPriceInc === "string" ? p.sellingPriceInc : "₪ " + (p.sellingPriceInc ?? 0).toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <span className="inline-flex flex-wrap items-center justify-center gap-2">
                            <button type="button" onClick={() => loadProject(p.id)} className="text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 font-bold transition-colors shadow-sm inline-flex items-center gap-1">טען</button>
                            <button
                              type="button"
                              onClick={() => openCrmPriceEdit(p)}
                              className="text-amber-800 bg-amber-50 px-3 py-2 rounded-lg hover:bg-amber-100 font-bold transition-colors shadow-sm inline-flex items-center gap-1"
                            >
                              ערוך מחיר
                            </button>
                            {p.isLead ? (
                              <button
                                type="button"
                                onClick={() => printLeadQuote(p)}
                                className="text-emerald-800 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 font-bold transition-colors shadow-sm inline-flex items-center gap-1"
                              >
                                📄 הצעת מחיר
                              </button>
                            ) : null}
                            <button type="button" onClick={() => deleteProject(p.id)} className="text-red-500 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 font-bold transition-colors shadow-sm inline-flex items-center gap-1">מחק</button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </section>
        )}

        {/* VIEW: PERGOLAS (DATA) */}
        {currentView === "data" && (
          <section className="w-full max-w-none px-3 py-4 sm:px-4 md:px-5 lg:px-6">
            <header className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-3xl font-black text-slate-800">הזנת נתונים והפקת דו&quot;חות</h2>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={printFactoryReport} className="bg-slate-800 text-white px-5 py-2 rounded-xl font-bold hover:bg-slate-900 transition flex items-center gap-2 shadow-md">
                  🖨️ דוח ייצור
                </button>
                <button type="button" onClick={printCustomerQuote} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition shadow-md flex items-center gap-2">📄 סיכום ללקוח (עם 3D)</button>
                <button type="button" onClick={sendPergolaSimToWhatsApp} className="bg-teal-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-teal-700 transition shadow-md flex items-center gap-2">🎥 שלח הדמיה בוואטסאפ</button>
                {isManagerUser ? (
                  <button type="button" onClick={openKitGuide} className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-indigo-700 transition shadow-md flex items-center gap-2">
                    📘 חוברת הרכבה
                  </button>
                ) : null}
                <button type="button" onClick={() => setKitOrderModal({ kind: "pergola" })} className="bg-slate-700 text-white px-5 py-2 rounded-xl font-bold hover:bg-slate-800 transition shadow-md flex items-center gap-2">
                  🏭 שלח לייצור
                </button>
                <button type="button" onClick={saveProjectToCRM} className="bg-green-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-green-700 transition shadow-md flex items-center gap-2">💾 שמור ל-CRM ולניהול פיננסי</button>
                <button type="button" onClick={resetCurrentForm} className="bg-red-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-red-600 transition shadow-md flex items-center gap-2">🔄 איפוס טופס</button>
              </div>
            </header>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-4 space-y-5">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-100 bg-blue-50">
                  <h3 className="text-lg font-bold mb-3 text-blue-800 flex items-center gap-2">👤 פרטי לקוח</h3>
                  <div className="space-y-3">
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">שם הלקוח</label><input type="text" value={custName} onChange={(e) => { setCustName(e.target.value); saveCurrentState(); }} className="w-full border border-slate-300 rounded-lg p-2.5 bg-white" /></div>
                    <div className="grid grid-cols-2 gap-2"><div><label className="block text-sm font-semibold text-slate-600 mb-1">טלפון</label><input type="text" name="pergola-customer-phone" inputMode="tel" autoComplete="off" dir="ltr" value={custPhone} onChange={(e) => { setCustPhone(e.target.value); saveCurrentState(); }} placeholder="נייד הלקוח" className="w-full border border-slate-300 rounded-lg p-2.5 bg-white" /></div><div><label className="block text-sm font-semibold text-slate-600 mb-1">כתובת</label><input type="text" value={custAddress} onChange={(e) => { setCustAddress(e.target.value); saveCurrentState(); }} className="w-full border border-slate-300 rounded-lg p-2.5 bg-white" /></div></div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 space-y-2">
                      <label className="block text-sm font-bold text-amber-950">🔧 הערות התקנה / חומר לביקור הבא</label>
                      <p className="text-[11px] text-amber-900/85 leading-snug">לשימוש פנימי בלבד — לא מוצג בהצעת מחיר או בסיכום ללקוח.</p>
                      <textarea
                        value={custInternalNotes}
                        onChange={(e) => {
                          setCustInternalNotes(e.target.value);
                          saveCurrentState();
                        }}
                        rows={3}
                        placeholder="למשל: להביא מחר זוית / פרופיל…"
                        className="w-full resize-y min-h-[4.5rem] border border-amber-200 rounded-lg p-2.5 text-sm bg-white text-slate-800 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold mb-4 border-b pb-2 text-slate-700 flex items-center gap-2">📐 מידות ומבנה (חוץ-חוץ)</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-sm font-bold text-blue-700 mb-1">אורך קיר ראשי (ס&quot;מ)</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={lengthWall} onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d*\.?\d*$/.test(v)) { setLengthWall(v); saveCurrentState(); } }} placeholder="" className="w-full border rounded-lg p-2 text-center font-bold text-lg" /></div>
                      <div><label className="block text-sm font-bold text-blue-700 mb-1">יציאה (ס&quot;מ)</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={exitWidth} onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d*\.?\d*$/.test(v)) { setExitWidth(v); saveCurrentState(); } }} placeholder="" className="w-full border rounded-lg p-2 text-center font-bold text-lg" /></div>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-200">
                      <label className="flex items-center gap-2 cursor-pointer mb-2 border-b border-orange-200 pb-2">
                        <input type="checkbox" checked={isLShape} onChange={(e) => { setIsLShape(e.target.checked); saveCurrentState(); }} className="w-5 h-5 accent-orange-600" />
                        <span className="text-sm font-black text-orange-800">פרגולה בצורת ר&apos; (בליטת קיר)</span>
                      </label>
                      {isLShape && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div><label className="block text-xs text-orange-700 mb-1">רוחב הבליטה</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={lWallWidth} onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d*\.?\d*$/.test(v)) { setLWallWidth(v); saveCurrentState(); } }} className="w-full border border-orange-300 rounded-lg p-2" /></div>
                          <div><label className="block text-xs text-orange-700 mb-1">עומק הבליטה</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={lWallDepth} onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d*\.?\d*$/.test(v)) { setLWallDepth(v); saveCurrentState(); } }} className="w-full border border-orange-300 rounded-lg p-2" /></div>
                          <div className="col-span-2"><label className="block text-xs text-orange-700 mb-1">צד הבליטה</label><select value={lShapeSide} onChange={(e) => { setLShapeSide(e.target.value as "left" | "right"); saveCurrentState(); }} className="w-full border border-orange-300 rounded-lg p-2 bg-white"><option value="right">הבליטה בקיר בצד ימין</option><option value="left">הבליטה בקיר בצד שמאל</option></select></div>
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-200 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasVitrines}
                          onChange={(e) => {
                            setHasVitrines(e.target.checked);
                            if (e.target.checked && vitrineOpenings.length === 0) {
                              setVitrineOpenings([createVitrineOpening(1)]);
                            }
                            saveCurrentState();
                          }}
                          className="w-5 h-5 accent-cyan-600"
                        />
                        <span className="text-sm font-black text-cyan-900">הוסף סגירה / ויטרינות להצעה</span>
                      </label>
                      {hasVitrines && (
                        <div className="space-y-3 border-t border-cyan-200 pt-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-cyan-800 font-bold">פתחים לתמחור (מידות בס״מ)</p>
                            <button
                              type="button"
                              onClick={addVitrineOpening}
                              className="text-xs bg-cyan-100 border border-cyan-300 text-cyan-800 px-3 py-1 rounded-lg font-bold hover:bg-cyan-200"
                            >
                              + הוסף פתח
                            </button>
                          </div>
                          <div className="space-y-2">
                            {vitrineOpenings.map((opening, i) => (
                              <div key={opening.id} className="rounded-xl border border-cyan-200 bg-white p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-black text-cyan-900">פתח {i + 1}</p>
                                  <button
                                    type="button"
                                    onClick={() => removeVitrineOpening(opening.id)}
                                    className="text-[11px] text-red-600 font-bold hover:text-red-700"
                                  >
                                    הסר
                                  </button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-slate-600 mb-1">רוחב</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      pattern="[0-9]*[\\.,]?[0-9]*"
                                      dir="ltr"
                                      value={opening.widthCm}
                                      onChange={(e) => {
                                        const v = e.target.value.replace(",", ".");
                                        if (/^\d*\.?\d*$/.test(v)) updateVitrineOpening(opening.id, { widthCm: v });
                                      }}
                                      className="w-full border rounded-lg p-2 text-center text-sm font-bold"
                                      placeholder="0"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-600 mb-1">גובה</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      pattern="[0-9]*[\\.,]?[0-9]*"
                                      dir="ltr"
                                      value={opening.heightCm}
                                      onChange={(e) => {
                                        const v = e.target.value.replace(",", ".");
                                        if (/^\d*\.?\d*$/.test(v)) updateVitrineOpening(opening.id, { heightCm: v });
                                      }}
                                      className="w-full border rounded-lg p-2 text-center text-sm font-bold"
                                      placeholder="0"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-600 mb-1">פרופיל</label>
                                    <select
                                      value={opening.profile}
                                      onChange={(e) => updateVitrineOpening(opening.id, { profile: e.target.value as VitrineProfile })}
                                      className="w-full border rounded-lg p-2 bg-white text-sm font-bold"
                                    >
                                      <option value="7000">7000</option>
                                      <option value="9000">9000</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-600 mb-1">הערה לפתח (אופציונלי)</label>
                                  <input
                                    type="text"
                                    value={opening.note}
                                    onChange={(e) => updateVitrineOpening(opening.id, { note: e.target.value })}
                                    className="w-full border rounded-lg p-2 text-sm"
                                    placeholder="למשל: מנעול יפני צד ימין"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-bold text-cyan-900">
                            <div className="rounded-lg bg-cyan-100 border border-cyan-200 p-2">מ״ר 7000: {vitrineQuote.sum7000.toFixed(2)}</div>
                            <div className="rounded-lg bg-cyan-100 border border-cyan-200 p-2">מ״ר 9000: {vitrineQuote.sum9000.toFixed(2)}</div>
                            <div className="rounded-lg bg-white border border-cyan-200 p-2">ויטרינות לפני מע״מ: ₪ {Math.round(vitrineQuote.exVat).toLocaleString()}</div>
                            <div className="rounded-lg bg-white border border-cyan-200 p-2">ויטרינות כולל מע״מ: ₪ {Math.round(vitrineQuote.incVat).toLocaleString()}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t pt-3">
                      <div><label className="block text-xs font-semibold text-slate-600 mb-1">סוג מסגרת</label><select value={frameType} onChange={(e) => { setFrameType(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white"><option value="doubleT">דאבל טי 140/40</option><option value="doubleTHiTech140">דאבל טי הייטק 140/40</option><option value="doubleTHiTech120">דאבל טי הייטק 120/40</option><option value="smooth">פרופיל חלק 120/40</option></select></div>
                      <div><label className="block text-xs font-semibold text-slate-600 mb-1">מידת חציץ</label><select value={dividerSize} onChange={(e) => { setDividerSize(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white"><option value="120">120/40</option><option value="100">100/40</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-semibold text-slate-600 mb-1">צבע מסגרת וחציצים</label><select value={colorSelect} onChange={(e) => { setColorSelect(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white">{RAL_OPTIONS.map((o) => <option key={o} value={o}>{getRalLabel(o)}</option>)}</select></div>
                      <div><label className="block text-xs font-semibold text-slate-600 mb-1">צבע שלבי הצללה</label><select value={shadeColorSelect} onChange={(e) => { setShadeColorSelect(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white">{RAL_OPTIONS.map((o) => <option key={o} value={o}>{getRalLabel(o)}</option>)}</select></div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-xs font-bold text-slate-500 mb-2">חלוקת שדות (מספר חציצים)</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs mb-1">חציצים רגילים</label>
                          <input
                            type="number"
                            value={dividerSmoothCount !== "" ? dividerSmoothCount : (pergolaResult.autoSmoothBase ? String(pergolaResult.autoSmoothBase) : "")}
                            onChange={(e) => { setDividerSmoothCount(e.target.value); saveCurrentState(); }}
                            placeholder=""
                            min={0}
                            className="w-full border rounded-lg p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-yellow-600 mb-1">חציצי תאורה (לד)</label>
                          <input
                            type="number"
                            value={dividerLedCount !== "" ? dividerLedCount : (pergolaResult.autoLedBase ? String(pergolaResult.autoLedBase) : "")}
                            onChange={(e) => { setDividerLedCount(e.target.value); saveCurrentState(); }}
                            placeholder=""
                            min={0}
                            className="w-full border border-yellow-300 rounded-lg p-2"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold mb-4 border-b pb-2 text-slate-700 flex items-center gap-2">☀️ הצללה וקירוי</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">סוג פרופיל הצללה</label><select value={shadingProfile} onChange={(e) => { setShadingProfile(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white"><option value="20x40">20/40</option><option value="20x70">20/70</option><option value="mix">משולב (70+40+40)</option><option value="none">ללא (סנטף בלבד)</option></select></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">מרווח בין שלבים</label><select value={spacing} onChange={(e) => { setSpacing(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white"><option value="2">2 ס&quot;מ</option><option value="4">4 ס&quot;מ</option><option value="0">0 (אטום)</option></select></div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                    <label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={hasSantaf} onChange={(e) => { setHasSantaf(e.target.checked); saveCurrentState(); }} className="w-5 h-5 accent-green-600" /><span className="text-sm font-bold text-green-800">הוסף קירוי סנטף BH פלרם</span></label>
                    {hasSantaf && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-green-200">
                        <div><label className="block text-[10px] font-semibold text-slate-600 mb-1">צבע סנטף</label><select value={santafColor} onChange={(e) => { setSantafColor(e.target.value); saveCurrentState(); }} className="w-full border border-green-300 rounded-lg p-1.5 text-sm bg-white"><option value="שקוף">שקוף</option><option value="אפור">אפור</option><option value="כחול">כחול</option><option value="חום">חום</option></select></div>
                        <div><label className="block text-[10px] font-semibold text-slate-600 mb-1">סוג אף מים</label><select value={dripEdgeType} onChange={(e) => { setDripEdgeType(e.target.value); saveCurrentState(); }} className="w-full border border-green-300 rounded-lg p-1.5 text-sm bg-white"><option value="wave2.5">גלי 2.5 מטר</option><option value="wave3.0">גלי 3.0 מטר</option><option value="smooth3.0">חלק 3.0 מטר</option></select></div>
                      </div>
                    )}
                    {hasSantaf && pergolaResult.santafInfoHtml && <div className="text-sm text-green-800 bg-green-100 p-3 mt-2 rounded-lg border border-green-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: pergolaResult.santafInfoHtml }} />}
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 bg-slate-50">
                  <h3 className="text-lg font-bold mb-4 border-b border-slate-200 pb-2 text-slate-700 flex items-center gap-2">➕ תוספות ועמודים</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">כמות עמודים חזית</label><input type="number" value={postCountFront} onChange={(e) => { setPostCountFront(e.target.value); saveCurrentState(); }} placeholder="0" min={0} className="w-full border rounded-lg p-2" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">כמות עמודים צד ימין</label><input type="number" value={postCountRight} onChange={(e) => { setPostCountRight(e.target.value); saveCurrentState(); }} placeholder="0" min={0} className="w-full border rounded-lg p-2" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">כמות עמודים צד שמאל</label><input type="number" value={postCountLeft} onChange={(e) => { setPostCountLeft(e.target.value); saveCurrentState(); }} placeholder="0" min={0} className="w-full border rounded-lg p-2" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">כמות עמודים בסוף</label><input type="number" value={postCountBack} onChange={(e) => { setPostCountBack(e.target.value); saveCurrentState(); }} placeholder="0" min={0} className="w-full border rounded-lg p-2" /></div>
                    <div className="md:col-span-4"><label className="block text-[11px] text-slate-500 mb-1">כמות כוללת (אוטומטי)</label><div className="w-full border rounded-lg p-2 bg-slate-50 font-bold text-slate-700">{(parseInt(postCountFront) || 0) + (parseInt(postCountRight) || 0) + (parseInt(postCountLeft) || 0) + (parseInt(postCountBack) || 0)}</div></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">גבהי עמודים (מופרדים ברווח, נקודה-פסיק או פסיק)</label><input type="text" inputMode="decimal" value={postHeight} onChange={(e) => { setPostHeight(e.target.value); saveCurrentState(); }} placeholder="250 260 או 250; 260" className="w-full border rounded-lg p-2" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">פרופיל עמוד</label><select value={postType} onChange={(e) => { setPostType(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-2 bg-white"><option value="100">100/100</option><option value="130">130/130</option><option value="80">80/80</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">מותחני קיר (כמות)</label><input type="number" value={tensionerCount} onChange={(e) => { setTensionerCount(e.target.value); saveCurrentState(); }} placeholder="0" min={0} className="w-full border rounded-lg p-2" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">צבע מותחנים</label><input type="text" value={tensionerColor} onChange={(e) => { setTensionerColor(e.target.value); saveCurrentState(); }} placeholder="שחור" className="w-full border rounded-lg p-2" /></div>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-200 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={hasLed} onChange={(e) => { setHasLed(e.target.checked); saveCurrentState(); }} className="w-5 h-5 accent-yellow-500" /><span className="text-sm font-bold text-yellow-800">תאורת לד שקועה</span></label>
                    {hasLed && <div className="grid grid-cols-2 gap-2 mt-2"><div><label className="block text-[10px] mb-1">כמות</label><input type="number" value={ledCount} onChange={(e) => { setLedCount(e.target.value); saveCurrentState(); }} placeholder="0" className="w-full border rounded-lg p-1.5 text-sm" /></div><div><label className="block text-[10px] mb-1">גוון</label><select value={ledColor} onChange={(e) => { setLedColor(e.target.value); saveCurrentState(); }} className="w-full border rounded-lg p-1.5 text-sm bg-white"><option value="לבן חם">לבן חם</option><option value="לבן קר">לבן קר</option></select></div></div>}
                  </div>
                  <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-200">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={hasFan} onChange={(e) => { setHasFan(e.target.checked); saveCurrentState(); }} className="w-5 h-5 accent-cyan-500" /><span className="text-sm font-bold text-cyan-800">הכנה למאווררי תקרה</span></label>
                    {hasFan && <div className="mt-2"><label className="block text-[10px] mb-1">כמות מאווררים</label><input type="number" value={fanCount} onChange={(e) => { setFanCount(e.target.value); saveCurrentState(); }} placeholder="0" className="w-1/2 border rounded-lg p-1.5 text-sm" /></div>}
                  </div>
                </div>
              </div>
              <div className="xl:col-span-8 space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 no-print-section">
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-center"><p className="text-slate-500 text-xs font-bold mb-1">סה&quot;כ שטח מחושב</p><p className="text-2xl font-black text-slate-800">{Number(pergolaResult.sqm ?? 0).toFixed(2)} מ&quot;ר</p></div>
                  <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center">
                    <p className="text-blue-200 text-xs font-bold mb-1">
                      {hasVitrines ? "מחיר כולל (פרגולה + ויטרינות)" : "מחיר ללקוח כולל מע״מ"}
                    </p>
                    {pergolaCustomerPriceDisplay.hasOverride && showPergolaPriceCompare ? (
                      <>
                        <p className="text-sm font-bold text-blue-100/80 line-through decoration-2">
                          ₪ {pergolaCustomerPriceDisplay.liveInc.toLocaleString()}
                        </p>
                        <p className="text-2xl font-black">
                          ₪ {pergolaCustomerPriceDisplay.displayInc.toLocaleString()}
                        </p>
                        <p className="text-[10px] font-bold text-amber-200 mt-0.5">
                          {pergolaCustomerPriceDisplay.isDiscount ? "מחיר אחרי הנחה" : "מחיר עסקה מעודכן"}
                        </p>
                        <p className="text-[10px] text-blue-200 mt-1 opacity-80">
                          ₪ {pergolaCustomerPriceDisplay.displayEx.toLocaleString()} לפני מע&quot;מ
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-black">
                          ₪ {pergolaCustomerPriceDisplay.displayInc.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-blue-200 mt-1 opacity-80">
                          ₪ {pergolaCustomerPriceDisplay.displayEx.toLocaleString()} לפני מע&quot;מ
                        </p>
                        {pergolaCustomerPriceDisplay.hasOverride ? (
                          <p className="text-[10px] font-bold text-amber-200 mt-1">
                            {pergolaCustomerPriceDisplay.isDiscount ? "כולל הנחה מה-CRM" : "מחיר מעודכן מה-CRM"}
                          </p>
                        ) : null}
                      </>
                    )}
                    {pergolaCustomerPriceDisplay.hasOverride ? (
                      <button
                        type="button"
                        onClick={() => setShowPergolaPriceCompare((v) => !v)}
                        className="mt-2 self-start rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold text-white hover:bg-white/25 transition"
                      >
                        {showPergolaPriceCompare ? "הסתר מחיר מקורי" : "השווה למחיר מקורי"}
                      </button>
                    ) : null}
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 shadow-sm border border-dashed border-slate-300 flex flex-col justify-center">
                    <button type="button" onClick={() => setHiddenCostsBox((v) => !v)} className="text-xs font-bold text-slate-600 flex items-center justify-center gap-2 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-xl transition">🔒 הצג / הסתר פירוט עלויות (לשימוש פנימי)</button>
                  </div>
                </div>
                {hiddenCostsBox && (
                  <div className="no-print-section grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-center"><p className="text-slate-500 text-xs font-bold mb-1">משקל אלומיניום נקי</p><p className="text-2xl font-black text-slate-800">{pergolaResult.totalWeight.toFixed(1)} ק&quot;ג</p><p className="text-[10px] text-orange-500 font-bold mt-1">* ייתכן סטיה של 3%</p></div>
                    <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center"><p className="text-slate-300 text-xs font-bold mb-1">עלות חומרים משוערת (לפני מע&quot;מ)</p><p className="text-2xl font-black">₪ {Math.round(pergolaResult.materialCost).toLocaleString()}</p></div>
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center"><p className="text-indigo-100 text-xs font-bold mb-1">עלות התקנה והובלה (לפני מע&quot;מ)</p><p className="text-2xl font-black">₪ {Math.round(pergolaResult.installCost).toLocaleString()}</p><p className="text-[10px] text-indigo-200 mt-1 opacity-90">{pergolaResult.installSqmText || "לפי 0 ₪ למ\"ר + הובלה"}</p></div>
                    <div className="bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center"><p className="text-emerald-100 text-xs font-bold mb-1">רווח גולמי (לפני מע&quot;מ)</p><p className="text-2xl font-black">₪ {Math.round(pergolaResult.profit).toLocaleString()}</p><p className="text-[11px] text-emerald-100 mt-1 opacity-90 font-bold">{pergolaResult.exVat > 0 ? `${pergolaResult.profitMargin}% רווח משוער` : "0%"}</p></div>
                  </div>
                )}
                <div className="hidden print:block text-center border-b-2 border-slate-800 pb-4 mb-6">
                  <h2 className="text-3xl font-black text-slate-800">הוראות ייצור - {sysContractorName}</h2>
                  <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-2 text-lg"><p><strong>לקוח:</strong> {custName || "-"}</p><p><strong>תאריך:</strong> {new Date().toLocaleDateString("he-IL")}</p><p><strong>מידות:</strong> {pergolaResult.viewDimensions}</p><p><strong>גוון:</strong> {pergolaResult.viewColorDisplay}</p></div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-md border-r-4 border-orange-500">
                  <h2 className="text-xl font-black mb-4 text-orange-800 border-b border-orange-100 pb-2 flex items-center gap-2">📐 סקיצה והוראות עבודה למסגר</h2>
                  <div key={`sim-${lengthWall}-${exitWidth}-${spacing}-${colorSelect}-${shadeColorSelect}-${frameType}`} className="text-sm text-slate-800 space-y-2 font-medium" dangerouslySetInnerHTML={{ __html: pergolaResult.instructionsHtml }} />
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-md border-r-4 border-blue-500">
                  <h2 className="text-xl font-black mb-4 text-blue-800 border-b border-blue-100 pb-2 flex items-center gap-2">✂️ רשימת חיתוכים (בס&quot;מ)</h2>
                  <div className="overflow-x-auto"><table className="w-full text-right border-collapse"><thead><tr className="bg-slate-50 text-slate-600 border-y border-slate-200"><th className="p-3 font-bold">פרופיל</th><th className="p-3 font-bold">ייעוד</th><th className="p-3 font-bold text-center">כמות לחיתוך</th><th className="p-3 font-bold text-center">מידה לחיתוך</th><th className="p-3 font-bold text-center">מוט</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: pergolaResult.cuttingHtml }} /></table></div>
                  {pergolaResult.shadeSlatPlanHtml ? (
                    <div className="mt-5 pt-4 border-t border-blue-100">
                      <h3 className="text-base font-black text-blue-900 mb-3">שלבי הצללה — תוכנית חיתוך (מוט 6 מ׳)</h3>
                      <div dangerouslySetInnerHTML={{ __html: pergolaResult.shadeSlatPlanHtml }} />
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl p-6 shadow-md border-r-4 border-blue-500">
                    <h2 className="text-lg font-black mb-4 border-b border-blue-100 pb-2 text-blue-800 flex items-center gap-2">📦 הזמנת חומר למחסן (מוטות שלמים)</h2>
                    <div className="overflow-x-auto"><table className="w-full text-right border-collapse text-sm"><thead><tr className="bg-slate-50 text-slate-600 border-y border-slate-200"><th className="p-2 font-bold">סוג פרופיל</th><th className="p-2 font-bold text-center">כמות מוטות</th><th className="p-2 font-bold text-center">אורך מוט</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: pergolaResult.bomHtml }} /></table></div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-md border-r-4 border-emerald-500">
                    <h2 className="text-lg font-black mb-4 text-emerald-800 border-b border-emerald-100 pb-2 flex items-center gap-2">🔩 פירזול ותוספות</h2>
                    <div className="flex flex-col gap-2 text-sm font-medium text-slate-700" dangerouslySetInnerHTML={{ __html: pergolaResult.hardwareHtml }} />
                  </div>
                </div>
                <div className="bg-red-50/50 rounded-2xl p-6 shadow-sm border-r-4 border-red-500 no-print">
                  <details className="cursor-pointer group">
                    <summary className="text-lg font-black text-red-800 flex justify-between items-center outline-none"><div className="flex items-center gap-2">🗑️ פירוט נפל ושאריות חומר</div><span className="text-sm bg-red-100 px-3 py-1 rounded-full border border-red-200 group-hover:bg-red-200 transition">{pergolaResult.wasteBadgeText}</span></summary>
                    <div className="overflow-x-auto mt-4 pt-4 border-t border-red-100"><table className="w-full text-right border-collapse text-sm"><thead><tr className="text-red-900 border-b border-red-200"><th className="p-2">פרופיל</th><th className="p-2 text-center">אורך מקורי</th><th className="p-2 text-center">נפל (מטרים)</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: pergolaResult.wasteHtml }} /></table></div>
                  </details>
                </div>
              </div>
            </div>
          </section>
        )}
        {/* VIEW: FENCES */}
        {currentView === "fences" && (
          <section className="w-full max-w-none px-3 py-4 sm:px-4 md:px-5 lg:px-6">
            <header className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-3xl font-black text-blue-900">יצירת גדר חדשה</h2>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => fenceResult.sqm > 0 && printFenceReport()} className="bg-slate-800 text-white px-5 py-2 rounded-xl font-bold hover:bg-slate-900 shadow">
                  🖨️ דוח ייצור
                </button>
                <button type="button" onClick={() => fenceResult.sqm > 0 && printFenceQuote()} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 shadow">📄 סיכום ללקוח</button>
                <button type="button" onClick={sendFenceSimToWhatsApp} className="bg-teal-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-teal-700 shadow">🎥 שלח הדמיה בוואטסאפ</button>
                <button type="button" onClick={() => setKitOrderModal({ kind: "fence" })} className="bg-slate-700 text-white px-5 py-2 rounded-xl font-bold hover:bg-slate-800 shadow">
                  🏭 שלח לייצור
                </button>
                <button type="button" onClick={saveFenceToCRM} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-700 shadow">💾 שמור ל-CRM</button>
                <button type="button" onClick={resetFenceForm} className="bg-red-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-red-600 shadow">🔄 איפוס</button>
              </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-5">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-200 bg-blue-50">
                  <h3 className="text-lg font-bold mb-3 text-blue-800">👤 פרטי לקוח</h3>
                  <div className="space-y-3">
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">שם הלקוח</label><input type="text" value={fenceCustName} onChange={(e) => setFenceCustName(e.target.value)} className="w-full border rounded-lg p-2.5 bg-white" /></div>
                    <div className="grid grid-cols-2 gap-2"><div><label className="block text-sm font-semibold text-slate-600 mb-1">טלפון</label><input type="text" name="fence-customer-phone" inputMode="tel" autoComplete="off" dir="ltr" value={fenceCustPhone} onChange={(e) => setFenceCustPhone(e.target.value)} placeholder="נייד הלקוח" className="w-full border rounded-lg p-2.5 bg-white" /></div><div><label className="block text-sm font-semibold text-slate-600 mb-1">כתובת</label><input type="text" value={fenceCustAddress} onChange={(e) => setFenceCustAddress(e.target.value)} className="w-full border rounded-lg p-2.5 bg-white" /></div></div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 space-y-2">
                      <label className="block text-sm font-bold text-amber-950">🔧 הערות התקנה / חומר לביקור הבא</label>
                      <p className="text-[11px] text-amber-900/85 leading-snug">לשימוש פנימי בלבד — לא מוצג בהצעת מחיר או בסיכום ללקוח.</p>
                      <textarea
                        value={fenceCustInternalNotes}
                        onChange={(e) => setFenceCustInternalNotes(e.target.value)}
                        rows={3}
                        placeholder="למשל: להביא מחר זוית / פרופיל…"
                        className="w-full resize-y min-h-[4.5rem] border border-amber-200 rounded-lg p-2.5 text-sm bg-white text-slate-800 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-2 border-b pb-2 gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-700">📏 מקטעי גדר</h3>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={addFenceContinue} className="text-xs bg-sky-100 text-sky-800 px-3 py-1 rounded font-bold hover:bg-sky-200">+ המשך (אותו כיוון)</button>
                      <button type="button" onClick={addFenceCorner} className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded font-bold hover:bg-emerald-200">+ פינה 90°</button>
                      <button type="button" onClick={addFenceSeg} className="text-xs bg-slate-800 text-white px-3 py-1 rounded font-bold hover:bg-slate-700">+ מקטע</button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    על כל מקטע לוחצים <strong>שמאל</strong> או <strong>ימין</strong>. «פינה» / «המשך» ממשיכים מאותו צד.
                  </p>
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-700 mb-2">שער כניסה להדמיה</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["none", "בלי שער"],
                        ["single", "כנף אחת"],
                        ["double", "דו-כנפי"],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFenceSimGate(id)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${
                            fenceSimGate === id
                              ? "bg-slate-800 text-white border-slate-900"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">רק בהדמיה. לחיצה על השער פותחת וסוגרת. מידות וחיתוך לשער יגיעו בהמשך.</p>
                  </div>
                  <div className="space-y-4">{fenceSegments.map((seg, segIndex) => {
                    const lab = fenceSegLabel(fenceSegments, segIndex, fenceSimEnv);
                    const sideNow = fenceSegSideOf(fenceSegments, segIndex);
                    return (
                    <div key={seg.id} className={`p-5 rounded-2xl border-2 shadow-sm relative flex flex-col gap-4 ${fenceSegToneClass(lab.tone)}`}>
                      <button type="button" onClick={() => removeFenceSeg(seg.id)} className="absolute top-4 left-4 text-red-500 bg-red-50 w-8 h-8 rounded-lg font-black hover:bg-red-100 border border-red-100 flex items-center justify-center">X</button>
                      <div className="pr-2 pl-10">
                        <p className="text-lg font-black text-slate-800">{lab.title}</p>
                      </div>
                      {!seg.connected && fenceSimEnv === "villa" ? (
                        <div className="grid grid-cols-2 gap-2" dir="ltr">
                          <button
                            type="button"
                            onClick={() => setFenceSegSide(seg.id, "left")}
                            className={`rounded-2xl py-4 text-xl font-black border-2 transition ${
                              sideNow === "left"
                                ? "bg-sky-600 text-white border-sky-700 shadow-md"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-sky-50"
                            }`}
                          >
                            שמאל
                          </button>
                          <button
                            type="button"
                            onClick={() => setFenceSegSide(seg.id, "right")}
                            className={`rounded-2xl py-4 text-xl font-black border-2 transition ${
                              sideNow === "right"
                                ? "bg-amber-500 text-white border-amber-600 shadow-md"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50"
                            }`}
                          >
                            ימין
                          </button>
                        </div>
                      ) : null}
                      <div><label className="block text-sm font-bold text-slate-600 mb-1">אורך כולל (ס&quot;מ)</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "L")} onChange={(e) => setFenceSegDraft(seg.id, "L", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "L")} className="w-full text-center font-black text-2xl p-3 border border-slate-300 rounded-xl bg-white" placeholder="0" /></div>
                      <div><label className="block text-sm font-bold text-slate-600 mb-1">גובה (ס&quot;מ)</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "H")} onChange={(e) => setFenceSegDraft(seg.id, "H", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "H")} className="w-full text-center font-black text-2xl p-3 border border-slate-300 rounded-xl bg-white" placeholder="0" /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">מספר עמודים כולל{seg.connected ? " (כולל עמוד משותף)" : ""}</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "P")} onChange={(e) => setFenceSegDraft(seg.id, "P", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "P")} className="w-full text-center font-black text-xl p-2.5 border border-slate-300 rounded-lg bg-white" placeholder="סה״כ" /></div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button type="button" onClick={() => insertFenceAfter(seg.id, "continue")} className="text-[11px] bg-sky-100 text-sky-800 px-2.5 py-1.5 rounded-lg font-bold hover:bg-sky-200">+ המשך אחרי זה</button>
                        <button type="button" onClick={() => insertFenceAfter(seg.id, "corner")} className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-1.5 rounded-lg font-bold hover:bg-emerald-200">+ פינה אחרי זה</button>
                      </div>
                    </div>
                    );
                  })}</div>
                  <div className="mt-4 pt-3 border-t">
                    <div className="text-xs text-slate-500 font-bold bg-slate-100 p-2 rounded-lg text-center mt-2">החישוב המלא מתבצע בשרת המערכת</div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 bg-slate-50">
                  <h3 className="text-lg font-bold mb-4 border-b border-slate-200 pb-2 text-slate-700">🧱 מפרט טכני</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">שילוב פרופילים</label>
                      <select value={fenceSlat} onChange={(e) => {
                        const v = e.target.value;
                        setFenceSlat(v);
                        if (v === "zigzag") setFenceGap("0");
                      }} className="w-full border rounded-lg p-2 bg-white">
                        <option value="100">רק 100/20</option>
                        <option value="70">רק 70/20</option>
                        <option value="40">רק 40/20</option>
                        <option value="20">רק 20/20</option>
                        <option value="zigzag">זיגזג אטום 120/20</option>
                        <option value="mix1">מיקס: 2x40 ואז 1x70</option>
                        <option value="mix2">מיקס: 2x40, 2x20, 1x70</option>
                      </select>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-600 font-semibold">
                        <span className="inline-flex items-center gap-1"><ProfileIcon profileName="מילוי 100/20" className="w-4 h-5 text-slate-700" />100/20</span>
                        <span className="inline-flex items-center gap-1"><ProfileIcon profileName="מילוי 70/20" className="w-4 h-5 text-slate-700" />70/20</span>
                        <span className="inline-flex items-center gap-1"><ProfileIcon profileName="מילוי 40/20" className="w-4 h-5 text-slate-700" />40/20</span>
                        <span className="inline-flex items-center gap-1"><ProfileIcon profileName="מילוי 20/20" className="w-4 h-5 text-slate-700" />20/20</span>
                        <span className="inline-flex items-center gap-1"><ProfileIcon profileName="מילוי זיגזג אטום 120/20" className="w-5 h-4 text-slate-700" />זיגזג</span>
                      </div>
                    </div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">מרווח (ס&quot;מ)</label><select value={fenceGap} onChange={(e) => setFenceGap(e.target.value)} className="w-full border rounded-lg p-2 bg-white" disabled={fenceSlat === "zigzag"}><option value="0">0 (אטום)</option><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option><option value="3">3</option></select>{fenceSlat === "zigzag" ? <p className="text-[10px] text-emerald-700 mt-1 font-semibold">זיגזג אטום — בלי מרווח בין שלבים</p> : null}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">גוון עמודים ומסגרת</label><select value={fenceColor} onChange={(e) => setFenceColor(e.target.value)} className="w-full border rounded-lg p-2 bg-white">{RAL_OPTIONS.map((o) => <option key={o} value={o}>{getRalLabel(o)}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">גוון שלבים (מילוי)</label><select value={fenceSlatColor} onChange={(e) => setFenceSlatColor(e.target.value)} className="w-full border rounded-lg p-2 bg-white">{RAL_OPTIONS.map((o) => <option key={o} value={o}>{getRalLabel(o)}</option>)}</select></div>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8 space-y-6">
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => switchView("fence-3d")}
                    className="px-4 py-2 rounded-xl font-bold transition shadow-sm border bg-slate-800 text-white border-slate-900 hover:bg-slate-700"
                  >
                    🧱 פתח הדמיית גדר
                  </button>
                </div>
                {fenceResult.sqm <= 0 && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm font-bold">💡 הזן <strong>אורך</strong> ו<strong>גובה</strong> במקטע (לפחות במקטע אחד) כדי לראות חישוב ומחירים.</div>}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center"><p className="text-slate-500 text-xs font-bold mb-1">סה&quot;כ מ&quot;ר</p><p className="text-xl font-black text-slate-800">{(fenceResult?.sqm ?? 0).toFixed(2)}</p></div>
                      <div className="bg-slate-50 rounded-2xl p-4 shadow-sm border border-dashed border-slate-300 flex flex-col justify-center"><button type="button" onClick={() => setFenceHiddenCostsBox((v) => !v)} className="text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-xl transition">🔒 הצג / הסתר פירוט עלויות</button></div>
                      <div className="bg-blue-600 rounded-2xl p-4 text-white text-center shadow-md">
                        <p className="text-blue-100 text-xs font-bold mb-1">מכירה ללקוח (כולל מע&quot;מ)</p>
                        {fenceCustomerPriceDisplay.hasOverride && showFencePriceCompare ? (
                          <>
                            <p className="text-sm font-bold text-blue-100/80 line-through decoration-2">
                              ₪ {fenceResult.sqm > 0 ? fenceCustomerPriceDisplay.liveInc.toLocaleString() : "0"}
                            </p>
                            <p className="text-xl font-black">
                              ₪ {fenceResult.sqm > 0 ? fenceCustomerPriceDisplay.displayInc.toLocaleString() : "0"}
                            </p>
                            <p className="text-[10px] font-bold text-amber-200 mt-0.5">
                              {fenceCustomerPriceDisplay.isDiscount ? "מחיר אחרי הנחה" : "מחיר עסקה מעודכן"}
                            </p>
                            <p className="text-[10px] text-blue-200 mt-1 opacity-90">
                              ₪ {fenceResult.sqm > 0 ? fenceCustomerPriceDisplay.displayEx.toLocaleString() : "0"} לפני מע&quot;מ
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xl font-black">
                              ₪ {fenceResult.sqm > 0 ? fenceCustomerPriceDisplay.displayInc.toLocaleString() : "0"}
                            </p>
                            <p className="text-[10px] text-blue-200 mt-1 opacity-90">
                              ₪ {fenceResult.sqm > 0 ? fenceCustomerPriceDisplay.displayEx.toLocaleString() : "0"} לפני מע&quot;מ
                            </p>
                            {fenceCustomerPriceDisplay.hasOverride ? (
                              <p className="text-[10px] font-bold text-amber-200 mt-1">
                                {fenceCustomerPriceDisplay.isDiscount ? "כולל הנחה מה-CRM" : "מחיר מעודכן מה-CRM"}
                              </p>
                            ) : null}
                          </>
                        )}
                        {fenceCustomerPriceDisplay.hasOverride ? (
                          <button
                            type="button"
                            onClick={() => setShowFencePriceCompare((v) => !v)}
                            className="mt-2 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold text-white hover:bg-white/25 transition"
                          >
                            {showFencePriceCompare ? "הסתר מחיר מקורי" : "השווה למחיר מקורי"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {fenceHiddenCostsBox && fenceResult.sqm > 0 && (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center"><p className="text-slate-500 text-xs font-bold mb-1">משקל נטו</p><p className="text-xl font-black text-slate-800">{fenceResult.weight.toFixed(1)} ק&quot;ג</p></div>
                        <div className="bg-red-50 rounded-2xl p-4 border border-red-200 text-center shadow-sm"><p className="text-red-700 text-xs font-bold mb-1">שאריות נפל</p><p className="text-xl font-black text-red-600">{fenceResult.wasteKg.toFixed(1)} ק&quot;ג</p><p className="text-[10px] font-bold text-red-500 mt-1">{fenceResult.wastePercent.toFixed(1)}% פחת</p></div>
                        <div className="bg-slate-800 rounded-2xl p-4 text-white text-center shadow-md"><p className="text-slate-300 text-xs font-bold mb-1">עלות חומר משוערת (לפני מע&quot;מ)</p><p className="text-xl font-black">₪ {Math.round(fenceResult.cost).toLocaleString()}</p></div>
                        <div className="bg-indigo-100 rounded-2xl p-4 text-indigo-900 text-center border border-indigo-200"><p className="text-indigo-700 text-xs font-bold mb-1">רווח גולמי (לפני מע&quot;מ)</p><p className="text-xl font-black">₪ {Math.round(fenceResult.profit).toLocaleString()}</p></div>
                      </div>
                    )}
                    <div className="bg-white rounded-2xl p-6 shadow-md border-t-4 border-blue-500"><h2 className="text-lg font-black mb-4 text-slate-800 border-b pb-2">✂️ מידות חיתוך (ס&quot;מ)</h2><div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr><th>פרופיל / ייעוד</th><th className="text-center">כמות</th><th className="text-center">מידה לחיתוך</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: fenceResult?.cuttingHtml ?? "" }} /></table></div></div>
                    <div className="bg-white rounded-2xl p-6 shadow-md border-t-4 border-emerald-500"><h2 className="text-lg font-black mb-4 text-slate-800 border-b pb-2">📦 הזמנה מהמחסן (מוטות 6 מ&apos;)</h2><div className="overflow-x-auto mb-4"><table className="w-full text-right text-sm"><thead><tr><th>סוג פרופיל</th><th className="text-center">כמות מוטות</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: fenceResult?.bomHtml ?? "" }} /></table></div><div className="bg-slate-50 p-4 rounded-xl border border-slate-200"><h4 className="font-bold text-slate-700 mb-2">🔩 פירזול ואביזרים</h4><div className="space-y-2 text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: fenceResult?.hardwareHtml ?? "" }} /></div></div>
                    <div className="bg-white rounded-2xl p-6 shadow-md border-r-4 border-blue-500"><h2 className="text-xl font-black mb-4 text-blue-800 border-b border-blue-100 pb-2">📐 מפרט שדות והוראות</h2><div className="text-base text-slate-800 space-y-3 font-medium" dangerouslySetInnerHTML={{ __html: fenceResult?.instructionsHtml ?? "הוסף מקטעים (אורך, גובה ועמודים) לחישוב מדויק." }} /></div>
              </div>
            </div>
          </section>
        )}
        {/* VIEW: SCHEDULE MANAGER */}
        {currentView === "schedule" && (
          <section className="flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 sm:px-4 sm:py-3">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-800 sm:text-2xl lg:text-3xl">ניהול עבודות ולו&quot;ז</h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">מעקב עבודות, תאריכי התקנה וחישוב תחילת ייצור.</p>
              </div>
              <button type="button" onClick={() => switchView("dashboard")} className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                חזור ללוח בקרה
              </button>
            </header>
            <div className="relative min-h-0 flex-1 w-full overflow-y-auto bg-slate-50">
              <ScheduleView
                jobs={scheduleJobs}
                onJobsChange={handleScheduleJobsChange}
                loading={!workspaceCloudHydrated}
              />
            </div>
          </section>
        )}
        {currentView === "field-windows" && (
          <section className="p-0">
            <FieldWindowsView
              records={fieldWindowRecords}
              onRecordsChange={handleFieldWindowRecordsChange}
              crmData={crmData}
              onCreateCrmLink={handleFieldWindowCrmLink}
              businessName={sysContractorName}
              loading={!workspaceCloudHydrated}
              openRecordId={fieldWindowsOpenRecordId}
              onOpenRecordConsumed={() => setFieldWindowsOpenRecordId(null)}
            />
          </section>
        )}
        {/* VIEW: 3D SIMULATION */}
        {currentView === "3d" && (
          <section className="flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 sm:px-4 sm:py-3">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-800 sm:text-2xl lg:text-3xl">הדמיה חדשה עם תמונת המקום</h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">הדמיית 3D מתקדמת המשולבת עם תמונת המקום.</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" onClick={sendPergolaSimToWhatsApp} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700">
                  שלח הדמיה בוואטסאפ
                </button>
                <button type="button" onClick={() => switchView("data")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                  חזור למפרט טכני
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 w-full overflow-hidden bg-slate-900">
              <iframe
                key={pergolaSyncToken}
                title="Yarhi PRO - הדמיה תלת-ממד"
                src={pergolaSimSrc}
                className="block h-full w-full min-h-0 border-0 bg-slate-900"
                referrerPolicy="no-referrer"
                loading="lazy"
                ref={pergolaSimIframeRef}
                onLoad={() => setPergolaSimLoaded(true)}
              />
            </div>
          </section>
        )}
        {/* VIEW: FENCE 3D */}
        {currentView === "fence-3d" && (
          <section className="flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 sm:px-4 sm:py-3">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-800 sm:text-2xl lg:text-3xl">הדמיית גדר</h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">מזינים מידות ושער כאן — ההדמיה מתעדכנת מיד. אותו נתון נשמר גם במסך גדרות.</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" onClick={sendFenceSimToWhatsApp} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700">
                  שלח הדמיה בוואטסאפ
                </button>
                <button type="button" onClick={() => switchView("fences")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                  למפרט וחישוב
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
              {fenceSimPanelVisible && (
              <aside className="shrink-0 border-b border-slate-200 bg-slate-50 overflow-y-auto max-h-[42vh] lg:max-h-none lg:h-full lg:w-[22rem] xl:w-[24rem] lg:border-b-0 lg:border-l">
                <div className="space-y-4 p-3 sm:p-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <h3 className="text-base font-bold text-slate-700">📏 מקטעי גדר</h3>
                      <div className="flex gap-1.5 flex-wrap">
                        <button type="button" onClick={addFenceContinue} className="text-[11px] bg-sky-100 text-sky-800 px-2.5 py-1 rounded-lg font-bold hover:bg-sky-200">+ המשך</button>
                        <button type="button" onClick={addFenceCorner} className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg font-bold hover:bg-emerald-200">+ פינה 90°</button>
                        <button type="button" onClick={addFenceSeg} className="text-[11px] bg-slate-800 text-white px-2.5 py-1 rounded-lg font-bold hover:bg-slate-700">+ מקטע</button>
                      </div>
                    </div>
                    <p className="mb-3 text-[11px] font-bold text-slate-600">
                      לוחצים <span className="text-sky-700">שמאל</span> או <span className="text-amber-700">ימין</span> על המקטע — זהו.
                    </p>
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-[11px] font-black text-slate-700 mb-1.5">שער כניסה</p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ["none", "בלי שער"],
                          ["single", "כנף אחת"],
                          ["double", "דו-כנפי"],
                        ] as const).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setFenceSimGate(id)}
                            className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border ${
                              fenceSimGate === id
                                ? "bg-slate-800 text-white border-slate-900"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {fenceSegments.map((seg, segIndex) => {
                        const lab = fenceSegLabel(fenceSegments, segIndex, fenceSimEnv);
                        const sideNow = fenceSegSideOf(fenceSegments, segIndex);
                        return (
                        <div key={seg.id} className={`relative rounded-xl border-2 p-3 ${fenceSegToneClass(lab.tone)}`}>
                          <button type="button" onClick={() => removeFenceSeg(seg.id)} className="absolute top-2 left-2 text-red-500 bg-red-50 w-7 h-7 rounded-lg font-black text-xs hover:bg-red-100 border border-red-100">X</button>
                          <p className="pr-2 pl-8 text-base font-black text-slate-800">{lab.title}</p>
                          {!seg.connected && fenceSimEnv === "villa" ? (
                            <div className="mt-2 grid grid-cols-2 gap-2" dir="ltr">
                              <button
                                type="button"
                                onClick={() => setFenceSegSide(seg.id, "left")}
                                className={`rounded-xl py-3 text-lg font-black border-2 transition ${
                                  sideNow === "left"
                                    ? "bg-sky-600 text-white border-sky-700"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-sky-50"
                                }`}
                              >
                                שמאל
                              </button>
                              <button
                                type="button"
                                onClick={() => setFenceSegSide(seg.id, "right")}
                                className={`rounded-xl py-3 text-lg font-black border-2 transition ${
                                  sideNow === "right"
                                    ? "bg-amber-500 text-white border-amber-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50"
                                }`}
                              >
                                ימין
                              </button>
                            </div>
                          ) : null}
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">אורך</label>
                              <input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "L")} onChange={(e) => setFenceSegDraft(seg.id, "L", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "L")} className="w-full text-center font-black text-lg p-2 border border-slate-300 rounded-lg bg-white" placeholder="0" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">גובה</label>
                              <input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "H")} onChange={(e) => setFenceSegDraft(seg.id, "H", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "H")} className="w-full text-center font-black text-lg p-2 border border-slate-300 rounded-lg bg-white" placeholder="0" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">עמודים</label>
                              <input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "P")} onChange={(e) => setFenceSegDraft(seg.id, "P", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "P")} className="w-full text-center font-black text-lg p-2 border border-slate-300 rounded-lg bg-white" placeholder="0" />
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => insertFenceAfter(seg.id, "continue")} className="text-[10px] bg-sky-100 text-sky-800 px-2 py-1 rounded-md font-bold hover:bg-sky-200">+ המשך אחרי</button>
                            <button type="button" onClick={() => insertFenceAfter(seg.id, "corner")} className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-1 rounded-md font-bold hover:bg-emerald-200">+ פינה אחרי</button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-3 border-b pb-2 text-base font-bold text-slate-700">🧱 מראה בהדמיה</h3>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">פרופילים</label>
                        <select value={fenceSlat} onChange={(e) => {
                          const v = e.target.value;
                          setFenceSlat(v);
                          if (v === "zigzag") setFenceGap("0");
                        }} className="w-full border rounded-lg p-2 text-xs bg-white">
                          <option value="100">רק 100/20</option>
                          <option value="70">רק 70/20</option>
                          <option value="40">רק 40/20</option>
                          <option value="20">רק 20/20</option>
                          <option value="zigzag">זיגזג אטום 120/20</option>
                          <option value="mix1">מיקס: 2x40 ואז 1x70</option>
                          <option value="mix2">מיקס: 2x40, 2x20, 1x70</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">מרווח</label>
                        <select value={fenceGap} onChange={(e) => setFenceGap(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white" disabled={fenceSlat === "zigzag"}>
                          <option value="0">0</option>
                          <option value="1">1</option>
                          <option value="1.5">1.5</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">גוון עמודים</label>
                        <select value={fenceColor} onChange={(e) => setFenceColor(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white">{RAL_OPTIONS.map((o) => <option key={o} value={o}>{getRalLabel(o)}</option>)}</select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">גוון שלבים</label>
                        <select value={fenceSlatColor} onChange={(e) => setFenceSlatColor(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white">{RAL_OPTIONS.map((o) => <option key={o} value={o}>{getRalLabel(o)}</option>)}</select>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
              )}
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-900">
                <div className="pointer-events-none absolute top-3 right-3 z-30 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFenceSimPanelVisible((v) => !v)}
                    className="pointer-events-auto rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-slate-900 border border-slate-700"
                  >
                    {fenceSimPanelVisible ? "👁️ הסתר תפריט" : "👁️ הצג תפריט"}
                  </button>
                </div>
                <iframe
                  title="הדמיית גדר"
                  src={`/fence-sim.html?rev=${SIM_VERSION}`}
                  className="block h-full w-full min-h-0 border-0 bg-slate-900"
                  referrerPolicy="no-referrer"
                  ref={fenceSimIframeRef}
                  onLoad={() => setFenceSimLoaded(true)}
                />
              </div>
            </div>
          </section>
        )}
        {/* VIEW: SETTINGS */}
        {currentView === "settings" && (
          <section className="p-8 max-w-3xl mx-auto">
            <div className="bg-white rounded-3xl p-8 shadow-md border border-slate-200">
              <h2 className="text-3xl font-black text-slate-800 mb-2 border-b pb-4 flex items-center gap-3">⚙️ הגדרות מערכת</h2>
              <p className="font-bold text-slate-800 text-sm mb-2">כל המחירים המוצגים בשקלים (₪) בחלקי התמחור למטה — לפני מע״מ (למעט שדה אחוז המע״מ).</p>
              <p className="text-slate-500 text-sm mb-8">הגדרות אלו משפיעות על התמחור, הרווחיות ופרטי העסק שיופיעו במסמכים.</p>
              <div className="space-y-8">
                <div><h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">🏢 פרטי העסק (יופיעו בסיכום ללקוח)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-1 md:col-span-2"><label className="block text-sm font-semibold text-slate-600 mb-1">שם הקבלן / חברה</label><input type="text" value={sysContractorName} onChange={(e) => setSysContractorName(e.target.value)} className="w-full border rounded-lg p-2.5 text-lg font-bold" placeholder="ירחי אלומיניום" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">ח.פ / עוסק מורשה</label><input type="text" value={sysCompanyId} onChange={(e) => { setSysCompanyId(e.target.value); saveSysSettings(); }} placeholder="הכנס מספר ח.פ" className="w-full border rounded-lg p-2.5" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">טלפון העסק</label><input type="text" value={sysPhone} onChange={(e) => { setSysPhone(e.target.value); saveSysSettings(); }} placeholder="050-1234567" className="w-full border rounded-lg p-2.5" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">כתובת העסק</label><input type="text" value={sysAddress} onChange={(e) => { setSysAddress(e.target.value); saveSysSettings(); }} placeholder="הרצל 1, תל אביב" className="w-full border rounded-lg p-2.5" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">דוא&quot;ל</label><input type="text" value={sysEmail} onChange={(e) => { setSysEmail(e.target.value); saveSysSettings(); }} placeholder="info@example.com" className="w-full border rounded-lg p-2.5" /></div>
                    <div className="col-span-1 md:col-span-2"><label className="block text-sm font-semibold text-slate-600 mb-1">כיתוב בהדמיה</label><input type="text" value={simCaption} onChange={(e) => { setSimCaption(e.target.value); saveSysSettings(); }} placeholder="ירחי אלומיניום מפעל ייצור הסולל 3 חולון" className="w-full border rounded-lg p-2.5" /></div>
                  </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">🖼️ לוגו העסק</h3>
                  <div className="flex flex-wrap items-start gap-4">
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">העלאת לוגו (PNG / JPG)</label><input type="file" accept="image/png,image/jpeg,image/jpg" onChange={async (e) => { const f = e.target.files?.[0]; const input = e.currentTarget; if (!f) return; try { const d = await compressImageFileToDataUrl(f); try { localStorage.setItem("yarhi_logoDataUrl", d); } catch { /* quota */ } setLogoDataUrl(d); showAlert("הלוגו נטען ונשמר לסנכרון בין מכשירים (כולל דחיסה אוטומטית)."); } catch (err) { console.error("[Yarhi Pro] לוגו:", err); showAlert(err instanceof Error && err.message === "LOGO_TOO_LARGE" ? "הלוגו גדול מדי גם אחרי דחיסה. נסה תמונה קטנה יותר." : "לא ניתן לעבד את התמונה. נסה קובץ אחר."); } finally { input.value = ""; } }} className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-bold file:bg-blue-50 file:text-blue-700" /></div>
                    <div className="flex flex-col items-center gap-2"><div className="w-48 min-h-[60px] border border-slate-300 rounded-xl bg-white flex items-center justify-center overflow-hidden p-2">{logoDataUrl ? <img src={logoDataUrl} alt="לוגו" className="max-w-full max-h-20" /> : <span className="text-slate-400 text-sm">ללא לוגו</span>}</div><button type="button" onClick={() => { localStorage.removeItem("yarhi_logoDataUrl"); setLogoDataUrl(null); }} className="text-xs text-red-600 hover:text-red-800 font-bold">הסר לוגו</button></div>
                  </div>
                </div>
                <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100 space-y-5">
                  <h3 className="font-bold text-purple-900 text-lg flex items-center gap-2">💰 תמחור ורווחיות</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1">שיעור מע״מ ללקוח ובפיננסי (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={0.1}
                        value={sysVatPercent}
                        onChange={(e) => {
                          setSysVatPercent(e.target.value);
                          saveSysSettings();
                        }}
                        className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-900 bg-white"
                        placeholder="18"
                      />
                      <p className="text-xs text-slate-500 mt-1">ברירת מחדל 18. מחיר כולל מע״מ בפרגולה/גדר וחישובי קופה מבוססים על הערך כאן.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1">תנאי אספקה להצעת מחיר (ימים)</label>
                      <input
                        type="text"
                        value={sysQuoteDeliveryDays}
                        onChange={(e) => {
                          setSysQuoteDeliveryDays(e.target.value);
                          saveSysSettings();
                        }}
                        className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-900 bg-white"
                        placeholder="X"
                      />
                      <p className="text-xs text-slate-500 mt-1">יופיע כ- &quot;אספקה: עד X ימי עסקים&quot; בתוך תנאי ההצעה.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1">אחריות על טיב העבודה (שנים)</label>
                      <input
                        type="text"
                        value={sysWorkWarrantyYears}
                        onChange={(e) => {
                          setSysWorkWarrantyYears(e.target.value);
                          saveSysSettings();
                        }}
                        className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-900 bg-white"
                        placeholder="X"
                      />
                      <p className="text-xs text-slate-500 mt-1">יופיע בסעיף האחריות בתוך תנאי ההצעה.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1">תשלום שלב 1 - מקדמה (%)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={sysPaymentStage1Percent}
                        onChange={(e) => {
                          setSysPaymentStage1Percent(e.target.value);
                          saveSysSettings();
                        }}
                        className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-900 bg-white"
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1">תשלום שלב 2 - אספקה/תחילת התקנה (%)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={sysPaymentStage2Percent}
                        onChange={(e) => {
                          setSysPaymentStage2Percent(e.target.value);
                          saveSysSettings();
                        }}
                        className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-900 bg-white"
                        placeholder="40"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-600 mb-1">תשלום שלב 3 - בסיום (%)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={sysPaymentStage3Percent}
                        onChange={(e) => {
                          setSysPaymentStage3Percent(e.target.value);
                          saveSysSettings();
                        }}
                        className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-900 bg-white"
                        placeholder="10"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <p
                        className={
                          "rounded-lg border px-3 py-2 text-sm font-bold " +
                          (Math.abs(paymentTermsTotalPercent - 100) < 0.001
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-amber-300 bg-amber-50 text-amber-900")
                        }
                      >
                        סה&quot;כ אחוזי שלבי תשלום: {paymentTermsTotalPercent.toFixed(1)}%
                        {Math.abs(paymentTermsTotalPercent - 100) < 0.001 ? " (תקין)" : " (מומלץ לעדכן ל-100%)"}
                      </p>
                    </div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר קנייה בסיסי - אלומיניום לקילו (₪)</label><input type="number" value={pricePerKg} onChange={(e) => { setPricePerKg(e.target.value); saveSysSettings(); saveCurrentState(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-800 bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר מ&quot;ר פרגולה (₪)</label><input type="number" value={sellPricePerSqm} onChange={(e) => { setSellPricePerSqm(e.target.value); saveSysSettings(); saveCurrentState(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold text-blue-700 bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">עלות התקנה למ&quot;ר (₪)</label><input type="number" value={sysInstallPriceSqm} onChange={(e) => { setSysInstallPriceSqm(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">עלות הובלה גלובלית (₪)</label><input type="number" value={sysTransportPrice} onChange={(e) => { setSysTransportPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר סנטף למ&quot;ר (₪)</label><input type="number" value={sysSantafPrice} onChange={(e) => { setSysSantafPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר פס לד למטר (₪)</label><input type="number" value={sysLedPrice} onChange={(e) => { setSysLedPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר אף מים (₪ ליח&apos;)</label><input type="number" value={sysDripEdgePrice} onChange={(e) => { setSysDripEdgePrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר ברגי מש&quot;ד (ל-1000 יח&apos;, ₪)</label><input type="number" value={sysScrewPrice} onChange={(e) => { setSysScrewPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר ויטרינה פרופיל 7000 למ&quot;ר (₪)</label><input type="number" value={sysVitrine7000PriceSqm} onChange={(e) => { setSysVitrine7000PriceSqm(e.target.value); saveSysSettings(); saveCurrentState(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר ויטרינה פרופיל 9000 למ&quot;ר (₪)</label><input type="number" value={sysVitrine9000PriceSqm} onChange={(e) => { setSysVitrine9000PriceSqm(e.target.value); saveSysSettings(); saveCurrentState(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                  </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-5">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">🪟 תמחור גדרות</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מכירה גדר למ&quot;ר (₪)</label><input type="number" value={sysFencePriceSqm} onChange={(e) => { setSysFencePriceSqm(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">עלות סט עמוד גדר (₪)</label><input type="number" value={sysFenceSetPrice} onChange={(e) => { setSysFenceSetPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">עלות ג&apos;מבו בודד (₪)</label><input type="number" value={sysJumboPrice} onChange={(e) => { setSysJumboPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      saveSysSettings();
                      showAlert("הגדרות העסק נשמרו");
                    }}
                    className="w-full rounded-xl bg-blue-600 py-3 font-black text-white hover:bg-blue-700 transition shadow-md"
                  >
                    💾 שמור הגדרות עסק
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        {currentView === "business" && (
          <section className="p-0">
            <BusinessView
              crmData={crmData}
              setCrmData={setCrmData}
              onLoadProject={loadProject}
              transactions={businessTransactions}
              persistTransactions={persistTransactions}
              businessVatRate={businessVatDecimal}
              businessName={sysContractorName}
            />
          </section>
        )}
      </main>

      {/* מובייל בלבד: פס ניווט דק בתחתית — התוכן (חישובים / הדמיה) מקבל את כל הגובה למעלה */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 lg:hidden">
        <nav
          className="pointer-events-auto flex items-stretch justify-between gap-0.5 border-t border-slate-700/90 bg-slate-900/95 px-0.5 pt-1 shadow-[0_-6px_24px_rgba(0,0,0,0.4)] backdrop-blur-md"
          style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom, 0px))" }}
          aria-label="ניווט מהיר"
        >
          <Link href="/?view=data" className={mobileTabCls("data")}>
            <span className="text-[1.15rem] leading-none">📏</span>
            <span className="max-w-full truncate">פרגולות</span>
          </Link>
          <Link href="/?view=fences" className={mobileTabCls("fences")}>
            <span className="text-[1.15rem] leading-none">🪟</span>
            <span className="max-w-full truncate">גדרות</span>
          </Link>
          <Link href="/?view=3d" className={mobileTabCls("3d")}>
            <span className="text-[1.15rem] leading-none">🎨</span>
            <span className="max-w-full truncate">הדמיית פרגולה</span>
          </Link>
          <Link href="/?view=fence-3d" className={mobileTabCls("fence-3d")}>
            <span className="text-[1.15rem] leading-none">🧱</span>
            <span className="max-w-full truncate">הדמיית גדר</span>
          </Link>
          <button
            type="button"
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 px-0.5 text-[10px] font-bold leading-tight sm:text-[11px] ${
              mobileMoreOpen || currentView === "settings" || currentView === "business" || currentView === "schedule" || currentView === "field-windows" || currentView === "dashboard"
                ? "bg-slate-700 text-white"
                : "text-slate-400 active:bg-slate-800"
            }`}
            onClick={() => setMobileMoreOpen((o) => !o)}
            aria-expanded={mobileMoreOpen}
            aria-label="עוד אפשרויות"
          >
            <span className="text-[1.15rem] leading-none">⋯</span>
            <span>עוד</span>
          </button>
        </nav>
      </div>

      {mobileMoreOpen && (
        <div className="fixed inset-0 z-[45] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="סגור"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[min(70vh,420px)] overflow-y-auto rounded-t-2xl border border-slate-600 bg-slate-800 p-4 text-white shadow-2xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
            role="dialog"
            aria-label="תפריט נוסף"
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-600 pb-3">
              <div>
                <p className="text-xs text-slate-400">מחובר כ־</p>
                <p className="font-bold text-slate-100">{sysContractorName || "—"}</p>
                {showManagerBadge ? <p className="mt-1 text-sm font-black text-amber-300">מנהל 👑</p> : null}
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-500 px-3 py-1.5 text-sm font-bold text-slate-200"
                onClick={() => setMobileMoreOpen(false)}
              >
                סגור
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/?view=dashboard"
                className="rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-3 text-right font-bold"
                onClick={() => setMobileMoreOpen(false)}
              >
                📊 לוח בקרה
              </Link>
              <Link
                href="/?view=field-windows"
                className="rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-3 text-right font-bold"
                onClick={() => setMobileMoreOpen(false)}
              >
                📐 מידות שטח חלונות
              </Link>
              <Link
                href="/?view=schedule"
                className="rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-3 text-right font-bold"
                onClick={() => setMobileMoreOpen(false)}
              >
                📅 ניהול לו&quot;ז
              </Link>
              <Link
                href="/?view=settings"
                className="rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-3 text-right font-bold"
                onClick={() => setMobileMoreOpen(false)}
              >
                ⚙️ הגדרות עסק
              </Link>
              <Link
                href="/?view=business"
                className="rounded-xl border border-indigo-500/40 bg-indigo-900/30 px-4 py-3 text-right font-bold"
                onClick={() => setMobileMoreOpen(false)}
              >
                💼 ניהול פיננסי וגבייה
              </Link>
              <button
                type="button"
                className="rounded-xl bg-red-600/90 px-4 py-3 text-center font-black text-white"
                onClick={() => {
                  setMobileMoreOpen(false);
                  void (async () => {
                    await logout();
                    router.push("/login");
                  })();
                }}
              >
                🚪 התנתקות
              </button>
            </div>
            <p className="mt-4 text-center text-[10px] text-slate-500">גרסת מערכת 3.0.1 (PRO)</p>
          </div>
        </div>
      )}

      {kitOrderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 no-print">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setKitOrderModal(null)}
            aria-label="סגור חלון"
          />
          <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-6 border-b bg-slate-50">
              <div>
                <h3 className="text-xl font-black text-slate-900">שליחה לייצור</h3>
                <p className="text-sm text-slate-600 mt-1">הקבלן בלבד: לאחר שליחה לייצור ניתן לפתוח הזמנת קיט בוואטסאפ.</p>
              </div>
              <button
                type="button"
                onClick={() => setKitOrderModal(null)}
                className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-black"
                aria-label="סגור"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-3">
              <button
                type="button"
                onClick={() => {
                  if (kitOrderModal.kind === "pergola") printFactoryReport();
                  else if (kitOrderModal.kind === "fence") {
                    if (!fenceResult.sqm) return showAlert("אין נתוני גדר לשליחה לייצור");
                    printFenceReport();
                  }
                  showAlert("נשלח לייצור");
                }}
                className="w-full bg-slate-800 text-white px-5 py-3 rounded-2xl font-black hover:bg-slate-900 transition flex items-center justify-center gap-2"
              >
                🖨️ הפק דוח ייצור
              </button>

              <button
                type="button"
                onClick={() => {
                  handleWhatsAppOrder(kitOrderModal.kind);
                  setKitOrderModal(null);
                }}
                className="w-full bg-emerald-600 text-white px-5 py-3 rounded-2xl font-black hover:bg-emerald-700 transition flex items-center justify-center gap-2"
              >
                📲 ווטצאפ – הזמן קיט מירחי אלומיניום
              </button>

              <button
                type="button"
                onClick={() => setKitOrderModal(null)}
                className="w-full bg-white text-slate-700 px-5 py-3 rounded-2xl font-black border border-slate-200 hover:bg-slate-50 transition"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
