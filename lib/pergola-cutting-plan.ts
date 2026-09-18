import { profileNameWithIconHtml } from "@/lib/profile-icons";

/** Bar-stock optimization for pergola material (4.5 / 6 / 7 m). */
const STOCK_BAR_LENS_M = [4.5, 6, 7] as const;
const MAX_STOCK_CM = 700;
/** מרווח חיתוך/ניקיון לכל חתיכה בניצול מוטות (ס״מ) */
export const CUT_KERF_CM = 0.5;
const SHADE_STOCK_CM = 600;

export type CutPart = { qty: number; barLen: number; weight: number; usedLength: number };

export type WeightsMap = { [barLen: number]: number | undefined };

/** תווית בעמודת מוט בטבלת חיתוך — ההזמנה עצמה בניצול משותף במחסן */
export const SHARED_NEST_BAR_LABEL = "ניצול משותף";

export type NestBarsResult = {
  barsNeeded: number;
  usedLength: number;
  stockCm: number;
  kerfCm: number;
  /** רק כש־debug=true: אורכים שנכנסו לכל מוט (סדר החיתוך בפועל) */
  bars?: number[][];
};

/**
 * ניצול מוטות לכל הפרויקט: רשימה שטוחה של אורכי חיתוך,
 * מיון מהארוך לקצר, First-Fit עם מרווח kerf לכל חתיכה.
 */
export function nestBarsFirstFitDecreasing(
  pieceLengthsCm: number[],
  stockCm: number = SHADE_STOCK_CM,
  kerfCm: number = CUT_KERF_CM,
  debug: boolean = false
): NestBarsResult {
  const pieces = pieceLengthsCm.filter((L) => L > 0).sort((a, b) => b - a);
  const usedLength = pieces.reduce((s, L) => s + L, 0);
  if (pieces.length === 0) {
    return { barsNeeded: 0, usedLength: 0, stockCm, kerfCm, ...(debug ? { bars: [] } : {}) };
  }
  const remainders: number[] = [];
  const bars: number[][] | undefined = debug ? [] : undefined;
  for (const len of pieces) {
    const need = len + kerfCm;
    if (need > stockCm + 1e-9) {
      // חתיכה ארוכה ממוט — מוט ייעודי (לא אמור לקרות בהצללה רגילה)
      remainders.push(0);
      if (bars) bars.push([len]);
      continue;
    }
    let placed = false;
    for (let i = 0; i < remainders.length; i++) {
      if (remainders[i] + 1e-9 >= need) {
        remainders[i] -= need;
        if (bars) bars[i].push(len);
        placed = true;
        break;
      }
    }
    if (!placed) {
      remainders.push(stockCm - need);
      if (bars) bars.push([len]);
    }
  }
  if (debug && bars) {
    console.log(
      `[nestBarsFirstFitDecreasing] pieces=${pieces.length} bars=${bars.length} stock=${stockCm} kerf=${kerfCm}`
    );
    bars.forEach((b, i) => {
      const used = b.reduce((s, x) => s + x, 0);
      const kerfTotal = b.length * kerfCm;
      const waste = stockCm - used - kerfTotal;
      console.log(
        `  מוט ${i + 1}: [${b.map((x) => x.toFixed(1)).join(" + ")}] | used=${used.toFixed(1)} kerf=${kerfTotal.toFixed(1)} waste=${waste.toFixed(1)}`
      );
    });
  }
  return { barsNeeded: remainders.length, usedLength, stockCm, kerfCm, ...(debug ? { bars } : {}) };
}

/** מרחיב מפת אורך→כמות לרשימת חתיכות שטוחה */
export function expandCutQtyMap(qtyByLen: Map<number, number> | Record<number, number>): number[] {
  const out: number[] = [];
  const entries =
    qtyByLen instanceof Map
      ? Array.from(qtyByLen.entries())
      : Object.entries(qtyByLen).map(([k, v]) => [Number(k), v] as [number, number]);
  for (const [len, qty] of entries) {
    if (!(len > 0) || !(qty > 0)) continue;
    for (let i = 0; i < qty; i++) out.push(len);
  }
  return out;
}

export function pushNestedBarParts(
  items: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[],
  name: string,
  color: string,
  pieceLengthsCm: number[],
  weightPerBarKg: number,
  stockCm: number = SHADE_STOCK_CM,
  kerfCm: number = CUT_KERF_CM
): NestBarsResult {
  const nest = nestBarsFirstFitDecreasing(pieceLengthsCm, stockCm, kerfCm);
  if (nest.barsNeeded > 0) {
    items.push({
      name,
      color,
      qty: nest.barsNeeded,
      barLen: stockCm / 100,
      weight: nest.barsNeeded * weightPerBarKg,
      usedLength: nest.usedLength,
    });
  }
  return nest;
}

