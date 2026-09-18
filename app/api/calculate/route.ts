import { NextResponse } from "next/server";
import {
  addPiecesToNestGroup,
  buildCutRowHtml,
  buildShadeSlatPlanHtml,
  flushNestGroupsToItems,
  pushNestedBarParts,
  SHARED_NEST_BAR_LABEL,
  type NestPieceGroup,
  type ShadeSlatPlanItem,
} from "@/lib/pergola-cutting-plan";
import { profileNameWithIconHtml } from "@/lib/profile-icons";
import { DEFAULT_VAT_DECIMAL, parseVatRateDecimalFromApiInput } from "@/lib/vat";

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
  if (h.includes("שקוף")) return "#7ec8e3";
  if (h.includes("כחול")) return "#3b82c4";
  if (h.includes("אפור")) return "#475569";
  if (h.includes("חום")) return "#78350f";
  if (h.includes("דמוי עץ") || h.includes("עץ")) return "#b45309";
  return "#888888";
}

function getPatFence(v: string): { w: number; wt: number; n: string }[] {
  if (v === "100") return [{ w: 10, wt: 4.5, n: "100/20" }];
  if (v === "70") return [{ w: 7, wt: 2.8, n: "70/20" }];
  if (v === "40") return [{ w: 4, wt: 2.4, n: "40/20" }];
  if (v === "20") return [{ w: 2, wt: 1.8, n: "20/20" }];
  // זיגזג אטום 120/20 — רוחב פנים 12 ס״מ, 5.6 ק״ג למוט 6 מ׳
  if (v === "zigzag") return [{ w: 12, wt: 5.6, n: "זיגזג אטום 120/20" }];
  if (v === "mix1") return [{ w: 4, wt: 2.4, n: "40/20" }, { w: 4, wt: 2.4, n: "40/20" }, { w: 7, wt: 2.8, n: "70/20" }];
  if (v === "mix2") return [{ w: 4, wt: 2.4, n: "40/20" }, { w: 4, wt: 2.4, n: "40/20" }, { w: 2, wt: 1.8, n: "20/20" }, { w: 2, wt: 1.8, n: "20/20" }, { w: 7, wt: 2.8, n: "70/20" }];
  return [{ w: 10, wt: 4.5, n: "100/20" }];
}

type FieldWidth = {
  name: string;
  net: number;
  isShort: boolean;
  count: number;
  totalW: number;
  nShadeSets?: number;
  shadeCutLen?: number;
  /** U-shape: מיקום לאורך החזית (למספור שדות) */
  xStart?: number;
  xEnd?: number;
  fieldNum?: number;
};

type PartitionFieldDetail = {
  index: number;
  xStart: number;
  xEnd: number;
  net: number;
  shadeCutLen: number;
  nShadeSets: number;
  isShort: boolean;
  zoneName: string;
};

function fieldsPerZoneWidth(widthCm: number): number {
  return Math.max(1, Math.ceil(widthCm / 120));
}

/** חלוקת שדות ל-U: כל אזור (כנף שמאל / מגרעת / כנף ימין) מחולק לפי רוחבו */
function resolveUShapeZoneCounts(
  wingWallLeft: number,
  lW: number,
  wingWallRight: number,
  nFieldsTotal: number
): { nLeft: number; nCenter: number; nRight: number } {
  const idealLeft = fieldsPerZoneWidth(wingWallLeft);
  const idealCenter = fieldsPerZoneWidth(lW);
  const idealRight = fieldsPerZoneWidth(wingWallRight);
  let nLeft = idealLeft;
  let nCenter = idealCenter;
  let nRight = idealRight;
  while (nLeft + nCenter + nRight > nFieldsTotal) {
    if (nLeft >= nCenter && nLeft >= nRight && nLeft > 1) nLeft--;
    else if (nRight >= nCenter && nRight >= nLeft && nRight > 1) nRight--;
    else if (nCenter > 1) nCenter--;
    else break;
  }
  while (nLeft + nCenter + nRight < nFieldsTotal) {
    if (idealCenter >= idealLeft && idealCenter >= idealRight) nCenter++;
    else if (idealLeft >= idealRight) nLeft++;
    else nRight++;
  }
  return { nLeft, nCenter, nRight };
}

function buildPartitionFieldDetails(
  dividerPositions: number[],
  fieldWidths: FieldWidth[],
  L: number,
  classifyShort: (xCenter: number) => boolean,
  matchFieldWidth?: (xCenter: number, isShort: boolean) => FieldWidth | undefined
): PartitionFieldDetail[] {
  const allEdges = [0, ...dividerPositions, L];
  const out: PartitionFieldDetail[] = [];
  for (let i = 0; i < allEdges.length - 1; i++) {
    const xStart = allEdges[i];
    const xEnd = allEdges[i + 1];
    const xCenter = (xStart + xEnd) / 2;
    const isShort = classifyShort(xCenter);
    const fw = matchFieldWidth
      ? matchFieldWidth(xCenter, isShort)
      : fieldWidths.find((f) => f.isShort === isShort);
    const net = fw?.net ?? xEnd - xStart;
    out.push({
      index: i + 1,
      xStart,
      xEnd,
      net,
      shadeCutLen: fw?.shadeCutLen ?? Math.max(0, net - 1),
      nShadeSets: fw?.nShadeSets ?? 0,
      isShort,
      zoneName: fw?.name ?? "",
    });
  }
  return out;
}

/** כיתוב שדות בטבלת חיתוך — "שדות 8, 7, 6" במקום שורה לכל שדה */
function formatFieldsCutNote(fieldNames: string[]): string {
  const cleaned = fieldNames.filter(Boolean);
  if (cleaned.length === 0) return "";
  const nums = cleaned.map((n) => {
    const m = /^שדה\s+(\d+)$/.exec(n.trim());
    return m ? m[1] : null;
  });
  if (nums.every((x) => x != null)) {
    const sorted = [...nums].sort((a, b) => Number(a) - Number(b));
    return sorted.length === 1 ? `שדה ${sorted[0]}` : `שדות ${sorted.join(", ")}`;
  }
  if (cleaned.length === 1) return cleaned[0];
  return cleaned.join(" · ");
}

type CutLenFieldBucket = { qty: number; fields: string[] };

function addToCutLenBucket(
  map: Map<number, CutLenFieldBucket>,
  cutLen: number,
  qty: number,
  fieldName: string
): void {
  if (!(qty > 0) || !(cutLen > 0)) return;
  const key = Math.round(cutLen * 10) / 10;
  const b = map.get(key) || { qty: 0, fields: [] };
  b.qty += qty;
  if (fieldName && !b.fields.includes(fieldName)) b.fields.push(fieldName);
  map.set(key, b);
}

/** U-shape: מספור שדות מימין לשמאל — שדה 1 בימין, שדה 2 משמאלו וכו' */
function renumberUShapeFieldsRtl(
  grouped: FieldWidth[],
  dividerPositions: number[],
  L: number,
  wingWallLeft: number,
  lW: number
): FieldWidth[] {
  const junctionMid = wingWallLeft + lW / 2;
  const classifyShort = (xCenter: number) => isUShapeShortFieldX(xCenter, wingWallLeft, lW);
  const matchFieldWidth = (xCenter: number, isShort: boolean) => {
    if (!isShort) {
      return xCenter < junctionMid
        ? grouped.find((f) => f.name === "כנף שמאל")
        : grouped.find((f) => f.name === "כנף ימין");
    }
    if (grouped.some((f) => f.name === "מגרעת שמאל")) {
      return xCenter < junctionMid
        ? grouped.find((f) => f.name === "מגרעת שמאל")
        : grouped.find((f) => f.name === "מגרעת ימין");
    }
    return grouped.find((f) => f.name === "מגרעת מרכז");
  };
  const details = buildPartitionFieldDetails(dividerPositions, grouped, L, classifyShort, matchFieldWidth);
  const n = details.length;
  return details.map((fd, i) => {
    const num = n - i;
    return {
      name: `שדה ${num}`,
      net: fd.net,
      isShort: fd.isShort,
      count: 1,
      totalW: fd.xEnd - fd.xStart,
      xStart: fd.xStart,
      xEnd: fd.xEnd,
      fieldNum: num,
    };
  });
}

function uFieldExitDepthFor(
  fw: FieldWidth,
  junctionLeft: number,
  junctionRight: number,
  centerW: number,
  wingExtLeft: number,
  wingExtRight: number
): number {
  if (fw.xStart !== undefined && fw.xEnd !== undefined) {
    return uExitDepthAt((fw.xStart + fw.xEnd) / 2, junctionLeft, junctionRight, centerW, wingExtLeft, wingExtRight);
  }
  return uFieldExitDepth(fw.name, centerW, wingExtLeft, wingExtRight);
}

function matchFieldWidthAtX(fieldWidths: FieldWidth[], xCenter: number): FieldWidth | undefined {
  return fieldWidths.find(
    (fw) => fw.xStart !== undefined && fw.xEnd !== undefined && xCenter >= fw.xStart - 0.1 && xCenter <= fw.xEnd + 0.1
  );
}

function partitionFieldLabelsSvg(
  fieldDetails: PartitionFieldDetail[],
  W: number,
  fSize: number,
  frameColorHex: string,
  shadingP: string,
  exitDepthAt?: (x: number) => number,
  sketchDepthH?: number
): string {
  if (fieldDetails.length === 0 || shadingP === "none") return "";
  const fs = Math.max(7, Math.min(fSize * 0.62, (fieldDetails[0] ? (fieldDetails[0].xEnd - fieldDetails[0].xStart) : 100) * 0.18));
  const lineH = fs * 1.12;
  let svg = "";
  fieldDetails.forEach((fd) => {
    const xCenter = (fd.xStart + fd.xEnd) / 2;
    const exitD = exitDepthAt ? exitDepthAt(xCenter) : W;
    const yMid = sketchDepthH !== undefined ? sketchDepthH - exitD * 0.58 : exitD * 0.58;
    const nSets = fd.nShadeSets ?? 0;
    if (nSets <= 0) return;
    const qtyText =
      shadingP === "mix"
        ? `${nSets} יח' 20/70 · ${nSets * 2} יח' 20/40`
        : `${nSets} יח'`;
    const fieldTitle = fd.zoneName.startsWith("שדה") ? fd.zoneName : "";
    const lines: string[] = [];
    if (fieldTitle) lines.push(fieldTitle);
    lines.push(`נטו ${fd.net.toFixed(1)} | חיתוך ${fd.shadeCutLen.toFixed(1)}`);
    lines.push(qtyText);
    const pillW = Math.max(...lines.map((l) => l.length)) * fs * 0.52 + 10;
    const pillH = lineH * lines.length + 6;
    const pillY = yMid - pillH / 2;
    svg += `<rect x="${xCenter - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" fill="#ffffff" fill-opacity="0.94" stroke="#cbd5e1" stroke-width="0.7" rx="4" />`;
    lines.forEach((line, li) => {
      const fill = li === 0 ? "#1e293b" : li === 1 ? "#1d4ed8" : frameColorHex;
      const weight = li === 0 ? "bold" : "bold";
      svg += `<text x="${xCenter}" y="${pillY + fs + li * lineH}" text-anchor="middle" font-size="${li === 0 ? fs * 0.92 : fs * 0.78}" fill="${fill}" font-weight="${weight}" font-family="system-ui,sans-serif">${line}</text>`;
    });
  });
  return svg;
}

function sketchDimCm(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ס"מ`;
}

function sketchDimPill(x: number, y: number, text: string, fs: number, fill = "#334155", bg = "#ffffff"): string {
  const padX = 4;
  const padY = 3;
  const w = Math.max(text.length * fs * 0.52 + padX * 2, fs * 2.4);
  const h = fs + padY * 2;
  return `<rect x="${x - w / 2}" y="${y - padY}" width="${w}" height="${h}" fill="${bg}" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="0.7" rx="4" /><text x="${x}" y="${y + fs * 0.78}" text-anchor="middle" font-size="${fs}" fill="${fill}" font-weight="bold" font-family="system-ui,sans-serif">${text}</text>`;
}

/** תווית אורך חציץ — צמוד לקו, לאורך, עם הדגשה לקריאות */
function sketchDividerLenLabel(
  x: number,
  yStart: number,
  yEnd: number,
  divLen: string,
  fs: number,
  sketchL: number,
  opts?: { minFs?: number; yFrac?: number; side?: "left" | "right" }
): string {
  const minFs = opts?.minFs ?? 14;
  const yFrac = opts?.yFrac ?? 0.5;
  const span = Math.max(yEnd - yStart, 1);
  const yMid = yStart + span * yFrac;
  const f = Math.max(minFs, fs);
  const offset = Math.max(f * 0.9, 9);
  const labelX =
    opts?.side === "right" ? x + offset : opts?.side === "left" ? x - offset : x >= sketchL / 2 ? x + offset : x - offset;
  return `<text x="${labelX}" y="${yMid}" transform="rotate(-90 ${labelX},${yMid})" text-anchor="middle" font-size="${f}" fill="#b91c1c" font-weight="bold" font-family="system-ui,sans-serif" stroke="#ffffff" stroke-width="4" paint-order="stroke fill">${divLen}</text>`;
}

/** תווית מידה חיצונית — רקע לבן, בלי חפיפה */
function sketchEdgeLabelPill(
  x: number,
  y: number,
  text: string,
  fs: number,
  fill = "#334155"
): string {
  const padX = 7;
  const padY = 5;
  const f = Math.max(12, fs);
  const w = Math.max(text.length * f * 0.54 + padX * 2, f * 2.8);
  const h = f + padY * 2;
  const x0 = x - w / 2;
  const y0 = y - padY;
  return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff" fill-opacity="0.98" stroke="#94a3b8" stroke-width="1" rx="5" /><text x="${x}" y="${y0 + f + 1}" text-anchor="middle" font-size="${f}" fill="${fill}" font-weight="bold" font-family="system-ui,sans-serif">${text}</text>`;
}

type SketchFieldBadge = {
  rtlIndex: number;
  xStart: number;
  xEnd: number;
  cutLen: number;
  badgeY: number;
  nShadeSets?: number;
};

/** כרטיס מידע בתוך עמודת שדה — רוחב מוגבל לשדה בלבד */
function sketchFieldCardFs(segW: number, maxFs: number): number {
  return Math.max(9.5, Math.min(maxFs, segW * 0.26));
}

function sketchFieldInnerCard(
  xStart: number,
  xEnd: number,
  lines: { text: string; fill: string }[],
  centerY: number,
  maxFs: number
): string {
  if (lines.length === 0) return "";
  const xC = (xStart + xEnd) / 2;
  const segW = xEnd - xStart;
  const margin = 4;
  const maxW = Math.max(segW - margin * 2, 16);
  let fs = sketchFieldCardFs(segW, maxFs);
  const textW = (text: string) => text.length * fs * 0.54;
  while (fs > 8.5 && lines.some((l) => textW(l.text) > maxW)) fs -= 0.4;
  const lineH = fs * 1.32;
  const padY = 6;
  const padX = 5;
  const w = Math.min(maxW, Math.max(...lines.map((l) => textW(l.text))) + padX * 2);
  const h = lines.length * lineH + padY * 2;
  const y0 = centerY - h / 2;
  const x0 = xC - w / 2;
  let svg = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff" fill-opacity="0.98" stroke="#94a3b8" stroke-width="1" rx="5" />`;
  lines.forEach((line, i) => {
    svg += `<text x="${xC}" y="${y0 + padY + fs + i * lineH}" text-anchor="middle" font-size="${fs}" fill="${line.fill}" font-weight="bold" font-family="system-ui,sans-serif">${line.text}</text>`;
  });
  return svg;
}

function trapFieldDepthAtCenter(fd: TrapezoidFieldDetail): number {
  const span = fd.xEnd - fd.xStart;
  if (span < 1e-6) return fd.divLenLeft;
  return fd.divLenLeft + 0.5 * (fd.divLenRight - fd.divLenLeft);
}

/** תוויות שדה בטרפז — חיתוך + כמות/פרופיל בתוך כל עמודה */
function sketchTrapezoidFieldsSvg(
  fields: TrapezoidFieldDetail[],
  nFields: number,
  shadingP: string,
  fSize: number
): string {
  let svg = "";
  fields.forEach((fd, i) => {
    const rtlIndex = fd.index || nFields - i;
    const segW = fd.xEnd - fd.xStart;
    if (segW < 18) return;
    const depth = trapFieldDepthAtCenter(fd);
    const segFs = sketchFieldCardFs(segW, Math.max(11, fSize * 0.68));
    const xC = (fd.xStart + fd.xEnd) / 2;
    if (shadingP !== "none") svg += sketchTrapezoidFieldCards(fd, shadingP, depth * 0.36, segFs);
    const badgeY = depth * 0.78;
    const badgeR = Math.max(segFs * 0.55, 9);
    svg += `<circle cx="${xC}" cy="${badgeY}" r="${badgeR}" fill="#1e293b" />`;
    svg += `<text x="${xC}" y="${badgeY}" dy="0.35em" text-anchor="middle" font-size="${badgeR * 1.05}" fill="#ffffff" font-weight="bold" font-family="system-ui,sans-serif">${rtlIndex}</text>`;
  });
  return svg;
}

function sketchFieldCountHeaderSvg(L: number, nFields: number, fSize: number, y?: number): string {
  if (nFields <= 0) return "";
  const fs = Math.max(11, fSize * 0.9);
  const yPos = y ?? -(fs * 2.9);
  return `<text x="${L / 2}" y="${yPos}" text-anchor="middle" font-size="${fs}" fill="#1e293b" font-weight="bold" font-family="system-ui,sans-serif">${nFields} שדות</text>`;
}

function sketchShadeFieldStackHeight(segW: number, maxFs: number, shadingP: string, nPieces: number): number {
  if (shadingP === "none") return 0;
  const fs = sketchFieldCardFs(segW, maxFs);
  const between = Math.max(8, fs * 0.55);
  const specH = sketchFieldCardHeight(2, fs);
  if (nPieces <= 0 && shadingP !== "mix") return specH;
  const qtyLines = shadingP === "mix" ? 2 : 1;
  return specH + between + sketchFieldCardHeight(qtyLines, fs);
}

function sketchFieldBadgesSvg(fields: SketchFieldBadge[], shadingP: string, fSize: number): string {
  if (fields.length === 0) return "";
  const badgeR = Math.max(fSize * 0.52, 10);
  const cardGap = Math.max(10, badgeR * 0.55);
  let svg = "";
  fields.forEach((fd) => {
    const xC = (fd.xStart + fd.xEnd) / 2;
    const segW = fd.xEnd - fd.xStart;
    if (segW < badgeR * 1.8) return;
    const cardFs = sketchFieldCardFs(segW, Math.max(12, fSize * 0.82));
    if (shadingP !== "none" && fd.cutLen > 0) {
      const stackH = sketchShadeFieldStackHeight(segW, Math.max(12, fSize * 0.82), shadingP, fd.nShadeSets ?? 0);
      const stackBottom = fd.badgeY - badgeR - cardGap;
      const cardCenterY = stackBottom - stackH / 2;
      svg += sketchRegularShadeFieldCards(
        fd.xStart,
        fd.xEnd,
        fd.cutLen,
        fd.nShadeSets ?? 0,
        shadingP,
        cardCenterY,
        cardFs
      );
    }
    svg += `<circle cx="${xC}" cy="${fd.badgeY}" r="${badgeR}" fill="#1e293b" />`;
    svg += `<text x="${xC}" y="${fd.badgeY}" dy="0.35em" text-anchor="middle" font-size="${badgeR * 1.05}" fill="#ffffff" font-weight="bold" font-family="system-ui,sans-serif">${fd.rtlIndex}</text>`;
  });
  return svg;
}

function shadingProfileSketchLabel(shadingP: string): string {
  if (shadingP === "20x70") return "20/70";
  if (shadingP === "20x40") return "20/40";
  if (shadingP === "mix") return "משולב";
  return "";
}

function mixShadeRowUnits(nRows: number): { qty70: number; qty40: number } {
  const rows = Math.max(0, nRows);
  return { qty70: rows, qty40: rows * 2 };
}

/** תווית כמות למשולב: הפרדה ל-20/70 ול-20/40 (בלי «סטים») */
function mixShadeQtyPlain(nRows: number): string {
  const { qty70, qty40 } = mixShadeRowUnits(nRows);
  if (nRows <= 0) return "—";
  return `${qty70} יח' 20/70 · ${qty40} יח' 20/40`;
}

function mixShadeQtyHtml(nRows: number): string {
  const { qty70, qty40 } = mixShadeRowUnits(nRows);
  if (nRows <= 0) return '<span class="text-slate-400">—</span>';
  return `<span class="text-blue-800 font-bold">${qty70} יח' 20/70</span><span class="text-slate-400 mx-1">·</span><span class="text-blue-800 font-bold">${qty40} יח' 20/40</span>`;
}

function mixShadeQtyTableCells(nRows: number): string {
  const { qty70, qty40 } = mixShadeRowUnits(nRows);
  if (nRows <= 0) {
    return `<td class="py-2 px-2 text-center text-slate-400">—</td><td class="py-2 px-2 text-center text-slate-400">—</td>`;
  }
  return `<td class="py-2 px-2 text-center font-black text-blue-800 text-base">${qty70} <span class="text-xs font-bold text-slate-600">יח'</span></td><td class="py-2 px-2 text-center font-black text-blue-800 text-base">${qty40} <span class="text-xs font-bold text-slate-600">יח'</span></td>`;
}

