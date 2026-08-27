import type { ProjectUnit } from "@/lib/project-bundle";

export function snapshotPergolaUnit(
  unit: ProjectUnit,
  data: {
    formState: Record<string, unknown>;
    sellingPriceInc: number;
    incomeExVat: number;
    vatAmount: number;
    estExpense: number;
  }
): ProjectUnit {
  return {
    ...unit,
    formState: data.formState,
    sellingPriceInc: data.sellingPriceInc,
    incomeExVat: data.incomeExVat,
    vatAmount: data.vatAmount,
    estExpense: data.estExpense,
  };
}

export function snapshotFenceUnit(
  unit: ProjectUnit,
  data: {
    formState: Record<string, unknown>;
    sellingPriceInc: number;
    incomeExVat: number;
    vatAmount: number;
    estExpense: number;
    totalLength: number;
  }
): ProjectUnit {
  return {
    ...unit,
    formState: data.formState,
    sellingPriceInc: data.sellingPriceInc,
    incomeExVat: data.incomeExVat,
    vatAmount: data.vatAmount,
    estExpense: data.estExpense,
    totalLength: data.totalLength,
  };
}

export function snapshotFieldWindowsUnit(unit: ProjectUnit, fieldWindowRecordId: string): ProjectUnit {
  return {
    ...unit,
    fieldWindowRecordId,
    formState: { ...(unit.formState as object), fieldWindowRecordId },
  };
}
