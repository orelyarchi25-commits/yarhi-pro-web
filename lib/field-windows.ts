export type FieldWindowItem = {
  id: string;
  width: number;
  height: number;
  sqm: string;
  profile: string;
  glass: string;
  location: string;
  color: string;
  tracks: string;
  overlap: string;
  lockInfo: string;
  components: string;
  qty: number;
  notes: string;
  isFrameOnly: boolean;
  /** מצב רשת — משפיע על חישוב מסילות */
  screenMode?: "window" | "addon" | "miklachon";
  /** תיאור הלבשות לשמירה והדפסה */
  trimDescription?: string;
  /** מצב הלבשה מלא לעריכה חוזרת */
  trimState?: FieldWindowTrimState;
};

export type TrimSideSelection = {
  active: boolean;
  top: boolean;
  bottom: boolean;
  right: boolean;
  left: boolean;
};

export type FieldWindowTrimState = {
  internal: TrimSideSelection;
  external: TrimSideSelection;
};

export function defaultFieldWindowTrimState(): FieldWindowTrimState {
  return {
    internal: { active: true, top: true, bottom: true, right: true, left: true },
    external: { active: false, top: true, bottom: true, right: true, left: true },
  };
}

export function formatTrimString(trimData: FieldWindowTrimState) {
  const desc: string[] = [];
  if (trimData.internal.active) {
    const parts: string[] = [];
    if (trimData.internal.top) parts.push("עליון");
    if (trimData.internal.bottom) parts.push("תחתון");
    if (trimData.internal.right) parts.push("ימין");
    if (trimData.internal.left) parts.push("שמאל");
    if (parts.length > 0) desc.push(`פנימי: ${parts.join(", ")}`);
  }
  if (trimData.external.active) {
    const parts: string[] = [];
    if (trimData.external.top) parts.push("עליון");
    if (trimData.external.bottom) parts.push("תחתון");
    if (trimData.external.right) parts.push("ימין");
    if (trimData.external.left) parts.push("שמאל");
    if (parts.length > 0) desc.push(`חיצוני: ${parts.join(", ")}`);
  }
  return desc.length > 0 ? desc.join(" | ") : "ללא הלבשות";
}

export function resolveItemTrimState(item: FieldWindowItem): FieldWindowTrimState {
  if (item.trimState) return item.trimState;
  return defaultFieldWindowTrimState();
}

export type FieldWindowRecord = {
  id: string;
  /** שם פרויקט / מיקום — לא חייב לקוח CRM */
  title: string;
  clientPhone?: string;
  clientAddress?: string;
  notes?: string;
  items: FieldWindowItem[];
  /** קישור אופציונלי לפרויקט CRM */
  crmProjectId?: number;
  createdAt: string;
  updatedAt: string;
};

export const FIELD_WINDOW_PROFILES = [
  "פרופיל 7000 (הזזה)",
  "פרופיל 7300 (הזזה)",
  "פרופיל 7400 (הזזה)",
  "פרופיל 9000 (הזזה)",
  "פרופיל 9100 (הזזה)",
  "פרופיל 9200 (הזזה)",
  "פרופיל 3000 (הזזה)",
  "פרופיל 2000 (הזזה)",
  "פרופיל 1700 (בלגי)",
  "פרופיל 4300 (ציר)",
  "פרופיל 4500 (ציר)",
  "פרופיל 4100 (ציר)",
  "פרופיל 4200 (ציר)",
  "פרופיל 4600 (ציר)",
  "פרופיל 56 (בלגי ציר)",
  "פרופיל 5500 (ציר)",
  "פרופיל 5700 (ציר)",
  "פרופיל 5800 (ציר)",
  "פרופיל TH (הזזה תרמי)",
  "פרופיל TH (ציר תרמי)",
  "חלון קיפ (פתיחה עליונה)",
  "חלון דריי קיפ (D.K)",
  "קיפ-סלייד (הזזה-ציר)",
  "דלת הזזה 9000 (הזזה כבד)",
  "מסגרת קבועה (ללא כנף)",
  "אחר / מותאם",
] as const;

export const FIELD_WINDOW_GLASS = [
  "טריפלקס 3+3 שקוף",
  "טריפלקס 4+4 שקוף",
  "טריפלקס 3+3 אנטיסאן אפור",
  "טריפלקס 4+4 אנטיסאן אפור",
  "טריפלקס 3+3 חלבי",
  "טריפלקס 4+4 חלבי",
  "בידודית 4-12-4 שקוף",
  "בידודית מחוסם 4+6+4",
  "בידודית מחוסם 6+10+6",
  "בידודית מחוסם 6+12+6",
  "6+6 מחוסם",
  "זכוכית מחוסמת 8 מ״מ",
  "מונוליטית 6 מ״מ שקוף",
  "זכוכית חלבית (אטומה)",
  "זכוכית צ'ינצ'ילה (דקורטיבית)",
  "זכוכית גרניט",
  "ללא זכוכית (מסגרת בלבד)",
] as const;

