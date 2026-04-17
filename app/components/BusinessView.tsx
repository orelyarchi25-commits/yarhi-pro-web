"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmStatus } from "@/lib/crm-status";
import {
  CRM_STATUS_SELECT_OPTIONS,
  CRM_STATUS_UI,
  crmLeadEntryShowsAsClient,
  crmProjectEligibleForDebtors,
  crmProjectShowsLifecycleLeadClientPill,
  crmStatusRequiresPositiveDealIncVat,
  getCrmStatusLabel,
  parseCrmStatus,
} from "@/lib/crm-status";
import { DEFAULT_VAT_DECIMAL, formatBusinessVatPercentLabel } from "@/lib/vat";

const STORAGE_TX = "yarchiTransactions";
const STORAGE_CRM = "yarhi_crm_data";

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

/** קודים לשמירה ב-JSON — תוויות בעברית ב-INCOME_PAYMENT_TERMS_LABELS */
export const INCOME_PAYMENT_TERMS_CODES = [
  "immediate",
  "on_receipt",
  "on_completion",
  "on_delivery",
  "net7",
  "net14",
  "net21",
  "net30",
  "net45",
  "net60",
  "net75",
  "net90",
  "net120",
  "eom",
  "eom_plus30",
  "eom_plus45",
  "eom_plus60",
  "installments",
  "partial_now_balance_later",
  "postdated_checks",
  "open_account",
  "other_custom",
] as const;

export type IncomePaymentTermsCode = (typeof INCOME_PAYMENT_TERMS_CODES)[number];

const INCOME_PAYMENT_TERMS_OPTIONS: { value: IncomePaymentTermsCode; label: string }[] = [
  { value: "immediate", label: "מיידי / במעמד החשבונית" },
  { value: "on_receipt", label: "בתשלום בקבלה / המחאה בקליטה" },
  { value: "on_completion", label: "עם סיום העבודה" },
  { value: "on_delivery", label: "במסירה / באספקה" },
  { value: "net7", label: "שוטף +7 ימים ממועד החשבונית" },
  { value: "net14", label: "שוטף +15 ימים" },
  { value: "net21", label: "שוטף +21 ימים" },
  { value: "net30", label: "שוטף +30 ימים" },
  { value: "net45", label: "שוטף +45 ימים" },
  { value: "net60", label: "שוטף +60 ימים" },
  { value: "net75", label: "שוטף +75 ימים" },
  { value: "net90", label: "שוטף +90 ימים" },
  { value: "net120", label: "שוטף +120 ימים" },
  { value: "eom", label: "סוף חודש (EOM)" },
  { value: "eom_plus30", label: "סוף חודש +30 ימים" },
  { value: "eom_plus45", label: "סוף חודש +45 ימים" },
  { value: "eom_plus60", label: "סוף חודש +60 ימים" },
  { value: "installments", label: "תשלומים / מקדמה + יתרה" },
  { value: "partial_now_balance_later", label: "חלק עכשיו — שאר בהמשך (לפי הסכמה)" },
  { value: "postdated_checks", label: "צ׳קים דחויים / תאריכי פרעון שונים" },
  { value: "open_account", label: "חשבון פתוח (קרדיט / לקוח קבוע)" },
  { value: "other_custom", label: "אחר — פירוט בהערה" },
];

export function formatIncomePaymentTerms(code: IncomePaymentTermsCode | string | undefined): string {
  if (!code) return "";
  const o = INCOME_PAYMENT_TERMS_OPTIONS.find((x) => x.value === code);
  return o?.label ?? String(code);
}

function isIncomePaymentTermsCode(v: string): v is IncomePaymentTermsCode {
  return (INCOME_PAYMENT_TERMS_CODES as readonly string[]).includes(v);
}

function normalizeIncomePaymentTerms(v: string | undefined): IncomePaymentTermsCode {
  if (v && isIncomePaymentTermsCode(v)) return v;
  return "immediate";
}

function formatCurrency(amount: number): string {
  const v = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
}

type IncomeVatEntryMode = "inc" | "exc" | "none";

function normalizeIncomeVatEntryMode(v: string | undefined, hasVat: boolean): IncomeVatEntryMode {
  if (!hasVat) return "none";
  if (v === "exc" || v === "inc") return v;
  return "inc";
}

/** המרת סכום שהוזן לפי מצב מע״מ → סכום סופי (כולל מע״מ כשיש), בסיס ומע״מ */
function moneyFromVatRaw(
  raw: number,
  vatMode: IncomeVatEntryMode,
  vatRate: number
): { final: number; vat: number; base: number; hasVat: boolean } {
  const r = raw < 0 || isNaN(raw) ? 0 : raw;
  const vr = vatRate >= 0 && Number.isFinite(vatRate) ? vatRate : DEFAULT_VAT_DECIMAL;
  if (vatMode === "none") return { final: r, vat: 0, base: r, hasVat: false };
  if (vatMode === "inc") {
    const base = r / (1 + vr);
    const vat = r - base;
    return { final: r, vat, base, hasVat: true };
  }
  const vat = r * vr;
  return { final: r + vat, vat, base: r, hasVat: true };
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
  /** ליד שנכנס מהלוח בקרה (לא מפרגולה/גדר) */
  isLead?: boolean;
  /** שלב במעקב — קובע הופעה ברשימת חייבים */
  crmStatus?: CrmStatus;
  /** מתי הוגדר crmStatus הנוכחי (ISO) — למעקב 48 שעות בלוח הבקרה */
  crmStatusSince?: string;
};

