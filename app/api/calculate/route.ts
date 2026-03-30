import { NextResponse } from "next/server";

// --- RAL options for color validation (fence) ---
const RAL_OPTIONS = [
  "RAL 9016", "RAL 9010", "RAL 1013", "RAL 1015", "RAL 9006", "RAL 9007", "RAL 7035", "RAL 7037", "RAL 7040",
  "RAL 7016", "RAL 7021", "RAL 7024", "RAL 9005", "RAL 8011", "RAL 8014", "RAL 8017", "RAL 8028", "RAL 6005",
  "RAL 6009", "RAL 5010", "RAL 5014", "RAL 5024", "RAL 3005", "RAL 3020", "RAL 1001", "RAL 1019", "RAL 4005",
  "RAL 6019", "RAL 7006", "RAL 7032", "RAL 7039", "RAL 9001", "RAL 9002", "עץ", "ברזל בלגי (Iron)",
];

/** RAL / Hebrew labels → hex (server-only; used for sketches & 3D sim payloads) */
function getColorHex(colorStr: string): string {
  if (!colorStr) return "#555555";
  const h = colorStr.trim();
  // קודי RAL ספציפיים קודם — כדי שלא ייבלעו ב"אפור" / "חום" מתוך תווית עברית (למשל "RAL 7024 - אפור גרפיט")
  if (h.includes("9016")) return "#ffffff";
  if (h.includes("9010")) return "#f8f8f2";
  if (h.includes("1013")) return "#eaddc5";
  if (h.includes("1015")) return "#e6d690";
  if (h.includes("9006")) return "#a5a9ab";
  if (h.includes("9007")) return "#808080";
  if (h.includes("7035")) return "#c5c7c4";
  if (h.includes("7037")) return "#7a7b7a";
  if (h.includes("7040")) return "#9da1aa";
  if (h.includes("7016")) return "#383e42";
  if (h.includes("7021")) return "#2f3234";
  if (h.includes("7024")) return "#474a51";
  if (h.includes("9005")) return "#000000";
  if (h.includes("8011")) return "#5a3d31";
  if (h.includes("8014")) return "#4e3b31";
  if (h.includes("8017")) return "#45322e";
  if (h.includes("8028")) return "#593b22";
  if (h.includes("6005")) return "#2f4f4f";
  if (h.includes("6009")) return "#213529";
  if (h.includes("5010")) return "#004f7c";
  if (h.includes("5014")) return "#6c7c98";
  if (h.includes("5024")) return "#5d9b9b";
  if (h.includes("3005")) return "#5e2129";
  if (h.includes("3020")) return "#cc0605";
  if (h.includes("1001")) return "#d1b272";
  if (h.includes("1019")) return "#a48f7a";
  if (h.includes("4005")) return "#7e7389";
  if (h.includes("6019")) return "#b7d9b1";
  if (h.includes("7006")) return "#7a6a53";
  if (h.includes("7032")) return "#b8b4a1";
  if (h.includes("7039")) return "#6c6960";
  if (h.includes("9001")) return "#fdf4e3";
  if (h.includes("9002")) return "#e7ebda";
  if (h.includes("בלגי")) return "#2b2b2b";
  if (h.includes("שחור")) return "#1a1a1a";
  if (h.includes("לבן") && !h.includes("צדף") && !h.includes("שנהב")) return "#f8fafc";
  if (h.includes("קרם")) return "#fef3c7";
  if (h.includes("אפור")) return "#475569";
  if (h.includes("חום")) return "#78350f";
  if (h.includes("דמוי עץ") || h.includes("עץ")) return "#b45309";
  return "#888888";
}

function optimizeCutting(
  cutLength: number,
  quantity: number,
  weights: { [barLen: number]: number | undefined }
): { qty: number; barLen: number; weight: number; usedLength: number } {
  if (cutLength <= 0 || quantity <= 0) return { qty: 0, barLen: 6, weight: 0, usedLength: 0 };
  let bestWaste = Infinity;
  let bestOption: { qty: number; barLen: number; weight: number; usedLength: number } | null = null;
  const checkBarLen = (barLenCm: number, weightKg: number | undefined) => {
    if (weightKg === undefined) return;
    let bars = 0;
    let waste = Infinity;
    if (cutLength > barLenCm) {
      const fullBarsPerPiece = Math.floor(cutLength / barLenCm);
      const remainder = cutLength % barLenCm;
      let extraBars = 0;
      if (remainder > 0) {
        const piecesPerExtraBar = Math.floor(barLenCm / remainder);
        extraBars = Math.ceil(quantity / piecesPerExtraBar);
      }
      bars = fullBarsPerPiece * quantity + extraBars;
      waste = bars * barLenCm - quantity * cutLength;
    } else {
      const perBar = Math.floor(barLenCm / cutLength);
      bars = perBar > 0 ? Math.ceil(quantity / perBar) : 0;
      waste = perBar > 0 ? bars * barLenCm - quantity * cutLength : Infinity;
    }
    if (waste < bestWaste) {
      bestWaste = waste;
      bestOption = { qty: bars, barLen: barLenCm / 100, weight: bars * weightKg, usedLength: quantity * cutLength };
    }
  };
  checkBarLen(450, weights[4.5]);
  checkBarLen(600, weights[6]);
  checkBarLen(700, weights[7]);
  return bestOption || { qty: 0, barLen: 6, weight: 0, usedLength: 0 };
}

function getPatFence(v: string): { w: number; wt: number; n: string }[] {
  if (v === "100") return [{ w: 10, wt: 4.5, n: "100/20" }];
  if (v === "70") return [{ w: 7, wt: 2.8, n: "70/20" }];
  if (v === "40") return [{ w: 4, wt: 2.4, n: "40/20" }];
  if (v === "20") return [{ w: 2, wt: 1.8, n: "20/20" }];
  if (v === "mix1") return [{ w: 4, wt: 2.4, n: "40/20" }, { w: 4, wt: 2.4, n: "40/20" }, { w: 7, wt: 2.8, n: "70/20" }];
  if (v === "mix2") return [{ w: 4, wt: 2.4, n: "40/20" }, { w: 4, wt: 2.4, n: "40/20" }, { w: 2, wt: 1.8, n: "20/20" }, { w: 2, wt: 1.8, n: "20/20" }, { w: 7, wt: 2.8, n: "70/20" }];
  return [{ w: 10, wt: 4.5, n: "100/20" }];
}

type FieldWidth = { name: string; net: number; isShort: boolean; count: number; totalW: number; nShadeSets?: number; shadeCutLen?: number };

/** אגד חזותי ליד התרשים — חתך פאה חיצונית לפי סוג מסגרת (כמו בהדמיה) */
function frameProfileLegendSvg(frameType: string, strokeHex: string, L: number, _W: number): string {
  const x = L + 14;
  const y = 12;
  const bw = 16;
  const bh = 44;
  let ribs = "";
  if (frameType === "doubleT") {
    ribs = `<line x1="${x + 2.5}" y1="${y + 13}" x2="${x + bw - 2.5}" y2="${y + 13}" stroke="${strokeHex}" stroke-width="1.4" stroke-linecap="round" opacity="0.95"/>
<line x1="${x + 2.5}" y1="${y + 31}" x2="${x + bw - 2.5}" y2="${y + 31}" stroke="${strokeHex}" stroke-width="1.4" stroke-linecap="round" opacity="0.95"/>`;
  } else if (frameType === "doubleTHiTech140" || frameType === "doubleTHiTech120") {
    ribs = `<line x1="${x + 2.5}" y1="${y + 10}" x2="${x + bw - 2.5}" y2="${y + 10}" stroke="${strokeHex}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>
<line x1="${x + 2.5}" y1="${y + 22}" x2="${x + bw - 2.5}" y2="${y + 22}" stroke="${strokeHex}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>
<line x1="${x + 2.5}" y1="${y + 34}" x2="${x + bw - 2.5}" y2="${y + 34}" stroke="${strokeHex}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>`;
  }
  return `<g aria-label="frame-profile-legend">
<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#475569" font-weight="bold">חתך מסגרת</text>
<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#f8fafc" stroke="${strokeHex}" stroke-width="2" rx="1.5"/>
${ribs}
</g>`;
}

