import type { CrmProject, Transaction } from "@/app/components/BusinessView";
import { formatIncomePaymentTerms } from "@/app/components/BusinessView";

export type ReportRangeMode = "month" | "custom";

export type ReportRange = {
  from: string;
  to: string;
  label: string;
};

export type ReportStats = {
  /** סכומים שהתקבלו בפועל */
  incomeTotal: number;
  /** יתרות פתוחות לגבייה (הכנסות) */
  incomeOutstandingTotal: number;
  /** סה"כ ערך עסקאות (התקבל + יתרה) */
  incomeGrossTotal: number;
  expenseTotal: number;
  netFlow: number;
  vatCollected: number;
  vatPaid: number;
  vatBalance: number;
  incomeCount: number;
  expenseCount: number;
};

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

/** המרה בטוחה — Firestore/JSON לפעמים מחזירים מספרים כמחרוזת */
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

type TxAmounts = {
  amount: number;
  baseAmount: number;
  vatAmount: number;
  outstanding: number;
  displayTotal: number;
};

function txAmounts(t: Transaction): TxAmounts {
  const amount = Math.round(num(t.amount));
  const outstanding = Math.round(num(t.incomeOutstandingAmount));
  let baseAmount = Math.round(num(t.baseAmount));
  let vatAmount = Math.round(num(t.vatAmount));
  const hasVat = Boolean(t.hasVat);

  if (amount > 0) {
    if (baseAmount <= 0) baseAmount = hasVat ? Math.round(amount / 1.18) : amount;
    if (hasVat && vatAmount <= 0 && amount > baseAmount) vatAmount = amount - baseAmount;
    if (!hasVat) {
      baseAmount = amount;
      vatAmount = 0;
    }
  } else if (outstanding > 0 && t.type === "income") {
    baseAmount = hasVat ? Math.round(outstanding / 1.18) : outstanding;
    vatAmount = hasVat ? outstanding - baseAmount : 0;
  }

  const displayTotal = amount > 0 ? amount : outstanding;
  return { amount, baseAmount, vatAmount, outstanding, displayTotal };
}

export function formatReportCurrency(amount: unknown): string {
  const v = num(amount);
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
}

export function formatReportDateHe(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("he-IL");
}

export function formatReportWeekdayHe(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("he-IL", { weekday: "short" });
}

