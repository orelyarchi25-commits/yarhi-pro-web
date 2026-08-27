"use client";

import { useState } from "react";
import type { CrmProject } from "@/app/components/BusinessView";
import {
  recalcBundleTotals,
  unitTypeEmoji,
  unitTypeLabel,
  viewForUnitType,
  type ProjectUnitType,
} from "@/lib/project-bundle";

type ProductView = "data" | "fences" | "field-windows";

type Props = {
  currentView: ProductView;
  project: CrmProject | null;
  activeUnitId: string | null;
  customerPreview?: string;
  onStartProject: (label: string) => void;
  onSelectUnit: (unitId: string) => void;
  onAddUnit: (type: ProjectUnitType, label: string) => void;
  onRemoveUnit: (unitId: string) => void;
  onExit: () => void;
  onPrintBundleQuote?: () => void;
};

const PRODUCT_TYPES: ProjectUnitType[] = ["pergola", "fence", "field-windows"];

const VIEW_TYPE: Record<ProductView, ProjectUnitType> = {
  data: "pergola",
  fences: "fence",
  "field-windows": "field-windows",
};

export default function ProductProjectBar({
  currentView,
  project,
  activeUnitId,
  customerPreview,
  onStartProject,
  onSelectUnit,
  onAddUnit,
  onRemoveUnit,
  onExit,
  onPrintBundleQuote,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<ProjectUnitType>(VIEW_TYPE[currentView]);
  const [newLabel, setNewLabel] = useState("");

  const isActive = project != null && project.isBundle;
  const units = project?.units ?? [];
  const totals = recalcBundleTotals(units);
  const hasUnitForView = units.some((u) => viewForUnitType(u.type) === currentView);

  const openAdd = () => {
    setNewType(VIEW_TYPE[currentView]);
    setNewLabel("");
    setAddOpen(true);
  };

  const submitAdd = () => {
    const label = newLabel.trim();
    if (!label) {
      alert("יש להזין שם מיקום (לדוגמה: חזית הבית, מרפסת)");
      return;
    }
    if (!isActive) {
      onStartProject(label);
    } else {
      onAddUnit(newType, label);
    }
    setNewLabel("");
    setAddOpen(false);
  };

  return (
    <div className="sticky top-0 z-40 border-b-2 border-indigo-400 bg-gradient-to-l from-indigo-50 via-white to-indigo-50/80 shadow-md">
      <div className="px-3 py-2.5 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {isActive ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">פרויקט משולב — לקוח אחד, כמה מוצרים</p>
                <h2 className="truncate text-base font-black text-slate-800 sm:text-lg">{project!.customer}</h2>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">איחוד מוצרים לפרויקט אחד</p>
                <h2 className="truncate text-sm font-bold text-slate-700 sm:text-base">
                  {customerPreview?.trim() ? `לקוח: ${customerPreview.trim()}` : "הזן פרטי לקוח למטה ואז הוסף מוצר"}
                </h2>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isActive && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left">
                <p className="text-[10px] font-bold text-emerald-800">סה״כ פרויקט</p>
                <p className="text-lg font-black text-emerald-900">₪{totals.sellingPriceInc.toLocaleString("he-IL")}</p>
              </div>
            )}
            <button
              type="button"
              onClick={openAdd}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 sm:text-sm"
            >
              + הוסף מוצר לפרויקט
            </button>
            {isActive && onPrintBundleQuote && (
              <button
                type="button"
                onClick={onPrintBundleQuote}
                className="rounded-xl border border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-100 sm:text-sm"
              >
                📄 סיכום מאוחד ללקוח
              </button>
            )}
            {isActive && (
              <button type="button" onClick={onExit} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600">
                סיים פרויקט
              </button>
            )}
          </div>
        </div>

        {isActive && (
          <>
            {!hasUnitForView && (
              <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
                אין {unitTypeLabel(VIEW_TYPE[currentView])} בפרויקט עדיין — לחץ «הוסף מוצר לפרויקט» כדי להוסיף
              </p>
            )}
            <div className="flex gap-1.5 overflow-x-auto pb-1 touch-pan-x">
            {units.map((u) => {
              const active = u.id === activeUnitId;
              const onCurrentScreen = viewForUnitType(u.type) === currentView;
              const shellCls = active
                ? "border-indigo-600 bg-indigo-600 text-white shadow ring-2 ring-indigo-300"
                : onCurrentScreen
                  ? "border-indigo-300 bg-indigo-50 text-slate-800"
                  : "border-slate-200 bg-white text-slate-700";
              return (
                <div
                  key={u.id}
                  className={`flex shrink-0 min-w-[7rem] overflow-hidden rounded-xl border transition ${shellCls}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectUnit(u.id)}
                    className="min-w-0 flex-1 px-3 py-2 text-right"
                  >
                    <span className={`block text-[10px] font-bold ${active ? "opacity-90" : "opacity-80"}`}>
                      {unitTypeEmoji(u.type)} {unitTypeLabel(u.type)}
                    </span>
                    <span className="block text-sm font-black leading-tight">📍 {u.label}</span>
                    <span className={`block text-[10px] font-bold ${active ? "text-indigo-100" : "text-emerald-700"}`}>
                      ₪{(u.sellingPriceInc || 0).toLocaleString("he-IL")}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`מחק ${u.label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (
                        confirm(
                          `למחוק את «${u.label}» (${unitTypeLabel(u.type)}) מהפרויקט?\nהשורה לא תופיע יותר בסיכום המאוחד.`
                        )
                      ) {
                        onRemoveUnit(u.id);
                      }
                    }}
                    className={`shrink-0 border-r px-2 text-sm font-black leading-none transition ${
                      active
                        ? "border-indigo-400 text-indigo-100 hover:bg-indigo-700"
                        : "border-slate-200 text-red-500 hover:bg-red-50"
                    }`}
                    aria-label={`מחק ${u.label}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">למחיקת מוצר — לחץ × על הטאב שלו</p>
          </>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-black text-slate-800">
              {isActive ? "הוסף מוצר נוסף לפרויקט" : "התחל פרויקט משולב"}
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              {isActive
                ? "בחר סוג מוצר ושם מיקום — תוכל לעבור ביניהם בטאבים למעלה"
                : `המוצר הנוכחי (${unitTypeLabel(VIEW_TYPE[currentView])}) ייכנס כמוצר ראשון בפרויקט`}
            </p>
            {isActive && (
              <label className="mb-3 block text-xs font-bold text-slate-600">
                סוג מוצר
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-bold"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ProjectUnitType)}
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {unitTypeEmoji(t)} {unitTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="mb-4 block text-xs font-bold text-slate-600">
              שם מיקום בבית / בפרויקט
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 p-2.5"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="חזית הבית, חצר אחורית, מרפסת…"
                autoFocus
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={submitAdd} className="flex-1 rounded-xl bg-indigo-600 py-2.5 font-bold text-white">
                {isActive ? "הוסף" : "התחל פרויקט"}
              </button>
              <button type="button" onClick={() => setAddOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
