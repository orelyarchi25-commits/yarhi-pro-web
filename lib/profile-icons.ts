/**
 * SVG cross-sections for aluminum profiles (catalog-accurate outlines).
 * Shared by React <ProfileIcon /> and HTML cutting/BOM tables.
 */

export type ProfileIconKey =
  | "l-wall-120"
  | "double-t-140"
  | "double-t-hitech"
  | "rect-20-40"
  | "rect-20-70"
  | "rect-20-20"
  | "rect-20-100"
  | "rect-120-40"
  | "rect-100-40"
  | "angle-30"
  | "post-80"
  | "post-100"
  | "post-130"
  | "t-beam-100"
  | "t-beam-120"
  | "t-led-100"
  | "t-led-120";

const SVG_ATTR =
  'xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"';

/** Precise catalog outlines — shape only, no dimensions/text. */
const PATHS: Record<ProfileIconKey, { viewBox: string; body: string }> = {
  // קורת טי אחד / L קיר 120×40 — מלבן גבוה + כנף אחת מימין למטה (כמו בקטלוג)
  "l-wall-120": {
    viewBox: "0 0 40 52",
    body: `<rect x="8" y="2" width="16" height="40"/><path d="M24 42h14"/>`,
  },
  // דאבל טי — לפי שרטוט הקטלוג (בלי כיתוב): גוף אנכי, שתי רגליים מימין (תעלה), מדרגה למעלה-שמאל, שפה דקה למטה-שמאל
  "double-t-140": {
    viewBox: "0 0 36 56",
    body: `<path d="M12 2h22v8H24v36h10v8H2v-2h6V10h4V2z"/><rect x="14" y="12" width="8" height="32"/><path d="M18 12v32"/>`,
  },
  // דאבל טי הייטק — גוף עם מדרגה למעלה, 4 שיניים משמאל, כנף קטנה מימין למטה
  "double-t-hitech": {
    viewBox: "0 0 40 56",
    body: `<path d="M16 2h10v6h4v36h8v6H16V44H4v-6h12V34H4v-6h12V24H4v-6h12V14H4V8h12V2z"/>`,
  },
  "rect-20-40": {
    viewBox: "0 0 20 40",
    body: `<rect x="2" y="2" width="16" height="36"/>`,
  },
  "rect-20-70": {
    viewBox: "0 0 20 70",
    body: `<rect x="2" y="2" width="16" height="66"/>`,
  },
  "rect-20-20": {
    viewBox: "0 0 24 24",
    body: `<rect x="3" y="3" width="18" height="18"/>`,
  },
  "rect-20-100": {
    viewBox: "0 0 20 100",
    body: `<rect x="2" y="2" width="16" height="96"/>`,
  },
  // מסגרת חלק 120×40 — מלבן מלא (לא קורת טי של חציץ)
  "rect-120-40": {
    viewBox: "0 0 28 52",
    body: `<rect x="6" y="2" width="16" height="48"/>`,
  },
  "rect-100-40": {
    viewBox: "0 0 28 48",
    body: `<rect x="6" y="2" width="16" height="44"/>`,
  },
  // זווית 30×30 — L
  "angle-30": {
    viewBox: "0 0 28 28",
    body: `<path d="M4 4v20h20" />`,
  },
  "post-80": {
    viewBox: "0 0 28 28",
    body: `<rect x="3" y="3" width="22" height="22"/>`,
  },
  "post-100": {
    viewBox: "0 0 28 28",
    body: `<rect x="3" y="3" width="22" height="22"/>`,
  },
  "post-130": {
    viewBox: "0 0 28 28",
    body: `<rect x="3" y="3" width="22" height="22"/>`,
  },
  // קורת חציץ 100/40 — מלבן גבוה + כנפיים בתחתית משני הצדדים (כמו בקטלוג)
  "t-beam-100": {
    viewBox: "0 0 40 48",
    body: `<rect x="12" y="2" width="16" height="36"/><path d="M2 38h36"/>`,
  },
  // קורת חציץ 120/40 — אותו חתך, גבוה יותר
  "t-beam-120": {
    viewBox: "0 0 40 52",
    body: `<rect x="12" y="2" width="16" height="40"/><path d="M2 42h36"/>`,
  },
  // קורת טי לפס לד 100/40 — חציץ + שקע לד בתחתית (כמו בקטלוג)
  "t-led-100": {
    viewBox: "0 0 40 48",
    body: `<rect x="12" y="2" width="16" height="36"/><path d="M2 38h36"/><path d="M15 31h10v5H15z"/>`,
  },
  // קורת טי לפס לד 120/40 — גבוה יותר + קו פנימי מעל השקע
  "t-led-120": {
    viewBox: "0 0 40 52",
    body: `<rect x="12" y="2" width="16" height="40"/><path d="M2 42h36"/><path d="M12 34h16"/><path d="M15 35h10v5H15z"/>`,
  },
};

