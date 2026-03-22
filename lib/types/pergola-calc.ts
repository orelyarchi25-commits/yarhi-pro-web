/** Client-safe shape returned by POST /api/calculate (type: "pergola"). Server is source of truth. */
export type PergolaCalcResult = {
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
  /** For 3D / print preview — computed server-side */
  frameHex: string;
  shadeHex: string;
  santafHex: string;
  nDividersTotal: number;
};

export const EMPTY_PERGOLA_RESULT: PergolaCalcResult = {
  L: 0,
  W: 0,
  sqm: 0,
  incVat: 0,
  exVat: 0,
  totalWeight: 0,
  materialCost: 0,
  installCost: 0,
  installSqmText: "",
  profit: 0,
  profitMargin: 0,
  cuttingHtml: "",
  bomHtml: "",
  hardwareHtml: "",
  wasteHtml: "",
  wasteBadgeText: "",
  instructionsHtml: "",
  viewDimensions: "",
  viewColorDisplay: "",
  santafInfoHtml: "",
  autoDividerCount: 0,
  autoSmoothBase: 0,
  autoLedBase: 0,
  frameColorText: "",
  shadeColorText: "",
  frameHex: "#888888",
  shadeHex: "#888888",
  santafHex: "#888888",
  nDividersTotal: 0,
};