/** למילוי אוטומטי בפרטי לקוח במודל תשלום — ליד / פרגולה / גדר */
function getIncomePrefillFromCrmProject(p: CrmProject): { name: string; phone: string; address: string } {
  const fs = (p.formState ?? {}) as Record<string, unknown>;
  if (p.isLead) {
    return {
      name: (p.customer ?? "").trim(),
      phone: String(fs.leadPhone ?? "").trim(),
      address: String(fs.leadAddress ?? "").trim(),
    };
  }
  if (p.isFence) {
    const fromForm = String(fs.fenceCustName ?? "").trim();
    const fallbackName = (p.customer ?? "").replace(/\s*\(גדר\)\s*$/, "").trim();
    return {
      name: fromForm || fallbackName,
      phone: String(fs.fenceCustPhone ?? "").trim(),
      address: String(fs.fenceCustAddress ?? "").trim(),
    };
  }
  const custName = String(fs.custName ?? "").trim();
  return {
    name: custName || (p.customer ?? "").trim(),
    phone: String(fs.custPhone ?? "").trim(),
    address: String(fs.custAddress ?? "").trim(),
  };
}

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
  /** פרטי לקוח/משלם – רלוונטי לתנועות הכנסה */
  incomeCustomerName?: string;
  incomeCustomerPhone?: string;
  incomeCustomerAddress?: string;
  /** פירוט העבודה / התיקון / לנושא */
  incomeWorkDetails?: string;
  /** תנאי תשלום צפוי (מיידי, שוטף +30 וכו׳) */
  incomePaymentTerms?: IncomePaymentTermsCode | string;
  /** תאריך יעד לתשלום (אופציונלי) — YYYY-MM-DD */
  incomePaymentExpectedDate?: string;
  /** הערה לתנאי תשלום — במיוחד כש־other_custom או פירוט צ׳קים */
  incomePaymentTermsNote?: string;
  /** קישור ללקוח קצה גם בלי שיוך לפרויקט CRM */
  linkedCustomerName?: string;
  /** יתרה פתוחה לגבייה מהכנסה זו (אם טרם שולם מלא) */
  incomeOutstandingAmount?: number;
  /** איך הוזנו סכומי ההכנסה (כולל/לפני מע״מ) — לעריכה ולחישוב יתרה פתוחה */
  incomeVatEntryMode?: IncomeVatEntryMode;
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
  /** שיעור מע״מ עשרוני (0.18) מתוך הגדרות העסק */
  businessVatRate?: number;
};

