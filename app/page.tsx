"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import BusinessView, { loadTransactions, type CrmProject, type Transaction } from "@/app/components/BusinessView";
import { useAuth } from "@/components/AuthProvider";
import { useSearchString } from "@/hooks/useSearchString";
import { getFirebaseDb } from "@/lib/firebase";
import {
  BUSINESS_SETTINGS_KEYS,
  parseWorkspaceFromFirestore,
  sanitizeForFirestore,
  trimWorkspaceForSize,
  USER_WORKSPACE_FIELD,
} from "@/lib/user-workspace-firestore";
import { compressImageFileToDataUrl } from "@/lib/compress-logo";
import { EMPTY_FENCE_RESULT, type FenceCalcResult } from "@/lib/types/fence-calc";
import { EMPTY_PERGOLA_RESULT, type PergolaCalcResult } from "@/lib/types/pergola-calc";

/** מונע עמוד סטטי שנתקע עם useSearchParams */
export const dynamic = "force-dynamic";

type ViewId = "dashboard" | "data" | "fences" | "3d" | "settings" | "business";
const VIEW_IDS: ViewId[] = ["dashboard", "data", "fences", "3d", "settings", "business"];
function parseView(v: string | null): ViewId {
  return (VIEW_IDS.includes(v as ViewId) ? v : "dashboard") as ViewId;
}
/** שינוי הערך אחרי עדכון public/sim.html — שובר מטמון דפדפן/CDN */
const SIM_VERSION = "frame-ribs-left-dual-face-v1";

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