function sketchShadeSpecText(profile: string, cutLen: number): string {
  const len = Math.abs(cutLen - Math.round(cutLen)) < 0.05 ? String(Math.round(cutLen)) : cutLen.toFixed(1);
  return `הצללה ${profile} מידה ${len}`;
}

function sketchShadeSpecLines(profile: string, cutLen: number): { text: string; fill: string }[] {
  const len = Math.abs(cutLen - Math.round(cutLen)) < 0.05 ? String(Math.round(cutLen)) : cutLen.toFixed(1);
  return [
    { text: `הצללה ${profile}`, fill: "#1e40af" },
    { text: `מידה ${len}`, fill: "#1d4ed8" },
  ];
}

function sketchFieldCardHeight(lineCount: number, fs: number): number {
  const lineH = fs * 1.32;
  const padY = 6;
  return lineCount * lineH + padY * 2;
}

/** שני כרטיסים נפרדים בשדה: למעלה מפרט הצללה, למטה כמות יח' */
function sketchFieldDualShadeCards(
  xStart: number,
  xEnd: number,
  specLines: { text: string; fill: string }[],
  qtyLines: { text: string; fill: string }[],
  centerY: number,
  maxFs: number
): string {
  if (specLines.length === 0 && qtyLines.length === 0) return "";
  const segW = xEnd - xStart;
  const fs = sketchFieldCardFs(segW, maxFs);
  const between = Math.max(8, fs * 0.55);
  let svg = "";
  if (specLines.length > 0 && qtyLines.length > 0) {
    const specH = sketchFieldCardHeight(specLines.length, fs);
    const qtyH = sketchFieldCardHeight(qtyLines.length, fs);
    const specCenterY = centerY - (qtyH / 2 + between / 2 + specH / 2);
    const qtyCenterY = centerY + (specH / 2 + between / 2 + qtyH / 2);
    svg += sketchFieldInnerCard(xStart, xEnd, specLines, specCenterY, maxFs);
    svg += sketchFieldInnerCard(xStart, xEnd, qtyLines, qtyCenterY, maxFs);
  } else if (specLines.length > 0) {
    svg += sketchFieldInnerCard(xStart, xEnd, specLines, centerY, maxFs);
  } else {
    svg += sketchFieldInnerCard(xStart, xEnd, qtyLines, centerY, maxFs);
  }
  return svg;
}

function sketchRegularShadeFieldCards(
  xStart: number,
  xEnd: number,
  cutLen: number,
  nPieces: number,
  shadingP: string,
  centerY: number,
  fs: number
): string {
  if (shadingP === "none" || cutLen <= 0) return "";
  if (shadingP === "mix") {
    const spec = sketchShadeSpecLines("משולב", cutLen);
    const qty =
      nPieces > 0
        ? [
            { text: `${nPieces} יח' 20/70`, fill: "#1d4ed8" },
            { text: `${nPieces * 2} יח' 20/40`, fill: "#1d4ed8" },
          ]
        : [];
    return sketchFieldDualShadeCards(xStart, xEnd, spec, qty, centerY, fs);
  }
  const profile = shadingProfileSketchLabel(shadingP);
  if (!profile) return "";
  const spec = sketchShadeSpecLines(profile, cutLen);
  const qty = nPieces > 0 ? [{ text: `${nPieces} יח'`, fill: "#1d4ed8" }] : [];
  return sketchFieldDualShadeCards(xStart, xEnd, spec, qty, centerY, fs);
}

function sketchTrapezoidFieldCards(
  fd: TrapezoidFieldDetail,
  shadingP: string,
  centerY: number,
  fs: number
): string {
  if (shadingP === "none") return "";
  const cutLen = fd.fullSlatLen > 0 ? fd.fullSlatLen : Math.max(0, fd.fieldNet - 1);
  const profile = shadingProfileSketchLabel(shadingP);
  const shortTotal = fd.shortSlats.reduce((s, x) => s + x.count, 0);
  const segW = fd.xEnd - fd.xStart;
  const cardFs = sketchFieldCardFs(segW, fs);
  const between = Math.max(8, cardFs * 0.55);
  const blocks: { lines: { text: string; fill: string }[]; linesCount: number }[] = [];
  if (fd.fullSlatCount > 0 && profile && cutLen > 0) {
    if (shadingP === "mix") {
      blocks.push({ lines: sketchShadeSpecLines("משולב", cutLen), linesCount: 2 });
      blocks.push({
        lines: [
          { text: `${fd.fullSlatCount} יח' 20/70`, fill: "#1d4ed8" },
          { text: `${fd.fullSlatCount * 2} יח' 20/40`, fill: "#1d4ed8" },
        ],
        linesCount: 2,
      });
    } else {
      blocks.push({ lines: sketchShadeSpecLines(profile, cutLen), linesCount: 2 });
      blocks.push({ lines: [{ text: `${fd.fullSlatCount} יח'`, fill: "#1d4ed8" }], linesCount: 1 });
    }
  }
  if (shortTotal > 0) {
    if (shadingP === "mix") {
      blocks.push({
        lines: [
          { text: `${shortTotal} מקוצרים 20/70`, fill: "#dc2626" },
          { text: `${shortTotal * 2} מקוצרים 20/40`, fill: "#dc2626" },
        ],
        linesCount: 2,
      });
    } else {
      blocks.push({ lines: [{ text: `${shortTotal} מקוצרים`, fill: "#dc2626" }], linesCount: 1 });
    }
  }
  if (blocks.length === 0) return "";
  const heights = blocks.map((b) => sketchFieldCardHeight(b.linesCount, cardFs));
  const totalH = heights.reduce((a, h) => a + h, 0) + between * (blocks.length - 1);
  let yTop = centerY - totalH / 2;
  let svg = "";
  blocks.forEach((block, i) => {
    const h = heights[i];
    const blockCenterY = yTop + h / 2;
    svg += sketchFieldInnerCard(fd.xStart, fd.xEnd, block.lines, blockCenterY, fs);
    yTop += h + between;
  });
  return svg;
}

function uDividerSketchSpan(
  x: number,
  junction1: number,
  junction2: number,
  W: number,
  uDL: number,
  uDR: number,
  H: number,
  grungY: number,
  divDedSketch: number
): { yStart: number; yEnd: number; divLen: number; isJunction: boolean; inNotch: boolean } {
  const tol = 1.5;
  const atJ1 = Math.abs(x - junction1) <= tol;
  const atJ2 = Math.abs(x - junction2) <= tol;
  const inNotch = x > junction1 + tol && x < junction2 - tol;
  const centerDivLen = W - divDedSketch;
  if (atJ1 || atJ2) {
    // פינות מגרעת — חציץ נעצר בגרונג (אורך מרכז), לא עומק כנף מלא
    return { yStart: grungY, yEnd: H, divLen: centerDivLen, isJunction: true, inNotch: false };
  }
  if (inNotch) {
    return { yStart: grungY, yEnd: H, divLen: centerDivLen, isJunction: false, inNotch: true };
  }
  const exitD = uExitDepthAt(x, junction1, junction2, W, uDL, uDR);
  return { yStart: H - exitD, yEnd: H, divLen: exitD - divDedSketch, isJunction: false, inNotch: false };
}

function sketchHDimLabel(x1: number, x2: number, y: number, text: string, fSize: number, color: string, above: boolean): string {
  const mx = (x1 + x2) / 2;
  const fs = Math.max(10, fSize * 0.82);
  const dy = above ? -fs * 2.4 : fs * 2.6;
  return sketchEdgeLabelPill(mx, y + dy, text, fs, color);
}

function sketchVDimLabel(x: number, y1: number, y2: number, text: string, fSize: number, color: string, outsideLeft: boolean): string {
  const my = (y1 + y2) / 2;
  const fs = Math.max(12, fSize * 0.9);
  const xPos = outsideLeft ? x - fs * 5 : x + fs * 5;
  const rot = outsideLeft ? -90 : 90;
  const f = Math.max(12, fs);
  return `<text x="${xPos}" y="${my}" transform="rotate(${rot} ${xPos},${my})" text-anchor="middle" font-size="${f}" fill="${color}" font-weight="bold" font-family="system-ui,sans-serif" stroke="#ffffff" stroke-width="4" paint-order="stroke fill">${text}</text>`;
}

/** מידות חיצוניות לטרפז — תוויות קצרות עם ריווח, בלי חפיפה */
function trapezoidEdgeLabelsSvg(
  L: number,
  yL: number,
  yR: number,
  sketchH: number,
  m: TrapezoidMetrics,
  fSize: number
): string {
  const fs = Math.max(11, Math.min(14, fSize * 0.72));
  let s = "";
  s += sketchEdgeLabelPill(L / 2, -fs * 2.5, `קיר ${sketchDimCm(L)}`, fs);
  s += sketchEdgeLabelPill(L / 2, sketchH + fs * 2.6, `חזית ${sketchDimCm(m.frontLength)}`, fs);
  const lx = -fs * 5.5;
  s += sketchEdgeLabelPill(lx, yL * 0.3, sketchDimCm(yL), fs);
  s += sketchEdgeLabelPill(lx, yL * 0.72, `גרונג ${m.sideCutAngleLeft.toFixed(0)}°`, fs * 0.92, "#64748b");
  const rx = L + fs * 5.5;
  s += sketchEdgeLabelPill(rx, yR * 0.3, sketchDimCm(yR), fs);
  s += sketchEdgeLabelPill(rx, yR * 0.72, `גרונג ${m.sideCutAngleRight.toFixed(0)}°`, fs * 0.92, "#64748b");
  return s;
}

function uShapeSketchDepthMax(centerW: number, wingExtLeft: number, wingExtRight: number): number {
  return Math.max(centerW + wingExtLeft, centerW + wingExtRight, centerW);
}

/** מידות חיצוניות בלבד — בלי טקסט בתוך השדות */
function uShapeEdgeLabelsSvg(
  L: number,
  centerW: number,
  lW: number,
  extLeft: number,
  extRight: number,
  wingLeft: number,
  wingRight: number,
  fSize: number
): string {
  const Wl = centerW + extLeft;
  const Wr = centerW + extRight;
  const jr = wingLeft + lW;
  const H = uShapeSketchDepthMax(centerW, extLeft, extRight);
  const grungY = H - centerW;
  const topY = Math.min(H - Wl, H - Wr, grungY);
  const fs = Math.max(13, Math.min(15, fSize * 0.88));
  const wall = "#334155";
  const notch = "#ea580c";
  let s = "";
  s += sketchEdgeLabelPill(L / 2, H + fs * 2.8, `חזית ${sketchDimCm(L)}`, fs);
  s += sketchVDimLabel(-8, H - Wl, H, sketchDimCm(Wl), fs, wall, true);
  s += sketchVDimLabel(L + 8, H - Wr, H, sketchDimCm(Wr), fs, wall, false);
  const ty = topY - fs * 3;
  s += sketchEdgeLabelPill(wingLeft / 2, ty, sketchDimCm(wingLeft), fs, wall);
  s += sketchEdgeLabelPill(wingLeft + lW / 2, ty, `מגרעת ${sketchDimCm(lW)}`, fs, notch);
  s += sketchEdgeLabelPill(jr + wingRight / 2, ty, sketchDimCm(wingRight), fs, wall);
  if (extLeft > 0) s += sketchVDimLabel(wingLeft, H - Wl, grungY, sketchDimCm(extLeft), fs, notch, true);
  if (extRight > 0) s += sketchVDimLabel(jr, H - Wr, grungY, sketchDimCm(extRight), fs, notch, false);
  s += sketchEdgeLabelPill(wingLeft + lW / 2, grungY + fs * 1.1, `מרכז ${sketchDimCm(centerW)}`, fs * 0.95, notch);
  return s;
}

function lShapeJunctionX(isLLeft: boolean, lW: number, inputL: number): number {
  return isLLeft ? lW : inputL;
}

/** חציץ במגרעת או בפינת המגרעת (גבול בין בליטה לקיר ראשי) — אורך קצר */
function lShapeDividerIsShort(x: number, isLLeft: boolean, lW: number, inputL: number): boolean {
  const junction = lShapeJunctionX(isLLeft, lW, inputL);
  if (Math.abs(x - junction) <= 0.5) return true;
  return isLLeft ? x < lW - 0.1 : x > inputL + 0.1;
}

/** מידות על כל צלע — ר' פינה */
function lShapeEdgeLabelsSvg(
  L: number,
  W: number,
  lW: number,
  lD: number,
  isLLeft: boolean,
  fSize: number
): string {
  const wall = "#334155";
  const notch = "#ea580c";
  let s = "";
  if (isLLeft) {
    s += sketchHDimLabel(lW, L, 0, sketchDimCm(L - lW), fSize, wall, true);
    s += sketchHDimLabel(0, lW, lD, sketchDimCm(lW), fSize, notch, false);
    s += sketchVDimLabel(lW, 0, lD, sketchDimCm(lD), fSize, notch, false);
    s += sketchVDimLabel(0, lD, W, sketchDimCm(W - lD), fSize, wall, true);
    s += sketchVDimLabel(L, 0, W, sketchDimCm(W), fSize, wall, false);
    s += sketchHDimLabel(0, L, W, sketchDimCm(L), fSize, wall, false);
  } else {
    s += sketchHDimLabel(0, L - lW, 0, sketchDimCm(L - lW), fSize, wall, true);
    s += sketchHDimLabel(L - lW, L, lD, sketchDimCm(lW), fSize, notch, false);
    s += sketchVDimLabel(L - lW, 0, lD, sketchDimCm(lD), fSize, notch, true);
    s += sketchVDimLabel(L, lD, W, sketchDimCm(W - lD), fSize, wall, false);
    s += sketchVDimLabel(0, 0, W, sketchDimCm(W), fSize, wall, true);
    s += sketchHDimLabel(0, L, W, sketchDimCm(L), fSize, wall, false);
  }
  return s;
}