export default function BusinessView({
  crmData,
  setCrmData,
  onLoadProject,
  transactions,
  persistTransactions,
  businessVatRate = DEFAULT_VAT_DECIMAL,
}: Props) {
  const vatPercentLabel = formatBusinessVatPercentLabel(businessVatRate);
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
          cust.includes(q) ||
          (t.incomeCustomerName || "").toLowerCase().includes(q) ||
          (t.incomeCustomerPhone || "").toLowerCase().includes(q) ||
          (t.incomeCustomerAddress || "").toLowerCase().includes(q) ||
          (t.incomeWorkDetails || "").toLowerCase().includes(q) ||
          (t.incomePaymentTermsNote || "").toLowerCase().includes(q) ||
          formatIncomePaymentTerms(t.incomePaymentTerms).toLowerCase().includes(q) ||
          (t.linkedCustomerName || "").toLowerCase().includes(q) ||
          String(t.incomeOutstandingAmount ?? "").includes(q)
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

  /** לקוחות שנשמרו דרך הכנסות (גם בלי פרויקט CRM) — לשיוך הוצאות */
  const incomeCustomerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .filter((t) => t.type === "income")
            .flatMap((t) => [t.incomeCustomerName ?? "", t.linkedCustomerName ?? ""])
            .map((x) => x.trim())
            .filter((x) => x.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b, "he")),
    [transactions]
  );

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
    const projectTotalDebt = crmData.reduce((a, p) => {
      if (!crmProjectEligibleForDebtors(p)) return a;
      const paid = transactions.filter((t) => t.projectId === p.id && t.type === "income").reduce((s, t) => s + t.amount, 0);
      return a + Math.max(0, (p.sellingPriceInc ?? 0) - paid);
    }, 0);
    const projectDebtors = crmData
      .filter(crmProjectEligibleForDebtors)
      .map((p) => {
        const paid = transactions.filter((t) => t.projectId === p.id && t.type === "income").reduce((s, t) => s + t.amount, 0);
        const debt = (p.sellingPriceInc ?? 0) - paid;
        return { source: "project" as const, key: `project-${p.id}`, projectId: p.id, customer: p.customer, sellingPriceInc: p.sellingPriceInc ?? 0, paid, debt };
      })
      .filter((p) => p.debt > 0);

    const extraByCustomer = new Map<string, { sellingPriceInc: number; paid: number; debt: number }>();
    transactions
      .filter((t) => t.type === "income" && (t.incomeOutstandingAmount ?? 0) > 0)
      .forEach((t) => {
        const customer =
          (t.incomeCustomerName || "").trim() ||
          (t.linkedCustomerName || "").trim() ||
          crmData.find((p) => p.id === t.projectId)?.customer?.trim() ||
          "לקוח ללא שם";
        const due = Math.max(0, t.incomeOutstandingAmount ?? 0);
        const paid = Math.max(0, t.amount ?? 0);
        const agg = extraByCustomer.get(customer) ?? { sellingPriceInc: 0, paid: 0, debt: 0 };
        agg.sellingPriceInc += paid + due;
        agg.paid += paid;
        agg.debt += due;
        extraByCustomer.set(customer, agg);
      });

    const extraDebtors = Array.from(extraByCustomer.entries()).map(([customer, v]) => ({
      source: "income" as const,
      key: `income-${customer}`,
      projectId: null as number | null,
      customer,
      sellingPriceInc: v.sellingPriceInc,
      paid: v.paid,
      debt: v.debt,
    }));

    const totalDebt =
      projectTotalDebt +
      extraDebtors.reduce((s, d) => s + d.debt, 0);

    const debtors = [...projectDebtors, ...extraDebtors]
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
      const base = income / (1 + businessVatRate);
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
    [crmData, setCrmData, addToast, businessVatRate]
  );

  const handleSaveProjectEdit = useCallback(
    (id: number, newName: string, newIncome: number, newCrmStatus: CrmStatus) => {
      const base = newIncome / (1 + businessVatRate);
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
                crmStatus: newCrmStatus,
                crmStatusSince:
                  parseCrmStatus(p.crmStatus) === newCrmStatus ? p.crmStatusSince : new Date().toISOString(),
              }
            : p
        )
      );
      setProjectEditModal(null);
      addToast("פרטי הלקוח עודכנו בהצלחה", "success");
    },
    [setCrmData, addToast, businessVatRate]
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
                  <div key={d.key} className="min-w-[240px] bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col justify-between shrink-0 shadow-sm hover:border-red-300 transition-colors">
                    <div className="font-bold text-slate-800 text-lg mb-2 truncate" title={d.customer}>{d.customer}</div>
                    <div className="text-sm text-slate-500 flex justify-between">סך עסקה: <span className="font-bold">{formatCurrency(d.sellingPriceInc ?? 0)}</span></div>
                    <div className="text-sm text-emerald-600 flex justify-between">שולם (מקדמות): <span className="font-bold">{formatCurrency(d.paid)}</span></div>
                    <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">יתרה לגבייה:</span>
                      <span className="font-black text-red-600 text-lg">{formatCurrency(d.debt)}</span>
                    </div>
                    {d.projectId != null ? (
                      <button type="button" onClick={() => openTxForProject(d.projectId as number, "income")} className="mt-3 w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2 rounded-xl text-xs transition-colors">
                        קבל תשלום
                      </button>
                    ) : (
                      <button type="button" onClick={() => openTxAdd("income")} className="mt-3 w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2 rounded-xl text-xs transition-colors">
                        הוסף גבייה
                      </button>
                    )}
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
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-black text-xl text-slate-800">{p.customer}</h4>
                          {isFullyPaid && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">שולם במלואו</span>}
                          {p.isExternal && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">פרויקט חיצוני</span>}
                          {crmProjectShowsLifecycleLeadClientPill(p) &&
                            (crmLeadEntryShowsAsClient(p.crmStatus) ? (
                              <span className="bg-emerald-100 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">לקוח</span>
                            ) : (
                              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">ליד</span>
                            ))}
                          {(() => {
                            const s = parseCrmStatus(p.crmStatus);
                            if (!s) return null;
                            const ui = CRM_STATUS_UI[s];
                            return (
                              <span title={getCrmStatusLabel(p.crmStatus)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ui.pill}`}>
                                {ui.emoji} {CRM_STATUS_SELECT_OPTIONS.find((o) => o.value === s)?.label}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-slate-400 mb-3">{p.date}</p>
                        <div className="flex flex-wrap gap-2">
                          {!p.isExternal && (
                            <button type="button" onClick={() => onLoadProject(p.id)} className="text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 border border-slate-200 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm">
                              {p.isLead ? (crmLeadEntryShowsAsClient(p.crmStatus) ? "פתח עריכת לקוח" : "פתח עריכת ליד") : "טען מידות ו-3D"}
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
                      const linkedCustomer = proj?.customer || t.linkedCustomerName;
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
                            {isInc && (t.incomeCustomerName || t.incomeCustomerPhone || t.incomeCustomerAddress) && (
                              <div className="text-[11px] text-slate-600 mt-1.5 space-y-0.5 max-w-[220px]">
                                {t.incomeCustomerName ? <div className="font-semibold">{t.incomeCustomerName}</div> : null}
                                {t.incomeCustomerPhone ? <div dir="ltr" className="text-right">☎ {t.incomeCustomerPhone}</div> : null}
                                {t.incomeCustomerAddress ? <div className="leading-snug">{t.incomeCustomerAddress}</div> : null}
                              </div>
                            )}
                            {isInc && t.incomeWorkDetails ? (
                              <div className="text-[11px] text-slate-600 mt-1.5 max-w-[240px]">
                                <span className="font-bold text-slate-500">עבודה: </span>
                                <span className="leading-snug">{t.incomeWorkDetails}</span>
                              </div>
                            ) : null}
                            {isInc && (t.incomePaymentTerms || t.incomePaymentExpectedDate || t.incomePaymentTermsNote) ? (
                              <div className="text-[11px] mt-1.5 space-y-0.5 max-w-[240px] rounded-lg bg-amber-50/80 border border-amber-100 px-2 py-1.5">
                                {t.incomePaymentTerms ? (
                                  <div>
                                    <span className="font-bold text-amber-900">תשלום: </span>
                                    <span className="text-amber-950">{formatIncomePaymentTerms(t.incomePaymentTerms)}</span>
                                  </div>
                                ) : null}
                                {t.incomePaymentExpectedDate ? (
                                  <div className="text-amber-900">
                                    <span className="font-bold">יעד לגבייה: </span>
                                    {new Date(t.incomePaymentExpectedDate + "T12:00:00").toLocaleDateString("he-IL")}
                                  </div>
                                ) : null}
                                {t.incomePaymentTermsNote ? <div className="text-amber-900/90 leading-snug">{t.incomePaymentTermsNote}</div> : null}
                              </div>
                            ) : null}
                            {isInc && (t.incomeOutstandingAmount ?? 0) > 0 ? (
                              <div className="text-[11px] mt-1.5 rounded-lg bg-red-50 border border-red-100 px-2 py-1.5 text-red-700">
                                <span className="font-bold">יתרה פתוחה (כולל מע״מ): </span>
                                {formatCurrency(t.incomeOutstandingAmount ?? 0)}
                              </div>
                            ) : null}
                            {linkedCustomer && (
                              <div className="mt-1.5">
                                <span className="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-bold">{linkedCustomer}</span>
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
          incomeCustomerOptions={incomeCustomerOptions}
          vatRateDecimal={businessVatRate}
          vatPercentLabel={vatPercentLabel}
          onSave={handleSaveTransaction}
          onClose={closeTxModal}
        />
      )}

      {projectEditModal && (
        <ProjectEditModalFull
          project={projectEditModal}
          onSave={(id, name, income, crmStatus) => handleSaveProjectEdit(id, name, income, crmStatus)}
          onClose={() => setProjectEditModal(null)}
          reportError={(msg) => addToast(msg, "error")}
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

/** מונע גלילת הדף מאחורי מודאל (חשוב במיוחד בנייד / Safari) */
function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

function TxModalFull({
  isOpen,
  txMode,
  edit,
  defaultProjectId,
  defaultDesc,
  projects,
  incomeCustomerOptions,
  vatRateDecimal,
  vatPercentLabel,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  txMode: "income" | "expense";
  edit: Transaction | null;
  defaultProjectId: string;
  defaultDesc: string;
  projects: CrmProject[];
  incomeCustomerOptions: string[];
  vatRateDecimal: number;
  vatPercentLabel: string;
  onSave: (tx: Transaction, action: "add" | "edit") => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(edit?.date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(edit?.category ?? (txMode === "income" ? (defaultProjectId ? "תשלום מפרויקט פרגולה" : "חלונות") : defaultProjectId ? "חומרי גלם / אלומיניום" : "רכב, דלק ונסיעות"));
  const [amountInput, setAmountInput] = useState(edit?.amount ? String(edit.amount) : "");
  const [vatMode, setVatMode] = useState<"inc" | "exc" | "none">(edit?.hasVat !== false ? "inc" : "none");
  const [description, setDescription] = useState(edit?.description ?? defaultDesc);
  const [projectId, setProjectId] = useState(edit?.projectId ? String(edit.projectId) : defaultProjectId);
  const [incomeCustName, setIncomeCustName] = useState(edit?.type === "income" ? (edit.incomeCustomerName ?? "") : "");
  const [incomeCustPhone, setIncomeCustPhone] = useState(edit?.type === "income" ? (edit.incomeCustomerPhone ?? "") : "");
  const [incomeCustAddress, setIncomeCustAddress] = useState(edit?.type === "income" ? (edit.incomeCustomerAddress ?? "") : "");
  const [incomeWorkDetails, setIncomeWorkDetails] = useState(edit?.type === "income" ? (edit.incomeWorkDetails ?? "") : "");
  const [incomePaymentTerms, setIncomePaymentTerms] = useState<IncomePaymentTermsCode>(
    edit?.type === "income" ? normalizeIncomePaymentTerms(edit.incomePaymentTerms as string | undefined) : "immediate"
  );
  const [incomePaymentExpectedDate, setIncomePaymentExpectedDate] = useState(
    edit?.type === "income" ? (edit.incomePaymentExpectedDate ?? "") : ""
  );
  const [incomePaymentTermsNote, setIncomePaymentTermsNote] = useState(
    edit?.type === "income" ? (edit.incomePaymentTermsNote ?? "") : ""
  );
  const [linkedCustomerName, setLinkedCustomerName] = useState(edit?.linkedCustomerName ?? "");
  const [incomeOutstandingInput, setIncomeOutstandingInput] = useState("");

  useEffect(() => {
    if (isOpen && edit) {
      const vatEntry = normalizeIncomeVatEntryMode(edit.incomeVatEntryMode, !!edit.hasVat);
      setDate(edit.date);
      setCategory(edit.category ?? (txMode === "income" ? "תשלום מפרויקט פרגולה" : "תפעול שוטף ושונות"));
      setVatMode(edit.type === "income" ? vatEntry : edit.hasVat ? "inc" : "none");
      if (edit.type === "income") {
        if (!edit.hasVat || vatEntry === "none") {
          setAmountInput(String(Math.round(edit.amount)));
        } else if (vatEntry === "exc") {
          const net = edit.baseAmount ?? edit.amount / (1 + vatRateDecimal);
          setAmountInput(String(Math.round(net)));
        } else {
          setAmountInput(String(Math.round(edit.amount)));
        }
      } else {
        setAmountInput(String(edit.amount));
      }
      setDescription(edit.description ?? "");
      setProjectId(edit.projectId ? String(edit.projectId) : "");
      setLinkedCustomerName(edit.linkedCustomerName ?? "");
      if (edit.type === "income") {
        setIncomeCustName(edit.incomeCustomerName ?? "");
        setIncomeCustPhone(edit.incomeCustomerPhone ?? "");
        setIncomeCustAddress(edit.incomeCustomerAddress ?? "");
        setIncomeWorkDetails(edit.incomeWorkDetails ?? "");
        setIncomePaymentTerms(normalizeIncomePaymentTerms(edit.incomePaymentTerms as string | undefined));
        setIncomePaymentExpectedDate(edit.incomePaymentExpectedDate ?? "");
        setIncomePaymentTermsNote(edit.incomePaymentTermsNote ?? "");
        const g = edit.incomeOutstandingAmount ?? 0;
        if (g <= 0) setIncomeOutstandingInput("");
        else if (!edit.hasVat || vatEntry === "none") setIncomeOutstandingInput(String(Math.round(g)));
        else if (vatEntry === "exc") setIncomeOutstandingInput(String(Math.round(g / (1 + vatRateDecimal))));
        else setIncomeOutstandingInput(String(Math.round(g)));
      } else {
        setIncomeCustName("");
        setIncomeCustPhone("");
        setIncomeCustAddress("");
        setIncomeWorkDetails("");
        setIncomePaymentTerms("immediate");
        setIncomePaymentExpectedDate("");
        setIncomePaymentTermsNote("");
        setIncomeOutstandingInput("");
      }
    } else if (isOpen) {
      setDate(new Date().toISOString().slice(0, 10));
      setCategory(txMode === "income" ? (defaultProjectId ? "תשלום מפרויקט פרגולה" : "חלונות") : defaultProjectId ? "חומרי גלם / אלומיניום" : "רכב, דלק ונסיעות");
      setAmountInput("");
      setVatMode("inc");
      setDescription(defaultDesc);
      setProjectId(defaultProjectId);
      setLinkedCustomerName("");
      if (txMode === "income") {
        setIncomeCustPhone("");
        setIncomeCustAddress("");
        setIncomeCustName("");
        setIncomeWorkDetails("");
        setIncomePaymentTerms("net30");
        setIncomePaymentExpectedDate("");
        setIncomePaymentTermsNote("");
        setIncomeOutstandingInput("");
        if (defaultProjectId) {
          const p = projects.find((x) => String(x.id) === defaultProjectId);
          if (p) {
            const c = getIncomePrefillFromCrmProject(p);
            if (c.name) setIncomeCustName(c.name);
            if (c.phone) setIncomeCustPhone(c.phone);
            if (c.address) setIncomeCustAddress(c.address);
          }
        }
      } else {
        setIncomeCustName("");
        setIncomeCustPhone("");
        setIncomeCustAddress("");
        setIncomeWorkDetails("");
        setIncomePaymentTerms("immediate");
        setIncomePaymentExpectedDate("");
        setIncomePaymentTermsNote("");
        setIncomeOutstandingInput("");
      }
    }
  }, [isOpen, edit, txMode, defaultProjectId, defaultDesc, projects, vatRateDecimal]);

  useLockBodyScroll(isOpen);

  const rawAmount = Number(amountInput) || 0;
  const { finalAmount, vatAmount, baseAmount } = useMemo(() => {
    const m = moneyFromVatRaw(rawAmount, vatMode, vatRateDecimal);
    return { finalAmount: m.final, vatAmount: m.vat, baseAmount: m.base };
  }, [amountInput, vatMode, vatRateDecimal]);

  const rawOutstanding = Number(incomeOutstandingInput) || 0;
  const outstandingSplit = useMemo(
    () => moneyFromVatRaw(rawOutstanding, vatMode, vatRateDecimal),
    [incomeOutstandingInput, vatMode, vatRateDecimal]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const incomeOutstandingAmount = outstandingSplit.final;
    const base: Transaction = {
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
    const txData: Transaction =
      txMode === "income"
        ? {
            ...base,
            incomeCustomerName: incomeCustName.trim() || undefined,
            incomeCustomerPhone: incomeCustPhone.trim() || undefined,
            incomeCustomerAddress: incomeCustAddress.trim() || undefined,
            incomeWorkDetails: incomeWorkDetails.trim() || undefined,
            incomePaymentTerms,
            incomePaymentExpectedDate: incomePaymentExpectedDate.trim() || undefined,
            incomePaymentTermsNote: incomePaymentTermsNote.trim() || undefined,
            linkedCustomerName: incomeCustName.trim() || linkedCustomerName.trim() || undefined,
            incomeOutstandingAmount: incomeOutstandingAmount > 0 ? Math.round(incomeOutstandingAmount) : undefined,
            incomeVatEntryMode: vatMode,
          }
        : {
            ...base,
            incomeCustomerName: undefined,
            incomeCustomerPhone: undefined,
            incomeCustomerAddress: undefined,
            incomeWorkDetails: undefined,
            incomePaymentTerms: undefined,
            incomePaymentExpectedDate: undefined,
            incomePaymentTermsNote: undefined,
            linkedCustomerName: linkedCustomerName.trim() || undefined,
            incomeOutstandingAmount: undefined,
            incomeVatEntryMode: undefined,
          };
    onSave(txData, edit ? "edit" : "add");
  };

  if (!isOpen) return null;

  const categories = txMode === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all";
  const selectClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-hidden overscroll-none p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="סגור"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 my-auto flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl max-h-[min(92dvh,calc(100dvh-2rem))] sm:max-h-[90vh]">
        <div className="flex justify-between items-start gap-3 p-4 sm:p-6 border-b border-slate-100 shrink-0">
          <h3 className="text-lg sm:text-2xl font-black text-slate-800 leading-tight">
            {edit ? (txMode === "income" ? "עריכת תשלום" : "עריכת הוצאה") : txMode === "income" ? "קבלת תשלום מלקוח / הכנסה" : "רישום הוצאה חדשה"}
          </h3>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y p-4 sm:p-6 [-webkit-overflow-scrolling:touch] [overscroll-behavior-y:contain]">
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
            {txMode === "income" && (
              <div className="p-4 sm:p-5 rounded-2xl border border-emerald-100 bg-emerald-50/40 space-y-4">
                <p className="text-sm font-black text-emerald-900">פרטי לקוח / משלם</p>
                <p className="text-xs text-emerald-800/80 -mt-2">לא חובה — שימושי להכנסות ללא שיוך פרויקט או לתיעוד נוסף</p>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">שם</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={incomeCustName}
                      onChange={(e) => setIncomeCustName(e.target.value)}
                      placeholder="שם הלקוח"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">טלפון</label>
                    <input
                      type="tel"
                      className={inputClass}
                      dir="ltr"
                      value={incomeCustPhone}
                      onChange={(e) => setIncomeCustPhone(e.target.value)}
                      placeholder="050-0000000"
                      autoComplete="tel"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">כתובת</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={incomeCustAddress}
                      onChange={(e) => setIncomeCustAddress(e.target.value)}
                      placeholder="רחוב, עיר"
                      autoComplete="street-address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">פירוט עבודה</label>
                    <textarea
                      rows={3}
                      className={`${inputClass} resize-y min-h-[4.5rem]`}
                      value={incomeWorkDetails}
                      onChange={(e) => setIncomeWorkDetails(e.target.value)}
                      placeholder="לדוגמה: תיקון תריסים, החלפת רצועות, פרגולה חדשה לפי מפרט…"
                    />
                    <p className="text-xs text-slate-500 mt-1">לא חובה — מתועד בהכנסה ובהיסטוריה</p>
                  </div>
                </div>
              </div>
            )}
            <div className={`p-5 rounded-2xl border ${txMode === "income" ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"}`}>
              <div className="grid grid-cols-1 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">מע&quot;מ ({vatPercentLabel}) — איך להבין את הסכומים?</label>
                  <select className={`${selectClass} font-bold`} value={vatMode} onChange={(e) => setVatMode(e.target.value as "inc" | "exc" | "none")}>
                    <option value="inc">הסכומים להזנה כוללים מע&quot;מ</option>
                    <option value="exc">{`הסכומים להזנה לפני מע״מ (נוסיף ${vatPercentLabel})`}</option>
                    <option value="none">פטור ממע&quot;מ</option>
                  </select>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    בחר קודם את סוג ההזנה — מיד אחר כך יופיע <strong>פירוט מע&quot;מ</strong> אוטומטי לתשלום שהתקבל וליתרה (אם מילאת).
                  </p>
                </div>
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
                  {vatMode !== "none" && (
                    <div className="mt-3 rounded-2xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-white px-3 py-3 shadow-sm">
                      <div className="sm:hidden rounded-xl bg-indigo-950 text-white px-3 py-2 mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{`מע״מ ${vatPercentLabel}`}</span>
                        <span className="font-black tabular-nums text-base">{formatCurrency(vatAmount)}</span>
                        <span className="text-xs font-bold">סה״כ</span>
                        <span className={`font-black tabular-nums text-base ${txMode === "income" ? "text-emerald-300" : "text-red-300"}`}>{formatCurrency(finalAmount)}</span>
                      </div>
                      <p className="text-[11px] font-black uppercase tracking-wide text-indigo-800 mb-2">חישוב מע״מ לסכום בשדה למעלה</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 text-sm">
                        <div className="rounded-lg bg-white/90 px-2 py-2 border border-indigo-100">
                          <span className="text-slate-600 block text-xs mb-0.5">לפני מע״מ</span>
                          <span className="font-bold tabular-nums text-slate-900">{formatCurrency(baseAmount)}</span>
                        </div>
                        <div className="rounded-lg bg-indigo-100/90 px-2 py-2 border border-indigo-200 ring-2 ring-indigo-200/80">
                          <span className="text-indigo-900 block text-xs font-bold mb-0.5">{`מע״מ ${vatPercentLabel}`}</span>
                          <span className="font-black tabular-nums text-indigo-950 text-lg">{formatCurrency(vatAmount)}</span>
                        </div>
                        <div className="rounded-lg bg-white/90 px-2 py-2 border border-indigo-100">
                          <span className="text-slate-600 block text-xs mb-0.5">סה״כ במערכת</span>
                          <span className={`font-black tabular-nums text-lg ${txMode === "income" ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(finalAmount)}</span>
                        </div>
                      </div>
                      {rawAmount === 0 && (
                        <p className="text-xs text-indigo-700 mt-2 font-medium">הזינו סכום בשדה כדי לראות את הסכומים המעודכנים (כרגע 0 ₪).</p>
                      )}
                    </div>
                  )}
                  {vatMode === "none" && (
                    <p className="mt-2 text-sm text-slate-600 rounded-xl bg-slate-100/80 px-3 py-2 border border-slate-200">
                      <strong>פטור ממע״מ</strong> — הסכום נשמר כפי שהוזן, בלי חישוב מע״מ.
                    </p>
                  )}
                </div>
                {txMode === "income" && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">יתרה פתוחה לגבייה (₪)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${inputClass} text-xl font-black text-red-600`}
                      value={incomeOutstandingInput ? Number(incomeOutstandingInput).toLocaleString("en-US") : ""}
                      onChange={(e) => setIncomeOutstandingInput(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500 mt-1">אם טרם קיבלת תשלום או נשארה יתרה - רשום כאן וזה יופיע בחייבים באדום. הפירוט עם מע&quot;מ מופיע גם מתחת לשדה ולמטה.</p>
                    {vatMode !== "none" && rawOutstanding > 0 && (
                      <div className="mt-3 rounded-2xl border-2 border-red-200 bg-red-50/80 px-3 py-3">
                        <div className="sm:hidden rounded-xl bg-red-700 text-white px-3 py-2 mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">מע״מ ביתרה</span>
                          <span className="font-black tabular-nums text-base">{formatCurrency(outstandingSplit.vat)}</span>
                          <span className="text-xs font-bold">לגבייה</span>
                          <span className="font-black tabular-nums text-base">{formatCurrency(outstandingSplit.final)}</span>
                        </div>
                        <p className="text-[11px] font-black text-red-900 mb-2">מע״מ ביתרה לגבייה</p>
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                          <span className="text-slate-700">לפני מע״מ: <b className="tabular-nums">{formatCurrency(outstandingSplit.base)}</b></span>
                          <span className="text-indigo-900 font-black">מע״מ: <span className="tabular-nums text-base">{formatCurrency(outstandingSplit.vat)}</span></span>
                          <span className="text-red-800 font-bold">לגבייה: <span className="tabular-nums">{formatCurrency(outstandingSplit.final)}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {(rawAmount > 0 || (txMode === "income" && rawOutstanding > 0)) && (
                <div className="rounded-2xl border-2 border-indigo-200 bg-white p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <span className="text-lg font-black text-indigo-900">{`פירוט מע״מ (${vatPercentLabel})`}</span>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                      {vatMode === "inc" ? "הוזן כולל מע״מ" : vatMode === "exc" ? "הוזן לפני מע״מ" : "פטור"}
                    </span>
                  </div>
                  {vatMode === "none" ? (
                    <p className="text-sm text-slate-600">נבחר <strong>פטור ממע״מ</strong> — אין חלוקה לבסיס ומע״מ.</p>
                  ) : null}
                  {rawAmount > 0 && (
                    <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                      <p className="text-xs font-black text-slate-700 mb-2">תשלום שהתקבל (בפועל)</p>
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="text-slate-600">בסיס לפני מע&quot;מ:</span>
                        <span className="font-semibold tabular-nums">{formatCurrency(baseAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm mb-2 border-b border-slate-200 pb-2">
                        <span className="text-slate-600">{`מע״מ ${vatPercentLabel}:`}</span>
                        <span className="font-semibold text-indigo-700 tabular-nums">{formatCurrency(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">סה״כ {txMode === "income" ? "שנכנס לקופה" : "שיצא מהקופה"}:</span>
                        <span className={`font-black text-lg tabular-nums ${txMode === "income" ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(finalAmount)}</span>
                      </div>
                    </div>
                  )}
                  {txMode === "income" && rawOutstanding > 0 && vatMode !== "none" && (
                    <div className="rounded-xl bg-red-50/60 p-3 border border-red-100">
                      <p className="text-xs font-black text-red-900 mb-2">יתרה לגבייה (יופיע באדום אצל חייבים)</p>
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="text-slate-700">בסיס לפני מע&quot;מ:</span>
                        <span className="font-semibold tabular-nums">{formatCurrency(outstandingSplit.base)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm mb-2 border-b border-red-100 pb-2">
                        <span className="text-slate-700">{`מע״מ ${vatPercentLabel}:`}</span>
                        <span className="font-semibold text-indigo-700 tabular-nums">{formatCurrency(outstandingSplit.vat)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">סה״כ לגבייה כולל מע&quot;מ:</span>
                        <span className="font-black text-lg text-red-600 tabular-nums">{formatCurrency(outstandingSplit.final)}</span>
                      </div>
                    </div>
                  )}
                  {txMode === "income" && rawOutstanding > 0 && vatMode === "none" && (
                    <div className="rounded-xl bg-red-50/60 p-3 border border-red-100">
                      <p className="text-xs font-black text-red-900 mb-1">יתרה לגבייה (ללא מע״מ)</p>
                      <p className="font-black text-lg text-red-600 tabular-nums">{formatCurrency(outstandingSplit.final)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
              <label className="block text-sm font-bold text-slate-800 mb-2">שיוך לפרויקט קיים (לא חובה)</label>
              <select
                className={selectClass}
                value={projectId}
                onChange={(e) => {
                  const v = e.target.value;
                  setProjectId(v);
                  if (txMode === "income" && v) {
                    const p = projects.find((pr) => String(pr.id) === v);
                    if (p?.customer) {
                      setIncomeCustName((prev) => (prev.trim() ? prev : p.customer));
                    }
                  } else if (txMode === "expense" && v) {
                    const p = projects.find((pr) => String(pr.id) === v);
                    if (p?.customer) {
                      setLinkedCustomerName((prev) => (prev.trim() ? prev : p.customer));
                    }
                  }
                }}
              >
                <option value="">-- כללי (ללא שיוך לפרויקט) --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.customer}</option>
                ))}
              </select>
            </div>
            {txMode === "expense" && (
              <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl">
                <label className="block text-sm font-bold text-slate-800 mb-2">שיוך ללקוח מהכנסות שמורות (אופציונלי)</label>
                <select className={selectClass} value={linkedCustomerName} onChange={(e) => setLinkedCustomerName(e.target.value)}>
                  <option value="">-- בחר לקוח שנשמר בהכנסה --</option>
                  {incomeCustomerOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">עוזר לתעד הוצאה לתיקון/לקוח גם בלי פרויקט CRM פעיל.</p>
              </div>
            )}
            {txMode === "income" && (
              <div className="p-4 sm:p-5 rounded-2xl border border-amber-100 bg-amber-50/50 space-y-4">
                <p className="text-sm font-black text-amber-950">תנאי תשלום וצפי לגבייה</p>
                <p className="text-xs text-amber-900/85 -mt-2">
                  למקרים של שוטף +30/60, צ׳קים דחויים, סוף חודש או תשלומים — בחר את ההגדרה הקרובה ביותר ושלב תאריך יעד אם צריך.
                </p>
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">סוג תנאי תשלום</label>
                  <select
                    className={`${selectClass} font-bold text-slate-800`}
                    value={incomePaymentTerms}
                    onChange={(e) => setIncomePaymentTerms(normalizeIncomePaymentTerms(e.target.value))}
                  >
                    {INCOME_PAYMENT_TERMS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">תאריך יעד לתשלום (אופציונלי)</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={incomePaymentExpectedDate}
                    onChange={(e) => setIncomePaymentExpectedDate(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-1">מתאים כשיודעים מתי בערך צפוי הכסף — בנוסף לשוטף</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">
                    הערות לתנאי תשלום {incomePaymentTerms === "other_custom" ? "(מומלץ)" : "(אופציונלי)"}
                  </label>
                  <textarea
                    rows={2}
                    className={`${inputClass} resize-y min-h-[3.25rem]`}
                    value={incomePaymentTermsNote}
                    onChange={(e) => setIncomePaymentTermsNote(e.target.value)}
                    placeholder={
                      incomePaymentTerms === "postdated_checks"
                        ? "לדוגמה: צ'ק 30.4 ₪5,000 + צ'ק 30.5 ₪5,000"
                        : incomePaymentTerms === "installments"
                          ? "לדוגמה: מקדמה 30% + 2 תשלומים שווים"
                          : incomePaymentTerms === "other_custom"
                            ? "פירוט מלא של מה שסוכם מול הלקוח"
                            : "פירוט נוסף: מספר הזמנה, תנאים מיוחדים…"
                    }
                  />
                </div>
              </div>
            )}
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
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row gap-3 rounded-b-3xl shrink-0 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-6">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all">
              {edit ? "שמור שינויים" : "תעד במערכת"}
            </button>
            <button type="button" onClick={onClose} className="sm:px-6 w-full sm:w-auto bg-white border border-slate-300 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-100 transition-all">
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
  reportError,
}: {
  project: CrmProject;
  onSave: (id: number, name: string, income: number, crmStatus: CrmStatus) => void;
  onClose: () => void;
  reportError?: (message: string) => void;
}) {
  const [name, setName] = useState(project.customer ?? "");
  const [incomeInput, setIncomeInput] = useState(String(project.sellingPriceInc ?? 0));
  const [crmStatus, setCrmStatus] = useState<CrmStatus>(() => parseCrmStatus(project.crmStatus) ?? "in_progress");

  useEffect(() => {
    setName(project.customer ?? "");
    setIncomeInput(String(project.sellingPriceInc ?? 0));
    setCrmStatus(parseCrmStatus(project.crmStatus) ?? "in_progress");
  }, [project]);

  useLockBodyScroll(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const incVat = Number(String(incomeInput).replace(/[^0-9]/g, "")) || 0;
    if (crmStatusRequiresPositiveDealIncVat(crmStatus) && incVat <= 0) {
      const msg = "להעברה ל«אושר – ממתין לביצוע» או «בעבודה / ייצור» יש להזין סכום עסקה כולל מע״מ";
      if (reportError) reportError(msg);
      else if (typeof window !== "undefined") window.alert(msg);
      return;
    }
    const oldS = parseCrmStatus(project.crmStatus);
    if (crmStatus === "installed" && oldS !== "installed") {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "מעבירים לסטטוס «הותקן / הושלם».\n\n" +
            "האם עדיין יש חשבון או יתרה פתוחה אצל הלקוח?\n\n" +
            "אם כן — הפרויקט ימשיך להופיע בחייבים עד סגירה ידנית.\n" +
            "אם סיימת לגבות — וודא שרישמת את כל התשלומים בקופה."
        )
      )
        return;
    }
    onSave(project.id, name, incVat, crmStatus);
  };

  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-hidden overscroll-none p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4"
      role="presentation"
    >
      <button type="button" aria-label="סגור" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 my-auto flex w-full max-w-sm flex-col rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-800">עריכת פרטי פרויקט</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col p-4 sm:p-6 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">שם הלקוח</label>
            <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">סטטוס במעקב</label>
            <select
              className={inputClass}
              value={crmStatus}
              onChange={(e) => setCrmStatus(e.target.value as CrmStatus)}
            >
              {CRM_STATUS_SELECT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-4">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all">
              שמור פרטים
            </button>
            <button type="button" onClick={onClose} className="sm:px-6 w-full sm:w-auto bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">
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

  useLockBodyScroll(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(name, Number(incomeInput) || 0);
  };

  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-hidden overscroll-none p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4"
      role="presentation"
    >
      <button type="button" aria-label="סגור" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 my-auto flex w-full max-w-sm flex-col rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-800">תיק עבודה חיצונית</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col p-4 sm:p-6 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-6">
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
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-4">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all">
              שמור לקוח
            </button>
            <button type="button" onClick={onClose} className="sm:px-6 w-full sm:w-auto bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
