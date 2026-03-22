"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_TX = "yarchiTransactions";
const STORAGE_CRM = "yarhi_crm_data";
const VAT_RATE = 0.18;

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const EXPENSE_CATEGORIES = [
  "חומרי גלם / אלומיניום",
  "קבלני משנה / התקנות",
  "שכר עובדים",
  "שכירות ומבנה",
  "רואה חשבון / מיסים",
  "רכב, דלק ונסיעות",
  "תפעול שוטף ושונות",
];

const INCOME_CATEGORIES = [
  "תשלום מפרויקט פרגולה",
  "חלונות",
  "תריסים",
  "עבודות אלומיניום שונות",
  "תיקונים ושירות",
  "הכנסה אחרת",
];

function formatCurrency(amount: number): string {
  const v = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
}

export type CrmProject = {
  id: number;
  date: string;
  customer: string;
  sellingPriceInc: number;
  income: number;
  incomeExVat: number;
  vatAmount: number;
  estExpense: number;
  formState?: unknown;
  isFence?: boolean;
  totalLength?: number;
  isExternal?: boolean;
};

export type Transaction = {
  id: number;
  date: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  projectId?: number | null;
  category?: string;
  baseAmount?: number;
  vatAmount?: number;
  hasVat?: boolean;
};

/** לטעינה ראשונית בדף הראשי (localStorage + סנכרון ענן) */
export function loadTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_TX);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Transaction[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t) => {
      if (t.baseAmount != null && t.vatAmount != null && t.hasVat != null) return t;
      return {
        ...t,
        baseAmount: t.baseAmount ?? t.amount,
        vatAmount: t.vatAmount ?? 0,
        hasVat: t.hasVat ?? false,
        category: t.category ?? (t.type === "income" ? "תשלום מפרויקט פרגולה" : "תפעול שוטף ושונות"),
      };
    });
  } catch {
    return [];
  }
}

type Props = {
  crmData: CrmProject[];
  setCrmData: (v: CrmProject[] | ((prev: CrmProject[]) => CrmProject[])) => void;
  onLoadProject: (id: number) => void;
  /** תנועות קופה – מנוהל בדף הראשי לסנכרון Firestore */
  transactions: Transaction[];
  persistTransactions: (next: Transaction[]) => void;
};