function generateSketch(
  L: number,
  W: number,
  isL: boolean,
  lW: number,
  lD: number,
  lSide: string,
  cutDivider: number,
  dividerPositions: number[],
  fieldWidths: FieldWidth[],
  shadingP: string,
  spacingCm: number,
  frameColorHex: string,
  shadeColorHex: string,
  frameType: string
): string {
  const lW_val = isL ? lW : 0;
  const lD_val = isL ? lD : 0;
  const isLLeft = lSide === "left";
  let pts = `0,0 ${L},0 ${L},${W} 0,${W}`;
  if (isL) {
    if (isLLeft) pts = `0,${lD_val} ${lW_val},${lD_val} ${lW_val},0 ${L},0 ${L},${W} 0,${W} 0,${lD_val}`;
    else pts = `0,0 ${L - lW_val},0 ${L - lW_val},${lD_val} ${L},${lD_val} ${L},${W} 0,${W}`;
  }
  const fSize = Math.max(L, W) * 0.04;
  const divStrokeW = Math.max(L / 150, 2);
  let dividersSvg = "";
  let innerTextSvg = "";
  dividerPositions.forEach((x) => {
    const isShort = isL ? (isLLeft ? x < lW_val - 0.1 : x > L - lW_val + 0.1) : false;
    const yStart = isShort ? lD_val : 0;
    const divLen = isShort ? (cutDivider - lD_val).toFixed(1) : cutDivider.toFixed(1);
    const yMid = isShort ? lD_val + (W - lD_val) / 2 : W / 2;
    dividersSvg += `<line x1="${x}" y1="${yStart}" x2="${x}" y2="${W}" stroke="${frameColorHex}" stroke-width="${divStrokeW}" />`;
    innerTextSvg += `<text x="${x}" y="${yMid}" transform="rotate(-90 ${x},${yMid})" text-anchor="middle" font-size="${fSize * 0.85}" fill="#b91c1c" font-weight="bold" dy="-${fSize * 0.4}">חציץ: ${divLen}</text>`;
  });
  if (shadingP !== "none") {
    const allEdges = [0, ...dividerPositions, L];
    for (let i = 0; i < allEdges.length - 1; i++) {
      const xStart = allEdges[i];
      const xEnd = allEdges[i + 1];
      const xCenter = (xStart + xEnd) / 2;
      const isShort = isL ? (isLLeft ? xCenter < lW_val : xCenter > L - lW_val) : false;
      const fw = fieldWidths.find((f) => f.isShort === isShort);
      if (fw && fw.shadeCutLen !== undefined) {
        const yMid = isShort ? lD_val + (W - lD_val) / 2 : W / 2;
        const qtyText = shadingP === "mix" ? `${fw.nShadeSets} סטים` : `${fw.nShadeSets} יח'`;
        innerTextSvg += `<text x="${xCenter}" y="${yMid - fSize * 1.1}" text-anchor="middle" font-size="${fSize * 0.75}" fill="${frameColorHex}" font-weight="bold">שבלונה נטו: ${fw.net.toFixed(1)}</text><text x="${xCenter}" y="${yMid - fSize * 0.2}" text-anchor="middle" font-size="${fSize * 0.95}" fill="#1d4ed8" font-weight="bold">חיתוך: ${fw.shadeCutLen.toFixed(1)}</text><text x="${xCenter}" y="${yMid + fSize * 0.8}" text-anchor="middle" font-size="${fSize * 0.95}" fill="#1d4ed8" font-weight="bold">${qtyText}</text>`;
      }
    }
  }
  const stepY = Math.max(1, spacingCm) || 2;
  const patternH = Math.max(stepY * 2, L / 20);
  const shadingPattern = shadingP !== "none" ? `<defs><pattern id="shading" width="${L / 40}" height="${patternH}" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="${L / 40}" y2="0" stroke="${shadeColorHex}" stroke-width="${Math.max(L / 300, 1)}" opacity="0.6"/></pattern></defs>` : "";
  const fillAttr = shadingP !== "none" ? "url(#shading)" : "#f8fafc";
  let labelsSvg = "";
  if (isL) {
    if (isLLeft) labelsSvg = `<text x="-5" y="${lD_val + (W - lD_val) / 2}" transform="rotate(-90 -5,${lD_val + (W - lD_val) / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה קצרה: ${W - lD_val} ס"מ</text><text x="${L + 5}" y="${W / 2}" transform="rotate(90 ${L + 5},${W / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה ארוכה: ${W} ס"מ</text><text x="${lW_val + (L - lW_val) / 2}" y="-10" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">קיר ראשי: ${L - lW_val} ס"מ</text><text x="${lW_val - 5}" y="${lD_val / 2}" transform="rotate(-90 ${lW_val - 5},${lD_val / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c" dy="-5">עומק: ${lD_val}</text><text x="${lW_val / 2}" y="${lD_val - 5}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c">רוחב: ${lW_val}</text><text x="${L / 2}" y="${W + fSize * 1.2}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">חזית שלמה: ${L} ס"מ</text>`;
    else labelsSvg = `<text x="-5" y="${W / 2}" transform="rotate(-90 -5,${W / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה ארוכה: ${W} ס"מ</text><text x="${L + 5}" y="${lD_val + (W - lD_val) / 2}" transform="rotate(90 ${L + 5},${lD_val + (W - lD_val) / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה קצרה: ${W - lD_val} ס"מ</text><text x="${(L - lW_val) / 2}" y="-10" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">קיר ראשי: ${L - lW_val} ס"מ</text><text x="${L - lW_val + 5}" y="${lD_val / 2}" transform="rotate(90 ${L - lW_val + 5},${lD_val / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c" dy="-5">עומק: ${lD_val}</text><text x="${L - lW_val / 2}" y="${lD_val - 5}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c">רוחב: ${lW_val}</text><text x="${L / 2}" y="${W + fSize * 1.2}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">חזית שלמה: ${L} ס"מ</text>`;
  } else labelsSvg = `<text x="-5" y="${W / 2}" transform="rotate(-90 -5,${W / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה: ${W} ס"מ</text><text x="${L + 5}" y="${W / 2}" transform="rotate(90 ${L + 5},${W / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה: ${W} ס"מ</text><text x="${L / 2}" y="-10" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">קיר אחורי: ${L} ס"מ</text><text x="${L / 2}" y="${W + fSize * 1.2}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">חזית שלמה: ${L} ס"מ</text>`;
  const vbW = L + 115;
  const legendSvg = frameProfileLegendSvg(frameType, frameColorHex, L, W);
  return `<div class="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center relative" style="direction: ltr;"><div class="relative w-full max-w-2xl mx-auto flex justify-center mt-4 mb-2"><svg viewBox="-40 -30 ${vbW} ${W + 60}" style="max-height: 320px; width: 100%; overflow: visible;">${shadingPattern}<polygon points="${pts}" fill="${fillAttr}" stroke="${frameColorHex}" stroke-width="${Math.max(L / 100, 2)}" stroke-linejoin="round" />${dividersSvg}${innerTextSvg}${labelsSvg}${legendSvg}</svg></div></div>`;
}

const weightsMap: Record<string, { [k: number]: number }> = {
  doubleT: { 4.5: 11, 6: 14, 7: 16.5 },
  smooth120_frame: { 4.5: 9.5, 6: 12, 7: 14 },
  smooth120_div: { 6: 12 },
  smooth100_div: { 6: 10.5 },
  s20x40: { 6: 2.3 },
  s20x70: { 6: 2.8 },
  angle: { 6: 1.5 },
  post100: { 6: 12 },
  post130: { 6: 16 },
  post80: { 6: 11 },
};