export function getMonthDateRange(year: number, monthIndex: number): { from: string; to: string } {
  const month = monthIndex + 1;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function resolveReportRange(
  mode: ReportRangeMode,
  year: number,
  monthIndex: number,
  customFrom: string,
  customTo: string
): ReportRange {
  if (mode === "month") {
    const { from, to } = getMonthDateRange(year, monthIndex);
    return {
      from,
      to,
      label: `${MONTHS[monthIndex]} ${year}`,
    };
  }
  const from = customFrom <= customTo ? customFrom : customTo;
  const to = customFrom <= customTo ? customTo : customFrom;
  return {
    from,
    to,
    label: `${formatReportDateHe(from)} – ${formatReportDateHe(to)}`,
  };
}

export function filterTransactionsByDateRange(transactions: Transaction[], from: string, to: string): Transaction[] {
  return transactions.filter((t) => {
    const d = (t.date || "").slice(0, 10);
    if (!d) return false;
    return d >= from && d <= to;
  });
}

export function computeReportStats(transactions: Transaction[]): ReportStats {
  const incomes = transactions.filter((t) => t.type === "income");
  const expenses = transactions.filter((t) => t.type === "expense");
  const incomeTotal = incomes.reduce((s, t) => s + txAmounts(t).amount, 0);
  const incomeOutstandingTotal = incomes.reduce((s, t) => s + txAmounts(t).outstanding, 0);
  const incomeGrossTotal = incomes.reduce((s, t) => s + txAmounts(t).displayTotal, 0);
  const expenseTotal = expenses.reduce((s, t) => s + txAmounts(t).amount, 0);
  const vatCollected = incomes.reduce((s, t) => {
    const a = txAmounts(t);
    if (!t.hasVat && a.vatAmount <= 0) return s;
    return s + a.vatAmount;
  }, 0);
  const vatPaid = expenses.reduce((s, t) => {
    const a = txAmounts(t);
    if (!t.hasVat && a.vatAmount <= 0) return s;
    return s + a.vatAmount;
  }, 0);
  return {
    incomeTotal,
    incomeOutstandingTotal,
    incomeGrossTotal,
    expenseTotal,
    netFlow: incomeTotal - expenseTotal,
    vatCollected,
    vatPaid,
    vatBalance: vatCollected - vatPaid,
    incomeCount: incomes.length,
    expenseCount: expenses.length,
  };
}

function categoryTotals(transactions: Transaction[], type: "income" | "expense"): { category: string; total: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions.filter((x) => x.type === type)) {
    const cat = (t.category || (type === "income" ? "הכנסה" : "הוצאה")).trim();
    const value = type === "income" ? txAmounts(t).displayTotal : txAmounts(t).amount;
    map.set(cat, (map.get(cat) ?? 0) + value);
  }
  return Array.from(map.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function txCustomerName(t: Transaction, crmData: CrmProject[]): string {
  const proj = crmData.find((p) => p.id === t.projectId);
  return (
    (t.incomeCustomerName || "").trim() ||
    (t.linkedCustomerName || "").trim() ||
    (proj?.customer || "").trim() ||
    ""
  );
}

/** תנאי תשלום + תאריך יעד (כמו במסך) — ל-Excel/CSV */
function formatReportPaymentTermsPlain(t: Transaction): string {
  const parts: string[] = [];
  const terms = formatIncomePaymentTerms(t.incomePaymentTerms);
  if (terms) parts.push(terms);
  const expected = t.incomePaymentExpectedDate?.trim().slice(0, 10);
  if (expected) {
    parts.push(`יעד ${formatReportDateHe(expected)} · ${formatReportWeekdayHe(expected)}`);
  }
  if (t.incomePaymentTermsNote?.trim()) parts.push(t.incomePaymentTermsNote.trim());
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** תנאי תשלום + תאריך יעד — ל-PDF עם שורות נפרדות */
function formatReportPaymentTermsHtml(t: Transaction): string {
  const terms = formatIncomePaymentTerms(t.incomePaymentTerms);
  const expected = t.incomePaymentExpectedDate?.trim().slice(0, 10);
  const note = t.incomePaymentTermsNote?.trim();
  if (!terms && !expected && !note) return "—";
  const lines: string[] = [];
  if (terms) lines.push(`<strong>${escapeHtml(terms)}</strong>`);
  if (expected) {
    lines.push(
      `<span class="muted">יעד: ${escapeHtml(formatReportDateHe(expected))} · ${escapeHtml(formatReportWeekdayHe(expected))}</span>`
    );
  }
  if (note) lines.push(`<span class="muted">${escapeHtml(note)}</span>`);
  return lines.join("<br>");
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

export function buildBusinessReportCsv(
  transactions: Transaction[],
  crmData: CrmProject[],
  range: ReportRange,
  stats: ReportStats,
  businessName: string
): string {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const incomes = sorted.filter((t) => t.type === "income");
  const expenses = sorted.filter((t) => t.type === "expense");
  const lines: string[] = [];

  lines.push(csvRow(["דוח פיננסי — Yarhi Pro"]));
  lines.push(csvRow(["עסק", businessName || "—"]));
  lines.push(csvRow(["תקופה", range.label]));
  lines.push(csvRow(["מתאריך", formatReportDateHe(range.from)]));
  lines.push(csvRow(["עד תאריך", formatReportDateHe(range.to)]));
  lines.push(csvRow(["נוצר בתאריך", new Date().toLocaleDateString("he-IL")]));
  lines.push("");

  lines.push(csvRow(["סיכום"]));
  lines.push(csvRow(["הכנסות שהתקבלו בפועל", stats.incomeTotal]));
  lines.push(csvRow(["יתרות לגבייה", stats.incomeOutstandingTotal]));
  lines.push(csvRow(["סה\"כ הכנסות (כולל יתרות)", stats.incomeGrossTotal]));
  lines.push(csvRow(["סה\"כ הוצאות", stats.expenseTotal]));
  lines.push(csvRow(["תזרים נטו (התקבל פחות הוצאות)", stats.netFlow]));
  lines.push(csvRow(["מע\"מ נגבה", stats.vatCollected]));
  lines.push(csvRow(["מע\"מ תשומות", stats.vatPaid]));
  lines.push(csvRow(["יתרת מע\"מ", stats.vatBalance]));
  lines.push("");

  lines.push(csvRow(["הכנסות לפי קטגוריה"]));
  lines.push(csvRow(["קטגוריה", "סכום"]));
  for (const row of categoryTotals(sorted, "income")) {
    lines.push(csvRow([row.category, row.total]));
  }
  lines.push("");

  lines.push(csvRow(["הוצאות לפי קטגוריה"]));
  lines.push(csvRow(["קטגוריה", "סכום"]));
  for (const row of categoryTotals(sorted, "expense")) {
    lines.push(csvRow([row.category, row.total]));
  }
  lines.push("");

  lines.push(csvRow(["פירוט הכנסות"]));
  lines.push(
    csvRow([
      "תאריך",
      "יום",
      "לקוח",
      "קטגוריה",
      "תיאור",
      "פרטי עבודה",
      "לפני מע\"מ",
      "מע\"מ",
      "התקבל",
      "יתרה לגבייה",
      "סה\"כ",
      "תנאי תשלום",
      "פרויקט CRM",
    ])
  );
  for (const t of incomes) {
    const proj = crmData.find((p) => p.id === t.projectId);
    const a = txAmounts(t);
    lines.push(
      csvRow([
        formatReportDateHe(t.date),
        formatReportWeekdayHe(t.date),
        txCustomerName(t, crmData),
        t.category || "הכנסה",
        t.description || "",
        t.incomeWorkDetails || "",
        a.baseAmount,
        a.vatAmount,
        a.amount,
        a.outstanding,
        a.displayTotal,
        formatReportPaymentTermsPlain(t),
        proj?.customer || "",
      ])
    );
  }
  lines.push("");

  lines.push(csvRow(["פירוט הוצאות"]));
  lines.push(csvRow(["תאריך", "יום", "קטגוריה", "תיאור", "לקוח/פרויקט", "לפני מע\"מ", "מע\"מ", "סה\"כ"]));
  for (const t of expenses) {
    const proj = crmData.find((p) => p.id === t.projectId);
    const linked = proj?.customer || t.linkedCustomerName || "";
    const a = txAmounts(t);
    lines.push(
      csvRow([
        formatReportDateHe(t.date),
        formatReportWeekdayHe(t.date),
        t.category || "הוצאה",
        t.description || "",
        linked,
        a.baseAmount,
        a.vatAmount,
        a.amount,
      ])
    );
  }

  return "\ufeff" + lines.join("\r\n");
}

export function downloadBusinessReportCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTableRows(
  transactions: Transaction[],
  crmData: CrmProject[],
  type: "income" | "expense"
): string {
  const rows = transactions
    .filter((t) => t.type === type)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  if (type === "income") {
    return rows
      .map((t) => {
        const proj = crmData.find((p) => p.id === t.projectId);
        const a = txAmounts(t);
        return `<tr>
          <td>${escapeHtml(formatReportDateHe(t.date))}<br><span class="muted">${escapeHtml(formatReportWeekdayHe(t.date))}</span></td>
          <td>${escapeHtml(txCustomerName(t, crmData) || "—")}</td>
          <td>${escapeHtml(t.category || "הכנסה")}</td>
          <td>${escapeHtml(t.description || "—")}${t.incomeWorkDetails ? `<br><span class="muted">${escapeHtml(t.incomeWorkDetails)}</span>` : ""}</td>
          <td>${escapeHtml(formatReportCurrency(a.baseAmount))}</td>
          <td>${escapeHtml(formatReportCurrency(a.vatAmount))}</td>
          <td>${escapeHtml(formatReportCurrency(a.amount))}</td>
          <td>${a.outstanding > 0 ? escapeHtml(formatReportCurrency(a.outstanding)) : "—"}</td>
          <td class="inc"><strong>${escapeHtml(formatReportCurrency(a.displayTotal))}</strong></td>
          <td>${formatReportPaymentTermsHtml(t)}</td>
          <td>${escapeHtml(proj?.customer || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  return rows
    .map((t) => {
      const proj = crmData.find((p) => p.id === t.projectId);
      const linked = proj?.customer || t.linkedCustomerName || "—";
      const a = txAmounts(t);
      return `<tr>
        <td>${escapeHtml(formatReportDateHe(t.date))}<br><span class="muted">${escapeHtml(formatReportWeekdayHe(t.date))}</span></td>
        <td>${escapeHtml(t.category || "הוצאה")}</td>
        <td>${escapeHtml(t.description || "—")}</td>
        <td>${escapeHtml(linked)}</td>
        <td>${escapeHtml(formatReportCurrency(a.baseAmount))}</td>
        <td>${escapeHtml(formatReportCurrency(a.vatAmount))}</td>
        <td class="exp"><strong>${escapeHtml(formatReportCurrency(a.amount))}</strong></td>
      </tr>`;
    })
    .join("");
}

function categorySummaryHtml(transactions: Transaction[], type: "income" | "expense", title: string, color: string): string {
  const rows = categoryTotals(transactions, type);
  if (rows.length === 0) return "";
  return `
    <div class="cat-block">
      <h3 style="color:${color}">${escapeHtml(title)}</h3>
      <table class="compact"><tbody>
        ${rows.map((r) => `<tr><td>${escapeHtml(r.category)}</td><td><strong>${escapeHtml(formatReportCurrency(r.total))}</strong></td></tr>`).join("")}
      </tbody></table>
    </div>`;
}

export function openBusinessReportPrint(
  transactions: Transaction[],
  crmData: CrmProject[],
  range: ReportRange,
  stats: ReportStats,
  businessName: string
): void {
  const incomeRows = buildTableRows(transactions, crmData, "income");
  const expenseRows = buildTableRows(transactions, crmData, "expense");
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>דוח פיננסי — ${escapeHtml(range.label)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, "Segoe UI", sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #fff; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    h2 { margin: 28px 0 12px; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    h3 { margin: 0 0 8px; font-size: 15px; }
    .sub { color: #64748b; margin: 0 0 20px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc; }
    .card .label { font-size: 12px; color: #64748b; font-weight: bold; margin-bottom: 4px; }
    .card .val { font-size: 22px; font-weight: 800; }
    .inc { color: #059669; }
    .exp { color: #dc2626; }
    .net { color: #1d4ed8; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 6px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    .muted { color: #64748b; font-size: 11px; }
    .cats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0 24px; }
    .cat-block { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
    table.compact td { border: none; border-bottom: 1px solid #f1f5f9; padding: 6px 4px; }
    @media print {
      body { padding: 12px; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>דוח פיננסי מרוכז</h1>
  <p class="sub"><strong>${escapeHtml(businessName || "Yarhi Pro")}</strong> · תקופה: ${escapeHtml(range.label)} (${escapeHtml(formatReportDateHe(range.from))} – ${escapeHtml(formatReportDateHe(range.to))}) · הופק: ${escapeHtml(new Date().toLocaleDateString("he-IL"))}</p>

  <div class="summary">
    <div class="card"><div class="label">הכנסות שהתקבלו</div><div class="val inc">${escapeHtml(formatReportCurrency(stats.incomeTotal))}</div><div class="muted">${stats.incomeCount} תנועות</div></div>
    <div class="card"><div class="label">יתרות לגבייה</div><div class="val" style="color:#b45309">${escapeHtml(formatReportCurrency(stats.incomeOutstandingTotal))}</div></div>
    <div class="card"><div class="label">סה"כ הכנסות (כולל יתרות)</div><div class="val inc">${escapeHtml(formatReportCurrency(stats.incomeGrossTotal))}</div></div>
    <div class="card"><div class="label">סה"כ הוצאות</div><div class="val exp">${escapeHtml(formatReportCurrency(stats.expenseTotal))}</div><div class="muted">${stats.expenseCount} תנועות</div></div>
    <div class="card"><div class="label">תזרים נטו (התקבל פחות הוצאות)</div><div class="val net">${escapeHtml(formatReportCurrency(stats.netFlow))}</div></div>
    <div class="card"><div class="label">מע"מ נגבה</div><div class="val">${escapeHtml(formatReportCurrency(stats.vatCollected))}</div></div>
    <div class="card"><div class="label">מע"מ תשומות</div><div class="val">${escapeHtml(formatReportCurrency(stats.vatPaid))}</div></div>
    <div class="card"><div class="label">${stats.vatBalance >= 0 ? "מע\"מ לתשלום" : "מע\"מ להחזר"}</div><div class="val">${escapeHtml(formatReportCurrency(Math.abs(stats.vatBalance)))}</div></div>
  </div>

  <div class="cats">
    ${categorySummaryHtml(transactions, "income", "הכנסות לפי קטגוריה", "#059669")}
    ${categorySummaryHtml(transactions, "expense", "הוצאות לפי קטגוריה", "#dc2626")}
  </div>

  <h2>פירוט הכנסות (${stats.incomeCount})</h2>
  <table>
    <thead><tr><th>תאריך</th><th>לקוח</th><th>קטגוריה</th><th>פרטים</th><th>לפני מע"מ</th><th>מע"מ</th><th>התקבל</th><th>יתרה</th><th>סה"כ</th><th>תנאי תשלום</th><th>פרויקט</th></tr></thead>
    <tbody>${incomeRows || `<tr><td colspan="11" class="muted">אין הכנסות בתקופה</td></tr>`}</tbody>
  </table>

  <h2>פירוט הוצאות (${stats.expenseCount})</h2>
  <table>
    <thead><tr><th>תאריך</th><th>קטגוריה</th><th>תיאור</th><th>לקוח/פרויקט</th><th>לפני מע"מ</th><th>מע"מ</th><th>סה"כ</th></tr></thead>
    <tbody>${expenseRows || `<tr><td colspan="7" class="muted">אין הוצאות בתקופה</td></tr>`}</tbody>
  </table>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("לא ניתן לפתוח חלון הדפסה — בדוק חסימת pop-up");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export function reportFilename(range: ReportRange, ext: "csv"): string {
  const safe = range.label.replace(/[^\w\u0590-\u05FF.-]+/g, "_").slice(0, 40);
  return `yarhi-financial-${safe}-${range.from}_${range.to}.${ext}`;
}