/** אגד חזותי ליד התרשים — חתך פאה חיצונית לפי סוג מסגרת (כמו בהדמיה) */
function frameProfileLegendSvg(frameType: string, strokeHex: string, L: number, _W: number): string {
  const x = L + 14;
  const y = 12;
  const bw = 16;
  const bh = 44;
  let ribs = "";
  let flange = "";
  if (frameType === "doubleT") {
    ribs = `<line x1="${x + 2.5}" y1="${y + 13}" x2="${x + bw - 2.5}" y2="${y + 13}" stroke="${strokeHex}" stroke-width="1.4" stroke-linecap="round" opacity="0.95"/>
<line x1="${x + 2.5}" y1="${y + 31}" x2="${x + bw - 2.5}" y2="${y + 31}" stroke="${strokeHex}" stroke-width="1.4" stroke-linecap="round" opacity="0.95"/>`;
  } else if (frameType === "doubleTHiTech140" || frameType === "doubleTHiTech120") {
    ribs = `<line x1="${x + 2.5}" y1="${y + 10}" x2="${x + bw - 2.5}" y2="${y + 10}" stroke="${strokeHex}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>
<line x1="${x + 2.5}" y1="${y + 22}" x2="${x + bw - 2.5}" y2="${y + 22}" stroke="${strokeHex}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>
<line x1="${x + 2.5}" y1="${y + 34}" x2="${x + bw - 2.5}" y2="${y + 34}" stroke="${strokeHex}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>`;
  } else if (frameType === "smooth") {
    // חלק — כמו L קיר: גוף + כנף אחת למטה (לא חציץ עם שתי כנפיים)
    flange = `<path d="M${x + bw} ${y + bh - 2} h12" stroke="${strokeHex}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
  }
  return `<g aria-label="frame-profile-legend">
<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#475569" font-weight="bold">חתך מסגרת</text>
<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#f8fafc" stroke="${strokeHex}" stroke-width="2" rx="1.5"/>
${ribs}${flange}
</g>`;
}

type TrapezoidMetrics = {
  frontLength: number;
  skewDeg: number;
  /** גרונג בקצה שמאל/ימין של פרופיל החזית */
  cutAngleLeft: number;
  cutAngleRight: number;
  /** גרונג בקצה החזיתי של פרופיל הצד (משלים ל-90° עם החזית) */
  sideCutAngleLeft: number;
  sideCutAngleRight: number;
};

type TrapezoidSketchOpts = {
  yL: number;
  yR: number;
  metrics: TrapezoidMetrics;
  cutDividerAt: (x: number) => number;
  fieldDetails: TrapezoidFieldDetail[];
};

function trapezoidSvgLabelPill(x: number, y: number, text: string, fs: number, fill = "#334155", bg = "#ffffff"): string {
  const padX = 3;
  const padY = 2;
  const w = Math.max(text.length * fs * 0.52 + padX * 2, fs * 2.2);
  const h = fs + padY * 2;
  return `<rect x="${x - w / 2}" y="${y - padY}" width="${w}" height="${h}" fill="${bg}" fill-opacity="0.93" stroke="#cbd5e1" stroke-width="0.6" rx="3" /><text x="${x}" y="${y + fs * 0.78}" text-anchor="middle" font-size="${fs}" fill="${fill}" font-weight="bold" font-family="system-ui,sans-serif">${text}</text>`;
}

function trapezoidFieldShadeCountSvg(fd: TrapezoidFieldDetail, fs: number, topY: number): string {
  const xCenter = (fd.xStart + fd.xEnd) / 2;
  const shortTotal = fd.shortSlats.reduce((s, x) => s + x.count, 0);
  let line1 = "";
  let line2 = "";
  if (fd.fullSlatCount > 0 && shortTotal > 0) {
    line1 = `${fd.fullSlatCount} רגילים`;
    line2 = `${shortTotal} מקוצרים`;
  } else if (fd.fullSlatCount > 0) {
    line1 = `${fd.fullSlatCount} רגילים`;
  } else if (shortTotal > 0) {
    line1 = `${shortTotal} מקוצרים`;
  } else if (fd.totalSlats > 0) {
    line1 = `${fd.totalSlats} שלבים`;
  } else {
    return "";
  }
  if (line2) {
    const lineH = fs * 1.15;
    const w = Math.max(line1.length, line2.length) * fs * 0.52 + 6;
    const h = lineH * 2 + 4;
    const y0 = topY;
    return `<rect x="${xCenter - w / 2}" y="${y0}" width="${w}" height="${h}" fill="#ffffff" fill-opacity="0.93" stroke="#cbd5e1" stroke-width="0.6" rx="3" /><text x="${xCenter}" y="${y0 + fs + 2}" text-anchor="middle" font-size="${fs}" fill="#1d4ed8" font-weight="bold" font-family="system-ui,sans-serif">${line1}</text><text x="${xCenter}" y="${y0 + fs + 2 + lineH}" text-anchor="middle" font-size="${fs}" fill="#dc2626" font-weight="bold" font-family="system-ui,sans-serif">${line2}</text>`;
  }
  return trapezoidSvgLabelPill(xCenter, topY + fs * 0.5, line1, fs, "#1d4ed8");
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
  frameType: string,
  isU: boolean,
  wingWallLeft: number,
  wingWallRight: number,
  uDLeft: number,
  uDRight: number,
  trapOpts?: TrapezoidSketchOpts | null
): string {
  const lW_val = isL || isU ? lW : 0;
  const lD_val = isL ? lD : 0;
  const uDL = isU ? uDLeft : 0;
  const uDR = isU ? uDRight : uDLeft;
  const isLLeft = lSide === "left";
  const isTrap = Boolean(trapOpts && Math.abs(trapOpts.yL - trapOpts.yR) > 1e-6);
  const uWl = isU ? W + uDL : 0;
  const uWr = isU ? W + uDR : 0;
  const sketchH = isTrap ? Math.max(trapOpts!.yL, trapOpts!.yR) : isU ? Math.max(W, uWl, uWr) : W;
  let pts = isTrap ? `0,0 ${L},0 ${L},${trapOpts!.yR} 0,${trapOpts!.yL}` : `0,0 ${L},0 ${L},${W} 0,${W}`;
  if (isU && wingWallLeft > 0 && wingWallRight > 0 && lW_val > 0) {
    pts = uShapeSketchPts(L, wingWallLeft, lW_val, wingWallRight, W, uDL, uDR);
  } else if (isL) {
    if (isLLeft) pts = `0,${lD_val} ${lW_val},${lD_val} ${lW_val},0 ${L},0 ${L},${W} 0,${W} 0,${lD_val}`;
    else pts = `0,0 ${L - lW_val},0 ${L - lW_val},${lD_val} ${L},${lD_val} ${L},${W} 0,${W}`;
  }
  const fSize = Math.max(L, W) * 0.04;
  const divStrokeW = Math.max(L / 150, 2);
  let dividersSvg = "";
  let innerTextSvg = "";
  let dividerLabelsSvg = "";
  let fieldBadgesSvg = "";
  let fieldCountHeaderSvg = "";
  let trapezoidSlatsSvg = "";
  let trapezoidLegendSvg = "";
  const divDedSketch = W - cutDivider;
  const junction1 = wingWallLeft;
  const junction2 = wingWallLeft + lW_val;
  let uShapeOverlaySvg = "";
  let uDividerLabelsSvg = "";
  let uFieldDetails: PartitionFieldDetail[] = [];
  if (isU && wingWallLeft > 0 && wingWallRight > 0 && lW_val > 0) {
    uFieldDetails = buildUShapeSketchFieldDetails(
      dividerPositions, fieldWidths, L, wingWallLeft, lW_val, W, uDL, uDR, divDedSketch, spacingCm, shadingP
    );
    uShapeOverlaySvg = uShapeSketchOverlaySvg(
      L, W, lW_val, uDL, uDR, wingWallLeft, dividerPositions,
      divDedSketch, spacingCm, shadingP, frameColorHex, shadeColorHex, fSize
    );
    uDividerLabelsSvg = uShapeSketchDividerLabelsSvg(
      L, W, lW_val, uDL, uDR, wingWallLeft, dividerPositions, divDedSketch, fSize
    );
    const uSketchH = uShapeSketchDepthMax(W, uDL, uDR);
    const uBadgeR = Math.max(fSize * 0.52, 10);
    fieldBadgesSvg = sketchFieldBadgesSvg(
      uFieldDetails.map((fd) => ({
        rtlIndex: fd.index,
        xStart: fd.xStart,
        xEnd: fd.xEnd,
        cutLen: fd.shadeCutLen,
        badgeY: uSketchH - uBadgeR - 10,
        nShadeSets: fd.nShadeSets ?? 0,
      })),
      shadingP,
      fSize
    );
  } else {
  const divLabelFs = Math.max(12, fSize * 0.82);
  const inputL_sk = isL ? L - lW_val : L;
  dividerPositions.forEach((x) => {
    const isShort = isL ? lShapeDividerIsShort(x, isLLeft, lW_val, inputL_sk) : false;
    const exitD = isTrap
      ? trapOpts!.yL + (x / L) * (trapOpts!.yR - trapOpts!.yL)
      : W;
    const yStart = isL && isShort ? lD_val : 0;
    const yEnd = isTrap ? exitD : W;
    const divLen = isTrap
      ? (Math.round(trapOpts!.cutDividerAt(x) * 10) / 10).toFixed(1)
      : isL && isShort
        ? (cutDivider - lD_val).toFixed(1)
        : cutDivider.toFixed(1);
    dividersSvg += `<line x1="${x}" y1="${yStart}" x2="${x}" y2="${yEnd}" stroke="${frameColorHex}" stroke-width="${divStrokeW}" />`;
    dividerLabelsSvg += sketchDividerLenLabel(x, yStart, yEnd, String(divLen), divLabelFs, L);
  });
  }
  const allEdges = [0, ...dividerPositions, L];
  const nSketchFields = allEdges.length - 1;
  const badgeR = Math.max(fSize * 0.48, 8);
  const trapHasTable = Boolean(isTrap && trapOpts && trapOpts.fieldDetails.length > 0);
  const uHasSketchTable = isU && wingWallLeft > 0 && wingWallRight > 0 && lW_val > 0;
  if (!isU && nSketchFields > 0) {
    if (!trapHasTable) fieldCountHeaderSvg = sketchFieldCountHeaderSvg(L, nSketchFields, fSize);
    if (isTrap && trapOpts) {
      const trapFields = trapOpts.fieldDetails;
      if (trapFields.length > 0) {
        const n = trapFields.length;
        fieldBadgesSvg = sketchTrapezoidFieldsSvg(trapFields, n, shadingP, fSize);
      } else {
        const net = fieldWidths[0]?.net ?? 0;
        const cutLen = (fieldWidths[0] as FieldWidth & { shadeCutLen?: number }).shadeCutLen ?? Math.max(0, net - 1);
        fieldBadgesSvg = sketchFieldBadgesSvg(
          Array.from({ length: nSketchFields }, (_, i) => ({
            rtlIndex: nSketchFields - i,
            xStart: allEdges[i],
            xEnd: allEdges[i + 1],
            cutLen,
            badgeY: W - badgeR - 6,
          })),
          shadingP,
          fSize
        );
      }
    } else {
      const classifyShort = (xCenter: number) =>
        isL
          ? isLLeft
            ? xCenter < lW_val
            : xCenter > L - lW_val
          : false;
      const details = buildPartitionFieldDetails(dividerPositions, fieldWidths, L, classifyShort);
      fieldBadgesSvg = sketchFieldBadgesSvg(
        details.map((fd, i) => ({
          rtlIndex: nSketchFields - i,
          xStart: fd.xStart,
          xEnd: fd.xEnd,
          cutLen: fd.shadeCutLen,
          badgeY: W - badgeR - 6,
          nShadeSets: fd.nShadeSets ?? 0,
        })),
        shadingP,
        fSize
      );
    }
  }
  let uTableHtml = "";
  if (isU) {
    const classifyShort = (xCenter: number) => isUShapeShortFieldX(xCenter, wingWallLeft, lW_val);
    const matchFieldWidth = (xCenter: number, _isShort: boolean) => matchFieldWidthAtX(fieldWidths, xCenter);
    const fieldDetails =
      uFieldDetails.length > 0
        ? uFieldDetails
        : buildUShapeSketchFieldDetails(
            dividerPositions, fieldWidths, L, wingWallLeft, lW_val, W, uDL, uDR, divDedSketch, spacingCm, shadingP
          );
    uTableHtml = uShapeFieldDetailsTableHtml(
      fieldDetails, shadingP, cutDivider, W, uDL, uDR, junction1, junction2
    );
    if (!uHasSketchTable) fieldCountHeaderSvg = sketchFieldCountHeaderSvg(L, fieldDetails.length, fSize);
  }
  if (shadingP !== "none") {
    const setWSketch =
      shadingP === "mix" ? 7 + 4 + 4 + spacingCm * 3 : (shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5) + spacingCm;
    const slatStrokeW = Math.max(L / 400, 0.8);
    if (isTrap && trapOpts) {
      const fieldDetails = trapOpts.fieldDetails;
      fieldDetails.forEach((fd) => {
        const { xStart, xEnd } = fd;
        const d0 = fd.divLenLeft;
        const d1 = fd.divLenRight;
        const fieldNet = fd.fieldNet;
        trapezoidSlatsSvg += `<line x1="${xStart}" y1="${d0}" x2="${xEnd}" y2="${d1}" stroke="#ea580c" stroke-width="${slatStrokeW * 1.1}" stroke-dasharray="5 4" opacity="0.75" />`;
        const rowSpans = pickTrapezoidRowsForSketch(
          trapezoidShadeRowSpans(xStart, xEnd, fieldNet, setWSketch, L, trapOpts.yL, trapOpts.yR, divDedSketch),
          7
        );
        rowSpans.forEach((row) => {
          const stroke = row.isShort ? "#dc2626" : shadeColorHex;
          const sw = row.isShort ? slatStrokeW * 1.5 : slatStrokeW;
          trapezoidSlatsSvg += `<line x1="${row.xStart}" y1="${row.y}" x2="${row.xEnd}" y2="${row.y}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${row.isShort ? 1 : 0.55}" />`;
        });
      });
      if (!trapHasTable) {
        trapezoidLegendSvg = `<text x="${L / 2}" y="${sketchH + fSize * 1.5}" text-anchor="middle" font-size="${fSize * 0.55}" fill="#64748b"><tspan fill="${shadeColorHex}">━━</tspan> רגיל · <tspan fill="#dc2626">━━</tspan> מקוצר · <tspan fill="#ea580c">╌</tspan> גבול שדה</text>`;
      }
    }
  }
  const stepY = Math.max(1, spacingCm) || 2;
  const patternH = Math.max(stepY * 2, L / 20);
  const shadingPattern =
    shadingP !== "none" && !isTrap
      ? `<defs><pattern id="shading" width="${L / 40}" height="${patternH}" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="${L / 40}" y2="0" stroke="${shadeColorHex}" stroke-width="${Math.max(L / 300, 1)}" opacity="0.6"/></pattern></defs>`
      : "";
  const fillAttr = shadingP !== "none" ? (isTrap ? "#f0f9ff" : isU ? "#f8fafc" : "url(#shading)") : "#f8fafc";
  let labelsSvg = "";
  if (isU && wingWallLeft > 0 && wingWallRight > 0) {
    labelsSvg = uShapeEdgeLabelsSvg(L, W, lW_val, uDL, uDR, wingWallLeft, wingWallRight, fSize);
  } else if (isL) {
    if (isLLeft) {
      labelsSvg = `<text x="-5" y="${lD_val + (W - lD_val) / 2}" transform="rotate(-90 -5,${lD_val + (W - lD_val) / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה קצרה: ${W - lD_val} ס"מ</text><text x="${L + 5}" y="${W / 2}" transform="rotate(90 ${L + 5},${W / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה ארוכה: ${W} ס"מ</text><text x="${lW_val + (L - lW_val) / 2}" y="-10" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">קיר ראשי: ${L - lW_val} ס"מ</text><text x="${lW_val - 5}" y="${lD_val / 2}" transform="rotate(-90 ${lW_val - 5},${lD_val / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c" dy="-5">עומק: ${lD_val}</text><text x="${lW_val / 2}" y="${lD_val - 5}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c">רוחב: ${lW_val}</text><text x="${L / 2}" y="${W + fSize * 1.2}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">חזית שלמה: ${L} ס"מ</text>`;
    } else {
      labelsSvg = `<text x="-5" y="${W / 2}" transform="rotate(-90 -5,${W / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה ארוכה: ${W} ס"מ</text><text x="${L + 5}" y="${lD_val + (W - lD_val) / 2}" transform="rotate(90 ${L + 5},${lD_val + (W - lD_val) / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155" dy="-5">יציאה קצרה: ${W - lD_val} ס"מ</text><text x="${(L - lW_val) / 2}" y="-10" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">קיר ראשי: ${L - lW_val} ס"מ</text><text x="${L - lW_val + 5}" y="${lD_val / 2}" transform="rotate(90 ${L - lW_val + 5},${lD_val / 2})" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c" dy="-5">עומק: ${lD_val}</text><text x="${L - lW_val / 2}" y="${lD_val - 5}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#ea580c">רוחב: ${lW_val}</text><text x="${L / 2}" y="${W + fSize * 1.2}" text-anchor="middle" font-size="${fSize}" font-weight="bold" fill="#334155">חזית שלמה: ${L} ס"מ</text>`;
    }
  } else if (isTrap && trapOpts) {
    labelsSvg = trapezoidEdgeLabelsSvg(L, trapOpts.yL, trapOpts.yR, sketchH, trapOpts.metrics, fSize);
  } else {
    labelsSvg =
      sketchVDimLabel(0, W, 0, sketchDimCm(W), fSize, "#334155", true) +
      sketchVDimLabel(L, 0, W, sketchDimCm(W), fSize, "#334155", false) +
      sketchHDimLabel(0, L, 0, sketchDimCm(L), fSize, "#334155", true) +
      sketchHDimLabel(0, L, W, sketchDimCm(L), fSize, "#334155", false);
  }
  const isLOnly = isL && !isU && !isTrap;
  const edgeFs = Math.max(12, fSize * 0.8);
  const vbW = isU ? L + 90 : isTrap ? L + 140 : L + 115;
  const headerPad = fieldCountHeaderSvg ? Math.max(18, fSize * 1.1) : 0;
  const badgePad = fieldBadgesSvg ? Math.max(28, fSize * 1.5) : 0;
  const uPadTop = isTrap
    ? Math.max(36, edgeFs * 3.2) + badgePad
    : isLOnly
      ? 30 + headerPad
      : isU
        ? Math.max(36, edgeFs * 3.5) + headerPad + badgePad
        : 30 + headerPad + badgePad;
  const uPadBottom = isTrap ? Math.max(42, edgeFs * 3.5) : isLOnly ? 60 : isU ? Math.max(50, edgeFs * 4) : 60;
  const uPadLeft = isTrap ? Math.max(68, edgeFs * 5.5) : isLOnly ? 48 : isU ? Math.max(62, edgeFs * 5.5) : 48;
  const svgViewH = isLOnly ? W + uPadBottom : sketchH + uPadBottom;
  const svgMaxH = isLOnly ? 320 : isU ? 380 : isTrap ? 400 : 360;
  const legendSvg = isU || isTrap ? "" : frameProfileLegendSvg(frameType, frameColorHex, L, isLOnly ? W : sketchH);
  const trapTableHtml =
    isTrap && trapOpts && trapOpts.fieldDetails.length > 0
      ? trapezoidFieldDetailsTableHtml(trapOpts.fieldDetails, shadingP, trapOpts.yR < trapOpts.yL ? "ימין" : "שמאל")
      : "";
  return `<div class="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center relative" style="direction: ltr;"><div class="relative w-full max-w-2xl mx-auto flex justify-center mt-4 mb-2"><svg viewBox="${-uPadLeft} ${-uPadTop} ${vbW} ${svgViewH}" style="max-height: ${svgMaxH}px; width: 100%; overflow: visible;">${shadingPattern}<polygon points="${pts}" fill="${fillAttr}" stroke="${frameColorHex}" stroke-width="${Math.max(L / 100, 2)}" stroke-linejoin="round" />${trapezoidSlatsSvg}${isU ? uShapeOverlaySvg : dividersSvg}${innerTextSvg}${fieldBadgesSvg}${isU ? uDividerLabelsSvg : dividerLabelsSvg}${fieldCountHeaderSvg}${labelsSvg}${trapezoidLegendSvg}${legendSvg}</svg></div>${trapTableHtml}${uTableHtml}</div>`;
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
  exitLeft?: string | number;
  exitRight?: string | number;
  trapezoidMode?: boolean;
  isLShape?: boolean;
  isUShape?: boolean;
  uWingWallLeft?: string | number;
  uWingWallRight?: string | number;
  uNotchDepthLeft?: string | number;
  uNotchDepthRight?: string | number;
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
type FenceSegment = { L: number; H: number; P?: number; connected?: boolean; corner?: boolean };
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

