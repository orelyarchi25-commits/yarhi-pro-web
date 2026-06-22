"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmProject } from "@/app/components/BusinessView";
import {
  FIELD_WINDOW_GLASS,
  FIELD_WINDOW_PROFILES,
  LOCK_SIDES,
  OVERLAP_OPTIONS,
  TRACK_OPTIONS,
  buildLockInfo,
  calcSqm,
  calcSuggestedTracks,
  defaultFieldWindowTrimState,
  formatFieldWindowDate,
  formatTrimString,
  formatTracksLabel,
  inferScreenModeFromItem,
  newFieldWindowItemId,
  newFieldWindowRecordId,
  parseTracksCount,
  resolveItemTrimState,
  totalItemsSqm,
  type FieldWindowItem,
  type FieldWindowRecord,
  type FieldWindowScreenMode,
  type FieldWindowTrimState,
  type TrimSideSelection,
} from "@/lib/field-windows";
import { printFieldWindowRecord } from "@/lib/field-windows-print";
import { DEFAULT_CRM_STATUS_AFTER_CALC_SAVE } from "@/lib/crm-status";

type Tab = "editor" | "saved";

type ItemDraft = {
  width: string;
  height: string;
  profile: string;
  glass: string;
  location: string;
  color: string;
  tracks: number;
  overlap: string;
  lockHeight: string;
  lockSide: string;
  isFrameOnly: boolean;
  hasGlass: boolean;
  hasShutter: boolean;
  hasRollerShutter: boolean;
  hasScreen: boolean;
  screenMode: FieldWindowScreenMode;
  trimState: FieldWindowTrimState;
  qty: string;
  notes: string;
};

const trimFromDraft = (draft: ItemDraft): FieldWindowTrimState => ({
  internal: { ...draft.trimState.internal, active: draft.trimState.internal.active },
  external: { ...draft.trimState.external, active: draft.trimState.external.active },
});