export const TRACK_OPTIONS = [
  { value: 0, label: "ללא מסילות" },
  { value: 2, label: "2 מסילות" },
  { value: 3, label: "3 מסילות" },
  { value: 4, label: "4 מסילות" },
  { value: 5, label: "5 מסילות" },
] as const;

export type FieldWindowScreenMode = "window" | "addon" | "miklachon";

export type TracksSuggestionState = {
  isFrameOnly: boolean;
  hasGlass: boolean;
  hasShutter: boolean;
  hasScreen: boolean;
  screenMode: FieldWindowScreenMode;
};

export const OVERLAP_OPTIONS = ["לא רלוונטי", "ימין פנים", "שמאל פנים"] as const;

export function normalizeOverlapValue(value: string | undefined): (typeof OVERLAP_OPTIONS)[number] {
  if (value && (OVERLAP_OPTIONS as readonly string[]).includes(value)) {
    return value as (typeof OVERLAP_OPTIONS)[number];
  }
  return OVERLAP_OPTIONS[0];
}

export const LOCK_SIDES = ["ימין", "שמאל", "ללא"] as const;

export function fieldWindowsLocalStorageKey(uid: string) {
  return `yarhi_field_windows_${uid}`;
}

export function formatFieldWindowDate(d = new Date()) {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

export function calcSqm(width: number, height: number) {
  if (width <= 0 || height <= 0) return "0.00";
  return ((width * height) / 10000).toFixed(2);
}

/** תצוגת מידות מפורשת לסיכום — רוחב וגובה בנפרד */
export function formatFieldWindowDimensions(width: number, height: number) {
  return {
    widthLabel: `רוחב: ${width} ס"מ`,
    heightLabel: `גובה: ${height} ס"מ`,
    sqmLabel: `${calcSqm(width, height)} מ"ר`,
    inline: `רוחב: ${width} ס"מ · גובה: ${height} ס"מ`,
  };
}

export function newFieldWindowItemId() {
  return `W_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function newFieldWindowRecordId() {
  return `M_${Date.now()}`;
}

export function buildLockInfo(height: string, side: string) {
  const h = height.trim();
  const s = side || "ללא";
  if (!h && s === "ללא") return "ללא מנעול";
  if (!h) return `מנעול בצד ${s}`;
  return `מנעול ${h} ס"מ — ${s}`;
}

export function formatTracksLabel(n: number) {
  if (n === 0) return "ללא מסילות";
  return `${n} מסילות`;
}

export function parseTracksCount(tracksStr: string) {
  if (!tracksStr) return null;
  if (/ללא/i.test(tracksStr)) return 0;
  const m = String(tracksStr).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function calcSuggestedTracks(state: TracksSuggestionState): { count: number; hint: string } | null {
  if (state.isFrameOnly) return null;

  const parts: string[] = [];
  let total = 0;
  if (state.hasShutter) {
    total += 2;
    parts.push("2 תריס");
  }
  if (state.hasGlass) {
    total += 2;
    parts.push("2 זכוכית");
  }

  if (state.hasScreen) {
    if (state.screenMode === "window" || state.hasGlass || state.hasShutter) {
      total += 1;
      parts.push("רשת");
    } else if (state.screenMode === "addon") {
      parts.push("רשת — תוספת (ללא נוספות)");
    } else {
      total = 2;
      parts.length = 0;
      parts.push("פרופיל מקלחון (2)");
    }
  }

  if (total === 0 && state.hasScreen && state.screenMode === "addon") {
    return {
      count: 0,
      hint: "רשת כתוספת על קיים — ללא מסילות. ניתן לשנות ידנית.",
    };
  }

  if (total === 0) total = 2;

  const count = Math.min(5, total);
  const breakdown = parts.length ? parts.join(" + ") : "ברירת מחדל";
  return {
    count,
    hint: `מחושב: ${breakdown} = ${count} מסילות · ניתן לשנות ידנית`,
  };
}

export function inferScreenModeFromItem(item: FieldWindowItem): FieldWindowScreenMode {
  if (item.screenMode) return item.screenMode;
  const comp = item.components || "";
  const hasScreen = /רשת|קליל|פרופיל/.test(comp);
  if (!hasScreen) return "miklachon";
  const hasGlass = comp.includes("זכוכית");
  const hasShutter = comp.includes("תריס שלבים");
  if (hasGlass || hasShutter) return "window";
  const tracks = parseTracksCount(item.tracks);
  if (tracks === 0 || /ללא/i.test(item.tracks || "")) return "addon";
  return "miklachon";
}

export function getFieldWindowRecordIdFromProject(formState: unknown): string | null {
  if (!formState || typeof formState !== "object") return null;
  const id = (formState as Record<string, unknown>).fieldWindowRecordId;
  return id != null && String(id).trim() ? String(id) : null;
}

export function totalItemsSqm(items: FieldWindowItem[]) {
  return items.reduce((sum, item) => sum + parseFloat(item.sqm || "0") * (item.qty || 1), 0).toFixed(2);
}

export function readFieldWindowsFromLocal(uid: string): FieldWindowRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(fieldWindowsLocalStorageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FieldWindowRecord[]) : [];
  } catch {
    return [];
  }
}