// --- Pergola types (input) ---
type PergolaInput = {
  lengthWall?: string | number;
  exitWidth?: string | number;
  isLShape?: boolean;
  lWallWidth?: string | number;
  lWallDepth?: string | number;
  lShapeSide?: "right" | "left" | string;
  colorSelect?: string;
  shadeColorSelect?: string;
  frameType?: string;
  dividerSize?: string;
  dividerSmoothCount?: string | number;
  dividerLedCount?: string | number;
  shadingProfile?: string;
  spacing?: string | number;
  hasSantaf?: boolean;
  santafColor?: string;
  dripEdgeType?: string;
  hasLed?: boolean;
  ledCount?: string | number;
  ledColor?: string;
  hasFan?: boolean;
  fanCount?: string | number;
  postCount?: string | number;
  postHeight?: string;
  postType?: string;
  tensionerCount?: string | number;
  tensionerColor?: string;
  postCountFront?: string | number;
  postCountRight?: string | number;
  postCountLeft?: string | number;
  postCountBack?: string | number;
};

type PergolaSettings = {
  pricePerKg?: string | number;
  sellPricePerSqm?: string | number;
  sysInstallPriceSqm?: string | number;
  sysTransportPrice?: string | number;
  sysSantafPrice?: string | number;
  sysLedPrice?: string | number;
  sysScrewPrice?: string | number;
  sysDripEdgePrice?: string | number;
};

// --- Fence types ---
type FenceSegment = { L: number; H: number; P?: number };
type FenceInput = {
  segments?: FenceSegment[];
  fenceSlat?: string;
  fenceGap?: string | number;
  fenceInGround?: boolean;
  fenceColor?: string;
  fenceSlatColor?: string;
};

type FenceSettings = {
  pricePerKg?: string | number;
  sysFencePriceSqm?: string | number;
  sysFenceSetPrice?: string | number;
  sysJumboPrice?: string | number;
  sysInstallPriceSqm?: string | number;
  sysTransportPrice?: string | number;
};

function num(v: string | number | undefined, def: number): number {
  if (v === undefined || v === null) return def;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? def : n;
}

function str(v: string | number | undefined, def: string): string {
  if (v === undefined || v === null) return def;
  return String(v);
}

function bool(v: boolean | string | number | undefined, def: boolean): boolean {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return String(v).toLowerCase() === "true" || String(v) === "1";
}