/**
 * חתיכות ארוכות ממוט מלאי → מוטות מלאים + שארית לניצול עם שאר הפרויקט.
 */
export function expandPiecesForStock(
  pieceLengthsCm: number[],
  stockCm: number
): { fullBars: number; remainders: number[]; usedLength: number } {
  let fullBars = 0;
  const remainders: number[] = [];
  let usedLength = 0;
  for (const L of pieceLengthsCm) {
    if (!(L > 0)) continue;
    usedLength += L;
    if (L <= stockCm + 1e-9) {
      remainders.push(L);
      continue;
    }
    const full = Math.floor(L / stockCm);
    const rem = L - full * stockCm;
    fullBars += full;
    if (rem > 1e-9) remainders.push(rem);
  }
  return { fullBars, remainders, usedLength };
}

/**
 * ניצול מקסימלי: כל חיתוכי אותו פרופיל על המלאי הזמין (4.5/6/7),
 * בחירת אורך מוט עם משקל הזמנה מינימלי (ואז פסולת מינימלית).
 */
export function nestPiecesOnBestStock(
  pieceLengthsCm: number[],
  weights: WeightsMap,
  kerfCm: number = CUT_KERF_CM
): CutPart | null {
  const pieces = pieceLengthsCm.filter((L) => L > 0);
  if (!pieces.length) return null;

  let best: CutPart | null = null;
  let bestWeight = Infinity;
  let bestWaste = Infinity;

  for (const barLenM of STOCK_BAR_LENS_M) {
    const wKg = weights[barLenM];
    if (wKg === undefined) continue;
    const stockCm = barLenM * 100;
    const { fullBars, remainders, usedLength } = expandPiecesForStock(pieces, stockCm);
    const nest = nestBarsFirstFitDecreasing(remainders, stockCm, kerfCm);
    const qty = fullBars + nest.barsNeeded;
    if (qty <= 0) continue;
    const weight = qty * wKg;
    const waste = qty * stockCm - usedLength;
    const betterWeight = weight < bestWeight - 1e-9;
    const sameWeightLessWaste = Math.abs(weight - bestWeight) < 1e-9 && waste < bestWaste - 1e-9;
    if (betterWeight || sameWeightLessWaste) {
      bestWeight = weight;
      bestWaste = waste;
      best = { qty, barLen: barLenM, weight, usedLength };
    }
  }
  return best;
}

export function pushNestedStockParts(
  items: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[],
  name: string,
  color: string,
  pieceLengthsCm: number[],
  weights: WeightsMap
): void {
  const part = nestPiecesOnBestStock(pieceLengthsCm, weights);
  if (part && part.qty > 0) items.push({ name, color, ...part });
}

export type NestPieceGroup = {
  name: string;
  color: string;
  weights: WeightsMap;
  pieces: number[];
};