export default function BusinessView({ crmData, setCrmData, onLoadProject, transactions, persistTransactions }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [isAllTime, setIsAllTime] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState<{ id: number; message: string; type: "success" | "error" }[]>([]);
  const [txModal, setTxModal] = useState<{
    open: boolean;
    mode: "income" | "expense";
    edit: Transaction | null;
    projectId: string;
    defaultDesc: string;
  }>({ open: false, mode: "expense", edit: null, projectId: "", defaultDesc: "" });
  const [projectEditModal, setProjectEditModal] = useState<CrmProject | null>(null);
  const [externalModal, setExternalModal] = useState(false);

  const addToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const persistTx = useCallback(
    (next: Transaction[]) => {
      persistTransactions(next);
    },
    [persistTransactions]
  );

  const filteredTransactions = useMemo(() => {
    let list = transactions;
    if (!isAllTime) {
      list = list.filter((t) => {
        const d = t.date || "";
        const [y, m] = d.split("-");
        const monthNum = m ? parseInt(m, 10) - 1 : new Date(d).getMonth();
        const yearNum = y ? parseInt(y, 10) : new Date(d).getFullYear();
        return monthNum === currentMonth && yearNum === currentYear;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => {
        const proj = crmData.find((p) => p.id === t.projectId);
        const cust = proj ? (proj.customer || "").toLowerCase() : "";
        return (
          (t.description || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q) ||
          cust.includes(q)
        );
      });
    }
    return list;
  }, [transactions, currentMonth, currentYear, isAllTime, searchQuery, crmData]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return crmData;
    const q = searchQuery.trim().toLowerCase();
    return crmData.filter((p) => (p.customer || "").toLowerCase().includes(q));
  }, [crmData, searchQuery]);

  const stats = useMemo(() => {
    const actualIncome = filteredTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpense = filteredTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const vatCollected = filteredTransactions
      .filter((t) => t.type === "income" && t.hasVat)
      .reduce((s, t) => s + (t.vatAmount ?? 0), 0);
    const vatPaid = filteredTransactions
      .filter((t) => t.type === "expense" && t.hasVat)
      .reduce((s, t) => s + (t.vatAmount ?? 0), 0);
    const vatBalance = vatCollected - vatPaid;
    const totalDebt = crmData.reduce((a, p) => {
      const paid = transactions.filter((t) => t.projectId === p.id && t.type === "income").reduce((s, t) => s + t.amount, 0);
      return a + Math.max(0, (p.sellingPriceInc ?? 0) - paid);
    }, 0);
    const debtors = crmData
      .map((p) => {
        const paid = transactions.filter((t) => t.projectId === p.id && t.type === "income").reduce((s, t) => s + t.amount, 0);
        const debt = (p.sellingPriceInc ?? 0) - paid;
        return { ...p, paid, debt };
      })
      .filter((p) => p.debt > 0)
      .sort((a, b) => b.debt - a.debt);
    return {
      actualIncome,
      totalExpense,
      netFlow: actualIncome - totalExpense,
      vatCollected,
      vatPaid,
      vatBalance,
      totalDebt,
      debtors,
    };
  }, [filteredTransactions, crmData, transactions]);

  const openTxAdd = (mode: "income" | "expense") =>
    setTxModal({ open: true, mode, edit: null, projectId: "", defaultDesc: "" });
  const openTxForProject = (projectId: number, mode: "income" | "expense", desc = "") =>
    setTxModal({ open: true, mode, edit: null, projectId: String(projectId), defaultDesc: desc });
  const openTxEdit = (tx: Transaction) =>
    setTxModal({ open: true, mode: tx.type, edit: tx, projectId: tx.projectId ? String(tx.projectId) : "", defaultDesc: "" });
  const closeTxModal = () => setTxModal({ open: false, mode: "expense", edit: null, projectId: "", defaultDesc: "" });

  const handleSaveTransaction = useCallback(
    (txData: Transaction, action: "add" | "edit") => {
      if (action === "edit") {
        persistTx(transactions.map((t) => (t.id === txData.id ? txData : t)));
        addToast("התנועה עודכנה", "success");
      } else {
        persistTx([txData, ...transactions]);
        addToast("התנועה נשמרה בקופה בהצלחה", "success");
      }
      closeTxModal();
    },
    [transactions, persistTx, addToast]
  );

  const deleteTransaction = useCallback(
    (id: number) => {
      if (typeof window !== "undefined" && !window.confirm("האם למחוק תנועה זו לחלוטין?")) return;
      persistTx(transactions.filter((t) => t.id !== id));
      addToast("התנועה נמחקה", "error");
    },
    [transactions, persistTx, addToast]
  );

  const addExternalProject = useCallback(
    (name: string, income: number) => {
      const id = Math.max(0, ...crmData.map((p) => p.id)) + 1;
      const base = income / (1 + VAT_RATE);
      const vat = income - base;
      setCrmData([
        {
          id,
          date: new Date().toISOString().slice(0, 10),
          customer: name,
          sellingPriceInc: income,
          income: base,
          incomeExVat: base,
          vatAmount: vat,
          estExpense: 0,
          isExternal: true,
        },
        ...crmData,
      ]);
      setExternalModal(false);
      addToast("הלקוח נשמר! עכשיו ניתן להוסיף לו תשלומים", "success");
    },
    [crmData, setCrmData, addToast]
  );

  const handleSaveProjectEdit = useCallback(
    (id: number, newName: string, newIncome: number) => {
      const base = newIncome / (1 + VAT_RATE);
      const vat = newIncome - base;
      setCrmData((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                customer: newName,
                sellingPriceInc: newIncome,
                income: base,
                incomeExVat: base,
                vatAmount: vat,
              }
            : p
        )
      );
      setProjectEditModal(null);
      addToast("פרטי הלקוח עודכנו בהצלחה", "success");
    },
    [setCrmData, addToast]
  );

  const deleteProject = useCallback(
    (id: number) => {
      if (typeof window !== "undefined" && !window.confirm('האם למחוק פרויקט זה מהמערכת? (הפעולה תמחק את הלקוח מה-CRM, והתשלומים שלו יהפכו ל"כלליים" ללא שיוך)'))
        return;
      persistTx(transactions.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)));
      setCrmData((prev) => prev.filter((p) => p.id !== id));
      setProjectEditModal(null);
      addToast("הפרויקט נמחק מהמערכת", "error");
    },
    [transactions, persistTx, setCrmData, addToast]
  );

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else setCurrentMonth((m) => m + 1);
  };

  return (
    <div className="bg-[#f8fafc] min-h-screen p-6 md:p-8 text-right">
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">ניהול פיננסי וגבייה</h2>
          <p className="text-slate-500 mt-1 font-medium">מעקב אחרי מקדמות, יתרות חוב של לקוחות, הוצאות העסק וחישוב מע&quot;מ כולל.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setExternalModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md flex items-center gap-2 text-sm">
            הוסף פרויקט חיצוני (חלונות/וכו&apos;)
          </button>
          <button type="button" onClick={() => openTxAdd("income")} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md flex items-center gap-2 text-sm">
            הוסף הכנסה / מוצר
          </button>
          <button type="button" onClick={() => openTxAdd("expense")} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md flex items-center gap-2 text-sm">
            הוסף הוצאה
          </button>
        </div>
      </header>

      {/* חיתוך חודשים וחיפוש */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 w-full xl:w-auto justify-center">
          <div className={`flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200 transition-opacity ${isAllTime ? "opacity-50 pointer-events-none" : ""}`}>
            <button type="button" onClick={prevMonth} className="p-2 hover:bg-white rounded-lg text-slate-500">
              ‹
            </button>
            <div className="flex items-center gap-1 px-2">
              <select
                className="bg-transparent font-black text-blue-800 outline-none cursor-pointer hover:bg-slate-200 p-1 rounded appearance-none text-center"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                className="bg-transparent font-black text-blue-800 outline-none cursor-pointer hover:bg-slate-200 p-1 rounded appearance-none text-center"
                value={currentYear}
                onChange={(e) => setCurrentYear(Number(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={nextMonth} className="p-2 hover:bg-white rounded-lg text-slate-500">
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsAllTime(!isAllTime)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${isAllTime ? "bg-blue-600 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {isAllTime ? "חזור לחודשי" : "הצג הכל"}
          </button>
        </div>
        <div className="w-full xl:w-1/3">
          <input
            type="text"
            placeholder="חפש לקוח, הוצאה או פרויקט..."
            className="w-full pl-3 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Debt Tracker Bubble */}
      {stats.totalDebt > 0 ? (
        <div className="bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 rounded-3xl p-1 mb-8 shadow-lg relative overflow-hidden">
          <div className="bg-white rounded-[22px] p-6 flex flex-col xl:flex-row items-center gap-6 relative z-10">
            <div className="flex flex-col items-center justify-center shrink-0 w-full xl:w-auto xl:pr-6 xl:border-l border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                <p className="text-slate-600 font-bold text-lg">סה&quot;כ כספים שחייבים לך בחוץ</p>
              </div>
              <p className="text-5xl font-black text-red-600 tracking-tight">{formatCurrency(stats.totalDebt)}</p>
            </div>
            <div className="flex-1 w-full overflow-hidden">
              <h4 className="font-bold text-slate-800 mb-3">פירוט לקוחות שעדיין לא שילמו הכל:</h4>
              <div className="flex overflow-x-auto gap-4 pb-3">
                {stats.debtors.map((d) => (
                  <div key={d.id} className="min-w-[240px] bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col justify-between shrink-0 shadow-sm hover:border-red-300 transition-colors">
                    <div className="font-bold text-slate-800 text-lg mb-2 truncate" title={d.customer}>{d.customer}</div>
                    <div className="text-sm text-slate-500 flex justify-between">סך עסקה: <span className="font-bold">{formatCurrency(d.sellingPriceInc ?? 0)}</span></div>
                    <div className="text-sm text-emerald-600 flex justify-between">שולם (מקדמות): <span className="font-bold">{formatCurrency(d.paid)}</span></div>
                    <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">יתרה לגבייה:</span>
                      <span className="font-black text-red-600 text-lg">{formatCurrency(d.debt)}</span>
                    </div>
                    <button type="button" onClick={() => openTxForProject(d.id, "income")} className="mt-3 w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2 rounded-xl text-xs transition-colors">
                      קבל תשלום
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-100 rounded-3xl p-6 mb-8 flex items-center gap-5 shadow-sm border border-emerald-200">
          <div className="bg-emerald-500 text-white p-3 rounded-full shadow-md text-2xl">✓</div>
          <div>
            <h3 className="text-2xl font-black text-emerald-800 mb-1">מצב קופה מצוין - אין חובות פתוחים!</h3>
            <p className="text-emerald-700 font-medium">כל הלקוחות במערכת שילמו את מלוא סכום העסקה.</p>
          </div>
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500" />
          <p className="text-slate-500 text-sm font-bold mb-2">הכנסות ({isAllTime ? "כל הזמנים" : MONTHS[currentMonth]})</p>
          <p className="text-3xl font-black text-emerald-600">{formatCurrency(stats.actualIncome)}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-red-500" />
          <p className="text-slate-500 text-sm font-bold mb-2">הוצאות ({isAllTime ? "כל הזמנים" : MONTHS[currentMonth]})</p>
          <p className="text-3xl font-black text-red-600">{formatCurrency(stats.totalExpense)}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-6 shadow-sm border border-blue-200 relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-500" />
          <div className="flex justify-between items-end mb-1">
            <p className="text-blue-800 text-sm font-bold">מע&quot;מ עסקאות (נגבה):</p>
            <p className="font-bold text-blue-900">{formatCurrency(stats.vatCollected)}</p>
          </div>
          <div className="flex justify-between items-end mb-3 border-b border-blue-200 pb-2">
            <p className="text-blue-800 text-sm font-bold">מע&quot;מ תשומות (שולם):</p>
            <p className="font-bold text-blue-900">{formatCurrency(stats.vatPaid)}</p>
          </div>
          <div className="flex justify-between items-end">
            <p className="text-blue-900 font-black">{stats.vatBalance > 0 ? "לתשלום לרשויות:" : "להחזר מהרשויות:"}</p>
            <p className="text-xl font-black text-blue-900 bg-white px-2 py-0.5 rounded shadow-sm">{formatCurrency(Math.abs(stats.vatBalance))}</p>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-6 shadow-sm border border-emerald-200 relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-600" />
          <p className="text-emerald-800 text-sm font-bold mb-2">תזרים נטו מעסקים</p>
          <p className="text-3xl font-black text-emerald-700">{formatCurrency(stats.netFlow)}</p>
          <p className="text-xs text-emerald-600 mt-1 font-bold">הכנסות פחות הוצאות בפועל</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Projects */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[750px]">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800">ניהול פרויקטים ולקוחות (כלל הלקוחות)</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-5 space-y-5 bg-slate-50/50">
            {filteredProjects.length === 0 ? (
              <div className="text-center py-10 text-slate-400">לא נמצאו פרויקטים מתאימים.</div>
            ) : (
              filteredProjects.map((p) => {
                const projExp = transactions.filter((t) => t.type === "expense" && t.projectId === p.id).reduce((s, t) => s + t.amount, 0);
                const projInc = transactions.filter((t) => t.type === "income" && t.projectId === p.id).reduce((s, t) => s + t.amount, 0);
                const dealValue = p.sellingPriceInc ?? 0;
                const debt = dealValue - projInc;
                const isFullyPaid = debt <= 0;
                return (
                  <div
                    key={p.id}
                    className={`bg-white border-2 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all ${isFullyPaid ? "border-emerald-200" : "border-slate-200 hover:border-blue-300"}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-black text-xl text-slate-800">{p.customer}</h4>
                          {isFullyPaid && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">שולם במלואו</span>}
                          {p.isExternal && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">פרויקט חיצוני</span>}
                        </div>
                        <p className="text-xs text-slate-400 mb-3">{p.date}</p>
                        <div className="flex flex-wrap gap-2">
                          {!p.isExternal && (
                            <button type="button" onClick={() => onLoadProject(p.id)} className="text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 border border-slate-200 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm">
                              טען מידות ו-3D
                            </button>
                          )}
                          <button type="button" onClick={() => setProjectEditModal(p)} className="text-xs text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm">
                            עריכה
                          </button>
                          <button type="button" onClick={() => deleteProject(p.id)} className="text-xs text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 border border-slate-200 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm">
                            מחיקה
                          </button>
                        </div>
                      </div>
                      <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-200 text-center min-w-[130px] shadow-inner">
                        <p className="text-xs font-bold text-slate-500 mb-0.5">סך עסקה (יעד):</p>
                        <p className="font-black text-slate-800 text-2xl">{formatCurrency(dealValue)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4 text-center border-y border-slate-100 py-3">
                      <div>
                        <p className="text-xs text-slate-500 font-bold mb-1">שולם מתוך זה:</p>
                        <p className="font-black text-emerald-600">{formatCurrency(projInc)}</p>
                      </div>
                      <div className="border-r border-slate-100">
                        <p className="text-xs text-slate-500 font-bold mb-1">נשאר לגבות:</p>
                        <p className={`font-black ${debt > 0 ? "text-red-500" : "text-slate-400"}`}>{formatCurrency(debt)}</p>
                      </div>
                      <div className="border-r border-slate-100">
                        <p className="text-xs text-slate-500 font-bold mb-1">הוצאות (ספקים):</p>
                        <p className="font-black text-orange-500">{formatCurrency(projExp)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 mt-2">
                      {!isFullyPaid && (
                        <div className="flex gap-2 w-full">
                          <button type="button" onClick={() => openTxForProject(p.id, "income", "מקדמה")} className="flex-1 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 py-2 rounded-xl font-bold text-xs transition-all">
                            קבלת מקדמה
                          </button>
                          <button type="button" onClick={() => openTxForProject(p.id, "income", "תשלום אמצע")} className="flex-1 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 py-2 rounded-xl font-bold text-xs transition-all">
                            תשלום אמצע
                          </button>
                          <button type="button" onClick={() => openTxForProject(p.id, "income", "גמר חשבון")} className="flex-1 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 py-2 rounded-xl font-bold text-xs transition-all">
                            גמר חשבון
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={() => openTxForProject(p.id, "expense")} className="w-full bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 py-2 rounded-xl font-bold text-sm transition-colors">
                        שיוך הוצאה לפרויקט זה (קבלן, חומר...)
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[750px]">
          <div className="p-5 border-b border-slate-100 bg-slate-50">
            <h3 className="text-xl font-bold text-slate-800">היסטוריית הכנסות והוצאות ({isAllTime ? "כל הזמנים" : MONTHS[currentMonth]})</h3>
          </div>
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-white shadow-sm z-10">
                <tr className="text-slate-500 border-b border-slate-100">
                  <th className="p-4 font-bold">תאריך</th>
                  <th className="p-4 font-bold">פרטים</th>
                  <th className="p-4 font-bold">סכום</th>
                  <th className="p-4 font-bold text-center">עריכה / מחיקה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-slate-400">אין תנועות בחודש זה</td>
                  </tr>
                ) : (
                  [...filteredTransactions]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t) => {
                      const proj = crmData.find((p) => p.id === t.projectId);
                      const isInc = t.type === "income";
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-slate-500 font-medium whitespace-nowrap">
                            <span className={`w-2 h-2 rounded-full inline-block ml-2 ${isInc ? "bg-emerald-500" : "bg-red-500"}`} />
                            {new Date(t.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-700">{t.category || (isInc ? "הכנסה" : "הוצאה")}</div>
                            <div className="text-xs text-slate-500 mt-0.5 max-w-[150px] truncate" title={t.description}>{t.description || "-"}</div>
                            {proj && (
                              <div className="mt-1.5">
                                <span className="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-bold">{proj.customer}</span>
                              </div>
                            )}
                          </td>
                          <td className={`p-4 font-black whitespace-nowrap text-lg ${isInc ? "text-emerald-600" : "text-red-600"}`}>
                            {isInc ? "+" : "-"}
                            {formatCurrency(t.amount)}
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center gap-1.5">
                              <button type="button" onClick={() => openTxEdit(t)} className="text-slate-500 hover:text-blue-600 bg-white border border-slate-200 shadow-sm p-2 rounded-lg hover:bg-blue-50 transition-all" title="ערוך רישום">
                                עריכה
                              </button>
                              <button type="button" onClick={() => deleteTransaction(t.id)} className="text-slate-500 hover:text-red-600 bg-white border border-slate-200 shadow-sm p-2 rounded-lg hover:bg-red-50 transition-all" title="מחק רישום">
                                מחיקה
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {txModal.open && (
        <TxModalFull
          isOpen={txModal.open}
          txMode={txModal.mode}
          edit={txModal.edit}
          defaultProjectId={txModal.projectId}
          defaultDesc={txModal.defaultDesc}
          projects={crmData}
          onSave={handleSaveTransaction}
          onClose={closeTxModal}
        />
      )}

      {projectEditModal && (
        <ProjectEditModalFull
          project={projectEditModal}
          onSave={(id, name, income) => handleSaveProjectEdit(id, name, income)}
          onClose={() => setProjectEditModal(null)}
        />
      )}

      {externalModal && (
        <NewExternalProjectModalFull onSave={addExternalProject} onClose={() => setExternalModal(false)} />
      )}

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
              toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxModalFull({
  isOpen,
  txMode,
  edit,
  defaultProjectId,
  defaultDesc,
  projects,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  txMode: "income" | "expense";
  edit: Transaction | null;
  defaultProjectId: string;
  defaultDesc: string;
  projects: CrmProject[];
  onSave: (tx: Transaction, action: "add" | "edit") => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(edit?.date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(edit?.category ?? (txMode === "income" ? (defaultProjectId ? "תשלום מפרויקט פרגולה" : "חלונות") : defaultProjectId ? "חומרי גלם / אלומיניום" : "רכב, דלק ונסיעות"));
  const [amountInput, setAmountInput] = useState(edit?.amount ? String(edit.amount) : "");
  const [vatMode, setVatMode] = useState<"inc" | "exc" | "none">(edit?.hasVat !== false ? "inc" : "none");
  const [description, setDescription] = useState(edit?.description ?? defaultDesc);
  const [projectId, setProjectId] = useState(edit?.projectId ? String(edit.projectId) : defaultProjectId);

  useEffect(() => {
    if (isOpen && edit) {
      setDate(edit.date);
      setCategory(edit.category ?? (txMode === "income" ? "תשלום מפרויקט פרגולה" : "תפעול שוטף ושונות"));
      setAmountInput(String(edit.amount));
      setVatMode(edit.hasVat ? "inc" : "none");
      setDescription(edit.description ?? "");
      setProjectId(edit.projectId ? String(edit.projectId) : "");
    } else if (isOpen) {
      setDate(new Date().toISOString().slice(0, 10));
      setCategory(txMode === "income" ? (defaultProjectId ? "תשלום מפרויקט פרגולה" : "חלונות") : defaultProjectId ? "חומרי גלם / אלומיניום" : "רכב, דלק ונסיעות");
      setAmountInput("");
      setVatMode("inc");
      setDescription(defaultDesc);
      setProjectId(defaultProjectId);
    }
  }, [isOpen, edit, txMode, defaultProjectId, defaultDesc]);

  const rawAmount = Number(amountInput) || 0;
  const { finalAmount, vatAmount, baseAmount } = useMemo(() => {
    let f = rawAmount,
      v = 0,
      b = rawAmount;
    if (vatMode === "inc") {
      b = rawAmount / (1 + VAT_RATE);
      v = rawAmount - b;
      f = rawAmount;
    } else if (vatMode === "exc") {
      v = rawAmount * VAT_RATE;
      f = rawAmount + v;
      b = rawAmount;
    }
    return { finalAmount: f, vatAmount: v, baseAmount: b };
  }, [amountInput, vatMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const txData: Transaction = {
      id: edit?.id ?? Date.now(),
      date,
      type: txMode,
      amount: finalAmount,
      baseAmount,
      vatAmount,
      hasVat: vatMode !== "none",
      description,
      projectId: projectId ? Number(projectId) : null,
      category,
    };
    onSave(txData, edit ? "edit" : "add");
  };

  if (!isOpen) return null;

  const categories = txMode === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all";
  const selectClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
          <h3 className="text-2xl font-black text-slate-800">
            {edit ? (txMode === "income" ? "עריכת תשלום" : "עריכת הוצאה") : txMode === "income" ? "קבלת תשלום מלקוח / הכנסה" : "רישום הוצאה חדשה"}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">תאריך *</label>
                <input required type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">סוג / קטגוריה *</label>
                <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={`p-5 rounded-2xl border ${txMode === "income" ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"}`}>
              <div className="grid grid-cols-1 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">הסכום שהועבר בפועל (₪) *</label>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    className={`${inputClass} text-2xl font-black tracking-wider ${txMode === "income" ? "text-emerald-600" : "text-red-600"}`}
                    value={amountInput ? Number(amountInput).toLocaleString("en-US") : ""}
                    onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">חישוב מע&quot;מ עסקאות (18%)</label>
                  <select className={`${selectClass} font-bold`} value={vatMode} onChange={(e) => setVatMode(e.target.value as "inc" | "exc" | "none")}>
                    <option value="inc">הסכום שהוזן כולל מע&quot;מ</option>
                    <option value="exc">הסכום שהוזן לא כולל מע&quot;מ (לפני)</option>
                    <option value="none">פטור ממע&quot;מ</option>
                  </select>
                </div>
              </div>
              {amountInput && (
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mt-2">
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-slate-500">בסיס (לפני מע&quot;מ):</span>
                    <span className="font-medium">{formatCurrency(baseAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mb-2 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">מע&quot;מ נגזר (18%):</span>
                    <span className="font-medium text-indigo-600">{vatMode === "none" ? "0 ₪" : formatCurrency(vatAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">סך הכל {txMode === "income" ? "שנכנס לקופה" : "שיצא מהקופה"}:</span>
                    <span className={`font-black text-lg ${txMode === "income" ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(finalAmount)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
              <label className="block text-sm font-bold text-slate-800 mb-2">שיוך לפרויקט קיים (לא חובה)</label>
              <select className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">-- כללי (ללא שיוך לפרויקט) --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.customer}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">פרטים / איזה חלק שולם?</label>
              {txMode === "income" && (
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setDescription("מקדמה")} className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors">
                    מקדמה
                  </button>
                  <button type="button" onClick={() => setDescription("תשלום אמצע")} className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors">
                    תשלום אמצע
                  </button>
                  <button type="button" onClick={() => setDescription("גמר חשבון")} className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors">
                    גמר חשבון
                  </button>
                </div>
              )}
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={txMode === "income" ? "לדוג': תשלום חלקי באשראי או מקדמה" : "לדוג': חרירי אלומיניום חשבונית 405"} />
            </div>
          </div>
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 rounded-b-3xl shrink-0">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all">
              {edit ? "שמור שינויים" : "תעד במערכת"}
            </button>
            <button type="button" onClick={onClose} className="px-6 bg-white border border-slate-300 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-100 transition-all">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectEditModalFull({
  project,
  onSave,
  onClose,
}: {
  project: CrmProject;
  onSave: (id: number, name: string, income: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.customer ?? "");
  const [incomeInput, setIncomeInput] = useState(String(project.sellingPriceInc ?? 0));

  useEffect(() => {
    setName(project.customer ?? "");
    setIncomeInput(String(project.sellingPriceInc ?? 0));
  }, [project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(project.id, name, Number(incomeInput) || 0);
  };

  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-100 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-800">עריכת פרטי פרויקט</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">שם הלקוח</label>
            <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">סך עסקה מעודכן (₪ כולל מע&quot;מ)</label>
            <input
              required
              type="text"
              inputMode="numeric"
              className={`${inputClass} text-xl font-black`}
              value={incomeInput ? Number(incomeInput).toLocaleString("en-US") : ""}
              onChange={(e) => setIncomeInput(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all">
              שמור פרטים
            </button>
            <button type="button" onClick={onClose} className="px-6 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewExternalProjectModalFull({
  onSave,
  onClose,
}: {
  onSave: (name: string, income: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [incomeInput, setIncomeInput] = useState("");

  useEffect(() => {
    setName("");
    setIncomeInput("");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(name, Number(incomeInput) || 0);
  };

  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-100 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-800">תיק עבודה חיצונית</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">שם הלקוח / הפרויקט *</label>
            <input required placeholder="לדוגמה: משפחת כהן - תריסים" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">סך העסקה (₪ כולל מע&quot;מ) *</label>
            <input
              required
              type="text"
              inputMode="numeric"
              placeholder="0"
              className={`${inputClass} text-xl font-black`}
              value={incomeInput ? Number(incomeInput).toLocaleString("en-US") : ""}
              onChange={(e) => setIncomeInput(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all">
              שמור לקוח
            </button>
            <button type="button" onClick={onClose} className="px-6 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