function calcPergola(pergola: PergolaInput, settings?: PergolaSettings | null): {
  L: number;
  W: number;
  sqm: number;
  incVat: number;
  exVat: number;
  totalWeight: number;
  materialCost: number;
  installCost: number;
  installSqmText: string;
  profit: number;
  profitMargin: number;
  cuttingHtml: string;
  bomHtml: string;
  hardwareHtml: string;
  wasteHtml: string;
  wasteBadgeText: string;
  instructionsHtml: string;
  viewDimensions: string;
  viewColorDisplay: string;
  santafInfoHtml: string;
  autoDividerCount: number;
  autoSmoothBase: number;
  autoLedBase: number;
  frameColorText: string;
  shadeColorText: string;
  frameHex: string;
  shadeHex: string;
  santafHex: string;
  nDividersTotal: number;
} {
  const inputL = num(pergola.lengthWall, 0);
  const inputW = num(pergola.exitWidth, 0);
  const isLShape = bool(pergola.isLShape, false);
  const lW = isLShape ? num(pergola.lWallWidth, 0) : 0;
  const lD = isLShape ? num(pergola.lWallDepth, 0) : 0;
  const isLLeft = str(pergola.lShapeSide, "right") === "left";
  const L = isLShape ? inputL + lW : inputL;
  const W = inputW;
  const sqm = isLShape ? ((L * W) - lW * lD) / 10000 : (L * W) / 10000;
  const frameColorText = RAL_OPTIONS.includes(str(pergola.colorSelect, "")) ? str(pergola.colorSelect, "RAL 9016") : "כסף מטאלי (9006)";
  const shadeColorText = RAL_OPTIONS.includes(str(pergola.shadeColorSelect, "")) ? str(pergola.shadeColorSelect, "RAL 9016") : "כסף מטאלי (9006)";
  const frameType = str(pergola.frameType, "doubleT");
  const isDoubleT = frameType.startsWith("doubleT");
  let frameProfileName = "120/40 חלק";
  if (frameType === "doubleT") frameProfileName = "140/40 דאבל טי";
  else if (frameType === "doubleTHiTech140") frameProfileName = "140/40 דאבל טי הייטק";
  else if (frameType === "doubleTHiTech120") frameProfileName = "120/40 דאבל טי הייטק";
  const dividerSize = str(pergola.dividerSize, "120");
  const divSizeName = dividerSize === "100" ? "100/40" : "120/40";
  const space = num(pergola.spacing, 0);
  const priceKg = settings ? num(settings.pricePerKg, 26) : 26;
  const sellPriceSqm = settings ? num(settings.sellPricePerSqm, 950) : 950;
  const sysInstall = settings ? num(settings.sysInstallPriceSqm, 0) : 0;
  const sysTransport = settings ? num(settings.sysTransportPrice, 0) : 0;
  const sysSantaf = settings ? num(settings.sysSantafPrice, 73) : 73;
  const sysLed = settings ? num(settings.sysLedPrice, 22.5) : 22.5;
  const sysScrew = settings ? num(settings.sysScrewPrice, 100) : 100;
  const sysDrip = settings ? num(settings.sysDripEdgePrice, 45) : 45;
  const pFront = parseInt(String(pergola.postCountFront ?? ""), 10) || 0;
  const pRight = parseInt(String(pergola.postCountRight ?? ""), 10) || 0;
  const pLeft = parseInt(String(pergola.postCountLeft ?? ""), 10) || 0;
  const pBack = parseInt(String(pergola.postCountBack ?? ""), 10) || 0;
  const pCountSides = pFront + pRight + pLeft + pBack;
  const pCountLegacy = parseInt(String(pergola.postCount ?? ""), 10) || 0;
  const pCount = pCountSides > 0 ? pCountSides : pCountLegacy;
  const postHeightRaw = str(pergola.postHeight, "");
  const postHeights: number[] = postHeightRaw.trim() ? postHeightRaw.split(",").map((h) => parseFloat(h.trim())).filter((h) => !isNaN(h)) : [];
  while (postHeights.length < pCount) postHeights.push(0);
  const tCount = parseInt(String(pergola.tensionerCount ?? ""), 10) || 0;
  const cutL_Wall = isDoubleT ? (isLShape ? L - 3 : L - 6) : L;
  const cutFront = L;
  const sideLen = isDoubleT ? W + 3 : W;
  const cutDivider = W - (isDoubleT ? 11 : 8);
  const divThickness = 4;
  const frameDedHalf = isDoubleT ? 7 : 4;
  const frameDeduction = isDoubleT ? 14 : 8;
  const autoDividerCount = isLShape ? Math.max(1, Math.ceil(inputL / 120)) + Math.max(1, Math.ceil(lW / 120)) - 1 : (L > 0 ? Math.ceil(L / 120) - 1 : 0);
  const hasLed = bool(pergola.hasLed, false);
  const hasSantaf = bool(pergola.hasSantaf, false);
  const autoSmoothBase = hasLed ? 0 : autoDividerCount;
  const autoLedBase = hasLed ? autoDividerCount : 0;
  let countSmooth = str(pergola.dividerSmoothCount, "").trim() ? parseInt(String(pergola.dividerSmoothCount), 10) || 0 : autoSmoothBase;
  let countLed = str(pergola.dividerLedCount, "").trim() ? parseInt(String(pergola.dividerLedCount), 10) || 0 : autoLedBase;
  const nDividersTotal = countSmooth + countLed;
  const nFieldsTotal = nDividersTotal + 1;
  let dividerPositions: number[] = [];
  let fieldWidths: FieldWidth[] = [];
  let fullDividers = 0, shortDividers = 0;
  if (isLShape && L > 0) {
    let nFieldsProt = Math.max(1, Math.round(nFieldsTotal * (lW / L)));
    let nFieldsMain = Math.max(1, nFieldsTotal - nFieldsProt);
    if (nFieldsTotal < 2) { nFieldsProt = 1; nFieldsMain = 1; }
    const junctionX = isLLeft ? lW : inputL;
    const widthLeft = junctionX;
    const widthRight = L - junctionX;
    const nFieldsLeft = isLLeft ? nFieldsProt : nFieldsMain;
    const nFieldsRight = isLLeft ? nFieldsMain : nFieldsProt;
    const netLeft = (widthLeft - frameDedHalf - divThickness - (nFieldsLeft - 1) * divThickness) / nFieldsLeft;
    const netRight = (widthRight - frameDedHalf - divThickness - (nFieldsRight - 1) * divThickness) / nFieldsRight;
    // isShort חייב להתאים לאזור המגרעת בפועל:
    // בליטה שמאלית => האזור השמאלי קצר; בליטה ימנית => האזור הימני קצר.
    const leftIsShort = isLLeft;
    const rightIsShort = !isLLeft;
    fieldWidths.push({ name: isLLeft ? "בליטה" : "קיר ראשי", net: netLeft, isShort: leftIsShort, count: nFieldsLeft, totalW: widthLeft });
    fieldWidths.push({ name: isLLeft ? "קיר ראשי" : "בליטה", net: netRight, isShort: rightIsShort, count: nFieldsRight, totalW: widthRight });
    for (let i = 1; i < nFieldsLeft; i++) dividerPositions.push(i * (widthLeft / nFieldsLeft));
    dividerPositions.push(junctionX);
    for (let i = 1; i < nFieldsRight; i++) dividerPositions.push(junctionX + i * (widthRight / nFieldsRight));
  } else if (L > 0) {
    const net = (L - frameDeduction - (nFieldsTotal - 1) * divThickness) / nFieldsTotal;
    fieldWidths.push({ name: "כללי", net, isShort: false, count: nFieldsTotal, totalW: L });
    for (let i = 1; i < nFieldsTotal; i++) dividerPositions.push(i * (L / nFieldsTotal));
  }
  dividerPositions.forEach((x) => { if (isLShape && (isLLeft ? x < lW - 0.1 : x > inputL + 0.1)) shortDividers++; else fullDividers++; });
  let cuttingHtml = "";
  const wallDisplayName = isDoubleT ? "120/40 חלק (L קיר)" : frameProfileName;
  if (L > 0 && W > 0) {
    if (!isLShape) {
      cuttingHtml += `<tr><td class="p-2 border font-bold">${wallDisplayName}</td><td class="p-2 border">מסגרת קיר</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${cutL_Wall.toFixed(1)}</td></tr><tr><td class="p-2 border font-bold">${frameProfileName}</td><td class="p-2 border">חזית</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${cutFront.toFixed(1)}</td></tr><tr><td class="p-2 border font-bold">${frameProfileName}</td><td class="p-2 border">צדדים</td><td class="p-2 border text-center font-bold">X 2</td><td class="p-2 border text-center highlight">${sideLen.toFixed(1)}</td></tr>`;
    } else {
      cuttingHtml += `<tr><td class="p-2 border font-bold">${wallDisplayName}</td><td class="p-2 border">קיר ראשי</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${(cutL_Wall - lW).toFixed(1)}</td></tr><tr class="bg-orange-50"><td class="p-2 border font-bold">${wallDisplayName}</td><td class="p-2 border">מגרעת - עומק</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${lD.toFixed(1)}</td></tr><tr class="bg-orange-50"><td class="p-2 border font-bold">${wallDisplayName}</td><td class="p-2 border">מגרעת - רוחב</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${lW.toFixed(1)}</td></tr><tr><td class="p-2 border font-bold">${frameProfileName}</td><td class="p-2 border">חזית שלמה</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${cutFront.toFixed(1)}</td></tr><tr><td class="p-2 border font-bold">${frameProfileName}</td><td class="p-2 border">צד פנים קיר (צד ארוך)</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${sideLen.toFixed(1)}</td></tr><tr><td class="p-2 border font-bold">${frameProfileName}</td><td class="p-2 border">צד פנים חזית (צד קצר)</td><td class="p-2 border text-center font-bold">X 1</td><td class="p-2 border text-center highlight">${(sideLen - lD).toFixed(1)}</td></tr>`;
    }
    if (nDividersTotal > 0) {
      if (fullDividers > 0) cuttingHtml += `<tr><td class="p-2 border font-bold">${divSizeName}</td><td class="p-2 border">חציצים (אורך מלא)</td><td class="p-2 border text-center font-bold">X ${fullDividers}</td><td class="p-2 border text-center highlight">${cutDivider.toFixed(1)}</td></tr>`;
      if (shortDividers > 0) cuttingHtml += `<tr><td class="p-2 border font-bold">${divSizeName}</td><td class="p-2 border">חציצים (אזור מגרעת)</td><td class="p-2 border text-center font-bold">X ${shortDividers}</td><td class="p-2 border text-center highlight text-orange-600">${(cutDivider - lD).toFixed(1)}</td></tr>`;
    }
    if (fieldWidths.length > 0) {
      fieldWidths.forEach((fw) => {
        const divCutLen = isLShape ? (fw.isShort ? cutDivider - lD : cutDivider) : cutDivider;
        const angleLen = divCutLen - 1.5;
        const nAng = fw.count * 2;
        const sub = isLShape ? ` — ${fw.name}` : "";
        cuttingHtml += `<tr><td class="p-2 border font-bold">זווית 30/30</td><td class="p-2 border">תמיכה${sub}</td><td class="p-2 border text-center font-bold">X ${nAng}</td><td class="p-2 border text-center highlight">${angleLen.toFixed(1)}</td></tr>`;
      });
    } else {
      cuttingHtml += `<tr><td class="p-2 border font-bold">זווית 30/30</td><td class="p-2 border">תמיכה</td><td class="p-2 border text-center font-bold">X ${nFieldsTotal * 2}</td><td class="p-2 border text-center highlight">${(cutDivider - 1.5).toFixed(1)}</td></tr>`;
    }
    if (hasSantaf) {
      const prepDeduction = isDoubleT ? 10 : 4;
      if (isLShape) {
        // סנטף תמיד יוצא 15 ס"מ מעבר ליציאה
        const depthLong = (W - lD) + 15;
        const depthNotch = lD + 15;
        const countFull = Math.ceil(depthLong / 50);
        const cutFull = L - prepDeduction;
        const countShort = Math.ceil(depthNotch / 50);
        const cutShort = (L - lW) - prepDeduction;
        cuttingHtml += `<tr class="bg-green-50"><td class="p-2 border font-bold text-green-800">20/40 (הכנה לסנטף - ארוך)</td><td class="p-2 border text-green-700 text-xs">תשתית לאזור חזית מלא</td><td class="p-2 border text-center font-bold">X ${countFull}</td><td class="p-2 border text-center highlight">${cutFull.toFixed(1)}</td></tr><tr class="bg-green-50"><td class="p-2 border font-bold text-green-800">20/40 (הכנה לסנטף - קצר)</td><td class="p-2 border text-green-700 text-xs">תשתית לאזור המגרעת</td><td class="p-2 border text-center font-bold">X ${countShort}</td><td class="p-2 border text-center highlight">${cutShort.toFixed(1)}</td></tr>`;
      } else {
        // סנטף תמיד יוצא 15 ס"מ מעבר ליציאה
        const prepCount = Math.ceil((W + 15) / 50);
        const cutSantafPrep = L - prepDeduction;
        cuttingHtml += `<tr class="bg-green-50"><td class="p-2 border font-bold text-green-800">20/40 (הכנה לסנטף)</td><td class="p-2 border text-green-700 text-xs">תשתית לסנטף</td><td class="p-2 border text-center font-bold">X ${prepCount}</td><td class="p-2 border text-center highlight">${cutSantafPrep.toFixed(1)}</td></tr>`;
      }
    }
  }
  const postType = str(pergola.postType, "100");
  if (pCount > 0) {
    const heightCounts: Record<string, number> = {};
    postHeights.slice(0, pCount).forEach((h) => { heightCounts[String(h)] = (heightCounts[String(h)] || 0) + 1; });
    Object.entries(heightCounts).forEach(([hStr, count]) => {
      const hNum = parseFloat(hStr);
      const displayHeight = hNum > 0 ? hNum.toFixed(1) : "למידה בשטח";
      cuttingHtml += `<tr class="bg-slate-50"><td class="p-2 border font-bold">${postType}/${postType}</td><td class="p-2 border">עמודי תמיכה</td><td class="p-2 border text-center font-bold">X ${count}</td><td class="p-2 border text-center highlight">${displayHeight}</td></tr>`;
    });
  }
  let instructionsShades = "";
  const shadingP = str(pergola.shadingProfile, "20x40");
  if (shadingP !== "none" && cutDivider > 0 && fieldWidths.length > 0) {
    const profW = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
    const setW = shadingP === "mix" ? 7 + 4 + 4 + space * 3 : profW + space;
    fieldWidths.forEach((fw) => {
      const cutLen = fw.net > 1 ? fw.net - 1 : 0;
      (fw as FieldWidth & { shadeCutLen?: number }).shadeCutLen = cutLen;
      const fieldDepth = fw.isShort ? cutDivider - lD : cutDivider;
      (fw as FieldWidth & { nShadeSets?: number }).nShadeSets = Math.floor(fieldDepth / setW);
      const nSet = (fw as FieldWidth & { nShadeSets?: number }).nShadeSets ?? 0;
      const nameSuffix = isLShape ? ` (${fw.name})` : "";
      if (shadingP === "20x40") cuttingHtml += `<tr class="bg-blue-50"><td class="p-2 border font-bold text-blue-800">הצללה 20/40${nameSuffix}</td><td class="p-2 border text-blue-700 text-xs">שלבים</td><td class="p-2 border text-center font-bold">X ${nSet * fw.count}</td><td class="p-2 border text-center highlight">${cutLen.toFixed(1)}</td></tr>`;
      else if (shadingP === "20x70") cuttingHtml += `<tr class="bg-blue-50"><td class="p-2 border font-bold text-blue-800">הצללה 20/70${nameSuffix}</td><td class="p-2 border text-blue-700 text-xs">שלבים</td><td class="p-2 border text-center font-bold">X ${nSet * fw.count}</td><td class="p-2 border text-center highlight">${cutLen.toFixed(1)}</td></tr>`;
      else { cuttingHtml += `<tr class="bg-blue-50"><td class="p-2 border font-bold text-blue-800">הצללה 20/70${nameSuffix}</td><td class="p-2 border text-blue-700 text-xs">שלבים</td><td class="p-2 border text-center font-bold">X ${nSet * fw.count}</td><td class="p-2 border text-center highlight">${cutLen.toFixed(1)}</td></tr><tr class="bg-blue-50"><td class="p-2 border font-bold text-blue-800">הצללה 20/40${nameSuffix}</td><td class="p-2 border text-blue-700 text-xs">שלבים</td><td class="p-2 border text-center font-bold">X ${nSet * 2 * fw.count}</td><td class="p-2 border text-center highlight">${cutLen.toFixed(1)}</td></tr>`; }
      const txtSet = shadingP === "mix" ? "סטים" : "יח'";
      instructionsShades += `<div class="instruction-item text-indigo-800 font-bold bg-indigo-50 p-2 rounded border border-indigo-200 mt-1 mb-1 w-full">שדות <strong>${fw.name}</strong> (${fw.count}): שבלונה <span class="text-lg mx-1 text-indigo-900">${fw.net.toFixed(1)} ס"מ</span> | חיתוך <span class="text-lg mx-1 text-indigo-900">${cutLen.toFixed(1)} ס"מ</span> (${nSet} ${txtSet} לשדה).</div>`;
    });
  }
  const totalShadeProfiles = fieldWidths.reduce((acc, fw) => acc + ((fw as FieldWidth & { nShadeSets?: number }).nShadeSets ?? 0) * (shadingP === "mix" ? 3 : 1) * fw.count, 0);
  const screwsCount = totalShadeProfiles * 2;
  const uBracketCount = nDividersTotal * 2;
  const spiderCornerCount = isLShape ? 6 : 4;
  const anglesCount = nFieldsTotal * 2;
  const screwTotalCost = (screwsCount / 1000) * sysScrew;
  const tensionerColor = str(pergola.tensionerColor, "");
  let hardwareHtml = `<div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>ברגי מש"ד (להצללות):</span> <strong class="text-emerald-700 text-lg">${screwsCount} יח'</strong> <span class="text-xs text-gray-500">(₪${Math.round(screwTotalCost)})</span></div><div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>תושבת U (לבסיס):</span> <strong class="text-emerald-700 text-lg">${uBracketCount} יח'</strong></div><div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>פינות עכביש:</span> <strong class="text-emerald-700 text-lg">${spiderCornerCount} יח'</strong></div><div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>זוויות 30/30:</span> <strong class="text-emerald-700 text-lg">${anglesCount} יח'</strong></div>`;
  if (tCount > 0) hardwareHtml += `<div class="flex justify-between items-center bg-blue-50 border-blue-200 p-2 rounded border"><span>מותחנים (גוון ${tensionerColor || "-"}):</span> <strong class="text-blue-700 text-xl">${tCount} יח'</strong></div>`;
  const rawItems: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[] = [];
  const frameWts = isDoubleT ? weightsMap.doubleT : weightsMap.smooth120_frame;
  const wallWts = weightsMap.smooth120_frame;
  if (L > 0 && W > 0) {
    if (!isLShape) {
      rawItems.push({ name: wallDisplayName, color: frameColorText, ...optimizeCutting(cutL_Wall, 1, wallWts) });
      rawItems.push({ name: frameProfileName, color: frameColorText, ...optimizeCutting(cutFront, 1, frameWts) });
      rawItems.push({ name: frameProfileName, color: frameColorText, ...optimizeCutting(sideLen, 2, frameWts) });
    } else {
      const totalLWall = cutL_Wall - lW + lD + lW;
      rawItems.push({ name: wallDisplayName + " (ראשי+מגרעת)", color: frameColorText, ...optimizeCutting(totalLWall, 1, wallWts) });
      rawItems.push({ name: frameProfileName + " (חזית)", color: frameColorText, ...optimizeCutting(cutFront, 1, frameWts) });
      rawItems.push({ name: frameProfileName + " (צד מלא)", color: frameColorText, ...optimizeCutting(sideLen, 1, frameWts) });
      rawItems.push({ name: frameProfileName + " (צד קצר)", color: frameColorText, ...optimizeCutting(sideLen - lD, 1, frameWts) });
    }
    const divWeightKey = dividerSize === "100" ? weightsMap.smooth100_div : weightsMap.smooth120_div;
    const totalDivLength = fullDividers * cutDivider + shortDividers * (cutDivider - lD);
    if (totalDivLength > 0 && nDividersTotal > 0) {
      if (countSmooth > 0) rawItems.push({ name: `חציצים ${divSizeName} חלק`, color: frameColorText, ...optimizeCutting(totalDivLength / nDividersTotal, countSmooth, divWeightKey) });
      if (countLed > 0) rawItems.push({ name: `חציצים ${divSizeName} לד`, color: frameColorText, ...optimizeCutting(totalDivLength / nDividersTotal, countLed, divWeightKey) });
    }
    if (fieldWidths.length > 0) {
      fieldWidths.forEach((fw) => {
        const divCutLen = isLShape ? (fw.isShort ? cutDivider - lD : cutDivider) : cutDivider;
        const angleLen = divCutLen - 1.5;
        const nAng = fw.count * 2;
        const piece = optimizeCutting(angleLen, nAng, weightsMap.angle);
        if (piece.qty > 0) {
          rawItems.push({
            name: isLShape ? `זווית 30/30 (${fw.name})` : "זווית 30/30",
            color: frameColorText,
            ...piece,
          });
        }
      });
    } else {
      rawItems.push({ name: "זווית 30/30", color: frameColorText, ...optimizeCutting(cutDivider - 1.5, anglesCount, weightsMap.angle) });
    }
    if (hasSantaf && L > 0) {
      const prepDeduction = isDoubleT ? 10 : 4;
      if (isLShape) {
        const countFull = Math.ceil((W - lD) / 50);
        const cutFull = L - prepDeduction;
        rawItems.push({ name: "20/40 (הכנה לסנטף - ארוך)", color: frameColorText, ...optimizeCutting(cutFull, countFull, weightsMap.s20x40) });
        const countShort = Math.ceil(lD / 50);
        const cutShort = (L - lW) - prepDeduction;
        rawItems.push({ name: "20/40 (הכנה לסנטף - קצר)", color: frameColorText, ...optimizeCutting(cutShort, countShort, weightsMap.s20x40) });
      } else {
        const prepCount = Math.ceil(W / 50);
        const cutSantafPrep = L - prepDeduction;
        rawItems.push({ name: "20/40 (הכנה לסנטף)", color: frameColorText, ...optimizeCutting(cutSantafPrep, prepCount, weightsMap.s20x40) });
      }
    }
  }
  if (pCount > 0) {
    const actualHeights = postHeights.slice(0, pCount).map((h) => (h > 0 ? h : 300));
    actualHeights.sort((a, b) => b - a);
    const bars6m: number[] = [];
    let totalUsedLen = 0;
    actualHeights.forEach((h) => {
      totalUsedLen += h;
      let placed = false;
      for (let i = 0; i < bars6m.length; i++) {
        if (bars6m[i] >= h) { bars6m[i] -= h; placed = true; break; }
      }
      if (!placed) bars6m.push(600 - h);
    });
    const postWeightKg = weightsMap[`post${postType}`]?.[6] ?? 12;
    rawItems.push({ name: `עמוד ${postType}/${postType}`, color: frameColorText, qty: bars6m.length, barLen: 6, weight: bars6m.length * postWeightKg, usedLength: totalUsedLen });
  }
  if (shadingP !== "none" && fieldWidths.length > 0) {
    fieldWidths.forEach((fw) => {
      const nSet = (fw as FieldWidth & { nShadeSets?: number }).nShadeSets ?? 0;
      const cutLen = (fw as FieldWidth & { shadeCutLen?: number }).shadeCutLen ?? 0;
      const nameSuffix = isLShape ? ` (${fw.name})` : "";
      if (shadingP === "20x40" || shadingP === "mix") rawItems.push({ name: "הצללה 20/40" + nameSuffix, color: shadeColorText, ...optimizeCutting(cutLen, shadingP === "mix" ? nSet * 2 * fw.count : nSet * fw.count, weightsMap.s20x40) });
      if (shadingP === "20x70" || shadingP === "mix") rawItems.push({ name: "הצללה 20/70" + nameSuffix, color: shadeColorText, ...optimizeCutting(cutLen, shadingP === "mix" ? nSet * fw.count : nSet * fw.count, weightsMap.s20x70) });
    });
  }
  const consolidated: Record<string, { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }> = {};
  rawItems.forEach((item) => {
    if (item.qty <= 0) return;
    const key = `${item.name}-${item.color}-${item.barLen}`;
    if (!consolidated[key]) consolidated[key] = { ...item };
    else { consolidated[key].qty += item.qty; consolidated[key].weight += item.weight; consolidated[key].usedLength += item.usedLength; }
  });
  let bomTotalWeight = 0, bomTotalUsedWeight = 0, bomTotalCost = screwTotalCost;
  let bomHtml = "";
  let wasteHtml = "";
  Object.values(consolidated).forEach((i) => {
    bomTotalWeight += i.weight;
    bomTotalCost += i.weight * priceKg;
    const usedWeight = i.weight * (i.usedLength / (i.qty * i.barLen * 100));
    bomTotalUsedWeight += usedWeight;
    const totalBarLengthCm = i.qty * i.barLen * 100;
    const wasteMeters = (totalBarLengthCm - i.usedLength) / 100;
    bomHtml += `<tr><td class="font-bold">${i.name} <span class="text-[11px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-normal mr-1 border border-blue-200">${i.color}</span></td><td class="text-center font-bold text-blue-700">${i.qty}</td><td class="text-center">${i.barLen} מ'</td></tr>`;
    if (wasteMeters > 0) wasteHtml += `<tr class="hover:bg-red-50"><td class="font-bold">${i.name} <span class="text-[11px] text-slate-500 mr-1">(${i.color})</span></td><td class="text-center">${i.barLen} מ'</td><td class="font-bold text-red-600">${wasteMeters.toFixed(2)} מ'</td></tr>`;
  });
  if (screwsCount > 0) bomHtml += `<tr><td class="font-bold text-slate-800">ברגי מש"ד (להצללות)</td><td class="text-center font-bold text-blue-700">${screwsCount}</td><td class="text-center">יח'</td></tr>`;
  if (hasLed) bomTotalCost += countLed * (cutDivider / 100) * sysLed;
  const dripEdgeType = str(pergola.dripEdgeType, "wave2.5");
  const dripLength = dripEdgeType === "wave3.0" || dripEdgeType === "smooth3.0" ? 3 : 2.5;
  const dripUnits = Math.ceil((L / 100 + 1) / dripLength);
  const santafColor = str(pergola.santafColor, "שקוף");
  if (hasSantaf && L > 0 && W > 0) {
    // אורך לוח סנטף = יציאה (עומק) + 15 ס"מ. בצורת ר׳ יש שני עומקים (ארוך וקצר).
    if (isLShape) {
      const depthLongCm = W + 15;
      const depthShortCm = (W - lD) + 15;
      // כמות לוחות נקבעת לפי רוחב האזור:
      // קיר ראשי = inputL, מגרעת = lW (לפי הבקשה העסקית).
      const mainWidthCm = Math.max(0, inputL);
      const notchWidthCm = Math.max(0, lW);

      // כמות לוחות לפי אורך מקטע בס"מ (360 => 4, 530 => 6)
      const longBoards = mainWidthCm > 0 ? Math.ceil(mainWidthCm / 100) : 0;
      const shortBoards = notchWidthCm > 0 ? Math.ceil(notchWidthCm / 100) : 0;

      bomTotalCost +=
        longBoards * 1.045 * (depthLongCm / 100) * sysSantaf +
        shortBoards * 1.045 * (depthShortCm / 100) * sysSantaf +
        dripUnits * sysDrip;

      if (longBoards > 0) {
        bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם (קיר ראשי) <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${longBoards}</td><td class="text-center">${(depthLongCm / 100).toFixed(2)} מ'</td></tr>`;
      }
      if (shortBoards > 0) {
        bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם (מגרעת) <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${shortBoards}</td><td class="text-center">${(depthShortCm / 100).toFixed(2)} מ'</td></tr>`;
      }
      bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">אף מים</td><td class="text-center font-bold text-blue-700">${dripUnits}</td><td class="text-center">${dripLength} מ' ליח'</td></tr>`;
    } else {
      const numBoards = Math.ceil((L / 100) / 1.045) + 1;
      bomTotalCost += numBoards * 1.045 * ((W + 15) / 100) * sysSantaf + dripUnits * sysDrip;
      bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${numBoards}</td><td class="text-center">${((W + 15) / 100).toFixed(2)} מ'</td></tr><tr class="bg-green-50"><td class="font-bold text-green-800">אף מים</td><td class="text-center font-bold text-blue-700">${dripUnits}</td><td class="text-center">${dripLength} מ' ליח'</td></tr>`;
    }
  }
  if (wasteHtml === "") wasteHtml = "<tr><td colspan=\"3\" class=\"text-center text-slate-400 py-4\">אין שאריות נפל משמעותיות</td></tr>";
  const wasteWeight = bomTotalWeight - bomTotalUsedWeight;
  const wastePercent = bomTotalWeight > 0 ? ((wasteWeight / bomTotalWeight) * 100).toFixed(1) : "0";
  const installCost = sqm * sysInstall + sysTransport;
  const exVat = sqm * sellPriceSqm + installCost;
  const incVat = exVat * 1.18;
  const profit = exVat - bomTotalCost - installCost;
  let instructions = "";
  if (L > 0 && W > 0) {
    instructions += `<div class="instruction-item">ייצור מסגרת <strong>${frameProfileName}</strong>: חזית ${cutFront.toFixed(1)} ס"מ. <span class="text-red-600 font-bold underline">להוריד אוזניים לפרופיל ימין ושמאל - הורדה של 3 ס"מ.</span></div><div class="instruction-item text-blue-800">מרווח הצללה שנבחר: <strong>${space} ס"מ</strong>.</div>`;
    instructions += instructionsShades;
    if (isLShape) instructions += `<div class="instruction-item text-orange-700 font-bold">שים לב: מגרעת פינתית בקיר בצד <u>${isLLeft ? "שמאל" : "ימין"}</u> במידות ${lW}x${lD} ס"מ. קיר ראשי: ${inputL} ס"מ.</div>`;
    if (countSmooth > 0) instructions += `<div class="instruction-item">חיתוך והתקנת <strong>${countSmooth} חציצים חלקים</strong> (${divSizeName}).</div>`;
    if (countLed > 0) instructions += `<div class="instruction-item text-yellow-700 font-bold">חיתוך והתקנת <strong>${countLed} חציצי לד</strong> (${divSizeName}).</div>`;
    if (hasSantaf) {
      if (isLShape) {
        const depthLong = (W - lD) + 15;
        const depthNotch = lD + 15;
        const countFull = Math.ceil(depthLong / 50);
        const countShort = Math.ceil(depthNotch / 50);
        instructions += `<div class="instruction-item text-green-800 font-bold">הכנה לסנטף: יש לחתוך <strong>${countFull} פרופילי 20/40 ארוכים</strong> ועוד <strong>${countShort} קצרים</strong>, ולהניח כל 50 ס"מ.</div>`;
      } else {
        const prepCount = Math.ceil((W + 15) / 50);
        instructions += `<div class="instruction-item text-green-800 font-bold">הכנה לסנטף: יש לחתוך <strong>${prepCount} פרופילי 20/40</strong>, ולהניח מעל השדות כל 50 ס"מ.</div>`;
      }
    }
  }
  const ledColor = str(pergola.ledColor, "לבן חם");
  if (hasLed) instructions += `<div class="instruction-item text-blue-700 font-bold">הכנת ${countLed} פסי לד (${ledColor}).</div>`;
  const fanCount = str(pergola.fanCount, "");
  if (bool(pergola.hasFan, false) && parseInt(fanCount, 10) > 0) instructions += `<div class="instruction-item text-cyan-800 font-bold">הכנה למאווררים: <strong>${fanCount} יח'</strong> (יש לוודא תשתית).</div>`;
  if (pCount > 0) { const heightsList = postHeights.slice(0, pCount).map((h) => (h > 0 ? `${h} ס"מ` : "מידה בשטח")).join(", "); instructions += `<div class="instruction-item text-gray-800 font-bold">התקנת <strong>${pCount} עמודי תמיכה</strong> מסוג ${postType}/${postType} (גבהים: ${heightsList}).</div>`; }
  if (tCount > 0) instructions += `<div class="instruction-item text-blue-800 font-bold">התקנת <strong>${tCount} מותחנים</strong> (גוון ${tensionerColor}).</div>`;
  if (L > 0 && W > 0) {
    const sketchFrameHex = "#000000";
    const sketchShadeHex = "#94a3b8";
    instructions += generateSketch(L, W, isLShape, lW, lD, str(pergola.lShapeSide, "right"), cutDivider, dividerPositions, fieldWidths, shadingP, space, sketchFrameHex, sketchShadeHex, frameType);
  }
  const viewDimensions = isLShape ? `חזית כוללת ${L}x${W} (מגרעת ${isLLeft ? "שמאלית" : "ימין"} ${lW}x${lD})` : `${L} x ${W} ס"מ`;
  const viewColorDisplay = `מסגרת: ${frameColorText} | הצללה: ${shadeColorText}`;
  const santafInfoHtml =
    hasSantaf && L > 0
      ? (() => {
          if (!isLShape) {
            return `<strong class="text-base">מפרט טכני קירוי:</strong><br>• לוחות סנטף (${santafColor}): ${Math.ceil((L / 100) / 1.045) + 1} יח'<br>• אף מים: ${dripUnits} יח'`;
          }
          const mainWidthCm = Math.max(0, inputL);
          const notchWidthCm = Math.max(0, lW);
          const longBoards = mainWidthCm > 0 ? Math.ceil(mainWidthCm / 100) : 0;
          const shortBoards = notchWidthCm > 0 ? Math.ceil(notchWidthCm / 100) : 0;
          return `<strong class="text-base">מפרט טכני קירוי:</strong><br>• לוחות סנטף (${santafColor}) קיר ראשי: ${longBoards} יח'<br>• לוחות סנטף (${santafColor}) מגרעת: ${shortBoards} יח'<br>• אף מים: ${dripUnits} יח'`;
        })()
      : "";
  const frameHex = getColorHex(frameColorText);
  const shadeHex = getColorHex(shadeColorText);
  const santafHex = getColorHex(santafColor);
  return {
    L, W, sqm, incVat, exVat, totalWeight: bomTotalWeight, materialCost: bomTotalCost, installCost, installSqmText: sqm > 0 ? `${sqm.toFixed(1)} מ"ר לפי ${sysInstall}₪` + (sysTransport > 0 ? ` + ${sysTransport}₪ הובלה` : "") : "",
    profit, profitMargin: exVat > 0 ? Math.round((profit / exVat) * 100) : 0, cuttingHtml, bomHtml, hardwareHtml, wasteHtml,
    wasteBadgeText: `${wasteWeight.toFixed(1)} ק"ג (${wastePercent}%)`, instructionsHtml: instructions, viewDimensions, viewColorDisplay, santafInfoHtml,
    autoDividerCount, autoSmoothBase, autoLedBase,
    frameColorText, shadeColorText, frameHex, shadeHex, santafHex, nDividersTotal,
  };
}