const PERGOLA_IDS = [
  "custName", "custPhone", "custAddress", "lengthWall", "exitWidth", "isLShape", "lWallWidth", "lWallDepth", "lShapeSide",
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
    logout,
  } = useAuth();

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

  if (isLoggedIn && hasAcceptedTerms && !accountApproved && firebaseUser) {
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
                תוקף החשבון במערכת הסתיים. לחידוש גישה צריך לפנות למנהל — הוא יעדכן את השדות ב-Firestore (למשל{" "}
                <code className="text-amber-200">accessValidUntil</code>).
              </p>
              <p className="text-slate-400 text-xs leading-relaxed">
                אחרי שהמנהל מאריך את התוקף, רענן את הדף או התחבר מחדש.
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-200 text-sm leading-relaxed">
                ההרשמה התקבלה. <strong>הגישה למערכת תיפתח</strong> לאחר אישור ידני על ידי המנהל (לאחר תשלום / בדיקה).
              </p>
              <p className="text-slate-400 text-xs leading-relaxed">
                כשהמנהל יאשר את החשבון ב-Firestore (<code className="text-sky-200">accountApproved: true</code>
                {", "}
                ואופציונלית <code className="text-sky-200">accessValidUntil</code> לתאריך סיום), רענן את הדף או התחבר מחדש.
              </p>
            </>
          )}
          <p className="text-slate-500 text-xs">
            אימייל: <span className="font-mono text-slate-300">{firebaseUser.email ?? "—"}</span>
          </p>
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
    if (isLoggedIn && !hasAcceptedTerms && firebaseUser) {
      return (
        <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6" dir="rtl">
          <div className="w-full max-w-xl rounded-3xl border border-amber-600/50 bg-slate-800/95 shadow-2xl p-8 md:p-10 text-center space-y-4">
            <h1 className="text-2xl md:text-3xl font-black text-amber-300">מחובר – אבל אין אישור תקנון בענן</h1>
            <p className="text-slate-200 text-sm leading-relaxed">
              ההתחברות ל-Firebase הצליחה, אבל לא ניתן לקרוא/לשמור את המסמך <code className="text-amber-200">users/</code>
              ב-Firestore (לרוב: <strong>כללי Firestore לא פורסמו</strong> או חוסמים).
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              פתח <strong>Firebase Console</strong> → <strong>Firestore Database</strong> → <strong>Rules</strong> → הדבק את התוכן מקובץ{" "}
              <code className="text-slate-300">firestore.rules</code> בפרויקט → <strong>Publish</strong>. אחרי זה התנתק והתחבר שוב.
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
  const { logout, firebaseUser } = useAuth();
  const currentView = parseView(new URLSearchParams(searchString).get("view"));
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const fenceSimIframeRef = useRef<HTMLIFrameElement | null>(null);
  const pergolaSimIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastUidRef = useRef<string | null>(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [hiddenCostsBox, setHiddenCostsBox] = useState(false);
  const [fenceHiddenCostsBox, setFenceHiddenCostsBox] = useState(false);
  const [kitOrderModal, setKitOrderModal] = useState<null | { kind: "pergola" | "fence" }>(null);
  const [fencesInnerTab, setFencesInnerTab] = useState<"calc" | "sim">("calc");
  const [pergolaSimLoaded, setPergolaSimLoaded] = useState(false);
  /** במובייל: גיליון "עוד" (הגדרות / פיננסי / התנתקות) */
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Pergola form state
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
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
  const [simCaption, setSimCaption] = useState("");
  const [sysFencePriceSqm, setSysFencePriceSqm] = useState("");
  const [sysFenceSetPrice, setSysFenceSetPrice] = useState("");
  const [sysJumboPrice, setSysJumboPrice] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [pergolaResult, setPergolaResult] = useState<PergolaCalcResult>(EMPTY_PERGOLA_RESULT);
  const [fenceResult, setFenceResult] = useState<FenceCalcResult>(EMPTY_FENCE_RESULT);

  // Fence form state
  const [fenceCustName, setFenceCustName] = useState("");
  const [fenceCustPhone, setFenceCustPhone] = useState("");
  const [fenceCustAddress, setFenceCustAddress] = useState("");
  const [fenceSegments, setFenceSegments] = useState<{ id: number; L: number; H: number; P?: number }[]>([{ id: 1, L: 0, H: 0 }]);
  const [fenceSegDrafts, setFenceSegDrafts] = useState<Record<number, Partial<Record<"L" | "H" | "P", string>>>>({});
  const [fenceInGround, setFenceInGround] = useState(false);
  const [fenceSlat, setFenceSlat] = useState("100");
  const [fenceGap, setFenceGap] = useState("2");
  const [fenceColor, setFenceColor] = useState("RAL 9016");
  const [fenceSlatColor, setFenceSlatColor] = useState("RAL 9016");

  const [crmData, setCrmData] = useState<CrmProject[]>([]);
  const [businessTransactions, setBusinessTransactions] = useState<Transaction[]>([]);
  /** אחרי טעינה ראשונה מ-Firestore (או אם אין ענן) – מאפשר שמירה ללא דריסת נתונים לפני הטעינה */
  const [workspaceCloudHydrated, setWorkspaceCloudHydrated] = useState(false);

  const showAlert = useCallback((msg: string) => {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(""), 3000);
  }, []);

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
    const uid = firebaseUser?.uid ?? null;
    if (!uid) {
      lastUidRef.current = uid;
      return;
    }

    if (lastUidRef.current && lastUidRef.current !== uid) {
      try {
        localStorage.removeItem("yarhi_crm_data");
        localStorage.removeItem("yarchiTransactions");
        localStorage.removeItem("yarhi_current_calc");
        localStorage.removeItem("yarhi_logoDataUrl");
        for (const key of BUSINESS_SETTINGS_KEYS) localStorage.removeItem("yarhi_" + key);
      } catch {}

      setCrmData([]);
      setBusinessTransactions([]);
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
    }

    lastUidRef.current = uid;
  }, [firebaseUser?.uid]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const keys: string[] = ["sysContractorName", "sysCompanyId", "sysPhone", "sysAddress", "sysEmail", "simCaption", "sysInstallPriceSqm", "sysTransportPrice", "sysSantafPrice", "sysLedPrice", "sysScrewPrice", "sysDripEdgePrice", "pricePerKg", "sellPricePerSqm", "sysFencePriceSqm", "sysFenceSetPrice", "sysJumboPrice"];
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
      if (s.custPhone !== undefined) setCustPhone(String(s.custPhone));
      if (s.custAddress !== undefined) setCustAddress(String(s.custAddress));
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
    } catch {}
  }, []);

  /** טעינת טיוטות + CRM + תנועות מהענן (דורס localStorage אם יש yarhiWorkspace) */
  useEffect(() => {
    setWorkspaceCloudHydrated(false);
    const uid = firebaseUser?.uid;
    if (!uid) {
      setWorkspaceCloudHydrated(true);
      return;
    }
    const db = getFirebaseDb();
    if (!db) {
      setWorkspaceCloudHydrated(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (cancelled) return;
        const rawWs = snap.exists() ? snap.data()?.[USER_WORKSPACE_FIELD] : undefined;
        const parsed = parseWorkspaceFromFirestore(rawWs);
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

          setWorkspaceCloudHydrated(true);
          return;
        }
        const hasWorkspaceChunk =
          parsed.crmProjects !== undefined ||
          parsed.pergolaCalcDraft !== undefined ||
          parsed.fenceCalcDraft !== undefined ||
          parsed.businessTransactions !== undefined ||
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
          setWorkspaceCloudHydrated(true);
          return;
        }
        if (parsed.crmProjects !== undefined) setCrmData(parsed.crmProjects);
        if (parsed.businessTransactions !== undefined) setBusinessTransactions(parsed.businessTransactions);
        if (Object.prototype.hasOwnProperty.call(parsed, "logoDataUrl")) {
          setLogoDataUrl(parsed.logoDataUrl ?? null);
        }
        const s = parsed.pergolaCalcDraft;
        if (s && typeof s === "object") {
          if (s.custName !== undefined) setCustName(String(s.custName));
          if (s.custPhone !== undefined) setCustPhone(String(s.custPhone));
          if (s.custAddress !== undefined) setCustAddress(String(s.custAddress));
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
        }
        const f = parsed.fenceCalcDraft;
        if (f && typeof f === "object") {
          if (f.fenceCustName !== undefined) setFenceCustName(String(f.fenceCustName));
          if (f.fenceCustPhone !== undefined) setFenceCustPhone(String(f.fenceCustPhone));
          if (f.fenceCustAddress !== undefined) setFenceCustAddress(String(f.fenceCustAddress));
          setFenceInGround(false);
          if (f.fenceSlat !== undefined) setFenceSlat(String(f.fenceSlat));
          if (f.fenceGap !== undefined) setFenceGap(String(f.fenceGap));
          if (f.fenceColor !== undefined) setFenceColor(String(f.fenceColor));
          if (f.fenceSlatColor !== undefined) setFenceSlatColor(String(f.fenceSlatColor));
          if (Array.isArray(f.fenceSegments) && f.fenceSegments.length > 0) {
            setFenceSegments(
              f.fenceSegments.map((seg, i) => ({
                id: typeof seg.id === "number" ? seg.id : Date.now() + i,
                L: Number(seg.L) || 0,
                H: Number(seg.H) || 0,
                P: typeof seg.P === "number" ? seg.P : undefined,
              }))
            );
          }
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
        }
        try {
          if (parsed.crmProjects !== undefined) {
            localStorage.setItem("yarhi_crm_data", JSON.stringify(parsed.crmProjects));
          }
          if (parsed.businessTransactions !== undefined) {
            localStorage.setItem("yarchiTransactions", JSON.stringify(parsed.businessTransactions));
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
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const map: Record<string, string> = {
        sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption,
        sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice,
        pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice,
      };
      Object.entries(map).forEach(([k, v]) => localStorage.setItem("yarhi_" + k, String(v)));
    } catch {}
  }, [sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption, sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice, pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice]);

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
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const segs = fenceSegments
            .filter((s) => s.L > 0 && s.H > 0 && (s.P ?? 0) >= 0)
            .map((s) => ({ L: s.L, H: s.H, P: typeof s.P === "number" ? s.P : undefined }));
          const res = await fetch("/api/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              type: "fence",
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
  ]);

  const addFenceSeg = useCallback(() => setFenceSegments((prev) => [...prev, { id: Date.now(), L: 0, H: 0 }]), []);
  const removeFenceSeg = useCallback((id: number) => {
    setFenceSegments((prev) => prev.filter((s) => s.id !== id));
    setFenceSegDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const updateFenceSeg = useCallback((id: number, field: "L" | "H" | "P", value: number | undefined) => setFenceSegments((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))), []);
  const getFenceSegInputValue = useCallback((seg: { id: number; L: number; H: number; P?: number }, field: "L" | "H" | "P") => {
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

  const resetFenceForm = useCallback(() => {
    if (typeof window !== "undefined" && !(window as unknown as { confirm: (s: string) => boolean }).confirm("לאפס טופס?")) return;
    setFenceCustName(""); setFenceCustPhone(""); setFenceCustAddress(""); setFenceSegments([{ id: Date.now(), L: 0, H: 0 }]);
    setFenceResult(EMPTY_FENCE_RESULT);
    showAlert("טופס אופס");
  }, [showAlert]);

  const saveFenceToCRM = useCallback(() => {
    if (!fenceCustName.trim()) return showAlert("הזן שם לקוח לשמירה");
    if (!fenceResult.sqm) return showAlert("אין נתוני גדר לשמירה");
    const v = fenceResult.sellIncVat;
    const base = v / 1.18;
    const vat = v - base;
    const totalLen = fenceSegments.filter((s) => s.L > 0).reduce((sum, s) => sum + s.L, 0);
    const fenceState = { fenceCustName, fenceCustPhone, fenceCustAddress, fenceSlat, fenceGap, fenceColor, fenceSlatColor, fenceInGround, segs: fenceSegments.filter((s) => s.L > 0 && s.H > 0).map((s) => ({ L: s.L, H: s.H, P: s.P })) };
    const newProject: CrmProject = { id: Date.now(), date: new Date().toLocaleDateString("he-IL"), customer: fenceCustName.trim() + " (גדר)", sellingPriceInc: v, income: v, incomeExVat: base, vatAmount: vat, estExpense: 0, isFence: true, totalLength: totalLen, formState: fenceState };
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
    setFenceSegments([{ id: Date.now(), L: 0, H: 0 }]);
  }, [fenceCustName, fenceResult, fenceSegments, fenceCustPhone, fenceCustAddress, fenceSlat, fenceGap, fenceColor, fenceSlatColor, fenceInGround, showAlert]);

  const printFenceReport = useCallback(() => {
    if (!fenceResult.sqm) return showAlert("אנא הזן מידות לפני הדפסת דוח ייצור לגדר");
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון.");
    w.document.write(`<html dir="rtl" lang="he"><head><title>דוח ייצור גדרות - ${fenceCustName || "לקוח"}</title><style>body{font-family:Assistant,sans-serif;padding:30px;direction:rtl;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #cbd5e1;padding:8px;text-align:center;} th{background:#f1f5f9;}</style></head><body>${getLogoHtml()}<div style="border-bottom:3px solid #0f172a;padding-bottom:15px;margin-bottom:20px;"><h1 style="margin:0;font-size:24px;font-weight:800;">דוח ייצור למפעל - גדרות</h1><p style="margin:5px 0 0 0;color:#475569;">${sysContractorName}</p></div><div style="text-align:left;"><strong>לקוח:</strong> ${fenceCustName || "-"}<br><strong>תאריך:</strong> ${new Date().toLocaleDateString("he-IL")}</div><h2>✂️ רשימת חיתוכים (ס"מ)</h2><table><thead><tr><th>פרופיל / ייעוד</th><th>כמות</th><th>מידה סופית</th></tr></thead><tbody>${fenceResult.cuttingHtml}</tbody></table><h2 style="margin-top:30px;">📦 משיכת חומר מהמחסן</h2><table><thead><tr><th>סוג פרופיל</th><th>כמות מוטות</th></tr></thead><tbody>${fenceResult.bomHtml}</tbody></table><h2 style="margin-top:30px;">🔩 פירזול</h2><div style="background:#f8fafc;padding:15px;border-radius:8px;">${fenceResult.hardwareHtml}</div><h2 style="margin-top:30px;">📐 מפרט שדות והוראות</h2><div>${fenceResult.instructionsHtml}</div><script>setTimeout(function(){window.print();},500);<\/script></body></html>`);
    w.document.close();
  }, [fenceResult, fenceCustName, sysContractorName, getLogoHtml, showAlert]);

  const printFenceQuote = useCallback(() => {
    if (!fenceResult.sqm) return showAlert("הזן מידות תחילה");
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון.");
    const segmentsForSim = fenceSegments
      .filter((s) => s.L > 0 && s.H > 0)
      .map((s) => ({ L: s.L, H: s.H, P: typeof s.P === "number" ? s.P : 0 }));

    const totalLenCm = segmentsForSim.reduce((sum, s) => sum + (s.L || 0), 0);
    const maxHeightCm = segmentsForSim.reduce((m, s) => Math.max(m, s.H || 0), 0);
    const totalPosts = fenceSegments.reduce((sum, s) => sum + (typeof s.P === "number" ? s.P : 0), 0);
    const fieldsTotal = fenceSegments.reduce((sum, s) => {
      const pVal = typeof s.P === "number" ? s.P : 0;
      return sum + Math.max(0, pVal - 1);
    }, 0);

    const gapCmNum = parseFloat(fenceGap) || 0;

    const frameHex = fenceResult.frameHex;
    const slatHex = fenceResult.slatHex;
    const spacerHex = fenceResult.spacerHex;
    const basicQuoteExVat = fenceResult.basicQuoteExVat;
    const installExVat = fenceResult.installExVat;
    const transportExVat = fenceResult.transportExVat;
    const vatAmount = fenceResult.vatAmount;
    const slatLabel = fenceResult.slatLabel;
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
        </div>

        <div class="spec-full" style="border:none;margin:0;padding:0;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:10px 0 5px 0;">מפרט הגדר</h3>
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
              canSendFenceToCustomer
                ? `<a id="btn-whatsapp-quote" href="${fenceWaHref}" target="_self" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#16a34a;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">📲 שלח בוואטסאפ ללקוח</a>`
                : `<button id="btn-whatsapp-quote" style="background:#94a3b8;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:not-allowed;border:none;" disabled>📲 שלח בוואטסאפ ללקוח</button>`
            }
            <button id="btn-close-quote" style="background:#334155;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">✖️ סגור</button>
            <button id="btn-print-quote" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🖨️ הדפס סיכום</button>
          </div>
        </div>
        <iframe id="quote-sim-iframe" title="הדמיה תלת-ממד גדרות" src="/fence-sim.html" style="width:100%;height:380px;border:1px solid #e2e8f0;border-radius:12px;background:#f1f5f9;" referrerPolicy="no-referrer"></iframe>
      </div>

      <script>
      (function(){
        var btn=document.getElementById('btn-print-quote');
        var closeBtn=document.getElementById('btn-close-quote');
        var waBtn=document.getElementById('btn-whatsapp-quote');
        var waUrl=${JSON.stringify(fenceWaHref)};
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
              inGround: ${fenceInGround ? "true" : "false"}
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
            <li>מע\"מ (18%): <strong>₪${Math.round(vatAmount).toLocaleString()}</strong></li>
          </ul>
        </div>
        <div style="text-align:left;">
          <p style="font-weight:bold;color:#1d4ed8;margin:0 0 5px 0;">סה\"כ לתשלום (כולל מע\"מ):</p>
          <h3 style="font-size:42px;font-weight:900;color:#1e3a8a;margin:0;">₪ ${Math.round(fenceResult.sellIncVat).toLocaleString()}</h3>
        </div>
      </div>

      <div class="signatures">
        <div class="sig-line">חתימת לקוח</div>
        <div class="sig-line">חתימת קבלן מבצע</div>
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
  ]);

  const saveCurrentState = useCallback(() => {
    if (typeof window === "undefined") return;
    const totalPostsBySide = (parseInt(postCountFront) || 0) + (parseInt(postCountRight) || 0) + (parseInt(postCountLeft) || 0) + (parseInt(postCountBack) || 0);
    const state: Record<string, unknown> = {
      custName, custPhone, custAddress, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide,
      colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile,
      spacing, pricePerKg, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType,
      sellPricePerSqm, postCount: totalPostsBySide > 0 ? totalPostsBySide : postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor,
    };
    try { localStorage.setItem("yarhi_current_calc", JSON.stringify(state)); } catch {}
  }, [custName, custPhone, custAddress, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide, colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile, spacing, pricePerKg, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType, sellPricePerSqm, postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor]);

  const resetCurrentForm = useCallback(() => {
    if (typeof window !== "undefined" && !(window as unknown as { confirm: (s: string) => boolean }).confirm("האם לאפס את כל השדות בטופס הנוכחי?")) return;
    setCustName(""); setCustPhone(""); setCustAddress(""); setLengthWall(""); setExitWidth("");
    setLWallWidth(""); setLWallDepth(""); setLShapeSide("right"); setDividerSmoothCount(""); setDividerLedCount("");
    setPostCount(""); setPostCountFront(""); setPostCountRight(""); setPostCountLeft(""); setPostCountBack(""); setPostHeight(""); setTensionerCount(""); setTensionerColor(""); setLedCount(""); setFanCount("");
    setColorSelect("RAL 9016"); setShadeColorSelect("RAL 9016"); setFrameType("doubleT"); setDividerSize("120");
    setShadingProfile("20x40"); setSpacing("2"); setPostType("100"); setLedColor("לבן חם"); setSantafColor("שקוף"); setDripEdgeType("wave2.5");
    setIsLShape(false); setHasSantaf(false); setHasLed(false); setHasFan(false);
    try { localStorage.removeItem("yarhi_current_calc"); } catch {}
    showAlert("הטופס אופס בהצלחה");
  }, [showAlert]);

  const saveProjectToCRM = useCallback(() => {
    if (!custName.trim()) return showAlert("הזן שם לקוח לשמירה");
    const incVat = pergolaResult.incVat;
    const exVat = pergolaResult.exVat;
    const vatAmount = incVat * 0.18 / 1.18;
    const matCost = pergolaResult.materialCost;
    const instCost = pergolaResult.installCost;
    const totalPostsBySide = (parseInt(postCountFront) || 0) + (parseInt(postCountRight) || 0) + (parseInt(postCountLeft) || 0) + (parseInt(postCountBack) || 0);
    const currentState: Record<string, unknown> = {
      custName, custPhone, custAddress, lengthWall, exitWidth, isLShape, lWallWidth, lWallDepth, lShapeSide,
      colorSelect, shadeColorSelect, frameType, dividerSize, dividerSmoothCount, dividerLedCount, shadingProfile,
      spacing, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, dripEdgeType,
      postCount: totalPostsBySide > 0 ? totalPostsBySide : postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postHeight, postType, tensionerCount, tensionerColor,
    };
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
    };
    setCrmData((prev) => [newProject, ...prev]);
    showAlert("הפרויקט נשמר בהצלחה!");

    // איפוס לקוח + מידות לפרויקט הבא (שומרים העדפות צבע/פרופיל/מחירים)
    setCustName("");
    setCustPhone("");
    setCustAddress("");
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
    try {
      const state: Record<string, unknown> = {
        custName: "",
        custPhone: "",
        custAddress: "",
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
      };
      localStorage.setItem("yarhi_current_calc", JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [
    custName,
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
    ledColor,
    hasFan,
    hasSantaf,
    santafColor,
    dripEdgeType,
    sellPricePerSqm,
    postType,
  ]);

  const printFactoryReport = useCallback(() => {
    const L = pergolaResult.L; const W = pergolaResult.W;
    if (!L || !W) return showAlert("אנא הזן מידות לפני הדפסת דוח ייצור");
    const w = window.open("", "_blank");
    if (!w) return showAlert("הדפדפן חסם את פתיחת החלון. אנא אשר חלונות קופצים.");
    w.document.write(`
      <html dir="rtl" lang="he"><head><title>דוח ייצור - ${custName || "לקוח"}</title>
      <style>body{font-family:Assistant,sans-serif;padding:30px;direction:rtl;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #cbd5e1;padding:8px;text-align:center;} th{background:#f1f5f9;}</style></head><body>
      ${getLogoHtml()}
      <div style="border-bottom:3px solid #0f172a;padding-bottom:15px;margin-bottom:20px;">
        <h1 style="margin:0;font-size:24px;font-weight:800;">דוח ייצור למפעל</h1>
        <p style="margin:5px 0 0 0;color:#475569;">${sysContractorName}</p>
      </div>
      <div style="background:#f8fafc;padding:15px;border-radius:8px;margin-bottom:20px;"><strong>מידות ברוטו לייצור:</strong> חזית ${L} ס"מ על ${W} ס"מ</div>
      <h2>רשימת חיתוכים</h2><table><thead><tr><th>פרופיל</th><th>ייעוד</th><th>כמות</th><th>מידה סופית (ס"מ)</th></tr></thead><tbody>${pergolaResult.cuttingHtml}</tbody></table>
      <h2 style="margin-top:30px;">משיכת חומר מהמחסן</h2><table><thead><tr><th>סוג פרופיל</th><th>כמות מוטות</th><th>אורך מוט</th></tr></thead><tbody>${pergolaResult.bomHtml}</tbody></table>
      <h2 style="margin-top:30px;">פירזול</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${pergolaResult.hardwareHtml}</div>
      <div style="page-break-before:always;margin-top:40px;"></div><h2 style="color:#ea580c;">סקיצה והוראות הרכבה</h2><div>${pergolaResult.instructionsHtml}</div>
      <script>setTimeout(function(){window.print();},500);<\/script></body></html>`);
    w.document.close();
  }, [pergolaResult, custName, sysContractorName, getLogoHtml, showAlert]);

  const printCustomerQuote = useCallback(() => {
    if (!pergolaResult.sqm) return showAlert("אנא הזן מידות לפני הדפסת סיכום");
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
    const basicQuoteExVat = pergolaResult.exVat - pergolaResult.installCost;
    const vatAmount = (pergolaResult.exVat * 0.18);
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
        </div>
        <div class="spec-full" style="border:none;margin:0;padding:0;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:10px 0 5px 0;">מפרט הפרגולה</h3>
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
      </div>
      <div id="sim-section" style="margin-bottom:30px;page-break-inside:avoid;">
        <div class="no-print" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
          <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0;">הדמיה (לפי הנתונים שהוזנו)</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${
              canSendToCustomer
                ? `<a id="btn-whatsapp-quote" href="${customerWaHref}" target="_self" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#16a34a;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">📲 שלח בוואטסאפ ללקוח</a>`
                : `<button id="btn-whatsapp-quote" style="background:#94a3b8;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:not-allowed;border:none;" disabled>📲 שלח בוואטסאפ ללקוח</button>`
            }
            <button id="btn-close-quote" style="background:#334155;color:white;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">✖️ סגור</button>
            <button id="btn-print-quote" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;">🖨️ הדפס סיכום</button>
          </div>
        </div>
        <iframe id="quote-sim-iframe" title="הדמיה תלת-ממד פרגולה" src="/sim.html?rev=${SIM_VERSION}" style="width:100%;height:380px;border:1px solid #e2e8f0;border-radius:12px;background:#f1f5f9;" referrerPolicy="no-referrer"></iframe>
      </div>
      <script>
      (function(){
        var btn=document.getElementById('btn-print-quote');
        var closeBtn=document.getElementById('btn-close-quote');
        var waBtn=document.getElementById('btn-whatsapp-quote');
        var waUrl=${JSON.stringify(customerWaHref)};
        if(!btn)return;
        var iframe=document.getElementById('quote-sim-iframe');
        // Apply live config into sim.html (3D)
        var applyCfg=function(){
          try{
            if(!iframe||!iframe.contentWindow) return;
            iframe.contentWindow.postMessage({ type:'applyExternalConfig', config: {
              L: ${Number.isFinite(L) ? L : 0},
              W: ${Number.isFinite(W) ? W : 0},
              gap: ${parseFloat(spacing) || 0},
              dividers: ${nDividersTotal},
              postsFront: ${pFront},
              postsRight: ${pRight},
              postsLeft: ${pLeft},
              postsBack: ${pBack},
              roofType: 'slats',
              isLShape: ${isLShape ? "true" : "false"},
              lWallWidth: ${isLShape ? parseFloat(lWallWidth) || 0 : 0},
              lWallDepth: ${isLShape ? parseFloat(lWallDepth) || 0 : 0},
              lShapeSide: '${lShapeSide}',
              hasSantaf: ${hasSantaf ? "true" : "false"},
              santafHex: '${santafHexQuote}',
              frameHex: '${frameHex}',
              slatHex: '${shadeHex}',
              captionText: ${JSON.stringify(simCaption || '')}
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
            <li>עלות פרגולה (${pergolaResult.sqm.toFixed(1)} מ"ר): <strong>₪${Math.round(basicQuoteExVat).toLocaleString()}</strong></li>
            ${pergolaResult.installCost > 0 ? `<li>התקנה והובלה: <strong>₪${Math.round(pergolaResult.installCost).toLocaleString()}</strong></li>` : ""}
            <li>מע"מ (18%): <strong>₪${Math.round(vatAmount).toLocaleString()}</strong></li>
          </ul>
        </div>
        <div style="text-align:left;">
          <p style="font-weight:bold;color:#1d4ed8;margin:0 0 5px 0;">סה"כ לתשלום (כולל מע"מ):</p>
          <h3 style="font-size:42px;font-weight:900;color:#1e3a8a;margin:0;">₪ ${Math.round(pergolaResult.incVat).toLocaleString()}</h3>
        </div>
      </div>
      <div class="signatures">
        <div class="sig-line">חתימת לקוח</div>
        <div class="sig-line">חתימת קבלן מבצע</div>
      </div>
      </div></body></html>`);
    w.document.close();
  }, [pergolaResult, custName, custPhone, custAddress, sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, getLogoHtml, showAlert, lengthWall, exitWidth, isLShape, lWallWidth, dividerSize, dividerSmoothCount, dividerLedCount, hasLed, ledCount, ledColor, hasFan, fanCount, hasSantaf, santafColor, frameType, shadingProfile, spacing, postCount, postCountFront, postCountRight, postCountLeft, postCountBack, postType, colorSelect, shadeColorSelect, simCaption]);

  const handleWhatsAppOrder = useCallback((kind: "pergola" | "fence") => {
    const contractorHeader =
      "פרטי הקבלן (שולח ההזמנה):\n" +
      `אימייל: ${sysEmail || "-"}\n`;

    const fenceSegmentsForMessage = fenceSegments.filter((s) => s.L > 0 && s.H > 0);
    const fenceSegmentsLines =
      fenceSegmentsForMessage.length > 0
        ? fenceSegmentsForMessage
            .map((s, i) => `• מקטע ${i + 1}: אורך ${s.L} ס"מ | גובה ${s.H} ס"מ`)
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
      pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice,
    };
    Object.entries(map).forEach(([k, v]) => localStorage.setItem("yarhi_" + k, String(v)));
  }, [sysContractorName, sysCompanyId, sysPhone, sysAddress, sysEmail, simCaption, sysInstallPriceSqm, sysTransportPrice, sysSantafPrice, sysLedPrice, sysScrewPrice, sysDripEdgePrice, pricePerKg, sellPricePerSqm, sysFencePriceSqm, sysFenceSetPrice, sysJumboPrice]);

  const loadProject = useCallback((id: number) => {
    const proj = crmData.find((p) => p.id === id);
    if (!proj) return;
    const state = (proj.formState || {}) as Record<string, unknown>;
    if (proj.isFence) {
      const s = state as { fenceCustName?: string; fenceCustPhone?: string; fenceCustAddress?: string; fenceSlat?: string; fenceGap?: string; fenceColor?: string; fenceSlatColor?: string; fenceInGround?: boolean; segs?: { L: number; H: number; P: number }[] };
      setFenceCustName(s.fenceCustName ?? "");
      setFenceCustPhone(s.fenceCustPhone ?? "");
      setFenceCustAddress(s.fenceCustAddress ?? "");
      setFenceSlat(s.fenceSlat ?? "100");
      setFenceGap(s.fenceGap ?? "2");
      setFenceColor(s.fenceColor ?? "RAL 9016");
      setFenceSlatColor(s.fenceSlatColor ?? "RAL 9016");
      setFenceInGround(false);
      if (s.segs && s.segs.length > 0) setFenceSegments(s.segs.map((seg, i) => ({ id: Date.now() + i, ...seg })));
      switchView("fences");
      return;
    }
    PERGOLA_IDS.forEach((id) => {
      const v = state[id];
      if (v === undefined) return;
      if (id === "custName") setCustName(String(v));
      else if (id === "custPhone") setCustPhone(String(v));
      else if (id === "custAddress") setCustAddress(String(v));
      else if (id === "lengthWall") setLengthWall(String(v));
      else if (id === "exitWidth") setExitWidth(String(v));
      else if (id === "isLShape") setIsLShape(Boolean(v));
      else if (id === "lWallWidth") setLWallWidth(String(v));
      else if (id === "lWallDepth") setLWallDepth(String(v));
      else if (id === "lShapeSide") setLShapeSide((v as "left") || "right");
      else if (id === "colorSelect") setColorSelect(String(v));
      else if (id === "shadeColorSelect") setShadeColorSelect(String(v));
      else if (id === "frameType") setFrameType(String(v));
      else if (id === "dividerSize") setDividerSize(String(v));
      else if (id === "dividerSmoothCount") setDividerSmoothCount(String(v));
      else if (id === "dividerLedCount") setDividerLedCount(String(v));
      else if (id === "shadingProfile") setShadingProfile(String(v));
      else if (id === "spacing") setSpacing(String(v));
      else if (id === "hasSantaf") setHasSantaf(Boolean(v));
      else if (id === "santafColor") setSantafColor(String(v));
      else if (id === "dripEdgeType") setDripEdgeType(String(v));
      else if (id === "hasLed") setHasLed(Boolean(v));
      else if (id === "ledCount") setLedCount(String(v));
      else if (id === "ledColor") setLedColor(String(v));
      else if (id === "hasFan") setHasFan(Boolean(v));
      else if (id === "fanCount") setFanCount(String(v));
      else if (id === "postCount") {
        setPostCount(String(v));
        setPostCountFront(String(v));
      }
      else if (id === "postCountFront") setPostCountFront(String(v));
      else if (id === "postCountRight") setPostCountRight(String(v));
      else if (id === "postCountLeft") setPostCountLeft(String(v));
      else if (id === "postCountBack") setPostCountBack(String(v));
      else if (id === "postHeight") setPostHeight(String(v));
      else if (id === "postType") setPostType(String(v));
      else if (id === "tensionerCount") setTensionerCount(String(v));
      else if (id === "tensionerColor") setTensionerColor(String(v));
    });
    switchView("data");
  }, [crmData]);

  const deleteProject = useCallback((id: number) => {
    if (typeof window === "undefined" || !(window as unknown as { confirm: (s: string) => boolean }).confirm("האם למחוק פרויקט זה מהמערכת?")) return;
    setCrmData((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try { localStorage.setItem("yarhi_crm_data", JSON.stringify(next)); } catch {}
      return next;
    });
    showAlert("הפרויקט נמחק");
  }, [showAlert]);

  useEffect(() => {
    try { localStorage.setItem("yarhi_crm_data", JSON.stringify(crmData)); } catch {}
  }, [crmData]);

  /** שמירת טיוטות פרגולה/גדר + CRM + תנועות ל-Firestore (debounce) */
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || !workspaceCloudHydrated) return;
    const db = getFirebaseDb();
    if (!db) return;
    const t = window.setTimeout(() => {
      const totalPostsBySide =
        (parseInt(postCountFront, 10) || 0) +
        (parseInt(postCountRight, 10) || 0) +
        (parseInt(postCountLeft, 10) || 0) +
        (parseInt(postCountBack, 10) || 0);
      const pergolaCalcDraft: Record<string, unknown> = {
        custName,
        custPhone,
        custAddress,
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
      };
      const fenceCalcDraft = {
        fenceCustName,
        fenceCustPhone,
        fenceCustAddress,
        fenceSegments: fenceSegments.map((seg) => ({ id: seg.id, L: seg.L, H: seg.H, P: seg.P })),
        fenceInGround,
        fenceSlat,
        fenceGap,
        fenceColor,
        fenceSlatColor,
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
      };
      const base = sanitizeForFirestore({
        crmProjects: crmData,
        pergolaCalcDraft,
        fenceCalcDraft,
        businessTransactions,
        logoDataUrl,
        businessSettings,
      }) as Record<string, unknown>;
      const payload = { ...trimWorkspaceForSize(base), cloudSavedAt: serverTimestamp() };
      void updateDoc(doc(db, "users", uid), { [USER_WORKSPACE_FIELD]: payload }).catch((err) =>
        console.error("[Yarhi Pro] שמירת yarhiWorkspace:", err)
      );
    }, 1100);
    return () => window.clearTimeout(t);
  }, [
    workspaceCloudHydrated,
    firebaseUser?.uid,
    crmData,
    businessTransactions,
    logoDataUrl,
    custName,
    custPhone,
    custAddress,
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
    fenceCustName,
    fenceCustPhone,
    fenceCustAddress,
    fenceSegments,
    fenceInGround,
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
  ]);

  useEffect(() => {
    // Sync fence 3D simulation when user is on fences settings
    if (currentView !== "fences") return;
    if (fencesInnerTab !== "sim") return;
    const iframe = fenceSimIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;

    const segments = fenceSegments
      .filter((s) => (s.L ?? 0) > 0 && (s.H ?? 0) > 0)
      .map((s) => ({ L: s.L, H: s.H, P: typeof s.P === "number" ? s.P : 0 }));

    if (!segments.length) return;

    const gapCm = parseFloat(fenceGap) || 0;

    win.postMessage(
      {
        type: "applyExternalConfig",
        config: {
          segments,
          gapCm,
          slatProfile: fenceSlat,
          frameHex: fenceResult.frameHex,
          slatHex: fenceResult.slatHex,
          spacerHex: fenceResult.spacerHex,
          inGround: fenceInGround,
        },
      },
      "*"
    );
  }, [currentView, fencesInnerTab, fenceSegments, fenceGap, fenceSlat, fenceInGround, fenceResult.frameHex, fenceResult.slatHex, fenceResult.spacerHex]);

  useEffect(() => {
    if (currentView !== "3d" || !pergolaSimLoaded) return;
    const iframe = pergolaSimIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;

    const L = pergolaResult.L || parseFloat(lengthWall) || 0;
    const W = pergolaResult.W || parseFloat(exitWidth) || 0;
    const lW = isLShape ? parseFloat(lWallWidth) || 0 : 0;
    const lD = isLShape ? parseFloat(lWallDepth) || 0 : 0;

    win.postMessage(
      {
        type: "applyExternalConfig",
        config: {
          L,
          W,
          isLShape,
          lWallWidth: lW,
          lWallDepth: lD,
          lShapeSide,
          frameType,
          dividers: Math.max(0, Math.min(8, pergolaResult.nDividersTotal ?? 0)),
          gap: parseFloat(spacing) || 0,
          frameHex: pergolaResult.frameHex,
          slatHex: pergolaResult.shadeHex,
          santafHex: pergolaResult.santafHex,
          hasSantaf,
          captionText: simCaption || "",
        },
      },
      "*"
    );
  }, [
    currentView,
    pergolaSimLoaded,
    pergolaResult.L,
    pergolaResult.W,
    pergolaResult.nDividersTotal,
    lengthWall,
    exitWidth,
    isLShape,
    lWallWidth,
    lWallDepth,
    lShapeSide,
    frameType,
    spacing,
    pergolaResult.frameHex,
    pergolaResult.shadeHex,
    pergolaResult.santafHex,
    hasSantaf,
    simCaption,
  ]);

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
    hasSantaf ? 1 : 0,
    simCaption || "",
    frameType || "",
  ].join("|");
  const pergolaSimSrc = (() => {
    const params = new URLSearchParams();
    params.set("rev", SIM_VERSION);
    params.set("L", String(pergolaResult.L || parseFloat(lengthWall) || 0));
    params.set("W", String(pergolaResult.W || parseFloat(exitWidth) || 0));
    params.set("gap", String(parseFloat(spacing) || 0));
    params.set("dividers", String(Math.max(0, Math.min(8, pergolaResult.nDividersTotal ?? 0))));
    params.set("frameType", frameType || "");
    params.set("frameHex", pergolaResult.frameHex || "#888888");
    params.set("slatHex", pergolaResult.shadeHex || "#888888");
    params.set("santafHex", pergolaResult.santafHex || "#888888");
    params.set("captionText", simCaption || "");
    params.set("isLShape", isLShape ? "1" : "0");
    params.set("lWallWidth", String(isLShape ? parseFloat(lWallWidth) || 0 : 0));
    params.set("lWallDepth", String(isLShape ? parseFloat(lWallDepth) || 0 : 0));
    params.set("lShapeSide", lShapeSide || "right");
    params.set("hasSantaf", hasSantaf ? "1" : "0");
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
          {String(sysEmail || "").trim().toLowerCase() === "yarchialuminum@gmail.com" && <p className="mt-1 text-xs font-black text-amber-300">מנהל 👑</p>}
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
          <Link href="/?view=3d" className={navCls("3d")}>
            <span className="text-xl">🎨</span>הדמיית 3D מורחבת
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
          גרסת מערכת 3.0 (PRO)
          <br />
          פותח עבור ירחי אלומיניום
        </div>
      </aside>
      <main
        ref={mainScrollRef}
        className={
          "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] lg:pb-0 " +
          (currentView === "3d" ? "overflow-hidden" : "overflow-y-auto")
        }
      >
        {alertMsg && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[10000] -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-800 px-7 py-3 font-bold text-white shadow-lg lg:bottom-8">
            {alertMsg}
          </div>
        )}

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
            <div className="flex justify-between items-end mb-6">
              <h3 className="text-2xl font-bold text-slate-800">פרויקטים אחרונים (CRM)</h3>
              <button type="button" onClick={() => switchView("data")} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-md transition">+ פרויקט חדש</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                    <th className="p-4">תאריך</th>
                    <th className="p-4">שם הלקוח</th>
                    <th className="p-4">מידות</th>
                    <th className="p-4">מכירה (כולל מע&quot;מ)</th>
                    <th className="p-4 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {crmData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400">
                        <div className="text-4xl mb-3">📁</div>
                        <div className="text-lg font-bold">אין פרויקטים שמורים עדיין</div>
                        <p className="text-sm">הפרויקטים שתשמור במסך &apos;מידות ונתונים&apos; יופיעו כאן.</p>
                      </td>
                    </tr>
                  )}
                  {crmData.map((p) => {
                    const lw = (p.formState as Record<string, unknown>)?.lengthWall ?? "-";
                    const ew = (p.formState as Record<string, unknown>)?.exitWidth ?? "-";
                    const dimStr = p.isFence ? (p.totalLength ? `גדר, אורך ${p.totalLength} ס"מ` : "גדר") : `${lw}x${ew}`;
                    return (
                      <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-100 transition">
                        <td className="p-4 text-slate-500">{p.date}</td>
                        <td className="p-4 font-bold text-slate-800">{p.customer}</td>
                        <td className="p-4 text-slate-600">{dimStr}</td>
                        <td className="p-4 font-black text-blue-600">{typeof p.sellingPriceInc === "string" ? p.sellingPriceInc : "₪ " + (p.sellingPriceInc ?? 0).toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <button type="button" onClick={() => loadProject(p.id)} className="text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 font-bold transition-colors ml-2 shadow-sm inline-flex items-center gap-1">טען</button>
                          <button type="button" onClick={() => deleteProject(p.id)} className="text-red-500 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 font-bold transition-colors shadow-sm inline-flex items-center gap-1">מחק</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                    <div className="grid grid-cols-2 gap-2"><div><label className="block text-sm font-semibold text-slate-600 mb-1">טלפון</label><input type="text" inputMode="text" autoComplete="tel" dir="ltr" value={custPhone} onChange={(e) => { setCustPhone(e.target.value); saveCurrentState(); }} placeholder="052-2288798" className="w-full border border-slate-300 rounded-lg p-2.5 bg-white" /></div><div><label className="block text-sm font-semibold text-slate-600 mb-1">כתובת</label><input type="text" value={custAddress} onChange={(e) => { setCustAddress(e.target.value); saveCurrentState(); }} className="w-full border border-slate-300 rounded-lg p-2.5 bg-white" /></div></div>
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
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">גבהי עמודים (מופרד בפסיק)</label><input type="text" inputMode="numeric" value={postHeight} onChange={(e) => { setPostHeight(e.target.value); saveCurrentState(); }} placeholder="250, 260" className="w-full border rounded-lg p-2" /></div>
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
                  <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center"><p className="text-blue-200 text-xs font-bold mb-1">מחיר ללקוח כולל מע&quot;מ</p><p className="text-2xl font-black">₪ {Math.round(pergolaResult.incVat).toLocaleString()}</p><p className="text-[10px] text-blue-200 mt-1 opacity-80">₪ {Math.round(pergolaResult.exVat).toLocaleString()} לפני מע&quot;מ</p></div>
                  <div className="bg-slate-50 rounded-2xl p-4 shadow-sm border border-dashed border-slate-300 flex flex-col justify-center">
                    <button type="button" onClick={() => setHiddenCostsBox((v) => !v)} className="text-xs font-bold text-slate-600 flex items-center justify-center gap-2 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-xl transition">🔒 הצג / הסתר פירוט עלויות (לשימוש פנימי)</button>
                  </div>
                </div>
                {hiddenCostsBox && (
                  <div className="no-print-section grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-center"><p className="text-slate-500 text-xs font-bold mb-1">משקל אלומיניום נקי</p><p className="text-2xl font-black text-slate-800">{pergolaResult.totalWeight.toFixed(1)} ק&quot;ג</p><p className="text-[10px] text-orange-500 font-bold mt-1">* ייתכן סטיה של 3%</p></div>
                    <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center"><p className="text-slate-300 text-xs font-bold mb-1">עלות חומרים משוערת</p><p className="text-2xl font-black">₪ {Math.round(pergolaResult.materialCost).toLocaleString()}</p></div>
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-2xl p-4 shadow-md text-white flex flex-col justify-center"><p className="text-indigo-100 text-xs font-bold mb-1">עלות התקנה והובלה</p><p className="text-2xl font-black">₪ {Math.round(pergolaResult.installCost).toLocaleString()}</p><p className="text-[10px] text-indigo-200 mt-1 opacity-90">{pergolaResult.installSqmText || "לפי 0 ₪ למ\"ר + הובלה"}</p></div>
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
                  <div className="overflow-x-auto"><table className="w-full text-right border-collapse"><thead><tr className="bg-slate-50 text-slate-600 border-y border-slate-200"><th className="p-3 font-bold">פרופיל</th><th className="p-3 font-bold">ייעוד</th><th className="p-3 font-bold text-center">כמות לחיתוך</th><th className="p-3 font-bold text-center">מידה סופית</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: pergolaResult.cuttingHtml }} /></table></div>
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
                    <div className="grid grid-cols-2 gap-2"><div><label className="block text-sm font-semibold text-slate-600 mb-1">טלפון</label><input type="text" inputMode="text" autoComplete="tel" dir="ltr" value={fenceCustPhone} onChange={(e) => setFenceCustPhone(e.target.value)} placeholder="052-2288798" className="w-full border rounded-lg p-2.5 bg-white" /></div><div><label className="block text-sm font-semibold text-slate-600 mb-1">כתובת</label><input type="text" value={fenceCustAddress} onChange={(e) => setFenceCustAddress(e.target.value)} className="w-full border rounded-lg p-2.5 bg-white" /></div></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="text-lg font-bold text-slate-700">📏 מקטעי גדר</h3><button type="button" onClick={addFenceSeg} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded font-bold hover:bg-blue-200">+ הוסף מקטע</button></div>
                  <div className="space-y-4">{fenceSegments.map((seg) => (
                    <div key={seg.id} className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm relative flex flex-col gap-4">
                      <button type="button" onClick={() => removeFenceSeg(seg.id)} className="absolute top-4 left-4 text-red-500 bg-red-50 w-8 h-8 rounded-lg font-black hover:bg-red-100 border border-red-100 flex items-center justify-center">X</button>
                      <div><label className="block text-sm font-bold text-slate-600 mb-1">אורך כולל (ס&quot;מ)</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "L")} onChange={(e) => setFenceSegDraft(seg.id, "L", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "L")} className="w-full text-center font-black text-2xl p-3 border border-slate-300 rounded-xl" placeholder="0" /></div>
                      <div><label className="block text-sm font-bold text-slate-600 mb-1">גובה (ס&quot;מ)</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "H")} onChange={(e) => setFenceSegDraft(seg.id, "H", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "H")} className="w-full text-center font-black text-2xl p-3 border border-slate-300 rounded-xl" placeholder="0" /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">מספר עמודים כולל</label><input type="text" inputMode="decimal" pattern="[0-9]*[\\.,]?[0-9]*" dir="ltr" value={getFenceSegInputValue(seg, "P")} onChange={(e) => setFenceSegDraft(seg.id, "P", e.target.value)} onBlur={() => commitFenceSegDraft(seg.id, "P")} className="w-full text-center font-black text-xl p-2.5 border border-slate-300 rounded-lg" placeholder="סה״כ" /></div>
                    </div>
                  ))}</div>
                  <div className="mt-4 pt-3 border-t">
                    <div className="text-xs text-slate-500 font-bold bg-slate-100 p-2 rounded-lg text-center mt-2">החישוב המלא מתבצע בשרת המערכת</div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 bg-slate-50">
                  <h3 className="text-lg font-bold mb-4 border-b border-slate-200 pb-2 text-slate-700">🧱 מפרט טכני</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">שילוב פרופילים</label><select value={fenceSlat} onChange={(e) => setFenceSlat(e.target.value)} className="w-full border rounded-lg p-2 bg-white"><option value="100">רק 100/20</option><option value="70">רק 70/20</option><option value="40">רק 40/20</option><option value="20">רק 20/20</option><option value="mix1">מיקס: 2x40 ואז 1x70</option><option value="mix2">מיקס: 2x40, 2x20, 1x70</option></select></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">מרווח (ס&quot;מ)</label><select value={fenceGap} onChange={(e) => setFenceGap(e.target.value)} className="w-full border rounded-lg p-2 bg-white"><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option><option value="3">3</option></select></div>
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
                    onClick={() => setFencesInnerTab("calc")}
                    className={`px-4 py-2 rounded-xl font-bold transition shadow-sm border ${
                      fencesInnerTab === "calc" ? "bg-blue-600 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    📋 חישוב
                  </button>
                  <button
                    type="button"
                    onClick={() => setFencesInnerTab("sim")}
                    className={`px-4 py-2 rounded-xl font-bold transition shadow-sm border ${
                      fencesInnerTab === "sim" ? "bg-slate-800 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    🧱 הדמיית 3D
                  </button>
                </div>

                {fencesInnerTab === "sim" ? (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                      <h3 className="text-lg font-black text-slate-800">הדמיית 3D לגדרות</h3>
                      <div className="text-xs font-bold text-slate-500">עמודים + שלבים לפי הנתונים</div>
                    </div>
                    <div className="w-full h-[min(720px,calc(100dvh-14rem))] min-h-[min(520px,50dvh)] bg-slate-900">
                      <iframe
                        title="Fence 3D"
                        src="/fence-sim.html"
                        className="block h-full w-full bg-slate-900"
                        ref={fenceSimIframeRef}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {fenceResult.sqm <= 0 && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm font-bold">💡 הזן <strong>אורך</strong> ו<strong>גובה</strong> במקטע (לפחות במקטע אחד) כדי לראות חישוב ומחירים.</div>}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center"><p className="text-slate-500 text-xs font-bold mb-1">סה&quot;כ מ&quot;ר</p><p className="text-xl font-black text-slate-800">{(fenceResult?.sqm ?? 0).toFixed(2)}</p></div>
                      <div className="bg-slate-50 rounded-2xl p-4 shadow-sm border border-dashed border-slate-300 flex flex-col justify-center"><button type="button" onClick={() => setFenceHiddenCostsBox((v) => !v)} className="text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-xl transition">🔒 הצג / הסתר פירוט עלויות</button></div>
                      <div className="bg-blue-600 rounded-2xl p-4 text-white text-center shadow-md"><p className="text-blue-100 text-xs font-bold mb-1">מכירה ללקוח (כולל מע&quot;מ)</p><p className="text-xl font-black">₪ {fenceResult.sqm > 0 ? Math.round(fenceResult.sellIncVat).toLocaleString() : "0"}</p><p className="text-[10px] text-blue-200 mt-1 opacity-90">₪ {fenceResult.sqm > 0 ? Math.round(fenceResult.sellExVat).toLocaleString() : "0"} לפני מע&quot;מ</p></div>
                    </div>
                    {fenceHiddenCostsBox && fenceResult.sqm > 0 && (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center"><p className="text-slate-500 text-xs font-bold mb-1">משקל נטו</p><p className="text-xl font-black text-slate-800">{fenceResult.weight.toFixed(1)} ק&quot;ג</p></div>
                        <div className="bg-red-50 rounded-2xl p-4 border border-red-200 text-center shadow-sm"><p className="text-red-700 text-xs font-bold mb-1">שאריות נפל</p><p className="text-xl font-black text-red-600">{fenceResult.wasteKg.toFixed(1)} ק&quot;ג</p><p className="text-[10px] font-bold text-red-500 mt-1">{fenceResult.wastePercent.toFixed(1)}% פחת</p></div>
                        <div className="bg-slate-800 rounded-2xl p-4 text-white text-center shadow-md"><p className="text-slate-300 text-xs font-bold mb-1">עלות חומר</p><p className="text-xl font-black">₪ {Math.round(fenceResult.cost).toLocaleString()}</p></div>
                        <div className="bg-indigo-100 rounded-2xl p-4 text-indigo-900 text-center border border-indigo-200"><p className="text-indigo-700 text-xs font-bold mb-1">רווח גולמי</p><p className="text-xl font-black">₪ {Math.round(fenceResult.profit).toLocaleString()}</p></div>
                      </div>
                    )}
                    <div className="bg-white rounded-2xl p-6 shadow-md border-t-4 border-blue-500"><h2 className="text-lg font-black mb-4 text-slate-800 border-b pb-2">✂️ מידות חיתוך (ס&quot;מ)</h2><div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr><th>פרופיל / ייעוד</th><th className="text-center">כמות</th><th className="text-center">מידה סופית</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: fenceResult?.cuttingHtml ?? "" }} /></table></div></div>
                    <div className="bg-white rounded-2xl p-6 shadow-md border-t-4 border-emerald-500"><h2 className="text-lg font-black mb-4 text-slate-800 border-b pb-2">📦 הזמנה מהמחסן (מוטות 6 מ&apos;)</h2><div className="overflow-x-auto mb-4"><table className="w-full text-right text-sm"><thead><tr><th>סוג פרופיל</th><th className="text-center">כמות מוטות</th></tr></thead><tbody dangerouslySetInnerHTML={{ __html: fenceResult?.bomHtml ?? "" }} /></table></div><div className="bg-slate-50 p-4 rounded-xl border border-slate-200"><h4 className="font-bold text-slate-700 mb-2">🔩 פירזול ואביזרים</h4><div className="space-y-2 text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: fenceResult?.hardwareHtml ?? "" }} /></div></div>
                    <div className="bg-white rounded-2xl p-6 shadow-md border-r-4 border-blue-500"><h2 className="text-xl font-black mb-4 text-blue-800 border-b border-blue-100 pb-2">📐 מפרט שדות והוראות</h2><div className="text-base text-slate-800 space-y-3 font-medium" dangerouslySetInnerHTML={{ __html: fenceResult?.instructionsHtml ?? "הוסף מקטעים (אורך, גובה ועמודים) לחישוב מדויק." }} /></div>
                  </>
                )}
              </div>
            </div>
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
              <button type="button" onClick={() => switchView("data")} className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                חזור למפרט טכני
              </button>
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
        {/* VIEW: SETTINGS */}
        {currentView === "settings" && (
          <section className="p-8 max-w-3xl mx-auto">
            <div className="bg-white rounded-3xl p-8 shadow-md border border-slate-200">
              <h2 className="text-3xl font-black text-slate-800 mb-2 border-b pb-4 flex items-center gap-3">⚙️ הגדרות מערכת</h2>
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
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר קנייה בסיסי - אלומיניום לקילו (₪)</label><input type="number" value={pricePerKg} onChange={(e) => { setPricePerKg(e.target.value); saveSysSettings(); saveCurrentState(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold text-purple-800 bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר מכירה בסיסי - ללקוח למ&quot;ר (₪, לפני מע&quot;מ)</label><input type="number" value={sellPricePerSqm} onChange={(e) => { setSellPricePerSqm(e.target.value); saveSysSettings(); saveCurrentState(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold text-blue-700 bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">עלות התקנה למ&quot;ר (₪)</label><input type="number" value={sysInstallPriceSqm} onChange={(e) => { setSysInstallPriceSqm(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">עלות הובלה גלובלית (₪)</label><input type="number" value={sysTransportPrice} onChange={(e) => { setSysTransportPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר סנטף למ&quot;ר (₪)</label><input type="number" value={sysSantafPrice} onChange={(e) => { setSysSantafPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר פס לד למטר (₪)</label><input type="number" value={sysLedPrice} onChange={(e) => { setSysLedPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר אף מים (₪ ליח&apos;)</label><input type="number" value={sysDripEdgePrice} onChange={(e) => { setSysDripEdgePrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
                    <div><label className="block text-sm font-semibold text-slate-600 mb-1">מחיר ברגי מש&quot;ד (ל-1000 יח&apos;, ₪)</label><input type="number" value={sysScrewPrice} onChange={(e) => { setSysScrewPrice(e.target.value); saveSysSettings(); }} className="w-full border rounded-lg p-2.5 text-lg font-bold bg-white" /></div>
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
            <span className="max-w-full truncate">3D</span>
          </Link>
          <Link href="/?view=dashboard" className={mobileTabCls("dashboard")}>
            <span className="text-[1.15rem] leading-none">📊</span>
            <span className="max-w-full truncate">לוח</span>
          </Link>
          <button
            type="button"
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 px-0.5 text-[10px] font-bold leading-tight sm:text-[11px] ${
              mobileMoreOpen || currentView === "settings" || currentView === "business"
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
            <p className="mt-4 text-center text-[10px] text-slate-500">גרסת מערכת 3.0 (PRO)</p>
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