function optionalPositive(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** מגרעת מרכזית: קיר כנף שמאל/ימין — סימטרי כברירת מחדל, או לפי מידות בשטח */
function resolveUShapeWings(
  totalWall: number,
  notchW: number,
  leftIn?: number,
  rightIn?: number
): { left: number; right: number } {
  if (totalWall <= 0 || notchW <= 0) return { left: 0, right: 0 };
  const hasLeft = leftIn !== undefined && leftIn > 0;
  const hasRight = rightIn !== undefined && rightIn > 0;
  if (hasLeft && hasRight) return { left: leftIn!, right: rightIn! };
  if (hasLeft) return { left: leftIn!, right: Math.max(0, totalWall - notchW - leftIn!) };
  if (hasRight) return { left: Math.max(0, totalWall - notchW - rightIn!), right: rightIn! };
  const half = Math.max(0, (totalWall - notchW) / 2);
  return { left: half, right: half };
}

function isUShapeShortDividerX(x: number, wingWallLeft: number, notchW: number): boolean {
  return x > wingWallLeft + 0.1 && x < wingWallLeft + notchW - 0.1;
}

function uNotchJunctionMid(junctionLeft: number, notchW: number): number {
  return junctionLeft + notchW / 2;
}

/** יציאה (עומק) בנקודה x — מרכז W, כנפיים W+תוספת */
function uExitDepthAt(
  x: number,
  junctionLeft: number,
  junctionRight: number,
  centerW: number,
  wingExtLeft: number,
  wingExtRight: number
): number {
  if (x <= junctionLeft + 0.1) return centerW + wingExtLeft;
  if (x >= junctionRight - 0.1) return centerW + wingExtRight;
  return centerW;
}

function uFieldExitDepth(fieldName: string, centerW: number, wingExtLeft: number, wingExtRight: number): number {
  if (fieldName === "כנף שמאל") return centerW + wingExtLeft;
  if (fieldName === "כנף ימין") return centerW + wingExtRight;
  return centerW;
}

function uShapeSqmArea(
  wingWallLeft: number,
  notchW: number,
  wingWallRight: number,
  centerW: number,
  wingExtLeft: number,
  wingExtRight: number
): number {
  return (
    wingWallLeft * (centerW + wingExtLeft) +
    notchW * centerW +
    wingWallRight * (centerW + wingExtRight)
  ) / 10000;
}

/** פוליגון U — מגרעת בקיר (למעלה), חזית שלמה למטה */
function uShapeSketchPts(
  L: number,
  wingLeft: number,
  notchW: number,
  wingRight: number,
  centerW: number,
  wingExtLeft: number,
  wingExtRight: number
): string {
  const Wl = centerW + wingExtLeft;
  const Wr = centerW + wingExtRight;
  const jr = wingLeft + notchW;
  const H = uShapeSketchDepthMax(centerW, wingExtLeft, wingExtRight);
  return `0,${H} ${L},${H} ${L},${H - Wr} ${jr},${H - Wr} ${jr},${H - centerW} ${wingLeft},${H - centerW} ${wingLeft},${H - Wl} 0,${H - Wl}`;
}

/** קו מגרעת בקיר (מלמעלה) — מדרגה לפי תוספת כנף */
function uShapeNotchWallPts(junctionLeft: number, notchW: number, extLeft: number, extRight: number): string {
  const junctionRight = junctionLeft + notchW;
  const junctionMid = junctionLeft + notchW / 2;
  if (Math.abs(extLeft - extRight) < 0.5) {
    return `${junctionLeft},${extLeft} ${junctionRight},${extRight}`;
  }
  return `${junctionLeft},${extLeft} ${junctionMid},${extLeft} ${junctionMid},${extRight} ${junctionRight},${extRight}`;
}

/** אורך חיתוך חציץ ב-U לפי מיקום — מגרעת/פינות: עומק מרכז; כנף: עומק כנף */
function uDividerCutLen(
  x: number,
  junctionLeft: number,
  junctionRight: number,
  centerW: number,
  wingExtLeft: number,
  wingExtRight: number,
  divDed: number
): number {
  const tol = 1.5;
  const atJ1 = Math.abs(x - junctionLeft) <= tol;
  const atJ2 = Math.abs(x - junctionRight) <= tol;
  const inNotch = x > junctionLeft + tol && x < junctionRight - tol;
  if (atJ1 || atJ2 || inNotch) return centerW - divDed;
  const exitD = uExitDepthAt(x, junctionLeft, junctionRight, centerW, wingExtLeft, wingExtRight);
  return exitD - divDed;
}

function uShapeFieldDividerCutLen(
  fw: FieldWidth,
  junctionLeft: number,
  junctionRight: number,
  centerW: number,
  wingExtLeft: number,
  wingExtRight: number,
  divDed: number
): number {
  return uFieldExitDepthFor(fw, junctionLeft, junctionRight, centerW, wingExtLeft, wingExtRight) - divDed;
}

function buildUShapeSketchFieldDetails(
  dividerPositions: number[],
  fieldWidths: FieldWidth[],
  L: number,
  wingWallLeft: number,
  lW_val: number,
  W: number,
  uDL: number,
  uDR: number,
  divDedSketch: number,
  spacingCm: number,
  shadingP: string
): PartitionFieldDetail[] {
  const junction1 = wingWallLeft;
  const junction2 = wingWallLeft + lW_val;
  const classifyShort = (xCenter: number) => isUShapeShortFieldX(xCenter, wingWallLeft, lW_val);
  const matchFieldWidth = (xCenter: number, _isShort: boolean) => matchFieldWidthAtX(fieldWidths, xCenter);
  let fieldDetails = buildPartitionFieldDetails(dividerPositions, fieldWidths, L, classifyShort, matchFieldWidth);
  const n = fieldDetails.length;
  fieldDetails = fieldDetails.map((fd, i) => ({
    ...fd,
    index: n - i,
    zoneName: `שדה ${n - i}`,
  }));
  if (shadingP !== "none") {
    const profWSk = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
    const setWSk = shadingP === "mix" ? 7 + 4 + 4 + spacingCm * 3 : profWSk + spacingCm;
    fieldDetails = fieldDetails.map((fd) => {
      const xC = (fd.xStart + fd.xEnd) / 2;
      const exitD = uExitDepthAt(xC, junction1, junction2, W, uDL, uDR);
      const fieldDepth = exitD - divDedSketch;
      return { ...fd, nShadeSets: Math.max(0, Math.floor(fieldDepth / setWSk)) };
    });
  }
  return fieldDetails;
}

/** ציור תרשים U — מבנה, חציצים, הצללות */
function uShapeSketchOverlaySvg(
  L: number,
  W: number,
  lW: number,
  uDL: number,
  uDR: number,
  wingWallLeft: number,
  dividerPositions: number[],
  divDedSketch: number,
  spacingCm: number,
  shadingP: string,
  frameColorHex: string,
  shadeColorHex: string,
  fSize: number
): string {
  const junction1 = wingWallLeft;
  const junction2 = wingWallLeft + lW;
  const H = uShapeSketchDepthMax(W, uDL, uDR);
  const grungY = H - W;
  const Wl = W + uDL;
  const Wr = W + uDR;
  const divStrokeW = Math.max(L / 150, 2);
  const slatStrokeW = Math.max(L / 400, 0.6);
  let svg = "";
  svg += `<line x1="${junction1}" y1="${grungY}" x2="${junction2}" y2="${grungY}" stroke="#ea580c" stroke-width="${divStrokeW * 0.45}" stroke-dasharray="6 5" opacity="0.55" />`;
  svg += `<line x1="${junction1}" y1="${grungY}" x2="${junction2}" y2="${grungY}" stroke="${frameColorHex}" stroke-width="${divStrokeW * 1.2}" stroke-linecap="round" />`;
  if (uDL > 0) {
    svg += `<line x1="${junction1}" y1="${grungY}" x2="${junction1}" y2="${H - Wl}" stroke="#ea580c" stroke-width="${divStrokeW * 1.1}" stroke-linecap="round" />`;
  }
  if (uDR > 0) {
    svg += `<line x1="${junction2}" y1="${grungY}" x2="${junction2}" y2="${H - Wr}" stroke="#ea580c" stroke-width="${divStrokeW * 1.1}" stroke-linecap="round" />`;
  }
  const grR = Math.max(3, fSize * 0.18);
  svg += `<circle cx="${junction1}" cy="${grungY}" r="${grR}" fill="none" stroke="#dc2626" stroke-width="1.8" />`;
  svg += `<circle cx="${junction2}" cy="${grungY}" r="${grR}" fill="none" stroke="#dc2626" stroke-width="1.8" />`;
  const dividerSpans = dividerPositions.map((x) => ({
    x,
    span: uDividerSketchSpan(x, junction1, junction2, W, uDL, uDR, H, grungY, divDedSketch),
  }));
  dividerSpans.forEach(({ x, span }) => {
    svg += `<line x1="${x}" y1="${span.yStart}" x2="${x}" y2="${span.yEnd}" stroke="${frameColorHex}" stroke-width="${divStrokeW}" />`;
  });
  const allEdges = [0, ...dividerPositions, L];
  if (shadingP !== "none") {
    const profW = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
    const setW = shadingP === "mix" ? 7 + 4 + 4 + spacingCm * 3 : profW + spacingCm;
    for (let i = 0; i < allEdges.length - 1; i++) {
      const xStart = allEdges[i];
      const xEnd = allEdges[i + 1];
      const xCenter = (xStart + xEnd) / 2;
      const depthD = uExitDepthAt(xCenter, junction1, junction2, W, uDL, uDR);
      const fieldDepth = depthD - divDedSketch;
      const yTop = H - fieldDepth;
      const nRows = Math.max(0, Math.floor(fieldDepth / setW));
      const rowStep = nRows > 14 ? Math.ceil(nRows / 12) : 1;
      for (let r = 0; r < nRows; r += rowStep) {
        const y = yTop + r * setW;
        if (y >= H - divDedSketch * 0.5) break;
        svg += `<line x1="${xStart}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="${shadeColorHex}" stroke-width="${slatStrokeW}" stroke-linecap="round" opacity="0.35" />`;
      }
    }
  }
  return svg;
}

/** תוויות אורך חציץ ב-U — פינות מגרעת בנפרד מחציצי כנף */
function uShapeSketchDividerLabelsSvg(
  L: number,
  W: number,
  lW: number,
  uDL: number,
  uDR: number,
  wingWallLeft: number,
  dividerPositions: number[],
  divDedSketch: number,
  fSize: number
): string {
  const junction1 = wingWallLeft;
  const junction2 = wingWallLeft + lW;
  const H = uShapeSketchDepthMax(W, uDL, uDR);
  const grungY = H - W;
  const divLabelFs = Math.max(14, fSize * 0.95);
  const jTol = 1.5;
  const dividerSpans = dividerPositions.map((x) => ({
    x,
    span: uDividerSketchSpan(x, junction1, junction2, W, uDL, uDR, H, grungY, divDedSketch),
  }));
  let svg = "";
  dividerSpans.forEach(({ x, span }) => {
    const len = span.divLen.toFixed(1);
    const f = divLabelFs;

    if (span.isJunction) {
      const atJ2 = Math.abs(x - junction2) <= jTol;
      const side: "left" | "right" = atJ2 ? "left" : "right";
      svg += sketchDividerLenLabel(x, span.yStart, span.yEnd, len, f, L, { yFrac: 0.5, side });
      return;
    }

    if (span.inNotch) {
      const side = x < (junction1 + junction2) / 2 ? "left" : "right";
      svg += sketchDividerLenLabel(x, span.yStart, span.yEnd, len, f, L, { yFrac: 0.26, side });
      return;
    }

    const inRightWing = x > junction2 + jTol;
    const inLeftWing = x < junction1 - jTol;
    if (!inRightWing && !inLeftWing) return;

    const side: "left" | "right" = inRightWing ? "right" : "left";
    svg += sketchDividerLenLabel(x, span.yStart, span.yEnd, len, f, L, { yFrac: 0.58, side });
  });
  return svg;
}

function resolveUNotchDepths(pergola: PergolaInput): { left: number; right: number } {
  const legacy = num(pergola.lWallDepth, 0);
  const dL = optionalPositive(pergola.uNotchDepthLeft);
  const dR = optionalPositive(pergola.uNotchDepthRight);
  if (dL !== undefined && dR !== undefined) return { left: dL, right: dR };
  if (dL !== undefined) return { left: dL, right: dR ?? dL };
  if (dR !== undefined) return { left: dL ?? dR ?? legacy, right: dR };
  return { left: legacy, right: legacy };
}

function isUShapeShortFieldX(xCenter: number, wingWallLeft: number, notchW: number): boolean {
  return xCenter > wingWallLeft + 0.1 && xCenter < wingWallLeft + notchW - 0.1;
}

function resolvePergolaExits(pergola: PergolaInput): { yetziaSmol: number; yetziaYamin: number } {
  const legacy = num(pergola.exitWidth, 0);
  if (!bool(pergola.trapezoidMode, false)) {
    return { yetziaSmol: legacy, yetziaYamin: legacy };
  }
  return {
    yetziaSmol: num(pergola.exitLeft, legacy),
    yetziaYamin: num(pergola.exitRight, legacy),
  };
}

function calcTrapezoidMetrics(kirRashi: number, yL: number, yR: number): TrapezoidMetrics {
  const diff = yR - yL;
  const frontLength = Math.sqrt(kirRashi * kirRashi + diff * diff);
  const skewDeg = (Math.atan2(Math.abs(diff), kirRashi) * 180) / Math.PI;
  const half = skewDeg / 2;
  const cutAngleLeft = diff <= 0 ? 45 + half : 45 - half;
  const cutAngleRight = diff <= 0 ? 45 - half : 45 + half;
  return {
    frontLength,
    skewDeg,
    cutAngleLeft,
    cutAngleRight,
    sideCutAngleLeft: cutAngleRight,
    sideCutAngleRight: cutAngleLeft,
  };
}

function depthAtTrapezoid(yL: number, yR: number, kirRashi: number, x: number): number {
  if (kirRashi <= 0) return yL;
  return yL + (x / kirRashi) * (yR - yL);
}

/** לוחות סנטף בטרפז: רוחב לוח ~1 מ׳ לאורך הקיר; אורך = יציאה באותו מקטע + 15 ס״מ */
const SANTAF_BOARD_WIDTH_CM = 100;
const SANTAF_OVERHANG_CM = 15;

function collectTrapezoidSantafBoardLens(L: number, yL: number, yR: number): number[] {
  const lens: number[] = [];
  if (!(L > 0)) return lens;
  let x0 = 0;
  while (x0 < L - 1e-6) {
    const x1 = Math.min(L, x0 + SANTAF_BOARD_WIDTH_CM);
    // בתוך הלוח העומק ליניארי — מספיק לבדוק את הקצוות
    const d0 = depthAtTrapezoid(yL, yR, L, x0);
    const d1 = depthAtTrapezoid(yL, yR, L, x1);
    const lenCm = Math.round((Math.max(d0, d1) + SANTAF_OVERHANG_CM) * 10) / 10;
    if (lenCm > 0) lens.push(lenCm);
    x0 = x1;
  }
  return lens;
}

function bucketSantafBoardLens(lens: number[]): { lenCm: number; count: number }[] {
  const map = new Map<number, number>();
  lens.forEach((l) => map.set(l, (map.get(l) || 0) + 1));
  return Array.from(map.entries())
    .map(([lenCm, count]) => ({ lenCm, count }))
    .sort((a, b) => b.lenCm - a.lenCm);
}

/** סטייה מס"מ מתחת לאורך מלא שעדיין נחשבת «רגיל» (לא מקוצר אמיתי) */
const TRAP_FULL_SLAT_TOL_CM = 2;

/**
 * כמו trapSlatSpanX בהדמיה: רוחב שלב רציף בעומק y מהקיר (ס"מ, x מ־0 עד L).
 * yL/yR כאן = יציאות שימושיות (אחרי ניכוי מסגרת), כדי שיתאים לעומק החיתוך.
 */
function trapContinuousSlatSpanCm(
  y: number,
  L: number,
  yL: number,
  yR: number,
  trimCm = 4
): { xMin: number; xMax: number; width: number } | null {
  if (!(L > 0) || y < trimCm - 1e-6) return null;
  if (y > Math.max(yL, yR) + 1e-6) return null;
  if (Math.abs(yR - yL) < 1e-6) {
    const w = L - 2 * trimCm;
    if (w < 2) return null;
    return { xMin: trimCm, xMax: L - trimCm, width: w };
  }
  const tNeed = (y - yL) / (yR - yL);
  const xAt = tNeed * L;
  let xMin: number;
  let xMax: number;
  if (yR >= yL) {
    xMin = Math.max(trimCm, xAt);
    xMax = L - trimCm;
  } else {
    xMin = trimCm;
    xMax = Math.min(L - trimCm, xAt);
  }
  if (xMax - xMin < 2) return null;
  return { xMin, xMax, width: xMax - xMin };
}

function trapFullSlatLen(fieldNet: number): number {
  return fieldNet > 1 ? fieldNet - 1 : 0;
}

function isTrapezoidFullSlat(cutLen: number, fullLen: number): boolean {
  return fullLen > 0 && cutLen >= fullLen - TRAP_FULL_SLAT_TOL_CM;
}

/** חיתוך בשדה = חיתוך הרצועה הרציפה (כמו בהדמיה) בגבולות השדה בין חציצים */
function shadeRowCutLenInField(
  span: { xMin: number; xMax: number },
  x0: number,
  x1: number,
  fieldNet: number
): number | null {
  const fullLen = trapFullSlatLen(fieldNet);
  if (fullLen <= 0) return null;
  const pad = Math.max(0, (x1 - x0 - fieldNet) / 2);
  const innerL = x0 + pad;
  const innerR = x1 - pad;
  const clipL = Math.max(innerL, span.xMin);
  const clipR = Math.min(innerR, span.xMax);
  if (clipR - clipL < 0.5) return null;
  // כיסוי כמעט מלא של השדה → חיתוך שבלונה סטנדרטי (לא «מקוצר»)
  if (clipL <= innerL + TRAP_FULL_SLAT_TOL_CM && clipR >= innerR - TRAP_FULL_SLAT_TOL_CM) {
    return Math.round(fullLen * 10) / 10;
  }
  const raw = Math.round((clipR - clipL - 1) * 10) / 10;
  if (raw < 0.5) return null;
  if (isTrapezoidFullSlat(raw, fullLen)) return Math.round(fullLen * 10) / 10;
  return raw;
}

function collectTrapezoidShadeRows(
  x0: number,
  x1: number,
  fieldNet: number,
  setW: number,
  L: number,
  yL: number,
  yR: number,
  divDed: number
): number[] {
  const lens: number[] = [];
  if (!(setW > 0) || !(L > 0)) return lens;
  const yLu = yL - divDed;
  const yRu = yR - divDed;
  const maxDepth = Math.max(yLu, yRu);
  if (maxDepth <= 0) return lens;
  const nMax = Math.floor(maxDepth / setW);
  for (let k = 0; k < nMax; k++) {
    const ySlat = (k + 0.5) * setW;
    const span = trapContinuousSlatSpanCm(ySlat, L, yLu, yRu, 4);
    if (!span) continue;
    const cutLen = shadeRowCutLenInField(span, x0, x1, fieldNet);
    if (cutLen !== null && cutLen > 0) lens.push(cutLen);
  }
  return lens;
}

/** כל מידות החיתוך בשדה — רגילים ומקוצרים יחד, מהארוך לקצר */
function bucketTrapezoidRowLens(rowLens: number[]): { len: number; count: number }[] {
  const map = new Map<number, number>();
  rowLens.forEach((l) => map.set(l, (map.get(l) || 0) + 1));
  return Array.from(map.entries())
    .map(([len, count]) => ({ len, count }))
    .sort((a, b) => b.len - a.len);
}

type TrapezoidShadeRowSpan = { y: number; xStart: number; xEnd: number; cutLen: number; isShort: boolean };

/** מיקום שלב בסקיצה: מלא = בין חציצים; מקוצר = חיתוך הרצועה הרציפה בשדה */
function trapezoidShadeRowSpans(
  x0: number,
  x1: number,
  fieldNet: number,
  setW: number,
  L: number,
  yL: number,
  yR: number,
  divDed: number
): TrapezoidShadeRowSpan[] {
  const rows: TrapezoidShadeRowSpan[] = [];
  const fullLen = trapFullSlatLen(fieldNet);
  if (fullLen <= 0 || !(setW > 0) || !(L > 0)) return rows;
  const pad = Math.max(0, (x1 - x0 - fieldNet) / 2);
  const xInnerLeft = x0 + pad;
  const xInnerRight = x1 - pad;
  const yLu = yL - divDed;
  const yRu = yR - divDed;
  const nMax = Math.floor(Math.max(yLu, yRu) / setW);
  for (let k = 0; k < nMax; k++) {
    const ySlat = (k + 0.5) * setW;
    const span = trapContinuousSlatSpanCm(ySlat, L, yLu, yRu, 4);
    if (!span) continue;
    const cutLen = shadeRowCutLenInField(span, x0, x1, fieldNet);
    if (cutLen === null || cutLen <= 0) continue;
    const isShort = !isTrapezoidFullSlat(cutLen, fullLen);
    const clipL = Math.max(xInnerLeft, span.xMin);
    const clipR = Math.min(xInnerRight, span.xMax);
    let xStart: number;
    let xEnd: number;
    if (!isShort) {
      xStart = xInnerLeft;
      xEnd = xInnerLeft + cutLen;
    } else {
      xStart = clipL;
      xEnd = clipL + cutLen;
      if (xEnd > clipR + 0.2) {
        xEnd = clipR;
        xStart = Math.max(clipL, clipR - cutLen);
      }
    }
    rows.push({ y: ySlat, xStart, xEnd, cutLen, isShort });
  }
  return rows;
}

type TrapezoidFieldDetail = {
  index: number;
  xStart: number;
  xEnd: number;
  fieldNet: number;
  divLenLeft: number;
  divLenRight: number;
  /** זווית 30/30 על גבול שמאל של השדה (חציץ/צד שמ' − 1.5) */
  angleLenLeft: number;
  /** זווית 30/30 על גבול ימין של השדה (חציץ/צד ימ' − 1.5) */
  angleLenRight: number;
  fullSlatCount: number;
  fullSlatLen: number;
  shortSlats: { len: number; count: number }[];
  /** כל מידות החיתוך בשדה (רגיל+מקוצר) לפי כמות */
  allCutBuckets: { len: number; count: number }[];
  shortSide: string;
  totalSlats: number;
};

function trapezoidShadeQtyText(fd: TrapezoidFieldDetail, shadingP?: string): string | undefined {
  const shortTotal = fd.shortSlats.reduce((s, x) => s + x.count, 0);
  if (shadingP === "mix") {
    const parts: string[] = [];
    if (fd.fullSlatCount > 0) parts.push(`רגילים: ${mixShadeQtyPlain(fd.fullSlatCount)}`);
    if (shortTotal > 0) parts.push(`מקוצרים: ${mixShadeQtyPlain(shortTotal)}`);
    if (parts.length) return parts.join(" · ");
    if (fd.totalSlats > 0) return mixShadeQtyPlain(fd.totalSlats);
    return undefined;
  }
  if (fd.fullSlatCount > 0 && shortTotal > 0) return `${fd.fullSlatCount} רגילים · ${shortTotal} מקוצרים`;
  if (fd.fullSlatCount > 0) return `${fd.fullSlatCount} רגילים`;
  if (shortTotal > 0) return `${shortTotal} מקוצרים`;
  if (fd.totalSlats > 0) return `${fd.totalSlats} שלבים`;
  return undefined;
}

function summarizeTrapezoidFieldShades(rowLens: number[], fieldNet: number): {
  fullSlatCount: number;
  fullSlatLen: number;
  shortSlats: { len: number; count: number }[];
} {
  const fullLen = trapFullSlatLen(fieldNet);
  const fullSlatCount = rowLens.filter((l) => isTrapezoidFullSlat(l, fullLen)).length;
  const shortBuckets = new Map<number, number>();
  rowLens
    .filter((l) => !isTrapezoidFullSlat(l, fullLen))
    .forEach((l) => shortBuckets.set(l, (shortBuckets.get(l) || 0) + 1));
  const shortSlats = Array.from(shortBuckets.entries())
    .map(([len, count]) => ({ len, count }))
    .sort((a, b) => b.len - a.len);
  return { fullSlatCount, fullSlatLen: fullLen, shortSlats };
}

function buildTrapezoidFieldDetails(
  allEdges: number[],
  fieldNet: number,
  setW: number,
  cutDividerAt: (x: number) => number,
  yL: number,
  yR: number,
  L: number,
  divDed: number
): TrapezoidFieldDetail[] {
  const details: TrapezoidFieldDetail[] = [];
  const nFields = allEdges.length - 1;
  for (let fi = 0; fi < nFields; fi++) {
    const xStart = allEdges[fi];
    const xEnd = allEdges[fi + 1];
    const d0 = cutDividerAt(xStart);
    const d1 = cutDividerAt(xEnd);
    const rowLens = collectTrapezoidShadeRows(xStart, xEnd, fieldNet, setW, L, yL, yR, divDed);
    const { fullSlatCount, fullSlatLen, shortSlats } = summarizeTrapezoidFieldShades(rowLens, fieldNet);
    const allCutBuckets = bucketTrapezoidRowLens(rowLens);
    const shortSide =
      Math.abs(d1 - d0) < 1e-6 ? (yL >= yR ? "ימין" : "שמאל") : d0 > d1 ? "ימין" : "שמאל";
    const divLeft = Math.round(d0 * 10) / 10;
    const divRight = Math.round(d1 * 10) / 10;
    details.push({
      // כמו בסקיצה: שדה 1 בימין, שדה N בשמאל
      index: nFields - fi,
      xStart,
      xEnd,
      fieldNet,
      divLenLeft: divLeft,
      divLenRight: divRight,
      angleLenLeft: Math.round((divLeft - 1.5) * 10) / 10,
      angleLenRight: Math.round((divRight - 1.5) * 10) / 10,
      fullSlatCount,
      fullSlatLen,
      shortSlats,
      allCutBuckets,
      shortSide,
      totalSlats: rowLens.length,
    });
  }
  return details;
}

function pickTrapezoidRowsForSketch(rows: TrapezoidShadeRowSpan[], maxLines = 16): TrapezoidShadeRowSpan[] {
  if (rows.length <= maxLines) return rows;
  const fulls = rows.filter((r) => !r.isShort);
  const shorts = rows.filter((r) => r.isShort);
  const picked: TrapezoidShadeRowSpan[] = [];
  if (fulls.length > 0) picked.push(fulls[0]);
  const fullBudget = Math.max(2, maxLines - shorts.length - 1);
  const step = Math.max(1, Math.ceil(fulls.length / fullBudget));
  for (let i = step; i < fulls.length; i += step) picked.push(fulls[i]);
  picked.push(...shorts);
  return picked.sort((a, b) => a.y - b.y);
}

function uShapeFieldDetailsTableHtml(
  fieldDetails: PartitionFieldDetail[],
  shadingP: string,
  centerDividerLen: number,
  centerW: number,
  uDL: number,
  uDR: number,
  junction1: number,
  junction2: number
): string {
  if (fieldDetails.length === 0) return "";
  const sorted = [...fieldDetails].sort((a, b) => a.index - b.index);
  const mixNote =
    shadingP === "mix"
      ? '<p class="text-xs text-slate-500 mt-1 mb-2 text-center">לכל שורה: 1 יח\' 20/70 + 2 יח\' 20/40</p>'
      : "";
  const shadeHead =
    shadingP === "none"
      ? ""
      : shadingP === "mix"
        ? `<th class="py-2 px-2 font-bold">שורות</th><th class="py-2 px-2 font-bold">20/70</th><th class="py-2 px-2 font-bold">20/40</th>`
        : `<th class="py-2 px-2 font-bold">שלבים</th><th class="py-2 px-2 font-bold">פרופיל</th>`;
  const rows = sorted
    .map((fd) => {
      const xC = (fd.xStart + fd.xEnd) / 2;
      const exitD = uExitDepthAt(xC, junction1, junction2, centerW, uDL, uDR);
      const divCut = uShapeFieldDividerCutLen(
        { xStart: fd.xStart, xEnd: fd.xEnd, name: fd.zoneName, net: fd.net, isShort: fd.isShort, count: 1, totalW: fd.xEnd - fd.xStart },
        junction1,
        junction2,
        centerW,
        uDL,
        uDR,
        centerW - centerDividerLen
      );
      const zone = fd.isShort ? "מגרעת" : "כנף";
      const nSets = fd.nShadeSets ?? 0;
      const shadeCells =
        shadingP === "none"
          ? ""
          : shadingP === "mix"
            ? `<td class="py-2 px-2 text-center font-bold text-slate-700">${nSets}</td>${mixShadeQtyTableCells(nSets)}`
            : `<td class="py-2 px-2 text-center font-bold text-blue-700">${nSets}</td><td class="py-2 px-2 text-center text-sm">${shadingP === "20x70" ? "20/70" : "20/40"}</td>`;
      return `<tr class="border-b border-slate-200 hover:bg-white/80">
<td class="py-2 px-2 text-center font-bold text-slate-800">${fd.zoneName || `שדה ${fd.index}`}</td>
<td class="py-2 px-2 text-center text-sm">${zone}</td>
<td class="py-2 px-2 text-center">${fd.net.toFixed(1)}</td>
<td class="py-2 px-2 text-center font-bold text-blue-700">${fd.shadeCutLen.toFixed(1)}</td>
<td class="py-2 px-2 text-center">${exitD.toFixed(0)}</td>
<td class="py-2 px-2 text-center">${divCut.toFixed(1)}</td>
${shadeCells}
</tr>`;
    })
    .join("");
  return `<div class="w-full max-w-2xl mt-3" dir="rtl">
<h4 class="text-sm font-bold text-slate-700 mb-2 text-center">פירוט לפי שדה — מגרעת מרכזית</h4>
${mixNote}
<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
<table class="w-full text-sm border-collapse">
<thead><tr class="bg-slate-100 text-slate-600 text-xs">
<th class="py-2 px-2 font-bold">שדה</th>
<th class="py-2 px-2 font-bold">אזור</th>
<th class="py-2 px-2 font-bold">שבלונה</th>
<th class="py-2 px-2 font-bold">חיתוך</th>
<th class="py-2 px-2 font-bold">עומק</th>
<th class="py-2 px-2 font-bold">חציץ</th>
${shadeHead}
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
</div>`;
}

function trapezoidFieldDetailsTableHtml(
  fieldDetails: TrapezoidFieldDetail[],
  shadingP: string,
  shortSideGlobal: string
): string {
  if (fieldDetails.length === 0) return "";
  const isMix = shadingP === "mix";
  const singleProfile =
    shadingP === "20x70" ? "20/70" : shadingP === "20x40" ? "20/40" : shadingP === "none" ? "" : "";
  const angleLens = fieldDetails.flatMap((f) => [f.angleLenLeft, f.angleLenRight]);
  const maxAngle = Math.max(...angleLens);
  const minAngle = Math.min(...angleLens);
  const angleNote = (len: number) =>
    fieldDetails.length > 1 && maxAngle !== minAngle
      ? len === maxAngle
        ? ' <span class="text-amber-700 text-xs">(ארוכה)</span>'
        : len === minAngle
          ? ' <span class="text-amber-700 text-xs">(קצרה)</span>'
          : ""
      : "";
  const formatAngles = (fd: TrapezoidFieldDetail) => {
    if (Math.abs(fd.angleLenLeft - fd.angleLenRight) < 0.05) {
      return `2× ${fd.angleLenLeft.toFixed(1)}${angleNote(fd.angleLenLeft)}`;
    }
    return `שמ' ${fd.angleLenLeft.toFixed(1)}${angleNote(fd.angleLenLeft)} · ימ' ${fd.angleLenRight.toFixed(1)}${angleNote(fd.angleLenRight)}`;
  };

  const sorted = [...fieldDetails].sort((a, b) => a.index - b.index);

  // —— טבלה 1: שדות (מבנה + הצללה רגילה) ——
  const fieldHead = isMix
    ? `<th class="py-2 px-2 font-bold text-blue-800">מידה רגילה</th>
       <th class="py-2 px-2 font-bold text-blue-800">כמות 20/70</th>
       <th class="py-2 px-2 font-bold text-blue-800">כמות 20/40</th>`
    : shadingP === "none"
      ? ""
      : `<th class="py-2 px-2 font-bold text-blue-800">מידה רגילה</th>
         <th class="py-2 px-2 font-bold text-blue-800">כמות ${singleProfile}</th>`;

  const fieldRows = sorted
    .map((fd) => {
      const shortN = fd.shortSlats.reduce((s, x) => s + x.count, 0);
      const shortBadge =
        shortN > 0
          ? `<span class="text-red-700 font-bold">${shortN} מקוצרים ↓</span>`
          : '<span class="text-slate-400">—</span>';
      let shadeCells = "";
      if (shadingP !== "none") {
        if (fd.fullSlatCount > 0) {
          if (isMix) {
            const { qty70, qty40 } = mixShadeRowUnits(fd.fullSlatCount);
            shadeCells = `<td class="py-2 px-2 text-center font-black">${fd.fullSlatLen.toFixed(1)}</td>
<td class="py-2 px-2 text-center font-black text-blue-800">${qty70}</td>
<td class="py-2 px-2 text-center font-black text-blue-800">${qty40}</td>`;
          } else {
            shadeCells = `<td class="py-2 px-2 text-center font-black">${fd.fullSlatLen.toFixed(1)}</td>
<td class="py-2 px-2 text-center font-black text-blue-800">${fd.fullSlatCount}</td>`;
          }
        } else {
          shadeCells = isMix
            ? `<td class="py-2 px-2 text-center text-slate-400">—</td><td class="py-2 px-2 text-center text-slate-400">—</td><td class="py-2 px-2 text-center text-slate-400">—</td>`
            : `<td class="py-2 px-2 text-center text-slate-400">—</td><td class="py-2 px-2 text-center text-slate-400">—</td>`;
        }
      }
      return `<tr class="border-b border-slate-200">
<td class="py-2 px-2 text-center font-black text-slate-900">${fd.index}</td>
<td class="py-2 px-2 text-center">${fd.fieldNet.toFixed(1)}</td>
<td class="py-2 px-2 text-center text-sm whitespace-nowrap">${formatAngles(fd)}</td>
<td class="py-2 px-2 text-center">${fd.divLenLeft.toFixed(1)}</td>
<td class="py-2 px-2 text-center">${fd.divLenRight.toFixed(1)}</td>
${shadeCells}
<td class="py-2 px-2 text-center text-sm">${shortBadge}</td>
</tr>`;
    })
    .join("");

  // —— טבלה 2: הצללות מקוצרות — מה לחתוך ——
  type ShortCutRow = { field: number; profile: string; len: number; qty: number; side: string };
  const shortCutRows: ShortCutRow[] = [];
  sorted.forEach((fd) => {
    fd.shortSlats.forEach((s) => {
      if (isMix) {
        shortCutRows.push({ field: fd.index, profile: "20/70", len: s.len, qty: s.count, side: fd.shortSide });
        shortCutRows.push({ field: fd.index, profile: "20/40", len: s.len, qty: s.count * 2, side: fd.shortSide });
      } else if (singleProfile) {
        shortCutRows.push({ field: fd.index, profile: singleProfile, len: s.len, qty: s.count, side: fd.shortSide });
      }
    });
  });
  const shortTable =
    shadingP === "none"
      ? ""
      : shortCutRows.length === 0
        ? `<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-500 mb-3">אין הצללות מקוצרות בפרויקט זה</div>`
        : `<div class="overflow-x-auto rounded-lg border-2 border-red-200 bg-white shadow-sm mb-3">
<h5 class="text-sm font-black text-red-800 text-center py-2 bg-red-50 border-b border-red-200">✂️ הצללות מקוצרות — מה לחתוך</h5>
<p class="text-xs text-red-700/80 text-center px-2 py-1">קיצור לקראת חזית (${shortSideGlobal}) · לכל שורה: פרופיל + מידה + כמות</p>
<table class="w-full text-sm border-collapse">
<thead><tr class="bg-red-50 text-red-900 text-xs">
<th class="py-2 px-2 font-bold">שדה</th>
<th class="py-2 px-2 font-bold">פרופיל</th>
<th class="py-2 px-2 font-bold">מידה לחיתוך (ס״מ)</th>
<th class="py-2 px-2 font-bold">כמות</th>
<th class="py-2 px-2 font-bold">צד קיצור</th>
</tr></thead>
<tbody>${shortCutRows
            .map(
              (r) => `<tr class="border-b border-red-100">
<td class="py-2 px-2 text-center font-bold">${r.field}</td>
<td class="py-2 px-2 text-center font-black text-slate-800">${r.profile}</td>
<td class="py-2 px-2 text-center font-black text-red-800 text-base">${r.len.toFixed(1)}</td>
<td class="py-2 px-2 text-center font-black text-emerald-700 text-lg">${r.qty}</td>
<td class="py-2 px-2 text-center text-sm">${r.side}</td>
</tr>`
            )
            .join("")}</tbody>
</table>
</div>`;

  // —— טבלה 3: סיכום כל החיתוכים (רגיל + מקוצר) ——
  type CutSum = { profile: string; len: number; qty: number; kind: "רגיל" | "מקוצר" };
  const cutSum: CutSum[] = [];
  sorted.forEach((fd) => {
    if (fd.fullSlatCount > 0 && shadingP !== "none") {
      if (isMix) {
        cutSum.push({ profile: "20/70", len: fd.fullSlatLen, qty: fd.fullSlatCount, kind: "רגיל" });
        cutSum.push({ profile: "20/40", len: fd.fullSlatLen, qty: fd.fullSlatCount * 2, kind: "רגיל" });
      } else if (singleProfile) {
        cutSum.push({ profile: singleProfile, len: fd.fullSlatLen, qty: fd.fullSlatCount, kind: "רגיל" });
      }
    }
  });
  shortCutRows.forEach((r) => {
    cutSum.push({ profile: r.profile, len: r.len, qty: r.qty, kind: "מקוצר" });
  });
  // איחוד שורות זהות (אותו פרופיל+מידה+סוג)
  const merged = new Map<string, CutSum>();
  cutSum.forEach((c) => {
    const key = `${c.profile}|${c.len.toFixed(1)}|${c.kind}`;
    const prev = merged.get(key);
    if (prev) prev.qty += c.qty;
    else merged.set(key, { ...c });
  });
  const cutSumRows = Array.from(merged.values()).sort((a, b) => {
    if (a.profile !== b.profile) return a.profile.localeCompare(b.profile);
    if (a.kind !== b.kind) return a.kind === "רגיל" ? -1 : 1;
    return b.len - a.len;
  });
  const cutSummaryTable =
    shadingP === "none" || cutSumRows.length === 0
      ? ""
      : `<div class="overflow-x-auto rounded-lg border-2 border-indigo-300 bg-white shadow-sm mb-1">
<h5 class="text-sm font-black text-indigo-900 text-center py-2 bg-indigo-50 border-b border-indigo-200">📋 סיכום לחיתוך — פרופיל · מידה · כמות</h5>
<table class="w-full text-sm border-collapse">
<thead><tr class="bg-indigo-100 text-indigo-900 text-xs">
<th class="py-2 px-2 font-bold">פרופיל</th>
<th class="py-2 px-2 font-bold">מידה (ס״מ)</th>
<th class="py-2 px-2 font-bold">כמות</th>
<th class="py-2 px-2 font-bold">סוג</th>
</tr></thead>
<tbody>${cutSumRows
          .map(
            (c) => `<tr class="border-b border-indigo-100 ${c.kind === "מקוצר" ? "bg-red-50/40" : ""}">
<td class="py-2 px-2 text-center font-black">${c.profile}</td>
<td class="py-2 px-2 text-center font-black text-base">${c.len.toFixed(1)}</td>
<td class="py-2 px-2 text-center font-black text-emerald-700 text-xl">${c.qty}</td>
<td class="py-2 px-2 text-center text-sm font-bold ${c.kind === "מקוצר" ? "text-red-700" : "text-blue-700"}">${c.kind}</td>
</tr>`
          )
          .join("")}</tbody>
</table>
</div>`;

  const mixNote = isMix
    ? `<p class="text-xs text-slate-600 mb-2 text-center">משולב: בכל שורת הצללה = <strong>1× 20/70 + 2× 20/40</strong> · הכמויות בטבלאות כבר מופרדות לפי פרופיל</p>`
    : "";

  return `<div class="w-full max-w-3xl mt-3 space-y-1" dir="rtl">
<h4 class="text-base font-black text-slate-800 mb-1 text-center">הצללה בטרפז — סדר עבודה</h4>
${mixNote}
<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm mb-3">
<h5 class="text-sm font-bold text-slate-700 text-center py-2 bg-slate-50 border-b">1) טבלת שדות</h5>
<table class="w-full text-sm border-collapse">
<thead><tr class="bg-slate-100 text-slate-600 text-xs">
<th class="py-2 px-2 font-bold">שדה</th>
<th class="py-2 px-2 font-bold">שבלונה</th>
<th class="py-2 px-2 font-bold">זווית 30/30</th>
<th class="py-2 px-2 font-bold">חציץ שמ'</th>
<th class="py-2 px-2 font-bold">חציץ ימ'</th>
${fieldHead}
<th class="py-2 px-2 font-bold text-red-700">מקוצרים</th>
</tr></thead>
<tbody>${fieldRows}</tbody>
</table>
</div>
${shortTable}
${cutSummaryTable}
</div>`;
}

function calcPergola(pergola: PergolaInput, settings?: PergolaSettings | null, vatRate: number = DEFAULT_VAT_DECIMAL): {
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
  shadeSlatPlanHtml: string;
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
  const { yetziaSmol: yL, yetziaYamin: yR } = resolvePergolaExits(pergola);
  const isLShape = bool(pergola.isLShape, false);
  const isUShape = bool(pergola.isUShape, false);
  const isLCorner = isLShape && !isUShape;
  const trapezoidMode = bool(pergola.trapezoidMode, false);
  const isTrapezoid = trapezoidMode && !isLShape && !isUShape && inputL > 0 && Math.abs(yL - yR) > 1e-6;
  const lW = isLCorner || isUShape ? num(pergola.lWallWidth, 0) : 0;
  const uNotch = isUShape ? resolveUNotchDepths(pergola) : { left: 0, right: 0 };
  const uDL = uNotch.left;
  const uDR = uNotch.right;
  const lD = isLCorner ? num(pergola.lWallDepth, 0) : 0;
  const isLLeft = str(pergola.lShapeSide, "right") === "left";
  const uWings = isUShape
    ? resolveUShapeWings(inputL, lW, optionalPositive(pergola.uWingWallLeft), optionalPositive(pergola.uWingWallRight))
    : { left: 0, right: 0 };
  const wingWallLeft = uWings.left;
  const wingWallRight = uWings.right;
  const L = isLCorner ? inputL + lW : inputL;
  const W = isTrapezoid ? (yL + yR) / 2 : inputW > 0 ? inputW : yL;
  const sqm = isUShape
    ? uShapeSqmArea(wingWallLeft, lW, wingWallRight, W, uDL, uDR)
    : isLCorner
    ? ((L * W) - lW * lD) / 10000
    : isTrapezoid
      ? ((yL + yR) / 2 * inputL) / 10000
      : (L * W) / 10000;
  const frameColorText = RAL_OPTIONS.includes(str(pergola.colorSelect, "")) ? str(pergola.colorSelect, "RAL 9016") : "כסף מטאלי (9006)";
  const shadeColorText = RAL_OPTIONS.includes(str(pergola.shadeColorSelect, "")) ? str(pergola.shadeColorSelect, "RAL 9016") : "כסף מטאלי (9006)";
  const frameType = str(pergola.frameType, "doubleT");
  const isDoubleT = frameType.startsWith("doubleT");
  const trapMetrics = isTrapezoid ? calcTrapezoidMetrics(inputL, yL, yR) : null;
  const divDed = isDoubleT ? 11 : 8;
  const cutDividerAt = (x: number) =>
    isTrapezoid ? depthAtTrapezoid(yL, yR, inputL, x) - divDed : W - divDed;
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
  /** גבהי עמודים: פסיק, נקודה-פסיק, קו אנכי, או רווחים — לא חייב פסיק במקלדת */
  const postHeights: number[] = (() => {
    const t = postHeightRaw.trim();
    if (!t) return [];
    return t
      .split(/[,;|\s]+/)
      .map((h) => h.trim())
      .filter(Boolean)
      .map((h) => parseFloat(h.replace(",", ".")))
      .filter((h) => !isNaN(h));
  })();
  while (postHeights.length < pCount) postHeights.push(0);
  const tCount = parseInt(String(pergola.tensionerCount ?? ""), 10) || 0;
  const cutL_Wall = isDoubleT ? (isLCorner ? L - 3 : isUShape ? inputL - 6 : L - 6) : L;
  const cutFront = isTrapezoid && trapMetrics ? trapMetrics.frontLength : L;
  const sideLen = isDoubleT ? W + 3 : W;
  const sideLenLeft = isTrapezoid ? (isDoubleT ? yL + 3 : yL) : isUShape ? (isDoubleT ? W + uDL + 3 : W + uDL) : sideLen;
  const sideLenRight = isTrapezoid ? (isDoubleT ? yR + 3 : yR) : isUShape ? (isDoubleT ? W + uDR + 3 : W + uDR) : sideLen;
  const junction1U = wingWallLeft;
  const junction2U = wingWallLeft + lW;
  const cutDivider = W - divDed;
  const divThickness = 4;
  const frameDedHalf = isDoubleT ? 7 : 4;
  const frameDeduction = isDoubleT ? 14 : 8;
  const autoDividerCount = isUShape
    ? fieldsPerZoneWidth(wingWallLeft) + fieldsPerZoneWidth(lW) + fieldsPerZoneWidth(wingWallRight) - 1
    : isLCorner
      ? Math.max(1, Math.ceil(inputL / 120)) + Math.max(1, Math.ceil(lW / 120)) - 1
      : L > 0
        ? Math.ceil(L / 120) - 1
        : 0;
  const hasLed = bool(pergola.hasLed, false);
  const hasSantaf = bool(pergola.hasSantaf, false);
  const smoothRaw = str(pergola.dividerSmoothCount, "").trim();
  const ledDivRaw = str(pergola.dividerLedCount, "").trim();
  const ledStripQty = parseInt(String(pergola.ledCount ?? ""), 10);
  const hasSmoothExplicit = smoothRaw !== "";
  const hasLedDivExplicit = ledDivRaw !== "";
  const hasLedStripExplicit = Number.isFinite(ledStripQty) && ledStripQty >= 0;

  /** ברירת מחדל לתצוגה: אם יש כמות לד — מפצלים חלק/לד; בלי כמות — כל החציצים לד */
  const defaultLedWhenHasLed = hasLedStripExplicit
    ? Math.min(ledStripQty, autoDividerCount)
    : autoDividerCount;
  const autoLedBase = hasLed ? defaultLedWhenHasLed : 0;
  const autoSmoothBase = hasLed ? Math.max(0, autoDividerCount - autoLedBase) : autoDividerCount;

  let countSmooth: number;
  let countLed: number;
  if (hasSmoothExplicit && hasLedDivExplicit) {
    countSmooth = parseInt(smoothRaw, 10) || 0;
    countLed = parseInt(ledDivRaw, 10) || 0;
  } else if (hasLedDivExplicit) {
    countLed = parseInt(ledDivRaw, 10) || 0;
    countSmooth = hasSmoothExplicit
      ? parseInt(smoothRaw, 10) || 0
      : Math.max(0, autoDividerCount - countLed);
  } else if (hasSmoothExplicit) {
    countSmooth = parseInt(smoothRaw, 10) || 0;
    countLed = hasLed ? Math.max(0, autoDividerCount - countSmooth) : 0;
  } else if (hasLed) {
    countLed = autoLedBase;
    countSmooth = autoSmoothBase;
  } else {
    countSmooth = autoDividerCount;
    countLed = 0;
  }
  const nDividersTotal = countSmooth + countLed;
  const nFieldsTotal = nDividersTotal + 1;
  let dividerPositions: number[] = [];
  let fieldWidths: FieldWidth[] = [];
  let fullDividers = 0, shortDividers = 0;
  if (isUShape && inputL > 0 && lW > 0 && wingWallLeft > 0 && wingWallRight > 0) {
    let { nLeft, nCenter, nRight } = resolveUShapeZoneCounts(wingWallLeft, lW, wingWallRight, nFieldsTotal);
    const junction1 = wingWallLeft;
    const junction2 = wingWallLeft + lW;
    const halfW = lW / 2;
    const asymmetricNotch = Math.abs(uDL - uDR) > 0.5;
    if (asymmetricNotch && nCenter < 2 && nFieldsTotal >= 3) {
      nCenter = 2;
      if (nLeft + nCenter + nRight > nFieldsTotal) {
        if (nRight > nLeft && nRight > 1) nRight--;
        else if (nLeft > 1) nLeft--;
        else if (nRight > 1) nRight--;
      }
    }
    const netLeft = (wingWallLeft - frameDedHalf - divThickness - (nLeft - 1) * divThickness) / nLeft;
    const netCenter = (lW - (nCenter - 1) * divThickness) / nCenter;
    const netRight = (wingWallRight - frameDedHalf - divThickness - (nRight - 1) * divThickness) / nRight;
    fieldWidths.push({ name: "כנף שמאל", net: netLeft, isShort: false, count: nLeft, totalW: wingWallLeft });
    if (asymmetricNotch && nCenter >= 2) {
      const nCenterLeft = Math.ceil(nCenter / 2);
      const nCenterRight = nCenter - nCenterLeft;
      const midDivider = nCenterLeft > 0 && nCenterRight > 0 ? divThickness : 0;
      const netCenterLeft =
        (halfW - midDivider - Math.max(0, nCenterLeft - 1) * divThickness) / Math.max(1, nCenterLeft);
      const netCenterRight =
        (halfW - midDivider - Math.max(0, nCenterRight - 1) * divThickness) / Math.max(1, nCenterRight);
      fieldWidths.push({ name: "מגרעת שמאל", net: netCenterLeft, isShort: true, count: nCenterLeft, totalW: halfW });
      fieldWidths.push({ name: "מגרעת ימין", net: netCenterRight, isShort: true, count: nCenterRight, totalW: halfW });
    } else {
      fieldWidths.push({ name: "מגרעת מרכז", net: netCenter, isShort: true, count: nCenter, totalW: lW });
    }
    fieldWidths.push({ name: "כנף ימין", net: netRight, isShort: false, count: nRight, totalW: wingWallRight });
    for (let i = 1; i < nLeft; i++) dividerPositions.push(i * (wingWallLeft / nLeft));
    dividerPositions.push(junction1);
    for (let i = 1; i < nCenter; i++) dividerPositions.push(junction1 + i * (lW / nCenter));
    dividerPositions.push(junction2);
    for (let i = 1; i < nRight; i++) dividerPositions.push(junction2 + i * (wingWallRight / nRight));
    fieldWidths = renumberUShapeFieldsRtl(fieldWidths, dividerPositions, L, wingWallLeft, lW);
  } else if (isLCorner && L > 0) {
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
  dividerPositions.forEach((x) => {
    if (isUShape) shortDividers++;
    else if (isLCorner && lShapeDividerIsShort(x, isLLeft, lW, inputL)) shortDividers++;
    else fullDividers++;
  });
  let cuttingHtml = "";
  const shadeSlatPlans: ShadeSlatPlanItem[] = [];
  const wallDisplayName = isDoubleT ? "120/40 חלק (L קיר)" : frameProfileName;
  const frameWtsForCut = isDoubleT ? weightsMap.doubleT : weightsMap.smooth120_frame;
  const wallWtsForCut = weightsMap.smooth120_frame;
  const divWtsForCut = dividerSize === "100" ? weightsMap.smooth100_div : weightsMap.smooth120_div;
  const cutRow = buildCutRowHtml;
  /** הזמנת מחסן בניצול משותף לפי פרופיל+צבע — בטבלת חיתוך לא מציגים מוט נפרד לכל שורה */
  const cutBar = (..._args: unknown[]) => SHARED_NEST_BAR_LABEL;
  if (L > 0 && W > 0) {
    if (!isLCorner && !isUShape) {
      cuttingHtml += cutRow(wallDisplayName, "מסגרת קיר", 1, cutL_Wall, cutBar(cutL_Wall, 1, wallWtsForCut));
      if (isTrapezoid && trapMetrics) {
        const grungNote = `גרונג שמאל ${trapMetrics.cutAngleLeft.toFixed(1)}° / ימין ${trapMetrics.cutAngleRight.toFixed(1)}°`;
        cuttingHtml += cutRow(frameProfileName, `חזית (${grungNote})`, 1, cutFront, cutBar(cutFront, 1, frameWtsForCut));
        cuttingHtml += cutRow(
          frameProfileName,
          `צד שמאל (גרונג חזית ${trapMetrics.sideCutAngleLeft.toFixed(1)}°)`,
          1,
          sideLenLeft,
          cutBar(sideLenLeft, 1, frameWtsForCut)
        );
        cuttingHtml += cutRow(
          frameProfileName,
          `צד ימין (גרונג חזית ${trapMetrics.sideCutAngleRight.toFixed(1)}°)`,
          1,
          sideLenRight,
          cutBar(sideLenRight, 1, frameWtsForCut)
        );
      } else {
        cuttingHtml += cutRow(frameProfileName, "חזית", 1, cutFront, cutBar(cutFront, 1, frameWtsForCut));
        cuttingHtml += cutRow(frameProfileName, "צדדים", 2, sideLen, cutBar(sideLen, 2, frameWtsForCut));
      }
    } else if (isUShape) {
      if (wingWallLeft > 0) cuttingHtml += cutRow(wallDisplayName, "קיר כנף שמאל", 1, wingWallLeft, cutBar(wingWallLeft, 1, wallWtsForCut));
      if (wingWallRight > 0) cuttingHtml += cutRow(wallDisplayName, "קיר כנף ימין", 1, wingWallRight, cutBar(wingWallRight, 1, wallWtsForCut));
      if (lW > 0) {
        cuttingHtml += cutRow(wallDisplayName, "מגרעת - קיר עליון (L)", 1, lW, cutBar(lW, 1, wallWtsForCut), "bg-orange-50");
      }
      cuttingHtml += cutRow(frameProfileName, "חזית שלמה", 1, cutFront, cutBar(cutFront, 1, frameWtsForCut));
      cuttingHtml += cutRow(frameProfileName, "צד שמאל (כנף)", 1, sideLenLeft, cutBar(sideLenLeft, 1, frameWtsForCut));
      cuttingHtml += cutRow(frameProfileName, "צד ימין (כנף)", 1, sideLenRight, cutBar(sideLenRight, 1, frameWtsForCut));
      if (uDL > 0) cuttingHtml += cutRow(wallDisplayName, "פינת מגרעת שמאל (L קיר)", 1, uDL, cutBar(uDL, 1, wallWtsForCut), "bg-orange-50");
      if (uDR > 0) cuttingHtml += cutRow(wallDisplayName, "פינת מגרעת ימין (L קיר)", 1, uDR, cutBar(uDR, 1, wallWtsForCut), "bg-orange-50");
    } else {
      cuttingHtml += cutRow(wallDisplayName, "קיר ראשי", 1, cutL_Wall - lW, cutBar(cutL_Wall - lW, 1, wallWtsForCut));
      cuttingHtml += cutRow(wallDisplayName, "מגרעת - עומק", 1, lD, cutBar(lD, 1, wallWtsForCut), "bg-orange-50");
      cuttingHtml += cutRow(wallDisplayName, "מגרעת - רוחב", 1, lW, cutBar(lW, 1, wallWtsForCut), "bg-orange-50");
      cuttingHtml += cutRow(frameProfileName, "חזית שלמה", 1, cutFront, cutBar(cutFront, 1, frameWtsForCut));
      cuttingHtml += cutRow(frameProfileName, "צד פנים קיר (צד ארוך)", 1, sideLen, cutBar(sideLen, 1, frameWtsForCut));
      cuttingHtml += cutRow(frameProfileName, "צד פנים חזית (צד קצר)", 1, sideLen - lD, cutBar(sideLen - lD, 1, frameWtsForCut));
    }
    if (nDividersTotal > 0) {
      const divProfileSmooth = `חציצים ${divSizeName} חלק`;
      const divProfileLed = `חציצים ${divSizeName} לד`;
      if (isTrapezoid && !isLCorner && !isUShape) {
        const bucketDivCuts = (profile: string, label: string, typeCount: number, startIdx: number) => {
          const buckets = new Map<number, number>();
          for (let i = 0; i < typeCount; i++) {
            const idx = startIdx + i;
            if (idx >= dividerPositions.length) break;
            const len = Math.round(cutDividerAt(dividerPositions[idx]) * 10) / 10;
            buckets.set(len, (buckets.get(len) || 0) + 1);
          }
          buckets.forEach((qty, len) => {
            cuttingHtml += cutRow(profile, label, qty, len, cutBar(len, qty, divWtsForCut));
          });
        };
        if (countSmooth > 0) bucketDivCuts(divProfileSmooth, "חציצים חלק", countSmooth, 0);
        if (countLed > 0) bucketDivCuts(divProfileLed, "חציצים לד", countLed, countSmooth);
      } else if (isUShape) {
        const bucketUDivCuts = (profile: string, label: string, typeCount: number, startIdx: number) => {
          const buckets = new Map<number, number>();
          for (let i = 0; i < typeCount; i++) {
            const idx = startIdx + i;
            if (idx >= dividerPositions.length) break;
            const len =
              Math.round(
                uDividerCutLen(dividerPositions[idx], junction1U, junction2U, W, uDL, uDR, divDed) * 10
              ) / 10;
            buckets.set(len, (buckets.get(len) || 0) + 1);
          }
          buckets.forEach((qty, len) => {
            cuttingHtml += cutRow(profile, label, qty, len, cutBar(len, qty, divWtsForCut));
          });
        };
        if (countSmooth > 0) bucketUDivCuts(divProfileSmooth, "חציצים חלק", countSmooth, 0);
        if (countLed > 0) bucketUDivCuts(divProfileLed, "חציצים לד", countLed, countSmooth);
      } else {
      /** מחלק חציצים מלאים/קצרים לפי כמות חלק מול לד */
      const splitByType = (typeCount: number) => {
        if (typeCount <= 0 || nDividersTotal <= 0) return { full: 0, short: 0 };
        if (countSmooth === 0 || countLed === 0) {
          return { full: fullDividers, short: shortDividers };
        }
        const full = Math.round((fullDividers * typeCount) / nDividersTotal);
        const short = Math.max(0, typeCount - full);
        return { full, short };
      };
      const addDivCuts = (profile: string, purposeFull: string, purposeShort: string, typeCount: number) => {
        const { full, short } = splitByType(typeCount);
        if (full > 0) {
          cuttingHtml += cutRow(profile, purposeFull, full, cutDivider, cutBar(cutDivider, full, divWtsForCut));
        }
        if (short > 0) {
          const shortLen = isUShape ? cutDivider : cutDivider - lD;
          cuttingHtml += cutRow(
            profile,
            purposeShort,
            short,
            shortLen,
            cutBar(shortLen, short, divWtsForCut)
          );
        }
      };
      if (countSmooth > 0) {
        addDivCuts(
          divProfileSmooth,
          isUShape ? "חציצים חלק (כל האזורים)" : "חציצים חלק (אורך מלא)",
          isUShape ? "חציצים חלק (כל האזורים)" : "חציצים חלק (אזור מגרעת)",
          countSmooth
        );
      }
      if (countLed > 0) {
        addDivCuts(
          divProfileLed,
          isUShape ? "חציצים לד (כל האזורים)" : "חציצים לד (אורך מלא)",
          isUShape ? "חציצים לד (כל האזורים)" : "חציצים לד (אזור מגרעת)",
          countLed
        );
      }
      }
    }
    // זוויות — מאחדים מידות זהות (במיוחד U / טרפז) עם סה״כ + שדות בצד
    {
      const angleBuckets = new Map<number, CutLenFieldBucket>();
      if (isTrapezoid && !isLCorner && !isUShape && fieldWidths.length > 0) {
        const allEdges = [0, ...dividerPositions, L];
        const nTrapFields = allEdges.length - 1;
        for (let fi = 0; fi < nTrapFields; fi++) {
          const d0 = cutDividerAt(allEdges[fi]);
          const d1 = cutDividerAt(allEdges[fi + 1]);
          const angleLeft = Math.round((d0 - 1.5) * 10) / 10;
          const angleRight = Math.round((d1 - 1.5) * 10) / 10;
          const fieldLabel = `שדה ${nTrapFields - fi}`;
          addToCutLenBucket(angleBuckets, angleLeft, 1, fieldLabel);
          addToCutLenBucket(angleBuckets, angleRight, 1, fieldLabel);
        }
      } else if (fieldWidths.length > 0) {
        fieldWidths.forEach((fw) => {
          const divCutLen = isUShape
            ? uShapeFieldDividerCutLen(fw, junction1U, junction2U, W, uDL, uDR, divDed)
            : isLCorner
              ? fw.isShort
                ? cutDivider - lD
                : cutDivider
              : cutDivider;
          const angleLen = Math.round((divCutLen - 1.5) * 10) / 10;
          const nAng = fw.count * 2;
          const fieldLabel = isLCorner || isUShape ? fw.name : "";
          addToCutLenBucket(angleBuckets, angleLen, nAng, fieldLabel);
        });
      } else {
        addToCutLenBucket(angleBuckets, Math.round((cutDivider - 1.5) * 10) / 10, nFieldsTotal * 2, "");
      }
      Array.from(angleBuckets.entries())
        .sort((a, b) => b[0] - a[0])
        .forEach(([angleLen, bucket]) => {
          const fieldsNote = formatFieldsCutNote(bucket.fields);
          const purpose = fieldsNote ? `תמיכה — ${fieldsNote}` : "תמיכה";
          cuttingHtml += cutRow(
            "זווית 30/30",
            purpose,
            bucket.qty,
            angleLen,
            cutBar(angleLen, bucket.qty, weightsMap.angle)
          );
        });
    }
    if (hasSantaf) {
      const prepDeduction = isDoubleT ? 10 : 4;
      if (isUShape) {
        const depthWingLeft = W + uDL + 15;
        const depthWingRight = W + uDR + 15;
        const depthCenter = W + 15;
        const countWingLeft = Math.ceil(depthWingLeft / 50);
        const countWingRight = Math.ceil(depthWingRight / 50);
        const countCenter = Math.ceil(depthCenter / 50);
        if (wingWallLeft > 0) {
          const cutLeft = wingWallLeft - prepDeduction;
          cuttingHtml += cutRow("20/40 (הכנה לסנטף - כנף)", "תשתית כנף שמאל", countWingLeft, cutLeft, cutBar(cutLeft, countWingLeft, weightsMap.s20x40), "bg-green-50");
        }
        if (wingWallRight > 0) {
          const cutRight = wingWallRight - prepDeduction;
          cuttingHtml += cutRow("20/40 (הכנה לסנטף - כנף)", "תשתית כנף ימין", countWingRight, cutRight, cutBar(cutRight, countWingRight, weightsMap.s20x40), "bg-green-50");
        }
        if (lW > 0) {
          const cutCenter = lW - prepDeduction;
          cuttingHtml += cutRow("20/40 (הכנה לסנטף - מרכז)", "תשתית לאזור מגרעת", countCenter, cutCenter, cutBar(cutCenter, countCenter, weightsMap.s20x40), "bg-green-50");
        }
      } else if (isLCorner) {
        const depthLong = (W - lD) + 15;
        const depthNotch = lD + 15;
        const countFull = Math.ceil(depthLong / 50);
        const cutFull = L - prepDeduction;
        const countShort = Math.ceil(depthNotch / 50);
        const cutShort = (L - lW) - prepDeduction;
        cuttingHtml += cutRow("20/40 (הכנה לסנטף - ארוך)", "תשתית לאזור חזית מלא", countFull, cutFull, cutBar(cutFull, countFull, weightsMap.s20x40), "bg-green-50");
        cuttingHtml += cutRow("20/40 (הכנה לסנטף - קצר)", "תשתית לאזור המגרעת", countShort, cutShort, cutBar(cutShort, countShort, weightsMap.s20x40), "bg-green-50");
      } else if (isTrapezoid) {
        // תשתית לפי היציאה הארוכה (+15) — כדי לכסות את כל השיפוע
        const prepCount = Math.ceil((Math.max(yL, yR) + SANTAF_OVERHANG_CM) / 50);
        const cutSantafPrep = L - prepDeduction;
        cuttingHtml += cutRow("20/40 (הכנה לסנטף)", "תשתית לסנטף", prepCount, cutSantafPrep, cutBar(cutSantafPrep, prepCount, weightsMap.s20x40), "bg-green-50");
      } else {
        const prepCount = Math.ceil((W + 15) / 50);
        const cutSantafPrep = L - prepDeduction;
        cuttingHtml += cutRow("20/40 (הכנה לסנטף)", "תשתית לסנטף", prepCount, cutSantafPrep, cutBar(cutSantafPrep, prepCount, weightsMap.s20x40), "bg-green-50");
      }
    }
  }
  const postType = str(pergola.postType, "100");
  if (pCount > 0) {
    const heightCounts: Record<string, number> = {};
    postHeights.slice(0, pCount).forEach((h) => { heightCounts[String(h)] = (heightCounts[String(h)] || 0) + 1; });
    Object.entries(heightCounts).forEach(([hStr, count]) => {
      const hNum = parseFloat(hStr);
      const cutDisplay = hNum > 0 ? undefined : "למידה בשטח";
      cuttingHtml += cutRow(`${postType}/${postType}`, "עמודי תמיכה", count, hNum, "6 מ׳", "bg-slate-50", cutDisplay);
    });
  }
  let instructionsShades = "";
  const shadingP = str(pergola.shadingProfile, "20x40");
  if (shadingP !== "none" && cutDivider > 0 && fieldWidths.length > 0) {
    const profW = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
    const setW = shadingP === "mix" ? 7 + 4 + 4 + space * 3 : profW + space;
    if (isTrapezoid && !isLCorner && !isUShape) {
      const allEdges = [0, ...dividerPositions, L];
      const fieldNet = fieldWidths[0]?.net ?? 0;
      const cutBuckets = new Map<number, number>();
      for (let fi = 0; fi < allEdges.length - 1; fi++) {
        const x0 = allEdges[fi];
        const x1 = allEdges[fi + 1];
        const d0 = cutDividerAt(x0);
        const d1 = cutDividerAt(x1);
        const rowLens = collectTrapezoidShadeRows(x0, x1, fieldNet, setW, L, yL, yR, divDed);
        if (fieldWidths[0]) {
          (fieldWidths[0] as FieldWidth & { nShadeSets?: number }).nShadeSets = rowLens.length;
          if (rowLens.length > 0) {
            (fieldWidths[0] as FieldWidth & { shadeCutLen?: number }).shadeCutLen = Math.min(...rowLens);
          }
        }
        rowLens.forEach((len) => cutBuckets.set(len, (cutBuckets.get(len) || 0) + 1));
        if (rowLens.length > 0) {
          const { fullSlatCount, fullSlatLen, shortSlats } = summarizeTrapezoidFieldShades(rowLens, fieldNet);
          const shortTotal = shortSlats.reduce((s, x) => s + x.count, 0);
          const angleLeft = Math.round((d0 - 1.5) * 10) / 10;
          const angleRight = Math.round((d1 - 1.5) * 10) / 10;
          const angleTxt =
            Math.abs(angleLeft - angleRight) < 0.05
              ? `2× ${angleLeft.toFixed(1)} ס"מ`
              : `שמ' ${angleLeft.toFixed(1)} · ימ' ${angleRight.toFixed(1)} ס"מ`;
          const fieldNumRtl = allEdges.length - 1 - fi;
          const qtyLine =
            shadingP === "mix"
              ? mixShadeQtyPlain(rowLens.length)
              : shadingP === "20x70"
                ? `${rowLens.length} יח' 20/70`
                : `${rowLens.length} יח' 20/40`;
          const regularLine =
            fullSlatCount > 0
              ? shadingP === "mix"
                ? `רגיל ${fullSlatLen.toFixed(1)}: ${mixShadeQtyPlain(fullSlatCount)}`
                : `רגיל ${fullSlatLen.toFixed(1)}: ${fullSlatCount} יח'`
              : "";
          const shortLine =
            shortTotal > 0
              ? shortSlats
                  .map((s) =>
                    shadingP === "mix"
                      ? `${s.len.toFixed(1)} ← ${mixShadeQtyPlain(s.count)}`
                      : `${s.count}×${s.len.toFixed(1)}`
                  )
                  .join(" · ")
              : "";
          instructionsShades += `<div class="instruction-item text-indigo-800 font-bold bg-indigo-50 p-2 rounded border border-indigo-200 mt-1 mb-1 w-full"><strong>שדה ${fieldNumRtl}</strong>: שבלונה ${fieldNet.toFixed(1)} · ${qtyLine}<br><span class="text-amber-800 font-bold">זווית 30/30: ${angleTxt}</span>${regularLine ? `<br><span class="text-blue-800 text-sm">${regularLine}</span>` : ""}${shortLine ? `<br><span class="text-red-700 text-sm">מקוצרים: ${shortLine}</span>` : ""}</div>`;
        }
      }
      const pushBucketCuts = (profileLabel: string, purpose: string, qtyMul: number) => {
        Array.from(cutBuckets.entries())
          .sort((a, b) => b[0] - a[0])
          .forEach(([cutLen, qty]) => {
            const totalQty = qty * qtyMul;
            shadeSlatPlans.push({ label: `${profileLabel}${purpose}`, cutLenCm: cutLen, totalQty });
            cuttingHtml += cutRow(profileLabel + purpose, "שלבים", totalQty, cutLen, "6 מ׳", "bg-blue-50");
          });
      };
      if (shadingP === "20x40") pushBucketCuts("הצללה 20/40", "", 1);
      else if (shadingP === "20x70") pushBucketCuts("הצללה 20/70", "", 1);
      else {
        pushBucketCuts("הצללה 20/70", "", 1);
        pushBucketCuts("הצללה 20/40", "", 2);
      }
    } else {
    // U / L / מלבן — מאחדים שלבים באותה מידת חיתוך, עם רשימת שדות בצד
    type ShadeCutBucket = { qty70: number; qty40: number; fields: string[] };
    const shadeBuckets = new Map<number, ShadeCutBucket>();
    fieldWidths.forEach((fw) => {
      const cutLen = fw.net > 1 ? fw.net - 1 : 0;
      (fw as FieldWidth & { shadeCutLen?: number }).shadeCutLen = cutLen;
      const fieldDepth = isUShape
        ? uFieldExitDepthFor(fw, wingWallLeft, wingWallLeft + lW, W, uDL, uDR) - divDed
        : fw.isShort
          ? cutDivider - lD
          : cutDivider;
      (fw as FieldWidth & { nShadeSets?: number }).nShadeSets = Math.floor(fieldDepth / setW);
      const nSet = (fw as FieldWidth & { nShadeSets?: number }).nShadeSets ?? 0;
      const shadeHeader = isUShape ? `<strong>${fw.name}</strong>` : `שדות <strong>${fw.name}</strong> (${fw.count})`;
      const shadeQtyLine = isUShape
        ? `${nSet} שלבים`
        : `בכל שדה: ${nSet} יח' 20/40 (סה"כ ${nSet} שלבים לשדה).`;
      if (shadingP === "20x40") {
        instructionsShades += `<div class="instruction-item text-indigo-800 font-bold bg-indigo-50 p-2 rounded border border-indigo-200 mt-1 mb-1 w-full">${shadeHeader}: שבלונה <span class="text-lg mx-1 text-indigo-900">${fw.net.toFixed(1)} ס"מ</span> | חיתוך <span class="text-lg mx-1 text-indigo-900">${cutLen.toFixed(1)} ס"מ</span><br><span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded mt-1 inline-block">${isUShape ? `${nSet} יח' 20/40 (${shadeQtyLine}).` : shadeQtyLine}</span></div>`;
      } else if (shadingP === "20x70") {
        instructionsShades += `<div class="instruction-item text-indigo-800 font-bold bg-indigo-50 p-2 rounded border border-indigo-200 mt-1 mb-1 w-full">${shadeHeader}: שבלונה <span class="text-lg mx-1 text-indigo-900">${fw.net.toFixed(1)} ס"מ</span> | חיתוך <span class="text-lg mx-1 text-indigo-900">${cutLen.toFixed(1)} ס"מ</span><br><span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded mt-1 inline-block">${isUShape ? `${nSet} יח' 20/70 (${shadeQtyLine}).` : `בכל שדה: ${nSet} יח' 20/70 (סה"כ ${nSet} שלבים לשדה).`}</span></div>`;
      } else {
        const perField70 = nSet;
        const perField40 = nSet * 2;
        instructionsShades += `<div class="instruction-item text-indigo-800 font-bold bg-indigo-50 p-2 rounded border border-indigo-200 mt-1 mb-1 w-full">${shadeHeader}: שבלונה <span class="text-lg mx-1 text-indigo-900">${fw.net.toFixed(1)} ס"מ</span> | חיתוך <span class="text-lg mx-1 text-indigo-900">${cutLen.toFixed(1)} ס"מ</span><br><span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded mt-1 inline-block">${isUShape ? `${perField70} יח' 20/70, ${perField40} יח' 20/40 (${shadeQtyLine}).` : `בכל שדה: ${perField70} יח' 20/70, ${perField40} יח' 20/40 (סה"כ ${perField70 + perField40} שלבים לשדה · משולב 70+40+40).`}</span></div>`;
      }
      if (!(cutLen > 0) || !(nSet > 0)) return;
      const key = Math.round(cutLen * 10) / 10;
      const b = shadeBuckets.get(key) || { qty70: 0, qty40: 0, fields: [] };
      const fieldLabel = isLCorner || isUShape ? fw.name : "";
      if (fieldLabel && !b.fields.includes(fieldLabel)) b.fields.push(fieldLabel);
      if (shadingP === "20x40") b.qty40 += nSet * fw.count;
      else if (shadingP === "20x70") b.qty70 += nSet * fw.count;
      else {
        b.qty70 += nSet * fw.count;
        b.qty40 += nSet * 2 * fw.count;
      }
      shadeBuckets.set(key, b);
    });
    Array.from(shadeBuckets.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([cutLen, bucket]) => {
        const fieldsNote = formatFieldsCutNote(bucket.fields);
        const purpose = fieldsNote ? `שלבים — ${fieldsNote}` : "שלבים";
        if (bucket.qty70 > 0) {
          shadeSlatPlans.push({
            label: fieldsNote ? `הצללה 20/70 — ${fieldsNote}` : "הצללה 20/70 — שלבים",
            cutLenCm: cutLen,
            totalQty: bucket.qty70,
          });
          cuttingHtml += cutRow("הצללה 20/70", purpose, bucket.qty70, cutLen, "6 מ׳", "bg-blue-50");
        }
        if (bucket.qty40 > 0) {
          shadeSlatPlans.push({
            label: fieldsNote ? `הצללה 20/40 — ${fieldsNote}` : "הצללה 20/40 — שלבים",
            cutLenCm: cutLen,
            totalQty: bucket.qty40,
          });
          cuttingHtml += cutRow("הצללה 20/40", purpose, bucket.qty40, cutLen, "6 מ׳", "bg-blue-50");
        }
      });
    }
  }
  const shadeSlatPlanHtml = buildShadeSlatPlanHtml(shadeSlatPlans);
  const totalShadeProfiles = isTrapezoid && !isLCorner && !isUShape && shadingP !== "none"
    ? (() => {
        const profW = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
        const setW = shadingP === "mix" ? 7 + 4 + 4 + space * 3 : profW + space;
        const allEdges = [0, ...dividerPositions, L];
        const fieldNet = fieldWidths[0]?.net ?? 0;
        let sum = 0;
        for (let fi = 0; fi < allEdges.length - 1; fi++) {
          const rowLens = collectTrapezoidShadeRows(
            allEdges[fi],
            allEdges[fi + 1],
            fieldNet,
            setW,
            L,
            yL,
            yR,
            divDed
          );
          sum += rowLens.length * (shadingP === "mix" ? 3 : 1);
        }
        return sum;
      })()
    : fieldWidths.reduce((acc, fw) => acc + ((fw as FieldWidth & { nShadeSets?: number }).nShadeSets ?? 0) * (shadingP === "mix" ? 3 : 1) * fw.count, 0);
  const screwsCount = totalShadeProfiles * 2;
  const uBracketCount = nDividersTotal * 2;
  const spiderCornerCount = isUShape ? 8 : isLCorner ? 6 : 4;
  const anglesCount = nFieldsTotal * 2;
  const screwTotalCost = (screwsCount / 1000) * sysScrew;
  const tensionerColor = str(pergola.tensionerColor, "");
  let hardwareHtml = `<div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>ברגי מש"ד (להצללות):</span> <strong class="text-emerald-700 text-lg">${screwsCount} יח'</strong> <span class="text-xs text-gray-500">(₪${Math.round(screwTotalCost)})</span></div><div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>תושבת U (לבסיס):</span> <strong class="text-emerald-700 text-lg">${uBracketCount} יח'</strong></div><div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>פינות עכביש:</span> <strong class="text-emerald-700 text-lg">${spiderCornerCount} יח'</strong></div><div class="flex justify-between items-center bg-slate-50 p-2 rounded border"><span>זוויות 30/30:</span> <strong class="text-emerald-700 text-lg">${anglesCount} יח'</strong></div>`;
  if (tCount > 0) hardwareHtml += `<div class="flex justify-between items-center bg-blue-50 border-blue-200 p-2 rounded border"><span>מותחנים (גוון ${tensionerColor || "-"}):</span> <strong class="text-blue-700 text-xl">${tCount} יח'</strong></div>`;
  const rawItems: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[] = [];
  const nestGroups = new Map<string, NestPieceGroup>();
  const frameWts = isDoubleT ? weightsMap.doubleT : weightsMap.smooth120_frame;
  const wallWts = weightsMap.smooth120_frame;
  const addNest = (
    name: string,
    color: string,
    cutLengthCm: number,
    quantity: number,
    weights: { [barLen: number]: number | undefined },
    nestKey?: string
  ) => addPiecesToNestGroup(nestGroups, name, color, cutLengthCm, quantity, weights, nestKey);

  if (L > 0 && W > 0) {
    if (!isLCorner && !isUShape) {
      addNest(wallDisplayName, frameColorText, cutL_Wall, 1, wallWts);
      addNest(frameProfileName, frameColorText, cutFront, 1, frameWts);
      if (isTrapezoid) {
        addNest(frameProfileName, frameColorText, sideLenLeft, 1, frameWts);
        addNest(frameProfileName, frameColorText, sideLenRight, 1, frameWts);
      } else {
        addNest(frameProfileName, frameColorText, sideLen, 2, frameWts);
      }
    } else if (isUShape) {
      if (wingWallLeft > 0) addNest(wallDisplayName, frameColorText, wingWallLeft, 1, wallWts);
      if (wingWallRight > 0) addNest(wallDisplayName, frameColorText, wingWallRight, 1, wallWts);
      if (lW > 0) addNest(wallDisplayName, frameColorText, lW, 1, wallWts);
      addNest(frameProfileName, frameColorText, cutFront, 1, frameWts);
      addNest(frameProfileName, frameColorText, sideLenLeft, 1, frameWts);
      addNest(frameProfileName, frameColorText, sideLenRight, 1, frameWts);
      if (uDL > 0) addNest(wallDisplayName, frameColorText, uDL, 1, wallWts);
      if (uDR > 0) addNest(wallDisplayName, frameColorText, uDR, 1, wallWts);
    } else {
      const totalLWall = cutL_Wall - lW + lD + lW;
      addNest(wallDisplayName, frameColorText, totalLWall, 1, wallWts);
      addNest(frameProfileName, frameColorText, cutFront, 1, frameWts);
      addNest(frameProfileName, frameColorText, sideLen, 1, frameWts);
      addNest(frameProfileName, frameColorText, sideLen - lD, 1, frameWts);
    }
    const divWeightKey = dividerSize === "100" ? weightsMap.smooth100_div : weightsMap.smooth120_div;
    const divProfileSmooth = `חציצים ${divSizeName} חלק`;
    const divProfileLed = `חציצים ${divSizeName} לד`;
    if (nDividersTotal > 0) {
      if (isTrapezoid && !isLCorner && !isUShape) {
        for (let i = 0; i < countSmooth; i++) {
          if (i >= dividerPositions.length) break;
          addNest(divProfileSmooth, frameColorText, cutDividerAt(dividerPositions[i]), 1, divWeightKey);
        }
        for (let i = 0; i < countLed; i++) {
          const idx = countSmooth + i;
          if (idx >= dividerPositions.length) break;
          addNest(divProfileLed, frameColorText, cutDividerAt(dividerPositions[idx]), 1, divWeightKey);
        }
      } else if (isUShape) {
        for (let i = 0; i < countSmooth; i++) {
          if (i >= dividerPositions.length) break;
          addNest(
            divProfileSmooth,
            frameColorText,
            uDividerCutLen(dividerPositions[i], junction1U, junction2U, W, uDL, uDR, divDed),
            1,
            divWeightKey
          );
        }
        for (let i = 0; i < countLed; i++) {
          const idx = countSmooth + i;
          if (idx >= dividerPositions.length) break;
          addNest(
            divProfileLed,
            frameColorText,
            uDividerCutLen(dividerPositions[idx], junction1U, junction2U, W, uDL, uDR, divDed),
            1,
            divWeightKey
          );
        }
      } else {
        const splitByType = (typeCount: number) => {
          if (typeCount <= 0 || nDividersTotal <= 0) return { full: 0, short: 0 };
          if (countSmooth === 0 || countLed === 0) {
            return { full: fullDividers, short: shortDividers };
          }
          const full = Math.round((fullDividers * typeCount) / nDividersTotal);
          const short = Math.max(0, typeCount - full);
          return { full, short };
        };
        if (countSmooth > 0) {
          const { full, short } = splitByType(countSmooth);
          if (full > 0) addNest(divProfileSmooth, frameColorText, cutDivider, full, divWeightKey);
          if (short > 0) addNest(divProfileSmooth, frameColorText, cutDivider - lD, short, divWeightKey);
        }
        if (countLed > 0) {
          const { full, short } = splitByType(countLed);
          if (full > 0) addNest(divProfileLed, frameColorText, cutDivider, full, divWeightKey);
          if (short > 0) addNest(divProfileLed, frameColorText, cutDivider - lD, short, divWeightKey);
        }
      }
    }
    // זוויות — ניצול משותף לכל המידות בפרויקט
    {
      const anglePieces: number[] = [];
      if (isTrapezoid && !isLCorner && !isUShape && fieldWidths.length > 0) {
        const allEdges = [0, ...dividerPositions, L];
        const nTrapFields = allEdges.length - 1;
        for (let fi = 0; fi < nTrapFields; fi++) {
          const d0 = cutDividerAt(allEdges[fi]);
          const d1 = cutDividerAt(allEdges[fi + 1]);
          anglePieces.push(Math.round((d0 - 1.5) * 10) / 10);
          anglePieces.push(Math.round((d1 - 1.5) * 10) / 10);
        }
      } else if (fieldWidths.length > 0) {
        fieldWidths.forEach((fw) => {
          const divCutLen = isUShape
            ? uShapeFieldDividerCutLen(fw, junction1U, junction2U, W, uDL, uDR, divDed)
            : isLCorner
              ? fw.isShort
                ? cutDivider - lD
                : cutDivider
              : cutDivider;
          const angleLen = Math.round((divCutLen - 1.5) * 10) / 10;
          const nAng = fw.count * 2;
          for (let i = 0; i < nAng; i++) anglePieces.push(angleLen);
        });
      } else {
        const angleLen = Math.round((cutDivider - 1.5) * 10) / 10;
        for (let i = 0; i < anglesCount; i++) anglePieces.push(angleLen);
      }
      const angleWt = weightsMap.angle?.[6] ?? 1.5;
      const angleKey = `זווית 30/30__${frameColorText}`;
      const angleGroup = nestGroups.get(angleKey) || {
        name: "זווית 30/30",
        color: frameColorText,
        weights: { 6: angleWt },
        pieces: [] as number[],
      };
      for (const len of anglePieces) {
        if (len > 0) angleGroup.pieces.push(len);
      }
      nestGroups.set(angleKey, angleGroup);
    }
    // הכנה לסנטף 20/40 — ניצול משותף עם הצללה 20/40 אם אותו צבע; תווית נפרדת בהזמנה
    if (hasSantaf && L > 0) {
      const prepDeduction = isDoubleT ? 10 : 4;
      const santafBomName = "20/40 (הכנה לסנטף)";
      const nest2040Key = "20/40";
      if (isUShape) {
        const countWingLeft = Math.ceil((W + uDL + 15) / 50);
        const countWingRight = Math.ceil((W + uDR + 15) / 50);
        const countCenter = Math.ceil((W + 15) / 50);
        if (wingWallLeft > 0) {
          addNest(santafBomName, frameColorText, wingWallLeft - prepDeduction, countWingLeft, weightsMap.s20x40, nest2040Key);
        }
        if (wingWallRight > 0) {
          addNest(santafBomName, frameColorText, wingWallRight - prepDeduction, countWingRight, weightsMap.s20x40, nest2040Key);
        }
        if (lW > 0) {
          addNest(santafBomName, frameColorText, lW - prepDeduction, countCenter, weightsMap.s20x40, nest2040Key);
        }
      } else if (isLCorner) {
        const countFull = Math.ceil((W - lD) / 50);
        addNest(santafBomName, frameColorText, L - prepDeduction, countFull, weightsMap.s20x40, nest2040Key);
        const countShort = Math.ceil(lD / 50);
        addNest(santafBomName, frameColorText, L - lW - prepDeduction, countShort, weightsMap.s20x40, nest2040Key);
      } else if (isTrapezoid) {
        const prepCount = Math.ceil((Math.max(yL, yR) + SANTAF_OVERHANG_CM) / 50);
        addNest(santafBomName, frameColorText, L - prepDeduction, prepCount, weightsMap.s20x40, nest2040Key);
      } else {
        const prepCount = Math.ceil(W / 50);
        addNest(santafBomName, frameColorText, L - prepDeduction, prepCount, weightsMap.s20x40, nest2040Key);
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
    const pieces40: number[] = [];
    const pieces70: number[] = [];
    if (isTrapezoid && !isLCorner && !isUShape) {
      const allEdges = [0, ...dividerPositions, L];
      const profW = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
      const setW = shadingP === "mix" ? 7 + 4 + 4 + space * 3 : profW + space;
      const fieldNet = fieldWidths[0]?.net ?? 0;
      for (let fi = 0; fi < allEdges.length - 1; fi++) {
        collectTrapezoidShadeRows(
          allEdges[fi],
          allEdges[fi + 1],
          fieldNet,
          setW,
          L,
          yL,
          yR,
          divDed
        ).forEach((len) => {
          if (shadingP === "20x40" || shadingP === "mix") {
            pieces40.push(len);
            if (shadingP === "mix") {
              pieces40.push(len);
            }
          }
          if (shadingP === "20x70" || shadingP === "mix") pieces70.push(len);
        });
      }
    } else {
      fieldWidths.forEach((fw) => {
        const nSet = (fw as FieldWidth & { nShadeSets?: number }).nShadeSets ?? 0;
        const cutLen = (fw as FieldWidth & { shadeCutLen?: number }).shadeCutLen ?? 0;
        if (!(cutLen > 0) || !(nSet > 0)) return;
        const qty = nSet * fw.count;
        if (shadingP === "20x40") {
          for (let i = 0; i < qty; i++) pieces40.push(cutLen);
        } else if (shadingP === "20x70") {
          for (let i = 0; i < qty; i++) pieces70.push(cutLen);
        } else if (shadingP === "mix") {
          for (let i = 0; i < qty; i++) pieces70.push(cutLen);
          for (let i = 0; i < qty * 2; i++) pieces40.push(cutLen);
        }
      });
    }
    // הצללה 20/40 + הכנה לסנטף מאותו צבע → אותו ניצול; התווית משלבת את שתי המטרות
    for (const len of pieces40) addNest("הצללה 20/40", shadeColorText, len, 1, weightsMap.s20x40, "20/40");
    for (const len of pieces70) addNest("הצללה 20/70", shadeColorText, len, 1, weightsMap.s20x70, "20/70");
  }

  flushNestGroupsToItems(rawItems, nestGroups);
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
    bomHtml += `<tr><td>${profileNameWithIconHtml(i.name)} <span class="text-[11px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-normal mr-1 border border-blue-200">${i.color}</span></td><td class="text-center font-bold text-blue-700">${i.qty}</td><td class="text-center">${i.barLen} מ'</td></tr>`;
    if (wasteMeters > 0) wasteHtml += `<tr class="hover:bg-red-50"><td class="font-bold">${i.name} <span class="text-[11px] text-slate-500 mr-1">(${i.color})</span></td><td class="text-center">${i.barLen} מ'</td><td class="font-bold text-red-600">${wasteMeters.toFixed(2)} מ'</td></tr>`;
  });
  if (screwsCount > 0) bomHtml += `<tr><td class="font-bold text-slate-800">ברגי מש"ד (להצללות)</td><td class="text-center font-bold text-blue-700">${screwsCount}</td><td class="text-center">יח'</td></tr>`;
  if (hasLed) {
    const ledDivLen = isTrapezoid && dividerPositions.length > 0
      ? dividerPositions.reduce((s, x) => s + cutDividerAt(x), 0) / dividerPositions.length
      : cutDivider;
    bomTotalCost += countLed * (ledDivLen / 100) * sysLed;
  }
  const dripEdgeType = str(pergola.dripEdgeType, "wave2.5");
  const dripLength = dripEdgeType === "wave3.0" || dripEdgeType === "smooth3.0" ? 3 : 2.5;
  const dripUnits = Math.ceil((L / 100 + 1) / dripLength);
  const santafColor = str(pergola.santafColor, "שקוף");
  if (hasSantaf && L > 0 && W > 0) {
    // אורך לוח סנטף = יציאה (עומק) + 15 ס"מ. בצורת ר׳ יש שני עומקים (ארוך וקצר).
    if (isUShape) {
      const depthWingLeftCm = W + uDL + 15;
      const depthWingRightCm = W + uDR + 15;
      const depthCenterCm = W + 15;
      const leftBoards = wingWallLeft > 0 ? Math.ceil(wingWallLeft / 100) : 0;
      const rightBoards = wingWallRight > 0 ? Math.ceil(wingWallRight / 100) : 0;
      const centerBoards = lW > 0 ? Math.ceil(lW / 100) : 0;
      bomTotalCost +=
        leftBoards * 1.045 * (depthWingLeftCm / 100) * sysSantaf +
        rightBoards * 1.045 * (depthWingRightCm / 100) * sysSantaf +
        centerBoards * 1.045 * (depthCenterCm / 100) * sysSantaf +
        dripUnits * sysDrip;
      if (leftBoards > 0) {
        bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם (כנף שמאל) <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${leftBoards}</td><td class="text-center">${(depthWingLeftCm / 100).toFixed(2)} מ'</td></tr>`;
      }
      if (rightBoards > 0) {
        bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם (כנף ימין) <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${rightBoards}</td><td class="text-center">${(depthWingRightCm / 100).toFixed(2)} מ'</td></tr>`;
      }
      if (centerBoards > 0) {
        bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם (מרכז) <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${centerBoards}</td><td class="text-center">${(depthCenterCm / 100).toFixed(2)} מ'</td></tr>`;
      }
      bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">אף מים</td><td class="text-center font-bold text-blue-700">${dripUnits}</td><td class="text-center">${dripLength} מ' ליח'</td></tr>`;
    } else if (isLCorner) {
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
    } else if (isTrapezoid) {
      // כל לוח (~1 מ׳ רוחב) — אורך לפי היציאה במקטע שלו + 15 ס״מ
      const boardLens = collectTrapezoidSantafBoardLens(L, yL, yR);
      const buckets = bucketSantafBoardLens(boardLens);
      let santafCost = 0;
      buckets.forEach(({ lenCm, count }) => {
        santafCost += count * 1.045 * (lenCm / 100) * sysSantaf;
        bomHtml += `<tr class="bg-green-50"><td class="font-bold text-green-800">סנטף BH פלרם <span class="text-[11px] text-green-600 bg-green-100 px-1 py-0.5 rounded font-normal mr-1 border border-green-200">${santafColor}</span></td><td class="text-center font-bold text-blue-700">${count}</td><td class="text-center">${(lenCm / 100).toFixed(2)} מ'</td></tr>`;
      });
      bomTotalCost += santafCost + dripUnits * sysDrip;
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
  const incVat = exVat * (1 + vatRate);
  const profit = exVat - bomTotalCost - installCost;
  let instructions = "";
  if (L > 0 && W > 0) {
    if (isTrapezoid && trapMetrics) {
      instructions += `<div class="instruction-item">ייצור מסגרת <strong>${frameProfileName}</strong>: חזית ${cutFront.toFixed(1)} ס"מ — גרונג חזית שמאל ${trapMetrics.cutAngleLeft.toFixed(1)}° / ימין ${trapMetrics.cutAngleRight.toFixed(1)}°. צד שמאל ${sideLenLeft.toFixed(1)} ס"מ (גרונג בחזית ${trapMetrics.sideCutAngleLeft.toFixed(1)}°), צד ימין ${sideLenRight.toFixed(1)} ס"מ (גרונג בחזית ${trapMetrics.sideCutAngleRight.toFixed(1)}°). <span class="text-red-600 font-bold underline">להוריד אוזניים לפרופיל ימין ושמאל - הורדה של 3 ס"מ.</span></div><div class="instruction-item text-blue-800">מרווח הצללה שנבחר: <strong>${space} ס"מ</strong>.</div>`;
    } else {
      instructions += `<div class="instruction-item">ייצור מסגרת <strong>${frameProfileName}</strong>: חזית ${cutFront.toFixed(1)} ס"מ. <span class="text-red-600 font-bold underline">להוריד אוזניים לפרופיל ימין ושמאל - הורדה של 3 ס"מ.</span></div><div class="instruction-item text-blue-800">מרווח הצללה שנבחר: <strong>${space} ס"מ</strong>.</div>`;
    }
    instructions += instructionsShades;
    if (isLCorner) instructions += `<div class="instruction-item text-orange-700 font-bold">שים לב: מגרעת פינתית בקיר בצד <u>${isLLeft ? "שמאל" : "ימין"}</u> במידות ${lW}x${lD} ס"מ. קיר ראשי: ${inputL} ס"מ.</div>`;
    if (isUShape) instructions += `<div class="instruction-item text-orange-700 font-bold">שים לב: מגרעת מרכזית בקיר — רוחב <strong>${lW}</strong> ס"מ. יציאה למרכז: <strong>${W}</strong> ס"מ. חזית מסגרת: רק כנפיים (שמאל ${wingWallLeft} / ימין ${wingWallRight} ס"מ) — אין חזית מסגרת במגרעת. פינות מגרעת: <strong>L קיר</strong> (לא חציץ). חציץ במרכז נעצר בגרונג (עומק ${W} ס"מ). תוספת כנף שמאל: <strong>${uDL}</strong> (פרופיל צד ${(W + uDL).toFixed(0)}), ימין: <strong>${uDR}</strong> (פרופיל צד ${(W + uDR).toFixed(0)}). קיר כנף שמאל: <strong>${wingWallLeft}</strong>, ימין: <strong>${wingWallRight}</strong> ס"מ.</div>`;
    if (countSmooth > 0) instructions += `<div class="instruction-item">חיתוך והתקנת <strong>${countSmooth} חציצים חלקים</strong> (${divSizeName}).</div>`;
    if (countLed > 0) instructions += `<div class="instruction-item text-yellow-700 font-bold">חיתוך והתקנת <strong>${countLed} חציצי לד</strong> (${divSizeName}).</div>`;
    if (hasSantaf) {
      if (isUShape) {
        const countWingLeft = Math.ceil((W + uDL + 15) / 50);
        const countWingRight = Math.ceil((W + uDR + 15) / 50);
        const countCenter = Math.ceil((W + 15) / 50);
        instructions += `<div class="instruction-item text-green-800 font-bold">הכנה לסנטף: <strong>${countWingLeft} פרופילי 20/40 לכנף שמאל</strong>, <strong>${countWingRight} לכנף ימין</strong> ועוד <strong>${countCenter} למרכז</strong>, כל 50 ס"מ.</div>`;
      } else if (isTrapezoid) {
        const prepCount = Math.ceil((Math.max(yL, yR) + SANTAF_OVERHANG_CM) / 50);
        instructions += `<div class="instruction-item text-green-800 font-bold">הכנה לסנטף: יש לחתוך <strong>${prepCount} פרופילי 20/40</strong>, ולהניח מעל השדות כל 50 ס"מ.</div>`;
      } else if (isLCorner) {
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
    let trapezoidFieldDetails: TrapezoidFieldDetail[] = [];
    if (isTrapezoid && trapMetrics && shadingP !== "none" && fieldWidths.length > 0) {
      const profWSk = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
      const setWSk = shadingP === "mix" ? 7 + 4 + 4 + space * 3 : profWSk + space;
      const allEdgesSk = [0, ...dividerPositions, L];
      const fieldNetSk = fieldWidths[0]?.net ?? 0;
      trapezoidFieldDetails = buildTrapezoidFieldDetails(allEdgesSk, fieldNetSk, setWSk, cutDividerAt, yL, yR, L, divDed);
    }
    instructions += generateSketch(
      L,
      W,
      isLCorner,
      lW,
      lD,
      str(pergola.lShapeSide, "right"),
      cutDivider,
      dividerPositions,
      fieldWidths,
      shadingP,
      space,
      sketchFrameHex,
      sketchShadeHex,
      frameType,
      isUShape,
      wingWallLeft,
      wingWallRight,
      uDL,
      uDR,
      isTrapezoid && trapMetrics
        ? { yL, yR, metrics: trapMetrics, cutDividerAt, fieldDetails: trapezoidFieldDetails }
        : null
    );
  }
  const viewDimensions = isUShape
    ? `חזית ${L} ס"מ | מרכז ${W} | כנף שמ' ${W + uDL} / ימ' ${W + uDR} | מגרעת ${lW} | כנפיים ${wingWallLeft}/${wingWallRight}`
    : isLCorner
    ? `חזית כוללת ${L}x${W} (מגרעת ${isLLeft ? "שמאלית" : "ימין"} ${lW}x${lD})`
    : isTrapezoid
      ? `קיר ${L} ס"מ | יציאה שמאל ${yL} / ימין ${yR} | חזית ${trapMetrics!.frontLength.toFixed(1)} ס"מ | גרונג חזית ${trapMetrics!.cutAngleLeft.toFixed(1)}°/${trapMetrics!.cutAngleRight.toFixed(1)}° | גרונג צדדים ${trapMetrics!.sideCutAngleLeft.toFixed(1)}°/${trapMetrics!.sideCutAngleRight.toFixed(1)}°`
      : `${L} x ${W} ס"מ`;
  const viewColorDisplay = `מסגרת: ${frameColorText} | הצללה: ${shadeColorText}`;
  const santafInfoHtml =
    hasSantaf && L > 0
      ? (() => {
          if (isTrapezoid) {
            const boardLens = collectTrapezoidSantafBoardLens(L, yL, yR);
            const buckets = bucketSantafBoardLens(boardLens);
            const lines = buckets
              .map((b) => `• לוחות סנטף (${santafColor}): <strong>${b.count}</strong> יח' באורך <strong>${b.lenCm.toFixed(1)}</strong> ס"מ (${(b.lenCm / 100).toFixed(2)} מ')`)
              .join("<br>");
            return `<strong class="text-base">מפרט טכני קירוי:</strong><br>${lines || "—"}<br>• אף מים: ${dripUnits} יח'`;
          }
          if (!isLCorner && !isUShape) {
            return `<strong class="text-base">מפרט טכני קירוי:</strong><br>• לוחות סנטף (${santafColor}): ${Math.ceil((L / 100) / 1.045) + 1} יח'<br>• אף מים: ${dripUnits} יח'`;
          }
          if (isUShape) {
            const leftBoards = wingWallLeft > 0 ? Math.ceil(wingWallLeft / 100) : 0;
            const rightBoards = wingWallRight > 0 ? Math.ceil(wingWallRight / 100) : 0;
            const centerBoards = lW > 0 ? Math.ceil(lW / 100) : 0;
            const depthWingL = W + uDL + SANTAF_OVERHANG_CM;
            const depthWingR = W + uDR + SANTAF_OVERHANG_CM;
            const depthCenter = W + SANTAF_OVERHANG_CM;
            return `<strong class="text-base">מפרט טכני קירוי:</strong><br>• לוחות סנטף (${santafColor}) כנף שמאל: ${leftBoards} יח' באורך ${depthWingL.toFixed(0)} ס"מ (${(depthWingL / 100).toFixed(2)} מ')<br>• לוחות סנטף (${santafColor}) כנף ימין: ${rightBoards} יח' באורך ${depthWingR.toFixed(0)} ס"מ (${(depthWingR / 100).toFixed(2)} מ')<br>• לוחות סנטף (${santafColor}) מרכז: ${centerBoards} יח' באורך ${depthCenter.toFixed(0)} ס"מ (${(depthCenter / 100).toFixed(2)} מ')<br>• אף מים: ${dripUnits} יח'`;
          }
          const mainWidthCm = Math.max(0, inputL);
          const notchWidthCm = Math.max(0, lW);
          const longBoards = mainWidthCm > 0 ? Math.ceil(mainWidthCm / 100) : 0;
          const shortBoards = notchWidthCm > 0 ? Math.ceil(notchWidthCm / 100) : 0;
          const depthLong = W + SANTAF_OVERHANG_CM;
          const depthShort = W - lD + SANTAF_OVERHANG_CM;
          return `<strong class="text-base">מפרט טכני קירוי:</strong><br>• לוחות סנטף (${santafColor}) קיר ראשי: ${longBoards} יח' באורך ${depthLong.toFixed(0)} ס"מ (${(depthLong / 100).toFixed(2)} מ')<br>• לוחות סנטף (${santafColor}) מגרעת: ${shortBoards} יח' באורך ${depthShort.toFixed(0)} ס"מ (${(depthShort / 100).toFixed(2)} מ')<br>• אף מים: ${dripUnits} יח'`;
        })()
      : "";
  const frameHex = getColorHex(frameColorText);
  const shadeHex = getColorHex(shadeColorText);
  const santafHex = getColorHex(santafColor);
  return {
    L, W, sqm, incVat, exVat, totalWeight: bomTotalWeight, materialCost: bomTotalCost, installCost, installSqmText: sqm > 0 ? `${sqm.toFixed(1)} מ"ר לפי ${sysInstall}₪` + (sysTransport > 0 ? ` + ${sysTransport}₪ הובלה` : "") : "",
    profit, profitMargin: exVat > 0 ? Math.round((profit / exVat) * 100) : 0, cuttingHtml, shadeSlatPlanHtml, bomHtml, hardwareHtml, wasteHtml,
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
            : slatT === "zigzag"
              ? "זיגזג אטום 120/20"
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
            : slatT === "zigzag"
              ? "זיגזג אטום 120/20"
              : slatT === "mix1"
                ? "מיקס: 2x40 ואז 1x70"
                : slatT === "mix2"
                  ? "מיקס: 2x40, 2x20, 1x70"
                  : "-";
  return { slatProfileLabel, slatLabel };
}

function calcFence(fence: FenceInput, settings?: FenceSettings | null, vatRate: number = DEFAULT_VAT_DECIMAL): {
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
  wasteHtml: string;
  wasteBadgeText: string;
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
  const slatT = str(fence.fenceSlat, "100");
  const gap = slatT === "zigzag" ? 0 : num(fence.fenceGap, 2);
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
      wasteHtml: "",
      wasteBadgeText: '0 ק"ג (0%)',
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
    const sharesCorner = i > 0 && !!s.connected;
    const isContinue = sharesCorner && s.corner === false;
    const isCorner90 = sharesCorner && s.corner !== false;
    const postsAdded = sharesCorner ? Math.max(0, pVal - 1) : pVal;
    totS += (s.L * s.H) / 10000;
    totP += postsAdded;
    const secs = Math.max(0, pVal - 1);
    const inL = secs > 0 ? (s.L - pVal * POST_WIDTH_CM) / secs : 0; // אורך מורידים (עמוד×3.5 ס"מ), מחלקים במספר השדות
    const slCut = Math.floor(inL * 10) / 10; // בלי 1 ס״מ חופש, עיגול למטה לעשירית ס״מ (119.75 → 119.7)
    const pCut = isGr ? s.H + 40 : s.H - 1.5;
    // בגדר תמיד מורידים 1.5 ס״מ מגובה (זיגזג: מרווח 0 → בגובה 100 נכנסים 8×12 ב־98.5)
    const netH = s.H - 1.5;
    let cH = 0;
    let pIdx = 0;
    const sCnts: Record<string, number> = {};
    let totSInS = 0;
    while (true) {
      const pi = pat[pIdx % pat.length];
      if (cH + pi.w > netH + 1e-9) break;
      sCnts[pi.n] = (sCnts[pi.n] || 0) + 1;
      totSInS++;
      cH += pi.w + gap;
      pIdx++;
    }
    addC("עמוד גדר", pCut, postsAdded, 13.5, pCol);
    addC("ספייסר ארוך (כיסוי עמוד)", pCut, Math.max(0, (pVal - 2) * 1 + (sharesCorner ? 2 : 4)), 1.5, pCol);
    if (secs > 0) {
      let sSp = 0;
      Object.keys(sCnts).forEach((n) => {
        const q = sCnts[n] * secs;
        addC(`מילוי ${n}`, slCut, q, pat.find((x) => x.n === n)!.wt, sCol);
        sSp += q * 2;
      });
      if (gap > 0) addC("ספייסר קצר (מרווח)", gap, sSp, 1.5, sCol);
    }
    const slatsDetail = Object.keys(sCnts).map((n) => `${sCnts[n]} יח' ${n}`).join(", ");
    insParts.push(`<div class="mb-4 pb-2 border-b"><strong class="text-blue-800">מקטע ${i + 1}${isContinue ? " (המשך באותו כיוון, עמוד משותף)" : isCorner90 ? " (צלע פינה 90°, עמוד משותף)" : ""}: אורך ${s.L}, גובה ${s.H}</strong><div class="text-sm mt-1">חולק ל-${secs} שדות (${pVal} עמודים${sharesCorner ? `, מתוכם ${postsAdded} חדשים` : ""}). חיתוך שלבים: <span class="font-bold text-blue-600">${slCut.toFixed(1)}</span> ס"מ. ברוטו עמוד: ${pCut.toFixed(1)} ס"מ.<br><span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded mt-1 inline-block">בכל שדה: ${slatsDetail} (סה"כ ${totSInS} שלבים לשדה).</span></div></div>`);
  });
  let cutStr = "";
  const raw: { n: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[] = [];
  const pKg = settings ? num(settings.pricePerKg, 35) : 35;
  // קיבוץ חתיכות לפי פרופיל+צבע לניצול משותף (הצללה/מילוי/ספייסרים)
  type FencePieceGroup = { n: string; c: string; w: number; pieces: number[] };
  const nestGroups = new Map<string, FencePieceGroup>();
  Object.values(gCuts).forEach((c) => {
    cutStr += `<tr><td class="p-2 border">${profileNameWithIconHtml(c.n)} <span class="text-[10px] text-slate-500 mr-1">(${c.c})</span></td><td class="p-2 border text-center font-bold text-blue-600">X ${c.q}</td><td class="p-2 border text-center font-black">${c.l.toFixed(1)}</td></tr>`;
    const nm = c.n.includes("ספייסר")
      ? "פרופיל ספייסר"
      : c.n.includes("עמוד")
        ? "עמוד גדר"
        : c.n.includes("מילוי")
          ? c.n
          : c.n.split(" ")[0] + " " + c.n.split(" ")[1];
    const key = `${nm}__${c.c}`;
    const g = nestGroups.get(key) || { n: nm, c: c.c, w: c.w, pieces: [] };
    for (let i = 0; i < c.q; i++) g.pieces.push(c.l);
    nestGroups.set(key, g);
  });
  nestGroups.forEach((g) => {
    const nestItems: { name: string; color: string; qty: number; barLen: number; weight: number; usedLength: number }[] = [];
    pushNestedBarParts(nestItems, g.n, g.c, g.pieces, g.w);
    nestItems.forEach((i) => raw.push({ n: i.name, color: i.color, qty: i.qty, barLen: i.barLen, weight: i.weight, usedLength: i.usedLength }));
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
  Object.keys(bom).forEach((k) => { bU += bom[k].u; bT += bom[k].t; bC += bom[k].t * pKg; bomStr += `<tr><td class="p-2 border">${profileNameWithIconHtml(bom[k].n)} <span class="text-[11px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-normal mr-1 border border-blue-200">${bom[k].c}</span></td><td class="p-2 border text-center font-black text-blue-600">${bom[k].q}</td></tr>`; });
  let wasteHtml = "";
  raw.forEach((i) => {
    if (i.qty <= 0) return;
    const totalBarLengthCm = i.qty * i.barLen * 100;
    const wasteMeters = (totalBarLengthCm - i.usedLength) / 100;
    if (wasteMeters > 0.001) {
      wasteHtml += `<tr class="hover:bg-red-50"><td class="font-bold p-2">${profileNameWithIconHtml(i.n)} <span class="text-[11px] text-slate-500 mr-1">(${i.color})</span></td><td class="text-center p-2">${i.barLen} מ'</td><td class="font-bold text-red-600 text-center p-2">${wasteMeters.toFixed(2)} מ'</td></tr>`;
    }
  });
  if (wasteHtml === "") {
    wasteHtml = `<tr><td colspan="3" class="text-center text-slate-400 py-4">אין שאריות נפל משמעותיות</td></tr>`;
  }
  const wasteKg = bT - bU;
  const wastePercent = bT > 0 ? (wasteKg / bT) * 100 : 0;
  const wasteBadgeText = `${wasteKg.toFixed(1)} ק"ג (${wastePercent.toFixed(1)}%)`;
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
  const vatAmount = exV * vatRate;
  const hardwareHtml = `<div class="flex justify-between border-b pb-2"><span class="font-bold">סט עמוד (בסיס, רוזטה, קאפ):</span><strong class="text-blue-600">${totP} סטים</strong></div>${!isGr ? `<div class="flex justify-between pt-2"><span class="font-bold">ג'מבואים (4 לעמוד):</span><strong class="text-blue-600">${totP * 4} יח'</strong></div>` : "<div class=\"pt-2\">שתילה באדמה</div>"}`;
  return {
    sqm: totS, weight: bT, wasteKg, wastePercent, cost: bC, profit: exV - bC, sellExVat: exV, sellIncVat: exV * (1 + vatRate),
    cuttingHtml: cutStr, bomHtml: bomStr, hardwareHtml, instructionsHtml: insParts.join(""),
    wasteHtml, wasteBadgeText,
    frameHex, slatHex, spacerHex, slatProfileLabel, slatLabel,
    installExVat, transportExVat, basicQuoteExVat, vatAmount,
  };
}

type Body = {
  type: "pergola" | "fence";
  pergola?: PergolaInput;
  fence?: FenceInput;
  settings?: PergolaSettings | FenceSettings;
  /** אחוז מע״מ (למשל 18) או שבר (0.18) — אופציונלי */
  vatPercent?: number | string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { type, pergola, fence, settings, vatPercent } = body;
    const vatRate = parseVatRateDecimalFromApiInput(vatPercent, DEFAULT_VAT_DECIMAL);
    if (process.env.NODE_ENV !== "production") {
      console.log("[api/calculate] Received:", type, type === "pergola" ? { keys: pergola ? Object.keys(pergola) : [], lengthWall: pergola?.lengthWall, exitWidth: pergola?.exitWidth } : { segments: fence?.segments?.length });
    }
    if (type === "pergola") {
      const result = calcPergola(pergola ?? {}, settings as PergolaSettings | undefined, vatRate);
      return NextResponse.json({ pergola: result });
    }
    if (type === "fence") {
      const result = calcFence(fence ?? {}, settings as FenceSettings | undefined, vatRate);
      return NextResponse.json({ fence: result });
    }
    return NextResponse.json({ message: "Invalid type: expected 'pergola' or 'fence'" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Calculation failed";
    console.error("[api/calculate] Error:", message, e);
    return NextResponse.json({ message }, { status: 400 });
  }
}