/** Map free-text profile labels from cutting/BOM tables to an icon key. */
export function resolveProfileIconKey(profileName: string): ProfileIconKey | null {
  if (!profileName) return null;
  const n = profileName
    .replace(/×/g, "x")
    .replace(/X/g, "x")
    .replace(/\s+/g, " ")
    .trim();

  if (/טי\s*לפס\s*לד|לפס\s*לד/.test(n)) {
    if (/100/.test(n)) return "t-led-100";
    if (/120/.test(n)) return "t-led-120";
  }

  if (/L\s*קיר|חלק\s*\(\s*L/.test(n)) return "l-wall-120";
  // הייטק לפני דאבל רגיל
  if (/הייטק/.test(n) && /דאבל|טי|T|140|120/.test(n)) return "double-t-hitech";
  if (/דאבל\s*טי|דאבל\s*T/.test(n)) return "double-t-140";
  if (/140\/40/.test(n) && /טי|T|דאבל/.test(n)) return "double-t-140";

  if (/זווית\s*30|30\/30|30x30/.test(n)) return "angle-30";

  if (/(?:^|\s)(?:עמוד\s*)?130[\/x]130/.test(n) || /^130\/130$/.test(n)) return "post-130";
  if (/(?:^|\s)(?:עמוד\s*)?80[\/x]80/.test(n) || /^80\/80$/.test(n)) return "post-80";
  if (/(?:^|\s)(?:עמוד\s*)?100[\/x]100/.test(n) || /^100\/100$/.test(n)) return "post-100";
  if (/עמוד\s*גדר/.test(n)) return "post-100";

  // לד לפני חציץ רגיל — "חציצים 120/40 לד" לא ייפול ל־t-beam
  if (/120\/40/.test(n) && /לד/.test(n)) return "t-led-120";
  if (/100\/40/.test(n) && /לד/.test(n)) return "t-led-100";

  // חציצים / קורת טי — רק כשמדובר בחלוקה (לא מסגרת חלק)
  if (/חציצים.*120\/40|120\/40.*חציץ/.test(n)) return "t-beam-120";
  if (/חציצים.*100\/40|100\/40.*חציץ/.test(n)) return "t-beam-100";
  if (/^120\/40$/.test(n)) return "t-beam-120";
  if (/^100\/40$/.test(n)) return "t-beam-100";

  // מסגרת חלק 120/40 — אותו חתך כמו L קיר (מלבן + כנף אחת), לא חציץ טי
  if (/פרופיל\s*חלק/.test(n) || (/120\/40\s*חלק/.test(n) && !/חציץ/.test(n))) return "l-wall-120";
  if (/100\/40\s*חלק/.test(n) && !/חציץ/.test(n)) return "rect-100-40";

  // 20/xx — לא להתחיל באמצע מספר (מונע 120/40 → 20/40)
  if (/(^|[^0-9])20[\/x]20([^0-9]|$)/.test(n)) return "rect-20-20";
  if (/(^|[^0-9])20[\/x]100([^0-9]|$)/.test(n)) return "rect-20-100";
  if (/(^|[^0-9])20[\/x]70([^0-9]|$)/.test(n) || /הצללה\s*20\/70/.test(n)) return "rect-20-70";
  if (/(^|[^0-9])20[\/x]40([^0-9]|$)/.test(n) || /הצללה\s*20\/40|הכנה\s*לסנטף/.test(n)) return "rect-20-40";

  // fallback אחרון — רק אם נשאר 120/40 בלי הקשר מסגרת
  if (/120\/40/.test(n) && /חציץ|טי|T/.test(n)) return "t-beam-120";
  if (/100\/40/.test(n) && /חציץ|טי|T/.test(n)) return "t-beam-100";
  if (/120\/40/.test(n)) return "l-wall-120";
  if (/100\/40/.test(n)) return "rect-100-40";

  return null;
}

export function getProfileIconSvgMarkup(
  key: ProfileIconKey,
  className = "w-6 h-6 shrink-0 text-gray-700"
): string {
  const { viewBox, body } = PATHS[key];
  // width/height מפורשים — חובה להדפסה (בלי Tailwind ה־SVG מתנפח לדף שלם)
  return `<svg class="${className}" viewBox="${viewBox}" width="22" height="22" style="width:22px;height:22px;max-width:22px;max-height:22px;flex-shrink:0;display:inline-block;vertical-align:middle;color:#334155" ${SVG_ATTR} aria-hidden="true">${body}</svg>`;
}

/** HTML snippet: icon + label in RTL flex row (for cutting/BOM tables). */
export function profileNameWithIconHtml(
  profileName: string,
  extraClass = "font-bold"
): string {
  const key = resolveProfileIconKey(profileName);
  if (!key) {
    return `<span class="${extraClass}">${escapeHtml(profileName)}</span>`;
  }
  const icon = getProfileIconSvgMarkup(key);
  return `<span class="inline-flex items-center gap-2 ${extraClass}" style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap">${icon}<span>${escapeHtml(profileName)}</span></span>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getProfileIconPaths(key: ProfileIconKey) {
  return PATHS[key];
}