function fenceSlatDisplayLabels(slatT: string): { slatProfileLabel: string; slatLabel: string } {
  const slatProfileLabel =
    slatT === "100"
      ? "100/20"
      : slatT === "70"
        ? "70/20"
        : slatT === "40"
          ? "40/20"
          : slatT === "20"
            ? "20/20"
            : slatT === "mix1"
              ? "40/20+70/20"
              : slatT === "mix2"
                ? "40/20+20/20+70/20"
                : slatT || "-";
  const slatLabel =
    slatT === "100"
      ? "רק 100/20"
      : slatT === "70"
        ? "רק 70/20"
        : slatT === "40"
          ? "רק 40/20"
          : slatT === "20"
            ? "רק 20/20"
            : slatT === "mix1"
              ? "מיקס: 2x40 ואז 1x70"
              : slatT === "mix2"
                ? "מיקס: 2x40, 2x20, 1x70"
                : "-";
  return { slatProfileLabel, slatLabel };
}

function calcFence(fence: FenceInput, settings?: FenceSettings | null): {
  sqm: number;
  weight: number;
  wasteKg: number;
  wastePercent: number;
  cost: number;
  profit: number;
  sellExVat: number;
  sellIncVat: number;
  cuttingHtml: string;
  bomHtml: string;
  hardwareHtml: string;
  instructionsHtml: string;
  frameHex: string;
  slatHex: string;
  spacerHex: string;
  slatProfileLabel: string;
  slatLabel: string;
  installExVat: number;
  transportExVat: number;
  basicQuoteExVat: number;
  vatAmount: number;
} {
  const gap = num(fence.fenceGap, 2);
  const slatT = str(fence.fenceSlat, "100");
  const isGr = bool(fence.fenceInGround, false);
  const pCol = RAL_OPTIONS.includes(str(fence.fenceColor, "")) ? str(fence.fenceColor, "RAL 9016") : "לבן (9016)";
  const sCol = RAL_OPTIONS.includes(str(fence.fenceSlatColor, "")) ? str(fence.fenceSlatColor, "RAL 9016") : "לבן (9016)";
  const { slatProfileLabel, slatLabel } = fenceSlatDisplayLabels(slatT);
  const frameHex = getColorHex(pCol);
  const slatHex = getColorHex(sCol);
  const spacerHex = frameHex;

  const segs = (fence.segments ?? []).filter((s) => s.L > 0 && s.H > 0 && (s.P ?? 0) >= 0);
  if (segs.length === 0) {
    return {
      sqm: 0,
      weight: 0,
      wasteKg: 0,
      wastePercent: 0,
      cost: 0,
      profit: 0,
      sellExVat: 0,
      sellIncVat: 0,
      cuttingHtml: "",
      bomHtml: "",
      hardwareHtml: "",
      instructionsHtml: "",
      frameHex,
      slatHex,
      spacerHex,
      slatProfileLabel,
      slatLabel,
      installExVat: 0,
      transportExVat: 0,
      basicQuoteExVat: 0,
      vatAmount: 0,
    };
  }
  const pat = getPatFence(slatT);
  const POST_WIDTH_CM = 3.5;
  const gCuts: Record<string, { n: string; l: number; q: number; w: number; c: string }> = {};
  const addC = (n: string, l: number, q: number, w: number, c: string) => { const k = n + "_" + l.toFixed(1) + "_" + c; if (!gCuts[k]) gCuts[k] = { n, l, q, w, c }; else gCuts[k].q += q; };
  let totS = 0, totP = 0;
  const insParts: string[] = [];
  segs.forEach((s, i) => {
    const pVal = typeof s.P === "number" ? s.P : 0;
    totS += (s.L * s.H) / 10000;
    totP += pVal;
    const secs = Math.max(0, pVal - 1);
    const inL = secs > 0 ? (s.L - pVal * POST_WIDTH_CM) / secs : 0; // אורך מורידים (עמוד×3.5 ס"מ), מחלקים במספר השדות
    const slCut = inL - 1;
    const pCut = isGr ? s.H + 40 : s.H - 1.5;
    const netH = s.H - 1.5;
    let cH = 0;
    let pIdx = 0;
    const sCnts: Record<string, number> = {};
    let totSInS = 0;
    while (true) {
      const pi = pat[pIdx % pat.length];
      if (cH + pi.w > netH) break;
      sCnts[pi.n] = (sCnts[pi.n] || 0) + 1;
      totSInS++;
      cH += pi.w + gap;
      pIdx++;
    }
    addC("עמוד גדר", pCut, pVal, 13.5, pCol);
    addC("ספייסר ארוך (כיסוי עמוד)", pCut, Math.max(0, (pVal - 2) * 1 + 4), 1.5, pCol);
    if (secs > 0) {
      let sSp = 0;
      Object.keys(sCnts).forEach((n) => {
        const q = sCnts[n] * secs;
        addC(`מילוי ${n}`, slCut, q, pat.find((x) => x.n === n)!.wt, sCol);
        sSp += q * 2;
      });
      addC("ספייסר קצר (מרווח)", gap, sSp, 1.5, sCol);
    }
    const slatsDetail = Object.keys(sCnts).map((n) => `${sCnts[n]} יח' ${n}`).join(", ");
    insParts.push(`<div class="mb-4 pb-2 border-b"><strong class="text-blue-800">מקטע ${i + 1}: אורך ${s.L}, גובה ${s.H}</strong><div class="text-sm mt-1">חולק ל-${secs} שדות (${pVal} עמודים). חיתוך שלבים: <span class="font-bold text-blue-600">${slCut.toFixed(1)}</span> ס"מ. ברוטו עמוד: ${pCut.toFixed(1)} ס"מ.<br><span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded mt-1 inline-block">בכל שדה: ${slatsDetail} (סה"כ ${totSInS} שלבים לשדה).</span></div></div>`);
  });
  let cutStr = "";
  const raw: { n: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[] = [];
  const pKg = settings ? num(settings.pricePerKg, 35) : 35;
  Object.values(gCuts).forEach((c) => {
    cutStr += `<tr><td class="p-2 border font-bold">${c.n} <span class="text-[10px] text-slate-500 mr-1">(${c.c})</span></td><td class="p-2 border text-center font-bold text-blue-600">X ${c.q}</td><td class="p-2 border text-center font-black">${c.l.toFixed(1)}</td></tr>`;
    const r = optimizeCutting(c.l, c.q, { 6: c.w });
    raw.push({ n: c.n.includes("ספייסר") ? "פרופיל ספייסר" : c.n.includes("עמוד") ? "עמוד גדר" : c.n.split(" ")[0] + " " + c.n.split(" ")[1], color: c.c, ...r });
  });
  const bom: Record<string, { n: string; c: string; q: number; u: number; t: number }> = {};
  let bU = 0, bT = 0, bC = 0;
  raw.forEach((i) => {
    if (i.qty <= 0) return;
    const k = i.n + "_" + i.color;
    if (!bom[k]) bom[k] = { n: i.n, c: i.color, q: 0, u: 0, t: 0 };
    bom[k].q += i.qty;
    bom[k].u += (i.usedLength / 100) * (i.weight / i.qty / i.barLen);
    bom[k].t += i.weight;
  });
  let bomStr = "";
  Object.keys(bom).forEach((k) => { bU += bom[k].u; bT += bom[k].t; bC += bom[k].t * pKg; bomStr += `<tr><td class="p-2 border font-bold">${bom[k].n} <span class="text-[11px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-normal mr-1 border border-blue-200">${bom[k].c}</span></td><td class="p-2 border text-center font-black text-blue-600">${bom[k].q}</td></tr>`; });
  const fSetP = settings ? num(settings.sysFenceSetPrice, 50) : 50;
  const jumP = settings ? num(settings.sysJumboPrice, 1) : 1;
  bC += totP * fSetP + (!isGr ? totP * 4 * jumP : 0);
  const fSqmP = settings ? num(settings.sysFencePriceSqm, 650) : 650;
  const iSqmP = settings ? num(settings.sysInstallPriceSqm, 0) : 0;
  const trP = settings ? num(settings.sysTransportPrice, 0) : 0;
  const exV = totS * fSqmP + (iSqmP > 0 ? totS * iSqmP : 0) + trP;
  const installExVat = iSqmP > 0 ? totS * iSqmP : 0;
  const transportExVat = trP;
  const basicQuoteExVat = Math.max(0, exV - installExVat - transportExVat);
  const vatAmount = exV * 0.18;
  const hardwareHtml = `<div class="flex justify-between border-b pb-2"><span class="font-bold">סט עמוד (בסיס, רוזטה, קאפ):</span><strong class="text-blue-600">${totP} סטים</strong></div>${!isGr ? `<div class="flex justify-between pt-2"><span class="font-bold">ג'מבואים (4 לעמוד):</span><strong class="text-blue-600">${totP * 4} יח'</strong></div>` : "<div class=\"pt-2\">שתילה באדמה</div>"}`;
  return {
    sqm: totS, weight: bT, wasteKg: bT - bU, wastePercent: bT > 0 ? (bT - bU) / bT * 100 : 0, cost: bC, profit: exV - bC, sellExVat: exV, sellIncVat: exV * 1.18,
    cuttingHtml: cutStr, bomHtml: bomStr, hardwareHtml, instructionsHtml: insParts.join(""),
    frameHex, slatHex, spacerHex, slatProfileLabel, slatLabel,
    installExVat, transportExVat, basicQuoteExVat, vatAmount,
  };
}

type Body = {
  type: "pergola" | "fence";
  pergola?: PergolaInput;
  fence?: FenceInput;
  settings?: PergolaSettings | FenceSettings;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { type, pergola, fence, settings } = body;
    if (process.env.NODE_ENV !== "production") {
      console.log("[api/calculate] Received:", type, type === "pergola" ? { keys: pergola ? Object.keys(pergola) : [], lengthWall: pergola?.lengthWall, exitWidth: pergola?.exitWidth } : { segments: fence?.segments?.length });
    }
    if (type === "pergola") {
      const result = calcPergola(pergola ?? {}, settings as PergolaSettings | undefined);
      return NextResponse.json({ pergola: result });
    }
    if (type === "fence") {
      const result = calcFence(fence ?? {}, settings as FenceSettings | undefined);
      return NextResponse.json({ fence: result });
    }
    return NextResponse.json({ message: "Invalid type: expected 'pergola' or 'fence'" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Calculation failed";
    console.error("[api/calculate] Error:", message, e);
    return NextResponse.json({ message }, { status: 400 });
  }
}
