/**
 * Pergola calc engine — standalone port of Yarhi Pro logic
 * (rectangle + L-shape → cutting list + BOM). Does NOT modify Yarhi Pro.
 */
import { pickBarDisplay, pushCutParts, slatPlanFrom6m } from "./cutting-plan.js";

const weightsMap = {
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

function num(v, d = 0) {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : d;
}
function bool(v, d = false) {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return d;
}
function str(v, d = "") {
  return v == null || v === "" ? d : String(v);
}

/**
 * @param {object} pergola
 * @returns {object} result with cuttingRows, bomRows, hardware, meta
 */
export function calcPergola(pergola) {
  const inputL = num(pergola.lengthWall, 0);
  const inputW = num(pergola.exitWidth, 0);
  const isLShape = bool(pergola.isLShape, false);
  const lW = isLShape ? num(pergola.lWallWidth, 0) : 0;
  const lD = isLShape ? num(pergola.lWallDepth, 0) : 0;
  const isLLeft = str(pergola.lShapeSide, "right") === "left";
  const L = isLShape ? inputL + lW : inputL;
  const W = inputW;
  const sqm = isLShape ? (L * W - lW * lD) / 10000 : (L * W) / 10000;

  const frameColorText = str(pergola.colorSelect, "RAL 9016");
  const shadeColorText = str(pergola.shadeColorSelect, "RAL 9016");
  const frameType = str(pergola.frameType, "doubleT");
  const isDoubleT = frameType.startsWith("doubleT");
  let frameProfileName = "120/40 חלק";
  if (frameType === "doubleT") frameProfileName = "140/40 דאבל טי";
  else if (frameType === "doubleTHiTech140") frameProfileName = "140/40 דאבל טי הייטק";
  else if (frameType === "doubleTHiTech120") frameProfileName = "120/40 דאבל טי הייטק";

  const dividerSize = str(pergola.dividerSize, "120");
  const divSizeName = dividerSize === "100" ? "100/40" : "120/40";
  const space = num(pergola.spacing, 4);
  const hasLed = bool(pergola.hasLed, false);
  const hasSantaf = bool(pergola.hasSantaf, false);
  const shadingP = str(pergola.shadingProfile, "20x40");
  const pCount = parseInt(String(pergola.postCount ?? ""), 10) || 0;
  const postType = str(pergola.postType, "100");
  const postHeight = num(pergola.postHeight, 280);

  const cutL_Wall = isDoubleT ? (isLShape ? L - 3 : L - 6) : L;
  const cutFront = L;
  const sideLen = isDoubleT ? W + 3 : W;
  const cutDivider = W - (isDoubleT ? 11 : 8);
  const divThickness = 4;
  const frameDedHalf = isDoubleT ? 7 : 4;
  const frameDeduction = isDoubleT ? 14 : 8;

  const autoDividerCount = isLShape
    ? Math.max(1, Math.ceil(inputL / 120)) + Math.max(1, Math.ceil(lW / 120)) - 1
    : L > 0
      ? Math.ceil(L / 120) - 1
      : 0;

  let countSmooth = str(pergola.dividerSmoothCount, "").trim()
    ? parseInt(String(pergola.dividerSmoothCount), 10) || 0
    : hasLed
      ? 0
      : autoDividerCount;
  let countLed = str(pergola.dividerLedCount, "").trim()
    ? parseInt(String(pergola.dividerLedCount), 10) || 0
    : hasLed
      ? autoDividerCount
      : 0;
  const nDividersTotal = countSmooth + countLed;
  const nFieldsTotal = nDividersTotal + 1;

  let dividerPositions = [];
  let fieldWidths = [];
  let fullDividers = 0;
  let shortDividers = 0;

  if (isLShape && L > 0) {
    let nFieldsProt = Math.max(1, Math.round(nFieldsTotal * (lW / L)));
    let nFieldsMain = Math.max(1, nFieldsTotal - nFieldsProt);
    if (nFieldsTotal < 2) {
      nFieldsProt = 1;
      nFieldsMain = 1;
    }
    const junctionX = isLLeft ? lW : inputL;
    const widthLeft = junctionX;
    const widthRight = L - junctionX;
    const nFieldsLeft = isLLeft ? nFieldsProt : nFieldsMain;
    const nFieldsRight = isLLeft ? nFieldsMain : nFieldsProt;
    const netLeft = (widthLeft - frameDedHalf - divThickness - (nFieldsLeft - 1) * divThickness) / nFieldsLeft;
    const netRight = (widthRight - frameDedHalf - divThickness - (nFieldsRight - 1) * divThickness) / nFieldsRight;
    fieldWidths.push({
      name: isLLeft ? "בליטה" : "קיר ראשי",
      net: netLeft,
      isShort: isLLeft,
      count: nFieldsLeft,
      totalW: widthLeft,
    });
    fieldWidths.push({
      name: isLLeft ? "קיר ראשי" : "בליטה",
      net: netRight,
      isShort: !isLLeft,
      count: nFieldsRight,
      totalW: widthRight,
    });
    for (let i = 1; i < nFieldsLeft; i++) dividerPositions.push(i * (widthLeft / nFieldsLeft));
    dividerPositions.push(junctionX);
    for (let i = 1; i < nFieldsRight; i++) dividerPositions.push(junctionX + i * (widthRight / nFieldsRight));
  } else if (L > 0) {
    const net = (L - frameDeduction - (nFieldsTotal - 1) * divThickness) / nFieldsTotal;
    fieldWidths.push({ name: "כללי", net, isShort: false, count: nFieldsTotal, totalW: L });
    for (let i = 1; i < nFieldsTotal; i++) dividerPositions.push(i * (L / nFieldsTotal));
  }

  dividerPositions.forEach((x) => {
    if (isLShape && (isLLeft ? x < lW - 0.1 : x > inputL + 0.1)) shortDividers++;
    else fullDividers++;
  });

  const wallDisplayName = isDoubleT ? "120/40 חלק (L קיר)" : frameProfileName;
  const frameWts = isDoubleT ? weightsMap.doubleT : weightsMap.smooth120_frame;
  const wallWts = weightsMap.smooth120_frame;
  const divWts = dividerSize === "100" ? weightsMap.smooth100_div : weightsMap.smooth120_div;
  const cutBar = (len, qty, wts) => pickBarDisplay(len, qty, wts);

  const cuttingRows = [];
  const pushCut = (profile, purpose, qty, cutCm, wts, note = "") => {
    if (!(qty > 0) || !(cutCm > 0 || note)) return;
    cuttingRows.push({
      profile,
      purpose,
      qty,
      cutCm,
      bar: cutCm > 0 ? cutBar(cutCm, qty, wts) : "—",
      note,
    });
  };

  if (L > 0 && W > 0) {
    if (!isLShape) {
      pushCut(wallDisplayName, "מסגרת קיר", 1, cutL_Wall, wallWts);
      pushCut(frameProfileName, "חזית", 1, cutFront, frameWts);
      pushCut(frameProfileName, "צדדים", 2, sideLen, frameWts);
    } else {
      pushCut(wallDisplayName, "קיר ראשי", 1, cutL_Wall - lW, wallWts);
      pushCut(wallDisplayName, "מגרעת - עומק", 1, lD, wallWts, "L");
      pushCut(wallDisplayName, "מגרעת - רוחב", 1, lW, wallWts, "L");
      pushCut(frameProfileName, "חזית שלמה", 1, cutFront, frameWts);
      pushCut(frameProfileName, "צד פנים קיר (ארוך)", 1, sideLen, frameWts);
      pushCut(frameProfileName, "צד פנים חזית (קצר)", 1, sideLen - lD, frameWts);
    }
    if (fullDividers > 0) pushCut(divSizeName, "חציצים (אורך מלא)", fullDividers, cutDivider, divWts);
    if (shortDividers > 0) pushCut(divSizeName, "חציצים (אזור מגרעת)", shortDividers, cutDivider - lD, divWts);

    fieldWidths.forEach((fw) => {
      const divCutLen = isLShape ? (fw.isShort ? cutDivider - lD : cutDivider) : cutDivider;
      const angleLen = divCutLen - 1.5;
      pushCut("זווית 30/30", `תמיכה — ${fw.name}`, fw.count * 2, angleLen, weightsMap.angle);
    });

    if (hasSantaf) {
      const prepDeduction = isDoubleT ? 10 : 4;
      if (isLShape) {
        const countFull = Math.ceil((W - lD + 15) / 50);
        const cutFull = L - prepDeduction;
        const countShort = Math.ceil((lD + 15) / 50);
        const cutShort = L - lW - prepDeduction;
        pushCut("20/40", "הכנה לסנטף — ארוך", countFull, cutFull, weightsMap.s20x40);
        pushCut("20/40", "הכנה לסנטף — קצר", countShort, cutShort, weightsMap.s20x40);
      } else {
        const prepCount = Math.ceil((W + 15) / 50);
        pushCut("20/40", "הכנה לסנטף", prepCount, L - prepDeduction, weightsMap.s20x40);
      }
    }
  }

  if (pCount > 0) {
    pushCut(`${postType}/${postType}`, "עמודי תמיכה", pCount, postHeight, weightsMap[`post${postType}`] || weightsMap.post100);
  }

  const shadePlans = [];
  if (shadingP !== "none" && cutDivider > 0 && fieldWidths.length > 0) {
    const profW = shadingP === "20x70" ? 7 : shadingP === "20x40" ? 4 : 5.5;
    const setW = shadingP === "mix" ? 7 + 4 + 4 + space * 3 : profW + space;
    fieldWidths.forEach((fw) => {
      const cutLen = fw.net > 1 ? fw.net - 1 : 0;
      const fieldDepth = fw.isShort ? cutDivider - lD : cutDivider;
      const nSet = Math.floor(fieldDepth / setW);
      fw.nShadeSets = nSet;
      fw.shadeCutLen = cutLen;
      const suffix = isLShape ? ` (${fw.name})` : "";
      if (shadingP === "20x40" || shadingP === "mix") {
        const qty = shadingP === "mix" ? nSet * 2 * fw.count : nSet * fw.count;
        pushCut(`הצללה 20/40${suffix}`, "שלבים", qty, cutLen, weightsMap.s20x40);
        shadePlans.push({ label: `הצללה 20/40${suffix}`, cutLenCm: cutLen, totalQty: qty, ...slatPlanFrom6m(cutLen, qty) });
      }
      if (shadingP === "20x70" || shadingP === "mix") {
        const qty = nSet * fw.count;
        pushCut(`הצללה 20/70${suffix}`, "שלבים", qty, cutLen, weightsMap.s20x70);
        shadePlans.push({ label: `הצללה 20/70${suffix}`, cutLenCm: cutLen, totalQty: qty, ...slatPlanFrom6m(cutLen, qty) });
      }
    });
  }

  const totalShadeProfiles = fieldWidths.reduce(
    (acc, fw) => acc + (fw.nShadeSets || 0) * (shadingP === "mix" ? 3 : 1) * fw.count,
    0
  );
  const screwsCount = totalShadeProfiles * 2;
  const uBracketCount = nDividersTotal * 2;
  const spiderCornerCount = isLShape ? 6 : 4;
  const anglesCount = nFieldsTotal * 2;

  const rawItems = [];
  if (L > 0 && W > 0) {
    if (!isLShape) {
      pushCutParts(rawItems, wallDisplayName, frameColorText, cutL_Wall, 1, wallWts);
      pushCutParts(rawItems, frameProfileName, frameColorText, cutFront, 1, frameWts);
      pushCutParts(rawItems, frameProfileName, frameColorText, sideLen, 2, frameWts);
    } else {
      pushCutParts(rawItems, wallDisplayName + " (ראשי+מגרעת)", frameColorText, cutL_Wall - lW + lD + lW, 1, wallWts);
      pushCutParts(rawItems, frameProfileName + " (חזית)", frameColorText, cutFront, 1, frameWts);
      pushCutParts(rawItems, frameProfileName + " (צד מלא)", frameColorText, sideLen, 1, frameWts);
      pushCutParts(rawItems, frameProfileName + " (צד קצר)", frameColorText, sideLen - lD, 1, frameWts);
    }
    const totalDivLength = fullDividers * cutDivider + shortDividers * (cutDivider - lD);
    if (totalDivLength > 0 && nDividersTotal > 0) {
      const divCutAvg = totalDivLength / nDividersTotal;
      if (countSmooth > 0) pushCutParts(rawItems, `חציצים ${divSizeName} חלק`, frameColorText, divCutAvg, countSmooth, divWts);
      if (countLed > 0) pushCutParts(rawItems, `חציצים ${divSizeName} לד`, frameColorText, divCutAvg, countLed, divWts);
    }
    fieldWidths.forEach((fw) => {
      const divCutLen = isLShape ? (fw.isShort ? cutDivider - lD : cutDivider) : cutDivider;
      pushCutParts(rawItems, `זווית 30/30 (${fw.name})`, frameColorText, divCutLen - 1.5, fw.count * 2, weightsMap.angle);
    });
  }
  if (pCount > 0) {
    pushCutParts(rawItems, `עמוד ${postType}/${postType}`, frameColorText, postHeight, pCount, weightsMap[`post${postType}`] || weightsMap.post100);
  }
  if (shadingP !== "none" && fieldWidths.length > 0) {
    fieldWidths.forEach((fw) => {
      const nSet = fw.nShadeSets || 0;
      const cutLen = fw.shadeCutLen || 0;
      const suffix = isLShape ? ` (${fw.name})` : "";
      if (shadingP === "20x40" || shadingP === "mix")
        pushCutParts(rawItems, "הצללה 20/40" + suffix, shadeColorText, cutLen, shadingP === "mix" ? nSet * 2 * fw.count : nSet * fw.count, weightsMap.s20x40);
      if (shadingP === "20x70" || shadingP === "mix")
        pushCutParts(rawItems, "הצללה 20/70" + suffix, shadeColorText, cutLen, nSet * fw.count, weightsMap.s20x70);
    });
  }

  const consolidated = {};
  rawItems.forEach((item) => {
    if (item.qty <= 0) return;
    const key = `${item.name}-${item.color}-${item.barLen}`;
    if (!consolidated[key]) consolidated[key] = { ...item };
    else {
      consolidated[key].qty += item.qty;
      consolidated[key].weight += item.weight;
      consolidated[key].usedLength += item.usedLength;
    }
  });
  const bomRows = Object.values(consolidated);
  if (screwsCount > 0) bomRows.push({ name: 'ברגי מש"ד (להצללות)', color: "—", qty: screwsCount, barLen: 0, weight: 0, usedLength: 0, unit: "יח'" });

  const totalWeight = bomRows.reduce((s, i) => s + (i.weight || 0), 0);

  return {
    meta: {
      L,
      W,
      sqm,
      inputL,
      isLShape,
      lW,
      lD,
      lShapeSide: isLLeft ? "left" : "right",
      frameProfileName,
      autoDividerCount,
      nDividersTotal,
      viewDimensions: isLShape
        ? `חזית כוללת ${L}×${W} (מגרעת ${isLLeft ? "שמאל" : "ימין"} ${lW}×${lD})`
        : `${L} × ${W} ס״מ`,
      totalWeight,
    },
    cuttingRows,
    bomRows,
    shadePlans,
    hardware: {
      screwsCount,
      uBracketCount,
      spiderCornerCount,
      anglesCount,
    },
    notes: isLShape
      ? `צורת ר׳ — מגרעת ${isLLeft ? "שמאל" : "ימין"} ${lW}×${lD}, קיר ראשי ${inputL} ס״מ`
      : "מלבן סטנדרטי",
  };
}

/** Suggest L-shape mapping from OCR numbers (heuristic for shop sketches). */
export function suggestFromNumbers(nums) {
  const sorted = [...nums].filter((n) => n > 50 && n < 2000).sort((a, b) => b - a);
  if (sorted.length < 2) return null;
  const largest = sorted[0];
  const second = sorted[1];
  // Prefer: largest = total front, second = main wall OR depth
  const depthCandidate = sorted.find((n) => n >= 150 && n <= 450 && n !== largest && n !== second) || sorted[2];
  if (largest > second && largest - second > 20 && depthCandidate) {
    return {
      isLShape: true,
      lengthWall: second,
      lWallWidth: +(largest - second).toFixed(1),
      exitWidth: depthCandidate,
      lWallDepth: sorted.find((n) => n > 40 && n < depthCandidate * 0.85) || Math.round(depthCandidate * 0.6),
      lShapeSide: "right",
      confidence: "בינונית — בדקו מול הסקיצה",
    };
  }
  return {
    isLShape: false,
    lengthWall: largest,
    exitWidth: second,
    lWallWidth: 0,
    lWallDepth: 0,
    lShapeSide: "right",
    confidence: "נמוכה-בינונית — בדקו מול הסקיצה",
  };
}