/** מיזוג שמות תצוגה כשאותו פרופיל משמש לכמה מטרות (הצללה + הכנה לסנטף) */
export function mergeBomProfileNames(existing: string, incoming: string): string {
  if (existing === incoming) return existing;
  const parts = Array.from(
    new Set(
      `${existing} + ${incoming}`
        .split(/\s*\+\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const hasShade40 = parts.some((p) => /הצללה\s*20\/40/.test(p));
  const hasShade70 = parts.some((p) => /הצללה\s*20\/70/.test(p));
  const hasSantafPrep = parts.some((p) => /הכנה\s*לסנטף/.test(p));
  if (hasShade40 && hasSantafPrep) return "הצללה 20/40 + הכנה לסנטף";
  if (hasShade70 && hasSantafPrep) return "הצללה 20/70 + הכנה לסנטף";
  if (hasSantafPrep && parts.some((p) => /^20\/40/.test(p) || /הצללה\s*20\/40/.test(p))) {
    return "20/40 (הכנה לסנטף)";
  }
  return parts.join(" + ");
}

/**
 * קיבוץ חיתוכים לפי פרופיל פיזי+צבע לניצול משותף.
 * nestKey — מפתח ניצול (למשל "20/40"); name — תווית בהזמנה (למשל "הכנה לסנטף").
 */
export function addPiecesToNestGroup(
  groups: Map<string, NestPieceGroup>,
  name: string,
  color: string,
  cutLengthCm: number,
  quantity: number,
  weights: WeightsMap,
  nestKey?: string
): void {
  if (!(cutLengthCm > 0) || !(quantity > 0)) return;
  const key = `${nestKey ?? name}__${color}`;
  const g = groups.get(key);
  if (!g) {
    groups.set(key, { name, color, weights, pieces: Array(quantity).fill(cutLengthCm) });
    return;
  }
  if (g.name !== name) g.name = mergeBomProfileNames(g.name, name);
  for (let i = 0; i < quantity; i++) g.pieces.push(cutLengthCm);
}

export function flushNestGroupsToItems(
  items: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[],
  groups: Map<string, NestPieceGroup>
): void {
  groups.forEach((g) => {
    pushNestedStockParts(items, g.name, g.color, g.pieces, g.weights);
  });
}

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

/** שלבים — מוט 6 מ׳ עם מרווח חיתוך; לחישוב בודד לפי אורך אחד */
export function slatPlanFrom6m(cutLenCm: number, totalQty: number) {
  const stockCm = SHADE_STOCK_CM;
  const kerfCm = CUT_KERF_CM;
  const slot = cutLenCm + kerfCm;
  const cutsPerBar = cutLenCm > 0 && slot > 0 ? Math.floor(stockCm / slot) : 0;
  const remainderCm = cutsPerBar > 0 ? stockCm - cutsPerBar * slot : stockCm;
  const pieces = cutLenCm > 0 && totalQty > 0 ? Array(totalQty).fill(cutLenCm) : [];
  const { barsNeeded } = nestBarsFirstFitDecreasing(pieces, stockCm, kerfCm);
  return { cutsPerBar, remainderCm, barsNeeded, stockM: 6, kerfCm };
}

export type ShadeSlatPlanItem = {
  label: string;
  cutLenCm: number;
  totalQty: number;
};

/** כרטיסי חיתוך לפי מידה + סה״כ מוטות לפרויקט (ניצול משותף לכל פרופיל בנפרד) */
export function buildShadeSlatPlanHtml(items: ShadeSlatPlanItem[]): string {
  if (!items.length) return "";
  const valid = items.filter((item) => item.totalQty > 0 && item.cutLenCm > 0);
  if (!valid.length) return "";

  const groups = new Map<string, ShadeSlatPlanItem[]>();
  for (const item of valid) {
    const key = item.label.includes("20/40")
      ? "הצללה 20/40"
      : item.label.includes("20/70")
        ? "הצללה 20/70"
        : "הצללה";
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([profileName, groupItems]) => {
      const allPieces = groupItems.flatMap((item) => Array(item.totalQty).fill(item.cutLenCm) as number[]);
      const nest = nestBarsFirstFitDecreasing(allPieces);
      const cards = groupItems
        .map((item) => {
          const slot = item.cutLenCm + CUT_KERF_CM;
          const cutsPerBar = slot > 0 ? Math.floor(SHADE_STOCK_CM / slot) : 0;
          return `<div class="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 mb-3 last:mb-0">
        <p class="text-sm font-black text-blue-900 mb-3">${item.label}</p>
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-3 pb-3 border-b border-blue-200">
          <p class="text-base text-slate-800">כמות: <span class="text-3xl font-black text-emerald-700 mx-1">${item.totalQty}</span> <span class="font-bold text-emerald-800">יחידות</span></p>
        </div>
        <p class="text-sm text-slate-700">מידה לחיתוך: <span class="text-2xl font-black text-slate-900 mx-1">${item.cutLenCm.toFixed(1)}</span> ס״מ</p>
        <p class="text-sm text-slate-600 mt-2">מוט 6 מ׳ → עד <span class="font-black text-indigo-800">${cutsPerBar}</span> חיתוכים למוט (כולל מרווח ${CUT_KERF_CM} ס״מ)</p>
      </div>`;
        })
        .join("");
      const summary = `<div class="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4 mb-3">
    <p class="text-sm font-black text-indigo-900 mb-1">סה״כ מוטות ${profileName} מהמחסן (ניצול משותף לכל המידות)</p>
    <p class="text-base text-slate-800"><span class="text-3xl font-black text-indigo-700 mx-1">${nest.barsNeeded}</span> <span class="font-bold text-indigo-800">× 6 מ׳</span>
    <span class="text-xs text-slate-500 mr-2">(מרווח חיתוך ${CUT_KERF_CM} ס״מ לחתיכה)</span></p>
  </div>`;
      return summary + cards;
    })
    .join("");
}

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
