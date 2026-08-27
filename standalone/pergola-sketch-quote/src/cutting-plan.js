/** Bar-stock helpers — mirrored from Yarhi Pro lib/pergola-cutting-plan.ts (standalone copy). */
const STOCK_BAR_LENS_M = [4.5, 6, 7];
const MAX_STOCK_CM = 700;

function maxAvailableBarCm(weights) {
  let max = 0;
  for (const b of STOCK_BAR_LENS_M) {
    if (weights[b] !== undefined) max = Math.max(max, b * 100);
  }
  return max;
}

function pickSmallestBarLenM(lengthCm, weights) {
  for (const b of STOCK_BAR_LENS_M) {
    if (lengthCm <= b * 100 && weights[b] !== undefined) return b;
  }
  return 7;
}

function optimizeCuttingNesting(cutLength, quantity, weights) {
  if (cutLength <= 0 || quantity <= 0) return { qty: 0, barLen: 6, weight: 0, usedLength: 0 };
  let bestWaste = Infinity;
  let bestOption = null;
  const checkBarLen = (barLenCm, weightKg) => {
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

export function optimizeCuttingParts(cutLength, quantity, weights) {
  if (cutLength <= 0 || quantity <= 0) return [];
  const maxBarCm = maxAvailableBarCm(weights);
  if (maxBarCm <= 0) return [];
  if (cutLength <= MAX_STOCK_CM) {
    const one = optimizeCuttingNesting(cutLength, quantity, weights);
    return one.qty > 0 ? [one] : [];
  }
  if (maxBarCm >= MAX_STOCK_CM && weights[7] !== undefined) {
    const parts = [];
    const segs7 = Math.floor(cutLength / MAX_STOCK_CM);
    const remainder = cutLength % MAX_STOCK_CM;
    if (segs7 > 0) {
      const qty7 = segs7 * quantity;
      parts.push({ qty: qty7, barLen: 7, weight: qty7 * weights[7], usedLength: segs7 * MAX_STOCK_CM * quantity });
    }
    if (remainder > 0) {
      const compBar = pickSmallestBarLenM(remainder, weights);
      const w = weights[compBar];
      if (w !== undefined) {
        parts.push({ qty: quantity, barLen: compBar, weight: quantity * w, usedLength: remainder * quantity });
      }
    }
    return parts;
  }
  const barLenM = maxBarCm / 100;
  const w = weights[barLenM];
  if (w === undefined) return [];
  const parts = [];
  const fullSegs = Math.floor(cutLength / maxBarCm);
  const remainder = cutLength % maxBarCm;
  if (fullSegs > 0) {
    const qty = fullSegs * quantity;
    parts.push({ qty, barLen: barLenM, weight: qty * w, usedLength: fullSegs * maxBarCm * quantity });
  }
  if (remainder > 0) {
    parts.push({ qty: quantity, barLen: barLenM, weight: quantity * w, usedLength: remainder * quantity });
  }
  return parts;
}

export function barLabel(barLenM) {
  if (!(barLenM > 0)) return "—";
  return `${barLenM} מ׳`;
}

export function pickBarDisplay(cutLength, quantity, weights) {
  const parts = optimizeCuttingParts(cutLength, quantity, weights);
  if (!parts.length) return "—";
  if (parts.length === 1 && cutLength <= MAX_STOCK_CM) return barLabel(parts[0].barLen);
  return parts.map((p) => (p.qty > 1 ? `${p.qty}×${barLabel(p.barLen)}` : barLabel(p.barLen))).join(" + ");
}

export function pushCutParts(items, name, color, cutLength, quantity, weights) {
  for (const part of optimizeCuttingParts(cutLength, quantity, weights)) {
    if (part.qty > 0) items.push({ name, color, ...part });
  }
}

export function slatPlanFrom6m(cutLenCm, totalQty) {
  const stockCm = 600;
  const cutsPerBar = cutLenCm > 0 ? Math.floor(stockCm / cutLenCm) : 0;
  const remainderCm = cutsPerBar > 0 ? stockCm - cutsPerBar * cutLenCm : stockCm;
  const barsNeeded = cutsPerBar > 0 && totalQty > 0 ? Math.ceil(totalQty / cutsPerBar) : 0;
  return { cutsPerBar, remainderCm, barsNeeded, stockM: 6 };
}