function TrimSidePicker({
  label,
  active,
  sides,
  disabled,
  onActiveChange,
  onSideChange,
}: {
  label: string;
  active: boolean;
  sides: Omit<TrimSideSelection, "active">;
  disabled?: boolean;
  onActiveChange: (v: boolean) => void;
  onSideChange: (side: keyof Omit<TrimSideSelection, "active">, v: boolean) => void;
}) {
  const sideDisabled = disabled || !active;
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-2 ${sideDisabled ? "opacity-60" : ""}`}>
      <label className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-1 text-xs font-bold text-slate-700">
        <input type="checkbox" checked={active} disabled={disabled} onChange={(e) => onActiveChange(e.target.checked)} />
        {label}
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ["top", "עליון"],
            ["bottom", "תחתון"],
            ["right", "ימין"],
            ["left", "שמאל"],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex cursor-pointer items-center gap-1 rounded p-1 text-[11px] hover:bg-slate-50">
            <input
              type="checkbox"
              checked={sides[key]}
              disabled={sideDisabled}
              onChange={(e) => onSideChange(key, e.target.checked)}
            />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}

const emptyItemDraft = (): ItemDraft => ({
  width: "",
  height: "",
  profile: FIELD_WINDOW_PROFILES[0],
  glass: FIELD_WINDOW_GLASS[0],
  location: "",
  color: "",
  tracks: 2,
  overlap: OVERLAP_OPTIONS[0],
  lockHeight: "",
  lockSide: LOCK_SIDES[2],
  isFrameOnly: false,
  hasGlass: true,
  hasShutter: false,
  hasRollerShutter: false,
  hasScreen: false,
  screenMode: "window",
  trimState: defaultFieldWindowTrimState(),
  qty: "1",
  notes: "",
});

type Props = {
  records: FieldWindowRecord[];
  onRecordsChange: (records: FieldWindowRecord[]) => void;
  crmData: CrmProject[];
  onCreateCrmLink: (recordId: string, project: CrmProject) => void;
  businessName?: string;
  loading?: boolean;
  /** נפתח מ-CRM — טוען רשומת מידות לעריכה */
  openRecordId?: string | null;
  onOpenRecordConsumed?: () => void;
};

export default function FieldWindowsView({
  records,
  onRecordsChange,
  crmData,
  onCreateCrmLink,
  businessName = "",
  loading = false,
  openRecordId = null,
  onOpenRecordConsumed,
}: Props) {
  const [tab, setTab] = useState<Tab>("editor");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [items, setItems] = useState<FieldWindowItem[]>([]);
  const [draft, setDraft] = useState<ItemDraft>(emptyItemDraft);
  const [crmModal, setCrmModal] = useState<FieldWindowRecord | null>(null);
  const [crmIncome, setCrmIncome] = useState("");

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const resetEditor = useCallback(() => {
    setEditingId(null);
    setEditingItemId(null);
    setTitle("");
    setClientPhone("");
    setClientAddress("");
    setProjectNotes("");
    setItems([]);
    setDraft(emptyItemDraft());
  }, []);

  const loadRecord = useCallback((record: FieldWindowRecord) => {
    setEditingId(record.id);
    setTitle(record.title);
    setClientPhone(record.clientPhone ?? "");
    setClientAddress(record.clientAddress ?? "");
    setProjectNotes(record.notes ?? "");
    setItems(record.items.map((i) => ({ ...i })));
    setEditingItemId(null);
    setDraft(emptyItemDraft());
    setTab("editor");
  }, []);

  useEffect(() => {
    if (!openRecordId) return;
    const record = records.find((r) => r.id === openRecordId);
    if (record) loadRecord(record);
    onOpenRecordConsumed?.();
  }, [openRecordId, records, loadRecord, onOpenRecordConsumed]);

  const tracksSuggestion = useMemo(
    () =>
      calcSuggestedTracks({
        isFrameOnly: draft.isFrameOnly,
        hasGlass: draft.hasGlass,
        hasShutter: draft.hasShutter,
        hasScreen: draft.hasScreen,
        screenMode: draft.screenMode,
      }),
    [draft.isFrameOnly, draft.hasGlass, draft.hasShutter, draft.hasScreen, draft.screenMode]
  );

  const applyComponentChange = (patch: Partial<ItemDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      const suggestion = calcSuggestedTracks({
        isFrameOnly: next.isFrameOnly,
        hasGlass: next.hasGlass,
        hasShutter: next.hasShutter,
        hasScreen: next.hasScreen,
        screenMode: next.screenMode,
      });
      if (suggestion && !next.isFrameOnly) {
        next.tracks = suggestion.count;
      }
      return next;
    });
  };

  const buildComponents = (d: ItemDraft) => {
    if (d.isFrameOnly) return "מסגרת בלבד";
    const parts: string[] = [];
    if (d.hasGlass) parts.push("זכוכית");
    if (d.hasShutter) parts.push("תריס שלבים");
    if (d.hasRollerShutter) parts.push("תריס גלילה");
    if (d.hasScreen) parts.push("רשת");
    return parts.join(" + ") || "מסגרת בלבד";
  };

  const addOrUpdateItem = () => {
    const width = parseFloat(draft.width) || 0;
    const height = parseFloat(draft.height) || 0;
    if (width <= 0 || height <= 0) {
      alert('יש להזין רוחב וגובה (ס&quot;מ)');
      return;
    }
    const qty = Math.max(1, parseInt(draft.qty, 10) || 1);
    const tracks = draft.isFrameOnly ? "השלמת מסגרת בלבד" : formatTracksLabel(draft.tracks);
    const overlap = draft.isFrameOnly ? "לא רלוונטי" : draft.overlap;
    const lockInfo = draft.isFrameOnly ? "—" : buildLockInfo(draft.lockHeight, draft.lockSide);
    const trimState = trimFromDraft(draft);
    const item: FieldWindowItem = {
      id: editingItemId ?? newFieldWindowItemId(),
      width,
      height,
      sqm: calcSqm(width, height),
      profile: draft.profile,
      glass: draft.glass,
      location: draft.location.trim(),
      color: draft.color.trim(),
      tracks,
      overlap,
      lockInfo,
      components: buildComponents(draft),
      qty,
      notes: draft.notes.trim(),
      isFrameOnly: draft.isFrameOnly,
      screenMode: draft.screenMode,
      trimState,
      trimDescription: formatTrimString(trimState),
    };
    if (editingItemId) {
      setItems((prev) => prev.map((row) => (row.id === editingItemId ? item : row)));
      setEditingItemId(null);
    } else {
      setItems((prev) => [...prev, item]);
    }
    setDraft((d) => ({
      ...emptyItemDraft(),
      profile: d.profile,
      glass: d.glass,
      color: d.color,
      tracks: d.tracks,
      overlap: d.overlap,
      lockSide: d.lockSide,
      hasGlass: d.hasGlass,
      hasShutter: d.hasShutter,
      hasRollerShutter: d.hasRollerShutter,
      hasScreen: d.hasScreen,
      screenMode: d.screenMode,
      trimState: d.trimState,
    }));
  };

  const updateTrimState = (patch: Partial<FieldWindowTrimState>) => {
    setDraft((prev) => ({
      ...prev,
      trimState: {
        internal: { ...prev.trimState.internal, ...(patch.internal ?? {}) },
        external: { ...prev.trimState.external, ...(patch.external ?? {}) },
      },
    }));
  };

  const editItem = (item: FieldWindowItem) => {
    setEditingItemId(item.id);
    const trackNum = parseTracksCount(item.tracks) ?? 2;
    const screenMode = inferScreenModeFromItem(item);
    const trimState = resolveItemTrimState(item);
    setDraft({
      width: String(item.width),
      height: String(item.height),
      profile: item.profile,
      glass: item.glass,
      location: item.location,
      color: item.color,
      tracks: Number.isFinite(trackNum) ? trackNum : 2,
      overlap: OVERLAP_OPTIONS.includes(item.overlap as (typeof OVERLAP_OPTIONS)[number])
        ? item.overlap
        : OVERLAP_OPTIONS[0],
      lockHeight: "",
      lockSide: LOCK_SIDES[2],
      isFrameOnly: item.isFrameOnly,
      hasGlass: item.components.includes("זכוכית"),
      hasShutter: item.components.includes("תריס שלבים"),
      hasRollerShutter: item.components.includes("תריס גלילה"),
      hasScreen: item.components.includes("רשת"),
      screenMode,
      trimState,
      qty: String(item.qty),
      notes: item.notes,
    });
  };

  const saveRecord = () => {
    if (!title.trim()) {
      alert("יש להזין שם פרויקט / מיקום");
      return;
    }
    if (items.length === 0) {
      alert("יש להוסיף לפחות פריט אחד");
      return;
    }
    const now = formatFieldWindowDate();
    const existing = editingId ? records.find((r) => r.id === editingId) : null;
    const record: FieldWindowRecord = {
      id: existing?.id ?? newFieldWindowRecordId(),
      title: title.trim(),
      clientPhone: clientPhone.trim() || undefined,
      clientAddress: clientAddress.trim() || undefined,
      notes: projectNotes.trim() || undefined,
      items,
      crmProjectId: existing?.crmProjectId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = [record, ...records.filter((r) => r.id !== record.id)];
    onRecordsChange(next);
    resetEditor();
    setTab("saved");
    alert(`נשמר: "${record.title}" עם ${record.items.length} פריטים`);
  };

  const deleteRecord = (id: string) => {
    if (!confirm("למחוק את רשימת המידות?")) return;
    onRecordsChange(records.filter((r) => r.id !== id));
    if (editingId === id) resetEditor();
  };

  const handleCreateCrm = () => {
    if (!crmModal) return;
    const income = parseFloat(crmIncome.replace(/[^\d.]/g, "")) || 0;
    const id = Math.max(0, ...crmData.map((p) => p.id), 0) + 1;
    const base = income > 0 ? income / 1.18 : 0;
    const vat = income > 0 ? income - base : 0;
    const project: CrmProject = {
      id,
      date: new Date().toLocaleDateString("he-IL"),
      customer: crmModal.title,
      sellingPriceInc: income,
      income: income,
      incomeExVat: base,
      vatAmount: vat,
      estExpense: 0,
      isFieldWindows: true,
      crmStatus: DEFAULT_CRM_STATUS_AFTER_CALC_SAVE,
      crmStatusSince: new Date().toISOString(),
      formState: {
        fieldWindowRecordId: crmModal.id,
        clientPhone: crmModal.clientPhone,
        clientAddress: crmModal.clientAddress,
      },
    };
    onCreateCrmLink(crmModal.id, project);
    setCrmModal(null);
    setCrmIncome("");
    alert("נוצר כרטיס לקוח ב-CRM");
  };

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";
  const labelCls = "mb-1 block text-xs font-bold text-slate-600";

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        טוען מידות שטח…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">מידות שטח חלונות</h1>
          <p className="text-sm text-slate-500">מדידה בשטח, שמירה בענן, הדפסה וקישור ל-CRM</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              resetEditor();
              setTab("editor");
            }}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "editor" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"}`}
          >
            מדידה בשטח
          </button>
          <button
            type="button"
            onClick={() => setTab("saved")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "saved" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"}`}
          >
            מידות שמורות ({records.length})
          </button>
        </div>
      </div>

      {tab === "editor" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-bold text-slate-800">פרטי פרויקט</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>שם פרויקט / מיקום *</label>
                  <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="דירה 3, בניין הרצל…" />
                </div>
                <div>
                  <label className={labelCls}>טלפון (אופציונלי)</label>
                  <input className={inputCls} dir="ltr" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>כתובת (אופציונלי)</label>
                  <input className={inputCls} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>הערות פרויקט</label>
                  <textarea className={inputCls} rows={2} value={projectNotes} onChange={(e) => setProjectNotes(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={saveRecord} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
                  שמור מידות
                </button>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      printFieldWindowRecord(
                        {
                          id: editingId ?? "draft",
                          title: title || "טיוטה",
                          clientPhone,
                          clientAddress,
                          notes: projectNotes,
                          items,
                          createdAt: formatFieldWindowDate(),
                          updatedAt: formatFieldWindowDate(),
                        },
                        businessName
                      )
                    }
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                  >
                    הדפס PDF
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-bold text-slate-800">{editingItemId ? "עריכת פריט" : "הוספת חלון / דלת"}</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>רוחב (ס&quot;מ)</label>
                    <input type="number" min={1} className={inputCls} value={draft.width} onChange={(e) => setDraft({ ...draft, width: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>גובה (ס&quot;מ)</label>
                    <input type="number" min={1} className={inputCls} value={draft.height} onChange={(e) => setDraft({ ...draft, height: e.target.value })} />
                  </div>
                </div>
                {draft.width && draft.height ? (
                  <p className="text-xs font-bold text-blue-700">שטח: {calcSqm(parseFloat(draft.width) || 0, parseFloat(draft.height) || 0)} מ&quot;ר</p>
                ) : null}
                <div>
                  <label className={labelCls}>מיקום בבית</label>
                  <input className={inputCls} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="סלון, מטבח…" />
                </div>
                <div>
                  <label className={labelCls}>פרופיל</label>
                  <select className={inputCls} value={draft.profile} onChange={(e) => setDraft({ ...draft, profile: e.target.value })}>
                    {FIELD_WINDOW_PROFILES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>זכוכית</label>
                  <select className={inputCls} value={draft.glass} onChange={(e) => setDraft({ ...draft, glass: e.target.value })}>
                    {FIELD_WINDOW_GLASS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>צבע</label>
                  <input className={inputCls} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} placeholder="RAL 9016, לבן…" />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={draft.isFrameOnly} onChange={(e) => applyComponentChange({ isFrameOnly: e.target.checked })} />
                  השלמת מסגרת בלבד
                </label>
                {!draft.isFrameOnly && (
                  <>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={draft.hasGlass} onChange={(e) => applyComponentChange({ hasGlass: e.target.checked })} />זכוכית</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={draft.hasShutter} onChange={(e) => applyComponentChange({ hasShutter: e.target.checked })} />תריס שלבים</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={draft.hasRollerShutter} onChange={(e) => setDraft({ ...draft, hasRollerShutter: e.target.checked })} />תריס גלילה</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={draft.hasScreen} onChange={(e) => applyComponentChange({ hasScreen: e.target.checked })} />רשת</label>
                    </div>
                    {draft.hasScreen && !draft.hasGlass && !draft.hasShutter && (
                      <div className="space-y-1 rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs">
                        <label className="flex items-center gap-2">
                          <input type="radio" name="screenMode" checked={draft.screenMode === "window"} onChange={() => applyComponentChange({ screenMode: "window" })} />
                          רשת כחלק מהחלון (מסילות נוספות)
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="screenMode" checked={draft.screenMode === "addon"} onChange={() => applyComponentChange({ screenMode: "addon" })} />
                          רשת כתוספת על קיים (ללא מסילות נוספות)
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="screenMode" checked={draft.screenMode === "miklachon"} onChange={() => applyComponentChange({ screenMode: "miklachon" })} />
                          פרופיל מקלחון (2 מסילות)
                        </label>
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>מספר מסילות</label>
                      <select className={inputCls} value={draft.tracks} onChange={(e) => setDraft({ ...draft, tracks: parseInt(e.target.value, 10) })}>
                        {TRACK_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      {tracksSuggestion?.hint ? (
                        <p className="mt-1 text-[10px] font-bold leading-snug text-blue-700">{tracksSuggestion.hint}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className={labelCls}>חפיפה</label>
                      <select className={inputCls} value={draft.overlap} onChange={(e) => setDraft({ ...draft, overlap: e.target.value })}>
                        {OVERLAP_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>גובה מנעול (ס&quot;מ)</label>
                        <input className={inputCls} value={draft.lockHeight} onChange={(e) => setDraft({ ...draft, lockHeight: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>צד מנעול</label>
                        <select className={inputCls} value={draft.lockSide} onChange={(e) => setDraft({ ...draft, lockSide: e.target.value })}>
                          {LOCK_SIDES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <p className="mb-2 text-xs font-bold text-blue-900">הגדרות הלבשה (פנים / חוץ)</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TrimSidePicker
                      label="הלבשה פנימית"
                      active={draft.trimState.internal.active}
                      sides={draft.trimState.internal}
                      onActiveChange={(v) => updateTrimState({ internal: { ...draft.trimState.internal, active: v } })}
                      onSideChange={(side, v) =>
                        updateTrimState({ internal: { ...draft.trimState.internal, [side]: v } })
                      }
                    />
                    <TrimSidePicker
                      label="הלבשה חיצונית"
                      active={draft.trimState.external.active}
                      sides={draft.trimState.external}
                      onActiveChange={(v) => updateTrimState({ external: { ...draft.trimState.external, active: v } })}
                      onSideChange={(side, v) =>
                        updateTrimState({ external: { ...draft.trimState.external, [side]: v } })
                      }
                    />
                  </div>
                  <p className="mt-2 text-[10px] font-bold text-indigo-700">{formatTrimString(draft.trimState)}</p>
                </div>
                <div>
                  <label className={labelCls}>כמות</label>
                  <input type="number" min={1} className={inputCls} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>הערות לפריט</label>
                  <input className={inputCls} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>
                <button type="button" onClick={addOrUpdateItem} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                  {editingItemId ? "עדכן פריט" : "הוסף לרשימה"}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">פריטים ({items.length})</h2>
                {items.length > 0 && (
                  <span className="text-sm font-bold text-blue-700">{totalItemsSqm(items)} מ&quot;ר כולל</span>
                )}
              </div>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-slate-400">
                  טרם נוספו פריטים
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-right text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-slate-600">
                        <th className="p-2">מיקום</th>
                        <th className="p-2">מידות</th>
                        <th className="p-2">פרופיל</th>
                        <th className="p-2">זכוכית</th>
                        <th className="p-2">מסילות</th>
                        <th className="p-2">הלבשות</th>
                        <th className="p-2">כמות</th>
                        <th className="p-2">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 font-medium">{item.location || "—"}</td>
                          <td className="p-2">{item.width}×{item.height} <span className="text-xs text-slate-400">({item.sqm} מ&quot;ר)</span></td>
                          <td className="p-2 text-xs">{item.profile}</td>
                          <td className="p-2 text-xs">{item.glass}</td>
                          <td className="p-2 text-xs font-medium text-indigo-800">{item.tracks}</td>
                          <td className="p-2 text-[10px] font-medium text-violet-800">
                            {(item.trimDescription || "ללא הלבשות").split(" | ").map((line) => (
                              <span key={line} className="block">{line}</span>
                            ))}
                          </td>
                          <td className="p-2 font-bold text-blue-700">{item.qty}</td>
                          <td className="p-2">
                            <button type="button" onClick={() => editItem(item)} className="ml-1 text-xs font-bold text-blue-600">ערוך</button>
                            <button type="button" onClick={() => setItems((prev) => prev.filter((r) => r.id !== item.id))} className="text-xs font-bold text-red-500">מחק</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "saved" && (
        <div className="space-y-3">
          {sortedRecords.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
              אין מידות שמורות. עבור ל&quot;מדידה בשטח&quot; והוסף פריטים.
            </p>
          ) : (
            sortedRecords.map((record) => {
              const linked = record.crmProjectId != null ? crmData.find((p) => p.id === record.crmProjectId) : null;
              return (
                <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{record.title}</h3>
                      <p className="text-xs text-slate-500">
                        {record.items.length} פריטים · {totalItemsSqm(record.items)} מ&quot;ר · עודכן {record.updatedAt}
                      </p>
                      {record.clientPhone ? <p className="text-xs text-slate-600">{record.clientPhone}</p> : null}
                      {linked ? (
                        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          מקושר ל-CRM: {linked.customer}
                        </span>
                      ) : (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">לא מקושר ל-CRM</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => loadRecord(record)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">ערוך מידות</button>
                      <button type="button" onClick={() => printFieldWindowRecord(record, businessName)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">הדפס</button>
                      {!record.crmProjectId && (
                        <button type="button" onClick={() => setCrmModal(record)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">צור לקוח ב-CRM</button>
                      )}
                      <button type="button" onClick={() => deleteRecord(record.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">מחק</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {crmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold">צור לקוח ב-CRM</h3>
            <p className="mb-4 text-sm text-slate-500">מפרויקט: {crmModal.title}</p>
            <label className={labelCls}>סכום עסקה כולל מע״מ (אופציונלי)</label>
            <input className={inputCls + " mb-4"} dir="ltr" value={crmIncome} onChange={(e) => setCrmIncome(e.target.value)} placeholder="0" />
            <div className="flex gap-2">
              <button type="button" onClick={handleCreateCrm} className="flex-1 rounded-lg bg-indigo-600 py-2 font-bold text-white">שמור ב-CRM</button>
              <button type="button" onClick={() => { setCrmModal(null); setCrmIncome(""); }} className="rounded-lg border border-slate-300 px-4 py-2 font-bold">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
