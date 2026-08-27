export type ProjectUnitType = "pergola" | "fence" | "field-windows";

export type ProjectUnit = {
  id: string;
  type: ProjectUnitType;
  /** שם מיקום: חזית הבית, חצר אחורית… */
  label: string;
  formState?: unknown;
  fieldWindowRecordId?: string;
  sellingPriceInc: number;
  incomeExVat: number;
  vatAmount: number;
  estExpense: number;
  totalLength?: number;
};

export type BundleFormState = {
  bundleCustomerPhone?: string;
  bundleCustomerAddress?: string;
};

export function newProjectUnitId() {
  return `U_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function unitTypeLabel(type: ProjectUnitType) {
  if (type === "pergola") return "פרגולה";
  if (type === "fence") return "גדר";
  return "חלונות / מידות שטח";
}

export function unitTypeEmoji(type: ProjectUnitType) {
  if (type === "pergola") return "🏗️";
  if (type === "fence") return "🚧";
  return "📐";
}

export function viewForUnitType(type: ProjectUnitType): "data" | "fences" | "field-windows" {
  if (type === "fence") return "fences";
  if (type === "field-windows") return "field-windows";
  return "data";
}

export function unitTypeForProductView(view: "data" | "fences" | "field-windows"): ProjectUnitType {
  if (view === "fences") return "fence";
  if (view === "field-windows") return "field-windows";
  return "pergola";
}

export function defaultPergolaBundleFormState(customer: string, bundleFs: BundleFormState): Record<string, unknown> {
  return {
    custName: customer,
    custPhone: bundleFs.bundleCustomerPhone ?? "",
    custAddress: bundleFs.bundleCustomerAddress ?? "",
    custInternalNotes: "",
    lengthWall: "",
    exitWidth: "",
    isLShape: false,
    lWallWidth: "",
    lWallDepth: "",
    lShapeSide: "right",
    colorSelect: "RAL 9016",
    shadeColorSelect: "RAL 9016",
    frameType: "doubleT",
    dividerSize: "120",
    dividerSmoothCount: "",
    dividerLedCount: "",
    shadingProfile: "20x40",
    spacing: "2",
    hasLed: false,
    ledCount: "",
    ledColor: "לבן חם",
    hasFan: false,
    fanCount: "",
    hasSantaf: false,
    santafColor: "שקוף",
    dripEdgeType: "wave2.5",
    postCount: "",
    postCountFront: "",
    postCountRight: "",
    postCountLeft: "",
    postCountBack: "",
    postHeight: "",
    postType: "100",
    tensionerCount: "",
    tensionerColor: "",
    hasVitrines: false,
    vitrineOpenings: [],
  };
}

export function defaultFenceBundleFormState(customer: string, bundleFs: BundleFormState): Record<string, unknown> {
  return {
    fenceCustName: customer,
    fenceCustPhone: bundleFs.bundleCustomerPhone ?? "",
    fenceCustAddress: bundleFs.bundleCustomerAddress ?? "",
    fenceCustInternalNotes: "",
    fenceSlat: "100",
    fenceGap: "2",
    fenceColor: "RAL 9016",
    fenceSlatColor: "RAL 9016",
    fenceInGround: false,
    segs: [],
  };
}

export function sumBundleSellingInc(units: ProjectUnit[]) {
  return units.reduce((s, u) => s + (Number(u.sellingPriceInc) || 0), 0);
}

export function sumBundleExVat(units: ProjectUnit[]) {
  return units.reduce((s, u) => s + (Number(u.incomeExVat) || 0), 0);
}

export function sumBundleVat(units: ProjectUnit[]) {
  return units.reduce((s, u) => s + (Number(u.vatAmount) || 0), 0);
}

export function sumBundleExpense(units: ProjectUnit[]) {
  return units.reduce((s, u) => s + (Number(u.estExpense) || 0), 0);
}

export function recalcBundleTotals(units: ProjectUnit[]) {
  const sellingPriceInc = sumBundleSellingInc(units);
  const incomeExVat = sumBundleExVat(units);
  const vatAmount = sumBundleVat(units);
  return {
    sellingPriceInc,
    income: sellingPriceInc,
    incomeExVat,
    vatAmount,
    estExpense: sumBundleExpense(units),
  };
}

export function formatBundleSubtitle(units: ProjectUnit[]) {
  if (!units.length) return "פרויקט משולב — טרם נוספו מוצרים";
  return units.map((u) => `${u.label || unitTypeLabel(u.type)} (${unitTypeLabel(u.type)})`).join(" · ");
}

export function projectIsBundle(p: { isBundle?: boolean; units?: ProjectUnit[] }) {
  return Boolean(p.isBundle && Array.isArray(p.units));
}

/** Placeholder calc while API recalculates after switching bundle units */
export function pergolaResultFromSavedUnit(unit: ProjectUnit) {
  if (!(unit.sellingPriceInc > 0)) return null;
  return {
    incVat: unit.sellingPriceInc,
    exVat: unit.incomeExVat ?? 0,
    estExpense: unit.estExpense ?? 0,
  };
}

export function fenceResultFromSavedUnit(unit: ProjectUnit) {
  if (!(unit.sellingPriceInc > 0)) return null;
  return {
    sellIncVat: unit.sellingPriceInc,
    sellExVat: unit.incomeExVat ?? 0,
    vatAmount: unit.vatAmount ?? 0,
  };
}

export function pergolaFormHasDimensions(formState: Record<string, unknown> | undefined): boolean {
  return Boolean(String(formState?.lengthWall ?? "").trim() && String(formState?.exitWidth ?? "").trim());
}

export function fenceFormHasSegments(formState: Record<string, unknown> | undefined): boolean {
  const segs = formState?.segs;
  if (!Array.isArray(segs)) return false;
  return segs.some((s) => {
    if (!s || typeof s !== "object") return false;
    const row = s as { L?: number; H?: number };
    return (Number(row.L) || 0) > 0 && (Number(row.H) || 0) > 0;
  });
}
