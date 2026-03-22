/** Client-safe shape returned by POST /api/calculate (type: "fence"). Server is source of truth. */
export type FenceCalcResult = {
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
};

export const EMPTY_FENCE_RESULT: FenceCalcResult = {
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
  frameHex: "#888888",
  slatHex: "#888888",
  spacerHex: "#888888",
  slatProfileLabel: "-",
  slatLabel: "-",
  installExVat: 0,
  transportExVat: 0,
  basicQuoteExVat: 0,
  vatAmount: 0,
};
