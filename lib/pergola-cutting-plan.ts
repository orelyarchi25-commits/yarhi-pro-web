import { profileNameWithIconHtml } from "@/lib/profile-icons";

/** Bar-stock optimization for pergola material (4.5 / 6 / 7 m). */
const STOCK_BAR_LENS_M = [4.5, 6, 7] as const;
const MAX_STOCK_CM = 700;

export type CutPart = { qty: number; barLen: number; weight: number; usedLength: number };

type WeightsMap = { [barLen: number]: number | undefined };

function maxAvailableBarCm(weights: WeightsMap): number {
  let max = 0;
  for (const b of STOCK_BAR_LENS_M) {
    if (weights[b] !== undefined) max = Math.max(max, b * 100);
  }
  return max;
}

function pickSmallestBarLenM(lengthCm: number, weights: WeightsMap): number {
  for (const b of STOCK_BAR_LENS_M) {
    if (lengthCm <= b * 100 && weights[b] !== undefined) return b;
  }
  return 7;
}

/** Nesting only — cut fits entirely on the bar. */
function optimizeCuttingNesting(
  cutLength: number,
  quantity: number,
  weights: WeightsMap
): CutPart {
  if (cutLength <= 0 || quantity <= 0) return { qty: 0, barLen: 6, weight: 0, usedLength: 0 };
  let bestWaste = Infinity;
  let bestOption: CutPart | null = null;
  const checkBarLen = (barLenCm: number, weightKg: number | undefined) => {
    if (weightKg === undefined || cutLength > barLenCm) return;
    const perBar = Math.floor(barLenCm / cutLength);
    if (perBar <= 0) return;
    const bars = Math.ceil(quantity / perBar);
    const waste = bars * barLenCm - quantity * cutLength;
    if (waste < bestWaste) {
      bestWaste = waste;
      bestOption = { qty: bars, barLen: barLenCm / 100, weight: bars * weightKg, usedLength: quantity * cutLength };
    }
  };
  checkBarLen(450, weights[4.5]);
  checkBarLen(600, weights[6]);
  checkBarLen(700, weights[7]);
  if (bestOption) return bestOption;
  const fitBar = STOCK_BAR_LENS_M.find((b) => cutLength <= b * 100 && weights[b] !== undefined);
  return { qty: 0, barLen: fitBar ?? 7, weight: 0, usedLength: 0 };
}

/** One or more bar lengths — incl. splice above 7 m (7 m + complement bar). */
export function optimizeCuttingParts(
  cutLength: number,
  quantity: number,
  weights: WeightsMap
): CutPart[] {
  if (cutLength <= 0 || quantity <= 0) return [];
  const maxBarCm = maxAvailableBarCm(weights);
  if (maxBarCm <= 0) return [];

  if (cutLength <= MAX_STOCK_CM) {
    const one = optimizeCuttingNesting(cutLength, quantity, weights);
    return one.qty > 0 ? [one] : [];
  }

  // מעל 7 מ׳ — קטעי 7 מ׳ + מוט השלמה מהמלאי הקצר ביותר שמתאים
  if (maxBarCm >= MAX_STOCK_CM && weights[7] !== undefined) {
    const parts: CutPart[] = [];
    const segs7 = Math.floor(cutLength / MAX_STOCK_CM);
    const remainder = cutLength % MAX_STOCK_CM;
    if (segs7 > 0) {
      const qty7 = segs7 * quantity;
      parts.push({
        qty: qty7,
        barLen: 7,
        weight: qty7 * weights[7]!,
        usedLength: segs7 * MAX_STOCK_CM * quantity,
      });
    }
    if (remainder > 0) {
      const compBar = pickSmallestBarLenM(remainder, weights);
      const w = weights[compBar];
      if (w !== undefined) {
        parts.push({
          qty: quantity,
          barLen: compBar,
          weight: quantity * w,
          usedLength: remainder * quantity,
        });
      }
    }
    return parts;
  }

  // מלאי מסוג אחד (למשל גדר — רק 6 מ׳): חיתוכים רצופים מאותו אורך מוט
  const barLenM = maxBarCm / 100;
  const w = weights[barLenM];
  if (w === undefined) return [];
  const parts: CutPart[] = [];
  const fullSegs = Math.floor(cutLength / maxBarCm);
  const remainder = cutLength % maxBarCm;
  if (fullSegs > 0) {
    const qty = fullSegs * quantity;
    parts.push({
      qty,
      barLen: barLenM,
      weight: qty * w,
      usedLength: fullSegs * maxBarCm * quantity,
    });
  }
  if (remainder > 0) {
    parts.push({
      qty: quantity,
      barLen: barLenM,
      weight: quantity * w,
      usedLength: remainder * quantity,
    });
  }
  return parts;
}

