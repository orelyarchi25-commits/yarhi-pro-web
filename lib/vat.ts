/** ברירת מחדל — תואם מע״מ בישראל נכון ל־2026 */
export const DEFAULT_VAT_PERCENT = 18;
export const DEFAULT_VAT_DECIMAL = DEFAULT_VAT_PERCENT / 100;

/** שיעור מע״מ כמספר עשרוני (0.18), בטווח סביר */
export function clampVatRateDecimal(r: number): number {
  if (!Number.isFinite(r) || r < 0) return DEFAULT_VAT_DECIMAL;
  if (r > 0.5) return 0.5;
  return r;
}

/**
 * מחרוזת מהגדרות העסק: "18", "15", "17.5", "18%" — ריק = 18%.
 * ערך > 1 נחשב כאחוזים (15 → 15%). ערך ≤ 1 כשבר עשרוני (0.18 → 18%).
 */
export function parseBusinessVatPercentString(raw: string | undefined | null): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_VAT_DECIMAL;
  const s = String(raw).trim().replace(/%/g, "").replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return DEFAULT_VAT_DECIMAL;
  if (n > 1) return clampVatRateDecimal(n / 100);
  return clampVatRateDecimal(n);
}

/** קלט מ־API (מספר אחוזים 18 או שבר 0.18) */
export function parseVatRateDecimalFromApiInput(raw: unknown, fallbackDecimal: number = DEFAULT_VAT_DECIMAL): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1) return clampVatRateDecimal(raw / 100);
    return clampVatRateDecimal(raw);
  }
  if (typeof raw === "string") return parseBusinessVatPercentString(raw);
  return clampVatRateDecimal(fallbackDecimal);
}

/** סכום לפני מע״מ מתוך סכום כולל מע״מ */
export function exVatFromIncVat(inc: number, vatRateDecimal: number): number {
  const r = clampVatRateDecimal(vatRateDecimal);
  return inc / (1 + r);
}

/** חלק המע״מ מתוך סכום כולל מע״מ */
export function vatFromIncVat(inc: number, vatRateDecimal: number): number {
  const base = exVatFromIncVat(inc, vatRateDecimal);
  return inc - base;
}

/** סכום כולל מע״מ מתוך בסיס לפני מע״מ (לפני עיגול — לעיגול שקלים השתמשו ב־Math.round ב־UI) */
export function incVatFromExVat(ex: number, vatRateDecimal: number): number {
  const r = clampVatRateDecimal(vatRateDecimal);
  return ex * (1 + r);
}

/** תווית להצגה: "18%" / "15%" / "17.5%" */
export function formatBusinessVatPercentLabel(vatRateDecimal: number): string {
  const pct = clampVatRateDecimal(vatRateDecimal) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded}%`;
}