export function optimizeCutting(
  cutLength: number,
  quantity: number,
  weights: WeightsMap
): CutPart {
  const parts = optimizeCuttingParts(cutLength, quantity, weights);
  if (!parts.length) return { qty: 0, barLen: 6, weight: 0, usedLength: 0 };
  return parts[0];
}

function formatPartsLabel(parts: CutPart[]): string {
  return parts
    .map((p) => {
      const lbl = barLabel(p.barLen);
      return p.qty > 1 ? `${p.qty}×${lbl}` : lbl;
    })
    .join(" + ");
}

export function barLabel(barLenM: number): string {
  if (!(barLenM > 0)) return "—";
  return Number.isInteger(barLenM) ? `${barLenM} מ׳` : `${barLenM} מ׳`;
}

export function pickBarDisplay(
  cutLength: number,
  quantity: number,
  weights: WeightsMap
): string {
  const parts = optimizeCuttingParts(cutLength, quantity, weights);
  if (!parts.length) return "—";
  if (parts.length === 1 && cutLength <= MAX_STOCK_CM) return barLabel(parts[0].barLen);
  return formatPartsLabel(parts);
}

export function pickBarLen(
  cutLength: number,
  quantity: number,
  weights: WeightsMap
): number {
  return optimizeCuttingParts(cutLength, quantity, weights)[0]?.barLen ?? 7;
}

export function pushCutParts(
  items: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[],
  name: string,
  color: string,
  cutLength: number,
  quantity: number,
  weights: WeightsMap
): void {
  for (const part of optimizeCuttingParts(cutLength, quantity, weights)) {
    if (part.qty > 0) items.push({ name, color, ...part });
  }
}

/** שלבים — תמיד מוט 6 מ׳ בלבד */
export function slatPlanFrom6m(cutLenCm: number, totalQty: number) {
  const stockCm = 600;
  const cutsPerBar = cutLenCm > 0 ? Math.floor(stockCm / cutLenCm) : 0;
  const remainderCm = cutsPerBar > 0 ? stockCm - cutsPerBar * cutLenCm : stockCm;
  const barsNeeded = cutsPerBar > 0 && totalQty > 0 ? Math.ceil(totalQty / cutsPerBar) : 0;
  return { cutsPerBar, remainderCm, barsNeeded, stockM: 6 };
}

export type ShadeSlatPlanItem = {
  label: string;
  cutLenCm: number;
  totalQty: number;
};

export function buildCutRowHtml(
  profile: string,
  purpose: string,
  qty: number,
  cutCm: number,
  barDisplay: string,
  rowClass = "",
  cutDisplay?: string
): string {
  const cls = rowClass ? ` class="${rowClass}"` : "";
  const cutText = cutDisplay ?? (cutCm > 0 ? cutCm.toFixed(1) : "—");
  const profileCell = profileNameWithIconHtml(profile, "font-bold");
  return `<tr${cls}><td class="p-2 border">${profileCell}</td><td class="p-2 border">${purpose}</td><td class="p-2 border text-center font-bold">X ${qty}</td><td class="p-2 border text-center highlight font-black text-lg">${cutText}</td><td class="p-2 border text-center font-bold text-indigo-700">${barDisplay}</td></tr>`;
}

export function buildShadeSlatPlanHtml(items: ShadeSlatPlanItem[]): string {
  if (!items.length) return "";
  return items
    .filter((item) => item.totalQty > 0 && item.cutLenCm > 0)
    .map((item) => {
      const { cutsPerBar, remainderCm, barsNeeded } = slatPlanFrom6m(item.cutLenCm, item.totalQty);
      return `<div class="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 mb-3 last:mb-0">
        <p class="text-sm font-black text-blue-900 mb-2">${item.label}</p>
        <p class="text-sm text-slate-700">מידה לחיתוך: <span class="text-2xl font-black text-slate-900 mx-1">${item.cutLenCm.toFixed(1)}</span> ס״מ</p>
        <p class="text-sm text-slate-700 mt-2">מוט <span class="font-bold text-indigo-700">6 מ׳</span> → <span class="font-black text-indigo-800 text-lg">${cutsPerBar}</span> חיתוכים למוט · שארית <span class="font-bold">${remainderCm}</span> ס״מ</p>
        <p class="text-sm text-slate-700 mt-1">סה״כ <span class="font-black">${item.totalQty}</span> חיתוכים → <span class="font-black text-emerald-700 text-lg">${barsNeeded}</span> מוטות</p>
      </div>`;
    })
    .join("");
}
